export const dynamic = 'force-dynamic'

/**
 * GET /api/patient/lab-results — B07 Phase F.5 cross-context extension.
 *
 * Accepts optional `?gpId=<id>` for cross-context viewing. Minor → empty.
 */

import {
  requireApiRole,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import { getLabResults } from '@shared/lib/data/lab-results'
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
      return NextResponse.json(emptyForCrossContext({ results: [] }))
    }

    // Get lab results from new lab-results tables
    try {
      const results = await getLabResults(ctx.resolvedPatientId)
      return NextResponse.json({
        success: true,
        results: results || [],
      })
    } catch (labError) {
      // Fallback to old lab_orders table if new tables don't exist
      console.log('Falling back to old lab orders table:', labError)

      const supabase = createAdminClient('patient-lab-results-fallback')

      // Get patient ID
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .select('id')
        .eq('id', ctx.resolvedPatientId)
        .single()

      if (patientError) throw patientError

      if (!patient) {
        return NextResponse.json({ success: true, results: [] })
      }

      // Get lab orders with results
      const { data: orders, error } = await supabase
        .from('lab_orders')
        .select(`
          *,
          doctor:doctors (id, full_name, specialty),
          results:lab_results (
            *,
            test:lab_tests (*)
          )
        `)
        .eq('patient_id', patient.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })

      if (error) throw new Error(error.message)

      return NextResponse.json({
        success: true,
        results: orders || [],
      })
    }
  } catch (error: any) {
    console.error('Patient lab results error:', error)
    return toApiErrorResponse(error, 'Failed to load lab results')
  }
}
