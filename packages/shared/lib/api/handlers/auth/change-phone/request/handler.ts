export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/change-phone/request
 *
 * Initiate a phone change. Sends an OTP to the OLD phone (or to the NEW phone
 * if the path is fallback — handled separately by /fallback). Idempotent on
 * `idempotencyKey`: if the same key from the same actor matches an in-flight
 * request, return that request's state instead of creating a new row.
 *
 * Behavior summary (full spec: PHONE_CHANGE_PLAN.md §5.1):
 *   - Auth: any authenticated user (doctor, frontdesk, patient — the patient
 *     UI is deferred to Phase 2 per resolved Q7, but the endpoint accepts
 *     patient role for forward compatibility).
 *   - Rate limit: 'change-phone-request' = 3 requests/IP/60s.
 *   - FEATURE_PHONE_CHANGE_V2 gate: returns 404 when disabled.
 */

import { NextResponse } from 'next/server'
import {
  requireApiAuth,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'
import { getFrontdeskClinicId } from '@shared/lib/data/frontdesk-scope'
import { getClinicContext } from '@shared/lib/data/clinic-context'
import { createAdminClient } from '@shared/lib/supabase/admin'
import {
  requestPhoneChange,
  PhoneChangeError,
  type ActorRole,
  type Subject,
} from '@shared/lib/data/phone-changes'

const FEATURE_FLAG = 'FEATURE_PHONE_CHANGE_V2'

function isUUID(val: any): val is string {
  return typeof val === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}

export async function POST(request: Request) {
  // ── Feature flag ────────────────────────────────────────────────────────
  if (process.env[FEATURE_FLAG] !== 'true') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  try {
    // ── Rate limit (per IP) ──────────────────────────────────────────────
    const rate = await enforceRateLimit(request, 'change-phone-request', 3, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'محاولات كتيرة. حاول بعد شوية', code: 'rate_limit_request' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    // ── Auth ──────────────────────────────────────────────────────────────
    const user = await requireApiAuth()

    // ── Body validation ──────────────────────────────────────────────────
    const body = await request.json().catch(() => ({}))
    const { newPhone, forPatientId, idempotencyKey } = body || {}

    if (typeof newPhone !== 'string' || newPhone.length < 10 || newPhone.length > 20) {
      return NextResponse.json(
        { error: 'رقم الهاتف الجديد مطلوب', code: 'invalid_body' },
        { status: 400 }
      )
    }
    if (!isUUID(idempotencyKey)) {
      return NextResponse.json(
        { error: 'idempotencyKey لازم UUID', code: 'invalid_body' },
        { status: 400 }
      )
    }
    if (forPatientId !== undefined && !isUUID(forPatientId)) {
      return NextResponse.json(
        { error: 'forPatientId غلط', code: 'invalid_body' },
        { status: 400 }
      )
    }

    // ── Resolve subject + clinic for audit ──────────────────────────────
    let subject: Subject
    let actorRole: ActorRole
    let clinicIdForAudit: string | null = null

    if (forPatientId) {
      // Frontdesk-as-proxy for a patient subject. Actor MUST be frontdesk
      // AND patient.clinic_id must match actor's frontdesk clinic.
      if (user.role !== 'frontdesk') {
        return NextResponse.json(
          { error: 'مش مسموح', code: 'forbidden' },
          { status: 403 }
        )
      }
      const admin = createAdminClient('phone-change-request')
      const { data: patient } = await admin
        .from('patients')
        .select('clinic_id')
        .eq('id', forPatientId)
        .maybeSingle()
      if (!patient) {
        return NextResponse.json(
          { error: 'المريض غير موجود', code: 'patient_not_found' },
          { status: 404 }
        )
      }
      const fdClinicId = await getFrontdeskClinicId(admin as any, user.id)
      if (!fdClinicId || (patient as any).clinic_id !== fdClinicId) {
        return NextResponse.json(
          { error: 'مش مسموح تغير رقم مريض من عيادة تانية', code: 'forbidden_proxy' },
          { status: 403 }
        )
      }
      subject = { kind: 'patient', patientId: forPatientId }
      actorRole = 'frontdesk_proxy'
      clinicIdForAudit = fdClinicId
    } else {
      // Subject is the actor themselves.
      if (user.role === 'patient') {
        subject = { kind: 'patient', patientId: user.id }
        actorRole = 'patient'
      } else {
        subject = { kind: 'staff_user', userId: user.id }
        actorRole = (user.role as ActorRole)
        // Best-effort clinic resolution for audit. Doctors → getClinicContext
        // (active clinic from cookie). Frontdesk → getFrontdeskClinicId.
        if (user.role === 'doctor') {
          try {
            const ctx = await getClinicContext(user.id, 'doctor')
            clinicIdForAudit = ctx?.clinicId ?? null
          } catch { /* best-effort */ }
        } else if (user.role === 'frontdesk') {
          const admin = createAdminClient('phone-change-request')
          clinicIdForAudit = await getFrontdeskClinicId(admin as any, user.id).catch(() => null)
        }
      }
    }

    const result = await requestPhoneChange({
      actorId: user.id,
      actorRole,
      subject,
      newPhoneRaw: newPhone,
      idempotencyKey,
      clinicIdForAudit,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof PhoneChangeError) {
      return NextResponse.json(
        { error: error.arabicMessage, code: error.code },
        { status: error.httpStatus }
      )
    }
    return toApiErrorResponse(error, 'فشل في بدء تغيير رقم الهاتف')
  }
}
