export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

/**
 * POST /api/clinic/set-active-doctor
 *
 * Set the active doctor for frontdesk/assistant users
 * Stores in cookie for session persistence
 */
export async function POST(request: Request) {
  try {
    const user = await requireApiRole(['frontdesk', 'doctor'])
    const { doctorId } = await request.json()

    if (!doctorId) {
      return NextResponse.json(
        { error: 'Doctor ID is required' },
        { status: 400 }
      )
    }

    // Verify the doctor is in the same clinic as the user
    const { ensureDoctorInFrontdeskClinic } = await import('@shared/lib/data/frontdesk-scope')
    const { createClient } = await import('@shared/lib/supabase/server')
    const supabase = await createClient()

    if (user.role === 'frontdesk') {
      const isInClinic = await ensureDoctorInFrontdeskClinic(supabase as any, user.id, doctorId)
      if (!isInClinic) {
        return NextResponse.json(
          { error: 'Doctor is not in your clinic' },
          { status: 403 }
        )
      }
    }

    // Set cookie
    const cookieStore = await cookies()
    cookieStore.set('active_doctor_id', doctorId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/'
    })

    return NextResponse.json({ success: true, doctorId })
  } catch (error: any) {
    console.error('Set active doctor error:', error)
    return toApiErrorResponse(error, 'Failed to set active doctor')
  }
}
