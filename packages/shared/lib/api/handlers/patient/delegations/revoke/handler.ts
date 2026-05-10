export const dynamic = 'force-dynamic'

/**
 * PATCH /api/patient/delegations/[id]/revoke — B07 Phase E.
 *
 * Authenticated principal OR delegate severs a delegation grant. Per
 * Phase E Decision 7, the data layer auto-discriminates the resulting
 * audit action:
 *   - Caller is principal → `DELEGATION_REVOKED`
 *   - Caller is delegate → `DELEGATION_WITHDRAWN`
 * Both paths share this endpoint; the response shape is the same.
 *
 * Authority chain depth = 1 (Mo ruling 7): only the named principal
 * (claimed_user_id of principal_global_patient_id) or the named delegate
 * may revoke. A delegate-of-the-principal cannot revoke another
 * delegate's grant.
 *
 * Body (optional):
 *   { reason?: string }   // max 500 chars
 *
 * Idempotent — second revoke on an already-revoked grant is a no-op
 * (data layer enforces; returns 200 with status='revoked').
 *
 * Response (200):
 *   {
 *     success: true,
 *     delegationId: string,
 *     status: 'revoked',
 *     revokedAt: string,
 *     revokedBy: 'principal' | 'delegate'
 *   }
 *
 * Errors:
 *   400 - id missing or reason too long
 *   403 - caller is neither principal nor delegate
 *   404 - delegation not found
 */

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import {
  revokeDelegation,
  DelegationNotFoundError,
  DelegationAuthorityError,
  InvalidDelegationError,
} from '@shared/lib/data/delegations'

interface RevokeBody {
  reason?: unknown
}

export async function PATCH(
  request: Request,
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

    let reason: string | undefined
    try {
      const raw = (await request.json().catch(() => ({}))) as RevokeBody
      if (raw.reason !== undefined && raw.reason !== null) {
        if (typeof raw.reason !== 'string') {
          return NextResponse.json(
            { error: 'reason must be a string' },
            { status: 400 }
          )
        }
        if (raw.reason.length > 500) {
          return NextResponse.json(
            { error: 'reason must be 500 characters or fewer' },
            { status: 400 }
          )
        }
        reason = raw.reason
      }
    } catch {
      // No body / unparseable body — reason stays undefined.
    }

    // Determine revokedBy by reading the row before mutation.
    // (We could derive this after revokeDelegation by re-reading, but the
    // data layer's revokeDelegation doesn't return who revoked; reading
    // beforehand is simpler.)
    const admin = createAdminClient('delegations-revoke-discriminate')
    const { data: row, error: rowErr } = await admin
      .from('patient_delegations')
      .select('id, principal_global_patient_id, delegate_user_id')
      .eq('id', id)
      .maybeSingle()
    if (rowErr && (rowErr as { code?: string }).code !== 'PGRST116') {
      throw new Error(
        `Pre-revoke read failed: ${(rowErr as { message?: string }).message ?? 'unknown'}`
      )
    }
    if (!row) {
      return NextResponse.json(
        { error: `Delegation ${id} not found`, code: 'DELEGATION_NOT_FOUND' },
        { status: 404 }
      )
    }
    const grantRow = row as {
      principal_global_patient_id: string
      delegate_user_id: string
    }

    // Determine revokedBy semantically. Data layer's authorization check
    // will reject any other case as DelegationAuthorityError.
    let revokedBy: 'principal' | 'delegate' = 'principal'
    if (grantRow.delegate_user_id === user.id) {
      revokedBy = 'delegate'
    }

    await revokeDelegation(id, user.id, reason)

    return NextResponse.json({
      success: true,
      delegationId: id,
      status: 'revoked',
      revokedAt: new Date().toISOString(),
      revokedBy,
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
        { status: 400 }
      )
    }
    console.error('PATCH /api/patient/delegations/[id]/revoke error:', error)
    return toApiErrorResponse(error, 'Failed to revoke delegation')
  }
}
