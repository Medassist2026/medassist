export const dynamic = 'force-dynamic'

/**
 * GET /api/patient/delegations/granted — B07 Phase E.
 *
 * Authenticated principal lists all delegations they have granted
 * (regardless of accept/revoke status). Returns active + pending +
 * revoked + expired — caller filters as desired.
 *
 * Response (200):
 *   { success: true, delegations: Delegation[] }
 */

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { listGrantedDelegations } from '@shared/lib/data/delegations'

export async function GET(_request: Request) {
  try {
    const user = await requireApiRole('patient')
    const delegations = await listGrantedDelegations(user.id)
    return NextResponse.json({ success: true, delegations })
  } catch (error: any) {
    console.error('GET /api/patient/delegations/granted error:', error)
    return toApiErrorResponse(error, 'Failed to list granted delegations')
  }
}
