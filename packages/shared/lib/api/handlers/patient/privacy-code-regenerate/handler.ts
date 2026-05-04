export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiAuth, toApiErrorResponse } from '@shared/lib/auth/session'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'
import { regeneratePrivacyCode } from '@shared/lib/data/privacy-codes'
import { createAdminClient } from '@shared/lib/supabase/admin'

/**
 * POST /api/patient/privacy-code/regenerate — Build prompt 04 (B13).
 *
 * Auth: patient (the auth.uid() must match a global_patients.claimed_user_id).
 *
 * Mints a new privacy code, revokes the previous active code (if any),
 * returns the plaintext ONCE. The patient app:
 *   - shows the plaintext large + copyable
 *   - warns the user that regenerating again will invalidate this code
 *   - the user is told they cannot retrieve this code later — only mint a new one
 *
 * Per-patient rate limit: 10 regenerations/hour (prevents accidental rapid clicks
 * + caps the audit volume). The per-code lockout is unaffected since mint
 * resets attempts_count to 0.
 */
export async function POST(request: Request) {
  try {
    const rate = await enforceRateLimit(request, 'patient-privacy-code-regenerate', 10, 3_600_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many regenerations. Please wait before trying again.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    const session = await requireApiAuth()
    const userId = session.id

    // Resolve the patient's global identity. Must be claimed.
    const admin = createAdminClient('patient-privacy-code-regenerate')
    const { data: gp, error } = await admin
      .from('global_patients')
      .select('id, claimed_user_id')
      .eq('claimed_user_id', userId)
      .maybeSingle()
    if (error || !gp?.id) {
      return NextResponse.json({ error: 'Patient identity not claimed' }, { status: 404 })
    }

    // Use the patient-authenticated path so the DB function authorizes via auth.uid().
    const outcome = await regeneratePrivacyCode({
      globalPatientId: gp.id,
      authMode: 'patient',
    })

    return NextResponse.json({ code: outcome.code })
  } catch (error: any) {
    console.error('POST /patient/privacy-code/regenerate error:', error)
    return toApiErrorResponse(error, 'Failed to regenerate privacy code')
  }
}
