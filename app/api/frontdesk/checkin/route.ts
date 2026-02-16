import { checkInPatient } from '@/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    await requireApiRole('frontdesk')

    const body = await request.json()
    const { patientId, doctorId, appointmentId, queueType } = body

    if (!patientId || !doctorId || !queueType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const queueItem = await checkInPatient({
      patientId,
      doctorId,
      appointmentId,
      queueType
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
