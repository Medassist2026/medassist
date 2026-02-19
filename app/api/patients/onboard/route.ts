import { onboardPatient } from '@/lib/data/patients'
import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { ensureDoctorInFrontdeskClinic } from '@/lib/data/frontdesk-scope'
import { NextResponse } from 'next/server'
import { validateEgyptianPhone } from '@/lib/utils/phone-validation'
import { enforceRateLimit } from '@/lib/security/rate-limit'

/**
 * POST /api/patients/onboard
 * 
 * Unified patient onboarding endpoint
 * Handles: New walk-ins, returning patients, code verification, ghost mode
 */
export async function POST(request: Request) {
  try {
    const rate = await enforceRateLimit(request, 'patient-onboard', 20, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many onboarding attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    // Verify doctor or front desk
    const user = await requireApiRole(['doctor', 'frontdesk'])
    
    const body = await request.json()
    const { 
      phone, 
      fullName, 
      age, 
      sex, 
      isDependent, 
      parentPhone,
      doctorId,     // Required for frontdesk flows
      patientCode,  // Optional: if patient shares their code
      isGhostMode,  // Optional: no records created
      ghostReasonCategory
    } = body

    const assignedDoctorId = user.role === 'frontdesk' ? doctorId : user.id

    if (!assignedDoctorId) {
      return NextResponse.json(
        { error: 'Doctor ID is required for frontdesk onboarding', errorAr: 'يجب اختيار الطبيب أولاً' },
        { status: 400 }
      )
    }

    if (user.role === 'frontdesk') {
      const supabase = await createClient()
      const doctorInScope = await ensureDoctorInFrontdeskClinic(
        supabase as any,
        user.id,
        assignedDoctorId
      )
      if (!doctorInScope) {
        return NextResponse.json(
          { error: 'Doctor is outside your clinic scope' },
          { status: 403 }
        )
      }
    }
    
    // ============================================
    // GHOST MODE - Early exit
    // ============================================
    if (isGhostMode) {
      const result = await onboardPatient(assignedDoctorId, {
        phone: 'ghost',  // Not used in ghost mode
        fullName: 'ghost',
        age: 0,
        sex: 'Other',
        isGhostMode: true,
        ghostReasonCategory
      })
      
      return NextResponse.json({
        success: true,
        isGhostMode: true,
        anonymousNumber: result.anonymousNumber,
        message: result.message,
        access_level: result.accessLevel || 'ghost',
        consent_state: result.consentState || 'revoked'
      })
    }
    
    // ============================================
    // VALIDATION
    // ============================================
    
    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required', errorAr: 'رقم الموبايل مطلوب' },
        { status: 400 }
      )
    }
    
    const phoneValidation = validateEgyptianPhone(phone)
    if (!phoneValidation.isValid) {
      return NextResponse.json(
        { error: phoneValidation.error, errorAr: phoneValidation.errorAr },
        { status: 400 }
      )
    }
    
    if (!fullName || fullName.trim().length < 2) {
      return NextResponse.json(
        { error: 'Full name is required (at least 2 characters)', errorAr: 'الاسم مطلوب' },
        { status: 400 }
      )
    }
    
    if (age === undefined || age === null) {
      return NextResponse.json(
        { error: 'Age is required', errorAr: 'السن مطلوب' },
        { status: 400 }
      )
    }
    const parsedAge = Number(age)
    if (!Number.isFinite(parsedAge)) {
      return NextResponse.json(
        { error: 'Age must be numeric', errorAr: 'السن يجب أن يكون رقمًا' },
        { status: 400 }
      )
    }
    
    if (!sex || !['Male', 'Female', 'Other'].includes(sex)) {
      return NextResponse.json(
        { error: 'Sex is required', errorAr: 'النوع مطلوب' },
        { status: 400 }
      )
    }
    
    if (isDependent && !parentPhone) {
      return NextResponse.json(
        { error: 'Parent phone required for dependents', errorAr: 'رقم ولي الأمر مطلوب' },
        { status: 400 }
      )
    }
    
    // ============================================
    // ONBOARD PATIENT
    // ============================================
    
    const result = await onboardPatient(assignedDoctorId, {
      phone,
      fullName: fullName.trim(),
      age: parsedAge,
      sex,
      isDependent: isDependent || false,
      parentPhone,
      patientCode: patientCode?.trim()
    })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.message,
          access_level: result.accessLevel || 'walk_in_limited',
          consent_state: result.consentState || 'pending'
        },
        { status: 400 }
      )
    }
    
    // ============================================
    // RESPONSE
    // ============================================
    
    return NextResponse.json({
      success: result.success,
      patient: result.patient,
      relationship: result.relationship,
      isExisting: result.isExisting,
      isGhostMode: false,
      message: result.message,
      carrier: phoneValidation.carrier,
      access_level: result.accessLevel || result.relationship?.access_level || 'walk_in_limited',
      consent_state: result.consentState || result.relationship?.consent_state || 'pending'
    }, { status: result.isExisting ? 200 : 201 })
    
  } catch (error: any) {
    console.error('Patient onboard error:', error)
    return toApiErrorResponse(error, 'Failed to onboard patient')
  }
}
