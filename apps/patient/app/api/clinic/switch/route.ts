import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { validateDoctorClinicAccess } from '@shared/lib/data/clinic-context'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * POST /api/clinic/switch
 * Switch the active clinic for the current user
 * Body: { clinicId: string }
 */
export async function POST(request: Request) {
  try {
    const user = await requireApiRole(['doctor', 'frontdesk'])
    const body = await request.json()
    const { clinicId } = body

    if (!clinicId) {
      return NextResponse.json(
        { error: 'clinicId is required' },
        { status: 400 }
      )
    }

    // Validate user has access to this clinic
    if (user.role === 'doctor') {
      const hasAccess = await validateDoctorClinicAccess(user.id, clinicId)
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'You do not have access to this clinic' },
          { status: 403 }
        )
      }
    }

    // Set the active clinic cookie
    const cookieStore = await cookies()
    cookieStore.set('active_clinic_id', clinicId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    })

    return NextResponse.json({
      success: true,
      clinicId,
      message: 'Clinic switched successfully',
    })
  } catch (error: any) {
    console.error('Clinic switch error:', error)
    return toApiErrorResponse(error, 'Failed to switch clinic')
  }
}
