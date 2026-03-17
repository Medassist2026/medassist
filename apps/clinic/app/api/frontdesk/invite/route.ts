import { NextRequest, NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'

// ============================================================================
// GET /api/frontdesk/invite — Get pending invites for current frontdesk user
// ============================================================================

export async function GET() {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = createAdminClient('frontdesk-invite')

    const { data, error } = await supabase
      .from('clinic_memberships')
      .select('id, clinic_id, role, status, created_at, clinics(id, name, unique_id)')
      .eq('user_id', user.id)
      .eq('status', 'INVITED')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 })
    }

    const invites = (data || []).map((m: any) => ({
      membershipId: m.id,
      clinicId: m.clinic_id,
      role: m.role,
      createdAt: m.created_at,
      clinic: m.clinics ? {
        id: m.clinics.id,
        name: m.clinics.name,
        uniqueId: m.clinics.unique_id,
      } : null,
    }))

    return NextResponse.json({ invites })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to fetch invites')
  }
}

// ============================================================================
// POST /api/frontdesk/invite — Accept or reject a clinic invite
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiRole('frontdesk')
    const body = await request.json()
    const { membershipId, action } = body

    if (!membershipId || !action) {
      return NextResponse.json(
        { error: 'membershipId and action are required' },
        { status: 400 }
      )
    }

    if (!['accept', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "accept" or "reject"' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient('frontdesk-invite-action')

    // Verify the membership belongs to this user and is INVITED
    const { data: membership, error: fetchError } = await supabase
      .from('clinic_memberships')
      .select('id, clinic_id, user_id, status, role, clinics(id, name)')
      .eq('id', membershipId)
      .eq('user_id', user.id)
      .eq('status', 'INVITED')
      .single()

    if (fetchError || !membership) {
      return NextResponse.json(
        { error: 'Invite not found or already processed' },
        { status: 404 }
      )
    }

    if (action === 'accept') {
      // Accept: update status to ACTIVE
      const { error: updateError } = await supabase
        .from('clinic_memberships')
        .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
        .eq('id', membershipId)

      if (updateError) {
        return NextResponse.json({ error: 'Failed to accept invite' }, { status: 500 })
      }

      // Legacy backward compatibility: update front_desk_staff.clinic_id
      await supabase
        .from('front_desk_staff')
        .update({ clinic_id: membership.clinic_id })
        .eq('id', user.id)

      const clinicName = (membership as any).clinics?.name || 'العيادة'

      return NextResponse.json({
        success: true,
        message: `تم الانضمام لعيادة ${clinicName}`,
        clinicId: membership.clinic_id,
      })
    } else {
      // Reject: delete the membership record
      const { error: deleteError } = await supabase
        .from('clinic_memberships')
        .delete()
        .eq('id', membershipId)

      if (deleteError) {
        return NextResponse.json({ error: 'Failed to reject invite' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'تم رفض الدعوة',
      })
    }
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to process invite')
  }
}
