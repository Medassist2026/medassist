export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiAuth, toApiErrorResponse } from '@shared/lib/auth/session'
import { revokeShare } from '@shared/lib/data/patient-shares'
import { createAdminClient } from '@shared/lib/supabase/admin'

/**
 * POST /api/patient/sharing/[shareId]/revoke — Build prompt 05 § B8.
 *
 * Body: { revoke_reason?: string }
 *
 * Auth: patient session. The handler verifies the share's
 * global_patient_id maps to a global_patients row claimed by this user
 * (claimed_user_id = auth.uid()). Without that check a patient could
 * revoke another patient's share by guessing a UUID — even though RLS
 * placeholder DENY-ALL prevents the share table READ outside the RPC,
 * the RPC itself is GRANTed to authenticated.
 *
 * Idempotent: revoking an already-revoked share returns success with
 * `changed: false`.
 *
 * Response:
 *   200 { success: true, share: { id, revoked_at, changed } }
 *   401 — not authenticated
 *   403 — share not owned by this patient
 *   404 — share not found
 */
export async function POST(
  request: Request,
  context: { params: { shareId: string } | Promise<{ shareId: string }> }
) {
  try {
    const session = await requireApiAuth()
    const userId = session.id

    // Next.js App Router exposes params as a Promise in newer versions —
    // handle both sync and async via Promise.resolve.
    const params = await Promise.resolve(context.params)
    const shareId = typeof params?.shareId === 'string' ? params.shareId : null
    if (!shareId) {
      return NextResponse.json({ error: 'shareId required' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const revokeReason: string | null =
      typeof body?.revoke_reason === 'string' ? body.revoke_reason.slice(0, 500) : null

    // Authz: confirm the share belongs to this patient.
    const admin = createAdminClient('patient-sharing-revoke-authz')
    const { data: share } = await admin
      .from('patient_data_shares')
      .select('id, global_patient_id')
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

    const result = await revokeShare({
      shareId,
      revokedByActorKind: 'user',
      actorUserId: userId,
      revokeReason,
    })

    return NextResponse.json({
      success: true,
      share: {
        id: result.share_id,
        revoked_at: result.revoked_at,
        changed: result.changed,
        reason: result.reason ?? null,
      },
    })
  } catch (error: any) {
    console.error('POST /patient/sharing/[shareId]/revoke error:', error)
    return toApiErrorResponse(error, 'Failed to revoke share')
  }
}
