export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const { noteId } = await request.json()

    if (!noteId) {
      return NextResponse.json(
        { error: 'noteId is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: updated, error } = await supabase
      .from('clinical_notes')
      .update({ prescription_printed_at: new Date().toISOString() })
      .eq('id', noteId)
      .eq('doctor_id', user.id)
      .select('id')
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!updated) {
      return NextResponse.json(
        { error: 'Prescription not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Mark prescription printed error:', error)
    return toApiErrorResponse(error, 'Failed to mark prescription as printed')
  }
}
