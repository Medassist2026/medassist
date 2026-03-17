import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('frontdesk')
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

    // Check if already linked
    const { data: existing } = await admin
      .from('clinic_frontdesk')
      .select('id')
      .eq('clinic_id', clinic.id)
      .eq('frontdesk_id', user.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'You are already a member of this clinic' },
        { status: 409 }
      )
    }

    // Link front desk to clinic
    const { error: linkError } = await admin
      .from('clinic_frontdesk')
      .insert({
        clinic_id: clinic.id,
        frontdesk_id: user.id
      })

    if (linkError) {
      throw new Error(linkError.message)
    }

    // Also update front_desk_staff.clinic_id for backwards compatibility
    await admin
      .from('front_desk_staff')
      .update({ clinic_id: clinic.id })
      .eq('id', user.id)

    return NextResponse.json({
      success: true,
      clinicId: clinic.id,
      clinicName: clinic.name,
      clinicUniqueId: clinic.unique_id
    })
  } catch (error: any) {
    return toApiErrorResponse(error, 'Failed to join clinic')
  }
}
