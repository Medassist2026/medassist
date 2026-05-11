export const dynamic = 'force-dynamic'

/**
 * POST /api/patient/lookup-by-phone — B07 Phase F.5 (Section 2).
 *
 * Resolves a phone number to a claimed user identity. Used by the Phase
 * F.5 caregiver-grant form to identify a delegate from their phone before
 * issuing a delegation grant (Phase F finding #3 closure).
 *
 * Body shape:
 *   { phone: string }   // accepts local or international Egyptian formats
 *
 * Response (200):
 *   { success: true,
 *     userId: string,
 *     globalPatientId: string,
 *     displayName: string | null }
 *
 * Response (404):
 *   { error: 'user_not_found', phone_attempted: string }   // E.164 normalized
 *
 * Errors:
 *   400 — phone missing / invalid format
 *   401 — unauthenticated
 *   403 — caller is not a patient
 *   429 — rate-limited (Phase F.5 Decision 8 — enumeration defense)
 *   500 — unexpected
 *
 * PRIVACY / SECURITY
 *   - Method is POST so the queried phone is in the request body, not in
 *     URL or referrer / browser-history (privacy critique of GET).
 *   - Rate-limited at 30 req/min/user via `enforceRateLimit`, same pattern
 *     as messaging-reconsent (Decision 8 — reuse existing pattern).
 *   - Returns ONLY userId + gpId + displayName. Does NOT echo the queried
 *     phone back beyond a 404 acknowledgement (`phone_attempted`) which is
 *     normalized E.164 — caller already supplied it.
 *   - Only returns users with `claimed_user_id IS NOT NULL`. Unclaimed gps
 *     (minors, sentinel-locked) are not selectable as delegates.
 *
 * AUDIT (Decision 9)
 *   Every call emits a `PATIENT_LOOKUP_BY_PHONE_ATTEMPT` audit row —
 *   regardless of hit/miss — with actor_kind='user', actor_user_id=caller,
 *   metadata.{phone_e164, matched, matched_user_id?, matched_global_patient_id?}.
 *   Lookup attempts are an enumeration-attack surface; every call must
 *   be traceable in audit logs.
 */

import { NextResponse } from 'next/server'
import {
  requireApiRole,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { validateEgyptianPhone } from '@shared/lib/utils/phone-validation'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'
import { logAuditEvent } from '@shared/lib/data/audit'

interface LookupBody {
  phone?: unknown
}

export async function POST(request: Request) {
  try {
    // Rate-limit FIRST — before auth burns CPU on enumeration attempts.
    const rate = await enforceRateLimit(
      request,
      'patient-lookup-by-phone',
      30,
      60_000
    )
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rate.retryAfterSeconds) },
        }
      )
    }

    const user = await requireApiRole('patient')

    const raw = (await request.json().catch(() => ({}))) as LookupBody
    const phoneInput =
      typeof raw.phone === 'string' ? raw.phone.trim() : ''

    if (!phoneInput) {
      return NextResponse.json(
        { error: 'phone is required' },
        { status: 400 }
      )
    }

    const validation = validateEgyptianPhone(phoneInput)
    if (!validation.isValid || !validation.normalized) {
      return NextResponse.json(
        {
          error: validation.error ?? 'Invalid phone number',
          error_ar: validation.errorAr ?? null,
        },
        { status: 400 }
      )
    }

    // Phone storage convention in `global_patients.normalized_phone`:
    // E.164 with leading '+'. Validator output is digits only ("20…");
    // prepend '+' for the lookup.
    const e164 = `+${validation.normalized}`

    const supabase = createAdminClient('patient-lookup-by-phone')
    const { data: matchRows, error: lookupError } = await supabase
      .from('global_patients')
      .select('id, claimed_user_id, display_name, account_status')
      .eq('normalized_phone', e164)
      .not('claimed_user_id', 'is', null)
      .limit(2)

    if (lookupError) {
      throw new Error(
        `lookup query failed: ${(lookupError as { message?: string }).message ?? 'unknown'}`
      )
    }

    const matches = (matchRows as
      | Array<{
          id: string
          claimed_user_id: string | null
          display_name: string | null
          account_status: string
        }>
      | null) ?? []

    // Defensive: the partial-unique index on (normalized_phone) for
    // claimed rows should prevent multiple matches, but if somehow
    // present, return 500 rather than picking one arbitrarily.
    if (matches.length > 1) {
      // Audit the ambiguous result for review.
      logAuditEvent({
        actorUserId: user.id,
        action: 'PATIENT_LOOKUP_BY_PHONE_ATTEMPT',
        entityType: 'global_patients',
        metadata: {
          phone_e164: e164,
          matched: false,
          ambiguous: true,
          match_count: matches.length,
        },
      })
      console.error(
        `[lookup-by-phone] multiple claimed gps for phone ${e164} — data integrity issue`
      )
      return NextResponse.json(
        { error: 'lookup_ambiguous' },
        { status: 500 }
      )
    }

    const match = matches[0]

    if (!match || !match.claimed_user_id) {
      // No match — emit audit row for traceability, return 404.
      logAuditEvent({
        actorUserId: user.id,
        action: 'PATIENT_LOOKUP_BY_PHONE_ATTEMPT',
        entityType: 'global_patients',
        metadata: { phone_e164: e164, matched: false },
      })

      return NextResponse.json(
        { error: 'user_not_found', phone_attempted: e164 },
        { status: 404 }
      )
    }

    // Hit — emit audit + return payload.
    logAuditEvent({
      actorUserId: user.id,
      action: 'PATIENT_LOOKUP_BY_PHONE_ATTEMPT',
      entityType: 'global_patients',
      entityId: match.id,
      metadata: {
        phone_e164: e164,
        matched: true,
        matched_user_id: match.claimed_user_id,
        matched_global_patient_id: match.id,
      },
    })

    return NextResponse.json({
      success: true,
      userId: match.claimed_user_id,
      globalPatientId: match.id,
      displayName: match.display_name,
    })
  } catch (error: any) {
    console.error('POST /patient/lookup-by-phone error:', error)
    return toApiErrorResponse(error, 'Failed to look up user by phone')
  }
}
