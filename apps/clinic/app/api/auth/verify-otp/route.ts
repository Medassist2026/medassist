import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyOTP } from '@shared/lib/auth/otp'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'

/**
 * POST /api/auth/verify-otp
 * Verifies OTP code. For password_reset purpose, generates a short-lived
 * reset token stored in DB — the reset-password endpoint checks this token
 * instead of trusting a client-side `verified=true` param.
 */
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

    // For password reset: generate a server-side reset token (10 min expiry)
    // This replaces the insecure client-side `verified=true` parameter
    let resetToken: string | undefined
    if (purpose === 'password_reset') {
      resetToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex')
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

      const admin = createAdminClient('otp-verify-token')
      // Store reset token in otp_codes table with purpose 'reset_token'
      await admin.from('otp_codes').insert({
        phone,
        code_hash: tokenHash,
        otp_hash: tokenHash,
        purpose: 'reset_token',
        expires_at: expiresAt,
        used: false,
        attempts: 0,
        max_attempts: 1,
        created_at: new Date().toISOString(),
      })
    }

    return NextResponse.json({
      success: true,
      verified: true,
      message: 'تم التحقق بنجاح',
      ...(resetToken && { resetToken }),
    })

  } catch (error: any) {
    console.error('Verify OTP error:', error)
    return NextResponse.json(
      { error: 'فشل في التحقق من الرمز' },
      { status: 500 }
    )
  }
}
