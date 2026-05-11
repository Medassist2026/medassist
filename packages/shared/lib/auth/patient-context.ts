/**
 * B07 Phase F.5 — Cross-context patient resolution helper.
 *
 * Resolves the patient subject of a Phase E/F.5 patient-app API request,
 * given an optional `?gpId=<id>` query parameter. Three resolution paths:
 *
 *   - `?gpId` absent           → basis='self', patient_id=user.id
 *   - `?gpId` present + claimed → resolve via global_patients.claimed_user_id
 *                                  (Decision 3 — legacy 1:1 convention
 *                                  `patients.id = auth.users.id`)
 *   - `?gpId` present + minor   → resolvedPatientId=null (Decision 2 —
 *                                  empty data; Phase G handles real
 *                                  minor data via PCR)
 *
 * Authority is verified via Phase E `requireAuthorityOver` (read paths)
 * or `requireCapability` (write paths with capability semantics). The
 * helper returns the basis so handlers can attach
 * `metadata.acting_as` to downstream audit rows when emitting.
 *
 * USAGE PATTERN
 *
 *   // Read endpoint
 *   const ctx = await resolvePatientContext({ request, userId: user.id })
 *   if (ctx.resolvedPatientId === null) {
 *     // Minor case — no clinical data yet
 *     return NextResponse.json({ success: true, records: [] })
 *   }
 *   const { data } = await supabase
 *     .from('patient_medical_records')
 *     .select(...)
 *     .eq('patient_id', ctx.resolvedPatientId)
 *
 *   // Write endpoint requiring capability
 *   const ctx = await resolvePatientContext({
 *     request,
 *     userId: user.id,
 *     requiredCapability: 'manage_medications',
 *     denyDelegates: false,
 *   })
 *
 *   // Write endpoint that delegates cannot perform (e.g. add a record)
 *   const ctx = await resolvePatientContext({
 *     request,
 *     userId: user.id,
 *     denyDelegates: true,
 *   })
 *
 * MVP SCOPE
 *
 * `consent_to_share` is post-MVP per Mo ruling 4 — sharing extend/revoke
 * endpoints pass `denyDelegates: true` and rely on the self+guardian
 * fall-through path.
 *
 * Phase G clinic-side work will plumb minor clinical data via
 * patient_clinic_records; once it ships, this helper's `isMinor` branch
 * can route to a PCR-based query path instead of returning empty.
 *
 * NO SCHEMA / RLS CHANGES — helper is application-layer only.
 */

import { createAdminClient } from '@shared/lib/supabase/admin'
import { ApiAuthError } from '@shared/lib/auth/session'
import {
  AuthorityError,
  requireAuthorityOver,
  type AuthorityResult,
} from '@shared/lib/auth/authority'
import type { AuthorityBasis } from '@shared/lib/data/audit'

// ──────────────────────────────────────────────────────────────────────────
// UUID validation (matches the Phase E `delegations/create` handler shape)
// ──────────────────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

// ──────────────────────────────────────────────────────────────────────────
// Errors
// ──────────────────────────────────────────────────────────────────────────

/**
 * Thrown when `?gpId=` is supplied but the value fails UUID validation.
 * Maps to 400 via `toApiErrorResponse` (extends `ApiAuthError(400)`-shape
 * by reusing the 403 mapping isn't appropriate — caller-side bad input is
 * a 400). For symmetry with the rest of `ApiAuthError` we accept the
 * 400/401/403 narrowing.
 */
export class InvalidGpIdError extends Error {
  readonly code = 'INVALID_GP_ID' as const
  readonly status = 400 as const

  constructor(value: string) {
    super(`Invalid gpId query parameter: '${value}' is not a valid UUID`)
    this.name = 'InvalidGpIdError'
  }
}

/**
 * Thrown by write endpoints that opt-in via `denyDelegates: true` when
 * the caller's authority basis is `delegated_by_principal`. The action is
 * a write that has no MVP capability (e.g., `consent_to_share` is
 * post-MVP per ruling 4) and is therefore principal-only or
 * principal-plus-guardian.
 *
 * Maps to 403 via `toApiErrorResponse`.
 */
export class DelegateNotAuthorizedError extends ApiAuthError {
  readonly code = 'DELEGATE_NOT_AUTHORIZED' as const

  constructor(message?: string) {
    super(
      message ??
        'This action is not available for delegated authority. The ' +
          'principal must perform it themselves.',
      403
    )
    this.name = 'DelegateNotAuthorizedError'
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Return shape
// ──────────────────────────────────────────────────────────────────────────

/**
 * Result of patient-context resolution. Handlers use:
 *   - `resolvedPatientId` as the `patient_id = ?` filter against legacy
 *     clinical tables; `null` means minor (handler returns empty data).
 *   - `basis` to populate `metadata.acting_as` on emitted audit rows.
 *   - `delegationId` to populate `metadata.authority_grant_id` when
 *     basis='delegated_by_principal'.
 *   - `gpId` (the resolved global_patients.id) for any audit row whose
 *     subject is the gp rather than the legacy patient.
 *   - `isMinor` so handlers can branch on the minor short-circuit even
 *     when `resolvedPatientId` is non-null in the future.
 */
export interface PatientContext {
  /**
   * The value to filter against `patient_id` columns in legacy clinical
   * tables. Equals `userId` for the self path, `claimed_user_id` of the
   * resolved gp for the delegated/guardian-claimed path, and `null` for
   * minor gps (no claim → no `patients.id` per legacy 1:1 convention).
   */
  resolvedPatientId: string | null
  /** OR-of-three authority branch that matched. */
  basis: AuthorityBasis
  /**
   * The resolved global_patients.id when `?gpId` was supplied; `null`
   * when the request defaulted to self. Useful for audit emission whose
   * subject is the gp.
   */
  gpId: string | null
  /**
   * True iff the resolved gp has `is_minor = TRUE`. Implies
   * `resolvedPatientId === null` per Decision 2.
   */
  isMinor: boolean
  /**
   * Active delegation row id when basis='delegated_by_principal'.
   * `undefined` otherwise.
   */
  delegationId?: string
}

// ──────────────────────────────────────────────────────────────────────────
// Helper input
// ──────────────────────────────────────────────────────────────────────────

/**
 * Authorization function passed by handlers to gate cross-context access.
 *
 * The default is `requireAuthorityOver`. For write endpoints that need
 * capability gating, handlers pass a closure that calls `requireCapability`
 * with a STATIC LITERAL token, e.g.:
 *
 *     authorize: (gpId, userId) =>
 *       requireCapability(gpId, 'manage_medications', userId)
 *
 * The closure pattern keeps capability tokens as literals at every call
 * site — necessary for the `no-unregistered-delegation-capability`
 * eslint rule's grep-via-AST static audit. The helper itself never
 * passes a runtime variable to `requireCapability`.
 */
export type PatientContextAuthorize = (
  globalPatientId: string,
  userId: string
) => Promise<AuthorityResult>

export interface ResolvePatientContextInput {
  /** The incoming Next.js Request — used to read `?gpId=` query param. */
  request: Request
  /** Authenticated caller's auth.users.id. */
  userId: string
  /**
   * Authorization closure invoked when `?gpId=` is supplied. Defaults to
   * `requireAuthorityOver`. Capability-gated handlers pass a closure
   * that calls `requireCapability` with a literal capability token.
   */
  authorize?: PatientContextAuthorize
  /**
   * When true, reject delegate-basis callers outright (403). Use for
   * write endpoints that have no MVP capability covering them:
   *   - records POST (creating a clinical record for someone else)
   *   - sharing extend / revoke (consent_to_share is post-MVP)
   * Self and guardian-of-minor still pass through.
   */
  denyDelegates?: boolean
}

// ──────────────────────────────────────────────────────────────────────────
// Helper
// ──────────────────────────────────────────────────────────────────────────

/**
 * Resolve the patient subject for a patient-app API request.
 *
 * Behaviour:
 *   1. Parse `?gpId=` from `request.url`. If absent → self path.
 *      Returns `{ resolvedPatientId: userId, basis: 'self', gpId: null,
 *                 isMinor: false }`.
 *   2. If present, validate UUID shape. Invalid → `InvalidGpIdError`.
 *   3. If `requiredCapability` is set, call `requireCapability` — also
 *      runs the underlying `requireAuthorityOver`. Otherwise call
 *      `requireAuthorityOver` directly.
 *   4. If basis is 'delegated_by_principal' AND `denyDelegates: true`,
 *      throw `DelegateNotAuthorizedError`.
 *   5. Look up the gp's `claimed_user_id` + `is_minor` (one SELECT).
 *      - Minor: `resolvedPatientId = null`, isMinor = true.
 *      - Adult (claimed): `resolvedPatientId = claimed_user_id`.
 *      - Adult (unclaimed but authorized via delegation):
 *        `resolvedPatientId = null` — same as minor (no legacy
 *        patients.id exists). Rare; handled identically. Future: if a
 *        delegated unclaimed-adult case becomes load-bearing, route to
 *        PCR bridge.
 *
 * Performance: helper adds 1 extra SELECT against global_patients
 * (3 fields by PK). Negligible.
 */
export async function resolvePatientContext(
  input: ResolvePatientContextInput
): Promise<PatientContext> {
  const url = new URL(input.request.url)
  const gpIdParam = url.searchParams.get('gpId')

  // ─── Self path ────────────────────────────────────────────────────────
  if (gpIdParam === null || gpIdParam === '') {
    return {
      resolvedPatientId: input.userId,
      basis: 'self',
      gpId: null,
      isMinor: false,
    }
  }

  // ─── Cross-context path ───────────────────────────────────────────────
  if (!isValidUuid(gpIdParam)) {
    throw new InvalidGpIdError(gpIdParam)
  }

  const authorize: PatientContextAuthorize =
    input.authorize ?? requireAuthorityOver
  const auth = await authorize(gpIdParam, input.userId)

  if (
    input.denyDelegates === true &&
    auth.basis === 'delegated_by_principal'
  ) {
    throw new DelegateNotAuthorizedError()
  }

  // Resolve gp → claimed_user_id + is_minor for the legacy patients.id
  // mapping (Decision 3).
  const supabase = createAdminClient('patient-context-resolve')
  const { data: gpRow, error: gpError } = await supabase
    .from('global_patients')
    .select('id, claimed_user_id, is_minor')
    .eq('id', gpIdParam)
    .maybeSingle()

  if (gpError) {
    throw new Error(
      `resolvePatientContext gp lookup failed: ${(gpError as { message?: string }).message ?? 'unknown'}`
    )
  }

  if (!gpRow) {
    // Authority resolved but gp vanished between calls — treat as 403
    // (the consistent answer with Phase E AuthorityError semantics).
    throw new AuthorityError(
      gpIdParam,
      `Global patient ${gpIdParam} not found during context resolve`
    )
  }

  const gp = gpRow as {
    id: string
    claimed_user_id: string | null
    is_minor: boolean
  }

  // Minor short-circuit (Decision 2) — empty data for clinical reads;
  // write handlers should branch on isMinor and reject.
  if (gp.is_minor) {
    return {
      resolvedPatientId: null,
      basis: auth.basis,
      gpId: gpIdParam,
      isMinor: true,
      delegationId: auth.delegationId,
    }
  }

  // Adult cross-context — claimed_user_id IS the legacy patients.id
  // by 1:1 convention (Decision 3). If unclaimed but somehow authorized
  // (rare delegation-on-unclaimed edge case), short-circuit to empty.
  if (!gp.claimed_user_id) {
    return {
      resolvedPatientId: null,
      basis: auth.basis,
      gpId: gpIdParam,
      isMinor: false,
      delegationId: auth.delegationId,
    }
  }

  return {
    resolvedPatientId: gp.claimed_user_id,
    basis: auth.basis,
    gpId: gpIdParam,
    isMinor: false,
    delegationId: auth.delegationId,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Convenience — minor-empty payload helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Standard "minor or unclaimed cross-context" empty-data shape. Handlers
 * may return this directly when `ctx.resolvedPatientId === null` for a
 * read endpoint that returns an array under a named key.
 *
 *   if (ctx.resolvedPatientId === null) {
 *     return NextResponse.json(emptyForCrossContext({ records: [] }))
 *   }
 */
export function emptyForCrossContext<
  T extends Record<string, unknown>
>(payload: T): { success: true } & T {
  return { success: true, ...payload }
}
