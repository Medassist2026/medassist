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
    
    if (!fullName || fullName.trim().length < 2) {
      return NextResponse.json(
        { error: 'Full name is required (at least 2 characters)' },
        { status: 400 }
      )
    }

    if (role === 'doctor') {
      if (!specialty) {
        return NextResponse.json(
          { error: 'Specialty is required for doctor registration' },
          { status: 400 }
        )
      }

      const result = await createDoctorAccount({
        phone,
        email,
        password,
        specialty,
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
            // Link front desk to clinic
            await admin
              .from('clinic_frontdesk')
              .insert({
                clinic_id: clinic.id,
                frontdesk_id: result.userId
              })

            // Update front_desk_staff.clinic_id for backwards compatibility
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
