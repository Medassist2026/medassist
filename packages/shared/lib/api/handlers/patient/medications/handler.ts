export const dynamic = 'force-dynamic'

/**
 * /api/patient/medications — B07 Phase F.5 cross-context extension.
 *
 * GET: read patient medications for active gp. Minor → empty.
 * POST: add medication. Delegates need `manage_medications` capability
 *       (Decision 4).
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
import { requireCapability } from '@shared/lib/auth/authority'

export async function GET(request: Request) {
  try {
    const user = await requireApiRole('patient')
    const ctx = await resolvePatientContext({
      request,
      userId: user.id,
    })

    if (ctx.resolvedPatientId === null) {
      return NextResponse.json(emptyForCrossContext({ medications: [] }))
    }

    const supabase = createAdminClient('patient-medications')

    const { data: medications, error } = await supabase
      .from('patient_medications')
      .select('*')
      .eq('patient_id', ctx.resolvedPatientId)
      .order('start_date', { ascending: false })

    if (error) throw error

    return NextResponse.json({
      success: true,
      medications: medications || [],
    })
  } catch (error: any) {
    console.error('Get medications error:', error)
    return toApiErrorResponse(error, 'Failed to fetch medications')
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('patient')
    const ctx = await resolvePatientContext({
      request,
      userId: user.id,
      authorize: (gpId, uid) =>
        requireCapability(gpId, 'manage_medications', uid),
    })

    if (ctx.resolvedPatientId === null) {
      return NextResponse.json(
        { error: 'Cannot add medications for this account context' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient('patient-medications-create')
    const body = await request.json()

    // Validate required fields
    if (!body.medication_name || body.medication_name.length < 2) {
      return NextResponse.json(
        { error: 'Medication name must be at least 2 characters' },
        { status: 400 }
      )
    }

    if (!body.dosage || body.dosage.length < 1) {
      return NextResponse.json(
        { error: 'Dosage is required' },
        { status: 400 }
      )
    }

    if (!body.frequency || body.frequency.length < 2) {
      return NextResponse.json(
        { error: 'Frequency is required' },
        { status: 400 }
      )
    }

    if (!body.start_date) {
      return NextResponse.json(
        { error: 'Start date is required' },
        { status: 400 }
      )
    }

    // Calculate is_active based on end_date
    const is_active =
      !body.end_date || new Date(body.end_date) >= new Date()

    const { data: medication, error } = await supabase
      .from('patient_medications')
      .insert({
        patient_id: ctx.resolvedPatientId,
        medication_name: body.medication_name,
        dosage: body.dosage,
        frequency: body.frequency,
        route: body.route || 'oral',
        start_date: body.start_date,
        end_date: body.end_date || null,
        is_active,
        prescriber_name: body.prescriber_name || null,
        purpose: body.purpose || null,
        notes: body.notes || null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, medication })
  } catch (error: any) {
    console.error('Create medication error:', error)
    return toApiErrorResponse(error, 'Failed to create medication')
  }
}
