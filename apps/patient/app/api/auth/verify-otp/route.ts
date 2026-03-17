import { NextResponse } from 'next/server'
import { verifyOTP } from '@shared/lib/auth/otp'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'

export async function POST(request: Request) {
  try {
    const rate = await enforceRateLimit(request, 'otp-verify', 10, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    const { phone, code, purpose } = await request.json()

    if (!phone || !code || !purpose) {
      return NextResponse.json(
        { error: 'جميع الحقول مطلوبة' },
        { status: 400 }
      )
    }

    const result = await verifyOTP(phone, code, purpose)

    if (!result.valid) {
      return NextResponse.json(
        { error: result.error || 'رمز التحقق غير صحيح' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      verified: true,
      message: 'تم التحقق بنجاح'
    })

  } catch (error: any) {
    console.error('Verify OTP error:', error)
    return NextResponse.json(
      { error: 'فشل في التحقق من الرمز' },
      { status: 500 }
    )
  }
}
