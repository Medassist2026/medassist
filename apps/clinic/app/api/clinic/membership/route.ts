export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse, getClinicRole } from '@shared/lib/auth/session'
import { getActiveClinicIdFromCookies } from '@shared/lib/data/clinic-context'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { logAuditEvent } from '@shared/lib/data/audit'

/**
 * DELETE /api/clinic/membership
 *
 * Revoke (suspend) a member's access to the current clinic.
 * Only the clinic OWNER can call this.
 * Sets clinic_memberships.status = 'SUSPENDED' for the target user.
 *
 * Body: { userId: string }
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const clinicId = await getActiveClinicIdFromCookies()

    if (!clinicId) {
      return NextResponse.json({ error: 'No active clinic' }, { status: 400 })
    }

    const role = await getClinicRole(user.id, clinicId)
    if (role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Only the clinic owner can remove members' },
        { status: 403 }
      )
    }

    const { userId } = await request.json()
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // Prevent owner from removing themselves
    if (userId === user.id) {
      return NextResponse.json(
        { error: 'Cannot remove yourself from your own clinic' },
        { status: 400 }
      )
    }

    const admin = createAdminClient('clinic-membership-revoke')

    // Suspend the membership row
    const { error: suspendError } = await admin
      .from('clinic_memberships')
      .update({ status: 'SUSPENDED' })
      .eq('clinic_id', clinicId)
      .eq('user_id', userId)

    if (suspendError) {
      return NextResponse.json({ error: suspendError.message }, { status: 500 })
    }

    // Also revoke any active assistant assignments for this member
    await admin
      .from('assistant_doctor_assignments')
      .update({ status: 'REVOKED' })
      .eq('clinic_id', clinicId)
      .or(`assistant_user_id.eq.${userId},doctor_user_id.eq.${userId}`)

    logAuditEvent({
      clinicId,
      actorUserId: user.id,
      action: 'EDIT_PATIENT',
      entityType: 'clinic_membership',
      entityId: userId,
      metadata: { action: 'REVOKED', targetUserId: userId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to remove member')
  }
}
