export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'

// ============================================================================
// GET /api/doctor/settings — Fetch doctor's fee settings
// ============================================================================

export async function GET() {
  try {
    const user = await requireApiRole('doctor')
    const supabase = createAdminClient('doctor-settings')

    const { data, error } = await supabase
      .from('doctors')
      .select('consultation_fee_egp, followup_fee_egp, followup_window_days')
      .eq('id', user.id)
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }

    return NextResponse.json({
      consultation_fee_egp: data?.consultation_fee_egp || 0,
      followup_fee_egp: data?.followup_fee_egp || 0,
      followup_window_days: data?.followup_window_days || 14,
    })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to fetch settings')
  }
}

// ============================================================================
// POST /api/doctor/settings — Update doctor's fee settings
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiRole('doctor')
    const body = await request.json()

    const { consultation_fee_egp, followup_fee_egp, followup_window_days } = body

    // Validate
    if (consultation_fee_egp !== undefined && (typeof consultation_fee_egp !== 'number' || consultation_fee_egp < 0)) {
      return NextResponse.json({ error: 'Invalid consultation fee' }, { status: 400 })
    }
    if (followup_fee_egp !== undefined && (typeof followup_fee_egp !== 'number' || followup_fee_egp < 0)) {
      return NextResponse.json({ error: 'Invalid follow-up fee' }, { status: 400 })
    }
    if (followup_window_days !== undefined && (typeof followup_window_days !== 'number' || followup_window_days < 1 || followup_window_days > 90)) {
      return NextResponse.json({ error: 'Follow-up window must be 1-90 days' }, { status: 400 })
    }

    const supabase = createAdminClient('doctor-settings')

    const updates: Record<string, any> = {}
    if (consultation_fee_egp !== undefined) updates.consultation_fee_egp = Math.round(consultation_fee_egp)
    if (followup_fee_egp !== undefined) updates.followup_fee_egp = Math.round(followup_fee_egp)
    if (followup_window_days !== undefined) updates.followup_window_days = Math.round(followup_window_days)

    const { error } = await supabase
      .from('doctors')
      .update(updates)
      .eq('id', user.id)

    if (error) {
      console.error('Failed to update doctor settings:', error)
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to save settings')
  }
}
