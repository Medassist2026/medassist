export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getActiveClinicIdFromCookies } from '@shared/lib/data/clinic-context'
import { getEffectiveVisibility, getPatientVisibility } from '@shared/lib/data/visibility'
import { createAdminClient } from '@shared/lib/supabase/admin'

/**
 * GET /api/clinic/patient-visibility?patientId=X — Get visibility status for a patient
 */
export async function GET(request: Request) {
  try {
    const user = await requireApiRole(['doctor', 'frontdesk'])
    const { searchParams } = new URL(request.url)
    const patientId = searchParams.get('patientId')

    if (!patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 })
    }

    const clinicId = await getActiveClinicIdFromCookies()
    if (!clinicId) {
      return NextResponse.json({ error: 'No active clinic' }, { status: 400 })
    }

    const effective = await getEffectiveVisibility(clinicId, patientId)
    const rules = await getPatientVisibility(clinicId, patientId)

    // Get doctor names for shared doctors
    const doctorIds = rules
      .filter(r => r.grantee_user_id)
      .map(r => r.grantee_user_id!)

    let doctorNames: Record<string, string> = {}
    if (doctorIds.length > 0) {
      const admin = createAdminClient('visibility-names')
      const { data: doctors } = await admin
        .from('doctors')
        .select('id, full_name')
        .in('id', doctorIds)
      if (doctors) {
        doctorNames = Object.fromEntries(doctors.map(d => [d.id, d.full_name || 'Doctor']))
      }
    }

    return NextResponse.json({
      success: true,
      mode: effective.mode,
      sharedWith: effective.sharedWith.map(id => ({
        id,
        name: doctorNames[id] || 'Doctor',
      })),
      rules: rules.map(r => ({
        id: r.id,
        mode: r.mode,
        consent: r.consent,
        grantee_user_id: r.grantee_user_id,
        grantee_name: r.grantee_user_id ? doctorNames[r.grantee_user_id] : null,
        created_at: r.created_at,
      })),
    })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to get visibility')
  }
}
