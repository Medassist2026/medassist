/**
 * GET /api/admin/global-patients/lookup
 *
 * Internal verification endpoint — confirms the global identity layer
 * (mig 073) is wired up correctly. Returns the global_patients row
 * matching a phone, or 404 if none exists.
 *
 * NOT user-facing. The patient and clinic apps still read from the
 * legacy `patients` table; the application data-layer cutover is
 * Prompt 3.
 *
 * Auth: SERVICE-ROLE ONLY via `requireServiceRole`. Any caller without
 * the service-role bearer token — including authenticated doctors —
 * receives 401. This is intentional: the endpoint resolves any phone
 * in the network to a global identity, and exposing that lookup to
 * per-clinic operators would be a privacy regression (a doctor in
 * Clinic A could probe whether a phone exists in Clinic B's roster
 * just by hitting this route). The endpoint is reachable only by
 * internal admin tooling and the data-layer cutover validation
 * harness in Prompt 3.
 *
 * Response shape (success):
 *   200 { id, normalized_phone, claimed_by_user_id, ... }
 * Response shape (no match):
 *   404 { error: 'Not Found', normalized_phone }
 * Response shape (invalid input):
 *   400 { error: 'phone query param required' }
 *   400 { error: 'phone could not be normalized to E.164' }
 * Response shape (auth):
 *   401 { error: 'Unauthorized' } — missing/invalid service-role bearer
 */

import { NextResponse } from 'next/server'
import { requireServiceRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { findGlobalPatientByPhone } from '@shared/lib/data/global-patients'
import { normalizeEgyptianPhone } from '@shared/lib/utils/phone-normalize'

export async function GET(request: Request): Promise<Response> {
  try {
    // Service-role gate. Doctor / patient / frontdesk tokens MUST NOT
    // resolve here — see file header for rationale.
    requireServiceRole(request)

    const url = new URL(request.url)
    const rawPhone = url.searchParams.get('phone')

    if (!rawPhone || rawPhone.trim().length === 0) {
      return NextResponse.json(
        { error: 'phone query param required' },
        { status: 400 }
      )
    }

    const normalized = normalizeEgyptianPhone(rawPhone)
    if (normalized === null) {
      return NextResponse.json(
        {
          error: 'phone could not be normalized to E.164',
          input: rawPhone,
        },
        { status: 400 }
      )
    }

    const gp = await findGlobalPatientByPhone(rawPhone)
    if (!gp) {
      return NextResponse.json(
        { error: 'Not Found', normalized_phone: normalized },
        { status: 404 }
      )
    }

    // Mirror the field name used in the BUILD prompt's response shape
    // ({ id, normalized_phone, claimed_by_user_id }) while still
    // exposing the full row for verification purposes.
    return NextResponse.json({
      id: gp.id,
      normalized_phone: gp.normalized_phone,
      claimed_by_user_id: gp.claimed_user_id,
      claimed: gp.claimed,
      claimed_at: gp.claimed_at,
      account_status: gp.account_status,
      display_name: gp.display_name,
      created_at: gp.created_at,
    })
  } catch (error) {
    console.error('admin/global-patients/lookup error:', error)
    return toApiErrorResponse(error, 'Failed to lookup global patient')
  }
}
