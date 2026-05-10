export const dynamic = 'force-dynamic'

/**
 * GET /api/patient/dependents — B07 Phase E.
 *
 * Authenticated patient lists all minors under their guardianship.
 *
 * Authorization:
 *   No `requireAuthorityOver` call — authorization is implicit in the
 *   data layer's WHERE clause (guardianUserId = caller). RLS on
 *   `global_patients` (mig 114) provides defense-in-depth.
 *
 * Response (200):
 *   { success: true, dependents: MinorGlobalPatient[] }
 */

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { listDependentsByGuardian } from '@shared/lib/data/dependents'

export async function GET(_request: Request) {
  try {
    const user = await requireApiRole('patient')
    const dependents = await listDependentsByGuardian(user.id)
    return NextResponse.json({ success: true, dependents })
  } catch (error: any) {
    console.error('GET /api/patient/dependents error:', error)
    return toApiErrorResponse(error, 'Failed to list dependents')
  }
}
