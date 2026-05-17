export const dynamic = 'force-dynamic'

/**
 * GET /api/patient/dependents/[id] — B07 Phase E.
 *
 * Authenticated patient fetches a single minor dependent by gp id.
 *
 * Authorization:
 *   - `requireAuthorityOver(id, user.id)` — must resolve.
 *   - The basis MUST be `'guardian_of_minor'`. A self-claimed adult or a
 *     delegate-of-an-adult invoking this endpoint is rejected (403); they
 *     should use the standard `/api/patient/profile`-style read instead.
 *     This endpoint is the dependents-resource view, not a generic gp
 *     fetch.
 *
 * Response (200):
 *   { success: true, dependent: MinorGlobalPatient }
 *
 * Errors:
 *   400 - id missing
 *   403 - basis is not guardian_of_minor (or no basis matched)
 *   404 - dependent not found
 *   500 - unexpected
 */

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import {
  requireAuthorityOver,
  AuthorityError,
} from '@shared/lib/auth/authority'
import {
  getDependent,
  DependentNotFoundError,
} from '@shared/lib/data/dependents'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiRole('patient')

    // Next 15 (L-7, 2026-05-16): params is now Promise<{...}> exactly;
    // the prior forward-compat union was rejected by Next 15's stricter
    // ParamCheck<RouteContext> constraint.
    const params = await context.params
    const id = params?.id
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Dependent id is required' },
        { status: 400 }
      )
    }

    // Authorization gate — must be guardian-of-minor.
    const auth = await requireAuthorityOver(id, user.id)
    if (auth.basis !== 'guardian_of_minor') {
      throw new AuthorityError(
        id,
        `This endpoint requires guardian-of-minor authority (got: ${auth.basis})`
      )
    }

    const dependent = await getDependent(id, user.id)
    return NextResponse.json({ success: true, dependent })
  } catch (error: any) {
    if (error instanceof DependentNotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404 }
      )
    }
    console.error('GET /api/patient/dependents/[id] error:', error)
    return toApiErrorResponse(error, 'Failed to fetch dependent')
  }
}
