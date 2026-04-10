export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * DELETE /api/patient/medications/[id]
 * Delete a manual (patient-managed) medication from the patient_medications
 * table. RLS enforces that patients can only delete their own rows.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireApiRole('patient')
    const supabase = await createClient()

    const { error } = await supabase
      .from('patient_medications')
      .delete()
      .eq('id', params.id)
      .eq('patient_id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete medication error:', error)
    return toApiErrorResponse(error, 'Failed to delete medication')
  }
}

/**
 * PATCH /api/patient/medications/[id]
 * Toggle is_active, or update free-form fields. Limited to the current
 * patient's own rows by the patient_id filter (RLS also enforces this).
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireApiRole('patient')
    const supabase = await createClient()
    const body = await request.json()

    const updates: Record<string, any> = {}
    if (typeof body.is_active === 'boolean') updates.is_active = body.is_active
    if (typeof body.notes === 'string') updates.notes = body.notes
    if (typeof body.dosage === 'string') updates.dosage = body.dosage
    if (typeof body.frequency === 'string') updates.frequency = body.frequency
    if (typeof body.end_date === 'string') updates.end_date = body.end_date

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('patient_medications')
      .update(updates)
      .eq('id', params.id)
      .eq('patient_id', user.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, medication: data })
  } catch (error: any) {
    console.error('Update medication error:', error)
    return toApiErrorResponse(error, 'Failed to update medication')
  }
}
