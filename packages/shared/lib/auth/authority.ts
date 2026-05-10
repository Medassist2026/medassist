/**
 * B07 Phase E — authority helpers for patient-app API handlers.
 *
 * Two functions:
 *   - requireAuthorityOver(globalPatientId, userId)
 *   - requireCapability(globalPatientId, capability, userId)
 *
 * Both wrap the Phase D mig 113 SQL helpers
 * (`is_authorized_actor_on()`, `delegated_capability_includes()`)
 * but at the application layer, with three benefits over a plain RPC:
 *
 *   1. The function reports WHICH branch matched (self vs guardian vs
 *      delegated). The SQL helper returns BOOLEAN; the OR-of-three is
 *      opaque to callers. Handlers want the basis for audit emission and
 *      branch-specific authorization (e.g., GET /api/patient/dependents/[id]
 *      requires the basis to be 'guardian_of_minor', not 'self').
 *
 *   2. When the basis is 'delegated_by_principal', the function returns
 *      the delegation row id so handlers can attach it to audit rows as
 *      `metadata.authority_grant_id`.
 *
 *   3. `requireCapability` short-circuits self/guardian (per
 *      architectural review §3.5: implicit full capability) and only
 *      pays the SQL round-trip for the delegated branch.
 *
 * AUTHORITY CHAIN DEPTH = 1 (Mo ruling 7)
 *   These helpers do NOT chase guardians-of-delegates or delegates-of-
 *   guardians. The query asks: is THIS user authorized over THIS gp via
 *   ONE of three direct relationships? No transitive closure.
 *
 * THREE-QUERY SHAPE (Phase E Decision 2)
 *   Three sequential SELECTs with short-circuit. Self-claim is the
 *   dominant case (>90% traffic) and hits in 1 round-trip. Worst case
 *   (delegated authority) is 3 round-trips. UNION via PostgREST grammar
 *   would require either a raw RPC wrapper (new schema, violates ruling
 *   19) or a `.rpc()` call to a new SQL function (also violates ruling
 *   19); we keep the resolution in TS.
 *
 * ERROR SHAPE (Phase E Decision 4)
 *   Both errors extend `ApiAuthError(403)` so the existing
 *   `toApiErrorResponse()` mapper handles them uniformly without
 *   per-handler `instanceof` plumbing.
 */

import { createAdminClient } from '@shared/lib/supabase/admin'
import { ApiAuthError } from '@shared/lib/auth/session'
import type { AuthorityBasis } from '@shared/lib/data/audit'
import type { AllowedCapability } from '@shared/lib/data/delegations'

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface AuthorityResult {
  /** The user under examination (= `userId` argument). */
  userId: string
  /** Which branch of the OR-of-three matched. */
  basis: AuthorityBasis
  /**
   * Populated only when `basis === 'delegated_by_principal'`. The id of
   * the active `patient_delegations` row that grants authority. Handlers
   * pass this as `authorityGrantId` to `emitPatientAuditWithAuthority`
   * so audit rows record `metadata.authority_grant_id`.
   */
  delegationId?: string
}

// ──────────────────────────────────────────────────────────────────────────
// Errors — both extend ApiAuthError(403) so toApiErrorResponse handles them.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Thrown by `requireAuthorityOver` when no branch of the OR-of-three
 * matches. Caller's responsibility: surface to user as 403 (the existing
 * `toApiErrorResponse` does this automatically since this extends
 * `ApiAuthError(403)`).
 */
export class AuthorityError extends ApiAuthError {
  readonly code = 'AUTHORITY_DENIED' as const
  readonly globalPatientId: string

  constructor(globalPatientId: string, message?: string) {
    super(
      message ??
        `Not authorized to act on global_patient ${globalPatientId} ` +
          `(no self-claim, guardian-link, or active delegation matches)`,
      403
    )
    this.name = 'AuthorityError'
    this.globalPatientId = globalPatientId
  }
}

/**
 * Thrown by `requireCapability` when the actor has authority via a
 * delegation, but the delegation does NOT include the requested
 * capability. Distinct from `AuthorityError` because the actor IS
 * authorized in some sense — they just don't have the specific power
 * being requested.
 */
export class CapabilityError extends ApiAuthError {
  readonly code = 'CAPABILITY_NOT_GRANTED' as const
  readonly globalPatientId: string
  readonly requiredCapability: AllowedCapability
  readonly basis: AuthorityBasis

  constructor(
    globalPatientId: string,
    capability: AllowedCapability,
    basis: AuthorityBasis,
    message?: string
  ) {
    super(
      message ??
        `Capability '${capability}' not granted on global_patient ` +
          `${globalPatientId} (basis: ${basis})`,
      403
    )
    this.name = 'CapabilityError'
    this.globalPatientId = globalPatientId
    this.requiredCapability = capability
    this.basis = basis
  }
}

// ──────────────────────────────────────────────────────────────────────────
// requireAuthorityOver — the OR-of-three resolver
// ──────────────────────────────────────────────────────────────────────────

/**
 * Verify the user has authority to act on the named global_patient via
 * ONE of three relationships (matching Phase D mig 113
 * `is_authorized_actor_on()` predicate):
 *
 *   1. self-claim:    global_patients.claimed_user_id = userId
 *   2. guardian-link: child.is_minor=TRUE
 *                     AND parent.claimed_user_id = userId
 *   3. delegation:    patient_delegations row exists with
 *                     principal_global_patient_id = globalPatientId,
 *                     delegate_user_id = userId,
 *                     accepted_at IS NOT NULL,
 *                     revoked_at IS NULL,
 *                     (expires_at IS NULL OR expires_at > NOW()).
 *
 * Returns an `AuthorityResult` indicating which branch matched. Throws
 * `AuthorityError(403)` when none does.
 *
 * Performance: short-circuits on first match. Self-claim is checked
 * first because it dominates patient-app traffic (>90%).
 */
export async function requireAuthorityOver(
  globalPatientId: string,
  userId: string
): Promise<AuthorityResult> {
  if (!globalPatientId || typeof globalPatientId !== 'string') {
    throw new AuthorityError(
      globalPatientId,
      'globalPatientId is required'
    )
  }
  if (!userId || typeof userId !== 'string') {
    // Intentionally throw AuthorityError (not a different shape) — an
    // empty userId means there's no authenticated actor, which from the
    // helper's perspective is indistinguishable from "no branch matches."
    throw new AuthorityError(globalPatientId, 'userId is required')
  }

  const supabase = createAdminClient('authority-resolve')

  // ─── Branch 1: self-claim ─────────────────────────────────────────────
  // Most common case (>90% of patient-app traffic). A single
  // `claimed_user_id = userId` on `global_patients` resolves it.
  const { data: selfRow, error: selfErr } = await supabase
    .from('global_patients')
    .select('id')
    .eq('id', globalPatientId)
    .eq('claimed_user_id', userId)
    .maybeSingle()
  if (selfErr && (selfErr as { code?: string }).code !== 'PGRST116') {
    throw new Error(
      `requireAuthorityOver self-claim query failed: ${(selfErr as { message?: string }).message ?? 'unknown'}`
    )
  }
  if (selfRow) {
    return { userId, basis: 'self' }
  }

  // ─── Branch 2: guardian-of-minor ──────────────────────────────────────
  // The named gp is a minor whose parent gp is claimed by `userId`.
  // Two-step: read the minor row to get its guardian_global_patient_id,
  // then check that guardian gp's claimed_user_id. Two SELECTs vs a join
  // because PostgREST self-joins on the same table are awkward to type.
  const { data: childRow, error: childErr } = await supabase
    .from('global_patients')
    .select('id, is_minor, guardian_global_patient_id')
    .eq('id', globalPatientId)
    .maybeSingle()
  if (childErr && (childErr as { code?: string }).code !== 'PGRST116') {
    throw new Error(
      `requireAuthorityOver child lookup failed: ${(childErr as { message?: string }).message ?? 'unknown'}`
    )
  }
  if (
    childRow &&
    (childRow as { is_minor: boolean }).is_minor &&
    (childRow as { guardian_global_patient_id: string | null })
      .guardian_global_patient_id
  ) {
    const guardianId = (childRow as { guardian_global_patient_id: string })
      .guardian_global_patient_id
    const { data: guardianRow, error: guardianErr } = await supabase
      .from('global_patients')
      .select('id')
      .eq('id', guardianId)
      .eq('claimed_user_id', userId)
      .maybeSingle()
    if (guardianErr && (guardianErr as { code?: string }).code !== 'PGRST116') {
      throw new Error(
        `requireAuthorityOver guardian lookup failed: ${(guardianErr as { message?: string }).message ?? 'unknown'}`
      )
    }
    if (guardianRow) {
      return { userId, basis: 'guardian_of_minor' }
    }
  }

  // ─── Branch 3: active delegation ──────────────────────────────────────
  // patient_delegations row with principal=gp, delegate=userId, accepted
  // and not-revoked and not-expired. ORDER BY granted_at DESC so the most
  // recent grant wins if multiple are active (mig 110's partial unique
  // index allows only one active grant per (principal, delegate) pair, so
  // in practice this returns 0 or 1 row).
  const nowIso = new Date().toISOString()
  const { data: delegationRows, error: delErr } = await supabase
    .from('patient_delegations')
    .select('id, expires_at')
    .eq('principal_global_patient_id', globalPatientId)
    .eq('delegate_user_id', userId)
    .not('accepted_at', 'is', null)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false })
    .limit(1)
  if (delErr) {
    throw new Error(
      `requireAuthorityOver delegation query failed: ${(delErr as { message?: string }).message ?? 'unknown'}`
    )
  }
  const delegation = ((delegationRows as
    | { id: string; expires_at: string | null }[]
    | null) ?? [])[0]
  if (delegation) {
    // expires_at filter — cannot encode "expires_at > NOW() OR IS NULL"
    // in PostgREST in one expression; check in TS.
    if (
      delegation.expires_at === null ||
      delegation.expires_at > nowIso
    ) {
      return {
        userId,
        basis: 'delegated_by_principal',
        delegationId: delegation.id,
      }
    }
  }

  // No branch matched.
  throw new AuthorityError(globalPatientId)
}

// ──────────────────────────────────────────────────────────────────────────
// requireCapability — extends requireAuthorityOver with capability check
// ──────────────────────────────────────────────────────────────────────────

/**
 * Like `requireAuthorityOver` but ALSO checks that, when authority is
 * delegation-based, the delegation includes the named capability.
 *
 * Self and guardian_of_minor bases short-circuit: implicit full
 * capability per architectural review §3.5 / Phase D Decision 6.
 *
 * For delegation basis: queries the SQL helper
 * `delegated_capability_includes()` (Phase D mig 113). Throws
 * `CapabilityError(403)` when the helper returns FALSE.
 *
 * The `capability` parameter is typed as `AllowedCapability` (literal
 * union from Phase C); the eslint rule
 * `no-unregistered-delegation-capability` enforces compile-time
 * discipline at call sites that pass `capabilities` arrays — call sites
 * that pass a single token here benefit from the same TS check.
 */
export async function requireCapability(
  globalPatientId: string,
  capability: AllowedCapability,
  userId: string
): Promise<AuthorityResult> {
  const result = await requireAuthorityOver(globalPatientId, userId)

  // Self and guardian-of-minor: implicit full capability.
  if (result.basis === 'self' || result.basis === 'guardian_of_minor') {
    return result
  }

  // Delegation basis: query the SQL helper. We could re-implement the
  // jsonb-contains check in TS via a SELECT on patient_delegations, but
  // calling the helper guarantees we stay in lock-step with whatever
  // logic mig 113 encodes (e.g., a future change to capability semantics
  // would land in the SQL helper, and this code would inherit it).
  const supabase = createAdminClient('authority-capability')
  const { data, error } = await (supabase as any).rpc(
    'delegated_capability_includes',
    {
      p_global_patient_id: globalPatientId,
      p_user_id: userId,
      p_capability: capability,
    }
  )
  if (error) {
    throw new Error(
      `requireCapability rpc failed: ${(error as { message?: string }).message ?? 'unknown'}`
    )
  }
  // The helper returns a single BOOLEAN. supabase-js wraps it as `data`.
  if (data !== true) {
    throw new CapabilityError(globalPatientId, capability, result.basis)
  }
  return result
}
