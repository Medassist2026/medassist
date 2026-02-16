import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const supabase = await createClient()

    // Get patient ID
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id')
      .eq('id', user.id)
      .single()

    if (patientError) throw patientError

    if (!patient) {
      return NextResponse.json({ success: true, orders: [] })
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
      orders: orders || []
    })

  } catch (error: any) {
    console.error('Patient lab results error:', error)
    return toApiErrorResponse(error, 'Failed to load lab results')
  }
}
