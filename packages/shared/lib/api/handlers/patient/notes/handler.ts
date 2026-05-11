export const dynamic = 'force-dynamic'

/**
 * GET /api/patient/notes — B07 Phase F.5 cross-context extension.
 *
 * Accepts optional `?gpId=<id>` for cross-context viewing. Minor → empty.
 */

import {
  requireApiRole,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import { getPatientNotes } from '@shared/lib/data/clinical-notes'
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
      return NextResponse.json(emptyForCrossContext({ notes: [] }))
    }

    const notes = await getPatientNotes(ctx.resolvedPatientId, 100)

    return NextResponse.json({ success: true, notes: notes || [] })
  } catch (error: any) {
    console.error('Get patient notes error:', error)
    return toApiErrorResponse(error, 'Failed to fetch notes')
  }
}
