export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'
import { checkPhoneUniform } from '@shared/lib/data/privacy-codes'

/**
 * POST /api/patients/check-phone-uniform — Build prompt 04 (B8).
 *
 * Body: { phone: string }
 *
 * The privacy-respecting replacement for the legacy GET /api/patients/check-phone.
 * Returns IDENTICAL shape AND timing whether or not the phone matches a global_patient:
 *   { exists: false, requiresCode: true }
 *
 * Front-desk's check-in flow uses this to decide "show privacy code modal".
 * Coexists with the legacy endpoint until Prompt 6 retires it (the legacy
 * endpoint still leaks via response shape; new code must NOT use it).
 *
 * Auth: frontdesk OR doctor.
 *
 * Rate limit: 30 requests/minute/IP. Higher than other rate limits because
 * this is the "show modal" decider — false negatives slow check-in.
 */
export async function POST(request: Request) {
  try {
    const rate = await enforceRateLimit(request, 'patient-check-phone-uniform', 30, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    await requireApiRole(['doctor', 'frontdesk'])

    const body = await request.json().catch(() => ({}))
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''

    if (!phone) {
      // Even on bad input we return the uniform shape — never reveal which
      // input forms exist via different responses.
      return NextResponse.json({ exists: false, requiresCode: true })
    }

    const outcome = await checkPhoneUniform(phone)
    return NextResponse.json(outcome)
  } catch (error: any) {
    console.error('check-phone-uniform error:', error)
    return toApiErrorResponse(error, 'Phone check failed')
  }
}
