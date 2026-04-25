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
 *  - Sets clinic_memberships.status = 'SUSPENDED' (source of truth)
 *  - Revokes any assistant_doctor_assignments for this user/clinic
 *  - If the clinic being left is the active one, the cookie is cleared
 *
 * Note: legacy clinic_doctors / front_desk_staff.clinic_id are no longer
 * mirrored here. The fallback reads in clinic-context.ts and frontdesk-scope.ts
 * only trigger if memberships returns nothing — which can't happen now that
 * memberships is the canonical store. See migrations 045-051 for the
 * multi-tenant clinic_id rollout that made memberships authoritative.
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

    // Suspend membership — this is the source of truth.
    // Legacy clinic_doctors / front_desk_staff.clinic_id are no longer
    // mirrored on leave; see route header note.
    await admin
      .from('clinic_memberships')
      .update({ status: 'SUSPENDED' })
      .eq('clinic_id', clinicId)
      .eq('user_id', user.id)

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
