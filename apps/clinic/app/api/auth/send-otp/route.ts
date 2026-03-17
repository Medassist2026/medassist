import { NextResponse } from 'next/server'
import { createOTP } from '@shared/lib/auth/otp'
import { sendSMS } from '@shared/lib/sms/twilio-client'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'

/**
 * DEV_BYPASS_OTP: When true, skips OTP creation and SMS entirely.
 * Set to 'true' in .env.local during testing.
 * The OTP page will accept any 4-digit code (handled in verify-otp).
 */
const DEV_BYPASS_OTP = process.env.DEV_BYPASS_OTP === 'true'

export async function POST(request: Request) {
  try {
    // ── Rate Limit ────────────────────────────────────────────────
    const rate = await enforceRateLimit(request, 'otp-send', 5, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    // ── Validate Input ────────────────────────────────────────────
    const { phone, purpose } = await request.json()

    if (!phone) {
      return NextResponse.json(
        { error: 'رقم الهاتف مطلوب' },
        { status: 400 }
      )
    }

    const validPurposes = ['registration', 'login', 'password_reset']
    if (!purpose || !validPurposes.includes(purpose)) {
      return NextResponse.json(
        { error: 'غرض غير صالح' },
        { status: 400 }
      )
    }

    // ── Dev Bypass Mode ───────────────────────────────────────────
    if (DEV_BYPASS_OTP) {
      console.log(`[OTP] DEV BYPASS — skipping OTP for ${phone} (purpose: ${purpose})`)
      return NextResponse.json({
        success: true,
        message: 'تم إرسال رمز التحقق',
        _dev: true,
      })
    }

    // ── Generate & Store OTP ──────────────────────────────────────
    const code = await createOTP(phone, purpose)

    // ── Send via SMS ──────────────────────────────────────────────
    const message = `رمز التحقق الخاص بك في MedAssist هو: ${code}\nصالح لمدة ٥ دقائق.`
    const smsResult = await sendSMS(phone, message)

    if (!smsResult.success) {
      console.error('SMS send failed:', smsResult.error)
      // Still return success to not leak phone validity info
    }

    return NextResponse.json({
      success: true,
      message: 'تم إرسال رمز التحقق'
    })

  } catch (error: any) {
    console.error('=== Send OTP Error ===')
    console.error('Message:', error?.message)
    console.error('Stack:', error?.stack)
    console.error('======================')
    return NextResponse.json(
      { error: 'فشل في إرسال رمز التحقق', _debug: process.env.NODE_ENV === 'development' ? error?.message : undefined },
      { status: 500 }
    )
  }
}
