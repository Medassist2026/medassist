export const dynamic = 'force-dynamic'

/**
 * GET /api/patient/delegations/received — B07 Phase E.
 *
 * Authenticated delegate lists all delegations where they are the named
 * delegate (regardless of accept/revoke status).
 *
 * Response (200):
 *   { success: true, delegations: Delegation[] }
 */

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { listReceivedDelegations } from '@shared/lib/data/delegations'

export async function GET(_request: Request) {
  try {
    const user = await requireApiRole('patient')
    const delegations = await listReceivedDelegations(user.id)
    return NextResponse.json({ success: true, delegations })
  } catch (error: any) {
    console.error('GET /api/patient/delegations/received error:', error)
    return toApiErrorResponse(error, 'Failed to list received delegations')
  }
}
