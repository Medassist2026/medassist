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

import { nanoid } from 'nanoid'
import { createAdminClient } from '@shared/lib/supabase/admin'
import {
  emitPatientAuditWithAuthority,
  logAuditEvent,
} from '@shared/lib/data/audit'
import {
  type GlobalPatient,
  findGlobalPatientById,
} from '@shared/lib/data/global-patients'
import { getOrCreatePatientClinicRecord } from '@shared/lib/data/patient-clinic-records'

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
// 1b. establishMinorClinicPresence — clinic-side rows for a minor gp
// ──────────────────────────────────────────────────────────────────────────
//
// Phase G Section 1 — Mo's ruling 2026-05-10 (B07 Phase G prompt refinement):
// "The `onboardPatient` v2 path with `isDependent: true` must create
//  `(global_patients, patients, PCR, DPR)` — all four rows — at the
//  registering clinic, matching the empirical pattern of mig 111 minors
//  and the structure of adult onboarding. Original Phase E modification
//  was incomplete; Phase G completes it."
//
// Phase E's `createMinorGlobalPatient` creates only the gp row. The 3
// backfilled minors (mig 111) demonstrate the complete shape clinics
// need: (gp, patients, PCR, DPR). Without those clinic-scoped rows,
// new minors cannot be added to a queue, sessioned, prescribed for, or
// have any clinical data created — every clinical table FKs to
// patients(id) and mig 081's compat trigger raises EXCEPTION when no
// patients row exists for the (gpid, clinicId) pair.
//
// This helper takes the post-`createMinorGlobalPatient` state and lands
// the missing (patients, PCR, DPR) rows at the registering clinic. It
// mirrors the legacy `createWalkInPatient` shape (synthetic DEP_*
// phone, dummy auth user, MED-* unique_id) so mig 081 triggers function
// correctly downstream.
//
// AUDIT EMISSION
//   - CREATE_PATIENT (subject=patients.id, kind='user', actor=doctorId)
//     emitted for the clinic-scoped patients row.
//   - PCR creation emits its own audit via the existing
//     `tg_audit_pcr_insert_trg` trigger.
//   - DPR creation is recorded by the relationship row itself; no
//     separate audit (matches the existing adult-onboarding convention).
//
// CONCURRENCY
//   Reuses `getOrCreatePatientClinicRecord`'s race-safe upsert. The
//   patients row insert relies on PK uniqueness of patients.id (= new
//   auth user id) so a concurrent retry won't collide.
//
// IDEMPOTENCY
//   NOT idempotent on its own — calling twice with the same minor
//   gp creates two patients/users rows. The caller (onboard handler)
//   should check first whether the minor already has a patients row
//   at this clinic and skip this helper if so.

export interface EstablishMinorClinicPresenceInput {
  /** The minor's gp.id (just created via `createMinorGlobalPatient`). */
  minorGlobalPatientId: string
  /** The guardian's gp.id (used for `patients.guardian_id` resolution). */
  guardianGlobalPatientId: string
  /** Clinic where the minor is being registered. */
  clinicId: string
  /** Doctor selected at registration (frontdesk picks one; doctor self-onboards as themselves). */
  doctorId: string
  /** Guardian's phone in raw entered form (used for `patients.parent_phone`). */
  parentPhone: string
  /** Minor's display name (= `patients.full_name`). */
  displayName: string
  /** Minor's age in years (= `patients.age`). May be null when unknown. */
  age: number | null
  /** Sex in Patient table convention ('Male' | 'Female' | 'Other' | null). */
  sex: 'Male' | 'Female' | 'Other' | null
  /**
   * Guardian's `claimed_user_id` — used as the audit actor for the
   * CREATE_PATIENT event so audit attribution matches the
   * `createMinorGlobalPatient` GUARDIAN_LINK_CREATED row.
   */
  createdByUserId: string
}

export interface EstablishMinorClinicPresenceResult {
  /** The new patients.id (= new auth.users.id). */
  patientId: string
  /** The new patients.unique_id (MED-XXXXXX). */
  patientUniqueId: string
  /** The synthetic DEP_<timestamp>_<rand> phone stored on patients.phone. */
  patientPhone: string
  /** The patient_clinic_records.id. */
  pcrId: string
  /** The doctor_patient_relationships.id. */
  dprId: string
}

/**
 * Land (patients, PCR, DPR) rows at `clinicId` for the freshly-created
 * minor gp. Must be called AFTER `createMinorGlobalPatient` has succeeded.
 *
 * The returned `patientId` is the value that the legacy onboard response
 * shape returns under `patient.id`, so existing UI code (queue-add,
 * session start) continues to work for minors without further changes.
 */
export async function establishMinorClinicPresence(
  args: EstablishMinorClinicPresenceInput
): Promise<EstablishMinorClinicPresenceResult> {
  if (!args.minorGlobalPatientId) {
    throw new InvalidDependentError('minorGlobalPatientId is required')
  }
  if (!args.clinicId) {
    throw new InvalidDependentError('clinicId is required')
  }
  if (!args.doctorId) {
    throw new InvalidDependentError('doctorId is required')
  }
  if (!args.parentPhone) {
    throw new InvalidDependentError('parentPhone is required')
  }
  if (!args.displayName || args.displayName.trim().length === 0) {
    throw new InvalidDependentError('displayName is required')
  }

  const supabase = createAdminClient('dependents-establish-clinic-presence')

  // ──────────────────────────────────────────────────────────────────
  // Step 1: Create silent auth.users (walk-in dummy email pattern,
  // matches `createWalkInPatient` lines 575-589). patients.id FKs to
  // public.users(id), which itself FKs to auth.users — so the chain
  // must exist.
  // ──────────────────────────────────────────────────────────────────
  const dummyEmail = `walkin_minor_${nanoid(8)}@medassist.temp`
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: dummyEmail,
    email_confirm: true,
    user_metadata: {
      role: 'patient',
      is_walkin: true,
      is_minor: true,
      full_name: args.displayName.trim(),
    },
  })
  if (authErr || !authData?.user) {
    throw new Error(
      `establishMinorClinicPresence: auth user create failed: ${authErr?.message ?? 'unknown'}`
    )
  }
  const userId = authData.user.id

  // Cleanup helper — rollback auth user if any downstream step fails.
  const rollbackAuth = async (reason: string): Promise<never> => {
    try {
      await supabase.auth.admin.deleteUser(userId)
    } catch {
      // Best effort; the auth row may already be orphan-collected.
    }
    throw new Error(`establishMinorClinicPresence rolled back: ${reason}`)
  }

  // ──────────────────────────────────────────────────────────────────
  // Step 2: Create public.users row (FK target for patients.id).
  // Synthetic DEP_* phone (matches minors #2/#3 from mig 111 backfill;
  // avoids collision with the parent's real phone in adult patient
  // searches keyed off patients.phone).
  // ──────────────────────────────────────────────────────────────────
  const syntheticPhone = `DEP_${Date.now()}_${nanoid(5).toUpperCase()}`

  const { error: userErr } = await supabase
    .from('users')
    .insert({
      id: userId,
      phone: syntheticPhone,
      role: 'patient',
    })
  if (userErr) {
    await rollbackAuth(`users insert: ${userErr.message}`)
  }

  // ──────────────────────────────────────────────────────────────────
  // Step 3: Resolve guardian's patients.id at THIS clinic (if any).
  // patients.guardian_id is the legacy FK — populate it when the
  // guardian has a row at this clinic so legacy doctor-side UI that
  // surfaces "guardian name" via patients.guardian_id keeps working.
  // ──────────────────────────────────────────────────────────────────
  let resolvedGuardianId: string | null = null
  const { data: guardianPatientRow } = await supabase
    .from('patients')
    .select('id')
    .eq('global_patient_id', args.guardianGlobalPatientId)
    .eq('clinic_id', args.clinicId)
    .limit(1)
    .maybeSingle()
  if (guardianPatientRow?.id) {
    resolvedGuardianId = (guardianPatientRow as { id: string }).id
  }

  // ──────────────────────────────────────────────────────────────────
  // Step 4: Create the public.patients row. is_canonical=TRUE so mig
  // 081's compat trigger picks this row when deriving patient_id from
  // (gpid, clinicId) for clinical inserts.
  // ──────────────────────────────────────────────────────────────────
  const patientUniqueId = `MED-${nanoid(6).toUpperCase()}`
  const now = new Date().toISOString()

  const { data: patientRow, error: patientErr } = await supabase
    .from('patients')
    .insert({
      id: userId,
      unique_id: patientUniqueId,
      phone: syntheticPhone,
      full_name: args.displayName.trim(),
      age: args.age,
      sex: args.sex,
      is_dependent: true,
      parent_phone: args.parentPhone,
      guardian_id: resolvedGuardianId,
      registered: false,
      phone_verified: false,
      account_status: 'active',
      last_activity_at: now,
      created_by_doctor_id: args.doctorId,
      clinic_id: args.clinicId,
      global_patient_id: args.minorGlobalPatientId,
      is_canonical: true,
    })
    .select('id, unique_id, phone')
    .single()

  if (patientErr || !patientRow) {
    // Cleanup users row before bouncing auth.
    await supabase.from('users').delete().eq('id', userId)
    await rollbackAuth(`patients insert: ${patientErr?.message ?? 'unknown'}`)
  }
  const patientId = (patientRow as { id: string }).id

  // ──────────────────────────────────────────────────────────────────
  // Step 5: Audit (CREATE_PATIENT). Mirrors existing
  // `createWalkInPatient` audit shape so admin tooling that lists
  // patient-creation events handles minors uniformly.
  // ──────────────────────────────────────────────────────────────────
  await logAuditEvent({
    clinicId: args.clinicId,
    actorUserId: args.createdByUserId,
    action: 'CREATE_PATIENT',
    entityType: 'patient',
    entityId: patientId,
    metadata: {
      is_minor: true,
      global_patient_id: args.minorGlobalPatientId,
      guardian_global_patient_id: args.guardianGlobalPatientId,
      parent_phone: args.parentPhone,
      full_name: args.displayName.trim(),
      age: args.age,
      sex: args.sex,
      clinic_id: args.clinicId,
      created_by_doctor_id: args.doctorId,
      authority_basis: 'guardian_of_minor',
    },
  })

  // ──────────────────────────────────────────────────────────────────
  // Step 6: PCR via existing race-safe helper.
  // ──────────────────────────────────────────────────────────────────
  const pcr = await getOrCreatePatientClinicRecord(
    args.minorGlobalPatientId,
    args.clinicId,
    {
      isAnonymousToGlobal: false,
      consentToMessaging: false,
    }
  )

  // ──────────────────────────────────────────────────────────────────
  // Step 7: DPR (doctor_patient_relationships). Walk-in / pending
  // shape, matching what `createWalkInPatient` produces. Mig 081 will
  // auto-fill global_patient_id + patient_clinic_record_id via trigger.
  // ──────────────────────────────────────────────────────────────────
  // NOTE on `relationship_type`: the table's CHECK constraint allows
  // only ('primary' | 'secondary' | 'consultant'). The legacy
  // `createWalkInPatient` (patients.ts) historically wrote 'walk_in'
  // here which violates the CHECK; the 3 mig-111 backfilled minors
  // empirically carry 'primary'. We use 'primary' for new minor
  // registrations to match the empirical convention and clear the
  // CHECK.
  const { data: dprRow, error: dprErr } = await supabase
    .from('doctor_patient_relationships')
    .insert({
      doctor_id: args.doctorId,
      patient_id: patientId,
      clinic_id: args.clinicId,
      status: 'active',
      relationship_type: 'primary',
      access_level: 'walk_in_limited',
      consent_state: 'pending',
      access_type: 'walk_in',
      notes: 'walk-in (dependent registration)',
      last_visit_at: now,
      doctor_entered_name: args.displayName.trim(),
      doctor_entered_age: args.age ?? undefined,
      doctor_entered_sex: args.sex ?? undefined,
    })
    .select('id')
    .single()

  if (dprErr || !dprRow) {
    // PCR + patients already exist; DPR failure is non-fatal for the
    // minor's clinic-scoped presence but blocks doctor-list visibility.
    // Throw so the caller surfaces it; the patients + PCR rows persist
    // (re-running registration will pick them up via the dedup branch
    // in onboardPatient when adult-style retry is wired in).
    throw new Error(
      `establishMinorClinicPresence: DPR insert failed: ${dprErr?.message ?? 'unknown'}`
    )
  }
  const dprId = (dprRow as { id: string }).id

  return {
    patientId,
    patientUniqueId,
    patientPhone: syntheticPhone,
    pcrId: pcr.id,
    dprId,
  }
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
