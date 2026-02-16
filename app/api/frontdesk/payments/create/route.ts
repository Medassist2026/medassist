import { createPayment } from '@/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    await requireApiRole('frontdesk')

    const body = await request.json()
    const { patientId, doctorId, amount, paymentMethod, appointmentId, clinicalNoteId, notes } = body

    if (!patientId || !doctorId || !amount || !paymentMethod) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const payment = await createPayment({
      patientId,
      doctorId,
      amount,
      paymentMethod,
      appointmentId,
      clinicalNoteId,
      notes
    })

    return NextResponse.json({
      success: true,
      payment
    })

  } catch (error: any) {
    console.error('Payment creation error:', error)
    return toApiErrorResponse(error, 'Failed to record payment')
  }
}
