export const dynamic = 'force-dynamic'

/**
 * POST /api/patient/dependents/register — B07 Phase E.
 *
 * Authenticated patient registers a new minor dependent under their own
 * gp. The caller becomes the guardian.
 *
 * Body shape:
 *   {
 *     displayName: string                  // required, 1..200 chars
 *     dateOfBirth?: string                 // ISO date, past-only
 *     sex?: 'male' | 'female'
 *     preferredLanguage?: 'ar' | 'en'      // default 'ar' in data layer
 *   }
 *
 * Response (201):
 *   { success: true, minorGlobalPatientId: string, displayName: string }
 *
 * Errors:
 *   400 - validation failure or caller has no claimed gp
 *   401 - unauthenticated
 *   403 - caller's role is not 'patient'
 *   500 - unexpected
 *
 * Audit:
 *   Data layer (`createMinorGlobalPatient`) emits one
 *   `GUARDIAN_LINK_CREATED` audit row with subject=child gp,
 *   actor=caller, basis='guardian_of_minor'. Phase E does NOT emit a
 *   second audit row (Phase E Decision 5: data layer is canonical).
 */

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import {
  AmbiguousDependentMatchError,
  createMinorGlobalPatient,
  GuardianAuthorityError,
  InvalidDependentError,
} from '@shared/lib/data/dependents'

interface RegisterBody {
  displayName?: unknown
  dateOfBirth?: unknown
  sex?: unknown
  preferredLanguage?: unknown
  /**
   * K-1a dedup escape hatch — when true, skip the
   * `(guardian, display_name, date_of_birth, sex)` dedup lookup and
   * always insert a fresh minor gp. UX flow:
   *   1. UI submits without forceCreateNew (default false → dedup on)
   *   2. On 409 + `code: 'DEPENDENT_AMBIGUOUS_MATCH'`, UI shows a
   *      disambiguation picker with the returned `matchedIds`
   *   3. If user picks "create new anyway" (twins case), UI resubmits
   *      with forceCreateNew=true
   */
  forceCreateNew?: unknown
}

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('patient')

    const raw = (await request.json()) as RegisterBody
    const displayName =
      typeof raw.displayName === 'string' ? raw.displayName.trim() : ''
    const dateOfBirth =
      typeof raw.dateOfBirth === 'string' ? raw.dateOfBirth : undefined
    const sex =
      raw.sex === 'male' || raw.sex === 'female' ? raw.sex : undefined
    const preferredLanguage =
      raw.preferredLanguage === 'ar' || raw.preferredLanguage === 'en'
        ? raw.preferredLanguage
        : undefined
    const forceCreateNew = raw.forceCreateNew === true

    // ─── Body validation ─────────────────────────────────────────────────
    if (!displayName || displayName.length === 0) {
      return NextResponse.json(
        { error: 'displayName is required' },
        { status: 400 }
      )
    }
    if (displayName.length > 200) {
      return NextResponse.json(
        { error: 'displayName must be 200 characters or fewer' },
        { status: 400 }
      )
    }
    if (raw.dateOfBirth !== undefined && typeof raw.dateOfBirth !== 'string') {
      return NextResponse.json(
        { error: 'dateOfBirth must be an ISO date string' },
        { status: 400 }
      )
    }
    if (raw.sex !== undefined && raw.sex !== 'male' && raw.sex !== 'female') {
      return NextResponse.json(
        { error: "sex must be 'male' or 'female'" },
        { status: 400 }
      )
    }
    if (
      raw.preferredLanguage !== undefined &&
      raw.preferredLanguage !== 'ar' &&
      raw.preferredLanguage !== 'en'
    ) {
      return NextResponse.json(
        { error: "preferredLanguage must be 'ar' or 'en'" },
        { status: 400 }
      )
    }

    // ─── Resolve caller's claimed gp ─────────────────────────────────────
    // The caller must have a claimed gp to be a guardian. A user who has
    // never registered their own patient account cannot register a
    // dependent — they have no "self" gp to attach the guardian link to.
    const admin = createAdminClient('dependents-register-resolve-gp')
    const { data: gpRow, error: gpErr } = await admin
      .from('global_patients')
      .select('id')
      .eq('claimed_user_id', user.id)
      .maybeSingle()
    if (gpErr && (gpErr as { code?: string }).code !== 'PGRST116') {
      throw new Error(
        `Resolve caller gp failed: ${(gpErr as { message?: string }).message ?? 'unknown'}`
      )
    }
    const guardianGpId = (gpRow as { id?: string } | null)?.id
    if (!guardianGpId) {
      return NextResponse.json(
        {
          error:
            'You must register your own patient account before registering a dependent',
        },
        { status: 400 }
      )
    }

    // ─── Call data layer ─────────────────────────────────────────────────
    const result = await createMinorGlobalPatient({
      guardianGlobalPatientId: guardianGpId,
      displayName,
      dateOfBirth,
      sex,
      preferredLanguage,
      createdByUserId: user.id,
      forceCreateNew,
    })

    // 200 on reuse, 201 on fresh create. `reused: true` lets the UI skip
    // the "registration successful" toast and instead route the guardian
    // straight to the existing dependent's detail page if they want.
    return NextResponse.json(
      {
        success: true,
        minorGlobalPatientId: result.minorGlobalPatientId,
        displayName,
        reused: result.reused === true,
      },
      { status: result.reused === true ? 200 : 201 }
    )
  } catch (error: any) {
    if (error instanceof InvalidDependentError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 }
      )
    }
    if (error instanceof GuardianAuthorityError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403 }
      )
    }
    if (error instanceof AmbiguousDependentMatchError) {
      // K-1a multi-match path: UI shows a disambiguation picker. The
      // matchedIds[] is the only payload the picker needs; the message
      // is informational.
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          matchedIds: error.matchedIds,
        },
        { status: 409 }
      )
    }
    console.error('POST /api/patient/dependents/register error:', error)
    return toApiErrorResponse(error, 'Failed to register dependent')
  }
}
