export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/patient/[gpId]/care-network — B07 Phase G Section 6.
 *
 * Clinic-side READ of a patient's active delegations (their "care
 * network" — currently-empowered caregivers). Pure informational; clinic
 * staff cannot create / accept / revoke delegations (Mo ruling 24 —
 * principal-side only).
 *
 * AUTHORIZATION
 *   The caller must be doctor or frontdesk AND have a doctor_patient_
 *   relationship with the patient at this clinic. Pre-Phase-G v2 RLS
 *   (mig 114-116) already gates the underlying tables via
 *   `is_authorized_actor_on` + `can_patient_access_global_patient`; the
 *   handler layer's explicit relationship check is defense-in-depth and
 *   ensures we return a clean 403 instead of an empty list when the
 *   caller has no scope on this patient.
 *
 * RESPONSE (200):
 *   {
 *     success: true,
 *     delegations: Array<{
 *       id, principal_global_patient_id,
 *       delegate_user_id, delegate_global_patient_id,
 *       delegate_display_name, capabilities,
 *       granted_at, accepted_at, expires_at, auto_renew
 *     }>,
 *     count: number
 *   }
 *
 * D-068 alignment: a clinic only sees this patient's care network if
 * the clinic has scope on the patient (relationship row). Cross-clinic
 * data leak is prevented at the relationship check; the data layer
 * function does NOT filter by clinic itself (a delegation is a
 * patient-network artifact, not a clinic-scoped one).
 */

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { listActiveDelegationsForGlobalPatient } from '@shared/lib/data/delegations'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gpId: string }> }
) {
  try {
    const user = await requireApiRole(['doctor', 'frontdesk'])
    const { gpId } = await params

    if (!gpId) {
      return NextResponse.json(
        { success: false, error: 'gpId is required' },
        { status: 400 }
      )
    }

    const admin = createAdminClient('care-network-scope-check')

    // ── Scope check: caller must have an active relationship with this
    //    patient (via doctor_patient_relationships keyed by the legacy
    //    patients.id) OR an explicit PCR at the caller's clinic. We use
    //    the legacy patients-row path because the entire clinic-side
    //    surface today indexes through patients.id; the gp-id input is
    //    canonical (B07 v2) but the relationship gate hangs off patients.
    //
    // For a minor gp this works iff Phase G Section 1 has run for this
    // (gp, clinic) pair — the (gp → patients → DPR) chain exists.
    //
    // Returns 404 (not 403) when no relationship exists to avoid
    // disclosing whether the patient is known to other clinics.
    const { data: patientsForGp } = await admin
      .from('patients')
      .select('id, clinic_id')
      .eq('global_patient_id', gpId)
    const patientRows = (patientsForGp ?? []) as Array<{ id: string; clinic_id: string }>
    const patientIds = patientRows.map((p) => p.id)
    if (patientIds.length === 0) {
      // The minor gp has no clinic presence yet — nothing for this clinic
      // to surface. Treat as empty rather than 404 because the gp itself
      // is real; the absence is a clinic-presence absence, not an
      // identity-not-found.
      return NextResponse.json({ success: true, delegations: [], count: 0 })
    }

    let inScope = false
    if (user.role === 'doctor') {
      const { data: relRows } = await admin
        .from('doctor_patient_relationships')
        .select('id')
        .in('patient_id', patientIds)
        .eq('doctor_id', user.id)
        .limit(1)
      inScope = ((relRows ?? []) as Array<{ id: string }>).length > 0
    } else {
      // frontdesk: any patients row at the frontdesk's clinic counts.
      const { data: membership } = await admin
        .from('clinic_memberships')
        .select('clinic_id')
        .eq('user_id', user.id)
        .in('role', ['FRONT_DESK', 'ASSISTANT', 'OWNER'])
        .eq('status', 'ACTIVE')
      const frontdeskClinicIds = ((membership ?? []) as Array<{ clinic_id: string }>).map(
        (m) => m.clinic_id
      )
      inScope = patientRows.some((p) => frontdeskClinicIds.includes(p.clinic_id))
    }

    if (!inScope) {
      return NextResponse.json(
        { success: false, error: 'Patient not found in your scope' },
        { status: 404 }
      )
    }

    const delegations = await listActiveDelegationsForGlobalPatient(gpId)

    return NextResponse.json({
      success: true,
      delegations,
      count: delegations.length,
    })
  } catch (error: any) {
    console.error('GET /api/admin/patient/[gpId]/care-network error:', error)
    return toApiErrorResponse(error, 'Failed to list care network')
  }
}
