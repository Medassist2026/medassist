import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'

/**
 * EFFECTIVE MESSAGING CONSENT — grace-period bridge (Build 04 / mig 083).
 *
 * Reads through the `effective_messaging_consent` view, which combines:
 *   - the new column `patient_clinic_records.consent_to_messaging`
 *   - legacy `patient_consent_grants` rows (per-doctor messaging) honored
 *     for the 90-day grace window post-mig 083 cutover (2026-04-29)
 *
 * After 90 days, only the explicit column counts; the view drops in
 * cleanup mig (ORPH-V2-05).
 *
 * Returns:
 *   - effectiveConsent: TRUE iff the (gpid, clinic) pair is messaging-OK
 *   - source: 'explicit' | 'legacy_grace' | 'none' (diagnostic)
 *   - needsReconsent: TRUE iff the patient hasn't gone through the
 *     re-consent prompt for this clinic AND a legacy row exists.
 *     Drives the patient-app re-consent UI.
 */
export interface EffectiveMessagingConsent {
  globalPatientId: string
  clinicId: string
  effectiveConsent: boolean
  source: 'explicit' | 'legacy_grace' | 'none'
  needsReconsent: boolean
  graceExpiresAt: string
  legacyGrantedAt: string | null
}

export async function readEffectiveMessagingConsent(params: {
  globalPatientId: string
  clinicId: string
}): Promise<EffectiveMessagingConsent | null> {
  // Service-role read because the underlying tables (patient_clinic_records,
  // patient_consent_grants, audit_events) are still on DENY-ALL placeholder
  // RLS until Prompt 6. After Prompt 6 this can switch to the user's
  // authenticated client.
  const admin = createAdminClient('effective-messaging-consent-read')
  const { data, error } = await admin
    .from('effective_messaging_consent')
    .select('global_patient_id, clinic_id, effective_consent, source, needs_reconsent, grace_expires_at, legacy_granted_at')
    .eq('global_patient_id', params.globalPatientId)
    .eq('clinic_id', params.clinicId)
    .maybeSingle()

  if (error || !data) return null

  return {
    globalPatientId: (data as any).global_patient_id,
    clinicId: (data as any).clinic_id,
    effectiveConsent: (data as any).effective_consent,
    source: (data as any).source,
    needsReconsent: (data as any).needs_reconsent,
    graceExpiresAt: (data as any).grace_expires_at,
    legacyGrantedAt: (data as any).legacy_granted_at,
  }
}

/**
 * List every clinic that needs re-consent for the given patient.
 * Drives the re-consent prompt's per-clinic loop.
 */
export async function listClinicsNeedingReconsent(
  globalPatientId: string
): Promise<EffectiveMessagingConsent[]> {
  const admin = createAdminClient('effective-messaging-consent-list')
  const { data, error } = await admin
    .from('effective_messaging_consent')
    .select('global_patient_id, clinic_id, effective_consent, source, needs_reconsent, grace_expires_at, legacy_granted_at')
    .eq('global_patient_id', globalPatientId)
    .eq('needs_reconsent', true)

  if (error || !data) return []
  return (data as any[]).map((row) => ({
    globalPatientId: row.global_patient_id,
    clinicId: row.clinic_id,
    effectiveConsent: row.effective_consent,
    source: row.source,
    needsReconsent: row.needs_reconsent,
    graceExpiresAt: row.grace_expires_at,
    legacyGrantedAt: row.legacy_granted_at,
  }))
}

/**
 * Record a re-consent decision. Either RECONFIRMED (writes
 * consent_to_messaging=TRUE on the PCR row) or REVOKED (leaves PCR
 * column at FALSE, but writes the audit so the grace bridge no longer
 * counts the legacy row).
 */
export async function recordReconsentDecision(params: {
  globalPatientId: string
  clinicId: string
  patientUserId: string
  decision: 'reconfirmed' | 'revoked'
}): Promise<void> {
  const admin = createAdminClient('messaging-reconsent-decision')

  if (params.decision === 'reconfirmed') {
    const { error: pcrError } = await admin
      .from('patient_clinic_records')
      .update({
        consent_to_messaging: true,
        consent_to_messaging_granted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('global_patient_id', params.globalPatientId)
      .eq('clinic_id', params.clinicId)
    if (pcrError) {
      throw new Error(
        `recordReconsentDecision (reconfirmed) failed to update PCR: ${pcrError.message}`
      )
    }
  }

  const { error: auditError } = await admin.from('audit_events').insert({
    clinic_id: params.clinicId,
    actor_user_id: params.patientUserId,
    actor_kind: 'user',
    action:
      params.decision === 'reconfirmed'
        ? 'MESSAGING_CONSENT_RECONFIRMED'
        : 'MESSAGING_CONSENT_REVOKED',
    entity_type: 'global_patients',
    entity_id: params.globalPatientId,
    metadata: {
      clinic_id: params.clinicId,
      decision: params.decision,
      decided_at: new Date().toISOString(),
    },
  })

  if (auditError) {
    throw new Error(
      `recordReconsentDecision audit insert failed: ${auditError.message}`
    )
  }
}

export class MessagingConsentError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'MessagingConsentError'
    this.status = status
  }
}

/**
 * Lightweight check: has this patient had any appointment (any status)
 * or walk-in queue entry with this doctor?
 * Used for patient-initiated messaging — less strict than full consent check.
 */
export async function ensurePatientVisitedDoctor(doctorId: string, patientId: string): Promise<void> {
  const admin = createAdminClient('patient-messaging-eligibility')

  // Check appointments (any status including scheduled/completed)
  const { data: appointment } = await admin
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .limit(1)
    .maybeSingle()

  if (appointment?.id) return

  // Fallback: check queue (covers walk-in patients with no formal appointment)
  const { data: queueEntry } = await admin
    .from('check_in_queue')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .limit(1)
    .maybeSingle()

  if (queueEntry?.id) return

  throw new MessagingConsentError(
    'يمكن التواصل مع الطبيب فقط بعد الزيارة الأولى',
    403
  )
}

/**
 * Get or create a conversation for patient-initiated messaging.
 * Uses visit-based eligibility (no consent grant required).
 */
export async function getOrCreatePatientConversation(params: {
  doctorId: string
  patientId: string
}): Promise<string> {
  const supabase = await createClient()
  const admin = createAdminClient('patient-messaging-conversation')
  const { doctorId, patientId } = params

  await ensurePatientVisitedDoctor(doctorId, patientId)

  // Check existing conversation
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .maybeSingle()

  if (existing?.id) return existing.id

  // Create from latest appointment reference
  const { data: latestAppt } = await admin
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: created, error } = await admin
    .from('conversations')
    .insert({
      doctor_id: doctorId,
      patient_id: patientId,
      status: 'active',
      created_from_appointment_id: latestAppt?.id || null,
      last_message_at: new Date().toISOString()
    })
    .select('id')
    .single()

  if (error || !created?.id) {
    throw new MessagingConsentError(error?.message || 'Failed to create conversation', 500)
  }

  return created.id
}

export async function ensureMessagingConsent(doctorId: string, patientId: string): Promise<void> {
  const supabase = await createClient()
  const admin = createAdminClient('messaging-consent-check')

  // ── Tier 0: effective_messaging_consent view (Build 04 / mig 083) ────────
  // This is the new authoritative source. Resolves the (gpid, clinic) pair
  // through the grace bridge. If TRUE, messaging is allowed.
  //
  // The legacy patient_id-keyed code still flows through tier 1 + 2 below
  // until Prompt 6 RLS rewrite + per-call-site cutover. Tier 0 is a strict
  // ADD — never blocks; only auto-allows.
  //
  // We need (gpid, clinicId) to read the view. patient_id maps to global
  // identity via patients.global_patient_id (mig 077 made it NOT NULL); we
  // read it cheaply once.
  const { data: patientLink } = await admin
    .from('patients')
    .select('global_patient_id, clinic_id')
    .eq('id', patientId)
    .maybeSingle()

  if (patientLink?.global_patient_id && patientLink?.clinic_id) {
    const view = await readEffectiveMessagingConsent({
      globalPatientId: patientLink.global_patient_id,
      clinicId: patientLink.clinic_id,
    })
    if (view?.effectiveConsent) return
  }

  // ── Tier 1: strict explicit consent (full consent grant system) ──────────
  const { data: relationship } = await supabase
    .from('doctor_patient_relationships')
    .select('access_level, consent_state, access_type, status')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .maybeSingle()

  const strictConsented =
    (relationship?.access_level === 'verified_consented' &&
      relationship?.consent_state === 'granted') ||
    relationship?.access_type === 'verified'

  if (strictConsented) {
    // Also check consent grant exists (but don't block if missing — legacy data)
    const { data: consentGrant } = await supabase
      .from('patient_consent_grants')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .eq('consent_type', 'messaging')
      .eq('consent_state', 'granted')
      .is('revoked_at', null)
      .maybeSingle()
    if (consentGrant?.id) return
  }

  // ── Tier 2: visit-based implicit consent ─────────────────────────────────
  // If the doctor has treated the patient (any appointment or walk-in),
  // messaging is allowed. Consent is implied by the clinical relationship.
  const { data: appointment } = await admin
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .limit(1)
    .maybeSingle()

  if (appointment?.id) return

  const { data: queueEntry } = await admin
    .from('check_in_queue')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .limit(1)
    .maybeSingle()

  if (queueEntry?.id) return

  throw new MessagingConsentError(
    'يمكن التواصل مع المريض فقط بعد الزيارة الأولى',
    403
  )
}

export async function getOrCreateConsentedConversation(params: {
  doctorId: string
  patientId: string
}): Promise<string> {
  const supabase = await createClient()
  const admin = createAdminClient('doctor-conversation-create')
  const { doctorId, patientId } = params

  await ensureMessagingConsent(doctorId, patientId)

  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .maybeSingle()

  if (existing?.id) return existing.id

  // Find any appointment (any status) to link the conversation to
  const { data: latestAppt } = await admin
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Also check queue if no appointment found
  const { data: queueEntry } = !latestAppt?.id
    ? await admin
        .from('check_in_queue')
        .select('appointment_id')
        .eq('doctor_id', doctorId)
        .eq('patient_id', patientId)
        .limit(1)
        .maybeSingle()
    : { data: null }

  const { data: created, error: createError } = await admin
    .from('conversations')
    .insert({
      doctor_id: doctorId,
      patient_id: patientId,
      status: 'active',
      created_from_appointment_id: latestAppt?.id || queueEntry?.appointment_id || null,
      last_message_at: new Date().toISOString()
    })
    .select('id')
    .single()

  if (createError || !created?.id) {
    throw new MessagingConsentError(createError?.message || 'Failed to create conversation', 500)
  }

  return created.id
}
