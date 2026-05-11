/**
 * Dependents data layer (B07 Phase C — Pattern A child linkage).
 *
 * Wraps the `public.global_patients` table with minor-gp + guardian-link
 * shape (mig 109). A minor's gp:
 *   - is_minor = TRUE  (mig 109 added column, NOT NULL DEFAULT FALSE)
 *   - guardian_global_patient_id IS NOT NULL  (mig 109 CHECK)
 *   - claimed_user_id IS NULL                 (mig 109 CHECK; minors never
 *                                              self-claim — graduation is
 *                                              Phase 2 per Mo ruling 1)
 *   - normalized_phone IS NULL                (mig 076 relaxation already
 *                                              accommodates; mig 109
 *                                              recommends; minors have no
 *                                              own contact channel)
 *
 * Authority for actions on a minor's gp flows from
 * `is_authorized_actor_on()`'s guardian-link branch (Phase D mig 113):
 * the parent's claimed_user_id matches the auth.uid() driving the request.
 * No chained lookups (Mo ruling 7 — authority chain depth = 1).
 *
 * AUDIT EMISSION
 *   createMinorGlobalPatient   → GUARDIAN_LINK_CREATED
 *   transferGuardianship       → GUARDIAN_LINK_TRANSFERRED
 *   list / get                 → no audit (read-only; downstream PCR /
 *                                clinical reads emit their own audits via
 *                                clinic-side flows).
 *
 * RLS — global_patients's existing patient-side legs (mig 093) match
 *   `claimed_user_id = auth.uid()` only. Phase D mig 114 extends those
 *   legs with `OR is_authorized_actor_on(id, auth.uid())` so guardians
 *   can SELECT / UPDATE the minor's gp. Until Phase D ships, the data-
 *   layer functions here use the service-role admin client; gate with
 *   `requireApiRole('patient')` plus the Phase E `requireAuthorityOver`
 *   helper at the route boundary.
 */

import { createAdminClient } from '@shared/lib/supabase/admin'
import { emitPatientAuditWithAuthority } from '@shared/lib/data/audit'
import {
  type GlobalPatient,
  findGlobalPatientById,
} from '@shared/lib/data/global-patients'

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

/**
 * A minor gp row — same fields as GlobalPatient but `is_minor=TRUE`,
 * `guardian_global_patient_id IS NOT NULL`, `claimed_user_id IS NULL`,
 * `normalized_phone IS NULL` (recommended; Phase B leaves room for future
 * "minor with own phone" graduation, but MVP minors have NULL phone).
 *
 * Read functions return the same `GlobalPatient` shape; this alias is
 * documentary.
 */
export type MinorGlobalPatient = GlobalPatient

// ──────────────────────────────────────────────────────────────────────────
// Errors — typed for Phase E API handler error mapping.
// ──────────────────────────────────────────────────────────────────────────

export class DependentNotFoundError extends Error {
  readonly code = 'DEPENDENT_NOT_FOUND' as const
  constructor(minorGlobalPatientId: string) {
    super(`Minor global_patient ${minorGlobalPatientId} not found`)
    this.name = 'DependentNotFoundError'
  }
}

export class GuardianAuthorityError extends Error {
  readonly code = 'GUARDIAN_AUTHORITY' as const
  constructor(message: string) {
    super(message)
    this.name = 'GuardianAuthorityError'
  }
}

export class InvalidDependentError extends Error {
  readonly code = 'DEPENDENT_INVALID' as const
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDependentError'
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Normalize the `sex` input into the form the
 * `global_patients_sex_check` CHECK accepts ('Male' | 'Female' | 'Other' |
 * 'prefer_not_to_say'). Phase C accepts only the lowercased two-option
 * inputs the prompt names; we capitalize for storage to match the existing
 * convention used by `frontdesk.ts` and adult-onboarding.
 */
function normalizeSex(sex: 'male' | 'female' | undefined): string | null {
  if (sex === undefined) return null
  if (sex === 'male') return 'Male'
  if (sex === 'female') return 'Female'
  // The TS literal-union prevents this branch in practice, but defend
  // against `as` casts at API handler boundaries.
  throw new InvalidDependentError(
    `Invalid sex '${String(sex)}'; expected 'male' or 'female'`
  )
}

/**
 * Validate `dateOfBirth` is an ISO date in the past (today inclusive). The
 * `global_patients_age_check` CHECK only constrains `age` (a separate,
 * computed column), not date_of_birth, so we enforce the past-date
 * invariant at the data layer.
 */
function validateDateOfBirth(dateOfBirth: string | undefined): void {
  if (dateOfBirth === undefined) return
  const dob = new Date(dateOfBirth)
  if (isNaN(dob.getTime())) {
    throw new InvalidDependentError(
      `dateOfBirth '${dateOfBirth}' is not a valid date`
    )
  }
  if (dob.getTime() > Date.now()) {
    throw new InvalidDependentError(
      `dateOfBirth must not be in the future`
    )
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 1. createMinorGlobalPatient — guardian registers a new dependent
// ──────────────────────────────────────────────────────────────────────────

export interface CreateMinorGlobalPatientInput {
  /**
   * The guardian's (parent's) gp.id. Must be claimed (claimed_user_id NOT
   * NULL) — an unclaimed gp cannot be a guardian; the relationship has no
   * authoring user.
   */
  guardianGlobalPatientId: string
  /** Display name; required (Egyptian context, Arabic or Latin alphabet). */
  displayName: string
  /** ISO 8601 date string (YYYY-MM-DD); past-only. */
  dateOfBirth?: string
  sex?: 'male' | 'female'
  /** Per global_patients column NOT NULL; defaults to 'ar' (Arabic). */
  preferredLanguage?: string
  /**
   * The auth.users.id driving the create. Recorded on the audit row as
   * `actor_user_id`. Must equal the guardian gp's `claimed_user_id` —
   * authority over a minor flows from the parent gp's claim, not from
   * an arbitrary registering user.
   *
   * (Frontdesk / clinic-side onboarding flows that register dependents
   * do so through the patient-app endpoint chain by proxy in MVP; the
   * createdByUserId is the parent's auth.uid(). Phase E `/api/patients/
   * onboard` migration documents the bridge.)
   */
  createdByUserId: string
}

export interface CreateMinorGlobalPatientResult {
  minorGlobalPatientId: string
}

/**
 * Insert a new minor `global_patients` row with `is_minor=TRUE`,
 * `claimed_user_id=NULL`, `normalized_phone=NULL`, and
 * `guardian_global_patient_id` pointing to the named guardian.
 *
 * Validation:
 *   - guardianGlobalPatientId must exist and be claimed (claimed_user_id NOT
 *     NULL). createdByUserId must equal that claimed_user_id.
 *   - guardian must NOT itself be a minor (Mo ruling 7 — chain depth = 1;
 *     a minor cannot be a guardian).
 *   - displayName non-empty.
 *   - dateOfBirth, when supplied, is a past date.
 *   - sex, when supplied, normalizes to 'Male' or 'Female'.
 *
 * Emits GUARDIAN_LINK_CREATED audit row with subject=child gp,
 * actor=createdByUserId, acting_as='guardian_of_minor'.
 */
export async function createMinorGlobalPatient(
  args: CreateMinorGlobalPatientInput
): Promise<CreateMinorGlobalPatientResult> {
  if (!args.displayName || args.displayName.trim().length === 0) {
    throw new InvalidDependentError('displayName is required')
  }
  validateDateOfBirth(args.dateOfBirth)
  const normalizedSex = normalizeSex(args.sex)

  const supabase = createAdminClient('dependents-create')

  // Resolve guardian gp; verify (a) exists, (b) is claimed, (c) is not a
  // minor itself, (d) the createdByUserId matches the guardian's claim.
  const { data: guardian, error: guardianErr } = await supabase
    .from('global_patients')
    .select('id, claimed_user_id, is_minor, account_status')
    .eq('id', args.guardianGlobalPatientId)
    .maybeSingle()

  if (guardianErr) {
    throw new Error(
      `createMinorGlobalPatient guardian lookup failed: ${(guardianErr as { message?: string }).message ?? 'unknown'}`
    )
  }
  if (!guardian) {
    throw new GuardianAuthorityError(
      `Guardian global_patient ${args.guardianGlobalPatientId} not found`
    )
  }
  const guardianRow = guardian as {
    id: string
    claimed_user_id: string | null
    is_minor: boolean
    account_status: string
  }
  if (guardianRow.is_minor) {
    throw new GuardianAuthorityError(
      'A minor cannot be a guardian (Mo ruling 7 — authority chain depth = 1)'
    )
  }
  if (!guardianRow.claimed_user_id) {
    throw new GuardianAuthorityError(
      'Guardian gp must be claimed (claimed_user_id NOT NULL) to register a dependent'
    )
  }
  if (guardianRow.claimed_user_id !== args.createdByUserId) {
    throw new GuardianAuthorityError(
      'Only the guardian (claimed_user_id of the guardian gp) may register a dependent'
    )
  }

  // Insert the minor row. Mig 109's two CHECKs hold by construction:
  //   - is_minor=TRUE AND guardian_global_patient_id is set        ✓
  //   - is_minor=TRUE AND claimed_user_id IS NULL                  ✓
  const insertRow: Record<string, unknown> = {
    display_name: args.displayName.trim(),
    date_of_birth: args.dateOfBirth ?? null,
    sex: normalizedSex,
    preferred_language: args.preferredLanguage ?? 'ar',
    is_minor: true,
    guardian_global_patient_id: args.guardianGlobalPatientId,
    claimed: false,
    claimed_user_id: null,
    claimed_at: null,
    normalized_phone: null,
    account_status: 'active',
  }

  const { data, error } = await supabase
    .from('global_patients')
    .insert(insertRow)
    .select('id')
    .single()

  if (error) {
    throw new Error(
      `createMinorGlobalPatient insert failed: ${(error as { message?: string }).message ?? 'unknown'}`
    )
  }
  const minorGlobalPatientId = (data as { id: string }).id

  await emitPatientAuditWithAuthority({
    subjectGlobalPatientId: minorGlobalPatientId,
    actorUserId: args.createdByUserId,
    actorKind: 'user',
    action: 'GUARDIAN_LINK_CREATED',
    entityType: 'global_patients',
    entityId: minorGlobalPatientId,
    authorityBasis: 'guardian_of_minor',
    metadata: {
      guardian_global_patient_id: args.guardianGlobalPatientId,
      child_global_patient_id: minorGlobalPatientId,
      display_name: args.displayName.trim(),
      date_of_birth: args.dateOfBirth ?? null,
      sex: normalizedSex,
      preferred_language: args.preferredLanguage ?? 'ar',
    },
  })

  return { minorGlobalPatientId }
}

// ──────────────────────────────────────────────────────────────────────────
// 2. listDependentsByGuardian — guardian sees all their minors
// ──────────────────────────────────────────────────────────────────────────

/**
 * All minor gps whose `guardian_global_patient_id`'s claimed_user_id =
 * `guardianUserId`. Empty array when the user has no claimed gps or the
 * claimed gp has no linked minors.
 *
 * Authority is implicit in the query (we filter by claimed_user_id =
 * guardianUserId on the parent join). The Phase E route still gates with
 * `requireApiRole('patient')` so an unauthenticated request never reaches
 * here.
 */
export async function listDependentsByGuardian(
  guardianUserId: string
): Promise<MinorGlobalPatient[]> {
  if (!guardianUserId) return []

  const supabase = createAdminClient('dependents-list-by-guardian')

  // Two-step (resolve guardian gp ids, then minors). A nested SELECT join
  // would be cleaner, but Supabase's PostgREST grammar for FK joins
  // doesn't compose cleanly with a self-referential join across the same
  // table — the explicit two-step is more legible and TS-safe.
  const { data: guardianGps, error: gpErr } = await supabase
    .from('global_patients')
    .select('id')
    .eq('claimed_user_id', guardianUserId)

  if (gpErr) {
    throw new Error(
      `listDependentsByGuardian guardian gp lookup failed: ${(gpErr as { message?: string }).message ?? 'unknown'}`
    )
  }
  const guardianGpIds = ((guardianGps as { id: string }[] | null) ?? []).map(
    (r) => r.id
  )
  if (guardianGpIds.length === 0) return []

  const { data: minors, error: minorErr } = await supabase
    .from('global_patients')
    .select(
      `id, normalized_phone, display_name, date_of_birth, age, sex,
       preferred_language, claimed, claimed_at, claimed_user_id,
       account_status, merged_into, guardian_global_patient_id, is_minor,
       created_at, updated_at`
    )
    .eq('is_minor', true)
    .in('guardian_global_patient_id', guardianGpIds)
    .order('created_at', { ascending: false })

  if (minorErr) {
    throw new Error(
      `listDependentsByGuardian minor lookup failed: ${(minorErr as { message?: string }).message ?? 'unknown'}`
    )
  }

  return (minors as unknown as MinorGlobalPatient[]) ?? []
}

// ──────────────────────────────────────────────────────────────────────────
// 3. getDependent — fetch one minor by id; authorization-aware
// ──────────────────────────────────────────────────────────────────────────

/**
 * Returns the named minor gp. The data layer does NOT itself enforce that
 * `requestingUserId` has authority over the minor — that's the Phase E
 * `requireAuthorityOver` helper's job, and the Phase D RLS policy's job
 * once it ships. The data layer accepts requestingUserId as a parameter
 * to allow defense-in-depth at the function boundary if a caller wants
 * it; we currently use it only for audit-row breadcrumbs (NOT emitted by
 * this read function — read access is recorded via downstream PCR / view
 * actions per existing audit conventions).
 *
 * Throws `DependentNotFoundError` when the id doesn't resolve OR resolves
 * to an `is_minor=FALSE` row (a non-minor gp is not a "dependent" — caller
 * should use `findGlobalPatientById` instead).
 */
export async function getDependent(
  minorGlobalPatientId: string,
  requestingUserId: string
): Promise<MinorGlobalPatient> {
  if (!minorGlobalPatientId) {
    throw new DependentNotFoundError(minorGlobalPatientId)
  }
  // requestingUserId is currently used only by Phase E callers for
  // audit-trail breadcrumbs; suppress the unused-parameter lint at this
  // boundary by assigning to a sentinel.
  void requestingUserId

  const gp = await findGlobalPatientById(minorGlobalPatientId)
  if (!gp) throw new DependentNotFoundError(minorGlobalPatientId)
  if (!gp.is_minor) {
    throw new DependentNotFoundError(
      // Distinct shape from "not found" but caller's recovery is the
      // same — flag a non-minor gp as not-a-dependent.
      minorGlobalPatientId
    )
  }

  return gp
}

// ──────────────────────────────────────────────────────────────────────────
// 4. updateMinorProfile — B07 Phase F.5 (Section 3, Phase F finding #2)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Editable fields on a minor profile via PATCH /api/patient/dependents/[id].
 * Identity-level fields (date_of_birth, sex, is_minor,
 * guardian_global_patient_id, claimed_user_id, normalized_phone) are NOT
 * mutable via this path — they're locked post-registration to preserve
 * audit integrity (Phase F finding #2 recommendation).
 */
export interface UpdateMinorProfileInput {
  /** Display name; required-on-set (cannot blank-out). 1..200 chars. */
  displayName?: string
  /** Locale for messaging / UI. */
  preferredLanguage?: 'ar' | 'en'
}

/**
 * Update editable fields on a minor's global_patients row. Emits
 * `MINOR_PROFILE_UPDATED` audit with metadata.changed_fields recording
 * the (before, after) tuple per field for downstream auditability.
 *
 * Authorization is enforced at the API layer (Phase E pattern). This
 * function does not re-verify guardian authority — the handler calls
 * `requireAuthorityOver(minorGpId, callerUserId)` and confirms basis is
 * `'guardian_of_minor'` before invoking.
 *
 * No-op when no fields would change.
 */
export async function updateMinorProfile(
  minorGlobalPatientId: string,
  updates: UpdateMinorProfileInput,
  updatedByUserId: string
): Promise<MinorGlobalPatient> {
  if (!minorGlobalPatientId) {
    throw new DependentNotFoundError(minorGlobalPatientId)
  }

  // Validate inputs
  if (updates.displayName !== undefined) {
    const trimmed = updates.displayName.trim()
    if (trimmed.length === 0) {
      throw new InvalidDependentError(
        'displayName cannot be empty when supplied'
      )
    }
    if (trimmed.length > 200) {
      throw new InvalidDependentError(
        'displayName must be 200 characters or fewer'
      )
    }
  }
  if (updates.preferredLanguage !== undefined) {
    if (
      updates.preferredLanguage !== 'ar' &&
      updates.preferredLanguage !== 'en'
    ) {
      throw new InvalidDependentError(
        `preferredLanguage must be 'ar' or 'en'; got ${String(updates.preferredLanguage)}`
      )
    }
  }

  const supabase = createAdminClient('dependents-update-minor-profile')

  // Fetch current row for the before/after audit + minor verification.
  const { data: existing, error: fetchErr } = await supabase
    .from('global_patients')
    .select('id, is_minor, display_name, preferred_language')
    .eq('id', minorGlobalPatientId)
    .maybeSingle()
  if (fetchErr) {
    throw new Error(
      `updateMinorProfile fetch failed: ${(fetchErr as { message?: string }).message ?? 'unknown'}`
    )
  }
  if (!existing) throw new DependentNotFoundError(minorGlobalPatientId)
  const existingRow = existing as {
    id: string
    is_minor: boolean
    display_name: string | null
    preferred_language: string
  }
  if (!existingRow.is_minor) {
    throw new InvalidDependentError(
      `global_patient ${minorGlobalPatientId} is not a minor`
    )
  }

  // Compute changes
  const updateRow: Record<string, unknown> = {}
  const changedFields: Record<
    string,
    { before: string | null; after: string | null }
  > = {}

  if (updates.displayName !== undefined) {
    const newName = updates.displayName.trim()
    if (newName !== (existingRow.display_name ?? '')) {
      updateRow.display_name = newName
      changedFields.display_name = {
        before: existingRow.display_name,
        after: newName,
      }
    }
  }
  if (updates.preferredLanguage !== undefined) {
    if (updates.preferredLanguage !== existingRow.preferred_language) {
      updateRow.preferred_language = updates.preferredLanguage
      changedFields.preferred_language = {
        before: existingRow.preferred_language,
        after: updates.preferredLanguage,
      }
    }
  }

  // No-op short-circuit — no audit row written.
  if (Object.keys(updateRow).length === 0) {
    const gp = await findGlobalPatientById(minorGlobalPatientId)
    if (!gp) throw new DependentNotFoundError(minorGlobalPatientId)
    return gp
  }

  const { error: updateErr } = await supabase
    .from('global_patients')
    .update(updateRow)
    .eq('id', minorGlobalPatientId)
  if (updateErr) {
    throw new Error(
      `updateMinorProfile update failed: ${(updateErr as { message?: string }).message ?? 'unknown'}`
    )
  }

  await emitPatientAuditWithAuthority({
    subjectGlobalPatientId: minorGlobalPatientId,
    actorUserId: updatedByUserId,
    actorKind: 'user',
    action: 'MINOR_PROFILE_UPDATED',
    entityType: 'global_patients',
    entityId: minorGlobalPatientId,
    authorityBasis: 'guardian_of_minor',
    metadata: {
      changed_fields: changedFields,
    },
  })

  const updated = await findGlobalPatientById(minorGlobalPatientId)
  if (!updated) throw new DependentNotFoundError(minorGlobalPatientId)
  return updated
}

// ──────────────────────────────────────────────────────────────────────────
// 5. transferGuardianship — schema accommodation; no UX MVP
// ──────────────────────────────────────────────────────────────────────────

/**
 * Re-points `guardian_global_patient_id` from the existing parent to a
 * new parent. Per Mo ruling 5, custody-dispute mechanism is Phase 2 — no
 * UX in MVP invokes this function. The data layer ships forward-
 * compatible so a future custody workstream has a stable surface.
 *
 * Validation:
 *   - The new guardian gp must exist, be claimed, and not itself be a
 *     minor (Mo ruling 7).
 *   - The transferring user must be either the previous guardian
 *     (claimed_user_id of previous parent) OR a clinic-supervisor staff
 *     account in MVP terms — but since clinic-supervisor authority isn't
 *     plumbed yet, the MVP gate is "previous guardian only." A separate
 *     `transferGuardianshipBySupervisor` could ship in Phase 2 with
 *     extended authorization; left as a TODO comment for now.
 *
 * Emits GUARDIAN_LINK_TRANSFERRED audit row with metadata recording both
 * the previous and new guardian gp ids.
 */
export async function transferGuardianship(
  minorGlobalPatientId: string,
  newGuardianGlobalPatientId: string,
  transferredByUserId: string
): Promise<void> {
  if (minorGlobalPatientId === newGuardianGlobalPatientId) {
    throw new InvalidDependentError(
      'minor and new guardian must be different gp ids'
    )
  }

  const supabase = createAdminClient('dependents-transfer-guardian')

  const { data: minor, error: minorErr } = await supabase
    .from('global_patients')
    .select('id, is_minor, guardian_global_patient_id')
    .eq('id', minorGlobalPatientId)
    .maybeSingle()
  if (minorErr) {
    throw new Error(
      `transferGuardianship minor lookup failed: ${(minorErr as { message?: string }).message ?? 'unknown'}`
    )
  }
  if (!minor) throw new DependentNotFoundError(minorGlobalPatientId)
  const minorRow = minor as {
    id: string
    is_minor: boolean
    guardian_global_patient_id: string | null
  }
  if (!minorRow.is_minor) {
    throw new InvalidDependentError(
      `global_patient ${minorGlobalPatientId} is not a minor (cannot transfer guardianship)`
    )
  }
  const previousGuardianId = minorRow.guardian_global_patient_id

  // Resolve the previous guardian's claimed_user_id (for the authority
  // check). If the minor is currently orphaned (parent deleted, ON DELETE
  // SET NULL fired), there is no previous guardian to authorize the
  // transfer; this MVP path declines the transfer. Future clinic-
  // supervisor flow can land in Phase 2.
  if (!previousGuardianId) {
    throw new GuardianAuthorityError(
      'Cannot transfer guardianship of an orphaned minor (no previous ' +
        'guardian to authorize). Phase 2 clinic-supervisor flow required.'
    )
  }

  const { data: prevGuardian, error: prevErr } = await supabase
    .from('global_patients')
    .select('claimed_user_id')
    .eq('id', previousGuardianId)
    .maybeSingle()
  if (prevErr) {
    throw new Error(
      `transferGuardianship previous-guardian lookup failed: ${(prevErr as { message?: string }).message ?? 'unknown'}`
    )
  }
  const prevClaimed = ((prevGuardian as { claimed_user_id: string | null } | null)
    ?.claimed_user_id) ?? null
  if (prevClaimed !== transferredByUserId) {
    throw new GuardianAuthorityError(
      'Only the current guardian may transfer guardianship in MVP. ' +
        '(Mo ruling 5 — custody-dispute / clinic-supervisor flow is Phase 2.)'
    )
  }

  // Resolve and validate the new guardian.
  const { data: newGuardian, error: newGuardianErr } = await supabase
    .from('global_patients')
    .select('id, claimed_user_id, is_minor')
    .eq('id', newGuardianGlobalPatientId)
    .maybeSingle()
  if (newGuardianErr) {
    throw new Error(
      `transferGuardianship new-guardian lookup failed: ${(newGuardianErr as { message?: string }).message ?? 'unknown'}`
    )
  }
  if (!newGuardian) {
    throw new GuardianAuthorityError(
      `New guardian global_patient ${newGuardianGlobalPatientId} not found`
    )
  }
  const newGuardianRow = newGuardian as {
    id: string
    claimed_user_id: string | null
    is_minor: boolean
  }
  if (newGuardianRow.is_minor) {
    throw new GuardianAuthorityError(
      'A minor cannot be a guardian (Mo ruling 7 — authority chain depth = 1)'
    )
  }
  if (!newGuardianRow.claimed_user_id) {
    throw new GuardianAuthorityError(
      'New guardian gp must be claimed (claimed_user_id NOT NULL)'
    )
  }

  // Apply the update. Mig 109 CHECK still holds:
  //   is_minor=TRUE AND guardian_global_patient_id IS NOT NULL  ✓
  const { error: updateErr } = await supabase
    .from('global_patients')
    .update({ guardian_global_patient_id: newGuardianGlobalPatientId })
    .eq('id', minorGlobalPatientId)
  if (updateErr) {
    throw new Error(
      `transferGuardianship update failed: ${(updateErr as { message?: string }).message ?? 'unknown'}`
    )
  }

  await emitPatientAuditWithAuthority({
    subjectGlobalPatientId: minorGlobalPatientId,
    actorUserId: transferredByUserId,
    actorKind: 'user',
    action: 'GUARDIAN_LINK_TRANSFERRED',
    entityType: 'global_patients',
    entityId: minorGlobalPatientId,
    authorityBasis: 'guardian_of_minor',
    metadata: {
      previous_guardian_id: previousGuardianId,
      new_guardian_id: newGuardianGlobalPatientId,
      child_global_patient_id: minorGlobalPatientId,
    },
  })
}
