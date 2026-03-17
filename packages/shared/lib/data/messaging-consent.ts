import { createClient } from '@shared/lib/supabase/server'

export class MessagingConsentError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'MessagingConsentError'
    this.status = status
  }
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
