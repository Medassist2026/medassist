export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/change-phone/cancel
 *
 * Cancel an in-flight phone-change request. Idempotent — already-terminal
 * requests return 200 with a noop. Spec: PHONE_CHANGE_PLAN.md §5.3.
 */

import { NextResponse } from 'next/server'
import {
  requireApiAuth,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'
import {
  cancelPhoneChange,
  PhoneChangeError,
  type ActorRole,
} from '@shared/lib/data/phone-changes'

const FEATURE_FLAG = 'FEATURE_PHONE_CHANGE_V2'

function isUUID(val: any): val is string {
  return typeof val === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}

export async function POST(request: Request) {
  if (process.env[FEATURE_FLAG] !== 'true') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  try {
    const rate = await enforceRateLimit(request, 'change-phone-cancel', 5, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'محاولات كتيرة. حاول بعد شوية', code: 'rate_limit' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    const user = await requireApiAuth()
    const body = await request.json().catch(() => ({}))
    const { requestId } = body || {}

    if (!isUUID(requestId)) {
      return NextResponse.json(
        { error: 'requestId غلط', code: 'invalid_body' },
        { status: 400 }
      )
    }

    await cancelPhoneChange(user.id, user.role as ActorRole, requestId)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PhoneChangeError) {
      return NextResponse.json(
        { error: error.arabicMessage, code: error.code },
        { status: error.httpStatus }
      )
    }
    return toApiErrorResponse(error, 'فشل في إلغاء الطلب')
  }
}
