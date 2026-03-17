import { checkInPatient } from '@shared/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { ensureDoctorInFrontdeskClinic, getUserClinicId } from '@shared/lib/data/frontdesk-scope'
import { logAuditEvent } from '@shared/lib/data/audit'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()

    const body = await request.json()
    const { patientId, doctorId, appointmentId, queueType } = body

    if (!patientId || !doctorId || !queueType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const doctorInScope = await ensureDoctorInFrontdeskClinic(supabase as any, user.id, doctorId)
    if (!doctorInScope) {
      return NextResponse.json(
        { error: 'Doctor is outside your clinic scope' },
        { status: 403 }
      )
    }

    const queueItem = await checkInPatient({
      patientId,
      doctorId,
      appointmentId,
      queueType
    })

    // Audit log
    const clinicId = await getUserClinicId(user.id)
    logAuditEvent({
      clinicId: clinicId || undefined,
      actorUserId: user.id,
      action: 'CREATE_PATIENT',
      entityType: 'check_in',
      entityId: patientId,
      metadata: { doctorId, queueType }
    })

    return NextResponse.json({
      success: true,
      queueItem
    })

  } catch (error: any) {
    console.error('Check-in error:', error)
    return toApiErrorResponse(error, 'Check-in failed')
  }
}
