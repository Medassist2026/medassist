import { getTodayQueue, getQueueByDateRange } from '@shared/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getClinicContext } from '@shared/lib/data/clinic-context'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/frontdesk/queue/today
 *
 * Query params:
 *   range: 'today' | 'yesterday' | 'week' (default: today)
 *         'today' returns active queue (waiting/in_progress only)
 *         'yesterday'/'week' returns all statuses (for reports)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireApiRole('frontdesk')

    const clinicContext = await getClinicContext(user.id, 'frontdesk')
    if (!clinicContext) {
      return NextResponse.json(
        { error: 'Clinic context not found' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || 'today'

    // For 'today' with no range param, use optimized active-only query
    if (range === 'today') {
      const queue = await getTodayQueue(clinicContext.clinicDoctorIds)
      return NextResponse.json({ success: true, queue })
    }

    // For reports: compute date range and fetch all statuses
    const now = new Date()
    let dateFrom: Date
    let dateTo: Date

    if (range === 'yesterday') {
      dateFrom = new Date(now)
      dateFrom.setDate(dateFrom.getDate() - 1)
      dateFrom.setHours(0, 0, 0, 0)
      dateTo = new Date(now)
      dateTo.setDate(dateTo.getDate() - 1)
      dateTo.setHours(23, 59, 59, 999)
    } else if (range === 'week') {
      const dayOfWeek = now.getDay()
      const daysSinceSaturday = (dayOfWeek + 1) % 7
      dateFrom = new Date(now)
      dateFrom.setDate(dateFrom.getDate() - daysSinceSaturday)
      dateFrom.setHours(0, 0, 0, 0)
      dateTo = new Date(now)
      dateTo.setHours(23, 59, 59, 999)
    } else {
      // fallback to today (all statuses)
      dateFrom = new Date(now)
      dateFrom.setHours(0, 0, 0, 0)
      dateTo = new Date(now)
      dateTo.setHours(23, 59, 59, 999)
    }

    const queue = await getQueueByDateRange(
      clinicContext.clinicDoctorIds,
      dateFrom,
      dateTo
    )

    return NextResponse.json({ success: true, queue })

  } catch (error: any) {
    console.error('Queue fetch error:', error)
    return toApiErrorResponse(error, 'Failed to fetch queue')
  }
}
