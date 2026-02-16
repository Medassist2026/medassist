import { createClient } from '@/lib/supabase/server'

export interface MedicationReminder {
  id: string
  clinical_note_id: string
  patient_id: string
  medication: {
    drug: string
    frequency: string
    duration: string
    notes?: string | null
  }
  status: 'pending' | 'accepted' | 'rejected'
  expires_at: string
  created_at: string
  clinical_note?: any
}

/**
 * Get all medication reminders for a patient
 */
export async function getPatientMedications(patientId: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('medication_reminders')
    .select('*, clinical_notes(*)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  
  if (error) {
    throw new Error(error.message)
  }
  
  return data as MedicationReminder[]
}

/**
 * Get active (not expired) medication reminders
 */
export async function getActiveMedications(patientId: string) {
  const supabase = await createClient()
  
  const now = new Date().toISOString()
  
  const { data, error } = await supabase
    .from('medication_reminders')
    .select('*, clinical_notes(*)')
    .eq('patient_id', patientId)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
  
  if (error) {
    throw new Error(error.message)
  }
  
  return data as MedicationReminder[]
}

/**
 * Update medication reminder status
 */
export async function updateMedicationStatus(
  reminderId: string,
  status: 'accepted' | 'rejected'
) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('medication_reminders')
    .update({ status })
    .eq('id', reminderId)
    .select()
    .single()
  
  if (error) {
    throw new Error(error.message)
  }
  
  return data
}

/**
 * Get medication reminder by ID
 */
export async function getMedicationReminder(reminderId: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('medication_reminders')
    .select('*, clinical_notes(*, doctors(*))')
    .eq('id', reminderId)
    .single()
  
  if (error) {
    throw new Error(error.message)
  }
  
  return data
}

/**
 * Get medication statistics for patient
 */
export async function getMedicationStats(patientId: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('medication_reminders')
    .select('status')
    .eq('patient_id', patientId)
  
  if (error) {
    throw new Error(error.message)
  }
  
  const stats = {
    total: data.length,
    pending: data.filter(m => m.status === 'pending').length,
    accepted: data.filter(m => m.status === 'accepted').length,
    rejected: data.filter(m => m.status === 'rejected').length
  }
  
  return stats
}
