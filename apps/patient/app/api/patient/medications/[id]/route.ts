export const dynamic = 'force-dynamic'

/**
 * /api/patient/medications/[id] — B07 Phase F.5 cross-context extension.
 *
 * DELETE: delete medication. Delegates need `manage_medications`.
 * PATCH: update medication. Delegates need `manage_medications`.
 */

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { resolvePatientContext } from '@shared/lib/auth/patient-context'
import { requireCapability } from '@shared/lib/auth/authority'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiRole('patient')
    const { id } = await params
    const ctx = await resolvePatientContext({
      request,
      userId: user.id,
      authorize: (gpId, uid) =>
        requireCapability(gpId, 'manage_medications', uid),
    })

    if (ctx.resolvedPatientId === null) {
      return NextResponse.json(
        { error: 'Cannot modify medications for this account context' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient('patient-medications-delete')

    const { error } = await supabase
      .from('patient_medications')
      .delete()
      .eq('id', id)
      .eq('patient_id', ctx.resolvedPatientId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete medication error:', error)
    return toApiErrorResponse(error, 'Failed to delete medication')
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiRole('patient')
    const { id } = await params
    const ctx = await resolvePatientContext({
      request,
      userId: user.id,
      authorize: (gpId, uid) =>
        requireCapability(gpId, 'manage_medications', uid),
    })

    if (ctx.resolvedPatientId === null) {
      return NextResponse.json(
        { error: 'Cannot modify medications for this account context' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient('patient-medications-update')
    const body = await request.json()

    const updates: Record<string, any> = {}
    if (typeof body.is_active === 'boolean')
      updates.is_active = body.is_active
    if (typeof body.notes === 'string') updates.notes = body.notes
    if (typeof body.dosage === 'string') updates.dosage = body.dosage
    if (typeof body.frequency === 'string') updates.frequency = body.frequency
    if (typeof body.end_date === 'string') updates.end_date = body.end_date

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('patient_medications')
      .update(updates)
      .eq('id', id)
      .eq('patient_id', ctx.resolvedPatientId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, medication: data })
  } catch (error: any) {
    console.error('Update medication error:', error)
    return toApiErrorResponse(error, 'Failed to update medication')
  }
}
