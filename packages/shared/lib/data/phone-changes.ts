/**
 * Phone-change v2 data module — PR-2 / Phase B.
 *
 * All phone-change logic lives here per D-024 (centralized access control).
 * Handlers under packages/shared/lib/api/handlers/auth/change-phone/* and
 * .../clinic/phone-change-requests/* are thin: they validate input, resolve
 * auth/clinic, then call into this module.
 *
 * Key references:
 *   - PHONE_CHANGE_PLAN.md §5 (API contracts)
 *   - PHONE_CHANGE_PLAN.md §6 (this module's design)
 *   - PHONE_CHANGE_PLAN.md §7 (cross-clinic propagation)
 *   - Migration 070 (schema + change_phone_commit/rollback RPCs)
 *
 * Resolved decisions folded in (2026-04-25):
 *   Q1 — auth.users.phone sync via supabase.auth.admin.updateUserById
 *        (53 production accounts depend on this for login)
 *   Q2 — owner self-approval banned (approvedBy !== requestSubject)
 *   Q3 — security SMS to OLD phone after every commit
 *   Q4 — strict cross-clinic propagation (only rows whose phone == old)
 *   Q5 — owner notification on every fallback open
 *   Q7 — patient role accepted (UI deferred to Phase 2)
 *   Q8 — frontdesk-as-proxy for patient phone changes (audit discriminator)
 */

import { createAdminClient } from '@shared/lib/supabase/admin'
import { createOTP, verifyOTP, generateOTPCode, hashOTP } from '@shared/lib/auth/otp'
import { sendSMS } from '@shared/lib/sms/twilio-client'
import { logAuditEvent } from '@shared/lib/data/audit'
import { validateEgyptianPhone, maskPhone } from '@shared/lib/utils/phone-validation'
import {
  notifyPhoneChangePendingApproval,
  notifyPhoneChangeCompleted,
  notifyPhoneChangeApproved,
  notifyPhoneChangeRejected,
} from '@shared/lib/notifications/create'

// ============================================================================
// TYPES
// ============================================================================

export type SubjectKind = 'staff_user' | 'patient'

export type Subject =
  | { kind: 'staff_user'; userId: string }
  | { kind: 'patient'; patientId: string }

export type ActorRole = 'doctor' | 'frontdesk' | 'patient' | 'frontdesk_proxy'

export type ChangeReason =
  | 'self_service_change'
  | 'frontdesk_correction'
  | 'fallback_approved'
  | 'admin_change'

export type RequestStatus =
  | 'pending'
  | 'old_verified'
  | 'new_verified'   // transient
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'rejected'

export type VerificationMethod =
  | 'sms_both'
  | 'sms_new_only'
  | 'email'
  | 'national_id'
  | 'recovery_code'
  | 'manual'

export interface PhoneChangeRequestRow {
  id: string
  patient_id: string | null
  user_id: string | null
  old_phone: string
  new_phone: string
  status: RequestStatus
  verification_method: VerificationMethod | null
  expires_at: string | null
  created_at: string | null
  completed_at: string | null
}

// ============================================================================
// ERROR CLASS — caught and translated to NextResponse by handlers
// ============================================================================

export class PhoneChangeError extends Error {
  code: string
  httpStatus: number
  arabicMessage: string

  constructor(code: string, httpStatus: number, arabicMessage: string) {
    super(`PhoneChangeError(${code}): ${arabicMessage}`)
    this.name = 'PhoneChangeError'
    this.code = code
    this.httpStatus = httpStatus
    this.arabicMessage = arabicMessage
  }
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/** Resolve the current phone of the subject from the appropriate table. */
async function getCurrentPhone(subject: Subject): Promise<string | null> {
  const admin = createAdminClient('phone-change-request')

  if (subject.kind === 'staff_user') {
    const { data } = await admin
      .from('users')
      .select('phone')
      .eq('id', subject.userId)
      .maybeSingle()
    return data?.phone ?? null
  } else {
    const { data } = await admin
      .from('patients')
      .select('phone')
      .eq('id', subject.patientId)
      .maybeSingle()
    return data?.phone ?? null
  }
}

/** Lookup a user's role from public.users (used for notifications). */
async function getUserRole(
  userId: string
): Promise<'doctor' | 'frontdesk' | 'patient' | null> {
  const admin = createAdminClient('phone-change-request')
  const { data } = await admin
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  const r = data?.role
  if (r === 'doctor' || r === 'frontdesk' || r === 'patient') return r
  return null
}

/**
 * Find an active in-flight request for the given subject. Used for both
 * idempotency lookup and the "no concurrent requests" guard.
 */
async function findActiveRequest(
  subject: Subject
): Promise<PhoneChangeRequestRow | null> {
  const admin = createAdminClient('phone-change-request')
  const filter =
    subject.kind === 'staff_user'
      ? { col: 'user_id', val: subject.userId }
      : { col: 'patient_id', val: subject.patientId }

  const { data } = await admin
    .from('phone_change_requests')
    .select('*')
    .eq(filter.col, filter.val)
    .in('status', ['pending', 'old_verified'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as PhoneChangeRequestRow | null) ?? null
}

/**
 * Check that newPhone is not already used by another user (UNIQUE constraint
 * on users.phone) or another patient (no UNIQUE, but per §7.7 we forbid
 * patient-side collisions during change too — they signal a future merge).
 */
async function assertPhoneAvailable(
  subject: Subject,
  newPhone: string
): Promise<void> {
  const admin = createAdminClient('phone-change-request')

  // users.phone UNIQUE collision
  const { data: u } = await admin
    .from('users')
    .select('id')
    .eq('phone', newPhone)
    .maybeSingle()
  if (u) {
    const subjectId =
      subject.kind === 'staff_user' ? subject.userId : subject.patientId
    if (u.id !== subjectId) {
      throw new PhoneChangeError(
        'phone_taken',
        409,
        'الرقم ده مستخدم من حساب تاني'
      )
    }
  }

  // patients.phone collision (§7.7 future-merge guard). Only relevant when
  // the subject is itself a patient — for staff subjects, sharing a phone
  // with some unrelated patient is fine because we DO NOT propagate to
  // patients on staff change (per §6.3 / migration 070 gate).
  if (subject.kind === 'patient') {
    const { data: pRows } = await admin
      .from('patients')
      .select('id, clinic_id')
      .eq('phone', newPhone)
    const collisions = (pRows || []).filter(
      (r: any) => r.id !== subject.patientId
    )
    if (collisions.length > 0) {
      throw new PhoneChangeError(
        'phone_taken',
        409,
        'الرقم ده مسجل لمريض تاني عندنا. تواصل مع الدعم.'
      )
    }
  }
}

/**
 * Per-user-per-day soft cap on change requests. Counts CHANGE_PHONE_REQUESTED
 * audit events from the last 24h. Enforced AFTER the IP rate limit (which
 * lives in the handler).
 */
async function assertDailyCapNotExceeded(actorId: string): Promise<void> {
  const admin = createAdminClient('phone-change-request')
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await admin
    .from('audit_events')
    .select('id', { count: 'exact', head: true })
    .eq('actor_user_id', actorId)
    .eq('action', 'CHANGE_PHONE_REQUESTED')
    .gte('created_at', cutoff)
  if (error) return // best-effort; never block the request on a count failure
  const count = (data as any)?.count ?? 0
  if (count >= 5) {
    throw new PhoneChangeError(
      'rate_limit_request',
      429,
      'محاولات كتيرة. حاول بعد شوية'
    )
  }
}

/** SMS body for an OTP. Inline template, mirrors the existing send-otp shape. */
function otpSmsBody(code: string): string {
  return `كود تأكيد تغيير رقم الهاتف على MedAssist: ${code}\nصالح ٥ دقايق.`
}

// ============================================================================
// 1) requestPhoneChange
// ============================================================================

export interface RequestPhoneChangeInput {
  actorId: string
  actorRole: ActorRole
  subject: Subject
  newPhoneRaw: string             // raw user input; will be normalized
  idempotencyKey: string          // UUID
  clinicIdForAudit?: string | null
}

export interface RequestPhoneChangeOutput {
  requestId: string
  expiresAt: string | null
  oldPhoneMasked: string
  status: RequestStatus
  nextStep: 'verify_old' | 'awaiting_resume'
}

export async function requestPhoneChange(
  input: RequestPhoneChangeInput
): Promise<RequestPhoneChangeOutput> {
  const admin = createAdminClient('phone-change-request')

  // 1) Validate + normalize the new phone via the canonical helper (D-046).
  const v = validateEgyptianPhone(input.newPhoneRaw)
  if (!v.isValid || !v.normalized) {
    throw new PhoneChangeError(
      'invalid_phone',
      400,
      v.errorAr || 'رقم هاتف مصري غير صحيح — يبدأ بـ 010 أو 011 أو 012 أو 015'
    )
  }
  // The validator returns 12-digit no-plus E.164-ish (`201XXXXXXXXX`). For
  // storage in `phone_change_requests.old_phone`/`new_phone` we need to use
  // the same shape that the OTP send/verify logic uses — and that logic
  // treats `phone` as a string-equality lookup key. We standardize on the
  // local 11-digit format because that is what the existing client submits
  // (per the Phase A SECURITY NOTE in apps/clinic/app/api/frontdesk/profile/
  // route.ts) and what 170/288 production users currently store. See §5.8
  // commentary in PHONE_CHANGE_PLAN.md.
  const newPhoneLocal = '0' + v.normalized.substring(2) // 201X… → 01X…

  // 2) Resolve current phone for the subject.
  const oldPhone = await getCurrentPhone(input.subject)
  if (!oldPhone) {
    throw new PhoneChangeError(
      'subject_not_found',
      404,
      'الحساب غير موجود'
    )
  }

  // 3) same-as-current guard.
  if (oldPhone === newPhoneLocal) {
    throw new PhoneChangeError(
      'same_as_current',
      400,
      'الرقم الجديد لازم يبقى مختلف عن القديم'
    )
  }

  // 4) Idempotency / in-flight guard.
  //    First check audit_events for an existing request with the same
  //    idempotency key from this actor — that's our reliable dedupe surface.
  const existingByKey = await admin
    .from('audit_events')
    .select('entity_id')
    .eq('actor_user_id', input.actorId)
    .eq('action', 'CHANGE_PHONE_REQUESTED')
    .eq('metadata->>idempotency_key', input.idempotencyKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingByKey?.data) {
    const existingRequestId = (existingByKey.data as any).entity_id
    if (existingRequestId) {
      const { data: existingRow } = await admin
        .from('phone_change_requests')
        .select('*')
        .eq('id', existingRequestId)
        .maybeSingle()
      if (existingRow) {
        const r = existingRow as PhoneChangeRequestRow
        return {
          requestId: r.id,
          expiresAt: r.expires_at,
          oldPhoneMasked: maskPhone(r.old_phone),
          status: r.status,
          nextStep:
            r.status === 'pending' || r.status === 'old_verified'
              ? 'verify_old'
              : 'awaiting_resume',
        }
      }
    }
  }

  // No idempotent match — make sure no DIFFERENT request is in flight.
  const inFlight = await findActiveRequest(input.subject)
  if (inFlight) {
    throw new PhoneChangeError(
      'request_in_flight',
      409,
      'في طلب شغال خلاص. أكمل الموجود أو ألغيه قبل ما تبدأ تاني'
    )
  }

  // 5) Per-user-per-day soft cap.
  await assertDailyCapNotExceeded(input.actorId)

  // 6) Phone availability check.
  await assertPhoneAvailable(input.subject, newPhoneLocal)

  // 7) Create the request row.
  const insertRow: any = {
    old_phone: oldPhone,
    new_phone: newPhoneLocal,
    status: 'pending',
    verification_method: 'sms_both',
  }
  if (input.subject.kind === 'staff_user') {
    insertRow.user_id = input.subject.userId
    insertRow.patient_id = null
  } else {
    insertRow.patient_id = input.subject.patientId
    insertRow.user_id = null
  }
  const { data: created, error: insertErr } = await admin
    .from('phone_change_requests')
    .insert(insertRow)
    .select()
    .single()
  if (insertErr || !created) {
    throw new PhoneChangeError(
      'insert_failed',
      500,
      'مشكلة في حفظ الطلب. حاول تاني'
    )
  }
  const request = created as PhoneChangeRequestRow

  // 8) Generate OTP for the OLD phone and send.
  let otpCode: string
  try {
    otpCode = await createOTP(oldPhone, 'phone_change_old')
  } catch {
    throw new PhoneChangeError(
      'otp_create_failed',
      500,
      'مشكلة في إرسال الكود. حاول تاني'
    )
  }
  // Defensive 2nd copy of the hash on the request row (per migration 013 design).
  await admin
    .from('phone_change_requests')
    .update({ old_phone_otp_hash: hashOTP(otpCode) })
    .eq('id', request.id)
  // SMS — fire-and-forget (Twilio failures don't block; user can resend).
  void sendSMS(oldPhone, otpSmsBody(otpCode))

  // 9) Audit. Idempotency key stored in metadata for dedupe lookup above.
  void logAuditEvent({
    clinicId: input.clinicIdForAudit ?? undefined,
    actorUserId: input.actorId,
    action: 'CHANGE_PHONE_REQUESTED',
    entityType: 'phone_change_request',
    entityId: request.id,
    metadata: {
      subject_kind: input.subject.kind,
      subject_id:
        input.subject.kind === 'staff_user'
          ? input.subject.userId
          : input.subject.patientId,
      masked_old_phone: maskPhone(oldPhone),
      masked_new_phone: maskPhone(newPhoneLocal),
      actor_role: input.actorRole,
      verification_method: 'sms_both',
      idempotency_key: input.idempotencyKey,
    },
  })

  return {
    requestId: request.id,
    expiresAt: request.expires_at,
    oldPhoneMasked: maskPhone(oldPhone),
    status: 'pending',
    nextStep: 'verify_old',
  }
}

// ============================================================================
// 2) verifyPhoneChangeStep
// ============================================================================

export interface VerifyPhoneChangeInput {
  actorId: string
  actorRole: ActorRole
  requestId: string
  side: 'old' | 'new'
  code: string
  clinicIdForAudit?: string | null
}

export type VerifyOutcome =
  | { kind: 'old_verified'; nextStep: 'verify_new'; newPhoneMasked: string }
  | { kind: 'completed'; newPhone: string }
  | { kind: 'awaiting_owner_approval' }

export async function verifyPhoneChangeStep(
  input: VerifyPhoneChangeInput
): Promise<VerifyOutcome> {
  const admin = createAdminClient('phone-change-verify')

  // 1) Load + authorize the request.
  const { data: row } = await admin
    .from('phone_change_requests')
    .select('*')
    .eq('id', input.requestId)
    .maybeSingle()
  if (!row) {
    throw new PhoneChangeError(
      'request_not_found',
      404,
      'الطلب غير موجود'
    )
  }
  const request = row as PhoneChangeRequestRow

  assertActorMaySubject(request, input.actorId, input.actorRole)

  // 2) State guard — caller must verify in the right order.
  if (input.side === 'old') {
    if (request.status !== 'pending') {
      throw new PhoneChangeError(
        'request_terminal',
        409,
        'الطلب ده في مرحلة تانية أو منتهى. ابدأ من الأول.'
      )
    }
  } else {
    // side='new'
    const allowedForNew =
      request.verification_method === 'sms_new_only'
        ? request.status === 'pending'        // fallback path — only NEW is verified
        : request.status === 'old_verified'  // sms_both path — must verify OLD first
    if (!allowedForNew) {
      throw new PhoneChangeError(
        'wrong_side',
        409,
        request.verification_method === 'sms_new_only'
          ? 'الطلب ده في مرحلة تانية أو منتهى.'
          : 'لازم تأكد الرقم القديم الأول'
      )
    }
  }

  // 3) Choose the phone to verify.
  const phoneToVerify =
    input.side === 'old' ? request.old_phone : request.new_phone
  const purpose =
    input.side === 'old' ? 'phone_change_old' : 'phone_change_new'

  const result = await verifyOTP(phoneToVerify, input.code, purpose as any)
  if (!result.valid) {
    // Map the existing Arabic strings from otp.ts into our error codes.
    const lower = (result.error || '').toLowerCase()
    if (lower.includes('انتهت')) {
      throw new PhoneChangeError('code_expired', 400, 'الكود انتهت صلاحيته. اطلب كود جديد')
    }
    if (lower.includes('تجاوز')) {
      throw new PhoneChangeError('code_attempts_exceeded', 400, 'حاولت كتير. حاول كمان شوية')
    }
    throw new PhoneChangeError('code_wrong', 400, 'الكود غلط، حاول تاني')
  }

  // 4) Branch on side + verification_method.
  if (input.side === 'old') {
    // Move pending → old_verified, then send the NEW-side OTP.
    await admin
      .from('phone_change_requests')
      .update({
        status: 'old_verified',
        old_phone_verified_at: new Date().toISOString(),
      })
      .eq('id', request.id)

    let newOtp: string
    try {
      newOtp = await createOTP(request.new_phone, 'phone_change_new')
    } catch {
      throw new PhoneChangeError('otp_create_failed', 500, 'مشكلة في إرسال الكود. حاول تاني')
    }
    await admin
      .from('phone_change_requests')
      .update({ new_phone_otp_hash: hashOTP(newOtp) })
      .eq('id', request.id)
    void sendSMS(request.new_phone, otpSmsBody(newOtp))

    return {
      kind: 'old_verified',
      nextStep: 'verify_new',
      newPhoneMasked: maskPhone(request.new_phone),
    }
  }

  // side='new'
  if (request.verification_method === 'sms_new_only') {
    // Fallback path — keep status at 'old_verified' (held for owner approval).
    // We use 'old_verified' as the held-state for both sms_both and sms_new_only
    // since the owner inbox query filters by it.
    await admin
      .from('phone_change_requests')
      .update({
        status: 'old_verified',
        new_phone_verified_at: new Date().toISOString(),
      })
      .eq('id', request.id)
    return { kind: 'awaiting_owner_approval' }
  }

  // sms_both happy path — commit immediately.
  await admin
    .from('phone_change_requests')
    .update({
      status: 'new_verified',
      new_phone_verified_at: new Date().toISOString(),
    })
    .eq('id', request.id)

  await commitPhoneChange(request, input.actorId, input.actorRole, 'self_service_change')

  return { kind: 'completed', newPhone: request.new_phone }
}

/** Helper: assert that the actor may operate on this request's subject. */
function assertActorMaySubject(
  row: PhoneChangeRequestRow,
  actorId: string,
  actorRole: ActorRole
): void {
  // Subject is themselves OR (patient subject AND actor is frontdesk_proxy
  // — the per-clinic check happens at the handler level via getFrontdeskClinicId).
  if (row.user_id && row.user_id === actorId) return
  if (row.patient_id && row.patient_id === actorId) return // patient acting on own
  if (row.patient_id && actorRole === 'frontdesk_proxy') return
  throw new PhoneChangeError('forbidden', 403, 'مش مسموح')
}

// ============================================================================
// COMMIT — internal, called by verifyPhoneChangeStep AND approvePhoneChangeRequest
// ============================================================================

async function commitPhoneChange(
  request: PhoneChangeRequestRow,
  actorId: string,
  actorRole: ActorRole,
  changeReason: ChangeReason
): Promise<void> {
  const admin = createAdminClient('phone-change-commit')
  const subjectId = (request.user_id ?? request.patient_id)!
  const subjectKind: SubjectKind = request.user_id ? 'staff_user' : 'patient'

  // 1) Run the atomic SQL commit (migration 070 RPC).
  const { data: rpcResult, error: rpcErr } = await admin.rpc(
    'change_phone_commit',
    {
      p_request_id: request.id,
      p_subject_id: subjectId,
      p_subject_kind: subjectKind,
      p_old_phone: request.old_phone,
      p_new_phone: request.new_phone,
      p_actor_id: actorId,
      p_change_reason: changeReason,
    }
  )

  if (rpcErr) {
    // Postgres unique_violation on users.phone (UNIQUE constraint).
    if (
      rpcErr.code === '23505' ||
      (rpcErr.message || '').toLowerCase().includes('unique')
    ) {
      await admin
        .from('phone_change_requests')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', request.id)
      throw new PhoneChangeError(
        'phone_taken',
        409,
        'الرقم ده مستخدم من حساب تاني'
      )
    }
    throw new PhoneChangeError(
      'commit_failed',
      500,
      'مشكلة في تثبيت التغيير. حاول تاني'
    )
  }

  // 2) Sync auth.users.phone (RESOLVED Q1 — mandatory for the 53 phone-only accounts).
  //    Convert the local 01XXXXXXXXX format to the E.164 +201XXXXXXXXX form
  //    that Supabase Auth expects.
  const newE164 = '+20' + request.new_phone.substring(1)
  const { error: authErr } = await admin.auth.admin.updateUserById(subjectId, {
    phone: newE164,
  })
  if (authErr) {
    // Compensating rollback. Errors here are best-effort; the request row
    // is marked 'cancelled' and the surface error tells the user to retry.
    await admin.rpc('change_phone_rollback', {
      p_request_id: request.id,
      p_subject_id: subjectId,
      p_subject_kind: subjectKind,
      p_old_phone: request.old_phone,
      p_new_phone: request.new_phone,
      p_actor_id: actorId,
    })
    throw new PhoneChangeError(
      'auth_sync_failed',
      500,
      'مشكلة في تحديث الرقم. حاول تاني أو تواصل مع الدعم.'
    )
  }

  // 3) Post-commit fire-and-forget side effects.
  const touchedClinics = (rpcResult as any)?.touchedClinics ?? []

  // Q3 — security SMS to OLD phone
  void sendSMS(
    request.old_phone,
    'تم تغيير رقم الدخول لحساب MedAssist بتاعك. ' +
      'لو مش انت اللي عملت ده، تواصل مع الدعم على support@medassist.app فوراً.'
  )

  // Confirmation SMS to NEW phone
  void sendSMS(
    request.new_phone,
    'تم تأكيد رقمك الجديد على MedAssist. مرحباً بك ✓'
  )

  // Audit fan-out — one row per touched clinic.
  if (Array.isArray(touchedClinics) && touchedClinics.length > 0) {
    for (const tc of touchedClinics) {
      void logAuditEvent({
        clinicId: tc.clinicId,
        actorUserId: actorId,
        action:
          changeReason === 'fallback_approved'
            ? 'CHANGE_PHONE_FALLBACK_APPROVED'
            : 'CHANGE_PHONE_COMMITTED',
        entityType: subjectKind === 'patient' ? 'patient' : 'user',
        entityId: subjectId,
        metadata: {
          request_id: request.id,
          old_phone: maskPhone(request.old_phone),
          new_phone: maskPhone(request.new_phone),
          actor_role: actorRole,
          verification_method: request.verification_method,
          change_reason: changeReason,
          touched_patient_id: tc.patientId,
        },
      })
    }
  } else {
    // staff_user subject — no patients touched, write a single audit row
    // scoped by the subject's clinic_id_for_audit (caller-provided).
    void logAuditEvent({
      actorUserId: actorId,
      action:
        changeReason === 'fallback_approved'
          ? 'CHANGE_PHONE_FALLBACK_APPROVED'
          : 'CHANGE_PHONE_COMMITTED',
      entityType: 'user',
      entityId: subjectId,
      metadata: {
        request_id: request.id,
        old_phone: maskPhone(request.old_phone),
        new_phone: maskPhone(request.new_phone),
        actor_role: actorRole,
        verification_method: request.verification_method,
        change_reason: changeReason,
      },
    })
  }

  // In-app notification to subject
  if (subjectKind === 'staff_user') {
    const role = await getUserRole(subjectId)
    if (role) {
      void notifyPhoneChangeCompleted(
        subjectId,
        role,
        maskPhone(request.new_phone)
      )
    }
  }
}

// ============================================================================
// 3) cancelPhoneChange
// ============================================================================

export async function cancelPhoneChange(
  actorId: string,
  actorRole: ActorRole,
  requestId: string
): Promise<void> {
  const admin = createAdminClient('phone-change-cancel')

  const { data: row } = await admin
    .from('phone_change_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()
  if (!row) {
    throw new PhoneChangeError('request_not_found', 404, 'الطلب غير موجود')
  }
  const request = row as PhoneChangeRequestRow
  assertActorMaySubject(request, actorId, actorRole)

  // Idempotent: already-cancelled is a 200, not 409.
  if (request.status !== 'pending' && request.status !== 'old_verified') {
    void logAuditEvent({
      actorUserId: actorId,
      action: 'CHANGE_PHONE_CANCELLED',
      entityType: 'phone_change_request',
      entityId: requestId,
      metadata: { outcome: 'noop_already_terminal', previous_status: request.status },
    })
    return
  }

  await admin
    .from('phone_change_requests')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', requestId)

  void logAuditEvent({
    actorUserId: actorId,
    action: 'CHANGE_PHONE_CANCELLED',
    entityType: 'phone_change_request',
    entityId: requestId,
    metadata: {
      previous_status: request.status,
      actor_role: actorRole,
    },
  })
}

// ============================================================================
// 4) openPhoneChangeFallback
// ============================================================================

export interface OpenFallbackInput {
  actorId: string
  actorRole: ActorRole
  requestId: string
  reason: string
  clinicIdForAudit?: string | null
}

export async function openPhoneChangeFallback(
  input: OpenFallbackInput
): Promise<{ requiresOwnerApproval: true }> {
  const admin = createAdminClient('phone-change-fallback')

  if (!input.reason || input.reason.trim().length < 20) {
    throw new PhoneChangeError(
      'reason_too_short',
      400,
      'السبب لازم يكون على الأقل ٢٠ حرف'
    )
  }
  if (input.reason.length > 500) {
    throw new PhoneChangeError(
      'reason_too_long',
      400,
      'السبب طويل قوي. اختصر شوية.'
    )
  }

  const { data: row } = await admin
    .from('phone_change_requests')
    .select('*')
    .eq('id', input.requestId)
    .maybeSingle()
  if (!row) {
    throw new PhoneChangeError('request_not_found', 404, 'الطلب غير موجود')
  }
  const request = row as PhoneChangeRequestRow
  assertActorMaySubject(request, input.actorId, input.actorRole)

  if (request.status !== 'pending') {
    throw new PhoneChangeError(
      'request_terminal',
      409,
      'الطلب ده في مرحلة تانية أو منتهى.'
    )
  }

  // Flip method to sms_new_only. Status stays 'pending' until the new-side
  // OTP is verified (which then moves it to 'old_verified' as the held state).
  await admin
    .from('phone_change_requests')
    .update({ verification_method: 'sms_new_only' })
    .eq('id', request.id)

  // Send OTP to NEW phone. We still verify the user controls the destination,
  // even though we're skipping the OLD-side check.
  let otpCode: string
  try {
    otpCode = await createOTP(request.new_phone, 'phone_change_new')
  } catch {
    throw new PhoneChangeError('otp_create_failed', 500, 'مشكلة في إرسال الكود')
  }
  await admin
    .from('phone_change_requests')
    .update({ new_phone_otp_hash: hashOTP(otpCode) })
    .eq('id', request.id)
  void sendSMS(request.new_phone, otpSmsBody(otpCode))

  // For patient subjects, write an account_recovery_requests row so the
  // owner-inbox UI can render a unified shape for both staff and patient
  // fallbacks. For staff subjects we keep the reason in audit_events only.
  if (request.patient_id) {
    void admin.from('account_recovery_requests').insert({
      claimed_phone: request.old_phone,
      claimed_patient_id: request.patient_id,
      new_phone: request.new_phone,
      status: 'pending',
      verification_method: 'sms_new_only',
      verification_data: { phone_change_request_id: request.id, reason: input.reason },
    })
  }

  // Audit
  void logAuditEvent({
    clinicId: input.clinicIdForAudit ?? undefined,
    actorUserId: input.actorId,
    action: 'CHANGE_PHONE_FALLBACK_OPENED',
    entityType: 'phone_change_request',
    entityId: request.id,
    metadata: {
      reason: input.reason,
      subject_kind: request.user_id ? 'staff_user' : 'patient',
      actor_role: input.actorRole,
    },
  })

  // Q5: notify every active OWNER of every clinic this subject touches.
  const ownerTargets = await resolveOwnersForSubject(request)
  const subjectName = await resolveSubjectDisplayName(request)
  for (const owner of ownerTargets) {
    void notifyPhoneChangePendingApproval(
      owner.userId,
      subjectName,
      owner.clinicId
    )
  }

  return { requiresOwnerApproval: true }
}

/** For a request, resolve the list of (ownerUserId, clinicId) to notify. */
async function resolveOwnersForSubject(
  request: PhoneChangeRequestRow
): Promise<Array<{ userId: string; clinicId: string }>> {
  const admin = createAdminClient('phone-change-fallback')

  let clinicIds: string[] = []
  if (request.user_id) {
    const { data } = await admin
      .from('clinic_memberships')
      .select('clinic_id')
      .eq('user_id', request.user_id)
      .eq('status', 'ACTIVE')
    clinicIds = (data || []).map((r: any) => r.clinic_id)
  } else if (request.patient_id) {
    const { data } = await admin
      .from('patients')
      .select('clinic_id')
      .eq('id', request.patient_id)
      .maybeSingle()
    if (data?.clinic_id) clinicIds = [data.clinic_id]
  }

  if (clinicIds.length === 0) return []

  const { data: owners } = await admin
    .from('clinic_memberships')
    .select('user_id, clinic_id')
    .in('clinic_id', clinicIds)
    .eq('role', 'OWNER')
    .eq('status', 'ACTIVE')

  return (owners || []).map((o: any) => ({
    userId: o.user_id,
    clinicId: o.clinic_id,
  }))
}

async function resolveSubjectDisplayName(
  request: PhoneChangeRequestRow
): Promise<string> {
  const admin = createAdminClient('phone-change-fallback')
  if (request.patient_id) {
    const { data } = await admin
      .from('patients')
      .select('full_name')
      .eq('id', request.patient_id)
      .maybeSingle()
    if (data?.full_name) return data.full_name
  }
  if (request.user_id) {
    // Try doctors and front_desk_staff for the display name.
    const [doc, fd] = await Promise.all([
      admin.from('doctors').select('full_name').eq('id', request.user_id).maybeSingle(),
      admin.from('front_desk_staff').select('full_name').eq('id', request.user_id).maybeSingle(),
    ])
    return (doc.data as any)?.full_name || (fd.data as any)?.full_name || 'مستخدم'
  }
  return 'مستخدم'
}

// ============================================================================
// 5) Owner inbox: list + approve + reject
// ============================================================================

export interface PendingApprovalRow {
  requestId: string
  subjectKind: SubjectKind
  subjectId: string
  subjectName: string
  oldPhoneMasked: string
  newPhoneMasked: string
  reason: string | null
  createdAt: string | null
}

export async function getPendingPhoneChangeRequests(
  ownerId: string,
  clinicId: string
): Promise<PendingApprovalRow[]> {
  const admin = createAdminClient('phone-change-owner-inbox-read')

  // Authorize: must be OWNER of clinicId
  const { data: ownerMembership } = await admin
    .from('clinic_memberships')
    .select('role, status')
    .eq('user_id', ownerId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (
    !ownerMembership ||
    (ownerMembership as any).role !== 'OWNER' ||
    (ownerMembership as any).status !== 'ACTIVE'
  ) {
    throw new PhoneChangeError(
      'forbidden',
      403,
      'مش مسموح. لازم تكون مالك العيادة.'
    )
  }

  // Find all in-flight fallback requests where the subject is connected to this clinic.
  const { data: requestRows } = await admin
    .from('phone_change_requests')
    .select('*')
    .eq('verification_method', 'sms_new_only')
    .eq('status', 'old_verified')
    .order('created_at', { ascending: true })
  const requests = (requestRows as PhoneChangeRequestRow[] | null) || []

  // Filter to those belonging to this clinic.
  const result: PendingApprovalRow[] = []
  for (const r of requests) {
    let belongs = false
    if (r.user_id) {
      const { data } = await admin
        .from('clinic_memberships')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('user_id', r.user_id)
        .eq('status', 'ACTIVE')
        .maybeSingle()
      belongs = !!data
    } else if (r.patient_id) {
      const { data } = await admin
        .from('patients')
        .select('clinic_id')
        .eq('id', r.patient_id)
        .maybeSingle()
      belongs = (data as any)?.clinic_id === clinicId
    }
    if (!belongs) continue

    // Resolve reason text (from account_recovery_requests for patient,
    // from audit_events metadata.reason for staff).
    let reason: string | null = null
    if (r.patient_id) {
      const { data: arr } = await admin
        .from('account_recovery_requests')
        .select('verification_data')
        .eq('verification_data->>phone_change_request_id', r.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const vd = (arr as any)?.verification_data
      if (vd && typeof vd === 'object') reason = (vd as any).reason || null
    } else {
      const { data: ev } = await admin
        .from('audit_events')
        .select('metadata')
        .eq('action', 'CHANGE_PHONE_FALLBACK_OPENED')
        .eq('entity_id', r.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      reason = ((ev as any)?.metadata?.reason as string | undefined) || null
    }

    result.push({
      requestId: r.id,
      subjectKind: r.user_id ? 'staff_user' : 'patient',
      subjectId: (r.user_id ?? r.patient_id)!,
      subjectName: await resolveSubjectDisplayName(r),
      oldPhoneMasked: maskPhone(r.old_phone),
      newPhoneMasked: maskPhone(r.new_phone),
      reason,
      createdAt: r.created_at,
    })
  }

  return result
}

export async function approvePhoneChangeRequest(
  ownerId: string,
  clinicId: string,
  requestId: string
): Promise<void> {
  const admin = createAdminClient('phone-change-owner-approve')

  // Authorize OWNER of clinic.
  const { data: m } = await admin
    .from('clinic_memberships')
    .select('role, status')
    .eq('user_id', ownerId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (
    !m ||
    (m as any).role !== 'OWNER' ||
    (m as any).status !== 'ACTIVE'
  ) {
    throw new PhoneChangeError('forbidden', 403, 'مش مسموح. لازم تكون مالك العيادة.')
  }

  // Load request.
  const { data: row } = await admin
    .from('phone_change_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()
  if (!row) {
    throw new PhoneChangeError('request_not_found', 404, 'الطلب غير موجود')
  }
  const request = row as PhoneChangeRequestRow

  // Q2 — ban self-approval.
  if (request.user_id === ownerId) {
    throw new PhoneChangeError(
      'self_approval_banned',
      403,
      'مينفعش توافق على طلبك بنفسك. تواصل مع الدعم.'
    )
  }

  // Must be in held state.
  if (
    request.verification_method !== 'sms_new_only' ||
    request.status !== 'old_verified'
  ) {
    throw new PhoneChangeError(
      'request_terminal',
      409,
      'الطلب ده مش جاهز للموافقة.'
    )
  }

  // Run the same commit transaction.
  await commitPhoneChange(request, ownerId, 'doctor', 'fallback_approved')

  // Approval-specific notification (subject sees it on top of the regular completed one).
  const subjectId = (request.user_id ?? request.patient_id)!
  const subjectKind: SubjectKind = request.user_id ? 'staff_user' : 'patient'
  if (subjectKind === 'staff_user') {
    const role = await getUserRole(subjectId)
    if (role) {
      void notifyPhoneChangeApproved(
        subjectId,
        role,
        maskPhone(request.new_phone),
        clinicId
      )
    }
  }
}

export async function rejectPhoneChangeRequest(
  ownerId: string,
  clinicId: string,
  requestId: string,
  reason: string
): Promise<void> {
  const admin = createAdminClient('phone-change-owner-reject')

  if (!reason || reason.trim().length < 5) {
    throw new PhoneChangeError(
      'reason_too_short',
      400,
      'السبب لازم يكون على الأقل ٥ حروف'
    )
  }
  if (reason.length > 500) {
    throw new PhoneChangeError('reason_too_long', 400, 'السبب طويل قوي.')
  }

  // Authorize OWNER.
  const { data: m } = await admin
    .from('clinic_memberships')
    .select('role, status')
    .eq('user_id', ownerId)
    .eq('clinic_id', clinicId)
    .maybeSingle()
  if (
    !m ||
    (m as any).role !== 'OWNER' ||
    (m as any).status !== 'ACTIVE'
  ) {
    throw new PhoneChangeError('forbidden', 403, 'مش مسموح. لازم تكون مالك العيادة.')
  }

  // Load + terminal-state guard.
  const { data: row } = await admin
    .from('phone_change_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()
  if (!row) {
    throw new PhoneChangeError('request_not_found', 404, 'الطلب غير موجود')
  }
  const request = row as PhoneChangeRequestRow

  // Self-rejection isn't a security risk but is weird; allow it for now,
  // matching the broader permissive model on owner-side actions.

  if (
    request.verification_method !== 'sms_new_only' ||
    request.status !== 'old_verified'
  ) {
    throw new PhoneChangeError('request_terminal', 409, 'الطلب ده مش جاهز.')
  }

  await admin
    .from('phone_change_requests')
    .update({ status: 'rejected', completed_at: new Date().toISOString() })
    .eq('id', requestId)

  void logAuditEvent({
    clinicId,
    actorUserId: ownerId,
    action: 'CHANGE_PHONE_FALLBACK_REJECTED',
    entityType: 'phone_change_request',
    entityId: requestId,
    metadata: {
      rejected_by: ownerId,
      reason,
      subject_kind: request.user_id ? 'staff_user' : 'patient',
    },
  })

  const subjectId = (request.user_id ?? request.patient_id)!
  const subjectKind: SubjectKind = request.user_id ? 'staff_user' : 'patient'
  if (subjectKind === 'staff_user') {
    const role = await getUserRole(subjectId)
    if (role) {
      void notifyPhoneChangeRejected(subjectId, role, reason, clinicId)
    }
  }
}

// ============================================================================
// 6) correctPatientPhone — Phase C
// ============================================================================

export interface CorrectPatientPhoneInput {
  actorId: string                  // frontdesk user.id
  actorClinicId: string            // resolved via getFrontdeskClinicId
  patientId: string
  newPhoneRaw: string
  reason: string
}

export async function correctPatientPhone(
  input: CorrectPatientPhoneInput
): Promise<{ patient: { id: string; phone: string } }> {
  const admin = createAdminClient('phone-correction')

  // Validate phone via canonical helper.
  const v = validateEgyptianPhone(input.newPhoneRaw)
  if (!v.isValid || !v.normalized) {
    throw new PhoneChangeError(
      'invalid_phone',
      400,
      v.errorAr || 'رقم هاتف مصري غير صحيح'
    )
  }
  const newPhoneLocal = '0' + v.normalized.substring(2)

  // Reason guards.
  if (!input.reason || input.reason.trim().length < 10) {
    throw new PhoneChangeError(
      'reason_too_short',
      400,
      'السبب لازم يكون على الأقل ١٠ حروف'
    )
  }
  if (input.reason.length > 200) {
    throw new PhoneChangeError('reason_too_long', 400, 'السبب طويل قوي.')
  }

  // Load patient + clinic gate.
  const { data: patient } = await admin
    .from('patients')
    .select('id, phone, clinic_id, phone_verified')
    .eq('id', input.patientId)
    .maybeSingle()
  if (!patient) {
    throw new PhoneChangeError('patient_not_found', 404, 'المريض غير موجود')
  }
  if ((patient as any).clinic_id !== input.actorClinicId) {
    throw new PhoneChangeError(
      'forbidden_proxy',
      403,
      'مش مسموح تغير رقم مريض من عيادة تانية'
    )
  }

  // Q-blocker: if patient is phone_verified AND has a users row, force them
  // through the real change flow (Flow E in the plan), not correction.
  if ((patient as any).phone_verified === true) {
    const { data: userRow } = await admin
      .from('users')
      .select('id')
      .eq('id', input.patientId)
      .maybeSingle()
    if (userRow) {
      throw new PhoneChangeError(
        'verified_patient_must_change',
        409,
        'الرقم ده موثق. لازم المريض يغير الرقم بنفسه عشان موثق'
      )
    }
  }

  const oldPhone = (patient as any).phone as string

  // Same-as-current: idempotent no-op.
  if (oldPhone === newPhoneLocal) {
    return { patient: { id: input.patientId, phone: oldPhone } }
  }

  // Run the SQL writes in sequence. We don't use a single RPC here because
  // the correction flow is small and clinic-local — no cross-clinic
  // propagation, no auth-side sync. Order: patients UPDATE → phone_corrections
  // INSERT → 2 patient_phone_history rows.
  const { error: updErr } = await admin
    .from('patients')
    .update({ phone: newPhoneLocal })
    .eq('id', input.patientId)
  if (updErr) {
    throw new PhoneChangeError(
      'update_failed',
      500,
      'مشكلة في حفظ التصحيح. حاول تاني'
    )
  }

  await admin.from('phone_corrections').insert({
    patient_id: input.patientId,
    old_phone: oldPhone,
    new_phone: newPhoneLocal,
    reason: input.reason,
    verification_method: 'frontdesk_no_otp',
    initiated_by: 'frontdesk',
    initiated_by_user_id: input.actorId,
    status: 'completed',
    completed_at: new Date().toISOString(),
  })

  await admin.from('patient_phone_history').insert({
    patient_id: input.patientId,
    phone: oldPhone,
    is_current: false,
    removed_at: new Date().toISOString(),
    removed_reason: 'entry_error',
    change_reason: 'frontdesk_correction',
    changed_by: input.actorId,
  })
  await admin.from('patient_phone_history').insert({
    patient_id: input.patientId,
    phone: newPhoneLocal,
    is_current: true,
    verified: false, // correction does NOT verify
    change_reason: 'frontdesk_correction',
    changed_by: input.actorId,
  })

  void logAuditEvent({
    clinicId: input.actorClinicId,
    actorUserId: input.actorId,
    action: 'CORRECT_PATIENT_PHONE',
    entityType: 'patient',
    entityId: input.patientId,
    metadata: {
      old_phone: maskPhone(oldPhone),
      new_phone: maskPhone(newPhoneLocal),
      reason: input.reason,
      frontdesk_user_id: input.actorId,
    },
  })

  return { patient: { id: input.patientId, phone: newPhoneLocal } }
}
