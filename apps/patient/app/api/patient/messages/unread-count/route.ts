export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Lightweight endpoint — returns the total unread-message count for the
 * logged-in patient. Used by PatientBottomNav + DesktopSidebar badges.
 *
 * Mirrors /api/doctor/messages/unread-count, but reads the
 * `patient_unread_count` column from `conversations` scoped to the user.
 */
export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('conversations')
      .select('patient_unread_count')
      .eq('patient_id', user.id)
      .gt('patient_unread_count', 0)

    if (error) throw error

    const total = (data || []).reduce(
      (sum: number, c: any) => sum + (c.patient_unread_count || 0),
      0
    )

    return NextResponse.json({ total_unread: total })
  } catch (error: any) {
    return toApiErrorResponse(error, 'Failed to fetch unread count')
  }
}
