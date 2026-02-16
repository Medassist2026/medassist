import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { getPatientNotes } from '@/lib/data/clinical-notes'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const notes = await getPatientNotes(user.id, 100)

    return NextResponse.json({ success: true, notes: notes || [] })
  } catch (error: any) {
    console.error('Get patient notes error:', error)
    return toApiErrorResponse(error, 'Failed to fetch notes')
  }
}
