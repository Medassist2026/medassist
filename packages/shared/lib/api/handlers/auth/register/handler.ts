export const dynamic = 'force-dynamic'

import { createDoctorAccount, createPatientAccount, createFrontDeskAccount } from '@shared/lib/data/users'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { phone, email, password, role, specialty, fullName, clinicUniqueId } = await request.json()

    if (!phone || !password || !role) {
      return NextResponse.json(
        { error: 'Phone, password, and role are required' },
        { status: 400 }
      )
    }
    
    if (!fullName || fullName.trim().split(/\s+/).length < 2) {
      return NextResponse.json(
        { error: 'يرجى إدخال الاسم الأول واسم العائلة' },
        { status: 400 }
      )
    }

    // ── Server-side phone format validation ──
    // In dev bypass mode, accept any E.164-ish number to allow testing with fake numbers
    const DEV_BYPASS_OTP = process.env.DEV_BYPASS_OTP === 'true'
    const EG_PHONE_RE = /^\+2001[0125][0-9]{8}$/
    const E164_RE = /^\+[1-9]\d{6,14}$/
    const phoneValid = DEV_BYPASS_OTP ? E164_RE.test(phone) : EG_PHONE_RE.test(phone)
    if (!phoneValid) {
      return NextResponse.json(
        {
          error: DEV_BYPASS_OTP
            ? 'رقم الهاتف غير صحيح. يجب أن يبدأ بـ + ويحتوي على 7-15 رقم'
            : 'رقم الموبايل غير صحيح. يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015'
        },
        { status: 400 }
      )
    }

    // ── Server-side password validation (Phase 1 security) ──
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' },
        { status: 400 }
      )
    }
    if (!/\d/.test(password)) {
      return NextResponse.json(
        { error: 'كلمة المرور يجب أن تحتوي على رقم واحد على الأقل' },
        { status: 400 }
      )
    }

    if (role === 'doctor') {
      // Specialty is optional at registration — doctor sets it during clinic setup
      const result = await createDoctorAccount({
        phone,
        email,
        password,
        specialty: specialty || 'general-practitioner',
        fullName
      })

      return NextResponse.json({
        success: true,
        userId: result.userId,
        uniqueId: result.doctorUniqueId,
        role: 'doctor'
      })

    } else if (role === 'patient') {
      const result = await createPatientAccount({
        phone,
        email,
        password,
        fullName
      })

      // K-2c (2026-05-15, D-084): createPatientAccount return shape
      // changed from {userId, patientUniqueId} to {userId, globalPatientId}.
      // The patient now has a canonical global_patients identity but
      // NO `patients` row — clinic-presence is created by frontdesk on
      // first clinic visit. `uniqueId` is mapped from `globalPatientId`
      // for API contract compatibility (the legacy `patientUniqueId`
      // was a nanoid attached to the now-absent patients row); doctor
      // and frontdesk paths retain their own role-specific uniqueIds.
      return NextResponse.json({
        success: true,
        userId: result.userId,
        uniqueId: result.globalPatientId,
        globalPatientId: result.globalPatientId,
        role: 'patient'
      })

    } else if (role === 'frontdesk') {
      const result = await createFrontDeskAccount({
        phone,
        email,
        password,
        fullName
      })

      // If clinicUniqueId is provided, link front desk to clinic
      if (clinicUniqueId) {
        try {
          const admin = createAdminClient('clinic-registration')

          // Find clinic by unique_id
          const { data: clinic, error: findError } = await admin
            .from('clinics')
            .select('id, name, unique_id')
            .eq('unique_id', clinicUniqueId.trim().toUpperCase())
            .maybeSingle()

          if (!findError && clinic) {
            // clinic_memberships is the source of truth for clinic linkage.
            // Legacy clinic_frontdesk + front_desk_staff.clinic_id mirrors
            // were removed once the multi-tenant rollout (mig 045-051) made
            // memberships authoritative — see docs/investigations for context.
            await admin
              .from('clinic_memberships')
              .insert({
                clinic_id: clinic.id,
                user_id: result.userId,
                role: 'FRONT_DESK',
                status: 'ACTIVE'
              })
          }
        } catch (clinicError) {
          console.error('Error linking front desk to clinic:', clinicError)
          // Don't fail the registration if clinic linking fails
        }
      }

      return NextResponse.json({
        success: true,
        userId: result.userId,
        uniqueId: result.frontDeskUniqueId,
        role: 'frontdesk'
      })

    } else {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      )
    }

  } catch (error: any) {
    // K-2b (Finding I-15, 2026-05-15): sanitize the 500 fallback so we
    // never echo raw PostgreSQL error text to the client. The raw error
    // can include table names, column names, and the "relation" keyword
    // — all of which leak schema details to anyone probing the
    // registration endpoint. The Arabic fallback is the ONLY thing
    // returned; `console.error` below captures the raw error in Vercel
    // logs for server-side debugging.
    //
    // The duplicate-phone 409 branch inspects `error.message` server-side
    // for known PG substrings ('unique', 'duplicate', 'users_phone_key')
    // and returns a clean Arabic message — that branch already sanitizes
    // its response and is preserved as-is.
    console.error('Registration error:', error)

    // Catch duplicate phone constraint
    const msg = error?.message || ''
    if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('users_phone_key')) {
      return NextResponse.json(
        { error: 'رقم الهاتف مسجل بالفعل. يرجى تسجيل الدخول بدلاً من إنشاء حساب جديد.' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'فشل في إنشاء الحساب. حاول مرة أخرى أو تواصل مع الدعم.' },
      { status: 500 }
    )
  }
}
