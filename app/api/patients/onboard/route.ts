import { onboardPatient, checkPhoneExists, verifyPatientCode } from '@/lib/data/patients'
import { requireRole } from '@/lib/auth/session'
import { NextResponse } from 'next/server'
import { validateEgyptianPhone } from '@/lib/utils/phone-validation'

/**
 * POST /api/patients/onboard
 * 
 * Unified patient onboarding endpoint
 * Handles: New walk-ins, returning patients, code verification, ghost mode
 */
export async function POST(request: Request) {
  try {
    // Verify doctor or front desk
    const user = await requireRole(['doctor', 'frontdesk'])
    
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
        message: result.message
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
      age: parseInt(age),
      sex,
      isDependent: isDependent || false,
      parentPhone,
      patientCode: patientCode?.trim()
    })
    
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
      carrier: phoneValidation.carrier
    }, { status: result.isExisting ? 200 : 201 })
    
  } catch (error: any) {
    console.error('Patient onboard error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to onboard patient' },
      { status: 500 }
    )
  }
}
