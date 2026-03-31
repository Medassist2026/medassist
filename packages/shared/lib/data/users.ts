import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { generateUniqueInviteCode } from '@shared/lib/utils/invite-code'
import { nanoid } from 'nanoid'

export interface CreateDoctorParams {
  phone: string
  email?: string
  password: string
  specialty: string
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
  address: string
  doctorId: string
}

/**
 * Create a new doctor account
 */
export async function createDoctorAccount(params: CreateDoctorParams) {
  const DEV_BYPASS_OTP = process.env.DEV_BYPASS_OTP === 'true'

  let userId: string

  if (DEV_BYPASS_OTP) {
    // Bypass Supabase phone confirmation (which tries to send SMS via its own Twilio integration).
    // The app has its own OTP system — Supabase phone confirmation is redundant and breaks here.
    const adminSupabase = createAdminClient('user-registration')
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      phone: params.phone,
      ...(params.email ? { email: params.email, email_confirm: true } : {}),
      password: params.password,
      phone_confirm: true,
      user_metadata: { role: 'doctor' }
    })
    if (authError || !authData.user) {
      throw new Error(authError?.message || 'Failed to create auth user')
    }
    userId = authData.user.id
  } else {
    // Production path: supabase.auth.signUp (requires Supabase phone auth configured)
    const supabase = await createClient()
    const authPayload: any = {
      password: params.password,
      options: { data: { role: 'doctor' } }
    }
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
    userId = authData.user.id
  }

  // Use admin client for DB inserts — avoids RLS issues during registration
  const adminSupabase = createAdminClient('user-registration')

  // 2. Create user record
  const { error: userError } = await adminSupabase
    .from('users')
    .insert({
      id: userId,
      phone: params.phone,
      email: params.email || null,
      role: 'doctor'
    })

  if (userError) {
    throw new Error(userError.message)
  }

  // 3. Create doctor profile
  const doctorUniqueId = nanoid(10).toUpperCase()

  const { error: doctorError } = await adminSupabase
    .from('doctors')
    .insert({
      id: userId,
      unique_id: doctorUniqueId,
      specialty: params.specialty,
      full_name: params.fullName
    })

  if (doctorError) {
    throw new Error(doctorError.message)
  }

  return {
    userId,
    doctorUniqueId
  }
}

/**
 * Create a new patient account
 */
export async function createPatientAccount(params: CreatePatientParams) {
  const DEV_BYPASS_OTP = process.env.DEV_BYPASS_OTP === 'true'

  let userId: string

  if (DEV_BYPASS_OTP) {
    const adminSupabase = createAdminClient('user-registration')
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      phone: params.phone,
      ...(params.email ? { email: params.email, email_confirm: true } : {}),
      password: params.password,
      phone_confirm: true,
      user_metadata: { role: 'patient' }
    })
    if (authError || !authData.user) {
      throw new Error(authError?.message || 'Failed to create auth user')
    }
    userId = authData.user.id
  } else {
    const supabase = await createClient()
    const authPayload: any = {
      password: params.password,
      options: { data: { role: 'patient' } }
    }
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
    userId = authData.user.id
  }

  const adminSupabase = createAdminClient('user-registration')

  // 2. Create user record
  const { error: userError } = await adminSupabase
    .from('users')
    .insert({
      id: userId,
      phone: params.phone,
      email: params.email || null,
      role: 'patient'
    })

  if (userError) {
    throw new Error(userError.message)
  }

  // 3. Create patient profile
  const patientUniqueId = nanoid(10).toUpperCase()

  const { error: patientError } = await adminSupabase
    .from('patients')
    .insert({
      id: userId,
      unique_id: patientUniqueId,
      phone: params.phone,
      full_name: params.fullName,
      registered: true
    })

  if (patientError) {
    throw new Error(patientError.message)
  }

  return {
    userId,
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
  // Generate invite_code eagerly so the owner can share it immediately
  const inviteCode = await generateUniqueInviteCode()

  // 1. Create clinic
  const { data: clinic, error: clinicError } = await adminSupabase
    .from('clinics')
    .insert({
      unique_id: clinicUniqueId,
      name: params.name,
      address: params.address,
      invite_code: inviteCode,
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
    clinicUniqueId,
    inviteCode,
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
  const DEV_BYPASS_OTP = process.env.DEV_BYPASS_OTP === 'true'

  let userId: string

  if (DEV_BYPASS_OTP) {
    const adminSupabase = createAdminClient('user-registration')
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      phone: params.phone,
      ...(params.email ? { email: params.email, email_confirm: true } : {}),
      password: params.password,
      phone_confirm: true,
      user_metadata: { role: 'frontdesk' }
    })
    if (authError || !authData.user) {
      throw new Error(authError?.message || 'Failed to create auth user')
    }
    userId = authData.user.id
  } else {
    const supabase = await createClient()
    const authPayload: any = {
      password: params.password,
      options: { data: { role: 'frontdesk' } }
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
    if (!authData.user?.id) {
      throw new Error('Failed to create auth user')
    }
    userId = authData.user.id
  }

  const adminSupabase = createAdminClient('user-registration')

  // 2. Generate unique ID
  const frontDeskUniqueId = `FD${nanoid(8).toUpperCase()}`

  // 3. Create user record
  const { error: userError } = await adminSupabase
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
  const { error: staffError } = await adminSupabase
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
