export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getClinicContext, getClinicMembers } from '@shared/lib/data/clinic-context'

// ============================================================================
// GET /api/clinic/settings — Fetch clinic data for settings page
// ============================================================================

export async function GET() {
  try {
    const user = await requireApiRole('doctor')
    const context = await getClinicContext(user.id, 'doctor')

    if (!context) {
      return NextResponse.json({ error: 'No clinic found' }, { status: 404 })
    }

    const members = await getClinicMembers(context.clinicId)
    const doctors = members.filter(m => m.role === 'doctor' || m.role === 'OWNER' || m.role === 'DOCTOR')
    const staff = members.filter(m => m.role === 'frontdesk' || m.role === 'FRONT_DESK' || m.role === 'ASSISTANT')

    return NextResponse.json({
      clinicId: context.clinicId,
      clinicName: context.clinic.name,
      clinicUniqueId: context.clinic.uniqueId,
      doctors,
      staff,
      currentUserId: user.id,
      hasMultipleClinics: context.hasMultipleClinics,
      allClinicsCount: context.allClinics.length,
    })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to fetch clinic settings')
  }
}
