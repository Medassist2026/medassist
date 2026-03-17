export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse, getClinicRole } from '@shared/lib/auth/session'
import { getActiveClinicIdFromCookies } from '@shared/lib/data/clinic-context'
import { getAuditLog } from '@shared/lib/data/audit'

/**
 * GET /api/clinic/audit-log — Get clinic audit log (owner only)
 */
export async function GET(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const clinicId = await getActiveClinicIdFromCookies()

    if (!clinicId) {
      return NextResponse.json({ error: 'No active clinic' }, { status: 400 })
    }

    // Check owner role
    const role = await getClinicRole(user.id, clinicId)
    if (role !== 'OWNER') {
      return NextResponse.json({ error: 'Only clinic owner can view audit log' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || undefined
    const entityType = searchParams.get('entityType') || undefined
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const { data, error } = await getAuditLog(clinicId, {
      action,
      entityType,
      limit: Math.min(limit, 100),
      offset,
    })

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
    }

    return NextResponse.json({ success: true, events: data })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to get audit log')
  }
}
