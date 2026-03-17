export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getActiveClinicIdFromCookies } from '@shared/lib/data/clinic-context'
import { sharePatientWithDoctor, type ConsentType } from '@shared/lib/data/visibility'
import { logAuditEvent } from '@shared/lib/data/audit'

/**
 * POST /api/clinic/share-patient — Share a patient with another doctor
 */
export async function POST(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const { patientId, targetDoctorUserId, consentType } = await request.json()

    if (!patientId || !targetDoctorUserId) {
      return NextResponse.json(
        { error: 'Patient ID and target doctor ID are required' },
        { status: 400 }
      )
    }

    const clinicId = await getActiveClinicIdFromCookies()
    if (!clinicId) {
      return NextResponse.json({ error: 'No active clinic' }, { status: 400 })
    }

    const { data, error } = await sharePatientWithDoctor({
      clinicId,
      patientId,
      doctorUserId: targetDoctorUserId,
      grantedByUserId: user.id,
      consent: (consentType as ConsentType) || 'DOCTOR_TO_DOCTOR_TRANSFER',
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    logAuditEvent({
      clinicId,
      actorUserId: user.id,
      action: 'SHARE_PATIENT',
      entityType: 'patient',
      entityId: patientId,
      metadata: { targetDoctorUserId, consentType },
    })

    return NextResponse.json({ success: true, visibility: data })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to share patient')
  }
}
