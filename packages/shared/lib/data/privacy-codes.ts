/**
 * Privacy Code data layer — Build prompt 04.
 *
 * TS wrappers around the SECURITY DEFINER functions in mig 087.
 *
 * SHAPE INVARIANT (load-bearing for the privacy model)
 *   Every failure of every wrapper returns the SAME response shape:
 *     { success: false, requiresCode: true }
 *   The TS layer NEVER distinguishes "wrong code" from "rate limited" from
 *   "no such patient" externally. The DB-side audit + privacy_code_attempts
 *   rows have the precise reason; clients see one of two outcomes.
 *
 * TIMING INVARIANT
 *   The DB functions enforce >= 50ms wall-clock. The TS layer ALSO pads to
 *   >= 50ms total response time (network + DB) so jitter on the wire
 *   doesn't recreate a side-channel for clients close to the DB.
 *
 * AUTH SURFACE
 *   - check_phone_uniform: callable from any role (frontdesk + doctor on
 *     the clinic side; anon if we ever expose pre-auth phone search).
 *   - regenerate_privacy_code: claimed patient OR service-role (TS layer
 *     uses createAdminClient for service-role; the patient-initiated path
 *     uses the user's session token).
 *   - verify_privacy_code / verify_sms_code: clinic staff (frontdesk+doctor).
 *   - initiate_sms_share: frontdesk staff.
 *
 * AUDIT-DRIVEN SMS DISPATCH
 *   - initiate_sms_share writes the plaintext into audit_events.metadata
 *     under SMS_CONSENT_SENT. The TS sender (dispatchPendingSmsShareTokens)
 *     reads audit rows where sms_dispatch_pending = TRUE, sends the SMS
 *     via Twilio, and clears the flag. Same pattern for PRIVACY_CODE_LOCKED
 *     -> patient lockout SMS.
 *
 * SECURITY NOTE — plaintext lifecycle
 *   regenerate_privacy_code returns plaintext ONCE. This module's wrapper
 *   passes it through to the API route handler, which returns it to the
 *   caller in a single response. The plaintext is NEVER logged, never
 *   cached, never written to any table other than the bcrypt-hashed
 *   code_hash column.
 */

import { createAdminClient } from '@shared/lib/supabase/admin'
import { createClient } from '@shared/lib/supabase/server'

// ──────────────────────────────────────────────────────────────────────
// Locked numerics — match audits/EXECUTION_PROMPTS.md "Locked numerics"
// (and mig 087 internal constants). Re-stated here so callers don't need
// to grep for them.
// ──────────────────────────────────────────────────────────────────────
export const PRIVACY_CODE_LENGTH = 6
export const PRIVACY_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export const SMS_CODE_LENGTH = 4
export const PRIVACY_CHECK_MIN_RESPONSE_MS = 50

// ──────────────────────────────────────────────────────────────────────
// Wrapper response shape — uniform across every privacy-code operation.
// ──────────────────────────────────────────────────────────────────────

/** Outcome of a verify_*_code / check_phone call from the front-desk side. */
export type PrivacyVerifyOutcome =
  | { success: true; globalPatientId: string }
  | { success: false; requiresCode: true }

/** Outcome of check_phone_uniform — never reveals existence. */
export interface PhoneCheckOutcome {
  exists: false
  requiresCode: true
}

/** Outcome of initiate_sms_share — never reveals patient existence. */
export interface SmsShareInitiateOutcome {
  requiresCode: true
}

/** Outcome of regenerate_privacy_code — plaintext returned ONCE. */
export interface RegenerateOutcome {
  /** Plaintext code. Caller must NOT log/cache. */
  code: string
}

// ──────────────────────────────────────────────────────────────────────
// Padding helper — TS-side floor on response time. Database functions
// also pad; this is belt-and-suspenders for the network leg.
// ──────────────────────────────────────────────────────────────────────
async function padTo(startMs: number, floorMs: number): Promise<void> {
  const elapsed = Date.now() - startMs
  if (elapsed < floorMs) {
    await new Promise((resolve) => setTimeout(resolve, floorMs - elapsed))
  }
}

// ──────────────────────────────────────────────────────────────────────
// 1. checkPhoneUniform — search-privacy parity (front desk pre-auth)
// ──────────────────────────────────────────────────────────────────────

/**
 * Returns { exists: false, requiresCode: true } regardless of input.
 * Pads to >= 50ms total. Used by the front-desk "search by phone" path —
 * the response NEVER reveals whether the phone matches a global_patient.
 */
export async function checkPhoneUniform(rawPhone: string): Promise<PhoneCheckOutcome> {
  const start = Date.now()
  // Use the user's authenticated client (cookie/JWT) so the function's
  // SECURITY DEFINER body sees the right auth.role(). For the anonymous
  // pre-auth case, this falls back to anon role.
  const supabase = await createClient()
  await supabase.rpc('check_phone_uniform', { p_phone: rawPhone })
  await padTo(start, PRIVACY_CHECK_MIN_RESPONSE_MS)
  return { exists: false, requiresCode: true }
}

// ──────────────────────────────────────────────────────────────────────
// 2. verifyPrivacyCode — clinic-initiated verification
// ──────────────────────────────────────────────────────────────────────

export async function verifyPrivacyCode(params: {
  phone: string
  code: string
  attemptedByUserId: string
  attemptedByClinicId: string
  ip?: string | null
  userAgent?: string | null
  requestId?: string | null
}): Promise<PrivacyVerifyOutcome> {
  const start = Date.now()
  const supabase = await createClient()
  const { data, error } = await (supabase as any).rpc('verify_privacy_code', {
    p_phone: params.phone,
    p_code: params.code,
    p_attempted_by_user_id: params.attemptedByUserId,
    p_attempted_by_clinic_id: params.attemptedByClinicId,
    p_ip: params.ip ?? null,
    p_user_agent: params.userAgent ?? null,
    p_request_id: params.requestId ?? null,
  })

  await padTo(start, PRIVACY_CHECK_MIN_RESPONSE_MS)

  if (error || !data) {
    // Treat infrastructure errors as uniform failures — never let an RPC
    // exception leak existence/state to the caller.
    return { success: false, requiresCode: true }
  }
  // The DB function returns JSONB. Coerce.
  const payload = data as { success?: boolean; global_patient_id?: string }
  if (payload.success && payload.global_patient_id) {
    return { success: true, globalPatientId: payload.global_patient_id }
  }
  return { success: false, requiresCode: true }
}

// ──────────────────────────────────────────────────────────────────────
// 3. initiateSmsShare — front-desk initiates 5-minute SMS code
// ──────────────────────────────────────────────────────────────────────

/**
 * Mints a 4-digit token via the SECURITY DEFINER initiate_sms_share. The
 * DB function records SMS_CONSENT_SENT with the plaintext in metadata;
 * this wrapper THEN reads that audit row, dispatches SMS via Twilio, and
 * clears the dispatch flag. Plaintext is overwritten on the audit row
 * once the SMS is sent (best-effort cleanup) so it doesn't linger forever.
 *
 * Returns uniform { requiresCode: true } regardless of patient existence.
 */
export async function initiateSmsShare(params: {
  phone: string
  requestingClinicId: string
  requestingDoctorId: string
  requestId?: string | null
  /** Set false in tests; production always sends. */
  dispatch?: boolean
}): Promise<SmsShareInitiateOutcome> {
  const start = Date.now()
  const supabase = await createClient()
  await (supabase as any).rpc('initiate_sms_share', {
    p_phone: params.phone,
    p_requesting_clinic_id: params.requestingClinicId,
    p_requesting_doctor_id: params.requestingDoctorId,
    p_request_id: params.requestId ?? null,
  })

  // Best-effort SMS dispatch. Runs after the RPC commits — dispatch
  // failures don't break the user-facing flow (the front desk gets the
  // uniform response either way).
  if (params.dispatch !== false) {
    void dispatchPendingSmsShareTokens(params.requestingClinicId).catch((err) => {
      console.error('SMS dispatch failed (non-fatal):', err)
    })
  }

  await padTo(start, PRIVACY_CHECK_MIN_RESPONSE_MS)
  return { requiresCode: true }
}

// ──────────────────────────────────────────────────────────────────────
// 4. verifySmsCode — same shape as verifyPrivacyCode for the SMS code
// ──────────────────────────────────────────────────────────────────────

export async function verifySmsCode(params: {
  phone: string
  code: string
  attemptedByUserId: string
  attemptedByClinicId: string
  ip?: string | null
  userAgent?: string | null
  requestId?: string | null
}): Promise<PrivacyVerifyOutcome> {
  const start = Date.now()
  const supabase = await createClient()
  const { data, error } = await (supabase as any).rpc('verify_sms_code', {
    p_phone: params.phone,
    p_code: params.code,
    p_attempted_by_user_id: params.attemptedByUserId,
    p_attempted_by_clinic_id: params.attemptedByClinicId,
    p_ip: params.ip ?? null,
    p_user_agent: params.userAgent ?? null,
    p_request_id: params.requestId ?? null,
  })

  await padTo(start, PRIVACY_CHECK_MIN_RESPONSE_MS)

  if (error || !data) {
    return { success: false, requiresCode: true }
  }
  const payload = data as { success?: boolean; global_patient_id?: string }
  if (payload.success && payload.global_patient_id) {
    return { success: true, globalPatientId: payload.global_patient_id }
  }
  return { success: false, requiresCode: true }
}

// ──────────────────────────────────────────────────────────────────────
// 5. regeneratePrivacyCode — patient-initiated mint or service-role mint
// ──────────────────────────────────────────────────────────────────────

/**
 * Mints (or rotates) a privacy code for the given global_patient.
 * Returns plaintext ONCE — caller must NOT persist or log it.
 *
 * AUTH PATHS
 *   - patientInitiated: uses the user's authenticated client; the DB
 *     function authorizes via auth.uid() = global_patients.claimed_user_id.
 *   - serviceRole: uses createAdminClient. Used by the lazy-mint flow
 *     (patient first opens the patient app and has no code yet).
 */
export async function regeneratePrivacyCode(params: {
  globalPatientId: string
  /** 'patient' uses the authenticated client; 'service' uses admin. */
  authMode: 'patient' | 'service'
}): Promise<RegenerateOutcome> {
  const supabase =
    params.authMode === 'service'
      ? createAdminClient('regenerate-privacy-code-service')
      : await createClient()

  const { data, error } = await (supabase as any).rpc('regenerate_privacy_code', {
    p_global_patient_id: params.globalPatientId,
  })

  if (error) {
    throw new Error(
      `regenerate_privacy_code failed: ${(error as { message?: string }).message ?? 'unknown'}`
    )
  }

  if (typeof data !== 'string' || data.length !== PRIVACY_CODE_LENGTH) {
    throw new Error('regenerate_privacy_code returned unexpected shape')
  }

  return { code: data }
}

// ──────────────────────────────────────────────────────────────────────
// 6. hasActivePrivacyCode — patient app uses this to decide
//    "show code" vs. "mint your code first"
// ──────────────────────────────────────────────────────────────────────

/**
 * Returns whether the patient currently has an active (non-revoked)
 * privacy code. Read via service-role since RLS denies direct SELECT.
 * The plaintext is NEVER returned by this function (only minted by
 * regenerate_privacy_code, surfaced once).
 */
export async function hasActivePrivacyCode(globalPatientId: string): Promise<boolean> {
  const admin = createAdminClient('privacy-code-exists-check')
  const { count, error } = await admin
    .from('patient_privacy_codes')
    .select('id', { count: 'exact', head: true })
    .eq('global_patient_id', globalPatientId)
    .is('revoked_at', null)

  if (error) {
    throw new Error(
      `hasActivePrivacyCode failed: ${(error as { message?: string }).message ?? 'unknown'}`
    )
  }
  return (count ?? 0) > 0
}

// ──────────────────────────────────────────────────────────────────────
// SMS dispatch — reads SMS_CONSENT_SENT audit rows and sends via Twilio.
// ──────────────────────────────────────────────────────────────────────

/**
 * Dispatch all pending SMS_CONSENT_SENT audit rows for the given clinic
 * (or all clinics if not specified). Sends the Egyptian Arabic consent
 * SMS template via the existing twilio-client. Marks the audit row's
 * sms_dispatch_pending = false on success, and overwrites the plaintext
 * field so it doesn't linger.
 *
 * Idempotent — re-running is safe (we filter by sms_dispatch_pending=TRUE).
 *
 * NATIVE SPEAKER REVIEW PENDING
 *   The Egyptian Arabic template is a draft. ORPH-V4-07 tracks the
 *   sign-off task; Mo names a reviewer and updates the template if
 *   needed before merge.
 */
export async function dispatchPendingSmsShareTokens(
  clinicIdFilter?: string
): Promise<{ sent: number; failed: number }> {
  const admin = createAdminClient('sms-share-dispatcher')

  let query = admin
    .from('audit_events')
    .select('id, entity_id, metadata, clinic_id')
    .eq('action', 'SMS_CONSENT_SENT')
    .filter('metadata->>sms_dispatch_pending', 'eq', 'true')
    .order('created_at', { ascending: true })
    .limit(50)

  if (clinicIdFilter) query = query.eq('clinic_id', clinicIdFilter)

  const { data: rows, error } = await query
  if (error || !rows) return { sent: 0, failed: 0 }

  // Lazy import to avoid a hard dependency in test environments.
  const { sendSMS } = await import('@shared/lib/sms/twilio-client')

  let sent = 0
  let failed = 0

  for (const row of rows) {
    const md = (row.metadata ?? {}) as Record<string, any>
    const plaintext: string | undefined = md.sms_plaintext
    const requestingClinicId: string | undefined = md.requesting_clinic_id
    const requestingDoctorId: string | undefined = md.requesting_doctor_id
    const globalPatientId = row.entity_id as string | undefined
    if (!plaintext || !requestingClinicId || !requestingDoctorId || !globalPatientId) {
      failed += 1
      continue
    }

    // Resolve the patient's phone + clinic name + doctor name for the SMS body.
    const [{ data: gp }, { data: clinic }, { data: doctor }] = await Promise.all([
      admin
        .from('global_patients')
        .select('normalized_phone')
        .eq('id', globalPatientId)
        .maybeSingle(),
      admin.from('clinics').select('name').eq('id', requestingClinicId).maybeSingle(),
      admin.from('users').select('name, email').eq('id', requestingDoctorId).maybeSingle(),
    ])

    if (!gp?.normalized_phone || !clinic?.name) {
      failed += 1
      continue
    }

    const doctorName: string =
      (doctor as any)?.name || (doctor as any)?.email || 'الطبيب'
    const body = renderSmsConsentTemplate({
      clinicName: clinic.name as string,
      doctorName,
      code: plaintext,
    })

    const result = await sendSMS(gp.normalized_phone, body)
    if (result.success) {
      // Clear the plaintext from the audit row + mark as dispatched.
      // We retain the rest of the metadata for forensic trail.
      await admin
        .from('audit_events')
        .update({
          metadata: {
            ...md,
            sms_plaintext: '[DISPATCHED]',
            sms_dispatch_pending: false,
            sms_sid: result.sid,
            sms_dispatched_at: new Date().toISOString(),
          },
        })
        .eq('id', row.id)
      sent += 1
    } else {
      // Leave the row pending so the next sweep retries; record the error.
      await admin
        .from('audit_events')
        .update({
          metadata: {
            ...md,
            sms_last_error: result.error,
            sms_last_error_at: new Date().toISOString(),
          },
        })
        .eq('id', row.id)
      failed += 1
    }
  }

  return { sent, failed }
}

/**
 * Egyptian Arabic SMS consent template. Names the clinic + doctor + the
 * 4-digit code. NATIVE-SPEAKER REVIEW PENDING (ORPH-V4-07).
 */
export function renderSmsConsentTemplate(params: {
  clinicName: string
  doctorName: string
  code: string
}): string {
  return (
    `عيادة ${params.clinicName} طلبت إذنك لرؤية سجلاتك الطبية.\n` +
    `الكود: ${params.code}. صالح لمدة 5 دقائق فقط.\n` +
    `الدكتور: ${params.doctorName}.\n` +
    `لو ما طلبتش الإذن ده، تجاهل الرسالة.`
  )
}
