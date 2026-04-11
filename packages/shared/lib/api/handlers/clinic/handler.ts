export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getClinicContext, getClinicMembers } from '@shared/lib/data/clinic-context'
import { NextResponse } from 'next/server'

/**
 * GET /api/clinic
 * Get the current user's active clinic info + members
 */
export async function GET() {
  try {
    const user = await requireApiRole(['doctor', 'frontdesk'])

    const context = await getClinicContext(user.id, user.role)

    if (!context) {
      return NextResponse.json({
        success: false,
        error: 'No clinic found for this user',
        hasClinic: false,
      }, { status: 404 })
    }

    const members = await getClinicMembers(context.clinicId)

    return NextResponse.json({
      success: true,
      hasClinic: true,
      clinic: context.clinic,
      allClinics: context.allClinics,
      hasMultipleClinics: context.hasMultipleClinics,
      members,
      doctorCount: members.filter(m => m.role === 'doctor').length,
      staffCount: members.filter(m => m.role === 'frontdesk').length,
    })
  } catch (error: any) {
    console.error('Get clinic error:', error)
    return toApiErrorResponse(error, 'Failed to fetch clinic info')
  }
}
