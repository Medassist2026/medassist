/**
 * Clinic Context Layer for Multi-Tenant Architecture
 *
 * This module provides a unified way to resolve clinic context for any user role.
 * It's the foundation for data scoping across the entire application.
 *
 * Usage patterns:
 * - Doctor layout: getDoctorClinics() → show selector if multiple → store active clinic
 * - Front desk: getFrontdeskClinic() → single clinic (already scoped)
 * - API routes: getClinicContext(userId, role) → used for query scoping
 * - Clinical session: getActiveClinicId() → used when saving notes
 *
 * Version: 1.0 (Phase 5)
 */

import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import type { UserRole } from '@shared/lib/auth/session'

// ============================================================================
// TYPES
// ============================================================================

export interface ClinicInfo {
  id: string
  uniqueId: string
  name: string
  role: string // 'doctor' | 'frontdesk' | 'admin'
}

export interface ClinicContext {
  /** The active clinic ID */
  clinicId: string
  /** Clinic details */
  clinic: ClinicInfo
  /** All clinics this user belongs to */
  allClinics: ClinicInfo[]
  /** Whether user has multiple clinics (needs selector) */
  hasMultipleClinics: boolean
  /** All doctor IDs in the active clinic */
  clinicDoctorIds: string[]
}

// ============================================================================
// COOKIE-BASED ACTIVE CLINIC STORAGE
// We use a simple approach: the active clinic ID is stored in a cookie
// named 'active_clinic_id'. This persists across page loads without
// requiring database writes.
// ============================================================================

const ACTIVE_CLINIC_COOKIE = 'active_clinic_id'

/**
 * Get the active clinic ID from cookies (server-side)
 * Returns null if no clinic is selected yet
 */
export async function getActiveClinicIdFromCookies(): Promise<string | null> {
  try {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    return cookieStore.get(ACTIVE_CLINIC_COOKIE)?.value || null
  } catch {
    return null
  }
}

// ============================================================================
// DOCTOR CLINIC RESOLUTION
// ============================================================================

/**
 * Get all clinics a doctor belongs to
 * Uses clinic_memberships (unified table) as the source of truth
 */
export async function getDoctorClinics(doctorId: string): Promise<ClinicInfo[]> {
  const admin = createAdminClient('clinic-context')

  // Primary: use clinic_memberships
  const { data: memberships, error: membershipError } = await admin
    .from('clinic_memberships')
    .select(`
      role,
      clinics:clinic_id (
        id,
        unique_id,
        name
      )
    `)
    .eq('user_id', doctorId)
    .in('role', ['OWNER', 'DOCTOR'])
    .eq('status', 'ACTIVE')

  if (!membershipError && memberships && memberships.length > 0) {
    return memberships
      .filter((row: any) => row.clinics)
      .map((row: any) => ({
        id: row.clinics.id,
        uniqueId: row.clinics.unique_id,
        name: row.clinics.name,
        role: row.role === 'OWNER' ? 'owner' : 'doctor',
      }))
  }

  // Fallback: legacy clinic_doctors table
  const { data, error } = await admin
    .from('clinic_doctors')
    .select(`
      role,
      clinics:clinic_id (
        id,
        unique_id,
        name
      )
    `)
    .eq('doctor_id', doctorId)

  if (error) {
    console.error('Error fetching doctor clinics:', error)
    return []
  }

  return (data || [])
    .filter((row: any) => row.clinics)
    .map((row: any) => ({
      id: row.clinics.id,
      uniqueId: row.clinics.unique_id,
      name: row.clinics.name,
      role: row.role || 'doctor',
    }))
}

/**
 * Get the front desk staff's clinic
 * Uses clinic_memberships as primary source
 */
export async function getFrontdeskClinic(userId: string): Promise<ClinicInfo | null> {
  const admin = createAdminClient('clinic-context')

  // Primary: use clinic_memberships
  const { data: membership, error: membershipError } = await admin
    .from('clinic_memberships')
    .select(`
      role,
      clinics:clinic_id (
        id,
        unique_id,
        name
      )
    `)
    .eq('user_id', userId)
    .in('role', ['FRONT_DESK', 'ASSISTANT'])
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle()

  if (!membershipError && membership?.clinics) {
    const clinic = membership.clinics as any
    return {
      id: clinic.id,
      uniqueId: clinic.unique_id,
      name: clinic.name,
      role: 'frontdesk',
    }
  }

  // Fallback: legacy front_desk_staff table
  const { data: staffData, error: staffError } = await admin
    .from('front_desk_staff')
    .select('clinic_id')
    .eq('id', userId)
    .maybeSingle()

  if (staffError || !staffData?.clinic_id) {
    return null
  }

  const { data: clinicData, error: clinicError } = await admin
    .from('clinics')
    .select('id, unique_id, name')
    .eq('id', staffData.clinic_id)
    .single()

  if (clinicError || !clinicData) {
    return null
  }

  return {
    id: clinicData.id,
    uniqueId: clinicData.unique_id,
    name: clinicData.name,
    role: 'frontdesk',
  }
}

// ============================================================================
// UNIFIED CLINIC CONTEXT
// ============================================================================

/**
 * Get the full clinic context for a user.
 * This is the main function used by layouts and API routes.
 *
 * Logic:
 * - Doctor: Get all clinics → check cookie for active → default to first
 * - Front desk: Get their assigned clinic (always single)
 * - Patient: No clinic context needed (returns null)
 */
export async function getClinicContext(
  userId: string,
  role: UserRole,
  preferredClinicId?: string | null
): Promise<ClinicContext | null> {
  // Patients don't have clinic context
  if (role === 'patient') return null

  if (role === 'frontdesk') {
    const clinic = await getFrontdeskClinic(userId)
    if (!clinic) return null

    const doctorIds = await getClinicDoctorIds(clinic.id)

    return {
      clinicId: clinic.id,
      clinic,
      allClinics: [clinic],
      hasMultipleClinics: false,
      clinicDoctorIds: doctorIds,
    }
  }

  // Doctor
  const clinics = await getDoctorClinics(userId)
  if (clinics.length === 0) return null

  // Determine active clinic — validate cookie/preferred ID against actual memberships
  const cookieClinicId = preferredClinicId || await getActiveClinicIdFromCookies()
  let activeClinic = cookieClinicId
    ? clinics.find(c => c.id === cookieClinicId)
    : undefined
  if (!activeClinic) {
    // Cookie clinic not found in active memberships — fall back to first clinic
    activeClinic = clinics[0]
  }

  const doctorIds = await getClinicDoctorIds(activeClinic.id)

  return {
    clinicId: activeClinic.id,
    clinic: activeClinic,
    allClinics: clinics,
    hasMultipleClinics: clinics.length > 1,
    clinicDoctorIds: doctorIds,
  }
}

/**
 * Get all doctor IDs in a given clinic
 * Uses clinic_memberships as primary source
 */
export async function getClinicDoctorIds(clinicId: string): Promise<string[]> {
  const admin = createAdminClient('clinic-context')

  // Primary: clinic_memberships
  const { data: memberships, error: membershipError } = await admin
    .from('clinic_memberships')
    .select('user_id')
    .eq('clinic_id', clinicId)
    .in('role', ['OWNER', 'DOCTOR'])
    .eq('status', 'ACTIVE')

  if (!membershipError && memberships && memberships.length > 0) {
    return memberships.map((row: any) => row.user_id).filter(Boolean)
  }

  // Fallback: legacy table
  const { data, error } = await admin
    .from('clinic_doctors')
    .select('doctor_id')
    .eq('clinic_id', clinicId)

  if (error) {
    console.error('Error fetching clinic doctors:', error)
    return []
  }

  return (data || []).map((row: any) => row.doctor_id).filter(Boolean)
}

/**
 * Validate that a doctor belongs to a specific clinic
 * Uses clinic_memberships as primary source
 */
export async function validateDoctorClinicAccess(
  doctorId: string,
  clinicId: string
): Promise<boolean> {
  const admin = createAdminClient('clinic-context')

  // Primary: clinic_memberships
  const { data: membership } = await admin
    .from('clinic_memberships')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('user_id', doctorId)
    .in('role', ['OWNER', 'DOCTOR'])
    .eq('status', 'ACTIVE')
    .maybeSingle()

  if (membership) return true

  // Fallback: legacy table
  const { data, error } = await admin
    .from('clinic_doctors')
    .select('doctor_id')
    .eq('clinic_id', clinicId)
    .eq('doctor_id', doctorId)
    .maybeSingle()

  if (error) return false
  return !!data
}

/**
 * Get clinic details by ID
 */
export async function getClinicById(clinicId: string): Promise<ClinicInfo | null> {
  const admin = createAdminClient('clinic-context')

  const { data, error } = await admin
    .from('clinics')
    .select('id, unique_id, name')
    .eq('id', clinicId)
    .single()

  if (error || !data) return null

  return {
    id: data.id,
    uniqueId: data.unique_id,
    name: data.name,
    role: 'admin',
  }
}

/**
 * Get all members (doctors + staff) of a clinic
 */
export interface ClinicMember {
  userId: string
  name: string
  role: string
  specialty?: string
  unique_id?: string
}

export async function getClinicMembers(clinicId: string): Promise<ClinicMember[]> {
  const admin = createAdminClient('clinic-context')
  const members: ClinicMember[] = []

  // Primary: clinic_memberships (unified)
  const { data: memberships, error: membershipError } = await admin
    .from('clinic_memberships')
    .select('user_id, role, status')
    .eq('clinic_id', clinicId)
    .eq('status', 'ACTIVE')

  if (!membershipError && memberships && memberships.length > 0) {
    // Resolve user details for each member
    const userIds = memberships.map((m: any) => m.user_id)

    // Get doctor details
    const doctorUserIds = memberships
      .filter((m: any) => ['OWNER', 'DOCTOR'].includes(m.role))
      .map((m: any) => m.user_id)

    if (doctorUserIds.length > 0) {
      const { data: doctors } = await admin
        .from('doctors')
        .select('id, full_name, specialty, unique_id')
        .in('id', doctorUserIds)

      if (doctors) {
        for (const doc of doctors) {
          const membership = memberships.find((m: any) => m.user_id === doc.id)
          members.push({
            userId: doc.id,
            name: doc.full_name,
            role: membership?.role === 'OWNER' ? 'owner' : 'doctor',
            specialty: doc.specialty,
            unique_id: doc.unique_id,
          })
        }
      }
    }

    // Get frontdesk/assistant details
    const staffUserIds = memberships
      .filter((m: any) => ['FRONT_DESK', 'ASSISTANT'].includes(m.role))
      .map((m: any) => m.user_id)

    if (staffUserIds.length > 0) {
      const { data: staffData } = await admin
        .from('front_desk_staff')
        .select('id, full_name')
        .in('id', staffUserIds)

      if (staffData) {
        for (const staff of staffData) {
          const membership = memberships.find((m: any) => m.user_id === staff.id)
          members.push({
            userId: staff.id,
            name: staff.full_name,
            role: membership?.role === 'ASSISTANT' ? 'assistant' : 'frontdesk',
          })
        }
      }
    }

    return members
  }

  // Fallback: legacy tables
  const { data: doctorLinks } = await admin
    .from('clinic_doctors')
    .select(`
      role,
      doctors:doctor_id (
        id,
        full_name,
        specialty,
        unique_id
      )
    `)
    .eq('clinic_id', clinicId)

  if (doctorLinks) {
    for (const link of doctorLinks) {
      const doc = link.doctors as any
      if (doc) {
        members.push({
          userId: doc.id,
          name: doc.full_name,
          role: (link.role as string) || 'doctor',
          specialty: doc.specialty,
          unique_id: doc.unique_id,
        })
      }
    }
  }

  const { data: staffData } = await admin
    .from('front_desk_staff')
    .select('id, full_name')
    .eq('clinic_id', clinicId)

  if (staffData) {
    for (const staff of staffData) {
      members.push({
        userId: staff.id,
        name: staff.full_name,
        role: 'frontdesk',
      })
    }
  }

  return members
}

/**
 * Get user's membership in a specific clinic (new clinic-centric architecture)
 */
export async function getActiveClinicMembership(userId: string, clinicId: string) {
  const admin = createAdminClient('clinic-context')

  const { data } = await admin
    .from('clinic_memberships')
    .select('id, role, status')
    .eq('user_id', userId)
    .eq('clinic_id', clinicId)
    .eq('status', 'ACTIVE')
    .single()

  return data
}
