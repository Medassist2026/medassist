export const dynamic = 'force-dynamic'

/**
 * POST /api/clinic/phone-change-requests/:id/approve
 *
 * Clinic OWNER approves a pending fallback request. Runs the same commit
 * transaction as the regular happy path (change_phone_commit RPC + auth
 * admin sync + fan-out). Resolved Q2: self-approval is banned (the data
 * layer rejects with 403 if request.user_id === ownerId).
 *
 * Full spec: PHONE_CHANGE_PLAN.md §5.6.
 */

import { NextResponse } from 'next/server'
import {
  requireApiRole,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import { getClinicContext } from '@shared/lib/data/clinic-context'
import {
  approvePhoneChangeRequest,
  PhoneChangeError,
} from '@shared/lib/data/phone-changes'

const FEATURE_FLAG = 'FEATURE_PHONE_CHANGE_V2'

function isUUID(val: string | undefined): val is string {
  return typeof val === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}

export async function POST(
  _request: Request,
  context: { params: { id: string } }
) {
  if (process.env[FEATURE_FLAG] !== 'true') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  try {
    const requestId = context?.params?.id
    if (!isUUID(requestId)) {
      return NextResponse.json(
        { error: 'معرف الطلب غلط', code: 'invalid_param' },
        { status: 400 }
      )
    }

    const user = await requireApiRole('doctor')
    const ctx = await getClinicContext(user.id, 'doctor')
    if (!ctx?.clinicId) {
      return NextResponse.json(
        { error: 'لا توجد عيادة نشطة', code: 'no_active_clinic' },
        { status: 400 }
      )
    }

    await approvePhoneChangeRequest(user.id, ctx.clinicId, requestId)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PhoneChangeError) {
      return NextResponse.json(
        { error: error.arabicMessage, code: error.code },
        { status: error.httpStatus }
      )
    }
    return toApiErrorResponse(error, 'فشل في الموافقة على الطلب')
  }
}
