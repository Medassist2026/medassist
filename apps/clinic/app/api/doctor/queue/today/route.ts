export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getTodayQueue } from '@shared/lib/data/frontdesk'
import { NextResponse } from 'next/server'

/**
 * GET /api/doctor/queue/today
 *
 * P4: Returns today's active check-in queue for the currently authenticated doctor.
 * Used by the doctor dashboard to show walk-in patients checked in by frontdesk,
 * with "فتح الجلسة" buttons that deep-link into /doctor/session?patientId=xxx.
 *
 * Only returns waiting / in_progress entries (active queue).
 * Scoped strictly to this doctor — no cross-doctor leakage.
 */
export async function GET() {
  try {
    const user = await requireApiRole('doctor')

    // getTodayQueue accepts a single doctorId — scoped to this doctor only
    const queue = await getTodayQueue(user.id)

    return NextResponse.json({ success: true, queue })
  } catch (error: any) {
    return toApiErrorResponse(error, 'Failed to fetch queue')
  }
}
