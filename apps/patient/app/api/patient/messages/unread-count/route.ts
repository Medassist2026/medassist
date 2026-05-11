export const dynamic = 'force-dynamic'

/**
 * GET /api/patient/messages/unread-count — B07 Phase F.5 cross-context.
 *
 * Lightweight endpoint — returns the total unread-message count for the
 * active gp context. Used by PatientBottomNav + DesktopSidebar badges.
 *
 * Mirrors /api/doctor/messages/unread-count, but reads the
 * `patient_unread_count` column from `conversations` scoped to the
 * resolved subject.
 */

import {
  requireApiRole,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { resolvePatientContext } from '@shared/lib/auth/patient-context'

export async function GET(request: Request) {
  try {
    const user = await requireApiRole('patient')
    const ctx = await resolvePatientContext({
      request,
      userId: user.id,
    })

    if (ctx.resolvedPatientId === null) {
      return NextResponse.json({ total_unread: 0 })
    }

    const supabase = createAdminClient('patient-messages-unread-count')

    const { data, error } = await supabase
      .from('conversations')
      .select('patient_unread_count')
      .eq('patient_id', ctx.resolvedPatientId)
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
