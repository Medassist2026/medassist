export const dynamic = 'force-dynamic'

import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'

export async function POST(request: Request) {
  try {
    const rate = await enforceRateLimit(request, 'auth-login', 8, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    const { phone: identifier, password, role } = await request.json()

    if (!identifier || !password || !role) {
      return NextResponse.json(
        { error: 'Identifier, password, and role are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const admin = createAdminClient('auth-login-lookup')

    // Determine if input is email or phone
    const isEmail = identifier.includes('@')

    // Sign in with Supabase Auth - use email if available, otherwise phone
    let authData, authError
    let signInEmail: string | null = null
    let signInPhone: string | null = null

    if (isEmail) {
      signInEmail = identifier
    } else {
      // Resolve phone -> auth credential with admin client (avoids pre-auth RLS block)
      const { data: userByPhone, error: lookupError } = await admin
        .from('users')
        .select('email, phone')
        .eq('phone', identifier)
        .maybeSingle()

      if (lookupError || !userByPhone) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      }

      // Most accounts authenticate via email even if phone exists in profile.
      if (userByPhone.email) {
        signInEmail = userByPhone.email
      } else if (userByPhone.phone) {
        signInPhone = userByPhone.phone
      }
    }

    if (signInEmail) {
      const emailLogin = await supabase.auth.signInWithPassword({
        email: signInEmail,
        password
      })
      authData = emailLogin.data
      authError = emailLogin.error
    } else if (signInPhone) {
      const phoneLogin = await supabase.auth.signInWithPassword({
        phone: signInPhone,
        password
      })
      authData = phoneLogin.data
      authError = phoneLogin.error
    } else {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    if (authError) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      )
    }

    // Verify role after successful auth (allowed by RLS because auth.uid() is set)
    const { data: existingUser, error: roleError } = await supabase
      .from('users')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    if (roleError || !existingUser) {
      // Keep logout local to this request/session so other active sessions
      // (for the same user in other tabs/devices) are not revoked.
      await supabase.auth.signOut({ scope: 'local' })
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    if (existingUser.role !== role) {
      // Role mismatch should not globally revoke other valid sessions.
      await supabase.auth.signOut({ scope: 'local' })
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      role: existingUser.role,
      userId: authData.user.id
    })

  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
