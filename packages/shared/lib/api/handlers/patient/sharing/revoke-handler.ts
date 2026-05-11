export const dynamic = 'force-dynamic'

/**
 * POST /api/patient/sharing/[shareId]/revoke — B07 Phase F.5 cross-context.
 *
 * Body: { revoke_reason?: string }
 *
 * Authorization (Phase F.5):
 *   - Resolves the share's `global_patient_id` and calls
 *     `requireAuthorityOver` to confirm self or guardian authority.
 *   - Delegate basis REJECTED — `consent_to_share` is post-MVP
 *     (Mo ruling 4).
 *
 * Idempotent: revoking an already-revoked share returns success with
 * `changed: false`.
 */

import { NextResponse } from 'next/server'
import {
  requireApiAuth,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import { revokeShare } from '@shared/lib/data/patient-shares'
import { createAdminClient } from '@shared/lib/supabase/admin'
import {
  requireAuthorityOver,
  AuthorityError,
} from '@shared/lib/auth/authority'
import { DelegateNotAuthorizedError } from '@shared/lib/auth/patient-context'

export async function POST(
  request: Request,
  context: { params: { shareId: string } | Promise<{ shareId: string }> }
) {
  try {
    const session = await requireApiAuth()
    const userId = session.id

    const params = await Promise.resolve(context.params)
    const shareId =
      typeof params?.shareId === 'string' ? params.shareId : null
    if (!shareId) {
      return NextResponse.json(
        { error: 'shareId required' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const revokeReason: string | null =
      typeof body?.revoke_reason === 'string'
        ? body.revoke_reason.slice(0, 500)
        : null

    // Resolve share → subject gp; gate via requireAuthorityOver.
    const admin = createAdminClient('patient-sharing-revoke-authz')
    const { data: share } = await admin
      .from('patient_data_shares')
      .select('id, global_patient_id')
      .eq('id', shareId)
      .maybeSingle()
    if (!share) {
      return NextResponse.json(
        { error: 'Share not found' },
        { status: 404 }
      )
    }
    const subjectGpId = (share as { global_patient_id: string })
      .global_patient_id

    const auth = await requireAuthorityOver(subjectGpId, userId)
    if (auth.basis === 'delegated_by_principal') {
      throw new DelegateNotAuthorizedError(
        'Revoking shares is not available for delegated authority ' +
          '(consent_to_share is post-MVP per Mo ruling 4)'
      )
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
    if (error instanceof AuthorityError) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      )
    }
    console.error(
      'POST /patient/sharing/[shareId]/revoke error:',
      error
    )
    return toApiErrorResponse(error, 'Failed to revoke share')
  }
}
