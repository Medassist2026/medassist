import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const admin = createAdminClient()

    const { data, error } = await admin
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
