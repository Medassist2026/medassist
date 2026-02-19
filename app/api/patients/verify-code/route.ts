import { verifyPatientCode } from '@/lib/data/patients'
import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { NextResponse } from 'next/server'
import { validateEgyptianPhone } from '@/lib/utils/phone-validation'
import { enforceRateLimit } from '@/lib/security/rate-limit'

/**
 * POST /api/patients/verify-code
 * 
 * Verify patient's unique code and return basic info for pre-filling
 * 
 * Patient shares their code → Doctor sees basic info (name, age, sex)
 * Code NOT shared → Doctor enters info manually
 */
export async function POST(request: Request) {
  try {
    const rate = await enforceRateLimit(request, 'patient-verify-code', 12, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { valid: false, error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    await requireApiRole(['doctor', 'frontdesk'])
    
    const { phone, code } = await request.json()
    
    if (!phone || !code) {
      return NextResponse.json(
        { 
          valid: false, 
          error: 'Phone and code are required',
          errorAr: 'رقم الموبايل والكود مطلوبان'
        },
        { status: 400 }
      )
    }
    
    // Validate phone format
    const validation = validateEgyptianPhone(phone)
    if (!validation.isValid) {
      return NextResponse.json({
        valid: false,
        error: validation.error,
        errorAr: validation.errorAr
      })
    }
    
    // Verify code
    const result = await verifyPatientCode(phone, code)
    
    if (!result.valid) {
      return NextResponse.json({
        valid: false,
        error: 'Verification failed',
        errorAr: 'فشل التحقق'
      })
    }
    
    // Code valid - return basic info for pre-fill
    return NextResponse.json({
      valid: true,
      patient: result.patient,
      message: result.message,
      messageAr: 'تم التحقق من المريض بنجاح'
    })
    
  } catch (error: any) {
    console.error('Verify code error:', error)
    const response = toApiErrorResponse(error, 'Verification failed')
    return response
  }
}
