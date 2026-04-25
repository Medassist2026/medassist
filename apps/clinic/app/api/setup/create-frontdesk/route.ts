export const dynamic = 'force-dynamic'

/**
 * TEMPORARY ONE-TIME SETUP ENDPOINT — DELETE AFTER USE
 * GET /api/setup/create-frontdesk?secret=MEDASSIST_SETUP_2026
 *
 * Creates the frontdesk test account and links it to Dr. Naser's clinic.
 * Protected by a secret token. Safe to expose briefly — delete after calling.
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const SETUP_SECRET = 'MEDASSIST_SETUP_2026'
const INVITE_CODE  = '9Y8L-JX'

const FRONTDESK_EMAIL    = 'frontdesk@dr-naser.clinic'
const FRONTDESK_PHONE    = '+20100000001'
const FRONTDESK_PASSWORD = 'Frontdesk123'
const FRONTDESK_NAME     = 'سارة الاستقبال'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  if (searchParams.get('secret') !== SETUP_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const SUPABASE_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const SERVICE_ROLE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const log: string[] = []

  try {
    // ── Find clinic by invite code ────────────────────────────────────────
    const { data: clinic, error: clinicErr } = await admin
      .from('clinics')
      .select('id, name, unique_id')
      .eq('invite_code', INVITE_CODE)
      .maybeSingle()

    if (clinicErr || !clinic) {
      return NextResponse.json({ error: `Clinic not found: ${clinicErr?.message}` }, { status: 404 })
    }
    log.push(`✅ Clinic: ${clinic.name} (${clinic.id})`)

    // ── Check if user already exists ──────────────────────────────────────
    const { data: { users } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const existing = (users || []).find((u: any) => u.email === FRONTDESK_EMAIL)

    let userId: string

    if (existing) {
      userId = existing.id
      log.push(`ℹ️ User already exists: ${userId}`)
    } else {
      // ── Create auth user ────────────────────────────────────────────────
      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email: FRONTDESK_EMAIL,
        phone: FRONTDESK_PHONE,
        password: FRONTDESK_PASSWORD,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: { role: 'frontdesk', full_name: FRONTDESK_NAME }
      })
      if (authErr || !authData.user) {
        return NextResponse.json({ error: `Auth failed: ${authErr?.message}` }, { status: 500 })
      }
      userId = authData.user.id
      log.push(`✅ Auth user created: ${userId}`)

      // ── users table ─────────────────────────────────────────────────────
      const { error: uErr } = await admin.from('users').insert({
        id: userId, phone: FRONTDESK_PHONE, email: FRONTDESK_EMAIL, role: 'frontdesk'
      })
      log.push(`  users: ${uErr?.message || 'OK'}`)

      // ── front_desk_staff ────────────────────────────────────────────────
      const uid = 'FD' + Math.random().toString(36).slice(2, 10).toUpperCase()
      const { error: sErr } = await admin.from('front_desk_staff').insert({
        id: userId, full_name: FRONTDESK_NAME, phone: FRONTDESK_PHONE,
        email: FRONTDESK_EMAIL, unique_id: uid
      })
      log.push(`  front_desk_staff: ${sErr?.message || 'OK'}`)
    }

    // ── clinic_memberships (source of truth) ────────────────────────────
    // Legacy front_desk_staff.clinic_id and clinic_frontdesk writes were
    // removed — memberships is canonical (mig 045-051).
    const { error: cmErr } = await admin.from('clinic_memberships').upsert(
      { clinic_id: clinic.id, user_id: userId, role: 'FRONT_DESK', status: 'ACTIVE' },
      { onConflict: 'clinic_id,user_id' }
    )
    log.push(`  clinic_memberships: ${cmErr?.message || 'OK'}`)

    // ── Verify ──────────────────────────────────────────────────────────
    const { data: verify } = await admin
      .from('clinic_memberships')
      .select('role, status')
      .eq('clinic_id', clinic.id)
      .eq('user_id', userId)
      .maybeSingle()

    return NextResponse.json({
      success: true,
      log,
      credentials: {
        email:    FRONTDESK_EMAIL,
        phone:    FRONTDESK_PHONE,
        password: FRONTDESK_PASSWORD,
        name:     FRONTDESK_NAME,
        userId,
        clinic:   clinic.name,
        membership: verify
      },
      loginUrl: 'https://medassist-clinic.vercel.app/auth/login',
      note: '⚠️ DELETE THIS ENDPOINT after use!'
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message, log }, { status: 500 })
  }
}
