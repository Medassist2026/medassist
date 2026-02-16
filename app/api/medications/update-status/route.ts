import { requireApiAuth, toApiErrorResponse } from '@/lib/auth/session'
import { updateMedicationStatus } from '@/lib/data/medications'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const user = await requireApiAuth()
    if (user.role !== 'patient') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }
    
    const { reminderId, status } = await request.json()
    
    // Validation
    if (!reminderId || !status) {
      return NextResponse.json(
        { error: 'Reminder ID and status are required' },
        { status: 400 }
      )
    }
    
    if (!['accepted', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "accepted" or "rejected"' },
        { status: 400 }
      )
    }
    
    // Update medication status
    const updated = await updateMedicationStatus(reminderId, status)
    
    return NextResponse.json({
      success: true,
      medication: updated,
      message: `Medication ${status === 'accepted' ? 'accepted' : 'declined'} successfully`
    })
    
  } catch (error: any) {
    console.error('Update medication status error:', error)
    return toApiErrorResponse(error, 'Failed to update medication status')
  }
}
