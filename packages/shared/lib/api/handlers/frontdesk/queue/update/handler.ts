export const dynamic = 'force-dynamic'

import { updateQueueStatus, completeQueueSession } from '@shared/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { ensureDoctorInFrontdeskClinic } from '@shared/lib/data/frontdesk-scope'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()

    const body = await request.json()
    const { queueId, status } = body

    if (!queueId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const { data: queueItem, error: queueLookupError } = await supabase
      .from('check_in_queue')
      .select('doctor_id')
      .eq('id', queueId)
      .maybeSingle()

    if (queueLookupError) throw queueLookupError

    if (!queueItem?.doctor_id) {
      return NextResponse.json(
        { error: 'Queue item not found' },
        { status: 404 }
      )
    }

    const doctorInScope = await ensureDoctorInFrontdeskClinic(
      supabase as any,
      user.id,
      queueItem.doctor_id
    )
    if (!doctorInScope) {
      return NextResponse.json(
        { error: 'Queue item is outside your clinic scope' },
        { status: 403 }
      )
    }

    // ── Completion path: drives the full window state machine ────────────────
    if (status === 'completed') {
      const sessionResult = await completeQueueSession(queueId)
      return NextResponse.json({ success: true, ...sessionResult })
    }

    // ── Non-completion transitions (waiting → in_progress, cancelled) ────────
    await updateQueueStatus(queueId, status as 'waiting' | 'in_progress' | 'cancelled')

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Queue update error:', error)
    return toApiErrorResponse(error, 'Update failed')
  }
}
