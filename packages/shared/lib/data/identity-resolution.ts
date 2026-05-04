/**
 * Identity-resolution front door — Build prompt 03 / Step B11.
 *
 * This is the canonical entry point for ANY operation that needs to
 * resolve a patient's identity from an external input (phone number,
 * raw user payload). Going forward, new code paths SHOULD use these
 * helpers instead of querying public.patients directly by phone.
 *
 * WHY
 *   public.patients is per-clinic. Two clinics seeing the same patient
 *   see two different patients.id values. The network model needs a
 *   stable cross-clinic anchor — global_patients(id). Resolving by
 *   phone via patients.phone always picks one clinic's view; resolving
 *   via global_patients.normalized_phone picks the patient.
 *
 * BACKWARDS COMPATIBILITY
 *   Until Prompt 6.5 ships, the compatibility shim triggers (mig 081)
 *   keep legacy patients-keyed writes consistent with global_patients
 *   and patient_clinic_records. Existing call sites that haven't
 *   adopted these helpers yet keep working — they just don't get the
 *   identity-first behavior.
 *
 * CUTOVER STATUS (2026-04-29 Build 03 ship)
 *   Functions defined here:
 *     - resolveOrCreateGlobalIdentity(phone, opts) — primary helper
 *     - resolveIdentityForClinic(phone, clinicId, opts) — bundles PCR
 *
 *   Adopted by THIS prompt:
 *     - GET /api/admin/patient-clinic-records (B12)
 *
 *   Pending adoption (tracked as TD in Build 03 results §7):
 *     - patients.ts: checkPhoneExists, verifyPatientCode, onboardPatient,
 *       createWalkInPatient
 *     - frontdesk.ts: front-desk check-in flow
 *     - appointments.ts: scheduling-time identity resolution
 *
 *   Not migrating (already identity-first or per-row keyed):
 *     - patients.ts: getPatient(patientId), getPatientVisits(patientId) —
 *       already keyed by patient_id, identity is downstream
 *     - clinical-notes.ts, clinical.ts: clinical-data reads keyed by
 *       patient_id; patient_clinic_record_id added in mig 080 will
 *       become the access path in Prompt 6
 */

import { createAdminClient } from '@shared/lib/supabase/admin'
import { normalizeEgyptianPhone } from '@shared/lib/utils/phone-normalize'
import {
  findGlobalPatientByPhone,
  findGlobalPatientById,
  type GlobalPatient,
} from './global-patients'
import {
  getOrCreatePatientClinicRecord,
  type PatientClinicRecord,
} from './patient-clinic-records'

/** Result of a resolveOrCreateGlobalIdentity call. */
export interface GlobalIdentityResolution {
  /** The global identity row. Always non-null on success. */
  globalPatient: GlobalPatient
  /** True if this call CREATED the global identity row. */
  created: boolean
  /** The normalized E.164 phone we resolved on. */
  normalizedPhone: string
}

/** Result of a resolveIdentityForClinic call. */
export interface ClinicIdentityResolution extends GlobalIdentityResolution {
  /** The (gpid, clinicId) per-clinic record. Always non-null on success. */
  patientClinicRecord: PatientClinicRecord
}

/**
 * Resolve a phone to a global_patients row, creating one if it doesn't
 * exist. The returned GlobalPatient is keyed on normalized_phone
 * (E.164 Egyptian formatting).
 *
 * Returns null when the phone fails normalization (caller should treat
 * as a 4xx — the input is genuinely malformed, not a missing identity).
 *
 * Concurrency safe: the UNIQUE(normalized_phone) constraint catches
 * races; the second writer falls back to a re-read.
 */
export async function resolveOrCreateGlobalIdentity(
  rawPhone: string,
  options?: {
    /** Pre-fill display fields if we end up creating the row. */
    displayName?: string | null
    dateOfBirth?: string | null
    sex?: string | null
    preferredLanguage?: 'ar' | 'en'
  }
): Promise<GlobalIdentityResolution | null> {
  const normalized = normalizeEgyptianPhone(rawPhone)
  if (normalized === null) return null

  // Fast path: identity exists.
  const existing = await findGlobalPatientByPhone(normalized)
  if (existing) {
    return {
      globalPatient: existing,
      created: false,
      normalizedPhone: normalized,
    }
  }

  // Slow path: create.
  const supabase = createAdminClient('identity-resolution-create')
  const insertPayload = {
    normalized_phone: normalized,
    display_name: options?.displayName ?? null,
    date_of_birth: options?.dateOfBirth ?? null,
    sex: options?.sex ?? null,
    preferred_language: options?.preferredLanguage ?? 'ar',
    claimed: false,
    account_status: 'active' as const,
  }

  const { data, error } = await supabase
    .from('global_patients')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error) {
    // unique_violation — another writer beat us. Re-read.
    if ((error as { code?: string }).code === '23505') {
      const raced = await findGlobalPatientByPhone(normalized)
      if (raced) {
        return {
          globalPatient: raced,
          created: false,
          normalizedPhone: normalized,
        }
      }
    }
    throw new Error(
      `resolveOrCreateGlobalIdentity failed: ${(error as { message?: string }).message ?? 'unknown error'}`
    )
  }

  return {
    globalPatient: data as unknown as GlobalPatient,
    created: true,
    normalizedPhone: normalized,
  }
}

/**
 * Resolve a phone + clinic to BOTH the global identity AND the per-clinic
 * relationship row. Use this at any "patient walks into clinic" boundary
 * (front-desk check-in, walk-in registration, appointment scheduling).
 *
 * Bumps last_seen_at on the patient_clinic_records row.
 *
 * Returns null when phone normalization fails.
 */
export async function resolveIdentityForClinic(
  rawPhone: string,
  clinicId: string,
  options?: {
    displayName?: string | null
    dateOfBirth?: string | null
    sex?: string | null
    preferredLanguage?: 'ar' | 'en'
    /** First time this patient consents to messaging at this clinic. */
    consentToMessaging?: boolean
  }
): Promise<ClinicIdentityResolution | null> {
  if (!clinicId) {
    throw new Error('resolveIdentityForClinic: clinicId is required')
  }

  const identity = await resolveOrCreateGlobalIdentity(rawPhone, options)
  if (identity === null) return null

  const pcr = await getOrCreatePatientClinicRecord(
    identity.globalPatient.id,
    clinicId,
    {
      consentToMessaging: options?.consentToMessaging,
    }
  )

  return {
    ...identity,
    patientClinicRecord: pcr,
  }
}

/**
 * Convenience: resolve a patients-table row's identity context. Used
 * during the cutover to dereference legacy patients.id reads into the
 * global identity layer.
 */
export async function resolveIdentityForLegacyPatient(
  patientId: string
): Promise<GlobalIdentityResolution | null> {
  const supabase = createAdminClient('identity-resolution-legacy')
  const { data, error } = await supabase
    .from('patients')
    .select('global_patient_id, normalized_phone')
    .eq('id', patientId)
    .maybeSingle()

  if (error || !data?.global_patient_id) return null

  const gp = await findGlobalPatientById(data.global_patient_id)
  if (!gp) return null

  return {
    globalPatient: gp,
    created: false,
    normalizedPhone: data.normalized_phone ?? gp.normalized_phone,
  }
}
