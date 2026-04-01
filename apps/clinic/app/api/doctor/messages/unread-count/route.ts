export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { NextResponse } from 'next/server'

/** Lightweight endpoint — returns only total unread count for nav badge */
export async function GET() {
  try {
    const user = await requireApiRole('doctor')
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('conversations')
      .select('doctor_unread_count')
      .eq('doctor_id', user.id)
      .gt('doctor_unread_count', 0)

    if (error) throw error

    const total = (data || []).reduce((sum: number, c: any) => sum + (c.doctor_unread_count || 0), 0)

    return NextResponse.json({ total_unread: total })
  } catch (error: any) {
    return toApiErrorResponse(error, 'Failed to fetch unread count')
  }
}
