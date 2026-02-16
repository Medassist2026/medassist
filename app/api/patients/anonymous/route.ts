import { getAnonymousVisitCount, getOptOutStats } from '@/lib/data/patients'
import { requireRole } from '@/lib/auth/session'
import { NextResponse } from 'next/server'

/**
 * GET /api/visits/anonymous
 * 
 * Get anonymous visit statistics for current doctor
 */
export async function GET(request: Request) {
  try {
    const user = await requireRole('doctor')
    
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
    return NextResponse.json(
      { error: error.message || 'Failed to get statistics' },
      { status: 500 }
    )
  }
}
