export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getClinicContext } from '@shared/lib/data/clinic-context'
import { createAdminClient } from '@shared/lib/supabase/admin'

// ============================================================================
// POST /api/clinic/invite — Invite staff or doctor by phone number
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiRole('doctor')
    const body = await request.json()

    const { phone, role } = body

    // Validate input
    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    const validRoles = ['DOCTOR', 'FRONT_DESK', 'ASSISTANT']
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role. Must be DOCTOR, FRONT_DESK, or ASSISTANT' }, { status: 400 })
    }

    // Get clinic context — doctor must have a clinic
    const clinicContext = await getClinicContext(user.id, 'doctor')
    if (!clinicContext) {
      return NextResponse.json({ error: 'You must create a clinic first' }, { status: 400 })
    }

    const supabase = createAdminClient('clinic-invite')

    // Normalize phone: strip spaces, ensure starts with country code or just digits
    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '')

    // Look up user by phone in auth.users
    const { data: usersData, error: lookupError } = await supabase
      .from('users')
      .select('id, phone, email')
      .eq('phone', normalizedPhone)
      .maybeSingle()

    if (lookupError) {
      console.error('User lookup error:', lookupError)
      return NextResponse.json({ error: 'Failed to look up user' }, { status: 500 })
    }

    if (!usersData) {
      return NextResponse.json(
        { error: 'No account found with this phone number. The person must register first.' },
        { status: 404 }
      )
    }

    // Check if already a member of this clinic
    const { data: existingMembership } = await supabase
      .from('clinic_memberships')
      .select('id, status, role')
      .eq('clinic_id', clinicContext.clinicId)
      .eq('user_id', usersData.id)
      .maybeSingle()

    if (existingMembership) {
      if (existingMembership.status === 'ACTIVE') {
        return NextResponse.json(
          { error: `This person is already an active ${existingMembership.role} in your clinic` },
          { status: 409 }
        )
      }
      if (existingMembership.status === 'INVITED') {
        return NextResponse.json(
          { error: 'An invitation is already pending for this person' },
          { status: 409 }
        )
      }
      // If SUSPENDED, allow re-invite by updating
      const { error: updateError } = await supabase
        .from('clinic_memberships')
        .update({ status: 'INVITED', role, updated_at: new Date().toISOString() })
        .eq('id', existingMembership.id)

      if (updateError) {
        return NextResponse.json({ error: 'Failed to re-invite member' }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: 'Re-invitation sent' })
    }

    // Create new membership with INVITED status
    const { error: insertError } = await supabase
      .from('clinic_memberships')
      .insert({
        clinic_id: clinicContext.clinicId,
        user_id: usersData.id,
        role: role,
        status: 'INVITED',
        created_by: user.id,
      })

    if (insertError) {
      console.error('Invite insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: `Invitation sent to ${normalizedPhone}` })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to send invitation')
  }
}
