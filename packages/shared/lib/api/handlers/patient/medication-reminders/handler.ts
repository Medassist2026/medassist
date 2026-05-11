export const dynamic = 'force-dynamic'

/**
 * GET /api/patient/medication-reminders — B07 Phase F.5 cross-context extension.
 *
 * Accepts optional `?gpId=<id>` for cross-context viewing. Minor → empty.
 */

import {
  requireApiRole,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import { getPatientMedications } from '@shared/lib/data/medications'
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
      return NextResponse.json(emptyForCrossContext({ medications: [] }))
    }

    const medications = await getPatientMedications(ctx.resolvedPatientId)

    return NextResponse.json({
      success: true,
      medications: medications || [],
    })
  } catch (error: any) {
    console.error('Get medication reminders error:', error)
    return toApiErrorResponse(error, 'Failed to fetch medications')
  }
}
