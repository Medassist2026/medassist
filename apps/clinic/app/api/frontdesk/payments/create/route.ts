import { createPayment } from '@shared/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { ensureDoctorInFrontdeskClinic } from '@shared/lib/data/frontdesk-scope'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()

    const body = await request.json()
    const { patientId, doctorId, amount, paymentMethod, appointmentId, clinicalNoteId, notes } = body

    if (!patientId || !doctorId || !amount || !paymentMethod) {
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
