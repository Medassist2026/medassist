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

  const { data: relationship, error: relationshipError } = await supabase
    .from('doctor_patient_relationships')
    .select('access_level, consent_state, access_type, status')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .maybeSingle()

  if (relationshipError) {
    throw new MessagingConsentError(relationshipError.message, 500)
  }

  const consented =
    relationship?.access_level === 'verified_consented' &&
    relationship?.consent_state === 'granted'

  const legacyConsented = relationship?.access_type === 'verified'

  if (!consented && !legacyConsented) {
    throw new MessagingConsentError('Messaging requires verified patient consent', 403)
  }

  const { data: consentGrant, error: consentError } = await supabase
    .from('patient_consent_grants')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .eq('consent_type', 'messaging')
    .eq('consent_state', 'granted')
    .is('revoked_at', null)
    .maybeSingle()

  if (consentError) {
    throw new MessagingConsentError(consentError.message, 500)
  }

  if (!consentGrant?.id) {
    throw new MessagingConsentError('Messaging consent grant is missing or revoked', 403)
  }
}

export async function getOrCreateConsentedConversation(params: {
  doctorId: string
  patientId: string
}): Promise<string> {
  const supabase = await createClient()
  const { doctorId, patientId } = params

  await ensureMessagingConsent(doctorId, patientId)

  const { data: existing, error: existingError } = await supabase
    .from('conversations')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .maybeSingle()

  if (existingError) {
    throw new MessagingConsentError(existingError.message, 500)
  }

  if (existing?.id) {
    return existing.id
  }

  const { data: latestVisit, error: latestVisitError } = await supabase
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .eq('status', 'completed')
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestVisitError) {
    throw new MessagingConsentError(latestVisitError.message, 500)
  }

  if (!latestVisit?.id) {
    throw new MessagingConsentError('Messaging requires at least one completed visit', 403)
  }

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({
      doctor_id: doctorId,
      patient_id: patientId,
      status: 'active',
      created_from_appointment_id: latestVisit.id,
      last_message_at: new Date().toISOString()
    })
    .select('id')
    .single()

  if (createError || !created?.id) {
    throw new MessagingConsentError(createError?.message || 'Failed to create conversation', 500)
  }

  return created.id
}
