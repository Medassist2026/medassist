export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/change-phone/verify
 *
 * Submit a 4-digit OTP for either the OLD or NEW side of an in-flight
 * phone-change request. State machine:
 *   side='old' (sms_both)        → pending      → old_verified (sends NEW OTP)
 *   side='new' (sms_both)        → old_verified → completed (commit fires)
 *   side='new' (sms_new_only)    → pending      → old_verified (held; awaits owner approval)
 *
 * Full spec: PHONE_CHANGE_PLAN.md §5.2.
 */

import { NextResponse } from 'next/server'
import {
  requireApiAuth,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'
import {
  verifyPhoneChangeStep,
  PhoneChangeError,
  type ActorRole,
} from '@shared/lib/data/phone-changes'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { getFrontdeskClinicId } from '@shared/lib/data/frontdesk-scope'

const FEATURE_FLAG = 'FEATURE_PHONE_CHANGE_V2'

function isUUID(val: any): val is string {
  return typeof val === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}

export async function POST(request: Request) {
  if (process.env[FEATURE_FLAG] !== 'true') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  try {
    const rate = await enforceRateLimit(request, 'change-phone-verify', 10, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'محاولات كتيرة. حاول بعد شوية', code: 'rate_limit_verify' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    const user = await requireApiAuth()

    const body = await request.json().catch(() => ({}))
    const { requestId, side, code } = body || {}

    if (!isUUID(requestId)) {
      return NextResponse.json(
        { error: 'requestId غلط', code: 'invalid_body' },
        { status: 400 }
      )
    }
    if (side !== 'old' && side !== 'new') {
      return NextResponse.json(
        { error: 'side لازم يكون "old" أو "new"', code: 'invalid_body' },
        { status: 400 }
      )
    }
    if (typeof code !== 'string' || !/^\d{4}$/.test(code)) {
      return NextResponse.json(
        { error: 'كود التحقق لازم ٤ أرقام', code: 'invalid_body' },
        { status: 400 }
      )
    }

    // ── Resolve actor role for the data-layer authorization check.
    //    For frontdesk-proxy on a patient request, we need the actor's clinic
    //    to match the patient's clinic_id. The data layer knows nothing about
    //    that — we resolve here and pass actorRole='frontdesk_proxy' if the
    //    request belongs to a patient AND the actor is frontdesk in the
    //    patient's clinic.
    let actorRole: ActorRole = (user.role as ActorRole)
    if (user.role === 'frontdesk') {
      const admin = createAdminClient('phone-change-verify')
      const { data: pcrRow } = await admin
        .from('phone_change_requests')
        .select('patient_id')
        .eq('id', requestId)
        .maybeSingle()
      if ((pcrRow as any)?.patient_id) {
        const fdClinic = await getFrontdeskClinicId(admin as any, user.id).catch(() => null)
        if (fdClinic) {
          const { data: pt } = await admin
            .from('patients')
            .select('clinic_id')
            .eq('id', (pcrRow as any).patient_id)
            .maybeSingle()
          if ((pt as any)?.clinic_id === fdClinic) {
            actorRole = 'frontdesk_proxy'
          }
        }
      }
    }

    const outcome = await verifyPhoneChangeStep({
      actorId: user.id,
      actorRole,
      requestId,
      side,
      code,
    })

    return NextResponse.json({ success: true, ...outcome })
  } catch (error) {
    if (error instanceof PhoneChangeError) {
      return NextResponse.json(
        { error: error.arabicMessage, code: error.code },
        { status: error.httpStatus }
      )
    }
    return toApiErrorResponse(error, 'فشل في التحقق من الكود')
  }
}
