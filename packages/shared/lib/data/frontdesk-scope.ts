import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@shared/lib/supabase/admin'

/**
 * Get the clinic ID for a frontdesk/assistant user.
 * clinic_memberships is the sole source of truth — legacy
 * front_desk_staff.clinic_id fallback was removed in mig 052
 * (column dropped).
 */
export async function getFrontdeskClinicId(
  _supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const admin = createAdminClient('patient-privacy-checks')

  const { data: membership, error } = await admin
    .from('clinic_memberships')
    .select('clinic_id')
    .eq('user_id', userId)
    .in('role', ['FRONT_DESK', 'ASSISTANT'])
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('getFrontdeskClinicId error:', error.message)
    return null
  }

  return membership?.clinic_id || null
}

/**
 * Get all doctor user IDs in a clinic.
 * clinic_memberships is the sole source of truth — legacy clinic_doctors
 * fallback was removed in mig 052 (table dropped).
 */
export async function getClinicDoctorIds(
  _supabase: SupabaseClient,
  clinicId: string
): Promise<string[]> {
  const admin = createAdminClient('patient-privacy-checks')

  const { data: memberships, error } = await admin
    .from('clinic_memberships')
    .select('user_id')
    .eq('clinic_id', clinicId)
    .in('role', ['OWNER', 'DOCTOR'])
    .eq('status', 'ACTIVE')

  if (error) {
    console.warn('getClinicDoctorIds error:', error.message)
    return []
  }

  return (memberships || []).map((row: any) => row.user_id).filter(Boolean)
}

/**
 * Check if a doctor belongs to the same clinic as a frontdesk user
 */
export async function ensureDoctorInFrontdeskClinic(
  supabase: SupabaseClient,
  frontdeskUserId: string,
  doctorId: string
): Promise<boolean> {
  const clinicId = await getFrontdeskClinicId(supabase, frontdeskUserId)
  if (!clinicId) return false

  const doctorIds = await getClinicDoctorIds(supabase, clinicId)
  return doctorIds.includes(doctorId)
}

/**
 * Get the active clinic ID for any user based on their membership.
 * clinic_memberships is the sole source of truth — legacy table fallbacks
 * (front_desk_staff.clinic_id, clinic_doctors) were removed in mig 052.
 */
export async function getUserClinicId(userId: string): Promise<string | null> {
  const admin = createAdminClient('patient-privacy-checks')

  const { data: membership } = await admin
    .from('clinic_memberships')
    .select('clinic_id')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle()

  return membership?.clinic_id || null
}
