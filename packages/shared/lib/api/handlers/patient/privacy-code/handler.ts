export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiAuth, toApiErrorResponse } from '@shared/lib/auth/session'
import { hasActivePrivacyCode } from '@shared/lib/data/privacy-codes'
import { createAdminClient } from '@shared/lib/supabase/admin'

/**
 * GET /api/patient/privacy-code — Build prompt 04 (B12).
 *
 * Auth: patient (requireApiAuth — no specific role; the auth.uid() must
 * match a global_patients.claimed_user_id).
 *
 * Response shapes:
 *   200 { hasCode: true } — patient has minted a code (plaintext is not
 *     stored, so we cannot return it; the patient app keeps the plaintext
 *     it received from the most recent /regenerate response, or it shows
 *     "no code yet, regenerate" if it doesn't have a stashed copy)
 *   200 { hasCode: false } — patient has never minted (or last code is
 *     revoked); they should call /regenerate to mint
 *   401 — not authenticated
 *
 * The plaintext is never returned by this endpoint. /regenerate is the
 * ONLY surface that returns plaintext, and only on mint.
 */
export async function GET(request: Request) {
  void request
  try {
    const session = await requireApiAuth()
    const userId = session.id

    // Find this user's global_patient (must be claimed).
    const admin = createAdminClient('patient-privacy-code-get')
    const { data: gp, error } = await admin
      .from('global_patients')
      .select('id, claimed, claimed_user_id')
      .eq('claimed_user_id', userId)
      .maybeSingle()

    if (error || !gp?.id) {
      return NextResponse.json({ error: 'Patient identity not claimed' }, { status: 404 })
    }

    const has = await hasActivePrivacyCode(gp.id)
    return NextResponse.json({ hasCode: has })
  } catch (error: any) {
    console.error('GET /patient/privacy-code error:', error)
    return toApiErrorResponse(error, 'Failed to read privacy code state')
  }
}
