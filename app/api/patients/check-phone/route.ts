import { checkPhoneExists } from '@/lib/data/patients'
import { requireRole } from '@/lib/auth/session'
import { NextResponse } from 'next/server'
import { validateEgyptianPhone } from '@/lib/utils/phone-validation'

/**
 * GET /api/patients/check-phone?phone=01234567890
 * 
 * Privacy-aware phone check
 * 
 * PRIVACY RULES:
 * - Only returns "exists: true" for REGISTERED patients (has app account)
 * - Walk-ins from other doctors are INVISIBLE
 * - No patient details returned ever (only existence)
 */
export async function GET(request: Request) {
  try {
    await requireRole(['doctor', 'frontdesk'])
    
    const { searchParams } = new URL(request.url)
    const phone = searchParams.get('phone')
    
    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      )
    }
    
    // Validate phone format
    const validation = validateEgyptianPhone(phone)
    if (!validation.isValid) {
      return NextResponse.json({
        exists: false,
        isRegistered: false,
        valid: false,
        error: validation.error,
        errorAr: validation.errorAr
      })
    }
    
    // Check if REGISTERED patient exists
    // Walk-ins from other doctors are INVISIBLE
    const result = await checkPhoneExists(phone)
    
    return NextResponse.json({
      exists: result.exists,
      isRegistered: result.isRegistered,
      valid: true,
      formatted: validation.formatted,
      carrier: validation.carrier
      // NO patient details returned - privacy protection
    })
    
  } catch (error: any) {
    console.error('Check phone error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check phone' },
      { status: 500 }
    )
  }
}
