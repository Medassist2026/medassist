export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'
import { verifyPrivacyCode } from '@shared/lib/data/privacy-codes'
import { resolveIdentityForClinic } from '@shared/lib/data/identity-resolution'
import { createSharesForGrantors } from '@shared/lib/data/patient-shares'
import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'

/**
 * POST /api/patients/verify-privacy-code — Build prompt 04 (B9) +
 *   Build prompt 05 (B6, share creation wired).
 *
 * Body: { phone: string, code: string, clinic_id: string, request_id?: string }
 *
 * Front-desk verifies the patient's 6-character privacy code. The DB-side
 * verify_privacy_code (mig 087) does the three-step check (per-clinic
 * rate limit, per-code lockout, bcrypt compare) and returns either:
 *   { success: true, globalPatientId }
 *   { success: false, requiresCode: true }   // uniform on every failure
 *
 * On success (Build 05 wiring): we create one patient_data_shares row
 * per existing grantor clinic. If the patient has records at clinics A,
 * B, C and verifies at clinic D, this writes A→D, B→D, C→D — three
 * directional grants. Each share is its own DB transaction (audit row +
 * share row atomic per-share, per mig 090). See Build 05 results § 3
 * for the multi-grantor decision rationale (option (b) — independent
 * per-grantor shares so a later A→D revoke doesn't tear down B→D).
 *
 * Response shape (Build 05):
 *   { success: true, global_patient_id, patient_id, shares: [...] }
 *
 * The TS rate-limit (`enforceRateLimit`) is a coarse IP-level guard;
 * the DB function enforces the exact per-(clinic,patient) and per-code
 * limits.
 */
export async function POST(request: Request) {
  try {
    const rate = await enforceRateLimit(request, 'patient-verify-privacy-code', 60, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    const session = await requireApiRole(['doctor', 'frontdesk'])

    const body = await request.json().catch(() => ({}))
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''
    const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : ''
    const clinicId = typeof body?.clinic_id === 'string' ? body.clinic_id : null
    const requestId = typeof body?.request_id === 'string' ? body.request_id : null

    if (!phone || !code || !clinicId) {
      // Uniform failure — same shape as a wrong-code attempt. Don't 4xx
      // the front-end out into a different error path on missing fields;
      // do log a clear server-side error.
      console.warn('verify-privacy-code: missing fields', {
        hasPhone: !!phone,
        hasCode: !!code,
        hasClinic: !!clinicId,
      })
      return NextResponse.json({ success: false, requiresCode: true })
    }

    // Resolve the requesting user from the session. We trust the session
    // for the user_id; the clinic_id is body-supplied because the same
    // user may belong to multiple clinics.
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth?.user?.id
    if (!userId) {
      return NextResponse.json({ success: false, requiresCode: true })
    }

    // Optional: assert the user is a member of the named clinic. The DB
    // RLS for clinic_memberships already enforces this elsewhere; here
    // we add a belt-and-suspenders check to prevent a user from
    // attempting on behalf of a clinic they don't belong to.
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

    const outcome = await verifyPrivacyCode({
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
    // verify_privacy_code (mig 087) returns global_patient_id but does NOT
    // create the patient_clinic_records row this clinic needs to attach
    // downstream visit data. Without this step, a successful unlock leaves
    // the front-desk page with a gpid but no per-clinic patient context to
    // proceed with check-in. resolveIdentityForClinic is idempotent: if a
    // PCR already exists for (gpid, clinicId) it bumps last_seen_at; if
    // not, it creates one and the mig 074 trigger writes the
    // PATIENT_CLINIC_RECORD_CREATED audit row.
    //
    // We additionally look up the legacy patients.id for (gpid, clinicId)
    // via patients.global_patient_id (backfilled by mig 074). If a row
    // exists, we surface it so the page can hand off into the existing
    // check-in flow (which keys on patients.id). If no row exists, the
    // page navigates the front desk into the existing register flow with
    // the phone pre-filled — that path will mint the patients row +
    // doctor_patient_relationship and then queue the patient.
    //
    // Errors here are logged but NOT surfaced as failures: the unlock
    // itself succeeded (audit + global_patient_id are valid). Allowing
    // the response through with a null patient_id keeps the privacy
    // contract intact and lets the page degrade gracefully.
    let patientId: string | null = null
    let globalPatientIdResolved: string | null = null
    try {
      const identity = await resolveIdentityForClinic(phone, clinicId)
      if (identity) {
        globalPatientIdResolved = identity.globalPatient.id
        const admin = createAdminClient('verify-privacy-code-patient-lookup')
        const { data: legacyPatient } = await admin
          .from('patients')
          .select('id')
          .eq('global_patient_id', identity.globalPatient.id)
          .eq('clinic_id', clinicId)
          .maybeSingle()
        patientId = (legacyPatient as { id?: string } | null)?.id ?? null
      }
    } catch (err) {
      console.error('verify-privacy-code: PCR materialization failed (non-fatal):', err)
    }

    // ─── Build 05 § B6: create patient_data_shares row(s) ────────────────
    // Multi-grantor decision (Build 05 results § 3, option b): every
    // existing PCR for this gpid that is NOT the verifying clinic becomes
    // a grantor. Verifying clinic = grantee. We write one share per
    // grantor; each share's audit + row is atomic per mig 090. Failures
    // on individual shares are logged but don't fail the verify response —
    // verify_privacy_code already succeeded and the gpid is valid; partial
    // share failure is strictly better than rolling back a successful
    // privacy-code verification.
    //
    // Note: if the patient ONLY has a PCR at the verifying clinic (or has
    // none yet), no shares are created — the patient is solo at this
    // clinic; cross-clinic visibility doesn't apply. createSharesForGrantors
    // skips grantor==grantee silently per the schema CHECK.
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
        const admin = createAdminClient('verify-privacy-code-grantor-lookup')
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
            grantedVia: 'PRIVACY_CODE',
            grantReason: requestId
              ? `verify-privacy-code:${requestId}`
              : 'verify-privacy-code',
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
              'verify-privacy-code: partial share creation failure',
              { errors: result.errors, gpid: globalPatientIdResolved, granteeClinicId: clinicId }
            )
          }
        }
      } catch (err) {
        // Defensive: any unexpected error (FK violation, network blip)
        // logs but does not fail the verify response. The verify already
        // succeeded; subsequent work to materialize shares can be retried.
        console.error('verify-privacy-code: share creation failed (non-fatal):', err)
      }
    }

    return NextResponse.json({
      success: true,
      global_patient_id: outcome.globalPatientId,
      patient_id: patientId,
      shares: createdShares,
    })
  } catch (error: any) {
    console.error('verify-privacy-code error:', error)
    return toApiErrorResponse(error, 'Privacy code verification failed')
  }
}
