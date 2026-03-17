import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { nanoid } from 'nanoid'

export interface CreateDoctorParams {
  phone: string
  email?: string
  password: string
  specialty: 'general-practitioner' | 'pediatrics' | 'cardiology' | 'endocrinology'
  fullName: string
}

export interface CreatePatientParams {
  phone: string
  email?: string
  password: string
  fullName: string
}

export interface CreateFrontDeskParams {
  phone: string
  email?: string
  password: string
  fullName: string
}

export interface CreateClinicParams {
  name: string
  doctorId: string
}

/**
 * Create a new doctor account
 */
export async function createDoctorAccount(params: CreateDoctorParams) {
  const supabase = await createClient()

  // 1. Create auth user with BOTH phone and email
  const authPayload: any = {
    password: params.password,
    options: {
      data: {
        role: 'doctor'
      }
    }
  }

  // If email provided, use email as primary identifier
  // Otherwise use phone
  if (params.email) {
    authPayload.email = params.email
    authPayload.phone = params.phone
  } else {
    authPayload.phone = params.phone
  }

  const { data: authData, error: authError } = await supabase.auth.signUp(authPayload)

  if (authError || !authData.user) {
    throw new Error(authError?.message || 'Failed to create auth user')
  }

  // 2. Create user record
  const { error: userError } = await supabase
    .from('users')
    .insert({
      id: authData.user.id,
      phone: params.phone,
      email: params.email || null,
      role: 'doctor'
    })

  if (userError) {
    throw new Error(userError.message)
  }

  // 3. Create doctor profile
  const doctorUniqueId = nanoid(10).toUpperCase()
  
  const { error: doctorError } = await supabase
    .from('doctors')
    .insert({
      id: authData.user.id,
      unique_id: doctorUniqueId,
      specialty: params.specialty,
      full_name: params.fullName
    })

  if (doctorError) {
    throw new Error(doctorError.message)
  }

  return {
    userId: authData.user.id,
    doctorUniqueId
  }
}

/**
 * Create a new patient account
 */
export async function createPatientAccount(params: CreatePatientParams) {
  const supabase = await createClient()

  // 1. Create auth user with BOTH phone and email
  const authPayload: any = {
    password: params.password,
    options: {
      data: {
        role: 'patient'
      }
    }
  }

  // If email provided, use email as primary identifier
  // Otherwise use phone
  if (params.email) {
    authPayload.email = params.email
    authPayload.phone = params.phone
  } else {
    authPayload.phone = params.phone
  }

  const { data: authData, error: authError } = await supabase.auth.signUp(authPayload)

  if (authError || !authData.user) {
    throw new Error(authError?.message || 'Failed to create auth user')
  }

  // 2. Create user record
  const { error: userError } = await supabase
    .from('users')
    .insert({
      id: authData.user.id,
      phone: params.phone,
      email: params.email || null,
      role: 'patient'
    })

  if (userError) {
    throw new Error(userError.message)
  }

  // 3. Create patient profile
  const patientUniqueId = nanoid(10).toUpperCase()
  
  const { error: patientError } = await supabase
    .from('patients')
    .insert({
      id: authData.user.id,
      unique_id: patientUniqueId,
      phone: params.phone,
      full_name: params.fullName,
      registered: true
    })

  if (patientError) {
    throw new Error(patientError.message)
  }

  return {
    userId: authData.user.id,
    patientUniqueId
  }
}

/**
 * Create a new clinic
 */
export async function createClinic(params: CreateClinicParams) {
  // Use admin client to bypass RLS - clinics table may not have INSERT policy for doctors
  const adminSupabase = createAdminClient('clinic-registration')

  const clinicUniqueId = nanoid(10).toUpperCase()

  // 1. Create clinic
  const { data: clinic, error: clinicError } = await adminSupabase
    .from('clinics')
    .insert({
      unique_id: clinicUniqueId,
      name: params.name
    })
    .select()
    .single()

  if (clinicError) {
    throw new Error(clinicError.message)
  }

  // 2. Link doctor to clinic via clinic_memberships (primary)
  const { error: membershipError } = await adminSupabase
    .from('clinic_memberships')
    .insert({
      clinic_id: clinic.id,
      user_id: params.doctorId,
      role: 'OWNER',
      status: 'ACTIVE'
    })

  if (membershipError) {
    console.error('clinic_memberships insert error:', membershipError.message)
  }

  // 3. Also insert into legacy clinic_doctors for backward compatibility
  const { error: linkError } = await adminSupabase
    .from('clinic_doctors')
    .insert({
      clinic_id: clinic.id,
      doctor_id: params.doctorId,
      role: 'doctor'
    })

  if (linkError) {
    // Don't throw — clinic_memberships is the source of truth now
    console.error('clinic_doctors legacy insert error:', linkError.message)
  }

  return {
    clinicId: clinic.id,
    clinicUniqueId
  }
}

/**
 * Get doctor profile by user ID
 */
export async function getDoctorProfile(userId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('doctors')
    .select('*, users(*)')
    .eq('id', userId)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

/**
 * Get patient profile by user ID
 */
export async function getPatientProfile(userId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('patients')
    .select('*, users(*)')
    .eq('id', userId)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

/**
 * Create a new front desk staff account
 */
export async function createFrontDeskAccount(params: CreateFrontDeskParams) {
  const supabase = await createClient()

  // 1. Create auth user
  const authPayload: any = {
    password: params.password,
    options: {
      data: {
        role: 'frontdesk'
      }
    }
  }

  if (params.email) {
    authPayload.email = params.email
    authPayload.phone = params.phone
  } else {
    authPayload.phone = params.phone
  }

  const { data: authData, error: authError } = await supabase.auth.signUp(authPayload)

  if (authError) {
    throw new Error(authError.message)
  }

  const userId = authData.user?.id
  if (!userId) {
    throw new Error('Failed to create auth user')
  }

  // 2. Generate unique ID
  const frontDeskUniqueId = `FD${nanoid(8).toUpperCase()}`

  // 3. Create user record
  const { error: userError } = await supabase
    .from('users')
    .insert({
      id: userId,
      phone: params.phone,
      role: 'frontdesk'
    })

  if (userError) {
    throw new Error(userError.message)
  }

  // 4. Create front desk staff record
  const { error: staffError } = await supabase
    .from('front_desk_staff')
    .insert({
      id: userId,
      unique_id: frontDeskUniqueId,
      full_name: params.fullName
    })

  if (staffError) {
    throw new Error(staffError.message)
  }

  return {
    userId,
    frontDeskUniqueId
  }
}
