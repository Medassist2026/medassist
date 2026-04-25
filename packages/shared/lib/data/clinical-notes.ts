import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { logAuditEvent } from './audit'

export interface ClinicalNoteData {
  chief_complaint: string[]
  diagnosis: string | string[]
  medications: Array<{
    name: string
    frequency: string
    duration: string
    notes?: string
  }>
  plan: string
  // Extended fields stored in note_data JSONB
  allergies?: string[]
  chronic_diseases?: string[]
  radiology?: string[]
  labs?: string[]
  follow_up_date?: string | null
  follow_up_notes?: string | null
  visit_type?: string
}

export interface CreateClinicalNoteParams {
  doctorId: string
  patientId: string
  appointmentId?: string
  /**
   * Owning clinic for this note. REQUIRED — the multi-tenant scoping
   * invariant relies on every clinical note having a clinic. Callers
   * (currently only handlers/clinical/notes/handler.ts) must resolve a
   * clinic before calling. See migration 045 for the historical orphan
   * cleanup; the API handler returns 400 if it can't resolve a clinic.
   */
  clinicId: string
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
  // Defense-in-depth: the type system already requires clinicId, but a
  // runtime check here protects against `as any` callers and stale JS bundles.
  // Migration 045 documents the historical orphan-rows that motivated this guard.
  if (!params.clinicId) {
    throw new Error('createClinicalNote: clinicId is required (no orphan notes)')
  }

  const supabase = await createClient()

  // Transform diagnosis to JSONB format expected by schema
  // Format: [{icd10_code: string, text: string}]
  // diagnosis can be a string or string[] (from DiagnosisInput component)
  const diagnosisArray = Array.isArray(params.noteData.diagnosis)
    ? params.noteData.diagnosis
    : [params.noteData.diagnosis]

  const diagnosisJson = diagnosisArray
    .filter(d => d && d.trim())
    .map(d => {
      const parts = d.split(':')
      return {
        icd10_code: parts[0]?.trim() || '',
        text: parts.length > 1 ? parts.slice(1).join(':').trim() : d.trim()
      }
    })

  // Transform medications to match schema format
  // Format: [{drug: string, frequency: string, duration: string}]
  const medicationsJson = params.noteData.medications.map(med => ({
    drug: med.name,
    frequency: med.frequency,
    duration: med.duration,
    notes: med.notes || null
  }))

  const baseInsert = {
    doctor_id: params.doctorId,
    patient_id: params.patientId,
    appointment_id: params.appointmentId || null,
    clinic_id: params.clinicId,   // required — see CreateClinicalNoteParams + mig 045
    chief_complaint: params.noteData.chief_complaint,
    diagnosis: diagnosisJson,
    medications: medicationsJson,
    plan: params.noteData.plan,
    keystroke_count: params.keystrokeCount,
    duration_seconds: params.durationSeconds,
    synced_to_patient: params.syncToPatient,
  }

  const noteDataPayload = {
    ...params.noteData,
    allergies: params.noteData.allergies || [],
    chronic_diseases: params.noteData.chronic_diseases || [],
    radiology: params.noteData.radiology || [],
    labs: params.noteData.labs || [],
    follow_up_date: params.noteData.follow_up_date || null,
    follow_up_notes: params.noteData.follow_up_notes || null,
    visit_type: params.noteData.visit_type || 'new',
  }

  // Try with note_data first (requires migration 029 to have run)
  let { data, error } = await supabase
    .from('clinical_notes')
    .insert({ ...baseInsert, note_data: noteDataPayload })
    .select()
    .single()

  // Graceful fallback: if note_data column is missing, retry without it
  if (error && (error.code === 'PGRST204' || error.code === '42703' || error.message?.includes('note_data'))) {
    console.warn('clinical_notes: note_data column missing, retrying without it:', error.message)
    const fallback = await supabase
      .from('clinical_notes')
      .insert(baseInsert)
      .select()
      .single()
    data = fallback.data
    error = fallback.error
  }

  if (error) {
    throw new Error(error.message)
  }

  // Log audit event
  await logAuditEvent({
    clinicId: params.clinicId,
    actorUserId: params.doctorId,
    action: 'CREATE_CLINICAL_NOTE',
    entityType: 'clinical_note',
    entityId: data?.id,
    metadata: {
      patientId: params.patientId,
      appointmentId: params.appointmentId
    }
  })

  return data
}

/**
 * Get clinical notes for a doctor, scoped to a clinic
 */
export async function getDoctorNotes(doctorId: string, clinicId: string, limit: number = 20) {
  const supabase = await createClient()

  let query = supabase
    .from('clinical_notes')
    .select('*, patients(*)')
    .eq('doctor_id', doctorId)
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(limit)

  const { data, error } = await query

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
  const supabase = createAdminClient('patient-privacy-checks')
  
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
