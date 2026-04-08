import { NextResponse } from 'next/server'
import { verifyOTP } from '@shared/lib/auth/otp'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'
import { createAdminClient } from '@shared/lib/supabase/admin'
import crypto from 'crypto'

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

    // For password_reset: issue a short-lived single-use token so the reset
    // page can prove it was preceded by a valid OTP check (avoids unauthenticated
    // password changes via phone number alone).
    if (purpose === 'password_reset') {
      const admin = createAdminClient('verify-otp-reset-token')
      const resetToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex')
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min TTL

      const { error: insertError } = await admin.from('otp_codes').insert({
        phone,
        code_hash: tokenHash,
        purpose: 'reset_token',
        expires_at: expiresAt,
        used: false,
        max_attempts: 1,
      })

      if (insertError) {
        console.error('Reset token insert error:', insertError)
        return NextResponse.json(
          { error: 'فشل في إنشاء رمز إعادة التعيين' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        verified: true,
        resetToken,
        message: 'تم التحقق بنجاح',
      })
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
