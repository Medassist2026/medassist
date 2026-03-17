import { NextResponse } from 'next/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { createClient } from '@shared/lib/supabase/server'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'

export async function POST(request: Request) {
  try {
    const rate = await enforceRateLimit(request, 'password-reset', 5, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    const { phone, newPassword } = await request.json()

    if (!phone || !newPassword) {
      return NextResponse.json(
        { error: 'رقم الهاتف وكلمة المرور الجديدة مطلوبان' },
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

    // Find user by phone
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
