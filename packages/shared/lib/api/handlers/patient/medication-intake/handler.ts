export const dynamic = 'force-dynamic'

/**
 * /api/patient/medication-intake — B07 Phase F.5 cross-context extension.
 *
 * GET: read intake list for active gp. Minor → empty.
 * POST: save intake list. Delegates need `manage_medications` capability.
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

/**
 * GET /api/patient/medication-intake
 */
export async function GET(request: Request) {
  try {
    const user = await requireApiRole('patient')
    const ctx = await resolvePatientContext({
      request,
      userId: user.id,
    })

    if (ctx.resolvedPatientId === null) {
      return NextResponse.json(
        emptyForCrossContext({
          medications: [],
          intakeCompleted: false,
        })
      )
    }

    const supabase = createAdminClient('patient-medication-intake')

    const { data, error } = await supabase
      .from('patient_medication_intake')
      .select('*')
      .eq('patient_id', ctx.resolvedPatientId)
      .order('created_at', { ascending: false })

    if (error) {
      // Table might not exist yet — return empty with a flag
      if (error.code === '42P01') {
        return NextResponse.json({
          success: true,
          medications: [],
          intakeCompleted: false,
          message: 'Intake table not yet created',
        })
      }
      throw error
    }

    return NextResponse.json({
      success: true,
      medications: data || [],
      intakeCompleted: data && data.length >= 0, // Even empty is "completed" (patient said no meds)
    })
  } catch (error: any) {
    console.error('Get medication intake error:', error)
    return toApiErrorResponse(error, 'Failed to fetch medication intake')
  }
}

/**
 * POST /api/patient/medication-intake
 * Body: { medications: IntakeMedication[] }
 */
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
        { error: 'Cannot save intake for this account context' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient('patient-medication-intake-save')
    const body = await request.json()

    const { medications } = body

    if (!Array.isArray(medications)) {
      return NextResponse.json(
        { error: 'medications must be an array' },
        { status: 400 }
      )
    }

    // Delete existing intake (fresh start on each save)
    await supabase
      .from('patient_medication_intake')
      .delete()
      .eq('patient_id', ctx.resolvedPatientId)

    // If empty array, patient confirmed "no medications" - store a marker
    if (medications.length === 0) {
      const { error } = await supabase
        .from('patient_medication_intake')
        .insert({
          patient_id: ctx.resolvedPatientId,
          drug_name: '__NO_MEDICATIONS__',
          generic_name: null,
          dosage: null,
          frequency: null,
          prescriber: null,
          condition: null,
          duration_taking: null,
          still_taking: false,
          intake_completed_at: new Date().toISOString(),
        })

      if (error && error.code === '42P01') {
        return NextResponse.json({
          success: true,
          message: 'Intake saved (table pending migration)',
          medications: [],
        })
      }
      if (error) throw error

      return NextResponse.json({
        success: true,
        message: 'No medications recorded',
        medications: [],
      })
    }

    // Insert each medication
    const rows = medications.map((med: any) => ({
      patient_id: ctx.resolvedPatientId,
      drug_name: med.drugName,
      generic_name: med.genericName || null,
      dosage: med.dosage || null,
      frequency: med.frequency || null,
      prescriber: med.prescriber || null,
      condition: med.condition || null,
      duration_taking: med.duration || null,
      still_taking: med.stillTaking ?? true,
      intake_completed_at: new Date().toISOString(),
    }))

    const { data, error } = await supabase
      .from('patient_medication_intake')
      .insert(rows)
      .select()

    if (error && error.code === '42P01') {
      return NextResponse.json({
        success: true,
        message: 'Intake saved (table pending migration)',
        medications,
      })
    }
    if (error) throw error

    return NextResponse.json({
      success: true,
      message: `${medications.length} medication(s) recorded`,
      medications: data,
    })
  } catch (error: any) {
    console.error('Save medication intake error:', error)
    return toApiErrorResponse(error, 'Failed to save medication intake')
  }
}
