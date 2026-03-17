import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getLabResults, getPatientLabHistory, LAB_TEST_CATALOG } from '@shared/lib/data/lab-results'
import { createClient } from '@shared/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole('patient')

    // Get lab results from new lab-results tables
    try {
      const results = await getLabResults(user.id)
      return NextResponse.json({
        success: true,
        results: results || [],
      })
    } catch (labError) {
      // Fallback to old lab_orders table if new tables don't exist
      console.log('Falling back to old lab orders table:', labError)

      const supabase = await createClient()

      // Get patient ID
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .select('id')
        .eq('id', user.id)
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
