export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiAuth, toApiErrorResponse } from '@shared/lib/auth/session'
import { extendShare, type ExtendDuration } from '@shared/lib/data/patient-shares'
import { createAdminClient } from '@shared/lib/supabase/admin'

const VALID_DURATIONS: ExtendDuration[] = ['90_DAYS', '1_YEAR', 'PERMANENT']

/**
 * POST /api/patient/sharing/[shareId]/extend — Build prompt 05 § B9.
 *
 * Body: { duration: '90_DAYS' | '1_YEAR' | 'PERMANENT' }
 *
 * Auth: patient session; ownership verified the same way as revoke.
 *
 * Behavior:
 *   - Extending a permanent share is a no-op (changed: false,
 *     reason: 'already_permanent').
 *   - Extending to a duration that would SHORTEN the current expiry is
 *     a no-op (changed: false, reason: 'would_shorten'). NEVER shortens.
 *   - Extending a revoked share THROWS at the DB level, surfaced as 409.
 */
export async function POST(
  request: Request,
  context: { params: { shareId: string } | Promise<{ shareId: string }> }
) {
  try {
    const session = await requireApiAuth()
    const userId = session.id

    const params = await Promise.resolve(context.params)
    const shareId = typeof params?.shareId === 'string' ? params.shareId : null
    if (!shareId) {
      return NextResponse.json({ error: 'shareId required' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const duration = typeof body?.duration === 'string' ? body.duration : ''
    if (!VALID_DURATIONS.includes(duration as ExtendDuration)) {
      return NextResponse.json(
        { error: 'duration must be one of: 90_DAYS, 1_YEAR, PERMANENT' },
        { status: 400 }
      )
    }

    // Authz: confirm the share belongs to this patient.
    const admin = createAdminClient('patient-sharing-extend-authz')
    const { data: share } = await admin
      .from('patient_data_shares')
      .select('id, global_patient_id, revoked_at')
      .eq('id', shareId)
      .maybeSingle()
    if (!share) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 })
    }
    const { data: gp } = await admin
      .from('global_patients')
      .select('claimed_user_id')
      .eq('id', (share as { global_patient_id: string }).global_patient_id)
      .maybeSingle()
    const claimedUserId = (gp as { claimed_user_id?: string } | null)?.claimed_user_id ?? null
    if (claimedUserId !== userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Surface the "extend on revoked" case as 409 Conflict before the
    // DB throws (cleaner client UX than parsing an internal error).
    if ((share as { revoked_at?: string | null }).revoked_at) {
      return NextResponse.json(
        { error: 'Share is revoked; cannot extend' },
        { status: 409 }
      )
    }

    try {
      const result = await extendShare({
        shareId,
        duration: duration as ExtendDuration,
        actorUserId: userId,
      })

      return NextResponse.json({
        success: true,
        share: {
          id: result.share_id,
          expires_at: result.expires_at,
          previous_expires_at: result.previous_expires_at,
          changed: result.changed,
          reason: result.reason ?? null,
          duration: result.duration ?? duration,
        },
      })
    } catch (err: any) {
      // DB-level invariants (e.g. share was revoked between our check + the
      // FOR UPDATE SELECT inside the function). Race-safe surface as 409.
      const msg = (err?.message ?? '').toLowerCase()
      if (msg.includes('revoked')) {
        return NextResponse.json(
          { error: 'Share is revoked; cannot extend' },
          { status: 409 }
        )
      }
      throw err
    }
  } catch (error: any) {
    console.error('POST /patient/sharing/[shareId]/extend error:', error)
    return toApiErrorResponse(error, 'Failed to extend share')
  }
}
