import { createClient } from '@shared/lib/supabase/server'

export interface Appointment {
  id: string
  doctor_id: string
  patient_id: string
  clinic_id: string | null
  start_time: string
  duration_minutes: number
  status: 'scheduled' | 'cancelled'
  created_by_role: string
  created_at: string
  patient: {
    id: string
    unique_id: string
    phone: string
    full_name: string | null
    age: number | null
    sex: 'Male' | 'Female' | 'Other' | null
  }
}

/**
 * Get today's appointments for a doctor, optionally scoped to a clinic
 */
export async function getTodayAppointments(
  doctorId: string,
  clinicId?: string | null
): Promise<Appointment[]> {
  const supabase = await createClient()

  // Calculate today's date range
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  let query = supabase
    .from('appointments')
    .select(`
      *,
      patient:patients (
        id,
        unique_id,
        phone,
        full_name,
        age,
        sex
      )
    `)
    .eq('doctor_id', doctorId)
    .eq('status', 'scheduled')
    .gte('start_time', today.toISOString())
    .lt('start_time', tomorrow.toISOString())
    .order('start_time', { ascending: true })

  // When clinicId is provided, show appointments for that clinic OR unscoped (null clinic_id)
  if (clinicId) {
    query = query.or(`clinic_id.eq.${clinicId},clinic_id.is.null`)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return data as unknown as Appointment[]
}

/**
 * Get appointment by ID
 */
export async function getAppointment(appointmentId: string): Promise<Appointment | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      patient:patients (
        id,
        unique_id,
        phone,
        full_name,
        age,
        sex
      )
    `)
    .eq('id', appointmentId)
    .single()
  
  if (error) {
    return null
  }
  
  return data as unknown as Appointment
}

/**
 * Update appointment status
 */
export async function updateAppointmentStatus(
  appointmentId: string,
  status: 'scheduled' | 'cancelled'
): Promise<void> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', appointmentId)
  
  if (error) {
    throw new Error(error.message)
  }
}

/**
 * Link clinical note to appointment
 */
export async function linkNoteToAppointment(
  noteId: string,
  appointmentId: string
): Promise<void> {
  const supabase = await createClient()
  
  // Note: This requires adding appointment_id column to clinical_notes table
  // For now, we'll just track via analytics or skip this feature
  // TODO: Add migration to add appointment_id to clinical_notes
}
