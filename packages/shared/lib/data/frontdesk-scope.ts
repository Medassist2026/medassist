import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@shared/lib/supabase/admin'

/**
 * Get the clinic ID for a frontdesk/assistant user from clinic_memberships
 * Falls back to legacy front_desk_staff table for backward compatibility
 */
export async function getFrontdeskClinicId(
  _supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const admin = createAdminClient('patient-privacy-checks')

  // Try new clinic_memberships table first
  const { data: membership, error: membershipError } = await admin
    .from('clinic_memberships')
    .select('clinic_id')
    .eq('user_id', userId)
    .in('role', ['FRONT_DESK', 'ASSISTANT'])
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle()

  if (!membershipError && membership?.clinic_id) {
    return membership.clinic_id
  }

  // Fallback to legacy table
  const { data, error } = await admin
    .from('front_desk_staff')
    .select('clinic_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    // Table might not exist yet, swallow error
    console.warn('getFrontdeskClinicId legacy fallback error:', error.message)
    return null
  }

  return data?.clinic_id || null
}

/**
 * Get all doctor user IDs in a clinic from clinic_memberships
 * Falls back to legacy clinic_doctors table
 */
export async function getClinicDoctorIds(
  _supabase: SupabaseClient,
  clinicId: string
): Promise<string[]> {
  const admin = createAdminClient('patient-privacy-checks')

  // Try new clinic_memberships table first
  const { data: memberships, error: membershipError } = await admin
    .from('clinic_memberships')
    .select('user_id')
    .eq('clinic_id', clinicId)
    .in('role', ['OWNER', 'DOCTOR'])
    .eq('status', 'ACTIVE')

  if (!membershipError && memberships && memberships.length > 0) {
    return memberships.map((row: any) => row.user_id).filter(Boolean)
  }

  // Fallback to legacy table
  const { data, error } = await admin
    .from('clinic_doctors')
    .select('doctor_id')
    .eq('clinic_id', clinicId)

  if (error) {
    console.warn('getClinicDoctorIds legacy fallback error:', error.message)
    return []
  }

  return (data || []).map((row: any) => row.doctor_id).filter(Boolean)
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
 * Get the active clinic ID for any user based on their membership
 * Falls back to legacy tables (front_desk_staff, clinic_doctors) for backward compatibility
 */
export async function getUserClinicId(userId: string): Promise<string | null> {
  const admin = createAdminClient('patient-privacy-checks')

  // Try new clinic_memberships table first
  const { data: membership, error: membershipError } = await admin
    .from('clinic_memberships')
    .select('clinic_id')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle()

  if (!membershipError && membership?.clinic_id) {
    return membership.clinic_id
  }

  // Fallback: check legacy front_desk_staff table
  const { data: fdStaff } = await admin
    .from('front_desk_staff')
    .select('clinic_id')
    .eq('id', userId)
    .maybeSingle()

  if (fdStaff?.clinic_id) {
    return fdStaff.clinic_id
  }

  // Fallback: check legacy clinic_doctors table
  const { data: clinicDoc } = await admin
    .from('clinic_doctors')
    .select('clinic_id')
    .eq('doctor_id', userId)
    .limit(1)
    .maybeSingle()

  return clinicDoc?.clinic_id || null
}
