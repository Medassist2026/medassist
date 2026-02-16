import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { getPatientMedications } from '@/lib/data/medications'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const medications = await getPatientMedications(user.id)

    return NextResponse.json({ success: true, medications: medications || [] })
  } catch (error: any) {
    console.error('Get medication reminders error:', error)
    return toApiErrorResponse(error, 'Failed to fetch medications')
  }
}
