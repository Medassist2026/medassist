export const dynamic = 'force-dynamic'

/**
 * PATCH /api/patient/dependents/[id] — B07 Phase F.5 (Section 3).
 *
 * Authenticated guardian updates editable fields on a minor dependent
 * profile. Identity fields (date_of_birth, sex, is_minor,
 * guardian_global_patient_id, claimed_user_id) are NOT editable here —
 * they're locked post-registration to preserve audit integrity.
 *
 * Body shape:
 *   { displayName?: string,        // 1..200 chars
 *     preferredLanguage?: 'ar'|'en' }
 *
 * Response (200):
 *   { success: true, dependent: MinorGlobalPatient }
 *
 * Authorization (Phase F finding #2 recommended):
 *   - requireAuthorityOver(id, user.id) — must resolve
 *   - basis MUST be 'guardian_of_minor'. Delegates are rejected even
 *     though the OR-of-three permits them — Phase D mig 114 UPDATE policy
 *     also restricts to self+guardian, so this matches the schema-level
 *     invariant.
 *
 * Audit:
 *   Data layer (`updateMinorProfile`) emits `MINOR_PROFILE_UPDATED` with
 *   metadata.changed_fields recording before/after per field. Phase E
 *   Decision 5 holds: handler does NOT emit; data layer is canonical.
 *
 * Errors:
 *   400 — id missing / validation failure / no editable fields supplied
 *   403 — basis not guardian-of-minor
 *   404 — minor not found
 */

import { NextResponse } from 'next/server'
import {
  requireApiRole,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import {
  requireAuthorityOver,
  AuthorityError,
} from '@shared/lib/auth/authority'
import {
  updateMinorProfile,
  DependentNotFoundError,
  InvalidDependentError,
  GuardianAuthorityError,
} from '@shared/lib/data/dependents'

interface PatchBody {
  displayName?: unknown
  preferredLanguage?: unknown
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } | Promise<{ id: string }> }
) {
  try {
    const user = await requireApiRole('patient')

    const params = await Promise.resolve(context.params)
    const id = params?.id
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Dependent id is required' },
        { status: 400 }
      )
    }

    // Authorization gate — guardian-of-minor only.
    const auth = await requireAuthorityOver(id, user.id)
    if (auth.basis !== 'guardian_of_minor') {
      throw new AuthorityError(
        id,
        `This endpoint requires guardian-of-minor authority (got: ${auth.basis})`
      )
    }

    const raw = (await request.json().catch(() => ({}))) as PatchBody

    // Parse body — accept only the whitelisted fields. Identity fields
    // (date_of_birth, sex, etc.) on the body are silently ignored so that
    // a stray client payload doesn't error; the data layer only writes
    // what the typed interface accepts.
    const updates: {
      displayName?: string
      preferredLanguage?: 'ar' | 'en'
    } = {}

    if (raw.displayName !== undefined) {
      if (typeof raw.displayName !== 'string') {
        return NextResponse.json(
          { error: 'displayName must be a string' },
          { status: 400 }
        )
      }
      updates.displayName = raw.displayName
    }

    if (raw.preferredLanguage !== undefined) {
      if (
        raw.preferredLanguage !== 'ar' &&
        raw.preferredLanguage !== 'en'
      ) {
        return NextResponse.json(
          { error: "preferredLanguage must be 'ar' or 'en'" },
          { status: 400 }
        )
      }
      updates.preferredLanguage = raw.preferredLanguage
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No editable fields supplied' },
        { status: 400 }
      )
    }

    const dependent = await updateMinorProfile(id, updates, user.id)

    return NextResponse.json({ success: true, dependent })
  } catch (error: any) {
    if (error instanceof DependentNotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404 }
      )
    }
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
    console.error('PATCH /api/patient/dependents/[id] error:', error)
    return toApiErrorResponse(error, 'Failed to update dependent')
  }
}
