export const dynamic = 'force-dynamic'

/**
 * /api/patient/records — B07 Phase F.5 cross-context extension.
 *
 * GET: read records for the active gp context (?gpId=<id> or self).
 * POST: create a record for the active gp context (self/guardian only;
 *       delegates rejected — no MVP capability covers "create clinical
 *       record on principal's behalf"; see decision log Decision 4).
 *
 * Schema note: `patient_medical_records.patient_id` FKs to legacy
 * `public.patients(id)`. The legacy 1:1 `patients.id = auth.users.id`
 * convention lets us filter by the resolved `claimed_user_id` of the
 * subject gp. Minor gps have NULL claim → empty data (Decision 2).
 */

import {
  requireApiRole,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'
import {
  emptyForCrossContext,
  resolvePatientContext,
} from '@shared/lib/auth/patient-context'

export async function GET(request: Request) {
  try {
    const user = await requireApiRole('patient')
    const ctx = await resolvePatientContext({
      request,
      userId: user.id,
    })

    if (ctx.resolvedPatientId === null) {
      return NextResponse.json(emptyForCrossContext({ records: [] }))
    }

    const supabase = createAdminClient('patient-records')

    const { data: records, error } = await supabase
      .from('patient_medical_records')
      .select('*')
      .eq('patient_id', ctx.resolvedPatientId)
      .order('date', { ascending: false })

    if (error) throw error

    return NextResponse.json({ success: true, records: records || [] })
  } catch (error: any) {
    console.error('Get records error:', error)
    return toApiErrorResponse(error, 'Failed to fetch records')
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('patient')
    // Records POST has no MVP capability for delegates (Decision 4).
    // Self and guardian-of-minor pass through; delegates rejected (403).
    const ctx = await resolvePatientContext({
      request,
      userId: user.id,
      denyDelegates: true,
    })

    if (ctx.resolvedPatientId === null) {
      return NextResponse.json(
        { error: 'Cannot add records for this account context' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient('patient-records-create')
    const body = await request.json()

    // Validate required fields
    const validTypes = [
      'lab_result',
      'diagnosis',
      'procedure',
      'imaging',
      'other',
    ]
    if (!validTypes.includes(body.record_type)) {
      return NextResponse.json(
        { error: 'Invalid record type' },
        { status: 400 }
      )
    }

    if (!body.title || body.title.length < 2) {
      return NextResponse.json(
        { error: 'Title must be at least 2 characters' },
        { status: 400 }
      )
    }

    if (!body.date) {
      return NextResponse.json(
        { error: 'Date is required' },
        { status: 400 }
      )
    }

    const { data: record, error } = await supabase
      .from('patient_medical_records')
      .insert({
        patient_id: ctx.resolvedPatientId,
        record_type: body.record_type,
        title: body.title,
        description: body.description || null,
        date: body.date,
        provider_name: body.provider_name || null,
        facility_name: body.facility_name || null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, record })
  } catch (error: any) {
    console.error('Create record error:', error)
    return toApiErrorResponse(error, 'Failed to create record')
  }
}
