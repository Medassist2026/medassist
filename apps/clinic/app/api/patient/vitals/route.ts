export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('vital_signs')
      .select(`
        id,
        measured_at,
        systolic_bp,
        diastolic_bp,
        heart_rate,
        temperature,
        respiratory_rate,
        oxygen_saturation,
        weight,
        height,
        bmi,
        notes
      `)
      .eq('patient_id', user.id)
      .order('measured_at', { ascending: false })
      .limit(100)

    if (error) throw error

    const vitals = (data || []).map((row: any) => ({
      ...row,
      blood_pressure:
        row.systolic_bp && row.diastolic_bp
          ? `${row.systolic_bp}/${row.diastolic_bp}`
          : null
    }))

    return NextResponse.json({
      success: true,
      vitals,
      latest: vitals[0] || null
    })
  } catch (error: any) {
    console.error('Patient vitals error:', error)
    return toApiErrorResponse(error, 'Failed to fetch vitals')
  }
}
