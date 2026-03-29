export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/doctor-stats?period=30d
 *
 * Returns aggregated analytics for the authenticated doctor.
 * Strictly scoped to the caller's own data — no cross-doctor access possible.
 *
 * Query params:
 *   period  — '7d' | '30d' | '90d' | 'all'  (default: '30d')
 *
 * Response shape: DoctorStatsResult (see doctor-stats.ts)
 *
 * Feature 6 — Doctor Private Analytics (backend-only, no frontend yet)
 */

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getDoctorStats, type StatsPeriod } from '@shared/lib/analytics/doctor-stats'
import { NextRequest, NextResponse } from 'next/server'

const VALID_PERIODS: StatsPeriod[] = ['7d', '30d', '90d', 'all']

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiRole('doctor')

    // Validate period
    const raw    = request.nextUrl.searchParams.get('period') || '30d'
    const period = VALID_PERIODS.includes(raw as StatsPeriod) ? (raw as StatsPeriod) : '30d'

    const stats = await getDoctorStats(user.id, period)

    return NextResponse.json(stats)
  } catch (error: any) {
    console.error('doctor-stats error:', error)
    return toApiErrorResponse(error, 'Failed to compute analytics')
  }
}
