export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse, getClinicRole } from '@shared/lib/auth/session'
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

    const [members, userRole] = await Promise.all([
      getClinicMembers(context.clinicId),
      getClinicRole(user.id, context.clinicId),
    ])

    // Normalize role strings (DB may store lowercase legacy values)
    const normalizeRole = (r: string) => r.toUpperCase()
    const doctors = members.filter(m => ['OWNER', 'DOCTOR'].includes(normalizeRole(m.role)))
    const staff   = members.filter(m => ['ASSISTANT', 'FRONT_DESK'].includes(normalizeRole(m.role)))

    return NextResponse.json({
      clinicId: context.clinicId,
      clinicName: context.clinic.name,
      clinicUniqueId: context.clinic.uniqueId,
      doctors,
      staff,
      currentUserId: user.id,
      userRole: (userRole || 'DOCTOR').toUpperCase(), // 'OWNER' | 'DOCTOR' | 'ASSISTANT' | 'FRONT_DESK'
      hasMultipleClinics: context.hasMultipleClinics,
      allClinicsCount: context.allClinics.length,
    })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to fetch clinic settings')
  }
}
