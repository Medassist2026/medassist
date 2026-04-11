export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getPatientSharingStatus, revokeVisibility } from '@shared/lib/data/visibility'
import { logAuditEvent } from '@shared/lib/data/audit'
import { createAdminClient } from '@shared/lib/supabase/admin'

/**
 * GET /api/patient/sharing — Get all active visibility grants for patient
 */
export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const { grants } = await getPatientSharingStatus(user.id)

    // Enrich with doctor/clinic names
    const admin = createAdminClient('patient-sharing')

    const clinicIds = [...new Set(grants.map(g => g.clinic_id))]
    const doctorIds = [...new Set(grants.map(g => g.grantee_user_id).filter(Boolean) as string[])]

    let clinicMap: Record<string, string> = {}
    let doctorMap: Record<string, string> = {}

    if (clinicIds.length > 0) {
      const { data: clinics } = await admin
        .from('clinics')
        .select('id, name')
        .in('id', clinicIds)
      if (clinics) {
        clinicMap = Object.fromEntries(clinics.map(c => [c.id, c.name]))
      }
    }

    if (doctorIds.length > 0) {
      const { data: doctors } = await admin
        .from('doctors')
        .select('id, full_name')
        .in('id', doctorIds)
      if (doctors) {
        doctorMap = Object.fromEntries(doctors.map(d => [d.id, d.full_name || 'Doctor']))
      }
    }

    const enrichedGrants = grants.map(g => ({
      ...g,
      clinic_name: clinicMap[g.clinic_id] || 'Unknown Clinic',
      doctor_name: g.grantee_user_id ? (doctorMap[g.grantee_user_id] || 'Doctor') : null,
    }))

    return NextResponse.json({ success: true, grants: enrichedGrants })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to get sharing info')
  }
}

/**
 * DELETE /api/patient/sharing — Revoke a specific visibility grant
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireApiRole('patient')
    const { visibilityId } = await request.json()

    if (!visibilityId) {
      return NextResponse.json({ error: 'Visibility ID required' }, { status: 400 })
    }

    // Verify the grant belongs to this patient
    const admin = createAdminClient('patient-sharing')
    const { data: grant } = await admin
      .from('patient_visibility')
      .select('patient_id')
      .eq('id', visibilityId)
      .single()

    if (!grant || grant.patient_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { error } = await revokeVisibility(visibilityId)
    if (error) {
      return NextResponse.json({ error: 'Failed to revoke' }, { status: 500 })
    }

    logAuditEvent({
      actorUserId: user.id,
      action: 'REVOKE_SHARE',
      entityType: 'patient_visibility',
      entityId: visibilityId,
    })

    return NextResponse.json({ success: true, message: 'Access revoked' })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to revoke sharing')
  }
}
