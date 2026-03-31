export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiAuth, toApiErrorResponse, getClinicRole } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { cookies } from 'next/headers'

/**
 * DELETE /api/clinic/leave
 *
 * Allows a DOCTOR or FRONTDESK user to leave a clinic they are a member of.
 * Body: { clinicId: string }
 *
 * Rules:
 *  - Cannot leave if you are the OWNER (owner must transfer or delete the clinic)
 *  - Sets clinic_memberships.status = 'SUSPENDED'
 *  - Removes legacy clinic_doctors / front_desk_staff link
 *  - If the clinic being left is the active one, the cookie is cleared
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireApiAuth()
    const { clinicId } = await request.json()

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId is required' }, { status: 400 })
    }

    const admin = createAdminClient('clinic-leave')

    // Check user's role in this clinic
    const role = await getClinicRole(user.id, clinicId)

    if (!role) {
      return NextResponse.json(
        { error: 'أنت لست عضواً في هذه العيادة' },
        { status: 404 }
      )
    }

    if (role === 'OWNER') {
      return NextResponse.json(
        { error: 'لا يمكن للمالك مغادرة العيادة. يمكنك حذف العيادة أو نقل الملكية.' },
        { status: 403 }
      )
    }

    // Suspend membership
    await admin
      .from('clinic_memberships')
      .update({ status: 'SUSPENDED' })
      .eq('clinic_id', clinicId)
      .eq('user_id', user.id)

    // Remove from legacy tables
    if (user.role === 'doctor') {
      await admin
        .from('clinic_doctors')
        .delete()
        .eq('clinic_id', clinicId)
        .eq('doctor_id', user.id)
    } else if (user.role === 'frontdesk') {
      // front_desk_staff stores clinic_id inline — set it null
      await admin
        .from('front_desk_staff')
        .update({ clinic_id: null })
        .eq('id', user.id)
        .eq('clinic_id', clinicId)
    }

    // Revoke any assistant assignments tied to this clinic for this user
    await admin
      .from('assistant_doctor_assignments')
      .update({ status: 'REVOKED' })
      .eq('clinic_id', clinicId)
      .or(`assistant_user_id.eq.${user.id},doctor_user_id.eq.${user.id}`)

    // Clear the active_clinic_id cookie if it pointed at the clinic we just left
    const cookieStore = await cookies()
    const activeClinicId = cookieStore.get('active_clinic_id')?.value
    if (activeClinicId === clinicId) {
      cookieStore.delete('active_clinic_id')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to leave clinic')
  }
}
