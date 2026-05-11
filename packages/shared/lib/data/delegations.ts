/**
 * patient_delegations data layer (B07 Phase C — Pattern B adult delegation).
 *
 * Wraps the `public.patient_delegations` table created by mig 110 + mig 112
 * (CHECK granted_by_user_id <> delegate_user_id). The table is the storage
 * substrate for `is_authorized_actor_on()`'s third branch — see Phase D
 * mig 113 for the helper, and architectural review §3.4 / §5 for the
 * design.
 *
 * TWO-STEP GRANT FLOW (architectural review §5.3 / Mo ruling 14)
 *   Principal POSTs the grant → row inserted with accepted_at IS NULL.
 *   Delegate accepts → accepted_at = NOW(). Until accepted, the grant is
 *   INACTIVE — `is_authorized_actor_on()` requires `accepted_at IS NOT NULL`.
 *
 * DEFAULT CAPABILITIES (Mo ruling 18 — Phase C-E prompt addition)
 *   `grantDelegation` defaults `capabilities` to []. Principal must
 *   explicitly UPDATE capabilities (via `updateDelegationCapabilities`) to
 *   add power. The two-step flow plus a third capability-assignment step
 *   is the intended design.
 *
 * MVP CAPABILITY SET (Mo ruling 4 — five tokens; consent_to_share excluded)
 *   - view_records
 *   - receive_notifications
 *   - book_appointments
 *   - manage_medications
 *   - consent_to_messaging
 *   The TS literal union below is the load-bearing enforcement; the
 *   sibling eslint rule `no-unregistered-delegation-capability` adds
 *   static-string discipline (no template literals, no variables) at
 *   call sites that pass a `capabilities` array.
 *
 * AUTHORITY CHAIN DEPTH = 1 (Mo ruling 7)
 *   This module never resolves a delegate-of-a-guardian or guardian-of-a-
 *   delegate. The principal is always the directly-named gp; the delegate
 *   is always the directly-authenticated user. No chained lookups.
 *
 * GRANTOR ≠ DELEGATE (mig 112 + Phase B Decision 12 risk note)
 *   The DB CHECK rejects self-grants at the schema level. This module
 *   short-circuits the same invariant at the application layer so the
 *   user-facing failure mode is a typed error (`InvalidDelegationError`)
 *   rather than a raw `check_violation`.
 *
 * AUDIT EMISSION
 *   Every state-changing function emits exactly one audit row via
 *   `emitPatientAuditWithAuthority`. Subject is the principal's gp; actor
 *   varies (principal for grant/revoke/update-capabilities; delegate for
 *   accept/withdraw; system for cron-driven expire).
 *
 * RLS — patient_delegations carries the same DENY-ALL placeholder as
 *   patient_data_shares; production RLS for it ships in Phase D (mig 116
 *   or sibling). All callers in this module use the service-role admin
 *   client; gate at the route boundary with `requireApiRole('patient')`
 *   plus the Phase E `requireAuthorityOver` helper.
 */

import { createAdminClient } from '@shared/lib/supabase/admin'
import { emitPatientAuditWithAuthority } from '@shared/lib/data/audit'

// ──────────────────────────────────────────────────────────────────────────
// Capability literal union — eslint-locked per D-008 admin-scope precedent.
// ──────────────────────────────────────────────────────────────────────────

/**
 * MVP capability tokens for patient_delegations. Per Mo ruling 4
 * (Phase C-E prompt § "Mo's load-bearing rulings"), `consent_to_share` is
 * NOT in this list — granting cross-clinic shares on a principal's behalf
 * is post-MVP. The five tokens below cover the two scenarios Mo named:
 *   - elderly parent + adult child caregiver (book appointments, manage
 *     medications, view records, receive notifications)
 *   - adult patient + spouse-as-coordinator (view records, consent to
 *     messaging, receive notifications)
 *
 * Adding a new token: append here, register the same string in the eslint
 * rule's allowed set if needed, and update the audit metadata key
 * documentation in `audit.ts`.
 */
export const ALLOWED_DELEGATION_CAPABILITIES = [
  'view_records',
  'receive_notifications',
  'book_appointments',
  'manage_medications',
  'consent_to_messaging',
] as const

export type AllowedCapability = typeof ALLOWED_DELEGATION_CAPABILITIES[number]

const ALLOWED_CAPABILITY_SET: ReadonlySet<string> = new Set(
  ALLOWED_DELEGATION_CAPABILITIES
)

/**
 * Validates a capabilities array at the data-layer boundary. The TypeScript
 * literal union catches stray strings at compile time and the eslint rule
 * catches them at lint time, but this runtime check defends against:
 *   - JSON-payload entries from API handlers that bypass the type system
 *     (e.g., `body.capabilities as AllowedCapability[]` casts)
 *   - Older grants with capabilities that have since been deprecated
 *
 * Throws `InvalidDelegationError` listing every offending value. Callers
 * (Phase E API handlers) should map the error to a 400 with the same list.
 */
function validateCapabilities(
  capabilities: readonly string[]
): asserts capabilities is readonly AllowedCapability[] {
  const invalid: string[] = []
  const seen = new Set<string>()
  for (const cap of capabilities) {
    if (typeof cap !== 'string' || !ALLOWED_CAPABILITY_SET.has(cap)) {
      invalid.push(String(cap))
    }
    if (seen.has(cap)) {
      // De-duplication is a caller responsibility, but a duplicate is
      // semantically invalid (the storage shape is a set). Surface it.
      invalid.push(`duplicate:${cap}`)
    }
    seen.add(cap)
  }
  if (invalid.length > 0) {
    throw new InvalidDelegationError(
      `Invalid capabilities: ${invalid.join(', ')}. ` +
        `Allowed: ${ALLOWED_DELEGATION_CAPABILITIES.join(', ')}`
    )
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

/**
 * The shape returned by every read function. Mirrors `patient_delegations`
 * (mig 110 + mig 112). `capabilities` is typed as `AllowedCapability[]` for
 * call-site ergonomics, but readers should treat unfamiliar tokens
 * defensively (forward-compat with future tokens).
 */
export interface Delegation {
  id: string
  principal_global_patient_id: string
  delegate_user_id: string
  delegate_global_patient_id: string | null
  capabilities: AllowedCapability[]
  granted_at: string
  granted_by_user_id: string
  accepted_at: string | null
  expires_at: string | null
  revoked_at: string | null
  revoked_by_user_id: string | null
  revoke_reason: string | null
  auto_renew: boolean
  auto_renew_window_days: number | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

/**
 * `Delegation` with display names hydrated from `global_patients` by
 * Phase F.5 list readers (Section 4 — closes Phase F finding #7). Both
 * names are nullable:
 *   - `principal_display_name` — NULL only when the principal's gp row
 *     has `display_name IS NULL` (rare; placeholder UX). The principal
 *     gp itself always exists (it's a NOT NULL FK).
 *   - `delegate_display_name` — NULL when the delegate has no
 *     `delegate_global_patient_id` (their gp hasn't been linked yet),
 *     or when the linked gp's `display_name IS NULL`.
 *
 * UI consumers fall back to a placeholder string for null values.
 */
export interface DelegationWithNames extends Delegation {
  principal_display_name: string | null
  delegate_display_name: string | null
}

const DELEGATION_COLUMNS = `
  id,
  principal_global_patient_id,
  delegate_user_id,
  delegate_global_patient_id,
  capabilities,
  granted_at,
  granted_by_user_id,
  accepted_at,
  expires_at,
  revoked_at,
  revoked_by_user_id,
  revoke_reason,
  auto_renew,
  auto_renew_window_days,
  metadata,
  created_at,
  updated_at
`

// ──────────────────────────────────────────────────────────────────────────
// Errors — typed for Phase E API handler error mapping.
// ──────────────────────────────────────────────────────────────────────────

export class DelegationNotFoundError extends Error {
  readonly code = 'DELEGATION_NOT_FOUND' as const
  constructor(delegationId: string) {
    super(`Delegation ${delegationId} not found`)
    this.name = 'DelegationNotFoundError'
  }
}

export class DelegationAuthorityError extends Error {
  readonly code = 'DELEGATION_AUTHORITY' as const
  constructor(message: string) {
    super(message)
    this.name = 'DelegationAuthorityError'
  }
}

export class InvalidDelegationError extends Error {
  readonly code = 'DELEGATION_INVALID' as const
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDelegationError'
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Resolve the principal gp's claimed_user_id (= the human who can act as
 * the principal). Returns null if the principal gp doesn't exist OR is
 * unclaimed. Used by authorization checks below.
 *
 * Note: a principal MUST be claimed for a delegation to be meaningful — an
 * unclaimed gp has no human author to grant authority. The
 * `grantDelegation` flow rejects unclaimed principals; existing rows from
 * a claimed-then-unclaimed sequence (auth.users deleted, FK CASCADE) are
 * left in the table (no automated cleanup) but `is_authorized_actor_on()`
 * still requires accepted_at IS NOT NULL AND revoked_at IS NULL — a stale
 * grant whose principal is unclaimed cannot match self-claim and the
 * delegate's authority depends on `delegate_user_id` matching auth.uid(),
 * which is independent of the principal's claim status.
 */
async function getPrincipalClaimedUserId(
  supabase: ReturnType<typeof createAdminClient>,
  principalGlobalPatientId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('global_patients')
    .select('claimed_user_id')
    .eq('id', principalGlobalPatientId)
    .maybeSingle()
  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null
    throw new Error(
      `getPrincipalClaimedUserId failed: ${(error as { message?: string }).message ?? 'unknown'}`
    )
  }
  return ((data as { claimed_user_id: string | null } | null)?.claimed_user_id) ?? null
}

async function findDelegationById(
  supabase: ReturnType<typeof createAdminClient>,
  delegationId: string
): Promise<Delegation | null> {
  const { data, error } = await supabase
    .from('patient_delegations')
    .select(DELEGATION_COLUMNS)
    .eq('id', delegationId)
    .maybeSingle()
  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null
    throw new Error(
      `findDelegationById failed: ${(error as { message?: string }).message ?? 'unknown'}`
    )
  }
  return (data as unknown as Delegation) ?? null
}

// ──────────────────────────────────────────────────────────────────────────
// 1. grantDelegation — principal grants a delegation
// ──────────────────────────────────────────────────────────────────────────

export interface GrantDelegationInput {
  /** The principal's gp (whose records / consent will be delegated). */
  principalGlobalPatientId: string
  /** The delegate's auth.users.id (who is being authorized to act). */
  delegateUserId: string
  /**
   * Optional convenience pointer to the delegate's own gp. NULL when the
   * delegate is a non-patient family member. Phase E API handler resolves
   * this from delegateUserId → users.global_patient_id when known.
   */
  delegateGlobalPatientId?: string | null
  /**
   * MVP capability tokens to grant. Defaults to [] per Mo ruling 18
   * (Phase C-E prompt). Principal must explicitly UPDATE post-grant to
   * add power.
   */
  capabilities?: readonly AllowedCapability[]
  /**
   * The user driving the grant — usually equals the principal's
   * claimed_user_id. Mig 112 CHECK rejects grantedByUserId === delegateUserId.
   */
  grantedByUserId: string
  /**
   * Expiry timestamp (ISO 8601). NULL/undefined = no expiry. Architectural
   * review §5.4 recommends a 1-year default at the API layer; this data-
   * layer function does NOT apply that default — it pass-throughs
   * undefined as DB NULL. Phase E handler is responsible for the default.
   */
  expiresAt?: string | null
  /** Auto-renew on capability use? Mirrors D-068 auto-renew-on-visit. */
  autoRenew?: boolean
  autoRenewWindowDays?: number | null
  metadata?: Record<string, unknown>
}

export interface GrantDelegationResult {
  delegationId: string
}

/**
 * Insert a `patient_delegations` row with `accepted_at IS NULL` (pending
 * delegate acceptance). Emits `DELEGATION_GRANTED` audit row.
 *
 * Validation:
 *   - principalGlobalPatientId must be claimed (claimed_user_id NOT NULL).
 *   - grantedByUserId must equal the principal's claimed_user_id (only
 *     the principal can grant on their own gp; clinic-side staff cannot).
 *   - grantedByUserId !== delegateUserId (mig 112 CHECK; surfaced as
 *     `InvalidDelegationError` here for cleaner API errors).
 *   - delegateGlobalPatientId !== principalGlobalPatientId when supplied
 *     (mig 110 CHECK).
 *   - capabilities, when supplied, all in ALLOWED_DELEGATION_CAPABILITIES.
 */
export async function grantDelegation(
  args: GrantDelegationInput
): Promise<GrantDelegationResult> {
  const capabilities = args.capabilities ?? []
  validateCapabilities(capabilities)

  if (args.grantedByUserId === args.delegateUserId) {
    throw new InvalidDelegationError(
      'grantedByUserId must not equal delegateUserId (self-delegation rejected; ' +
        'see mig 112 CHECK patient_delegations_grantor_not_delegate_chk)'
    )
  }
  if (
    args.delegateGlobalPatientId &&
    args.delegateGlobalPatientId === args.principalGlobalPatientId
  ) {
    throw new InvalidDelegationError(
      'delegateGlobalPatientId must not equal principalGlobalPatientId ' +
        '(see mig 110 CHECK patient_delegations_delegate_not_self_chk)'
    )
  }

  const supabase = createAdminClient('delegations-grant')

  const principalClaimedUserId = await getPrincipalClaimedUserId(
    supabase,
    args.principalGlobalPatientId
  )
  if (!principalClaimedUserId) {
    throw new DelegationAuthorityError(
      `Principal global_patient ${args.principalGlobalPatientId} is not claimed; ` +
        'an unclaimed gp cannot grant delegations'
    )
  }
  if (principalClaimedUserId !== args.grantedByUserId) {
    throw new DelegationAuthorityError(
      'Only the principal (claimed_user_id of the principal gp) may grant a ' +
        'delegation on their own behalf'
    )
  }

  const insertRow: Record<string, unknown> = {
    principal_global_patient_id: args.principalGlobalPatientId,
    delegate_user_id: args.delegateUserId,
    delegate_global_patient_id: args.delegateGlobalPatientId ?? null,
    capabilities,
    granted_by_user_id: args.grantedByUserId,
    expires_at: args.expiresAt ?? null,
    auto_renew: args.autoRenew ?? false,
    auto_renew_window_days: args.autoRenewWindowDays ?? null,
    metadata: args.metadata ?? {},
    // accepted_at, revoked_at, revoked_by_user_id, revoke_reason all NULL
    // by default; granted_at and timestamps default to NOW().
  }

  const { data, error } = await supabase
    .from('patient_delegations')
    .insert(insertRow)
    .select('id')
    .single()

  if (error) {
    throw new Error(
      `grantDelegation insert failed: ${(error as { message?: string }).message ?? 'unknown'}`
    )
  }
  const delegationId = (data as { id: string }).id

  await emitPatientAuditWithAuthority({
    subjectGlobalPatientId: args.principalGlobalPatientId,
    actorUserId: args.grantedByUserId,
    actorKind: 'user',
    action: 'DELEGATION_GRANTED',
    entityType: 'patient_delegations',
    entityId: delegationId,
    authorityBasis: 'self',
    metadata: {
      delegation_id: delegationId,
      delegate_user_id: args.delegateUserId,
      delegate_global_patient_id: args.delegateGlobalPatientId ?? null,
      capabilities,
      expires_at: args.expiresAt ?? null,
      auto_renew: args.autoRenew ?? false,
    },
  })

  return { delegationId }
}

// ──────────────────────────────────────────────────────────────────────────
// 2. acceptDelegation — delegate accepts a pending grant
// ──────────────────────────────────────────────────────────────────────────

/**
 * Sets `accepted_at = NOW()` on the named grant. Emits DELEGATION_ACCEPTED.
 *
 * Authorization: `acceptingUserId` must equal the grant's
 * `delegate_user_id`. No self-claim or guardian-link branch matches —
 * acceptance is delegate-driven only.
 *
 * Idempotency: a second accept on an already-accepted grant is a no-op
 * (no audit row, no error). A grant that is revoked or expired cannot be
 * accepted (`InvalidDelegationError`).
 */
export async function acceptDelegation(
  delegationId: string,
  acceptingUserId: string
): Promise<void> {
  const supabase = createAdminClient('delegations-accept')

  const delegation = await findDelegationById(supabase, delegationId)
  if (!delegation) throw new DelegationNotFoundError(delegationId)

  if (delegation.delegate_user_id !== acceptingUserId) {
    throw new DelegationAuthorityError(
      'Only the named delegate may accept this grant'
    )
  }

  if (delegation.revoked_at) {
    throw new InvalidDelegationError(
      'Cannot accept a revoked delegation'
    )
  }
  if (
    delegation.expires_at &&
    new Date(delegation.expires_at).getTime() <= Date.now()
  ) {
    throw new InvalidDelegationError(
      'Cannot accept an expired delegation'
    )
  }

  // Idempotent: already accepted → no state change, no audit.
  if (delegation.accepted_at) return

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('patient_delegations')
    .update({ accepted_at: now })
    .eq('id', delegationId)

  if (error) {
    throw new Error(
      `acceptDelegation update failed: ${(error as { message?: string }).message ?? 'unknown'}`
    )
  }

  await emitPatientAuditWithAuthority({
    subjectGlobalPatientId: delegation.principal_global_patient_id,
    actorUserId: acceptingUserId,
    actorKind: 'user',
    action: 'DELEGATION_ACCEPTED',
    entityType: 'patient_delegations',
    entityId: delegationId,
    authorityBasis: 'delegated_by_principal',
    authorityGrantId: delegationId,
    metadata: {
      delegation_id: delegationId,
      principal_global_patient_id: delegation.principal_global_patient_id,
      capabilities: delegation.capabilities,
    },
  })
}

// ──────────────────────────────────────────────────────────────────────────
// 3. revokeDelegation — principal or delegate severs the grant
// ──────────────────────────────────────────────────────────────────────────

/**
 * Sets `revoked_at = NOW()` and `revoked_by_user_id = revokingUserId`.
 * Emits DELEGATION_REVOKED (principal-initiated) or DELEGATION_WITHDRAWN
 * (delegate-initiated); the action discriminates per architectural review
 * §3.5 lifecycle table.
 *
 * Authorization (Mo ruling 7 — chain depth = 1):
 *   - revokingUserId === delegate.delegate_user_id → withdrawal
 *   - revokingUserId === principal's claimed_user_id → revocation
 *   - any other user → `DelegationAuthorityError` (no chained authority;
 *     a delegate of the principal cannot revoke another delegate's grant)
 *
 * Idempotency: a second revoke on an already-revoked grant is a no-op
 * (no audit row, no error).
 */
export async function revokeDelegation(
  delegationId: string,
  revokingUserId: string,
  reason?: string
): Promise<void> {
  const supabase = createAdminClient('delegations-revoke')

  const delegation = await findDelegationById(supabase, delegationId)
  if (!delegation) throw new DelegationNotFoundError(delegationId)

  // Idempotent: already revoked → no state change, no audit.
  if (delegation.revoked_at) return

  // Authorization branch.
  let isWithdrawal = false
  if (delegation.delegate_user_id === revokingUserId) {
    isWithdrawal = true
  } else {
    const principalClaimedUserId = await getPrincipalClaimedUserId(
      supabase,
      delegation.principal_global_patient_id
    )
    if (principalClaimedUserId !== revokingUserId) {
      throw new DelegationAuthorityError(
        'Only the principal or the named delegate may revoke this grant ' +
          '(authority chain depth = 1 per Mo ruling 7)'
      )
    }
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('patient_delegations')
    .update({
      revoked_at: now,
      revoked_by_user_id: revokingUserId,
      revoke_reason: reason ?? null,
    })
    .eq('id', delegationId)

  if (error) {
    throw new Error(
      `revokeDelegation update failed: ${(error as { message?: string }).message ?? 'unknown'}`
    )
  }

  await emitPatientAuditWithAuthority({
    subjectGlobalPatientId: delegation.principal_global_patient_id,
    actorUserId: revokingUserId,
    actorKind: 'user',
    action: isWithdrawal ? 'DELEGATION_WITHDRAWN' : 'DELEGATION_REVOKED',
    entityType: 'patient_delegations',
    entityId: delegationId,
    authorityBasis: isWithdrawal ? 'delegated_by_principal' : 'self',
    authorityGrantId: isWithdrawal ? delegationId : null,
    metadata: {
      delegation_id: delegationId,
      principal_global_patient_id: delegation.principal_global_patient_id,
      delegate_user_id: delegation.delegate_user_id,
      reason: reason ?? null,
    },
  })
}

// ──────────────────────────────────────────────────────────────────────────
// 4. updateDelegationCapabilities — principal changes the capability set
// ──────────────────────────────────────────────────────────────────────────

/**
 * Replaces the `capabilities` jsonb array. Only the principal may invoke.
 * Capabilities cannot be added on a revoked delegation
 * (`InvalidDelegationError`).
 *
 * No-op when the new set equals the existing set (no audit row written).
 */
export async function updateDelegationCapabilities(
  delegationId: string,
  capabilities: readonly AllowedCapability[],
  updatedByUserId: string
): Promise<void> {
  validateCapabilities(capabilities)

  const supabase = createAdminClient('delegations-update-capabilities')

  const delegation = await findDelegationById(supabase, delegationId)
  if (!delegation) throw new DelegationNotFoundError(delegationId)

  if (delegation.revoked_at) {
    throw new InvalidDelegationError(
      'Cannot update capabilities on a revoked delegation'
    )
  }

  const principalClaimedUserId = await getPrincipalClaimedUserId(
    supabase,
    delegation.principal_global_patient_id
  )
  if (principalClaimedUserId !== updatedByUserId) {
    throw new DelegationAuthorityError(
      'Only the principal may update delegation capabilities'
    )
  }

  // No-op when set is unchanged. JSON.stringify on a sorted copy gives a
  // stable comparison even if the caller passed a differently-ordered
  // array than what's stored.
  const existingSorted = [...delegation.capabilities].sort()
  const incomingSorted = [...capabilities].sort()
  if (
    existingSorted.length === incomingSorted.length &&
    existingSorted.every((v, i) => v === incomingSorted[i])
  ) {
    return
  }

  const { error } = await supabase
    .from('patient_delegations')
    .update({ capabilities })
    .eq('id', delegationId)

  if (error) {
    throw new Error(
      `updateDelegationCapabilities update failed: ${(error as { message?: string }).message ?? 'unknown'}`
    )
  }

  await emitPatientAuditWithAuthority({
    subjectGlobalPatientId: delegation.principal_global_patient_id,
    actorUserId: updatedByUserId,
    actorKind: 'user',
    action: 'DELEGATION_CAPABILITIES_UPDATED',
    entityType: 'patient_delegations',
    entityId: delegationId,
    authorityBasis: 'self',
    metadata: {
      delegation_id: delegationId,
      previous_capabilities: delegation.capabilities,
      new_capabilities: capabilities,
    },
  })
}

// ──────────────────────────────────────────────────────────────────────────
// 5. listGrantedDelegations — outgoing (principal sees who they delegated to)
// ──────────────────────────────────────────────────────────────────────────

/**
 * All delegations whose principal gp is owned by `principalUserId`. Returns
 * both active and revoked grants — caller can filter on revoked_at and
 * accepted_at as needed.
 *
 * Resolves principal_global_patient_id via the gp's claimed_user_id; a
 * principal who has never claimed any gp returns an empty array.
 *
 * Phase F.5 (Section 4): rows are hydrated with `principal_display_name`
 * and `delegate_display_name` via a two-pass lookup against
 * `global_patients` (Decision 7 — hydrate at data layer; UI consumers see
 * a stable shape with placeholders for nulls).
 */
export async function listGrantedDelegations(
  principalUserId: string
): Promise<DelegationWithNames[]> {
  if (!principalUserId) return []

  const supabase = createAdminClient('delegations-list-granted')

  // Resolve all gps claimed by this user. In practice a user has 0 or 1
  // claimed gp (1:1 phone-to-user invariant from mig 075.7), but the
  // schema doesn't strictly enforce that — handle the array.
  const { data: gpRows, error: gpError } = await supabase
    .from('global_patients')
    .select('id')
    .eq('claimed_user_id', principalUserId)

  if (gpError) {
    throw new Error(
      `listGrantedDelegations gp lookup failed: ${(gpError as { message?: string }).message ?? 'unknown'}`
    )
  }
  const gpIds = ((gpRows as { id: string }[] | null) ?? []).map((r) => r.id)
  if (gpIds.length === 0) return []

  const { data, error } = await supabase
    .from('patient_delegations')
    .select(DELEGATION_COLUMNS)
    .in('principal_global_patient_id', gpIds)
    .order('granted_at', { ascending: false })

  if (error) {
    throw new Error(
      `listGrantedDelegations query failed: ${(error as { message?: string }).message ?? 'unknown'}`
    )
  }

  const delegations = (data as unknown as Delegation[]) ?? []
  return hydrateDisplayNames(supabase, delegations)
}

// ──────────────────────────────────────────────────────────────────────────
// 5b. listActiveDelegationsForGlobalPatient — clinic-side READ
// ──────────────────────────────────────────────────────────────────────────
//
// B07 Phase G — care-network surface for clinic-side patient detail pages
// (doctor + frontdesk). Returns ALL active delegations where the named
// gp is principal — i.e., the patient's currently-empowered caregivers.
//
// "Active" = accepted_at IS NOT NULL AND revoked_at IS NULL AND
// (expires_at IS NULL OR expires_at > NOW()). Pending invites and
// revoked grants are excluded because the clinic-side view is purely
// informational and never empowers a delegate (Mo ruling 24 — principal-
// side only). Listing pending/revoked rows would clutter the surface
// without giving the clinic any actionable information.
//
// AUTHORIZATION
//   The data layer does NOT enforce that the caller is clinic-side or
//   has any relationship with the patient. The clinic-side handler must
//   gate this — typically by verifying a doctor_patient_relationships
//   row + an active patient_clinic_record at the caller's clinic, per
//   D-068 (cross-clinic visibility honored). Phase G Section 6 wires
//   this gate at the handler boundary.
//
// HYDRATION
//   Reuses the `hydrateDisplayNames` helper (Phase F.5 Decision 7) so
//   principal_display_name + delegate_display_name flow through unchanged.

export async function listActiveDelegationsForGlobalPatient(
  globalPatientId: string
): Promise<DelegationWithNames[]> {
  if (!globalPatientId) return []

  const supabase = createAdminClient('delegations-list-active-for-gp')

  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('patient_delegations')
    .select(DELEGATION_COLUMNS)
    .eq('principal_global_patient_id', globalPatientId)
    .not('accepted_at', 'is', null)
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('granted_at', { ascending: false })

  if (error) {
    throw new Error(
      `listActiveDelegationsForGlobalPatient query failed: ${(error as { message?: string }).message ?? 'unknown'}`
    )
  }

  const delegations = (data as unknown as Delegation[]) ?? []
  return hydrateDisplayNames(supabase, delegations)
}

// ──────────────────────────────────────────────────────────────────────────
// 6. listReceivedDelegations — incoming (delegate sees what they can act on)
// ──────────────────────────────────────────────────────────────────────────

/**
 * All delegations where this user is the named delegate. Returns active +
 * pending + revoked grants — caller filters as needed.
 *
 * Phase F.5 (Section 4): rows are hydrated with `principal_display_name`
 * and `delegate_display_name` via a two-pass lookup against
 * `global_patients` (Decision 7).
 */
export async function listReceivedDelegations(
  delegateUserId: string
): Promise<DelegationWithNames[]> {
  if (!delegateUserId) return []

  const supabase = createAdminClient('delegations-list-received')

  const { data, error } = await supabase
    .from('patient_delegations')
    .select(DELEGATION_COLUMNS)
    .eq('delegate_user_id', delegateUserId)
    .order('granted_at', { ascending: false })

  if (error) {
    throw new Error(
      `listReceivedDelegations query failed: ${(error as { message?: string }).message ?? 'unknown'}`
    )
  }

  const delegations = (data as unknown as Delegation[]) ?? []
  return hydrateDisplayNames(supabase, delegations)
}

/**
 * Two-pass display-name hydration for Phase F.5 Section 4.
 *
 * Pass 1: collect unique `global_patients.id` values across all rows
 *         (principal_gp_id + non-null delegate_gp_id).
 * Pass 2: single `SELECT id, display_name FROM global_patients WHERE id IN (…)`.
 * Map results back onto each delegation. Rows whose `delegate_global_patient_id`
 * is NULL receive `delegate_display_name = null` (UI placeholder).
 *
 * Why two passes instead of a supabase-js relational select:
 *   `patient_delegations` has TWO FK references to `global_patients`
 *   (principal_global_patient_id + delegate_global_patient_id) plus an
 *   FK to `users` (delegate_user_id). PostgREST's embedded resource
 *   grammar requires per-FK disambiguation via constraint name, which
 *   is brittle and breaks if FK constraint names change. Two passes are
 *   straightforward, TS-safe, and cost one extra SELECT (constant
 *   regardless of N delegations).
 */
async function hydrateDisplayNames(
  supabase: ReturnType<typeof createAdminClient>,
  delegations: Delegation[]
): Promise<DelegationWithNames[]> {
  if (delegations.length === 0) return []

  const gpIdSet = new Set<string>()
  for (const d of delegations) {
    gpIdSet.add(d.principal_global_patient_id)
    if (d.delegate_global_patient_id) {
      gpIdSet.add(d.delegate_global_patient_id)
    }
  }
  const gpIds = Array.from(gpIdSet)
  if (gpIds.length === 0) {
    return delegations.map((d) => ({
      ...d,
      principal_display_name: null,
      delegate_display_name: null,
    }))
  }

  const { data, error } = await supabase
    .from('global_patients')
    .select('id, display_name')
    .in('id', gpIds)

  if (error) {
    // Hydration failure is non-fatal — return rows with null names so UI
    // falls back to placeholders rather than 500ing.
    console.error('hydrateDisplayNames lookup failed:', error)
    return delegations.map((d) => ({
      ...d,
      principal_display_name: null,
      delegate_display_name: null,
    }))
  }

  const nameById = new Map<string, string | null>()
  for (const row of (data as { id: string; display_name: string | null }[]) ??
    []) {
    nameById.set(row.id, row.display_name ?? null)
  }

  return delegations.map((d) => ({
    ...d,
    principal_display_name:
      nameById.get(d.principal_global_patient_id) ?? null,
    delegate_display_name: d.delegate_global_patient_id
      ? nameById.get(d.delegate_global_patient_id) ?? null
      : null,
  }))
}

// ──────────────────────────────────────────────────────────────────────────
// 7. expireStaleDelegations — cron-callable; sets revoked_at on stale grants
// ──────────────────────────────────────────────────────────────────────────

/**
 * Sweeps all delegations where `expires_at < NOW()` and `revoked_at IS NULL`,
 * setting `revoked_at = NOW()` and `revoked_by_user_id = NULL`. Emits one
 * `DELEGATION_EXPIRED` audit row per swept grant with `actor_kind='system'`
 * (so actor_user_id IS NULL — audit_events_actor_consistency CHECK enforced
 * by mig 073.5).
 *
 * Mirrors D-068 / Build 05 `expire-stale-shares` cron (mig 090). The
 * `revoked_by_user_id` is left NULL for system-driven revocations — the
 * mig 110 CHECK `patient_delegations_revoke_consistency_chk` requires the
 * `revoked_by_user_id` to be NOT NULL when revoked_at is set.
 *
 * IMPORTANT — schema interaction with the revoke_consistency CHECK:
 *   The CHECK is `(revoked_at IS NULL AND revoked_by_user_id IS NULL) OR
 *   (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL)`. System-
 *   driven expiry has no acting user; we cannot satisfy the CHECK with
 *   a NULL revoked_by_user_id. Two options:
 *     (a) Set revoked_by_user_id to a sentinel "system" user. There is no
 *         such user in auth.users today; creating one is an out-of-scope
 *         schema migration.
 *     (b) Use a different mechanism — set expires_at as the de-facto
 *         "revoked" signal and let `is_authorized_actor_on()` test it
 *         directly (which it already does: `expires_at IS NULL OR
 *         expires_at > NOW()`). No row mutation needed.
 *
 *   For Phase C, we adopt (b). Expired grants are not mutated; the helper
 *   function (Phase D mig 113) treats `expires_at < NOW()` as inactive,
 *   matching the patient_data_shares pattern. This function therefore:
 *     - Selects expired+unrevoked grants for AUDIT EMISSION ONLY (one
 *       DELEGATION_EXPIRED row per grant).
 *     - Does NOT mutate the row.
 *     - Returns the count of audit rows written.
 *   The sweep is idempotent across cron runs only when paired with the
 *   audit-row idempotency guard described in `metadata.cron_run_id`.
 *   Phase E cron handler is responsible for the run-id and idempotency
 *   bookkeeping; this data layer just emits the audit rows for whatever
 *   it sees. Empirical Lesson #19's class — DB-state vs. cron-state
 *   mismatch — is mitigated by treating expires_at as the source of truth.
 */
export async function expireStaleDelegations(): Promise<{ expired: number }> {
  const supabase = createAdminClient('delegations-expire-stale')

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('patient_delegations')
    .select(
      'id, principal_global_patient_id, delegate_user_id, expires_at, capabilities'
    )
    .lt('expires_at', now)
    .is('revoked_at', null)

  if (error) {
    throw new Error(
      `expireStaleDelegations query failed: ${(error as { message?: string }).message ?? 'unknown'}`
    )
  }

  const stale = (data as
    | {
        id: string
        principal_global_patient_id: string
        delegate_user_id: string
        expires_at: string | null
        capabilities: AllowedCapability[]
      }[]
    | null) ?? []

  for (const grant of stale) {
    await emitPatientAuditWithAuthority({
      subjectGlobalPatientId: grant.principal_global_patient_id,
      actorUserId: null,
      actorKind: 'system',
      action: 'DELEGATION_EXPIRED',
      entityType: 'patient_delegations',
      entityId: grant.id,
      // No authority_basis: system actions are not authority-bearing.
      metadata: {
        delegation_id: grant.id,
        delegate_user_id: grant.delegate_user_id,
        expires_at: grant.expires_at,
        capabilities: grant.capabilities,
      },
    })
  }

  return { expired: stale.length }
}
