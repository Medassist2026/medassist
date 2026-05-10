export const dynamic = 'force-dynamic'

/**
 * PATCH /api/patient/delegations/[id]/accept — B07 Phase E.
 *
 * Authenticated delegate accepts a pending delegation grant. Sets
 * `accepted_at = NOW()`. Idempotent — second accept on an already-
 * accepted grant is a no-op (data layer enforces).
 *
 * Authorization:
 *   - Caller must be the named `delegate_user_id` on the grant
 *     (data-layer `acceptDelegation` enforces).
 *   - A grant that is revoked OR expired cannot be accepted.
 *
 * Response (200):
 *   { success: true, delegationId: string, status: 'active', acceptedAt: string }
 *
 * Errors:
 *   400 - id missing
 *   403 - not the named delegate
 *   404 - delegation not found
 *   409 - grant is revoked or expired
 */

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import {
  acceptDelegation,
  DelegationNotFoundError,
  DelegationAuthorityError,
  InvalidDelegationError,
} from '@shared/lib/data/delegations'

export async function PATCH(
  _request: Request,
  context: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const user = await requireApiRole('patient')
    const params = await Promise.resolve(context.params)
    const id = params?.id
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Delegation id is required' },
        { status: 400 }
      )
    }

    await acceptDelegation(id, user.id)

    return NextResponse.json({
      success: true,
      delegationId: id,
      status: 'active',
      acceptedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    if (error instanceof DelegationNotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404 }
      )
    }
    if (error instanceof DelegationAuthorityError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403 }
      )
    }
    if (error instanceof InvalidDelegationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409 }
      )
    }
    console.error('PATCH /api/patient/delegations/[id]/accept error:', error)
    return toApiErrorResponse(error, 'Failed to accept delegation')
  }
}
