export const dynamic = 'force-dynamic'

/**
 * GET /api/clinic/phone-change-requests
 *
 * Owner-inbox list: returns pending fallback requests where the subject is
 * connected to the OWNER's active clinic. Used by the doctor-side clinic
 * settings page (clinic-settings/phone-change-requests).
 *
 * Auth: requireApiRole('doctor') + handler-side OWNER role check inside
 * the data layer (getPendingPhoneChangeRequests rejects non-OWNERs).
 *
 * Query: ?count=true returns just `{ count }` for a nav badge; otherwise
 * returns the full request list.
 *
 * Full spec: PHONE_CHANGE_PLAN.md §5.5.
 */

import { NextResponse } from 'next/server'
import {
  requireApiRole,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import { getClinicContext } from '@shared/lib/data/clinic-context'
import {
  getPendingPhoneChangeRequests,
  PhoneChangeError,
} from '@shared/lib/data/phone-changes'

const FEATURE_FLAG = 'FEATURE_PHONE_CHANGE_V2'

export async function GET(request: Request) {
  if (process.env[FEATURE_FLAG] !== 'true') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  try {
    const user = await requireApiRole('doctor')
    const ctx = await getClinicContext(user.id, 'doctor')
    if (!ctx?.clinicId) {
      return NextResponse.json(
        { error: 'لا توجد عيادة نشطة', code: 'no_active_clinic' },
        { status: 400 }
      )
    }

    const url = new URL(request.url)
    const countOnly = url.searchParams.get('count') === 'true'

    const rows = await getPendingPhoneChangeRequests(user.id, ctx.clinicId)

    if (countOnly) {
      return NextResponse.json({ count: rows.length })
    }
    return NextResponse.json({ requests: rows })
  } catch (error) {
    if (error instanceof PhoneChangeError) {
      return NextResponse.json(
        { error: error.arabicMessage, code: error.code },
        { status: error.httpStatus }
      )
    }
    return toApiErrorResponse(error, 'فشل في جلب طلبات تغيير الأرقام')
  }
}
