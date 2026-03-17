export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'

/**
 * POST /api/auth/check-phone
 *
 * Public endpoint — checks if a phone number is already registered.
 * Used during registration to catch duplicates BEFORE sending OTP.
 *
 * Privacy: Only returns exists true/false — no user details leaked.
 */
export async function POST(request: Request) {
  try {
    const rate = await enforceRateLimit(request, 'auth-check-phone', 10, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'محاولات كثيرة. حاول مرة أخرى لاحقاً.' },
        { status: 429 }
      )
    }

    const { phone } = await request.json()

    if (!phone) {
      return NextResponse.json(
        { error: 'رقم الهاتف مطلوب' },
        { status: 400 }
      )
    }

    const admin = createAdminClient('auth-login-lookup')

    // Check users table (all roles)
    const { data: existingUser } = await admin
      .from('users')
      .select('id')
      .eq('phone', phone)
      .maybeSingle()

    if (existingUser) {
      return NextResponse.json({
        exists: true,
        message: 'رقم الهاتف مسجل بالفعل. يرجى تسجيل الدخول بدلاً من ذلك.',
      })
    }

    return NextResponse.json({ exists: false })

  } catch (error: any) {
    console.error('Check phone error:', error)
    return NextResponse.json(
      { error: 'فشل في التحقق من رقم الهاتف' },
      { status: 500 }
    )
  }
}
