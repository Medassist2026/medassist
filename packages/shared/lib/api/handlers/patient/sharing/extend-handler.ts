export const dynamic = 'force-dynamic'

/**
 * POST /api/patient/sharing/[shareId]/extend — B07 Phase F.5 cross-context.
 *
 * Body: { duration: '90_DAYS' | '1_YEAR' | 'PERMANENT' }
 *
 * Authorization (Phase F.5):
 *   - Resolves the share's `global_patient_id` and calls
 *     `requireAuthorityOver` to confirm the caller has self or
 *     guardian-of-minor authority over that gp.
 *   - Delegate basis is REJECTED — `consent_to_share` is post-MVP
 *     (Mo ruling 4); a delegate cannot extend / revoke shares on
 *     the principal's behalf in MVP.
 *
 * Behavior unchanged from Phase E:
 *   - Extending a permanent share is a no-op.
 *   - Extending to a duration that would SHORTEN current expiry is a
 *     no-op (NEVER shortens).
 *   - Extending a revoked share THROWS at DB level, surfaced as 409.
 */

import { NextResponse } from 'next/server'
import {
  requireApiAuth,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import {
  extendShare,
  type ExtendDuration,
} from '@shared/lib/data/patient-shares'
import { createAdminClient } from '@shared/lib/supabase/admin'
import {
  requireAuthorityOver,
  AuthorityError,
} from '@shared/lib/auth/authority'
import { DelegateNotAuthorizedError } from '@shared/lib/auth/patient-context'

const VALID_DURATIONS: ExtendDuration[] = ['90_DAYS', '1_YEAR', 'PERMANENT']

export async function POST(
  request: Request,
  context: { params: Promise<{ shareId: string }> }
) {
  try {
    const session = await requireApiAuth()
    const userId = session.id

    const params = await context.params
    const shareId =
      typeof params?.shareId === 'string' ? params.shareId : null
    if (!shareId) {
      return NextResponse.json(
        { error: 'shareId required' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const duration = typeof body?.duration === 'string' ? body.duration : ''
    if (!VALID_DURATIONS.includes(duration as ExtendDuration)) {
      return NextResponse.json(
        { error: 'duration must be one of: 90_DAYS, 1_YEAR, PERMANENT' },
        { status: 400 }
      )
    }

    // Resolve the share to learn its subject gp.
    const admin = createAdminClient('patient-sharing-extend-authz')
    const { data: share } = await admin
      .from('patient_data_shares')
      .select('id, global_patient_id, revoked_at')
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

    // Authority gate: self or guardian. Delegates rejected.
    const auth = await requireAuthorityOver(subjectGpId, userId)
    if (auth.basis === 'delegated_by_principal') {
      throw new DelegateNotAuthorizedError(
        'Extending shares is not available for delegated authority ' +
          '(consent_to_share is post-MVP per Mo ruling 4)'
      )
    }

    // Surface "extend on revoked" as 409 before the DB throws.
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
    if (error instanceof AuthorityError) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      )
    }
    console.error(
      'POST /patient/sharing/[shareId]/extend error:',
      error
    )
    return toApiErrorResponse(error, 'Failed to extend share')
  }
}
