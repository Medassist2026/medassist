export const dynamic = 'force-dynamic'

/**
 * PATCH /api/frontdesk/patients/:id/phone-correction
 *
 * Frontdesk fixes a typo in a patient's phone (Phase C). NO OTP — frontdesk
 * has the patient on phone or in person. Mandatory 10–200 char reason.
 *
 * Storage:
 *   - patients.phone   → updated to new phone (clinic-local; NO cross-clinic propagation)
 *   - phone_corrections → INSERT (status='completed')
 *   - patient_phone_history → 2 rows (old removed_reason='entry_error', new is_current=true verified=false)
 *   - audit_events  → action='CORRECT_PATIENT_PHONE'
 *
 * Hard guards (per plan §5.7):
 *   - Actor MUST be frontdesk in the patient's clinic (D-041 server-resolved tenant).
 *   - If patient.phone_verified=true AND has an auth.users row → 409 verified_patient_must_change.
 *
 * Full spec: PHONE_CHANGE_PLAN.md §5.7.
 */

import { NextResponse } from 'next/server'
import {
  requireApiRole,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'
import { getFrontdeskClinicId } from '@shared/lib/data/frontdesk-scope'
import { createAdminClient } from '@shared/lib/supabase/admin'
import {
  correctPatientPhone,
  PhoneChangeError,
} from '@shared/lib/data/phone-changes'

const FEATURE_FLAG = 'FEATURE_PHONE_CHANGE_V2'

function isUUID(val: string | undefined): val is string {
  return typeof val === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  if (process.env[FEATURE_FLAG] !== 'true') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  try {
    const patientId = context?.params?.id
    if (!isUUID(patientId)) {
      return NextResponse.json(
        { error: 'معرف المريض غلط', code: 'invalid_param' },
        { status: 400 }
      )
    }

    const rate = await enforceRateLimit(request, 'phone-correction', 10, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'محاولات كتيرة. حاول بعد شوية', code: 'rate_limit' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    const user = await requireApiRole('frontdesk')

    const body = await request.json().catch(() => ({}))
    const { newPhone, reason } = body || {}

    if (typeof newPhone !== 'string' || newPhone.length < 10 || newPhone.length > 20) {
      return NextResponse.json(
        { error: 'الرقم الجديد مطلوب', code: 'invalid_body' },
        { status: 400 }
      )
    }
    if (typeof reason !== 'string' || reason.length === 0) {
      return NextResponse.json(
        { error: 'السبب مطلوب', code: 'invalid_body' },
        { status: 400 }
      )
    }

    // Resolve frontdesk's clinic via the canonical helper. If the user is
    // not assigned to a clinic, refuse — D-041.
    const admin = createAdminClient('phone-correction')
    const clinicId = await getFrontdeskClinicId(admin as any, user.id).catch(() => null)
    if (!clinicId) {
      return NextResponse.json(
        { error: 'لا توجد عيادة نشطة', code: 'no_active_clinic' },
        { status: 400 }
      )
    }

    const result = await correctPatientPhone({
      actorId: user.id,
      actorClinicId: clinicId,
      patientId,
      newPhoneRaw: newPhone,
      reason,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof PhoneChangeError) {
      return NextResponse.json(
        { error: error.arabicMessage, code: error.code },
        { status: error.httpStatus }
      )
    }
    return toApiErrorResponse(error, 'فشل في تصحيح الرقم')
  }
}
