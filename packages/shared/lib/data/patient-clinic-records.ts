/**
 * Data-access layer for `public.patient_clinic_records` — Layer 2 of the
 * patient identity refactor (mig 075 / Build prompt 03).
 *
 * SCOPE — Build prompt 03:
 *   patient_clinic_records is the per-clinic relationship row hanging off
 *   global_patients. UNIQUE(global_patient_id, clinic_id) is load-bearing.
 *   This module powers Step B11 (data layer cutover) and Step B12 (admin
 *   endpoint). It does NOT yet drive any user-facing UI — that ships in
 *   Prompt 4 (privacy code) and Prompt 10 (patient app).
 *
 * RLS — Like global_patients, patient_clinic_records carries a DENY-ALL
 *   placeholder policy (ORPH-V3-01; real policies ship in Prompt 6 / Build 06).
 *   This file uses createAdminClient so it bypasses RLS. Do NOT call these
 *   functions from contexts where the caller's session should be respected —
 *   gate them at the route boundary with requireApiRole(...) /
 *   requireServiceRole().
 */

import { createAdminClient } from '@shared/lib/supabase/admin'

/** Shape of a public.patient_clinic_records row. */
export interface PatientClinicRecord {
  id: string
  global_patient_id: string
  clinic_id: string
  is_anonymous_to_global: boolean
  consent_to_messaging: boolean
  consent_to_messaging_granted_at: string | null
  first_seen_at: string
  last_seen_at: string
  created_at: string
  updated_at: string
}

const PCR_COLUMNS = `
  id,
  global_patient_id,
  clinic_id,
  is_anonymous_to_global,
  consent_to_messaging,
  consent_to_messaging_granted_at,
  first_seen_at,
  last_seen_at,
  created_at,
  updated_at
`

/**
 * Find the patient_clinic_records row for a (global_patient_id, clinic_id)
 * pair. Returns null if none exists.
 */
export async function findPatientClinicRecord(
  globalPatientId: string,
  clinicId: string
): Promise<PatientClinicRecord | null> {
  if (!globalPatientId || !clinicId) return null

  const supabase = createAdminClient('patient-clinic-records-find')
  const { data, error } = await supabase
    .from('patient_clinic_records')
    .select(PCR_COLUMNS)
    .eq('global_patient_id', globalPatientId)
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null
    throw new Error(
      `findPatientClinicRecord failed: ${(error as { message?: string }).message ?? 'unknown error'}`
    )
  }
  return (data as unknown as PatientClinicRecord) ?? null
}

/**
 * Find or create the patient_clinic_records row for a (global_patient_id,
 * clinic_id) pair. Bumps last_seen_at on every call (so the
 * (clinic_id, last_seen_at DESC) index stays warm with current activity).
 *
 * Returns the row. Always non-null on success.
 *
 * Concurrency note: relies on the UNIQUE(global_patient_id, clinic_id)
 * constraint to handle races. Two concurrent calls with the same
 * (gpid, cid) will both see "no row exists", both attempt INSERT, and one
 * will fail on UNIQUE — we retry the SELECT in that branch.
 */
export async function getOrCreatePatientClinicRecord(
  globalPatientId: string,
  clinicId: string,
  options?: {
    isAnonymousToGlobal?: boolean
    consentToMessaging?: boolean
  }
): Promise<PatientClinicRecord> {
  if (!globalPatientId || !clinicId) {
    throw new Error('getOrCreatePatientClinicRecord: globalPatientId and clinicId are required')
  }

  const supabase = createAdminClient('patient-clinic-records-upsert')

  // Attempt 1: fast path — row already exists.
  const existing = await findPatientClinicRecord(globalPatientId, clinicId)
  if (existing) {
    // Bump last_seen_at. We don't await consistency here — the next read
    // will see the new timestamp; if the update fails, the recency index
    // is slightly stale and that's acceptable.
    await supabase
      .from('patient_clinic_records')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', existing.id)
    return { ...existing, last_seen_at: new Date().toISOString() }
  }

  // Attempt 2: create.
  const insertPayload: Partial<PatientClinicRecord> = {
    global_patient_id: globalPatientId,
    clinic_id: clinicId,
    is_anonymous_to_global: options?.isAnonymousToGlobal ?? false,
    consent_to_messaging: options?.consentToMessaging ?? false,
    consent_to_messaging_granted_at: options?.consentToMessaging ? new Date().toISOString() : null,
  }

  const { data, error } = await supabase
    .from('patient_clinic_records')
    .insert(insertPayload)
    .select(PCR_COLUMNS)
    .single()

  if (error) {
    // 23505 = unique_violation. Race with another caller — re-read.
    if ((error as { code?: string }).code === '23505') {
      const raced = await findPatientClinicRecord(globalPatientId, clinicId)
      if (raced) return raced
    }
    throw new Error(
      `getOrCreatePatientClinicRecord failed: ${(error as { message?: string }).message ?? 'unknown error'}`
    )
  }

  return data as unknown as PatientClinicRecord
}

/**
 * List every per-clinic record for a global patient. Used to render the
 * patient-app "clinics where my data lives" view (Prompt 10) and the
 * admin "show me everywhere this patient appears" surface.
 */
export async function listPatientClinicRecordsForGlobal(
  globalPatientId: string
): Promise<PatientClinicRecord[]> {
  if (!globalPatientId) return []

  const supabase = createAdminClient('patient-clinic-records-list-global')
  const { data, error } = await supabase
    .from('patient_clinic_records')
    .select(PCR_COLUMNS)
    .eq('global_patient_id', globalPatientId)
    .order('last_seen_at', { ascending: false })

  if (error) {
    throw new Error(
      `listPatientClinicRecordsForGlobal failed: ${(error as { message?: string }).message ?? 'unknown error'}`
    )
  }
  return (data as unknown as PatientClinicRecord[]) ?? []
}

/**
 * List per-clinic records at a clinic, ordered by recency. Pagination
 * is offset-based; max page size capped at 100 to keep the admin endpoint
 * responsive.
 */
export async function listPatientClinicRecordsForClinic(
  clinicId: string,
  options?: { limit?: number; offset?: number }
): Promise<PatientClinicRecord[]> {
  if (!clinicId) return []

  const limit = Math.min(options?.limit ?? 50, 100)
  const offset = options?.offset ?? 0

  const supabase = createAdminClient('patient-clinic-records-list-clinic')
  const { data, error } = await supabase
    .from('patient_clinic_records')
    .select(PCR_COLUMNS)
    .eq('clinic_id', clinicId)
    .order('last_seen_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    throw new Error(
      `listPatientClinicRecordsForClinic failed: ${(error as { message?: string }).message ?? 'unknown error'}`
    )
  }
  return (data as unknown as PatientClinicRecord[]) ?? []
}
