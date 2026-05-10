export const dynamic = 'force-dynamic'

/**
 * PATCH /api/patient/delegations/[id]/capabilities — B07 Phase E.
 *
 * Authenticated principal updates the capability set on an existing
 * grant. Replaces (not merges) the list — caller passes the full
 * desired set. Empty array clears all capabilities.
 *
 * Authorization:
 *   - ONLY the principal (claimed_user_id of principal_global_patient_id)
 *     may invoke. Delegate cannot change their own capabilities.
 *     Data-layer `updateDelegationCapabilities` enforces.
 *
 * Validation:
 *   - capabilities required (may be empty array to clear)
 *   - capabilities subset of ALLOWED_DELEGATION_CAPABILITIES
 *   - 'consent_to_share' rejected at API layer (Mo ruling 4)
 *   - revoked grants cannot have capabilities updated
 *
 * Idempotent — no-op when the new set equals the existing set (data
 * layer compares; returns without writing audit row).
 *
 * Response (200):
 *   { success: true, delegationId: string, capabilities: AllowedCapability[], updatedAt: string }
 */

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import {
  updateDelegationCapabilities,
  ALLOWED_DELEGATION_CAPABILITIES,
  DelegationNotFoundError,
  DelegationAuthorityError,
  InvalidDelegationError,
  type AllowedCapability,
} from '@shared/lib/data/delegations'

interface CapabilitiesBody {
  capabilities?: unknown
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

    const raw = (await request.json()) as CapabilitiesBody
    if (raw.capabilities === undefined) {
      return NextResponse.json(
        { error: 'capabilities is required (use [] to clear)' },
        { status: 400 }
      )
    }
    if (!Array.isArray(raw.capabilities)) {
      return NextResponse.json(
        { error: 'capabilities must be an array' },
        { status: 400 }
      )
    }
    const allowed = new Set<string>(ALLOWED_DELEGATION_CAPABILITIES)
    const invalid: string[] = []
    for (const cap of raw.capabilities) {
      if (typeof cap !== 'string') {
        invalid.push(String(cap))
        continue
      }
      if (cap === 'consent_to_share') {
        return NextResponse.json(
          {
            error:
              "'consent_to_share' is not yet a supported delegation capability (post-MVP per Mo ruling 4)",
            code: 'CAPABILITY_POST_MVP',
          },
          { status: 400 }
        )
      }
      if (!allowed.has(cap)) {
        invalid.push(cap)
      }
    }
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid capabilities: ${invalid.join(', ')}. Allowed: ${ALLOWED_DELEGATION_CAPABILITIES.join(', ')}`,
          code: 'CAPABILITY_INVALID',
        },
        { status: 400 }
      )
    }
    const capabilities = raw.capabilities as AllowedCapability[]

    await updateDelegationCapabilities(id, capabilities, user.id)

    return NextResponse.json({
      success: true,
      delegationId: id,
      capabilities,
      updatedAt: new Date().toISOString(),
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
    console.error('PATCH /api/patient/delegations/[id]/capabilities error:', error)
    return toApiErrorResponse(error, 'Failed to update delegation capabilities')
  }
}
