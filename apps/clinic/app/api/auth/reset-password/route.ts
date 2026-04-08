export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { createClient } from '@shared/lib/supabase/server'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'

/**
 * Build all plausible phone variants for an Egyptian number to handle
 * format inconsistencies between OTP storage and user registration.
 * e.g. +2001012345678, 01012345678, and 1012345678 all refer to the same number.
 */
function buildPhoneVariants(phone: string): string[] {
  const variants = new Set<string>()
  const digits = phone.replace(/\D/g, '')

  variants.add(phone) // original as-is

  if (phone.startsWith('+20')) {
    // +2001... → 01... and 1...
    variants.add(digits.slice(2))        // e.g. "01012345678"
    variants.add(digits.slice(3))        // e.g. "1012345678"
  } else if (phone.startsWith('0')) {
    // 01... → +2001... and 1...
    variants.add('+20' + digits.slice(1)) // e.g. "+2001012345678"
    variants.add(digits.slice(1))         // e.g. "1012345678"
  } else {
    // 1... → +201... and 01...
    variants.add('+20' + digits)          // e.g. "+201012345678"
    variants.add('0' + digits)            // e.g. "01012345678"
  }

  return Array.from(variants)
}

/**
 * POST /api/auth/reset-password
 * Resets user password. REQUIRES a valid reset token (generated after OTP verification).
 * This prevents anyone from resetting passwords without completing OTP flow.
 */
export async function POST(request: Request) {
  try {
    const rate = await enforceRateLimit(request, 'password-reset', 5, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    const { phone, newPassword, resetToken } = await request.json()

    if (!phone || !newPassword || !resetToken) {
      return NextResponse.json(
        { error: 'جميع الحقول مطلوبة' },
        { status: 400 }
      )
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'كلمة المرور يجب أن تكون ٨ أحرف على الأقل' },
        { status: 400 }
      )
    }

    const admin = createAdminClient('password-reset')

    // Verify reset token — must exist, match phone, not expired, not used
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex')
    const { data: tokenRecord, error: tokenError } = await admin
      .from('otp_codes')
      .select('*')
      .eq('phone', phone)
      .eq('purpose', 'reset_token')
      .eq('code_hash', tokenHash)
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (tokenError || !tokenRecord) {
      return NextResponse.json(
        { error: 'رمز التحقق غير صالح. أعد العملية من البداية.' },
        { status: 403 }
      )
    }

    // Check token expiry (10 min from creation)
    if (new Date(tokenRecord.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'انتهت صلاحية رمز التحقق. أعد العملية من البداية.' },
        { status: 403 }
      )
    }

    // Mark token as used (single-use)
    await admin
      .from('otp_codes')
      .update({ used: true, consumed_at: new Date().toISOString(), used_at: new Date().toISOString() })
      .eq('id', tokenRecord.id)

    // Find user by phone — try all common Egyptian phone formats
    // because the registration flow and OTP flow may store phones differently
    // (+2001012345678 vs 01012345678 vs 1012345678)
    const phoneVariants = buildPhoneVariants(phone)

    let user: { id: string; email: string } | null = null
    for (const variant of phoneVariants) {
      const { data, error } = await admin
        .from('users')
        .select('id, email')
        .eq('phone', variant)
        .maybeSingle()
      if (!error && data) { user = data; break }
    }

    if (!user) {
      return NextResponse.json(
        { error: 'رمز التحقق غير مرتبط بهذا الرقم. أعد العملية من البداية.' },
        { status: 404 }
      )
    }

    // Update password via Supabase Admin API
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    })

    if (updateError) {
      console.error('Password update error:', updateError)
      return NextResponse.json(
        { error: 'فشل في تحديث كلمة المرور' },
        { status: 500 }
      )
    }

    // Auto-login with new password
    const supabase = await createClient()
    if (user.email) {
      await supabase.auth.signInWithPassword({
        email: user.email,
        password: newPassword,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح'
    })

  } catch (error: any) {
    console.error('Reset password error:', error)
    return NextResponse.json(
      { error: 'فشل في إعادة تعيين كلمة المرور' },
      { status: 500 }
    )
  }
}
