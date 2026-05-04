/**
 * patient_data_shares data layer — Build prompt 05.
 *
 * TS wrappers around the SECURITY DEFINER functions in mig 090. The DB
 * functions own atomicity (audit row + share row in one transaction); the
 * TS layer is thin RPC wrapping with type safety, validation, and a few
 * read helpers that don't need transactional semantics.
 *
 * SHARE LIFECYCLE INVARIANTS (enforced by mig 090, restated here for callers)
 *   - createShare is idempotent on the (grantor, grantee, patient) triple:
 *     if an active share already exists, no new row is written and the
 *     existing row is returned with `idempotent_hit: true`.
 *   - extendShare NEVER shortens. PERMANENT sets expires_at = NULL. Extending
 *     a permanent share is a no-op. Extending a revoked share THROWS.
 *   - revokeShare is idempotent. A second revoke is a no-op.
 *   - autoRenewOnVisit extends every active, non-permanent share for
 *     (grantee_clinic_id, global_patient_id) to MAX(current expires, NOW+90d).
 *     Skips revoked + permanent + already-further-out shares. ONE audit row
 *     per renewed share.
 *
 * AUDIT INVARIANT
 *   Every state change writes a corresponding audit_events row in the SAME
 *   transaction as the share row write. Failure of either rolls back both.
 *   This is enforced at the DB level — TS callers cannot bypass it.
 *
 * CALLABILITY
 *   The RPCs are GRANTed to authenticated. They are SECURITY DEFINER so they
 *   bypass the RLS DENY-ALL placeholder on patient_data_shares. Real RLS
 *   ships in Prompt 6 (ORPH-V5-01).
 */

import { createAdminClient } from '@shared/lib/supabase/admin'
import { createClient } from '@shared/lib/supabase/server'

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export type GrantedVia = 'PRIVACY_CODE' | 'SMS_CODE' | 'PATIENT_APP' | 'AUTO_RENEW'

export type ExtendDuration = '90_DAYS' | '1_YEAR' | 'PERMANENT'

export interface PatientDataShare {
  id: string
  global_patient_id: string
  grantor_clinic_id: string
  grantee_clinic_id: string
  granted_at: string
  expires_at: string | null
  revoked_at: string | null
  granted_via: GrantedVia
  grant_reason: string | null
  audit_event_id: string | null
  created_at: string
  updated_at: string
}

export interface CreateShareResult {
  /** False when the call was idempotent (active share already existed). */
  created: boolean
  idempotent_hit: boolean
  share_id: string
  audit_event_id: string | null
  global_patient_id: string
  grantor_clinic_id: string
  grantee_clinic_id: string
  granted_at: string
  expires_at: string | null
  granted_via: GrantedVia
}

export interface ExtendShareResult {
  changed: boolean
  /** Set when changed=false. 'already_permanent' or 'would_shorten'. */
  reason?: 'already_permanent' | 'would_shorten'
  share_id: string
  expires_at: string | null
  previous_expires_at: string | null
  audit_event_id?: string
  duration?: ExtendDuration
}

export interface RevokeShareResult {
  changed: boolean
  reason?: 'already_revoked'
  share_id: string
  revoked_at: string
  audit_event_id?: string
}

export interface AutoRenewResult {
  renewed_count: number
  share_ids: string[]
}

// ──────────────────────────────────────────────────────────────────────
// 1. createShare — verify-privacy-code, verify-sms-code, patient-app grants
// ──────────────────────────────────────────────────────────────────────

/**
 * Creates a directional grantor → grantee share for a patient. Idempotent:
 * if an active share already exists for the (grantor, grantee, patient)
 * triple, returns it without writing a new row.
 *
 * Atomicity: the DB function writes the SHARE_GRANTED audit row + the
 * patient_data_shares row in a single transaction. Failure of either
 * (e.g., FK violation, CHECK rejection) rolls back both. Callers do not
 * need to wrap this in their own transaction.
 *
 * @returns CreateShareResult — the created (or idempotent-matched) share.
 * @throws if validation fails on the DB side (invalid actor_kind, granted_via,
 *         grantor==grantee, etc.) — these are programmer errors, not user-
 *         facing failures.
 */
export async function createShare(args: {
  globalPatientId: string
  grantorClinicId: string
  granteeClinicId: string
  grantedVia: GrantedVia
  grantReason?: string | null
  /** The clinic-staff user driving the grant (verify-privacy-code success). */
  actorUserId: string | null
  actorKind: 'user' | 'system'
  /** Defaults to 90 days. PERMANENT shares come from extendShare, not this. */
  defaultExpiryDays?: number
  /**
   * Use admin client (SECURITY DEFINER bypasses RLS, so this is mostly
   * about whether the calling context has an authenticated session).
   * Default true because callers are server-side handlers that already
   * vetted the user.
   */
  useAdmin?: boolean
}): Promise<CreateShareResult> {
  const supabase = args.useAdmin === false
    ? await createClient()
    : createAdminClient('patient-shares-create')

  const { data, error } = await (supabase as any).rpc('create_data_share', {
    p_global_patient_id: args.globalPatientId,
    p_grantor_clinic_id: args.grantorClinicId,
    p_grantee_clinic_id: args.granteeClinicId,
    p_granted_via: args.grantedVia,
    p_grant_reason: args.grantReason ?? null,
    p_actor_user_id: args.actorUserId,
    p_actor_kind: args.actorKind,
    p_default_expiry_days: args.defaultExpiryDays ?? 90,
  })

  if (error) {
    throw new Error(`createShare failed: ${(error as { message?: string }).message ?? 'unknown'}`)
  }
  return data as CreateShareResult
}

/**
 * Atomic multi-grantor share creation. Calls the SECURITY DEFINER
 * `create_shares_for_grantors` (mig 091) so all shares + audit rows
 * commit together or roll back together — closes the Build 05 § 3
 * partial-failure window.
 *
 * Per Build 05 multi-grantor decision (results doc § 3): when a patient
 * has records at clinics A, B, C and verifies at clinic D, we create
 * THREE shares (A→D, B→D, C→D) so a later A→D revoke doesn't tear down
 * B→D or C→D.
 *
 * SEMANTICS (post mig 091)
 *   Single DB transaction. If any one share write fails (FK violation,
 *   CHECK rejection inside create_data_share, etc.), the entire batch is
 *   rolled back. Caller sees `{ shares: [], errors: [{ scope: 'all', ...}]}`
 *   and decides whether to retry the whole batch.
 *
 * IDEMPOTENCY
 *   Per (grantor, grantee, patient) triple — re-running with the same
 *   args returns rows with `idempotentHit: true` and the existing share/
 *   audit ids.
 *
 * SELF-GRANT FILTER
 *   Grantor IDs equal to the grantee are filtered out BEFORE the RPC.
 *   The RPC defensively rejects them too, but pre-filtering avoids
 *   surfacing what is actually a no-op as an error to the caller.
 */
export async function createSharesForGrantors(args: {
  globalPatientId: string
  grantorClinicIds: string[]
  granteeClinicId: string
  grantedVia: GrantedVia
  grantReason?: string | null
  actorUserId: string | null
  actorKind: 'user' | 'system'
  /**
   * Currently unused — the SECURITY DEFINER wrapper hardcodes 90 days
   * (matching create_data_share's default). Keep the parameter on the
   * TS API for a future v2 of the wrapper that accepts custom expiries.
   */
  defaultExpiryDays?: number
}): Promise<{
  shares: CreateShareResult[]
  errors: Array<{ grantorClinicId?: string; scope?: 'all'; message: string }>
}> {
  // Pre-filter grantor==grantee. The RPC would reject this defensively
  // and abort the entire batch; pre-filtering treats self-grant as a
  // silent no-op (which is the correct semantic when the patient's only
  // PCR is at the verifying clinic itself).
  const filteredGrantorIds = args.grantorClinicIds.filter(
    (id) => id !== args.granteeClinicId
  )

  if (filteredGrantorIds.length === 0) {
    return { shares: [], errors: [] }
  }

  const admin = createAdminClient('create-shares-for-grantors')
  const { data, error } = await (admin as any).rpc('create_shares_for_grantors', {
    p_global_patient_id: args.globalPatientId,
    p_grantor_clinic_ids: filteredGrantorIds,
    p_grantee_clinic_id: args.granteeClinicId,
    p_granted_via: args.grantedVia,
    p_actor_user_id: args.actorUserId,
    p_actor_kind: args.actorKind,
    p_grant_reason: args.grantReason ?? null,
  })

  if (error) {
    // Entire batch failed — atomic rollback already committed in DB.
    // No partial state can leak. Caller decides whether to retry.
    return {
      shares: [],
      errors: [
        {
          scope: 'all',
          message: (error as { message?: string }).message ?? 'unknown',
        },
      ],
    }
  }

  // The RPC returns a SETOF (share_id, audit_event_id, grantor_clinic_id,
  // expires_at, idempotent_hit). Map to the CreateShareResult shape
  // callers already expect. Fields the inner create_data_share returned
  // but the wrapper omits (granted_at, granted_via, grantee_clinic_id)
  // are reconstructed from the call args.
  const rows = (data ?? []) as Array<{
    share_id: string
    audit_event_id: string | null
    grantor_clinic_id: string
    expires_at: string | null
    idempotent_hit: boolean
  }>

  const shares: CreateShareResult[] = rows.map((row) => ({
    created: !row.idempotent_hit,
    idempotent_hit: row.idempotent_hit,
    share_id: row.share_id,
    audit_event_id: row.audit_event_id,
    global_patient_id: args.globalPatientId,
    grantor_clinic_id: row.grantor_clinic_id,
    grantee_clinic_id: args.granteeClinicId,
    granted_at: new Date().toISOString(),  // approximate — DB row has authoritative ts
    expires_at: row.expires_at,
    granted_via: args.grantedVia,
  }))

  return { shares, errors: [] }
}

// ──────────────────────────────────────────────────────────────────────
// 2. extendShare — patient-initiated extension
// ──────────────────────────────────────────────────────────────────────

export async function extendShare(args: {
  shareId: string
  duration: ExtendDuration
  /** The patient (always — only patients extend their own shares). */
  actorUserId: string
}): Promise<ExtendShareResult> {
  const admin = createAdminClient('patient-shares-extend')
  const { data, error } = await (admin as any).rpc('extend_data_share', {
    p_share_id: args.shareId,
    p_duration: args.duration,
    p_actor_user_id: args.actorUserId,
  })
  if (error) {
    throw new Error(`extendShare failed: ${(error as { message?: string }).message ?? 'unknown'}`)
  }
  return data as ExtendShareResult
}

// ──────────────────────────────────────────────────────────────────────
// 3. revokeShare — patient or system revoke
// ──────────────────────────────────────────────────────────────────────

export async function revokeShare(args: {
  shareId: string
  revokedByActorKind: 'user' | 'system'
  /** The patient if user; NULL if system. */
  actorUserId: string | null
  revokeReason?: string | null
}): Promise<RevokeShareResult> {
  const admin = createAdminClient('patient-shares-revoke')
  const { data, error } = await (admin as any).rpc('revoke_data_share', {
    p_share_id: args.shareId,
    p_actor_user_id: args.actorUserId,
    p_actor_kind: args.revokedByActorKind,
    p_revoke_reason: args.revokeReason ?? null,
  })
  if (error) {
    throw new Error(`revokeShare failed: ${(error as { message?: string }).message ?? 'unknown'}`)
  }
  return data as RevokeShareResult
}

// ──────────────────────────────────────────────────────────────────────
// 4. autoRenewOnVisit — encounter-triggered renewal (best-effort)
// ──────────────────────────────────────────────────────────────────────

/**
 * Extends every active, non-permanent share for (grantee_clinic_id, gpid)
 * to NOW+90d. Per Build 05 § B7, callers wrap this in try/catch — auto-
 * renewal failure should NOT roll back an encounter.
 *
 * This is the ONLY share-lifecycle entry point where audit failure is
 * allowed to be non-fatal at the call site. The function itself still
 * uses transactional semantics inside the DB (audit + share update
 * atomic per share). What's relaxed is whether the caller propagates
 * the error.
 */
export async function autoRenewOnVisit(args: {
  globalPatientId: string
  granteeClinicId: string
  encounterId?: string | null
}): Promise<AutoRenewResult> {
  const admin = createAdminClient('patient-shares-auto-renew')
  const { data, error } = await (admin as any).rpc('auto_renew_shares_on_visit', {
    p_global_patient_id: args.globalPatientId,
    p_grantee_clinic_id: args.granteeClinicId,
    p_encounter_id: args.encounterId ?? null,
  })
  if (error) {
    throw new Error(`autoRenewOnVisit failed: ${(error as { message?: string }).message ?? 'unknown'}`)
  }
  // The RPC returns { renewed_count, share_ids: jsonb_array }. Coerce
  // share_ids from jsonb to JS array.
  const payload = data as { renewed_count: number; share_ids: string[] | null }
  return {
    renewed_count: payload.renewed_count,
    share_ids: payload.share_ids ?? [],
  }
}

// ──────────────────────────────────────────────────────────────────────
// 5. Read helpers — SELECT through admin client (RLS placeholder denies)
// ──────────────────────────────────────────────────────────────────────

/**
 * Returns the most-recent ACTIVE share for the (grantor, grantee, patient)
 * triple, or null if none. "Active" = revoked_at IS NULL AND
 * (expires_at IS NULL OR expires_at > NOW()).
 */
export async function getActiveShare(args: {
  globalPatientId: string
  grantorClinicId: string
  granteeClinicId: string
}): Promise<PatientDataShare | null> {
  const admin = createAdminClient('patient-shares-read')
  const { data, error } = await admin
    .from('patient_data_shares')
    .select('*')
    .eq('global_patient_id', args.globalPatientId)
    .eq('grantor_clinic_id', args.grantorClinicId)
    .eq('grantee_clinic_id', args.granteeClinicId)
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('granted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`getActiveShare failed: ${(error as { message?: string }).message ?? 'unknown'}`)
  }
  return (data as PatientDataShare | null) ?? null
}

/**
 * Returns every share row for the patient, optionally including expired
 * + revoked rows (for the patient app's history view).
 */
export async function listSharesForPatient(args: {
  globalPatientId: string
  includeExpired?: boolean
}): Promise<PatientDataShare[]> {
  const admin = createAdminClient('patient-shares-list-patient')
  let query = admin
    .from('patient_data_shares')
    .select('*')
    .eq('global_patient_id', args.globalPatientId)
    .order('granted_at', { ascending: false })

  if (!args.includeExpired) {
    query = query
      .is('revoked_at', null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`listSharesForPatient failed: ${(error as { message?: string }).message ?? 'unknown'}`)
  }
  return (data as PatientDataShare[]) ?? []
}

/**
 * Returns every active share where this clinic is the grantee — i.e., the
 * shares granting this clinic access to other clinics' patient data.
 */
export async function listSharesForGranteeClinic(args: {
  granteeClinicId: string
}): Promise<PatientDataShare[]> {
  const admin = createAdminClient('patient-shares-list-grantee')
  const { data, error } = await admin
    .from('patient_data_shares')
    .select('*')
    .eq('grantee_clinic_id', args.granteeClinicId)
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('granted_at', { ascending: false })

  if (error) {
    throw new Error(`listSharesForGranteeClinic failed: ${(error as { message?: string }).message ?? 'unknown'}`)
  }
  return (data as PatientDataShare[]) ?? []
}

/**
 * Returns shares whose expiry is in the (lookahead window). Used by the
 * cron expiry-notifications job. Excludes revoked + permanent shares.
 *
 * @param windowHours How many hours of expiring shares to return. Default 24.
 */
export async function listExpiringShares(args: {
  windowHours?: number
}): Promise<PatientDataShare[]> {
  const windowHours = args.windowHours ?? 24
  const now = new Date()
  const windowEnd = new Date(now.getTime() + windowHours * 60 * 60 * 1000)

  const admin = createAdminClient('patient-shares-cron-expiring')
  const { data, error } = await admin
    .from('patient_data_shares')
    .select('*')
    .is('revoked_at', null)
    .not('expires_at', 'is', null)
    .gte('expires_at', now.toISOString())
    .lte('expires_at', windowEnd.toISOString())
    .order('expires_at', { ascending: true })
    .limit(500)  // sane upper bound for one cron run

  if (error) {
    throw new Error(`listExpiringShares failed: ${(error as { message?: string }).message ?? 'unknown'}`)
  }
  return (data as PatientDataShare[]) ?? []
}

/**
 * Marks a SHARE_EXPIRED notification as sent for idempotency. Re-runs of
 * the cron job will skip already-notified shares.
 */
export async function markShareExpiredNotification(args: {
  shareId: string
  cronRunId: string
}): Promise<{ changed: boolean; reason?: string; auditEventId?: string }> {
  const admin = createAdminClient('patient-shares-mark-notified')
  const { data, error } = await (admin as any).rpc('mark_share_expired_notification', {
    p_share_id: args.shareId,
    p_cron_run_id: args.cronRunId,
  })
  if (error) {
    throw new Error(`markShareExpiredNotification failed: ${(error as { message?: string }).message ?? 'unknown'}`)
  }
  const payload = data as { changed: boolean; reason?: string; audit_event_id?: string }
  return {
    changed: payload.changed,
    reason: payload.reason,
    auditEventId: payload.audit_event_id,
  }
}
