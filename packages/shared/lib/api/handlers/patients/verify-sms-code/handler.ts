export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'
import { verifySmsCode } from '@shared/lib/data/privacy-codes'
import { resolveIdentityForClinic } from '@shared/lib/data/identity-resolution'
import { createSharesForGrantors } from '@shared/lib/data/patient-shares'
import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'

/**
 * POST /api/patients/verify-sms-code — Build prompt 04 (B11) +
 *   Build prompt 05 (B6, share creation wired).
 *
 * Same shape as verify-privacy-code but for the 4-digit SMS token.
 * Body: { phone: string, code: string, clinic_id: string, request_id?: string }
 *
 * On success: { success: true, global_patient_id, patient_id, shares: [...] }
 * On failure: { success: false, requiresCode: true }
 *
 * The DB function (verify_sms_code, mig 087) enforces single-use (used_at)
 * and per-token attempts cap. Build 05 wires share creation in: same
 * multi-grantor pattern as verify-privacy-code (one share per existing
 * grantor clinic).
 */
export async function POST(request: Request) {
  try {
    const rate = await enforceRateLimit(request, 'patient-verify-sms-code', 60, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    await requireApiRole(['doctor', 'frontdesk'])

    const body = await request.json().catch(() => ({}))
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''
    const code = typeof body?.code === 'string' ? body.code.trim() : ''
    const clinicId = typeof body?.clinic_id === 'string' ? body.clinic_id : null
    const requestId = typeof body?.request_id === 'string' ? body.request_id : null

    if (!phone || !code || !clinicId) {
      return NextResponse.json({ success: false, requiresCode: true })
    }

    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth?.user?.id
    if (!userId) {
      return NextResponse.json({ success: false, requiresCode: true })
    }

    const { data: membership } = await supabase
      .from('clinic_memberships')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!membership?.id) {
      return NextResponse.json({ success: false, requiresCode: true })
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    const userAgent = request.headers.get('user-agent') || null

    const outcome = await verifySmsCode({
      phone,
      code,
      attemptedByUserId: userId,
      attemptedByClinicId: clinicId,
      ip,
      userAgent,
      requestId,
    })

    if (!outcome.success) {
      return NextResponse.json({ success: false, requiresCode: true })
    }

    // ─── D7 wire-up: materialize the per-clinic identity record ────────────
    // Same pattern as verify-privacy-code. See that handler's comment block
    // for the full rationale. Errors are non-fatal — unlock succeeded; the
    // page degrades to "navigate to register" if patient_id is null.
    let patientId: string | null = null
    let globalPatientIdResolved: string | null = null
    try {
      const identity = await resolveIdentityForClinic(phone, clinicId)
      if (identity) {
        globalPatientIdResolved = identity.globalPatient.id
        const admin = createAdminClient('verify-sms-code-patient-lookup')
        const { data: legacyPatient } = await admin
          .from('patients')
          .select('id')
          .eq('global_patient_id', identity.globalPatient.id)
          .eq('clinic_id', clinicId)
          .maybeSingle()
        patientId = (legacyPatient as { id?: string } | null)?.id ?? null
      }
    } catch (err) {
      console.error('verify-sms-code: PCR materialization failed (non-fatal):', err)
    }

    // ─── Build 05 § B6: create patient_data_shares row(s) ────────────────
    // Same wiring as verify-privacy-code — one share per existing grantor
    // clinic. See that handler's comment block for the full multi-grantor
    // rationale.
    let createdShares: Array<{
      share_id: string
      grantor_clinic_id: string
      grantee_clinic_id: string
      expires_at: string | null
      granted_via: string
      idempotent_hit: boolean
    }> = []

    if (globalPatientIdResolved) {
      try {
        const admin = createAdminClient('verify-sms-code-grantor-lookup')
        const { data: pcrs } = await admin
          .from('patient_clinic_records')
          .select('clinic_id')
          .eq('global_patient_id', globalPatientIdResolved)
        const grantorClinicIds = (pcrs ?? [])
          .map((r) => (r as { clinic_id: string }).clinic_id)
          .filter((cid) => cid !== clinicId)

        if (grantorClinicIds.length > 0) {
          const result = await createSharesForGrantors({
            globalPatientId: globalPatientIdResolved,
            grantorClinicIds,
            granteeClinicId: clinicId,
            grantedVia: 'SMS_CODE',
            grantReason: requestId
              ? `verify-sms-code:${requestId}`
              : 'verify-sms-code',
            actorUserId: userId,
            actorKind: 'user',
          })

          createdShares = result.shares.map((s) => ({
            share_id: s.share_id,
            grantor_clinic_id: s.grantor_clinic_id,
            grantee_clinic_id: s.grantee_clinic_id,
            expires_at: s.expires_at,
            granted_via: s.granted_via,
            idempotent_hit: s.idempotent_hit,
          }))

          if (result.errors.length > 0) {
            console.error(
              'verify-sms-code: partial share creation failure',
              { errors: result.errors, gpid: globalPatientIdResolved, granteeClinicId: clinicId }
            )
          }
        }
      } catch (err) {
        console.error('verify-sms-code: share creation failed (non-fatal):', err)
      }
    }

    return NextResponse.json({
      success: true,
      global_patient_id: outcome.globalPatientId,
      patient_id: patientId,
      shares: createdShares,
    })
  } catch (error: any) {
    console.error('verify-sms-code error:', error)
    return toApiErrorResponse(error, 'SMS code verification failed')
  }
}
