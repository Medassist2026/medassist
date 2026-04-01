export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { NextResponse } from 'next/server'

/** Unblock a patient — restores conversation status to 'active' */
export async function POST(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const supabase = await createClient()

    const { conversationId, patientId } = await request.json()

    if (!conversationId && !patientId) {
      return NextResponse.json({ error: 'conversationId or patientId required' }, { status: 400 })
    }

    let query = supabase
      .from('conversations')
      .update({ status: 'active' })
      .eq('doctor_id', user.id)

    if (conversationId) {
      query = query.eq('id', conversationId)
    } else {
      query = query.eq('patient_id', patientId)
    }

    const { error } = await query

    if (error) throw error

    return NextResponse.json({ success: true, status: 'active' })
  } catch (error: any) {
    console.error('Unblock conversation error:', error)
    return toApiErrorResponse(error, 'Failed to unblock conversation')
  }
}
