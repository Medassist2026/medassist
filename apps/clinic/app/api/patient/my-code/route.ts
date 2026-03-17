export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'

/**
 * GET /api/patient/my-code — Get patient's shareable code
 */
export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const admin = createAdminClient('patient-code')

    const { data: patient, error } = await admin
      .from('patients')
      .select('patient_code, unique_id')
      .eq('id', user.id)
      .single()

    if (error || !patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    // Return patient_code if exists, fallback to unique_id
    return NextResponse.json({
      success: true,
      code: patient.patient_code || patient.unique_id,
    })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to get code')
  }
}

/**
 * POST /api/patient/my-code — Regenerate patient code
 */
export async function POST() {
  try {
    const user = await requireApiRole('patient')
    const admin = createAdminClient('patient-code')

    // Generate new 6-char code
    const newCode = Array.from({ length: 6 }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
    ).join('')

    const { data, error } = await admin
      .from('patients')
      .update({ patient_code: newCode })
      .eq('id', user.id)
      .select('patient_code')
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to regenerate code' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      code: data.patient_code,
      message: 'Code regenerated. Your previous code is now invalid.'
    })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to regenerate code')
  }
}
