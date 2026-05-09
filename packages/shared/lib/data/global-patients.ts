/**
 * Data-access layer for `public.global_patients` (the global identity
 * table introduced by mig 072).
 *
 * SCOPE — Build prompt 02:
 *   The application data layer still reads from `patients.*`. This file
 *   exists to power the admin verification endpoint
 *   `GET /api/admin/global-patients/lookup` (B7) and to give
 *   subsequent prompts a single import surface for global identity
 *   queries. It does NOT change any read path used by clinic / patient
 *   apps. That cutover is owed by Prompt 3.
 *
 * RLS — global_patients carries a DENY-ALL placeholder policy. Direct
 * authenticated SELECT will return zero rows. This file uses the
 * service-role admin client (`createAdminClient`) for that reason. Do
 * NOT call these functions from contexts where the caller's session
 * should be respected — gate them with `requireApiRole(...)` at the
 * route boundary.
 */

import { createAdminClient } from '@shared/lib/supabase/admin'
import { normalizeEgyptianPhone } from '@shared/lib/utils/phone-normalize'

/** Shape returned by `findGlobalPatientByPhone`. */
export interface GlobalPatient {
  id: string
  /**
   * Nullable since mig 076 (PATH B sentinels) and mig 109 (B07 minor gps).
   * - Sentinel rows: account_status='locked', legacy_phone preserved.
   * - Minor rows: is_minor=TRUE, contact via guardian_global_patient_id.
   * Adult claimed gps still always carry a non-NULL E.164 phone in practice.
   */
  normalized_phone: string | null
  display_name: string | null
  date_of_birth: string | null
  age: number | null
  sex: string | null
  preferred_language: string
  claimed: boolean
  claimed_at: string | null
  claimed_user_id: string | null
  account_status: 'active' | 'suspended' | 'locked' | 'deceased' | 'merged' | 'dormant'
  merged_into: string | null
  /**
   * B07 Pattern A linkage (mig 109). Non-NULL only when this gp is a minor
   * dependent — referenced parent gp's id. ON DELETE SET NULL preserves the
   * child row when the parent is deleted (clinic re-link flow).
   */
  guardian_global_patient_id: string | null
  /**
   * B07 minor flag (mig 109). When TRUE, guardian_global_patient_id is
   * required (CHECK global_patients_minor_requires_guardian_chk) and
   * claimed_user_id MUST be NULL (CHECK global_patients_minor_no_self_claim_chk).
   * Authority over this gp flows from `is_authorized_actor_on()`'s
   * guardian-link branch (Phase D mig 113).
   */
  is_minor: boolean
  created_at: string
  updated_at: string
}

/** Columns selected by every `global_patients` query. */
const GLOBAL_PATIENT_COLUMNS = `
  id,
  normalized_phone,
  display_name,
  date_of_birth,
  age,
  sex,
  preferred_language,
  claimed,
  claimed_at,
  claimed_user_id,
  account_status,
  merged_into,
  guardian_global_patient_id,
  is_minor,
  created_at,
  updated_at
`

/**
 * Resolve a global patient by raw phone input. Caller-supplied phone
 * is normalized to E.164 first; if normalization fails, returns null
 * (do NOT raise — match the lookup endpoint's "unknown phone = 404"
 * shape).
 *
 * Used by: `/api/admin/global-patients/lookup` (B7) — admin verifies
 * the identity layer is wired up. NOT called by user-facing code paths.
 */
export async function findGlobalPatientByPhone(
  rawPhone: string
): Promise<GlobalPatient | null> {
  const normalized = normalizeEgyptianPhone(rawPhone)
  if (normalized === null) return null

  const supabase = createAdminClient('global-patients-lookup')
  const { data, error } = await supabase
    .from('global_patients')
    .select(GLOBAL_PATIENT_COLUMNS)
    .eq('normalized_phone', normalized)
    .maybeSingle()

  if (error) {
    // PGRST116 = "no rows" from PostgREST under .single(); we use
    // .maybeSingle() so it shouldn't fire — guard anyway.
    if ((error as { code?: string }).code === 'PGRST116') return null
    throw new Error(
      `findGlobalPatientByPhone failed: ${(error as { message?: string }).message ?? 'unknown error'}`
    )
  }

  return (data as unknown as GlobalPatient) ?? null
}

/**
 * Resolve a minor's guardian gp via the `guardian_global_patient_id` FK
 * (B07 Phase C — Pattern A child linkage).
 *
 * Returns the parent gp row if `minorGlobalPatientId` is a minor with a
 * non-NULL `guardian_global_patient_id`. Returns NULL when:
 *   - the minor gp doesn't exist
 *   - the gp exists but is_minor=FALSE (no guardian relationship)
 *   - the gp exists and is_minor=TRUE but guardian_global_patient_id is NULL
 *     (orphaned minor — parent's gp was deleted, ON DELETE SET NULL fired;
 *     clinic re-link flow is responsible for repairing)
 *   - the parent gp pointed to was itself deleted between FK resolution and
 *     the followup SELECT (race; treated as "no guardian" for the caller)
 *
 * Authority chain depth = 1 per Mo ruling 7. This function does NOT walk
 * the FK recursively — if the parent gp itself has a guardian_global_patient_id
 * (which the schema doesn't prevent but ruling 6 disallows), that link is
 * not followed. `is_authorized_actor_on()` (mig 113) similarly enforces
 * single-hop authority.
 */
export async function getGuardianGlobalPatient(
  minorGlobalPatientId: string
): Promise<GlobalPatient | null> {
  if (!minorGlobalPatientId || typeof minorGlobalPatientId !== 'string') {
    return null
  }

  const supabase = createAdminClient('global-patients-guardian-lookup')

  // Two-step (vs. JOIN) for explicit semantics: we want to differentiate
  // "minor has no guardian set" (not-an-error, return null) from
  // "minor doesn't exist" (also return null) without coupling them in a
  // single query.
  const { data: minor, error: minorErr } = await supabase
    .from('global_patients')
    .select('id, is_minor, guardian_global_patient_id')
    .eq('id', minorGlobalPatientId)
    .maybeSingle()

  if (minorErr) {
    if ((minorErr as { code?: string }).code === 'PGRST116') return null
    throw new Error(
      `getGuardianGlobalPatient (minor lookup) failed: ${(minorErr as { message?: string }).message ?? 'unknown error'}`
    )
  }
  if (!minor || !minor.guardian_global_patient_id) return null

  const { data: guardian, error: guardianErr } = await supabase
    .from('global_patients')
    .select(GLOBAL_PATIENT_COLUMNS)
    .eq('id', minor.guardian_global_patient_id)
    .maybeSingle()

  if (guardianErr) {
    if ((guardianErr as { code?: string }).code === 'PGRST116') return null
    throw new Error(
      `getGuardianGlobalPatient (guardian lookup) failed: ${(guardianErr as { message?: string }).message ?? 'unknown error'}`
    )
  }

  return (guardian as unknown as GlobalPatient) ?? null
}

/**
 * Resolve a global patient by id (UUID). Used by future prompts; kept
 * here to avoid scattering identity reads across modules.
 */
export async function findGlobalPatientById(
  id: string
): Promise<GlobalPatient | null> {
  if (!id || typeof id !== 'string') return null

  const supabase = createAdminClient('global-patients-lookup')
  const { data, error } = await supabase
    .from('global_patients')
    .select(GLOBAL_PATIENT_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null
    throw new Error(
      `findGlobalPatientById failed: ${(error as { message?: string }).message ?? 'unknown error'}`
    )
  }

  return (data as unknown as GlobalPatient) ?? null
}
