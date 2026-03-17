import { getAnonymousVisitCount, getOptOutStats } from '@shared/lib/data/patients'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { NextResponse } from 'next/server'

/**
 * GET /api/visits/anonymous
 * 
 * Get anonymous visit statistics for current doctor
 */
export async function GET(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')
    
    // Get today's count
    const todayCount = await getAnonymousVisitCount(user.id)
    
    // Get period statistics
    const stats = await getOptOutStats(user.id, days)
    
    return NextResponse.json({
      today: todayCount,
      period: {
        days,
        total: stats.total,
        byReason: stats.byReason
      }
    })
    
  } catch (error: any) {
    console.error('Get anonymous stats error:', error)
    return toApiErrorResponse(error, 'Failed to get statistics')
  }
}
