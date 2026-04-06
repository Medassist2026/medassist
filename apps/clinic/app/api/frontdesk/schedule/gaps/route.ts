export const dynamic = 'force-dynamic'

/**
 * GET /api/frontdesk/schedule/gaps
 *
 * Returns the gap-aware schedule for a doctor on a given date.
 * Used by WalkInSheet to show:
 *  - The estimated slot time for a new walk-in patient
 *  - A warning when the available gap is smaller than the doctor's slot duration
 *  - A visual timeline of the doctor's day (appointments + walk-in slots + free gaps)
 *
 * Query params:
 *  doctorId  — required
 *  date      — optional, YYYY-MM-DD (defaults to today Cairo)
 */

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { ensureDoctorInFrontdeskClinic } from '@shared/lib/data/frontdesk-scope'
import { getGapAwareSchedule } from '@shared/lib/data/frontdesk'
import { createClient } from '@shared/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    await requireApiRole('frontdesk')
    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const doctorId = searchParams.get('doctorId')
    const date     = searchParams.get('date') ?? undefined   // YYYY-MM-DD or undefined

    if (!doctorId) {
      return NextResponse.json(
        { error: 'doctorId is required' },
        { status: 400 }
      )
    }

    // ── Scope check ──────────────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser()
    const doctorInScope = await ensureDoctorInFrontdeskClinic(
      supabase as any,
      user!.id,
      doctorId
    )
    if (!doctorInScope) {
      return NextResponse.json(
        { error: 'Doctor is outside your clinic scope' },
        { status: 403 }
      )
    }

    // ── Compute gap-aware schedule ───────────────────────────────────────────
    const schedule = await getGapAwareSchedule(doctorId, date)

    return NextResponse.json(schedule)
  } catch (error: any) {
    console.error('GET /api/frontdesk/schedule/gaps error:', error)
    return toApiErrorResponse(error, 'Failed to compute schedule gaps')
  }
}
