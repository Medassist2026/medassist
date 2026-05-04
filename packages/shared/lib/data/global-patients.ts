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
  normalized_phone: string
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
