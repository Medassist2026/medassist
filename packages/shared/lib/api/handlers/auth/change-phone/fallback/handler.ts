export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/change-phone/fallback
 *
 * Open the "old phone unreachable" fallback path on an existing pending
 * request. Flips verification_method to 'sms_new_only' and sends an OTP
 * to the NEW phone (we still verify the user controls the destination).
 * On approval the owner inbox path commits the change.
 *
 * Rate limit: 'change-phone-fallback' = 2 per IP per 24h. The lower limit
 * matches the higher-stakes nature of this path (manual review).
 *
 * Full spec: PHONE_CHANGE_PLAN.md §5.4. Resolved Q5: this also notifies
 * every active OWNER of every clinic touching the subject.
 */

import { NextResponse } from 'next/server'
import {
  requireApiAuth,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'
import {
  openPhoneChangeFallback,
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
    const rate = await enforceRateLimit(
      request, 'change-phone-fallback', 2, 86_400_000
    )
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'محاولات كتيرة. حاول بكره', code: 'rate_limit_fallback' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    const user = await requireApiAuth()
    const body = await request.json().catch(() => ({}))
    const { requestId, reason } = body || {}

    if (!isUUID(requestId)) {
      return NextResponse.json(
        { error: 'requestId غلط', code: 'invalid_body' },
        { status: 400 }
      )
    }
    if (typeof reason !== 'string' || reason.length === 0) {
      return NextResponse.json(
        { error: 'السبب مطلوب', code: 'invalid_body' },
        { status: 400 }
      )
    }

    const result = await openPhoneChangeFallback({
      actorId: user.id,
      actorRole: user.role as ActorRole,
      requestId,
      reason,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof PhoneChangeError) {
      return NextResponse.json(
        { error: error.arabicMessage, code: error.code },
        { status: error.httpStatus }
      )
    }
    return toApiErrorResponse(error, 'فشل في إرسال الطلب للمالك')
  }
}
