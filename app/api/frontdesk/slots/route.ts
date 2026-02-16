import { getAvailableSlots } from '@/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    await requireApiRole('frontdesk')

    const { searchParams } = new URL(request.url)
    const doctorId = searchParams.get('doctorId')
    const date = searchParams.get('date')

    if (!doctorId || !date) {
      return NextResponse.json(
        { error: 'Missing doctorId or date' },
        { status: 400 }
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
