export const dynamic = 'force-dynamic'

import { getTodayQueue, getQueueByDateRange } from '@shared/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getClinicContext } from '@shared/lib/data/clinic-context'
import {
  cairoNDaysAgoStart,
  cairoParts,
  cairoTodayEnd,
  cairoTodayStart,
} from '@shared/lib/date/cairo-date'
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

    // For reports: compute date range and fetch all statuses.
    // Boundaries flip on Cairo midnight so a queue entry from 23:30
    // Cairo on the Saturday of "this week" is grouped correctly
    // regardless of the server's local TZ.
    const now = new Date()
    let dateFrom: Date
    let dateTo: Date

    if (range === 'yesterday') {
      dateFrom = cairoNDaysAgoStart(1, now)         // 00:00 Cairo yesterday
      dateTo   = new Date(cairoTodayStart(now).getTime() - 1) // 23:59:59.999 Cairo yesterday
    } else if (range === 'week') {
      const cp = cairoParts(now)
      const cairoWeekday      = new Date(Date.UTC(cp.year, cp.month - 1, cp.day)).getUTCDay() // 0=Sun … 6=Sat
      const daysSinceSaturday = (cairoWeekday + 1) % 7
      dateFrom = cairoNDaysAgoStart(daysSinceSaturday, now)
      dateTo   = cairoTodayEnd(now)
    } else {
      // fallback to today (all statuses)
      dateFrom = cairoTodayStart(now)
      dateTo   = cairoTodayEnd(now)
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
