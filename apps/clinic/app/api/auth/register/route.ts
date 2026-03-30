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

      return NextResponse.json({
        success: true,
        userId: result.userId,
        uniqueId: result.patientUniqueId,
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
            // Primary: create clinic_memberships record
            await admin
              .from('clinic_memberships')
              .insert({
                clinic_id: clinic.id,
                user_id: result.userId,
                role: 'ASSISTANT',
                status: 'ACTIVE'
              })

            // Legacy: link front desk to clinic
            await admin
              .from('clinic_frontdesk')
              .insert({
                clinic_id: clinic.id,
                frontdesk_id: result.userId
              })

            // Legacy: update front_desk_staff.clinic_id for backwards compatibility
            await admin
              .from('front_desk_staff')
              .update({ clinic_id: clinic.id })
              .eq('id', result.userId)
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
      { error: error.message || 'فشل في إنشاء الحساب' },
      { status: 500 }
    )
  }
}
