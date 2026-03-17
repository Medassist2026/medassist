import { getAvailableSlots } from '@shared/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { ensureDoctorInFrontdeskClinic } from '@shared/lib/data/frontdesk-scope'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const doctorId = searchParams.get('doctorId')
    const date = searchParams.get('date')

    if (!doctorId || !date) {
      return NextResponse.json(
        { error: 'Missing doctorId or date' },
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

    const slots = await getAvailableSlots(doctorId, date)

    return NextResponse.json({
      success: true,
      slots
    })

  } catch (error: any) {
    console.error('Slots error:', error)
    return toApiErrorResponse(error, 'Failed to load slots')
  }
}
