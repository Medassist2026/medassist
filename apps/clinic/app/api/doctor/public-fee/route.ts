export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'

// ============================================================================
// GET /api/doctor/public-fee?doctorId=xxx — Frontdesk-accessible fee lookup
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Allow both doctor and frontdesk roles
    await requireApiRole(['frontdesk', 'doctor'])

    const { searchParams } = new URL(request.url)
    const doctorId = searchParams.get('doctorId')

    if (!doctorId) {
      return NextResponse.json({ error: 'doctorId is required' }, { status: 400 })
    }

    const supabase = createAdminClient('public-fee')

    const { data, error } = await supabase
      .from('doctors')
      .select('consultation_fee_egp, followup_fee_egp, followup_window_days')
      .eq('id', doctorId)
      .single()

    if (error) {
      return NextResponse.json({
        consultation_fee_egp: 0,
        followup_fee_egp: 0,
        followup_window_days: 14,
      })
    }

    return NextResponse.json({
      consultation_fee_egp: data?.consultation_fee_egp || 0,
      followup_fee_egp: data?.followup_fee_egp || 0,
      followup_window_days: data?.followup_window_days || 14,
    })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to fetch doctor fee')
  }
}
