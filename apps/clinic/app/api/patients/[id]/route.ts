import { getPatient, logPatientView } from '@shared/lib/data/patients'
import { getUserClinicId } from '@shared/lib/data/frontdesk-scope'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireApiRole('doctor')
    const patientId = params.id
    
    if (!patientId) {
      return NextResponse.json(
        { error: 'Patient ID is required' },
        { status: 400 }
      )
    }
    
    const patient = await getPatient(patientId)
    
    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      )
    }
    
    // Audit log: doctor viewed patient
    const clinicId = await getUserClinicId(user.id)
    logPatientView(user.id, patientId, clinicId || undefined).catch(() => {})

    return NextResponse.json({
      success: true,
      patient
    })
    
  } catch (error: any) {
    console.error('Get patient error:', error)
    return toApiErrorResponse(error, 'Failed to fetch patient')
  }
}
