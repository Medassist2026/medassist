import { NextResponse } from 'next/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { createClient } from '@shared/lib/supabase/server'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'
import crypto from 'crypto'

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
        { error: 'رقم الهاتف وكلمة المرور الجديدة ورمز إعادة التعيين مطلوبة' },
        { status: 400 }
      )
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'كلمة المرور يجب أن تكون ٦ أحرف على الأقل' },
        { status: 400 }
      )
    }

    const admin = createAdminClient('password-reset')

    // ── Validate reset token ─────────────────────────────────────────────────
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex')

    const { data: tokenRow, error: tokenError } = await admin
      .from('otp_codes')
      .select('id, expires_at, used')
      .eq('phone', phone)
      .eq('code_hash', tokenHash)
      .eq('purpose', 'reset_token')
      .maybeSingle()

    if (tokenError || !tokenRow) {
      return NextResponse.json(
        { error: 'رمز إعادة التعيين غير صالح' },
        { status: 401 }
      )
    }

    if (tokenRow.used) {
      return NextResponse.json(
        { error: 'تم استخدام رمز إعادة التعيين مسبقاً' },
        { status: 401 }
      )
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'انتهت صلاحية رمز إعادة التعيين' },
        { status: 401 }
      )
    }

    // Mark token as used immediately (prevent replay)
    await admin.from('otp_codes').update({ used: true }).eq('id', tokenRow.id)

    // ── Find user by phone ───────────────────────────────────────────────────
    const { data: user, error: userError } = await admin
      .from('users')
      .select('id, email')
      .eq('phone', phone)
      .maybeSingle()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'المستخدم غير موجود' },
        { status: 404 }
      )
    }

    // ── Update password via Supabase Admin API ───────────────────────────────
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

    // Auto-login: sign in with new password
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
