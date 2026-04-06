export const dynamic = 'force-dynamic'

/**
 * POST /api/frontdesk/queue/reorder
 *
 * Manually moves a queue item to a specific position (A1 feature).
 * Uses the reorder_queue_item Postgres function for atomic, race-safe
 * renumbering of all affected items.
 *
 * Body: { queueId: string, targetPosition: number }
 *
 * targetPosition is the desired queue_number (1-based).
 * Items between the current and target positions are shifted accordingly.
 */

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { ensureDoctorInFrontdeskClinic } from '@shared/lib/data/frontdesk-scope'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()
    const admin = createAdminClient('queue-reorder')

    const body = await request.json()
    const { queueId, targetPosition } = body

    if (!queueId || typeof targetPosition !== 'number' || targetPosition < 1) {
      return NextResponse.json(
        { error: 'queueId and targetPosition (≥1) are required' },
        { status: 400 }
      )
    }

    // Verify scope — frontdesk can only move items in their clinic's doctors' queues
    const { data: item, error: lookupErr } = await supabase
      .from('check_in_queue')
      .select('id, doctor_id, queue_number, status, patient:patients(full_name)')
      .eq('id', queueId)
      .maybeSingle()

    if (lookupErr) throw lookupErr
    if (!item) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
    }
    if (item.status !== 'waiting') {
      return NextResponse.json(
        { error: 'يمكن إعادة الترتيب للمرضى في الانتظار فقط' },
        { status: 409 }
      )
    }

    const doctorInScope = await ensureDoctorInFrontdeskClinic(
      supabase as any,
      user.id,
      item.doctor_id
    )
    if (!doctorInScope) {
      return NextResponse.json(
        { error: 'Queue item is outside your clinic scope' },
        { status: 403 }
      )
    }

    // Prevent moving to position 1 if someone is already in_progress
    // (position 1 effectively means "next after in-progress" — allow it)
    const { data: inProgress } = await admin
      .from('check_in_queue')
      .select('id, queue_number')
      .eq('doctor_id', item.doctor_id)
      .eq('status', 'in_progress')
      .maybeSingle()

    const minAllowedPosition = inProgress ? (inProgress.queue_number + 1) : 1

    if (targetPosition < minAllowedPosition) {
      return NextResponse.json(
        {
          error: `لا يمكن التقديم أمام المريض الحالي مع الطبيب — أقل ترتيب متاح: ${minAllowedPosition}`,
        },
        { status: 409 }
      )
    }

    // Execute atomic reorder
    const { error: reorderErr } = await admin.rpc('reorder_queue_item', {
      p_queue_id: queueId,
      p_target_queue_number: targetPosition,
    })

    if (reorderErr) throw reorderErr

    return NextResponse.json({
      success: true,
      moved: {
        patientName: (item.patient as any)?.full_name ?? 'مريض',
        from: item.queue_number,
        to: targetPosition,
      },
    })
  } catch (error: any) {
    console.error('Queue reorder error:', error)
    return toApiErrorResponse(error, 'Reorder failed')
  }
}
