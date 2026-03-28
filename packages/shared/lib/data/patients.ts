import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { nanoid } from 'nanoid'
import crypto from 'crypto'
import { validateEgyptianPhone, normalizePhone } from '@shared/lib/utils/phone-validation'
import { timingSafeEqualString } from '@shared/lib/utils/identity'
import { logAuditEvent } from './audit'
import { createDefaultVisibility } from './visibility'

// ============================================================================
// TYPES
// ============================================================================

export interface Patient {
  id: string
  unique_id: string
  phone: string
  full_name: string | null
  age: number | null
  sex: 'Male' | 'Female' | 'Other' | null
  parent_phone: string | null
  guardian_id: string | null   // FK to patients.id — set when guardian exists in patients table
  is_dependent: boolean
  registered: boolean
  created_at: string
  // V2 fields
  email?: string | null
  phone_verified?: boolean
  account_status?: 'active' | 'suspended' | 'locked' | 'dormant' | 'merged'
  last_activity_at?: string
  created_by_doctor_id?: string | null
  converted_at?: string | null
  // V3 fields - clinic-centric
  patient_code?: string | null
  clinic_id?: string | null
}

export interface DoctorPatientRelationship {
  id: string
  doctor_id: string
  patient_id: string
  access_level?: 'ghost' | 'walk_in_limited' | 'verified_consented'
  consent_state?: 'pending' | 'granted' | 'revoked'
  access_type?: 'walk_in' | 'verified'
  relationship_type?: string
  status?: string
  doctor_entered_name?: string
  doctor_entered_age?: number
  doctor_entered_sex?: string
  created_at: string
  verified_at?: string
}

export interface PhoneCheckResult {
  exists: boolean
  isRegistered: boolean  // Only true if patient has app account
  // NO patient details returned - privacy protection
}

export interface OnboardingResult {
  success: boolean
  patient?: Patient
  relationship?: DoctorPatientRelationship
  accessLevel?: 'ghost' | 'walk_in_limited' | 'verified_consented'
  consentState?: 'pending' | 'granted' | 'revoked'
  isExisting: boolean
  isGhostMode: boolean
  message: string
  anonymousNumber?: number  // For ghost mode
}

export interface CodeVerificationResult {
  valid: boolean
  patientId?: string
  patient?: {
    fullName: string | null
    age: number | null
    sex: string | null
  }
  message: string
}

function isVerifiedRelationship(relationship: any): boolean {
  return (
    (relationship?.access_level === 'verified_consented' && relationship?.consent_state === 'granted') ||
    relationship?.access_type === 'verified'
  )
}

// ============================================================================
// PRIVACY-AWARE PHONE CHECK
// ============================================================================

/**
 * Check if a phone number exists in the system
 * 
 * PRIVACY RULES:
 * - Only returns "exists" for REGISTERED patients (has app account)
 * - Walk-ins from other doctors are INVISIBLE
 * - No patient details returned
 */
export async function checkPhoneExists(phone: string): Promise<PhoneCheckResult> {
  const adminSupabase = createAdminClient('patient-privacy-checks')
  
  // Normalize phone
  const normalized = normalizePhone(phone)
  if (!normalized) {
    return { exists: false, isRegistered: false }
  }
  
  // Check for REGISTERED patient only
  const { data: patient } = await adminSupabase
    .from('patients')
    .select('id, registered')
    .eq('phone', normalized)
    .eq('registered', true)  // KEY: Only registered patients are discoverable
    .eq('account_status', 'active')
    .maybeSingle()
  
  if (!patient) {
    // Either doesn't exist OR is a walk-in (both return same response)
    return { exists: false, isRegistered: false }
  }
  
  // Registered patient exists
  return { 
    exists: true, 
    isRegistered: true 
  }
}

/**
 * Verify patient code and return basic info for pre-filling
 * 
 * Patient must share their unique_id code for doctor to see their info
 */
export async function verifyPatientCode(
  phone: string, 
  code: string
): Promise<CodeVerificationResult> {
  const adminSupabase = createAdminClient('patient-privacy-checks')
  
  const normalized = normalizePhone(phone)
  if (!normalized) {
    return { valid: false, message: 'Invalid phone number' }
  }
  
  // Find patient by phone AND code
  const { data: patient } = await adminSupabase
    .from('patients')
    .select('id, unique_id, full_name, age, sex, registered')
    .eq('phone', normalized)
    .eq('registered', true)
    .eq('account_status', 'active')
    .maybeSingle()
  
  if (!patient) {
    return { valid: false, message: 'Patient not found' }
  }
  
  // Verify code matches
  if (!timingSafeEqualString(patient.unique_id, code.toUpperCase().trim())) {
    return { valid: false, message: 'Invalid code' }
  }
  
  // Code valid - return basic info for pre-fill
  return {
    valid: true,
    patientId: patient.id,
    patient: {
      fullName: patient.full_name,
      age: patient.age,
      sex: patient.sex
    },
    message: 'Code verified successfully'
  }
}

// ============================================================================
// PATIENT ONBOARDING
// ============================================================================

/**
 * Onboard a patient (Walk-in or Code-verified)
 * 
 * This is the main entry point for patient onboarding
 * Handles all scenarios: new patient, existing walk-in, registered with/without code
 */
export async function onboardPatient(
  doctorId: string,
  data: {
    phone: string
    fullName: string
    age: number
    sex: 'Male' | 'Female' | 'Other'
    isDependent?: boolean
    parentPhone?: string
    // Code verification
    patientCode?: string  // If provided, creates verified relationship
    // Ghost mode
    isGhostMode?: boolean
    ghostReasonCategory?: string
    clinicId?: string
  }
): Promise<OnboardingResult> {
  const adminSupabase = createAdminClient('patient-onboarding')
  
  // ============================================
  // GHOST MODE - No records created
  // ============================================
  if (data.isGhostMode) {
    return await createGhostVisit(doctorId, data.ghostReasonCategory)
  }
  
  // ============================================
  // VALIDATE PHONE
  // ============================================
  const phoneValidation = validateEgyptianPhone(data.phone)
  if (!phoneValidation.isValid || !phoneValidation.normalized) {
    throw new Error(phoneValidation.error || 'Invalid phone number')
  }
  
  const normalizedPhone = phoneValidation.normalized
  
  // ============================================
  // VALIDATE OTHER FIELDS
  // ============================================
  if (data.age < 0 || data.age > 120) {
    throw new Error('Age must be between 0 and 120')
  }
  
  if (data.isDependent && !data.parentPhone) {
    throw new Error('Parent phone required for dependent patients')
  }
  
  // ============================================
  // RESOLVE CLINIC ID
  // ============================================
  let resolvedClinicId = data.clinicId || null
  if (!resolvedClinicId) {
    // Auto-resolve from doctor's active clinic membership
    const { data: membership } = await adminSupabase
      .from('clinic_memberships')
      .select('clinic_id')
      .eq('user_id', doctorId)
      .in('role', ['OWNER', 'DOCTOR'])
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    resolvedClinicId = membership?.clinic_id || null
  }

  // ============================================
  // CHECK IF DOCTOR ALREADY HAS RELATIONSHIP
  // ============================================
  const { data: existingRelationships } = await adminSupabase
    .from('doctor_patient_relationships')
    .select(`
      *,
      patients!inner(*)
    `)
    .eq('doctor_id', doctorId)
  
  // Find if any relationship matches this phone
  const existingRelationship = existingRelationships?.find(
    r => (r.patients as any)?.phone === normalizedPhone
  )
  
  if (existingRelationship) {
    // Update last visit time
    await adminSupabase
      .from('doctor_patient_relationships')
      .update({ last_visit_at: new Date().toISOString() })
      .eq('id', existingRelationship.id)
    
    return {
      success: true,
      patient: existingRelationship.patients as Patient,
      relationship: existingRelationship as unknown as DoctorPatientRelationship,
      accessLevel: isVerifiedRelationship(existingRelationship) ? 'verified_consented' : 'walk_in_limited',
      consentState: isVerifiedRelationship(existingRelationship) ? 'granted' : 'pending',
      isExisting: true,
      isGhostMode: false,
      message: 'Returning patient'
    }
  }
  
  // ============================================
  // CHECK IF REGISTERED PATIENT (with code)
  // ============================================
  let verifiedPatientId: string | null = null
  if (data.patientCode) {
    const verification = await verifyPatientCode(normalizedPhone, data.patientCode)
    
    if (!verification.valid || !verification.patientId) {
      return {
        success: false,
        accessLevel: 'walk_in_limited',
        consentState: 'pending',
        isExisting: false,
        isGhostMode: false,
        message: verification.message
      }
    }

    verifiedPatientId = verification.patientId
  }
  
  // ============================================
  // CHECK IF PATIENT EXISTS (any status)
  // ============================================
  const { data: anyExistingPatient } = await adminSupabase
    .from('patients')
    .select('*')
    .eq('phone', normalizedPhone)
    .maybeSingle()
  
  if (anyExistingPatient) {
    const isVerifiedByCode = verifiedPatientId === anyExistingPatient.id
    const now = new Date().toISOString()
    const accessLevel = isVerifiedByCode ? 'verified_consented' : 'walk_in_limited'
    const consentState = isVerifiedByCode ? 'granted' : 'pending'
    const accessType = isVerifiedByCode ? 'verified' : 'walk_in'

    let newRelationship: any = null
    let relationshipError: any = null

    const { data: relationshipCurrent, error: relationshipCurrentError } = await adminSupabase
      .from('doctor_patient_relationships')
      .insert({
        doctor_id: doctorId,
        patient_id: anyExistingPatient.id,
        clinic_id: resolvedClinicId,
        access_level: accessLevel,
        consent_state: consentState,
        consent_granted_at: isVerifiedByCode ? now : null,
        status: isVerifiedByCode ? 'active' : 'pending',
        relationship_type: isVerifiedByCode ? 'primary' : 'walk_in',
        access_type: accessType,
        doctor_entered_name: data.fullName,
        doctor_entered_age: data.age,
        doctor_entered_sex: data.sex,
        verified_at: isVerifiedByCode ? now : null,
        last_visit_at: now
      })
      .select()
      .single()

    newRelationship = relationshipCurrent
    relationshipError = relationshipCurrentError

    if (relationshipError) {
      const { data: relationshipLegacy, error: relationshipLegacyError } = await adminSupabase
        .from('doctor_patient_relationships')
        .insert({
          doctor_id: doctorId,
          patient_id: anyExistingPatient.id,
          access_type: accessType,
          doctor_entered_name: data.fullName,
          doctor_entered_age: data.age,
          doctor_entered_sex: data.sex,
          verified_at: isVerifiedByCode ? now : null
        })
        .select()
        .single()

      newRelationship = relationshipLegacy
      relationshipError = relationshipLegacyError
    }

    if (relationshipError) {
      throw new Error(relationshipError.message)
    }

    if (isVerifiedByCode) {
      await adminSupabase
        .from('patient_consent_grants')
        .insert({
          doctor_id: doctorId,
          patient_id: anyExistingPatient.id,
          consent_type: 'messaging',
          consent_state: 'granted',
          verification_method: 'patient_code',
          verification_token_hash: crypto
            .createHash('sha256')
            .update((data.patientCode || '').toUpperCase().trim())
            .digest('hex'),
          granted_at: now
        })
        .select('id')
        .maybeSingle()
    }
    
    // Update last activity
    await adminSupabase
      .from('patients')
      .update({ last_activity_at: now })
      .eq('id', anyExistingPatient.id)
    
    return {
      success: true,
      patient: anyExistingPatient as Patient,
      relationship: newRelationship as DoctorPatientRelationship,
      accessLevel,
      consentState,
      isExisting: true,
      isGhostMode: false,
      message: isVerifiedByCode 
        ? 'Patient verified and added to My Patients'
        : 'Patient record linked (code not shared)'
    }
  }
  
  // ============================================
  // CREATE NEW PATIENT (Walk-in)
  // ============================================
  const created = await createWalkInPatient(doctorId, {
    phone: normalizedPhone,
    fullName: data.fullName,
    age: data.age,
    sex: data.sex,
    isDependent: data.isDependent,
    parentPhone: data.parentPhone,
    clinicId: resolvedClinicId || data.clinicId
  })

  return {
    ...created,
    accessLevel: 'walk_in_limited',
    consentState: 'pending'
  }
}

/**
 * Create a new walk-in patient
 *
 * FIXED: Now creates public.users record before public.patients
 */
export async function createWalkInPatient(
  doctorId: string,
  data: {
    phone: string
    fullName: string
    age?: number
    sex?: 'Male' | 'Female' | 'Other'
    isDependent?: boolean
    parentPhone?: string
    /** UUID of the guardian's patients row — preferred over parent_phone for FK integrity */
    guardianId?: string
    clinicId?: string
  }
): Promise<OnboardingResult> {
  const adminSupabase = createAdminClient('patient-onboarding')

  // ============================================
  // STEP 0a: Deduplicate dependents across doctors
  // Without this, every new doctor creates a fresh DEP_xxx record for the
  // same child. We match by parent_phone + full_name (case-insensitive).
  // If a match is found we skip record creation and just add a new
  // doctor-patient relationship — exactly like regular walk-in patients.
  // ============================================
  if (data.isDependent && data.parentPhone) {
    const parentPhone = data.parentPhone
    // Build phone variants (local 01X... and international +21X...)
    const intlParentPhone = parentPhone.startsWith('0')
      ? '+2' + parentPhone.slice(1)
      : parentPhone.startsWith('+2')
      ? '0' + parentPhone.slice(2)
      : null

    const phoneFilter = intlParentPhone
      ? `parent_phone.eq.${parentPhone},parent_phone.eq.${intlParentPhone}`
      : `parent_phone.eq.${parentPhone}`

    const { data: existingDependent } = await adminSupabase
      .from('patients')
      .select('*')
      .eq('is_dependent', true)
      .or(phoneFilter)
      .ilike('full_name', data.fullName.trim())
      .limit(1)
      .maybeSingle()

    if (existingDependent) {
      const now = new Date().toISOString()

      // Check if this doctor already has a relationship
      const { data: existingRel } = await adminSupabase
        .from('doctor_patient_relationships')
        .select('id')
        .eq('doctor_id', doctorId)
        .eq('patient_id', existingDependent.id)
        .maybeSingle()

      if (existingRel) {
        // Returning visit — update last_visit_at only
        await adminSupabase
          .from('doctor_patient_relationships')
          .update({ last_visit_at: now })
          .eq('id', existingRel.id)
      } else {
        // New doctor for this dependent — create walk_in_limited relationship
        const { error: relError } = await adminSupabase
          .from('doctor_patient_relationships')
          .insert({
            doctor_id: doctorId,
            patient_id: existingDependent.id,
            clinic_id: data.clinicId || null,
            status: 'pending',
            relationship_type: 'walk_in',
            access_level: 'walk_in_limited',
            consent_state: 'pending',
            access_type: 'walk_in',
            notes: 'walk-in',
            last_visit_at: now,
            doctor_entered_name: data.fullName,
            doctor_entered_age: data.age,
            doctor_entered_sex: data.sex,
          })
        if (relError) throw new Error(relError.message)
      }

      await adminSupabase
        .from('patients')
        .update({ last_activity_at: now })
        .eq('id', existingDependent.id)

      return {
        success: true,
        patient: existingDependent as Patient,
        relationship: null as any,
        accessLevel: 'walk_in_limited',
        consentState: 'pending',
        isExisting: true,
        isGhostMode: false,
        message: 'Dependent linked to doctor',
      }
    }
  }

  // ============================================
  // STEP 0: Resolve guardian_id
  // If the caller already found the guardian's UUID, use it directly.
  // Otherwise, attempt to look up by parent_phone so we always store
  // a proper FK when the guardian exists in the patients table.
  // ============================================
  let resolvedGuardianId: string | null = data.guardianId || null

  if (data.isDependent && data.parentPhone && !resolvedGuardianId) {
    // Try exact phone match. Walk-in phones are stored as entered (e.g. "01012345678").
    // Also try international format (+201XXXXXXXXX) in case guardian registered via app.
    const phone = data.parentPhone
    const intlPhone = phone.startsWith('0') ? '+2' + phone.slice(1) : null

    const orFilter = intlPhone
      ? `phone.eq.${phone},phone.eq.${intlPhone}`
      : `phone.eq.${phone}`

    const { data: guardianRow } = await adminSupabase
      .from('patients')
      .select('id')
      .or(orFilter)
      .limit(1)
      .maybeSingle()

    if (guardianRow?.id) {
      resolvedGuardianId = guardianRow.id
    }
  }

  // ============================================
  // STEP 1: Create auth user (silent auth)
  // ============================================
  const dummyEmail = `walkin_${nanoid(8)}@medassist.temp`
  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email: dummyEmail,
    email_confirm: true,
    user_metadata: { 
      role: 'patient', 
      phone: data.phone,
      is_walkin: true,
      full_name: data.fullName
    }
  })
  
  if (authError || !authData.user) {
    throw new Error(authError?.message || 'Failed to create auth user')
  }
  
  const userId = authData.user.id
  
  // ============================================
  // STEP 2: Create public.users record (FK FIX!)
  // ============================================
  const { error: userError } = await adminSupabase
    .from('users')
    .insert({
      id: userId,
      phone: data.phone,
      role: 'patient'
    })
  
  if (userError) {
    await adminSupabase.auth.admin.deleteUser(userId)
    throw new Error(`Failed to create user: ${userError.message}`)
  }
  
  // ============================================
  // STEP 3: Create public.patients record
  // ============================================
  const patientUniqueId = `MED-${nanoid(6).toUpperCase()}`

  const { data: patient, error: patientError } = await adminSupabase
    .from('patients')
    .insert({
      id: userId,
      unique_id: patientUniqueId,
      phone: data.phone,
      full_name: data.fullName,
      age: data.age ?? null,
      sex: data.sex ?? null,
      is_dependent: data.isDependent || false,
      parent_phone: data.isDependent ? data.parentPhone : null,
      // FK link to guardian's patient record (preferred over parent_phone for integrity)
      guardian_id: data.isDependent ? resolvedGuardianId : null,
      registered: false,
      phone_verified: false,
      account_status: 'active',
      last_activity_at: new Date().toISOString(),
      created_by_doctor_id: doctorId,
    })
    .select()
    .single()
  
  if (patientError) {
    await adminSupabase.from('users').delete().eq('id', userId)
    await adminSupabase.auth.admin.deleteUser(userId)
    throw new Error(`Failed to create patient: ${patientError.message}`)
  }

  // Log audit event
  await logAuditEvent({
    clinicId: data.clinicId,
    actorUserId: doctorId,
    action: 'CREATE_PATIENT',
    entityType: 'patient',
    entityId: userId,
    metadata: {
      phone: data.phone,
      fullName: data.fullName,
      age: data.age,
      sex: data.sex
    }
  })

  // ============================================
  // STEP 4: Create default visibility
  // ============================================
  if (data.clinicId) {
    await createDefaultVisibility({
      clinicId: data.clinicId,
      patientId: userId,
      doctorUserId: doctorId
    })
  }

  // ============================================
  // STEP 5: Create phone history
  // ============================================
  await adminSupabase
    .from('patient_phone_history')
    .insert({
      patient_id: userId,
      phone: data.phone,
      is_current: true,
      verified: false
    })
  
  // ============================================
  // STEP 6: Create walk_in relationship
  // ============================================
  let relationship: any = null
  let relationshipError: any = null

  // Current schema
  const { data: newRelationship, error: newRelationshipError } = await adminSupabase
    .from('doctor_patient_relationships')
    .insert({
      doctor_id: doctorId,
      patient_id: userId,
      clinic_id: data.clinicId || null,
      status: 'pending',
      relationship_type: 'walk_in',
      access_level: 'walk_in_limited',
      consent_state: 'pending',
      access_type: 'walk_in',
      notes: 'walk-in',
      last_visit_at: new Date().toISOString()
    })
    .select()
    .single()

  relationship = newRelationship
  relationshipError = newRelationshipError

  // Legacy fallback
  if (relationshipError) {
    const { data: legacyRelationship, error: legacyRelationshipError } = await adminSupabase
      .from('doctor_patient_relationships')
      .insert({
        doctor_id: doctorId,
        patient_id: userId,
        access_type: 'walk_in'
      })
      .select()
      .single()

    relationship = legacyRelationship
    relationshipError = legacyRelationshipError
  }

  if (relationshipError) {
    await adminSupabase.from('patients').delete().eq('id', userId)
    await adminSupabase.from('users').delete().eq('id', userId)
    await adminSupabase.auth.admin.deleteUser(userId)
    throw new Error(`Failed to create relationship: ${relationshipError.message}`)
  }

  return {
    success: true,
    patient: patient as Patient,
    relationship: relationship as DoctorPatientRelationship,
    accessLevel: 'walk_in_limited',
    consentState: 'pending',
    isExisting: false,
    isGhostMode: false,
    message: 'Walk-in patient created successfully'
  }
}

// ============================================================================
// GHOST MODE
// ============================================================================

/**
 * Create a ghost/anonymous visit
 * No patient record, no SMS, no trace
 */
async function createGhostVisit(
  doctorId: string,
  reasonCategory?: string
): Promise<OnboardingResult> {
  const adminSupabase = createAdminClient('patient-onboarding')
  
  // Get next anonymous number for today
  const { data: nextNum } = await adminSupabase
    .rpc('get_next_anonymous_number', { p_doctor_id: doctorId })
  
  const anonymousNumber = nextNum || 1
  
  // Create anonymous visit record
  const { error: visitError } = await adminSupabase
    .from('anonymous_visits')
    .insert({
      doctor_id: doctorId,
      visit_date: new Date().toISOString().split('T')[0],
      daily_number: anonymousNumber,
      actual_start_time: new Date().toISOString(),
      status: 'in_progress'
    })
  
  if (visitError) {
    throw new Error(`Failed to create anonymous visit: ${visitError.message}`)
  }
  
  // Log opt-out for analytics
  await adminSupabase
    .from('opt_out_statistics')
    .insert({
      doctor_id: doctorId,
      reason_category: reasonCategory || 'not_specified'
    })
  
  return {
    success: true,
    isExisting: false,
    isGhostMode: true,
    accessLevel: 'ghost',
    consentState: 'revoked',
    anonymousNumber,
    message: `Anonymous Patient ${anonymousNumber} created`
  }
}

// ============================================================================
// MY PATIENTS (Doctor's patient list)
// ============================================================================

/**
 * Get doctor's patients (only those with relationships)
 *
 * PRIVACY: Only returns patients where doctor has relationship
 */
export async function getMyPatients(
  doctorId: string,
  options: {
    accessType?: 'walk_in' | 'verified' | 'all'
    limit?: number
    offset?: number
    clinicId?: string
  } = {}
): Promise<{ patients: Patient[], total: number }> {
  const adminSupabase = createAdminClient('patient-privacy-checks')
  const { limit = 50, offset = 0, accessType = 'all', clinicId } = options

  let relationshipsQuery = adminSupabase
    .from('doctor_patient_relationships')
    .select('*', { count: 'exact' })
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false })

  if (accessType === 'verified') {
    relationshipsQuery = relationshipsQuery.or('access_level.eq.verified_consented,access_type.eq.verified')
  } else if (accessType === 'walk_in') {
    relationshipsQuery = relationshipsQuery.or('access_level.eq.walk_in_limited,access_type.eq.walk_in,consent_state.eq.pending')
  }

  const { data: relationships, error: relationshipsError, count } = await relationshipsQuery.range(
    offset,
    offset + limit - 1
  )

  if (relationshipsError) {
    throw new Error(relationshipsError.message)
  }

  const patientIds = (relationships || []).map((r: any) => r.patient_id)
  if (patientIds.length === 0) {
    return { patients: [], total: 0 }
  }

  let patientQuery = adminSupabase
    .from('patients')
    .select('*')
    .in('id', patientIds)

  // Note: clinic_id filtering is handled via doctor_patient_relationships, not patients table
  const { data: patientRows, error: patientsError } = await patientQuery

  if (patientsError) {
    throw new Error(patientsError.message)
  }

  const patientsById = new Map((patientRows || []).map((p: any) => [p.id, p]))
  const patients = (relationships || [])
    .map((r: any) => patientsById.get(r.patient_id))
    .filter(Boolean) as Patient[]

  return { patients, total: count || patients.length }
}

/**
 * Search within doctor's patients only
 * When clinicId is provided, searches all patients in the clinic (for multi-doctor clinics)
 */
export async function searchMyPatients(
  doctorId: string,
  query: string,
  limit: number = 10,
  clinicId?: string
): Promise<Patient[]> {
  const adminSupabase = createAdminClient('patient-privacy-checks')

  // First get patient IDs this doctor has relationship with
  let relationshipsQuery = adminSupabase
    .from('doctor_patient_relationships')
    .select('patient_id')

  if (clinicId) {
    // Clinic-scoped: search all patients in this clinic (any doctor)
    relationshipsQuery = relationshipsQuery.eq('clinic_id', clinicId)
  } else {
    // Doctor-scoped: only this doctor's patients
    relationshipsQuery = relationshipsQuery.eq('doctor_id', doctorId)
  }

  const { data: relationships, error: relationshipsError } = await relationshipsQuery

  if (relationshipsError) {
    throw new Error(relationshipsError.message)
  }

  if (!relationships || relationships.length === 0) {
    return []
  }

  const patientIds = [...new Set(relationships.map(r => r.patient_id))]

  // Search within those patients.
  // parent_phone is included so typing the caregiver's number surfaces all
  // dependents (children, elderly) registered under that number.
  const { data, error } = await adminSupabase
    .from('patients')
    .select('*')
    .in('id', patientIds)
    .or(`phone.ilike.%${query}%,parent_phone.ilike.%${query}%,unique_id.ilike.%${query}%,full_name.ilike.%${query}%`)
    .limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  return data as Patient[]
}

// ============================================================================
// PATIENT VISITS (Doctor's view)
// ============================================================================

/**
 * Get patient's visits at this doctor's clinic
 * 
 * PRIVACY:
 * - walk_in: Only sees own visits
 * - verified: Sees all visits (if patient shared history)
 */
export async function getPatientVisits(
  doctorId: string,
  patientId: string,
  options: {
    includeOtherDoctors?: boolean  // Only honored if verified relationship
    limit?: number
  } = {}
): Promise<any[]> {
  const supabase = await createClient()
  const { includeOtherDoctors = false, limit = 20 } = options
  
  // Check relationship
  const { data: relationship } = await supabase
    .from('doctor_patient_relationships')
    .select('access_type, status, access_level, consent_state')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .single()
  
  if (!relationship) {
    throw new Error('No relationship with this patient')
  }
  
  let query = supabase
    .from('clinical_notes')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  // If walk_in, only show own notes
  const allowHistorySharing = isVerifiedRelationship(relationship)

  if (!includeOtherDoctors || !allowHistorySharing) {
    query = query.eq('doctor_id', doctorId)
  }
  // If verified, shows all (query unchanged)
  
  const { data, error } = await query
  
  if (error) {
    throw new Error(error.message)
  }
  
  return data || []
}

// ============================================================================
// UPGRADE RELATIONSHIP
// ============================================================================

/**
 * Upgrade walk_in to verified when patient shares code
 */
export async function upgradeRelationship(
  doctorId: string,
  patientId: string,
  patientCode: string
): Promise<{ success: boolean, message: string, relationship?: DoctorPatientRelationship }> {
  const supabase = await createClient()
  const adminSupabase = createAdminClient('patient-privacy-checks')
  
  // Get patient
  const { data: patient } = await adminSupabase
    .from('patients')
    .select('unique_id, phone')
    .eq('id', patientId)
    .single()
  
  if (!patient) {
    return { success: false, message: 'Patient not found' }
  }
  
  // Verify code
  if (!timingSafeEqualString(patient.unique_id, patientCode.toUpperCase().trim())) {
    return { success: false, message: 'Invalid code' }
  }
  
  // Upgrade relationship
  let upgradeError: any = null
  let upgradedRelationship: any = null
  const now = new Date().toISOString()

  // Current schema
  const { data: newSchemaData, error: newSchemaError } = await supabase
    .from('doctor_patient_relationships')
    .update({
      access_level: 'verified_consented',
      consent_state: 'granted',
      consent_granted_at: now,
      status: 'active',
      relationship_type: 'primary',
      access_type: 'verified',
      verified_at: now
    })
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .select()
    .maybeSingle()

  upgradedRelationship = newSchemaData
  upgradeError = newSchemaError

  // Legacy fallback
  if (upgradeError) {
    const { data: legacySchemaData, error: legacySchemaError } = await supabase
      .from('doctor_patient_relationships')
      .update({
        access_type: 'verified',
        verified_at: now
      })
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .select()
      .maybeSingle()

    upgradedRelationship = legacySchemaData
    upgradeError = legacySchemaError
  }

  if (upgradeError) {
    return { success: false, message: upgradeError.message }
  }

  if (!upgradedRelationship) {
    return { success: false, message: 'No relationship found to upgrade' }
  }

  await adminSupabase
    .from('patient_consent_grants')
    .insert({
      doctor_id: doctorId,
      patient_id: patientId,
      consent_type: 'messaging',
      consent_state: 'granted',
      verification_method: 'patient_code',
      verification_token_hash: crypto
        .createHash('sha256')
        .update(patientCode.toUpperCase().trim())
        .digest('hex'),
      granted_at: now
    })
    .select('id')
    .maybeSingle()
  
  return { 
    success: true, 
    message: 'Relationship upgraded. Patient added to My Patients with messaging enabled.',
    relationship: upgradedRelationship as DoctorPatientRelationship
  }
}

// ============================================================================
// MESSAGING PERMISSION CHECK
// ============================================================================

/**
 * Check if doctor can message this patient
 * Only verified relationships allow messaging
 */
export async function canMessagePatient(
  doctorId: string,
  patientId: string
): Promise<boolean> {
  const supabase = await createClient()

  const { data: relationship } = await supabase
    .from('doctor_patient_relationships')
    .select('status, access_level, consent_state, access_type')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .maybeSingle()

  if (!isVerifiedRelationship(relationship)) {
    return false
  }

  const { data: consent } = await supabase
    .from('patient_consent_grants')
    .select('consent_state')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .eq('consent_type', 'messaging')
    .eq('consent_state', 'granted')
    .is('revoked_at', null)
    .maybeSingle()

  return !!consent
}

export async function getDoctorPatientRelationship(
  doctorId: string,
  patientId: string
): Promise<DoctorPatientRelationship | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('doctor_patient_relationships')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as DoctorPatientRelationship | null) || null
}

/**
 * Log patient view (audit trail)
 */
export async function logPatientView(
  doctorId: string,
  patientId: string,
  clinicId?: string
) {
  await logAuditEvent({
    clinicId,
    actorUserId: doctorId,
    action: 'VIEW_PATIENT',
    entityType: 'patient',
    entityId: patientId
  })
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get today's anonymous visit count
 */
export async function getAnonymousVisitCount(doctorId: string): Promise<number> {
  const supabase = await createClient()
  
  const today = new Date().toISOString().split('T')[0]
  
  const { count } = await supabase
    .from('anonymous_visits')
    .select('*', { count: 'exact', head: true })
    .eq('doctor_id', doctorId)
    .eq('visit_date', today)
  
  return count || 0
}

/**
 * Get opt-out statistics
 */
export async function getOptOutStats(
  doctorId: string,
  days: number = 30
): Promise<{ total: number, byReason: Record<string, number> }> {
  const supabase = await createClient()
  
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  
  const { data, count } = await supabase
    .from('opt_out_statistics')
    .select('reason_category', { count: 'exact' })
    .eq('doctor_id', doctorId)
    .gte('opt_out_date', startDate.toISOString().split('T')[0])
  
  const byReason: Record<string, number> = {}
  data?.forEach(row => {
    const reason = row.reason_category || 'not_specified'
    byReason[reason] = (byReason[reason] || 0) + 1
  })
  
  return { total: count || 0, byReason }
}

// ============================================================================
// SINGLE PATIENT RETRIEVAL
// ============================================================================

export async function getPatient(patientId: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .single()
  
  if (error) {
    throw new Error(error.message)
  }
  
  return data as Patient
}
