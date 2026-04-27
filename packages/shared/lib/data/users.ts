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

  // 4. Seed default doctor_availability so the booking flow works out of the
  // box. Without this, the frontdesk's slot picker returns [] for every date
  // until an owner manually configures hours (see investigation 2026-04-26:
  // 96% of doctors had no availability rows → "مفيش اختيارات للمواعيد").
  // Default: Sun–Thu 09:00–17:00, 15-min slots — matches mig 043 seed and the
  // typical Egyptian clinic week (Fri/Sat off). Owner can edit later.
  // ON CONFLICT DO NOTHING via individual rows + ignored unique-violation,
  // so re-running is safe. Failure here MUST NOT fail registration — the
  // doctor account is already created; missing availability is recoverable.
  const defaultAvailabilityRows = [0, 1, 2, 3, 4].map(day_of_week => ({
    doctor_id: userId,
    day_of_week,
    start_time: '09:00:00',
    end_time: '17:00:00',
    slot_duration_minutes: 15,
    is_active: true,
  }))

  const { error: availabilityError } = await adminSupabase
    .from('doctor_availability')
    .upsert(defaultAvailabilityRows, {
      onConflict: 'doctor_id,day_of_week,start_time',
      ignoreDuplicates: true,
    })

  if (availabilityError) {
    // Log but don't throw — the doctor exists and can manually configure
    // availability via the dashboard. Surfacing this would block signup
    // for a recoverable issue.
    console.warn(
      `[createDoctorAccount] failed to seed default availability for ${userId}: ${availabilityError.message}`
    )
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

  // 2. Link doctor to clinic via clinic_memberships (canonical store).
  // Legacy clinic_doctors mirror was removed once memberships became
  // authoritative (mig 045-051). Read fallbacks in clinic-context.ts and
  // frontdesk-scope.ts only fire when memberships returns nothing, which
  // can't happen for new clinics created here.
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
