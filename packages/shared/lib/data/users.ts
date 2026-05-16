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
  //
  // is_canonical=true: this is a brand-new self-registering doctor. No
  // dedup cluster exists at insertion time — by definition this is the
  // canonical record for this phone. A future dedup pass (mig 078/079
  // mechanism) may flip this to false if the user is later identified
  // as a duplicate, but at creation time canonical is the only correct
  // value. users.is_canonical is NOT NULL with no DB default (mig 079).
  const { error: userError } = await adminSupabase
    .from('users')
    .insert({
      id: userId,
      phone: params.phone,
      email: params.email || null,
      role: 'doctor',
      is_canonical: true
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
  //
  // is_canonical=true: brand-new self-registering patient — no dedup
  // cluster at insertion time, so canonical is the only correct value
  // (mig 079 makes users.is_canonical NOT NULL).
  const { error: userError } = await adminSupabase
    .from('users')
    .insert({
      id: userId,
      phone: params.phone,
      email: params.email || null,
      role: 'patient',
      is_canonical: true
    })

  if (userError) {
    throw new Error(userError.message)
  }

  // 3. Create canonical global_patients identity (K-2c, 2026-05-15, D-084).
  //
  // Pre-K-2c, this code path also inserted into `patients` (the
  // clinic-presence table), but `patients.clinic_id` + `patients.global_patient_id`
  // are NOT NULL with no defaults — self-registered patients haven't
  // visited any clinic yet, so neither column has a value to supply.
  // That insert had been architecturally broken since 2026-04-25 (TD-005
  // clinic_id rollout, D-041); patient self-registration was non-functional
  // for ~3 weeks, undetected because no real user has signed up via the
  // patient app (no production deployment per I-5).
  //
  // K-2c per D-084 drops `patients.insert` entirely. Self-registered
  // patients are canonical identities (`global_patients` row with
  // `claimed=true`, `claimed_user_id=userId`, `normalized_phone`,
  // `display_name`). Clinic-presence rows (`patients` + PCR + DPR) are
  // the frontdesk's responsibility on first clinic visit.
  //
  // Patient-app read paths must query `global_patients` via
  // `claimed_user_id`, NOT the `patients` table. Clinical-event tables
  // (35 FK to patients.id — appointments, prescriptions, lab orders,
  // vital signs, etc.) return empty until first clinic visit; that's
  // the documented empty-state contract.
  //
  // Trade-off accepted: dashboard for a freshly-registered patient
  // (pre-first-visit) has no clinical data to display — UI must handle
  // empty state cleanly (verified Phase F + F.5 shipped this).
  const { data: gpRow, error: gpError } = await adminSupabase
    .from('global_patients')
    .insert({
      claimed: true,
      claimed_user_id: userId,
      claimed_at: new Date().toISOString(),
      normalized_phone: params.phone,
      display_name: params.fullName,
    })
    .select('id')
    .single()

  if (gpError || !gpRow) {
    throw new Error(
      `global_patients insert failed: ${gpError?.message ?? 'unknown'}`
    )
  }

  return {
    userId,
    globalPatientId: (gpRow as { id: string }).id
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
 * Get patient profile by user ID.
 *
 * Refactored 2026-05-15 (K-2c, D-084): queries `global_patients` via
 * `claimed_user_id`, NOT `patients` via `id`. Patient identity is
 * canonical at the gp level after K-2c; clinic-presence rows in
 * `patients` are no longer guaranteed to exist for self-registered
 * users (they're created by frontdesk on first clinic visit only).
 *
 * Return shape: a normalized object with `full_name` mapped from
 * `global_patients.display_name` so the existing layout caller
 * (`apps/patient/app/(patient)/layout.tsx`) continues to work without
 * a corresponding rename. The raw `global_patients` row is also
 * spread so future callers can access the canonical column names.
 *
 * Behavior for legacy self-registered users (33 test accounts on
 * staging pre-2026-04-25 with `patients` rows but no claimed gp):
 * returns `null`. Caller's existing `try/catch` falls back to phone
 * for display name. Cleanup of these 33 test accounts is queued as
 * a separate workstream (D-084 follow-up); strict refactor per
 * Mo's ratification 2026-05-15.
 */
export async function getPatientProfile(userId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('global_patients')
    .select('id, normalized_phone, display_name, date_of_birth, age, sex, preferred_language, claimed, claimed_at, account_status, is_minor, created_at')
    .eq('claimed_user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    return null
  }

  // Map display_name → full_name so existing callers that destructure
  // `profile.full_name` keep working. Spread the gp row so canonical
  // column names are also accessible.
  return {
    ...data,
    full_name: (data as { display_name?: string | null }).display_name ?? null,
  }
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
  //
  // is_canonical=true: brand-new self-registering frontdesk staff. See
  // identical comment in createDoctorAccount for full rationale.
  const { error: userError } = await adminSupabase
    .from('users')
    .insert({
      id: userId,
      phone: params.phone,
      role: 'frontdesk',
      is_canonical: true
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
