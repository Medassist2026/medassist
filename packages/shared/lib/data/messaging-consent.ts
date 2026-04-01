import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'

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
