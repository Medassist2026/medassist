/**
 * Patient visibility / sharing management within clinics
 */

export type VisibilityMode = 'DOCTOR_SCOPED_OWNER' | 'CLINIC_WIDE' | 'SHARED_BY_CONSENT'
export type ConsentType = 'IMPLICIT_CLINIC_POLICY' | 'DOCTOR_TO_DOCTOR_TRANSFER' | 'PATIENT_CONSENT_CODE'

export interface PatientVisibility {
  id: string
  clinic_id: string
  patient_id: string
  grantee_type: 'DOCTOR' | 'ROLE'
  grantee_user_id: string | null
  mode: VisibilityMode
  consent: ConsentType
  granted_by_user_id: string | null
  expires_at: string | null
  created_at: string
}

/**
 * Get visibility rules for a patient in a clinic
 */
export async function getPatientVisibility(
  clinicId: string,
  patientId: string
): Promise<PatientVisibility[]> {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('visibility')

  const { data } = await supabase
    .from('patient_visibility')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)

  return data || []
}

/**
 * Get the effective visibility mode for a patient
 */
export async function getEffectiveVisibility(
  clinicId: string,
  patientId: string
): Promise<{
  mode: VisibilityMode
  sharedWith: string[]
}> {
  const rules = await getPatientVisibility(clinicId, patientId)

  // Check if any rule is CLINIC_WIDE
  const isClinicWide = rules.some(r => r.mode === 'CLINIC_WIDE')
  if (isClinicWide) {
    return { mode: 'CLINIC_WIDE', sharedWith: [] }
  }

  // Get all shared doctors
  const sharedDoctors = rules
    .filter(r => r.mode === 'SHARED_BY_CONSENT' && r.grantee_user_id)
    .map(r => r.grantee_user_id!)

  if (sharedDoctors.length > 0) {
    return { mode: 'SHARED_BY_CONSENT', sharedWith: sharedDoctors }
  }

  return { mode: 'DOCTOR_SCOPED_OWNER', sharedWith: [] }
}

/**
 * Share a patient with another doctor in the same clinic
 */
export async function sharePatientWithDoctor(params: {
  clinicId: string
  patientId: string
  doctorUserId: string
  grantedByUserId: string
  consent?: ConsentType
}) {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('visibility')

  const { data, error } = await supabase
    .from('patient_visibility')
    .insert({
      clinic_id: params.clinicId,
      patient_id: params.patientId,
      grantee_type: 'DOCTOR',
      grantee_user_id: params.doctorUserId,
      mode: 'SHARED_BY_CONSENT',
      consent: params.consent || 'DOCTOR_TO_DOCTOR_TRANSFER',
      granted_by_user_id: params.grantedByUserId,
    })
    .select()
    .single()

  return { data, error }
}

/**
 * Set a patient to clinic-wide visibility
 */
export async function setClinicWideVisibility(params: {
  clinicId: string
  patientId: string
  grantedByUserId: string
}) {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('visibility')

  const { data, error } = await supabase
    .from('patient_visibility')
    .upsert({
      clinic_id: params.clinicId,
      patient_id: params.patientId,
      grantee_type: 'ROLE',
      grantee_user_id: null,
      mode: 'CLINIC_WIDE',
      consent: 'IMPLICIT_CLINIC_POLICY',
      granted_by_user_id: params.grantedByUserId,
    })
    .select()
    .single()

  return { data, error }
}

/**
 * Revoke a specific visibility grant
 */
export async function revokeVisibility(visibilityId: string) {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('visibility')

  const { error } = await supabase
    .from('patient_visibility')
    .delete()
    .eq('id', visibilityId)

  return { error }
}

/**
 * Ensure a user has access to a patient in a clinic
 * Throws if no access — use in API routes before returning patient data
 */
export async function ensurePatientAccess(
  clinicId: string,
  patientId: string,
  userId: string
): Promise<void> {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('visibility')

  // Use the can_access_patient RPC function from migration 021
  const { data, error } = await supabase.rpc('can_access_patient', {
    p_clinic_id: clinicId,
    p_patient_id: patientId,
    p_user_id: userId,
    p_permission: 'READ'
  })

  if (error || !data) {
    throw new Error('Access denied: You do not have permission to view this patient')
  }
}

/**
 * Get all sharing status for a patient (who has access)
 */
export async function getPatientSharingStatus(
  patientId: string
): Promise<{
  grants: Array<{
    id: string
    clinic_id: string
    grantee_user_id: string | null
    mode: VisibilityMode
    consent: ConsentType
    created_at: string
  }>
}> {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('visibility')

  const { data } = await supabase
    .from('patient_visibility')
    .select('id, clinic_id, grantee_user_id, mode, consent, created_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  return {
    grants: (data || []) as Array<{
      id: string
      clinic_id: string
      grantee_user_id: string | null
      mode: VisibilityMode
      consent: ConsentType
      created_at: string
    }>
  }
}

/**
 * Create default visibility when a new patient is added to a clinic
 */
export async function createDefaultVisibility(params: {
  clinicId: string
  patientId: string
  doctorUserId: string
}) {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('visibility')

  // Check clinic's default visibility setting
  const { data: clinic } = await supabase
    .from('clinics')
    .select('default_visibility')
    .eq('id', params.clinicId)
    .single()

  const defaultMode = (clinic?.default_visibility as VisibilityMode) || 'DOCTOR_SCOPED_OWNER'

  if (defaultMode === 'CLINIC_WIDE') {
    return setClinicWideVisibility({
      clinicId: params.clinicId,
      patientId: params.patientId,
      grantedByUserId: params.doctorUserId,
    })
  }

  // Default: doctor-scoped
  const { data, error } = await supabase
    .from('patient_visibility')
    .insert({
      clinic_id: params.clinicId,
      patient_id: params.patientId,
      grantee_type: 'DOCTOR',
      grantee_user_id: params.doctorUserId,
      mode: 'DOCTOR_SCOPED_OWNER',
      consent: 'IMPLICIT_CLINIC_POLICY',
      granted_by_user_id: params.doctorUserId,
    })
    .select()
    .single()

  return { data, error }
}
