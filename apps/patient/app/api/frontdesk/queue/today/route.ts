import { getTodayQueue } from '@shared/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getClinicContext } from '@shared/lib/data/clinic-context'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole('frontdesk')

    // Get clinic context to ensure doctor scope
    const clinicContext = await getClinicContext(user.id, 'frontdesk')
    if (!clinicContext) {
      return NextResponse.json(
        { error: 'Clinic context not found' },
        { status: 403 }
      )
    }

    // Fetch today's queue for all doctors in the clinic
    const queue = await getTodayQueue()

    return NextResponse.json({
      success: true,
      queue
    })

  } catch (error: any) {
    console.error('Queue fetch error:', error)
    return toApiErrorResponse(error, 'Failed to fetch queue')
  }
}
