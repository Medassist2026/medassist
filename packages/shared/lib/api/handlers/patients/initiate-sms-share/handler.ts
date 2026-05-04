export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'
import { initiateSmsShare } from '@shared/lib/data/privacy-codes'
import { createClient } from '@shared/lib/supabase/server'

/**
 * POST /api/patients/initiate-sms-share — Build prompt 04 (B10).
 *
 * Body: { phone: string, clinic_id: string, doctor_id: string, request_id?: string }
 *
 * Front-desk triggers a 5-minute, single-use, 4-digit SMS code that the
 * patient reads back. The DB function (initiate_sms_share, mig 087)
 * mints + hashes the token, writes SMS_CONSENT_SENT with the plaintext
 * in audit metadata, and the TS layer (dispatchPendingSmsShareTokens)
 * picks up + sends via Twilio with the Egyptian Arabic consent template.
 *
 * Returns uniform { requiresCode: true } regardless of patient existence.
 */
export async function POST(request: Request) {
  try {
    const rate = await enforceRateLimit(request, 'patient-initiate-sms-share', 30, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    await requireApiRole('frontdesk')

    const body = await request.json().catch(() => ({}))
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''
    const clinicId = typeof body?.clinic_id === 'string' ? body.clinic_id : null
    const doctorId = typeof body?.doctor_id === 'string' ? body.doctor_id : null
    const requestId = typeof body?.request_id === 'string' ? body.request_id : null

    if (!phone || !clinicId || !doctorId) {
      return NextResponse.json({ requiresCode: true })
    }

    // Belt-and-suspenders membership check (same pattern as verify-privacy-code).
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth?.user?.id
    if (!userId) {
      return NextResponse.json({ requiresCode: true })
    }

    const { data: membership } = await supabase
      .from('clinic_memberships')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!membership?.id) {
      return NextResponse.json({ requiresCode: true })
    }

    const outcome = await initiateSmsShare({
      phone,
      requestingClinicId: clinicId,
      requestingDoctorId: doctorId,
      requestId,
      // Production always dispatches; tests pass dispatch:false
      dispatch: true,
    })

    return NextResponse.json(outcome)
  } catch (error: any) {
    console.error('initiate-sms-share error:', error)
    return toApiErrorResponse(error, 'SMS share initiation failed')
  }
}
