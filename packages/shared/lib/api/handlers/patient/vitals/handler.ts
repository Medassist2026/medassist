export const dynamic = 'force-dynamic'

/**
 * GET /api/patient/vitals — B07 Phase F.5 cross-context extension.
 *
 * Accepts optional `?gpId=<id>` for cross-context viewing. Minor → empty.
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
      return NextResponse.json(
        emptyForCrossContext({ vitals: [], latest: null })
      )
    }

    const supabase = createAdminClient('patient-vitals')

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
      .eq('patient_id', ctx.resolvedPatientId)
      .order('measured_at', { ascending: false })
      .limit(100)

    if (error) throw error

    const vitals = (data || []).map((row: any) => ({
      ...row,
      blood_pressure:
        row.systolic_bp && row.diastolic_bp
          ? `${row.systolic_bp}/${row.diastolic_bp}`
          : null,
    }))

    return NextResponse.json({
      success: true,
      vitals,
      latest: vitals[0] || null,
    })
  } catch (error: any) {
    console.error('Patient vitals error:', error)
    return toApiErrorResponse(error, 'Failed to fetch vitals')
  }
}
