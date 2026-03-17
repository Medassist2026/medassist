import { createAdminClient } from '@shared/lib/supabase/admin'

export interface PrescriptionItem {
  id: string
  clinical_note_id: string
  patient_id: string
  doctor_id: string
  clinic_id?: string
  drug_name: string
  drug_brand_name?: string
  drug_brand_name_ar?: string
  generic_name?: string
  drug_id?: string
  strength?: string
  form?: string
  frequency: string
  duration: string
  quantity?: number
  instructions?: string
  status: 'prescribed' | 'dispensed' | 'cancelled'
  prescribed_at: string
  created_at: string
  updated_at: string
}

export interface MedicationData {
  name?: string
  drug?: string
  type?: string
  form?: string
  strength?: string
  frequency: string
  duration: string
  quantity?: number
  notes?: string
  instructions?: string
  endDate?: string
  taperingInstructions?: string
}

/**
 * Syncs medications from a clinical note into the normalized prescription_items table
 * @param noteId - ID of the clinical note
 * @param patientId - ID of the patient
 * @param doctorId - ID of the doctor
 * @param clinicId - ID of the clinic (optional)
 * @param medications - Array of medication objects from clinical_notes.medications
 * @returns Array of created prescription items
 */
export async function syncPrescriptionItems(
  noteId: string,
  patientId: string,
  doctorId: string,
  clinicId: string | null | undefined,
  medications: MedicationData[]
): Promise<PrescriptionItem[]> {
  const admin = createAdminClient('prescription-sync')

  if (!Array.isArray(medications) || medications.length === 0) {
    return []
  }

  const itemsToInsert = medications.map((med) => ({
    clinical_note_id: noteId,
    patient_id: patientId,
    doctor_id: doctorId,
    clinic_id: clinicId || null,
    drug_name: med.name || med.drug || 'Unnamed Medication',
    drug_brand_name: med.name,
    drug_brand_name_ar: null,
    generic_name: null,
    drug_id: null,
    strength: med.strength,
    form: med.form || med.type || 'pill',
    frequency: med.frequency || '',
    duration: med.duration || '',
    quantity: med.quantity,
    instructions: med.instructions || med.notes || med.taperingInstructions,
    status: 'prescribed' as const,
    prescribed_at: new Date().toISOString()
  }))

  const { data, error } = await admin
    .from('prescription_items')
    .insert(itemsToInsert)
    .select()

  if (error) {
    console.error('Error syncing prescription items:', error)
    throw new Error(`Failed to sync prescription items: ${error.message}`)
  }

  return (data as PrescriptionItem[]) || []
}

/**
 * Retrieves prescription history for a patient
 * @param patientId - ID of the patient
 * @returns Array of prescription items for the patient
 */
export async function getPatientPrescriptionHistory(
  patientId: string
): Promise<PrescriptionItem[]> {
  const admin = createAdminClient('prescription-sync')

  const { data, error } = await admin
    .from('prescription_items')
    .select(
      `
      id,
      clinical_note_id,
      patient_id,
      doctor_id,
      clinic_id,
      drug_name,
      drug_brand_name,
      drug_brand_name_ar,
      generic_name,
      drug_id,
      strength,
      form,
      frequency,
      duration,
      quantity,
      instructions,
      status,
      prescribed_at,
      created_at,
      updated_at
    `
    )
    .eq('patient_id', patientId)
    .order('prescribed_at', { ascending: false })

  if (error) {
    console.error('Error fetching patient prescription history:', error)
    throw new Error(`Failed to fetch prescription history: ${error.message}`)
  }

  return (data as PrescriptionItem[]) || []
}

/**
 * Retrieves prescriptions for a specific clinical note
 * @param noteId - ID of the clinical note
 * @returns Array of prescription items for the note
 */
export async function getNotePrescriptionItems(
  noteId: string
): Promise<PrescriptionItem[]> {
  const admin = createAdminClient('prescription-sync')

  const { data, error } = await admin
    .from('prescription_items')
    .select(
      `
      id,
      clinical_note_id,
      patient_id,
      doctor_id,
      clinic_id,
      drug_name,
      drug_brand_name,
      drug_brand_name_ar,
      generic_name,
      drug_id,
      strength,
      form,
      frequency,
      duration,
      quantity,
      instructions,
      status,
      prescribed_at,
      created_at,
      updated_at
    `
    )
    .eq('clinical_note_id', noteId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching note prescription items:', error)
    throw new Error(`Failed to fetch prescription items: ${error.message}`)
  }

  return (data as PrescriptionItem[]) || []
}

/**
 * Updates the status of a prescription item
 * @param prescriptionId - ID of the prescription item
 * @param status - New status
 * @returns Updated prescription item
 */
export async function updatePrescriptionStatus(
  prescriptionId: string,
  status: 'prescribed' | 'dispensed' | 'cancelled'
): Promise<PrescriptionItem> {
  const admin = createAdminClient('prescription-sync')

  const { data, error } = await admin
    .from('prescription_items')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', prescriptionId)
    .select()
    .single()

  if (error) {
    console.error('Error updating prescription status:', error)
    throw new Error(`Failed to update prescription status: ${error.message}`)
  }

  return data as PrescriptionItem
}

/**
 * Deletes a prescription item
 * @param prescriptionId - ID of the prescription item to delete
 */
export async function deletePrescriptionItem(
  prescriptionId: string
): Promise<void> {
  const admin = createAdminClient('prescription-sync')

  const { error } = await admin
    .from('prescription_items')
    .delete()
    .eq('id', prescriptionId)

  if (error) {
    console.error('Error deleting prescription item:', error)
    throw new Error(`Failed to delete prescription item: ${error.message}`)
  }
}
