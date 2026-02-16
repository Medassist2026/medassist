import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface ClinicalNoteData {
  chief_complaint: string[]
  diagnosis: string
  medications: Array<{
    name: string
    frequency: string
    duration: string
    notes?: string
  }>
  plan: string
}

export interface CreateClinicalNoteParams {
  doctorId: string
  patientId: string
  appointmentId?: string
  noteData: ClinicalNoteData
  keystrokeCount: number
  durationSeconds: number
  syncToPatient: boolean
}

/**
 * Create a new clinical note
 * Schema matches: chief_complaint, diagnosis, medications, plan (separate columns)
 */
export async function createClinicalNote(params: CreateClinicalNoteParams) {
  const supabase = await createClient()
  
  // Transform diagnosis string to JSONB format expected by schema
  // Format: [{icd10_code: string, text: string}]
  const diagnosisParts = params.noteData.diagnosis.split(':')
  const diagnosisJson = [{
    icd10_code: diagnosisParts[0]?.trim() || '',
    text: diagnosisParts[1]?.trim() || params.noteData.diagnosis
  }]
  
  // Transform medications to match schema format
  // Format: [{drug: string, frequency: string, duration: string}]
  const medicationsJson = params.noteData.medications.map(med => ({
    drug: med.name,
    frequency: med.frequency,
    duration: med.duration,
    notes: med.notes || null
  }))
  
  const { data, error } = await supabase
    .from('clinical_notes')
    .insert({
      doctor_id: params.doctorId,
      patient_id: params.patientId,
      appointment_id: params.appointmentId || null,
      chief_complaint: params.noteData.chief_complaint,
      diagnosis: diagnosisJson,
      medications: medicationsJson,
      plan: params.noteData.plan,
      keystroke_count: params.keystrokeCount,
      duration_seconds: params.durationSeconds,
      synced_to_patient: params.syncToPatient
    })
    .select()
    .single()
  
  if (error) {
    throw new Error(error.message)
  }
  
  return data
}

/**
 * Get clinical notes for a doctor
 */
export async function getDoctorNotes(doctorId: string, limit: number = 20) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('clinical_notes')
    .select('*, patients(*)')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (error) {
    throw new Error(error.message)
  }
  
  return data
}

/**
 * Get clinical notes for a patient (only synced notes)
 */
export async function getPatientNotes(patientId: string, limit: number = 20) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('clinical_notes')
    .select('*, doctors(*)')
    .eq('patient_id', patientId)
    .eq('synced_to_patient', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (error) {
    throw new Error(error.message)
  }
  
  return data
}

/**
 * Get clinical note by ID
 */
export async function getClinicalNote(noteId: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('clinical_notes')
    .select('*, patients(*), doctors(*)')
    .eq('id', noteId)
    .single()
  
  if (error) {
    throw new Error(error.message)
  }
  
  return data
}

/**
 * Create medication reminders for patient
 */
export async function createMedicationReminders(
  clinicalNoteId: string,
  patientId: string,
  medications: ClinicalNoteData['medications']
) {
  // Use admin client to create doctor-triggered reminders without RLS insert blockers.
  const supabase = createAdminClient()
  
  // Calculate expiration (2 weeks from now)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 14)
  
  const reminders = medications.map(med => ({
    clinical_note_id: clinicalNoteId,
    patient_id: patientId,
    medication: {
      drug: med.name,
      frequency: med.frequency,
      duration: med.duration,
      notes: med.notes || null
    },
    status: 'pending' as const,
    expires_at: expiresAt.toISOString()
  }))
  
  const { data, error } = await supabase
    .from('medication_reminders')
    .insert(reminders)
    .select()
  
  if (error) {
    throw new Error(error.message)
  }
  
  return data
}
