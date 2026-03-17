export const dynamic = 'force-dynamic'

import { requireApiAuth, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * POST /api/clinic/join
 *
 * Unified join-clinic endpoint that works for ANY role (doctor, frontdesk, assistant).
 * Uses clinic_memberships as the primary membership store.
 *
 * Body: { clinicUniqueId: string }
 */
export async function POST(request: Request) {
  try {
    // Accept any authenticated user (not restricted to frontdesk)
    const user = await requireApiAuth()
    const { clinicUniqueId } = await request.json()

    if (!clinicUniqueId || clinicUniqueId.trim().length < 3) {
      return NextResponse.json(
        { error: 'Valid Clinic ID is required' },
        { status: 400 }
      )
    }

    const admin = createAdminClient('clinic-join')

    // Find clinic by unique_id
    const { data: clinic, error: findError } = await admin
      .from('clinics')
      .select('id, name, unique_id')
      .eq('unique_id', clinicUniqueId.trim().toUpperCase())
      .maybeSingle()

    if (findError || !clinic) {
      return NextResponse.json(
        { error: 'Clinic not found. Please check the Clinic ID and try again.' },
        { status: 404 }
      )
    }

    // Check if already a member via clinic_memberships
    const { data: existingMembership } = await admin
      .from('clinic_memberships')
      .select('id, status, role')
      .eq('clinic_id', clinic.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingMembership) {
      if (existingMembership.status === 'ACTIVE') {
        return NextResponse.json(
          { error: 'You are already a member of this clinic' },
          { status: 409 }
        )
      }
      // Re-activate if previously suspended/invited
      await admin
        .from('clinic_memberships')
        .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
        .eq('id', existingMembership.id)

      return NextResponse.json({
        success: true,
        clinicId: clinic.id,
        clinicName: clinic.name,
        clinicUniqueId: clinic.unique_id,
        role: existingMembership.role,
      })
    }

    // Determine role based on user's registered role
    let membershipRole: string
    if (user.role === 'doctor') {
      membershipRole = 'DOCTOR'
    } else if (user.role === 'frontdesk') {
      membershipRole = 'FRONT_DESK'
    } else {
      return NextResponse.json(
        { error: 'Only doctors and frontdesk staff can join clinics' },
        { status: 403 }
      )
    }

    // Create membership in clinic_memberships
    const { error: membershipError } = await admin
      .from('clinic_memberships')
      .insert({
        clinic_id: clinic.id,
        user_id: user.id,
        role: membershipRole,
        status: 'ACTIVE'
      })

    if (membershipError) {
      throw new Error(membershipError.message)
    }

    // Legacy backward compatibility: also link in old tables
    if (user.role === 'doctor') {
      try {
        await admin
          .from('clinic_doctors')
          .insert({ clinic_id: clinic.id, doctor_id: user.id, role: 'doctor' })
      } catch {
        // Swallow legacy table error
      }
    } else if (user.role === 'frontdesk') {
      // Update front_desk_staff.clinic_id for backward compatibility
      await admin
        .from('front_desk_staff')
        .update({ clinic_id: clinic.id })
        .eq('id', user.id)
    }

    // Determine redirect path
    const redirectPath = user.role === 'doctor' ? '/doctor/dashboard' : '/frontdesk/dashboard'

    return NextResponse.json({
      success: true,
      clinicId: clinic.id,
      clinicName: clinic.name,
      clinicUniqueId: clinic.unique_id,
      role: membershipRole,
      redirectPath,
    })
  } catch (error: any) {
    return toApiErrorResponse(error, 'Failed to join clinic')
  }
}
