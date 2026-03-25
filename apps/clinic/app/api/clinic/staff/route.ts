export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse, getClinicRole } from '@shared/lib/auth/session'
import { getActiveClinicIdFromCookies } from '@shared/lib/data/clinic-context'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { logAuditEvent } from '@shared/lib/data/audit'

/**
 * GET /api/clinic/staff — List clinic members and assignments
 */
export async function GET() {
  try {
    const user = await requireApiRole('doctor')
    const clinicId = await getActiveClinicIdFromCookies()

    if (!clinicId) {
      return NextResponse.json({ error: 'No active clinic' }, { status: 400 })
    }

    const admin = createAdminClient('clinic-staff')

    // Get all clinic members — try clinic_memberships first, fall back to clinic_doctors
    let members: Array<{ user_id: string; role: string; status: string; created_at: string }> = []
    const { data: memberRows, error: membersError } = await admin
      .from('clinic_memberships')
      .select('user_id, role, status, created_at')
      .eq('clinic_id', clinicId)
      .eq('status', 'ACTIVE')

    const isMembershipsTableMissing =
      membersError &&
      (membersError.code === 'PGRST205' || (membersError.message || '').includes('clinic_memberships'))

    if (!isMembershipsTableMissing && memberRows) {
      members = memberRows
    } else if (isMembershipsTableMissing) {
      // Fallback: read doctors from clinic_doctors table
      const { data: cdRows } = await admin
        .from('clinic_doctors')
        .select('doctor_id, created_at')
        .eq('clinic_id', clinicId)
      members = (cdRows || []).map((r: any) => ({
        user_id: r.doctor_id,
        role: 'DOCTOR',
        status: 'ACTIVE',
        created_at: r.created_at,
      }))
    } else if (membersError) {
      throw membersError
    }

    // Get user details
    const userIds = (members || []).map(m => m.user_id)
    let userMap: Record<string, any> = {}

    if (userIds.length > 0) {
      const { data: users } = await admin
        .from('users')
        .select('id, phone, email, role')
        .in('id', userIds)

      if (users) {
        userMap = Object.fromEntries(users.map(u => [u.id, u]))
      }

      // Also get doctor names
      const { data: doctors } = await admin
        .from('doctors')
        .select('id, full_name, specialty')
        .in('id', userIds)

      if (doctors) {
        doctors.forEach(d => {
          if (userMap[d.id]) {
            userMap[d.id].full_name = d.full_name
            userMap[d.id].specialty = d.specialty
          }
        })
      }
    }

    // Get assistant assignments
    const { data: assignments } = await admin
      .from('assistant_doctor_assignments')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('status', 'ACTIVE')

    const enrichedMembers = (members || []).map(m => ({
      user_id: m.user_id,
      role: m.role,
      status: m.status,
      created_at: m.created_at,
      phone: userMap[m.user_id]?.phone || null,
      email: userMap[m.user_id]?.email || null,
      full_name: userMap[m.user_id]?.full_name || null,
      specialty: userMap[m.user_id]?.specialty || null,
      assignments: (assignments || []).filter(
        a => a.assistant_user_id === m.user_id || a.doctor_user_id === m.user_id
      ),
    }))

    return NextResponse.json({ success: true, members: enrichedMembers })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to list staff')
  }
}

/**
 * POST /api/clinic/staff — Create/update assistant assignment
 */
export async function POST(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const clinicId = await getActiveClinicIdFromCookies()

    if (!clinicId) {
      return NextResponse.json({ error: 'No active clinic' }, { status: 400 })
    }

    // Check owner role
    const role = await getClinicRole(user.id, clinicId)
    if (role !== 'OWNER') {
      return NextResponse.json({ error: 'Only clinic owner can manage staff' }, { status: 403 })
    }

    const { assistantUserId, doctorUserId, scope } = await request.json()

    if (!assistantUserId || !doctorUserId || !scope) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const validScopes = ['APPOINTMENTS_ONLY', 'PATIENT_DEMOGRAPHICS', 'FULL_DOCTOR_SUPPORT']
    if (!validScopes.includes(scope)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
    }

    const admin = createAdminClient('clinic-staff')

    const { data, error } = await admin
      .from('assistant_doctor_assignments')
      .upsert({
        clinic_id: clinicId,
        assistant_user_id: assistantUserId,
        doctor_user_id: doctorUserId,
        scope,
        status: 'ACTIVE',
        created_by: user.id,
      }, {
        onConflict: 'clinic_id,assistant_user_id,doctor_user_id'
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    logAuditEvent({
      clinicId,
      actorUserId: user.id,
      action: 'EDIT_PATIENT',
      entityType: 'assistant_assignment',
      entityId: data.id,
      metadata: { assistantUserId, doctorUserId, scope },
    })

    return NextResponse.json({ success: true, assignment: data })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to assign staff')
  }
}

/**
 * DELETE /api/clinic/staff — Remove assignment
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
      return NextResponse.json({ error: 'Only clinic owner can manage staff' }, { status: 403 })
    }

    const { assignmentId } = await request.json()
    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment ID required' }, { status: 400 })
    }

    const admin = createAdminClient('clinic-staff')
    const { error } = await admin
      .from('assistant_doctor_assignments')
      .update({ status: 'REVOKED' })
      .eq('id', assignmentId)
      .eq('clinic_id', clinicId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to remove assignment')
  }
}
