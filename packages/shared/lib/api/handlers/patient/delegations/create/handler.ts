export const dynamic = 'force-dynamic'

/**
 * POST /api/patient/delegations — B07 Phase E.
 *
 * Authenticated principal creates a delegation grant for a delegate user.
 * The grant is created with `accepted_at IS NULL` (pending delegate
 * acceptance). The delegate must call PATCH /[id]/accept to activate it.
 *
 * Body shape:
 *   {
 *     delegateUserId: string                 // required, UUID
 *     delegateGlobalPatientId?: string       // optional UUID
 *     capabilities?: AllowedCapability[]     // default [] (Mo ruling 18)
 *     expiresAt?: string                     // ISO timestamp; default = +1y (Mo ruling 20)
 *     autoRenew?: boolean                    // default false
 *     autoRenewWindowDays?: number           // required if autoRenew=true
 *     metadata?: Record<string, unknown>
 *   }
 *
 * Validation:
 *   - delegateUserId required, must be a valid UUID, must NOT equal caller's auth.uid()
 *   - capabilities (when provided) must be subset of ALLOWED_DELEGATION_CAPABILITIES
 *   - 'consent_to_share' is rejected at API layer (Mo ruling 4 — post-MVP)
 *   - expiresAt (when provided) must be valid ISO timestamp + future
 *   - autoRenewWindowDays (when autoRenew=true) must be positive integer
 *
 * Defaults applied at handler layer (per Phase C Decision 5: data layer
 * is policy-free, handler applies defaults):
 *   - capabilities undefined → []
 *   - expiresAt undefined → 1 year from now (Mo ruling 20)
 *   - autoRenew undefined → false
 *
 * Response (201):
 *   { success: true, delegationId: string, status: 'pending_acceptance', expiresAt: string }
 *
 * Errors:
 *   400 - validation failure
 *   403 - caller is not a patient OR caller has no claimed gp
 *   409 - duplicate active grant (mig 110 partial unique index)
 */

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import {
  grantDelegation,
  ALLOWED_DELEGATION_CAPABILITIES,
  DelegationAuthorityError,
  InvalidDelegationError,
  type AllowedCapability,
} from '@shared/lib/data/delegations'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface CreateBody {
  delegateUserId?: unknown
  delegateGlobalPatientId?: unknown
  capabilities?: unknown
  expiresAt?: unknown
  autoRenew?: unknown
  autoRenewWindowDays?: unknown
  metadata?: unknown
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('patient')

    const raw = (await request.json()) as CreateBody

    // ─── delegateUserId validation ───────────────────────────────────────
    if (typeof raw.delegateUserId !== 'string' || !UUID_RE.test(raw.delegateUserId)) {
      return NextResponse.json(
        { error: 'delegateUserId is required and must be a valid UUID' },
        { status: 400 }
      )
    }
    const delegateUserId = raw.delegateUserId
    if (delegateUserId === user.id) {
      return NextResponse.json(
        {
          error: 'Cannot delegate to yourself (delegateUserId must differ from auth.uid())',
        },
        { status: 400 }
      )
    }

    // ─── delegateGlobalPatientId validation (optional) ───────────────────
    let delegateGlobalPatientId: string | undefined
    if (raw.delegateGlobalPatientId !== undefined && raw.delegateGlobalPatientId !== null) {
      if (
        typeof raw.delegateGlobalPatientId !== 'string' ||
        !UUID_RE.test(raw.delegateGlobalPatientId)
      ) {
        return NextResponse.json(
          { error: 'delegateGlobalPatientId, when provided, must be a valid UUID' },
          { status: 400 }
        )
      }
      delegateGlobalPatientId = raw.delegateGlobalPatientId
    }

    // ─── capabilities validation ─────────────────────────────────────────
    let capabilities: AllowedCapability[] = []
    if (raw.capabilities !== undefined) {
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
        // Mo ruling 4: consent_to_share is post-MVP. Reject explicitly at
        // the API boundary so the user-facing error is informative
        // (rather than a "not in allowed set" message that includes
        // misleading detail).
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
      capabilities = raw.capabilities as AllowedCapability[]
    }

    // ─── expiresAt validation + default ──────────────────────────────────
    let expiresAt: string
    if (raw.expiresAt !== undefined && raw.expiresAt !== null) {
      if (typeof raw.expiresAt !== 'string') {
        return NextResponse.json(
          { error: 'expiresAt must be an ISO timestamp string' },
          { status: 400 }
        )
      }
      const parsed = new Date(raw.expiresAt)
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: 'expiresAt is not a valid timestamp' },
          { status: 400 }
        )
      }
      if (parsed.getTime() <= Date.now()) {
        return NextResponse.json(
          { error: 'expiresAt must be in the future' },
          { status: 400 }
        )
      }
      expiresAt = parsed.toISOString()
    } else {
      // Mo ruling 20: default to 1 year from now.
      expiresAt = new Date(Date.now() + ONE_YEAR_MS).toISOString()
    }

    // ─── autoRenew + autoRenewWindowDays validation ──────────────────────
    let autoRenew = false
    if (raw.autoRenew !== undefined) {
      if (typeof raw.autoRenew !== 'boolean') {
        return NextResponse.json(
          { error: 'autoRenew must be a boolean' },
          { status: 400 }
        )
      }
      autoRenew = raw.autoRenew
    }
    let autoRenewWindowDays: number | null = null
    if (autoRenew) {
      if (
        typeof raw.autoRenewWindowDays !== 'number' ||
        !Number.isInteger(raw.autoRenewWindowDays) ||
        raw.autoRenewWindowDays <= 0
      ) {
        return NextResponse.json(
          {
            error: 'autoRenewWindowDays must be a positive integer when autoRenew=true',
          },
          { status: 400 }
        )
      }
      autoRenewWindowDays = raw.autoRenewWindowDays
    } else if (
      raw.autoRenewWindowDays !== undefined &&
      raw.autoRenewWindowDays !== null
    ) {
      // Allow but ignore (forward-compat); a future client may send this
      // alongside autoRenew=false expecting it to be remembered. Reject
      // to keep the contract clean.
      return NextResponse.json(
        { error: 'autoRenewWindowDays only valid when autoRenew=true' },
        { status: 400 }
      )
    }

    // ─── metadata pass-through ───────────────────────────────────────────
    let metadata: Record<string, unknown> = {}
    if (raw.metadata !== undefined && raw.metadata !== null) {
      if (typeof raw.metadata !== 'object' || Array.isArray(raw.metadata)) {
        return NextResponse.json(
          { error: 'metadata must be an object' },
          { status: 400 }
        )
      }
      metadata = raw.metadata as Record<string, unknown>
    }

    // ─── Resolve caller's principal gp ───────────────────────────────────
    const admin = createAdminClient('delegations-create-resolve-principal')
    const { data: gpRow, error: gpErr } = await admin
      .from('global_patients')
      .select('id')
      .eq('claimed_user_id', user.id)
      .maybeSingle()
    if (gpErr && (gpErr as { code?: string }).code !== 'PGRST116') {
      throw new Error(
        `Resolve principal gp failed: ${(gpErr as { message?: string }).message ?? 'unknown'}`
      )
    }
    const principalGpId = (gpRow as { id?: string } | null)?.id
    if (!principalGpId) {
      return NextResponse.json(
        {
          error:
            'You must register your own patient account before granting a delegation',
        },
        { status: 400 }
      )
    }

    // ─── Call data layer ─────────────────────────────────────────────────
    let result
    try {
      result = await grantDelegation({
        principalGlobalPatientId: principalGpId,
        delegateUserId,
        delegateGlobalPatientId,
        capabilities,
        grantedByUserId: user.id,
        expiresAt,
        autoRenew,
        autoRenewWindowDays,
        metadata,
      })
    } catch (e: any) {
      // Postgres unique_violation → mig 110 partial unique index for
      // active duplicate-grant (principal + delegate, while not revoked).
      const pgCode =
        (e?.cause as { code?: string } | undefined)?.code ??
        (e as { code?: string }).code
      const msg = String(e?.message ?? '')
      if (pgCode === '23505' || msg.includes('duplicate key value') || msg.includes('unique constraint')) {
        return NextResponse.json(
          {
            error:
              'An active delegation already exists for this principal and delegate. Revoke or update the existing grant before creating a new one.',
            code: 'DELEGATION_DUPLICATE_ACTIVE',
          },
          { status: 409 }
        )
      }
      throw e
    }

    return NextResponse.json(
      {
        success: true,
        delegationId: result.delegationId,
        status: 'pending_acceptance',
        expiresAt,
      },
      { status: 201 }
    )
  } catch (error: any) {
    if (error instanceof InvalidDelegationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 }
      )
    }
    if (error instanceof DelegationAuthorityError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403 }
      )
    }
    console.error('POST /api/patient/delegations error:', error)
    return toApiErrorResponse(error, 'Failed to create delegation')
  }
}
