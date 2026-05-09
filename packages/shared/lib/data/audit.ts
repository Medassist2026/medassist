/**
 * Audit event logging for medical-grade compliance
 */

export type AuditAction =
  | 'VIEW_PATIENT'
  | 'EDIT_PATIENT'
  | 'CREATE_PATIENT'
  | 'VIEW_CLINICAL_NOTE'
  | 'CREATE_CLINICAL_NOTE'
  | 'VIEW_PRESCRIPTION'
  | 'PRINT_PRESCRIPTION'
  | 'CREATE_APPOINTMENT'
  | 'VIEW_LAB_RESULTS'
  | 'CREATE_LAB_ORDER'
  | 'SHARE_PATIENT'
  | 'REVOKE_SHARE'
  | 'TRANSFER_PATIENT'
  | 'VIEW_VITALS'
  | 'CREATE_VITALS'
  | 'LOGIN'
  | 'LOGOUT'
  | 'EXPORT_DATA'
  // ── Phone-change flow (Phase A: only CHANGE_PHONE_COMMITTED is wired today;
  //    the other six are reserved for Phase B's /api/auth/change-phone/* endpoints
  //    + /api/clinic/phone-change-requests/* + /api/frontdesk/patients/:id/phone-correction.
  //    Defined here in Phase A so that Phase B PRs only touch the wiring, not the type.
  //    See docs/PHONE_CHANGE_PLAN.md §2.7 / §5.8.) ─────────────────────────────────
  | 'CHANGE_PHONE_REQUESTED'
  | 'CHANGE_PHONE_COMMITTED'
  | 'CHANGE_PHONE_CANCELLED'
  | 'CHANGE_PHONE_FALLBACK_OPENED'
  | 'CHANGE_PHONE_FALLBACK_APPROVED'
  | 'CHANGE_PHONE_FALLBACK_REJECTED'
  | 'CORRECT_PATIENT_PHONE'
  // ── Patient identity v2 / global_patients (mig 071-073, Build prompt 02) ─────
  //    PATIENT_DEDUP_FLAGGED — written by mig 073 for every loser row in a dedup
  //    cluster (i.e., rows where is_canonical = FALSE AND duplicate_of_patient_id
  //    IS NOT NULL). Source row carries the cluster's normalized_phone, the
  //    winner_patient_id, and the source = 'migration_073' marker.
  //
  //    GLOBAL_PATIENT_CREATED — written by mig 073 for every backfilled
  //    global_patients row (one per canonical patient). Source row carries
  //    source = 'migration_073_backfill'.
  //
  //    Going-forward rule: every BUILD prompt that emits a new audit action
  //    must update this enum in the same prompt — see Build 02 follow-up
  //    results § 7 (hand-off notes).
  | 'PATIENT_DEDUP_FLAGGED'
  | 'GLOBAL_PATIENT_CREATED'
  // ── Patient identity v2 / Build prompt 03 (mig 073.5 - 077) ─────────────────
  //    PATIENT_CLINIC_RECORD_CREATED — written by mig 074 for every backfilled
  //    patient_clinic_records row (one per (global_patient_id, clinic_id) pair).
  //    Source row carries source = 'migration_074_backfill'.
  //
  //    QUARANTINE_RESOLVED_PATH_A — mig 075. Phone correction landed on the
  //    source row; quarantine row removed and re-normalized.
  //
  //    QUARANTINE_RESOLVED_PATH_B — mig 075. Phone is unrecoverable; sentinel
  //    global_patients row created with normalized_phone=NULL,
  //    account_status='locked', legacy_phone preserved.
  //
  //    USER_DEDUP_FLAGGED — mig 075.7 for every loser user in a dedup cluster
  //    (is_canonical=FALSE, duplicate_of_user_id pointing at winner). Mirrors
  //    PATIENT_DEDUP_FLAGGED on the user side.
  //
  //    USER_DEDUP_CROSS_SIDE_MISMATCH — mig 075.7 if patient-side and
  //    user-side dedup chose different winners for the same normalized_phone.
  //    Surfaces to Mo for review; not auto-resolved.
  //
  //    USER_DEDUP_LARGE_CLUSTER_AUTO_RESOLVED — mig 075.5/075.7 for any cluster
  //    of size 3+ that the auto-rule (oldest wins) decided without manual
  //    review. Per Build 03 deviation from spec — see Build 03 results § 6.
  //
  //    DATA_LAYER_CUTOVER_COMPLETE — telemetry marker emitted once when the
  //    data-layer cutover (B11) finishes. Closes ORPH-V2-08.
  | 'PATIENT_CLINIC_RECORD_CREATED'
  | 'QUARANTINE_RESOLVED_PATH_A'
  | 'QUARANTINE_RESOLVED_PATH_B'
  | 'USER_DEDUP_FLAGGED'
  | 'USER_DEDUP_CROSS_SIDE_MISMATCH'
  | 'USER_DEDUP_LARGE_CLUSTER_AUTO_RESOLVED'
  | 'DATA_LAYER_CUTOVER_COMPLETE'
  // ── Patient identity v2 / Build prompt 04 (mig 082-087) ─────────────────────
  //    R1 sweep (mig 082) — recover Build 03 +200xxxxxxxxxxx user phones:
  //      QUARANTINE_RECOVERED — leading-zero stripped, normalized successfully,
  //        new global_patients row created.
  //      RECOVERY_FAILED — leading-zero strip didn't yield a normalize-able
  //        E.164 (still NULL). User row left as-is for manual review
  //        (ORPH-V4-04). Source row carries source = 'migration_082'.
  //      RECOVERY_COLLIDED — corrected phone matched an existing
  //        global_patients row; user attached to existing identity as a
  //        non-canonical link. Source row carries the matched
  //        global_patient_id in metadata.matched_gp_id.
  //
  //    Privacy code lifecycle (mig 085 + 087):
  //      PRIVACY_CODE_REGENERATED — patient or service-role minted/regenerated
  //        a code. Patient-initiated calls carry actor_kind='user'; lazy mint
  //        from claim flow carries actor_kind='system'.
  //      PRIVACY_CODE_ATTEMPT_SUCCESS / _FAILURE — every verify_privacy_code
  //        call writes one of these (in addition to the privacy_code_attempts
  //        row). _SUCCESS payload carries the global_patient_id and the
  //        attempting clinic_id; _FAILURE carries result reason
  //        ('failure'|'rate_limited'|'locked_out'|'code_revoked').
  //      PRIVACY_CODE_LOCKED — emitted when per-code attempts_count >= 5
  //        and locked_until is set to NOW + 24h. Triggers patient SMS via
  //        the sender wrapper (the SECURITY DEFINER function does NOT
  //        inline-send; it sets a flag the TS layer reads).
  //
  //    SMS share flow (mig 086 + 087):
  //      SMS_CONSENT_SENT — emitted by initiate_sms_share when a 4-digit
  //        token is minted and SMS dispatch is queued. metadata.requesting_
  //        clinic_id + .requesting_doctor_id name the responsible parties.
  //      SMS_CODE_VERIFIED — successful verify_sms_code; payload carries
  //        global_patient_id and clinic_id.
  //      SMS_CODE_FAILED — failed verify (wrong code, expired, already used,
  //        or rate-limited).
  //
  //    Messaging re-consent (mig 083 grace view):
  //      MESSAGING_CONSENT_RECONFIRMED — patient affirmed the legacy
  //        per-doctor messaging consent at this clinic via the re-consent
  //        prompt. Writes consent_to_messaging=TRUE on the matching PCR
  //        row in the same transaction.
  //      MESSAGING_CONSENT_REVOKED — patient declined; PCR row retains
  //        consent_to_messaging=FALSE. After 90-day grace, the legacy row
  //        no longer counts via effective_messaging_consent.
  //
  //    Going-forward rule: any new audit action emitted by mig 082-087 MUST
  //    be in this enum before its migration runs (Build 02 follow-up rule).
  | 'QUARANTINE_RECOVERED'
  | 'RECOVERY_FAILED'
  | 'RECOVERY_COLLIDED'
  | 'PRIVACY_CODE_REGENERATED'
  | 'PRIVACY_CODE_ATTEMPT_SUCCESS'
  | 'PRIVACY_CODE_ATTEMPT_FAILURE'
  | 'PRIVACY_CODE_LOCKED'
  | 'SMS_CONSENT_SENT'
  | 'SMS_CODE_VERIFIED'
  | 'SMS_CODE_FAILED'
  | 'MESSAGING_CONSENT_RECONFIRMED'
  | 'MESSAGING_CONSENT_REVOKED'
  // ── Patient identity v2 / Build prompt 04 D7 — auth.users.phone hygiene ─────
  //    AUTH_PHONE_NORMALIZED — written by mig 089 for every user whose
  //    auth.users.phone was rewritten to match the normalized
  //    public.users.phone (minus the leading '+'). Source row carries
  //    metadata.source = 'migration_089', metadata.migration = '089',
  //    metadata.before_phone (the buggy auth.phone — typically '2001…'),
  //    metadata.after_phone (the new, correct auth.phone — '201…'),
  //    metadata.original_phone_confirmed_at (timestamp of the prior
  //    confirmation, lost when we re-confirm the corrected number with
  //    NOW()), and metadata.identity_updated + metadata.before_identity_phone
  //    if auth.identities.identity_data->>'phone' was also rewritten.
  //
  //    Scope is the 29 R1 sweep "happy path" rows — users whose
  //    public.users.phone is already a valid E.164. The 1 RECOVERY_FAILED
  //    user (public.normalized_phone IS NULL) is intentionally excluded;
  //    they remain under ORPH-V4-04 manual phone correction.
  | 'AUTH_PHONE_NORMALIZED'
  // ── Patient identity v2 / Build prompt 05 (mig 090) ────────────────────────
  //    patient_data_shares lifecycle. Every action is written by a
  //    SECURITY DEFINER function in mig 090 in the SAME transaction as
  //    the patient_data_shares INSERT/UPDATE — failure of either rolls
  //    back the whole operation. The share row's audit_event_id FK
  //    enforces the linkage at the schema level.
  //
  //    These actions are DELIBERATELY DISTINCT from the legacy
  //    SHARE_PATIENT / REVOKE_SHARE actions, which were written against
  //    `patient_visibility` (intra-clinic doctor-scoped owner grants,
  //    different semantics). The two action namespaces should never be
  //    conflated in queries or analytics.
  //
  //    SHARE_GRANTED metadata: { share_id, grantor_clinic_id,
  //                              grantee_clinic_id, expires_at,
  //                              granted_via, grant_reason? }
  //      actor_kind = 'user' for clinic-staff-driven grants
  //                   (verify_privacy_code / verify_sms_code success);
  //      actor_kind = 'system' for AUTO_RENEW (encounter-driven extend
  //                   that creates a fresh share row, currently NOT
  //                   used — autoRenewOnVisit extends existing shares
  //                   rather than minting new ones; reserved for future).
  //
  //    SHARE_EXTENDED metadata: { share_id, previous_expires_at,
  //                               new_expires_at, duration }
  //      actor_kind = 'user' (the patient extending from the patient app).
  //
  //    SHARE_REVOKED metadata: { share_id, revoked_by_actor_kind,
  //                              revoke_reason? }
  //      actor_kind = 'user' for patient-initiated revokes;
  //      actor_kind = 'system' for cron / admin revokes (rare).
  //
  //    SHARE_AUTO_RENEWED metadata: { share_id, previous_expires_at,
  //                                   new_expires_at, encounter_id?,
  //                                   trigger: 'visit' }
  //      actor_kind = 'system' (encounter-triggered, no acting user).
  //      One audit row per share renewed; if a patient has 3 grantor
  //      clinics sharing with the visiting clinic, a single visit
  //      writes 3 SHARE_AUTO_RENEWED rows.
  //
  //    SHARE_EXPIRED metadata: { share_id, expired_at, notified: bool,
  //                              cron_run_id? }
  //      actor_kind = 'system' (cron-initiated). Notification idempotency
  //      uses metadata.notified flag — cron re-runs skip already-notified
  //      shares.
  //
  //    Going-forward rule (Build 02 follow-up): every BUILD prompt that
  //    emits a new audit action must update this enum in the same prompt.
  //    Build 05 lands these enum entries in the same patch as mig 090.
  | 'SHARE_GRANTED'
  | 'SHARE_EXTENDED'
  | 'SHARE_REVOKED'
  | 'SHARE_AUTO_RENEWED'
  | 'SHARE_EXPIRED'
  // ── Dependent accounts (B07 Phase B/C — Pattern A child linkage) ────────
  //    GUARDIAN_LINK_CREATED — emitted when a parent registers a child
  //      (createMinorGlobalPatient). actor=parent (or staff acting on parent's
  //      behalf via clinic onboarding); subject=child gp. metadata carries
  //      guardian_global_patient_id (parent gp), child_global_patient_id (child
  //      gp, also = entity_id), and acting_as='guardian_of_minor'.
  //
  //    GUARDIAN_LINK_TRANSFERRED — emitted when guardianship is transferred
  //      (transferGuardianship). Custody-dispute mechanism is Phase 2 per Mo
  //      ruling 5; no UX call invokes this in MVP, but the data layer ships
  //      forward-compatible. metadata carries previous_guardian_id and
  //      new_guardian_id alongside global_patient_id (the child).
  //
  //    BACKFILL_DEPENDENT_GUARDIAN_RECONSTRUCTION — written by mig 111 only
  //      (one-off backfill). Reserved here for completeness; production code
  //      paths do NOT emit this action.
  | 'GUARDIAN_LINK_CREATED'
  | 'GUARDIAN_LINK_TRANSFERRED'
  | 'BACKFILL_DEPENDENT_GUARDIAN_RECONSTRUCTION'
  // ── Patient delegations (B07 Phase B/C — Pattern B adult delegation) ────
  //    Two-step grant flow per architectural review §5.3: principal grants
  //    (DELEGATION_GRANTED, accepted_at IS NULL); delegate accepts
  //    (DELEGATION_ACCEPTED, sets accepted_at). A grant is INACTIVE until
  //    accepted — `is_authorized_actor_on()` requires accepted_at IS NOT NULL.
  //
  //    DELEGATION_GRANTED — actor=principal (granted_by_user_id), subject=
  //      principal gp. metadata: delegation_id, delegate_user_id, capabilities,
  //      expires_at, auto_renew. acting_as='self' (principal acts on own gp).
  //
  //    DELEGATION_ACCEPTED — actor=delegate, subject=principal gp. metadata:
  //      delegation_id, principal_global_patient_id, capabilities. acting_as=
  //      'delegated_by_principal' (the delegate is exercising the very
  //      delegation grant they're accepting).
  //
  //    DELEGATION_REVOKED — actor=principal, subject=principal gp. metadata:
  //      delegation_id, delegate_user_id, reason?, acting_as='self'.
  //
  //    DELEGATION_WITHDRAWN — actor=delegate (delegate_user_id), subject=
  //      principal gp. metadata: delegation_id, principal_global_patient_id,
  //      reason?, acting_as='delegated_by_principal'.
  //
  //    DELEGATION_CAPABILITIES_UPDATED — actor=principal (only the principal
  //      may change capabilities). metadata: delegation_id,
  //      previous_capabilities, new_capabilities, acting_as='self'.
  //
  //    DELEGATION_EXPIRED — actor=system (cron-driven), subject=principal gp.
  //      metadata: delegation_id, expires_at, cron_run_id?. actor_kind=
  //      'system' so actor_user_id IS NULL (audit_events_actor_consistency
  //      CHECK from mig 073.5).
  | 'DELEGATION_GRANTED'
  | 'DELEGATION_ACCEPTED'
  | 'DELEGATION_REVOKED'
  | 'DELEGATION_WITHDRAWN'
  | 'DELEGATION_CAPABILITIES_UPDATED'
  | 'DELEGATION_EXPIRED'

/**
 * actor_kind — added by mig 073.5 (Build 03 Phase 0). Distinguishes audit
 * rows written by application code ('user'), server-side automation
 * ('system'), and one-off migrations ('migration'). The audit_events
 * CHECK constraint enforces actor_user_id IS NOT NULL iff actor_kind='user'.
 */
export type ActorKind = 'user' | 'system' | 'migration'

/**
 * Authority basis — captured on every audit row that records an action on
 * a global_patient subject when the actor is NOT acting purely on their own
 * records. Mirrors the three branches of `is_authorized_actor_on()`
 * (mig 113, B07 Phase D):
 *
 *   - 'self' — actor's auth.uid() equals subject gp's claimed_user_id. The
 *     default for adult patients acting on their own records.
 *   - 'guardian_of_minor' — actor claims a parent gp whose
 *     guardian_global_patient_id matches the (minor) subject. Pattern A.
 *   - 'delegated_by_principal' — actor is named delegate on an active
 *     patient_delegations row whose principal is the subject. Pattern B.
 *
 * Stored as `metadata.acting_as` on the audit_events row. Phase E API
 * handlers populate it via the helper below. Existing callers of
 * `logAuditEvent` are unchanged — the new keys are additive in jsonb.
 */
export type AuthorityBasis =
  | 'self'
  | 'guardian_of_minor'
  | 'delegated_by_principal'

export interface AuditEventParams {
  clinicId?: string
  /**
   * Required when actorKind='user' (the default). Must be NULL when
   * actorKind is 'system' or 'migration' — enforced by the
   * audit_events_actor_consistency CHECK added in mig 073.5.
   */
  actorUserId: string | null
  actorKind?: ActorKind
  action: AuditAction
  entityType: string
  entityId?: string
  metadata?: Record<string, any>
}

export async function logAuditEvent(params: AuditEventParams) {
  try {
    const { createAdminClient } = await import('@shared/lib/supabase/admin')
    const supabase = createAdminClient('audit-logging')

    const actorKind: ActorKind = params.actorKind ?? 'user'

    // Belt-and-suspenders: surface the CHECK violation early instead of
    // letting Postgres reject it. Keeps the failure mode obvious in tests.
    if (actorKind === 'user' && !params.actorUserId) {
      console.error(
        'Audit log: actor_kind=user requires actorUserId; refusing insert'
      )
      return
    }
    if (actorKind !== 'user' && params.actorUserId) {
      console.error(
        `Audit log: actor_kind=${actorKind} forbids actorUserId; refusing insert`
      )
      return
    }

    await supabase.from('audit_events').insert({
      clinic_id: params.clinicId || null,
      actor_user_id: params.actorUserId,
      actor_kind: actorKind,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      metadata: params.metadata || {},
    })
  } catch (error) {
    // Audit logging should never break the app
    console.error('Audit log failed:', error)
  }
}

/**
 * Authority-aware audit emission helper (B07 Phase C).
 *
 * Wraps `logAuditEvent` and stitches in the `metadata.acting_as` and
 * `metadata.authority_grant_id` keys per architectural review §3.2. Use this
 * for any audit row whose subject is a global_patient and whose actor's
 * authority over that subject was resolved via `is_authorized_actor_on()`
 * (or any of its three branches: self / guardian-link / active delegation).
 *
 * The helper also auto-fills `metadata.global_patient_id` with the supplied
 * subjectGlobalPatientId — the audit_events GENERATED column
 * `resolved_global_patient_id` derives from this key (per mig 074-era schema
 * and confirmed empirically in B07 Phase B Decision 10), so any caller-
 * supplied `metadata.global_patient_id` is preserved if present and used
 * here only as a default.
 *
 * `authorityGrantId` is the patient_delegations.id of the grant the actor
 * invoked, when authorityBasis is 'delegated_by_principal'. NULL/undefined
 * for 'self' and 'guardian_of_minor' — both are passed through to jsonb
 * unset.
 *
 * Existing `logAuditEvent` callers continue to work without modification.
 * This helper is additive.
 */
export interface PatientAuditWithAuthorityParams {
  /**
   * The global_patients.id the action is about. Used to populate
   * metadata.global_patient_id (and therefore the GENERATED
   * resolved_global_patient_id).
   */
  subjectGlobalPatientId: string
  /**
   * The clinic context for the audit row. Optional — many patient-app
   * actions are clinic-agnostic (e.g., DELEGATION_GRANTED).
   */
  clinicId?: string
  /**
   * Acting user. Required when actorKind='user' (the default).
   */
  actorUserId: string | null
  actorKind?: ActorKind
  action: AuditAction
  entityType: string
  entityId?: string
  /**
   * The authority basis under which the actor took this action. Stored on
   * the audit row as metadata.acting_as. NULL/undefined means the helper
   * does not stitch the key — callers should provide it for any row
   * recording an action on a global_patient subject.
   */
  authorityBasis?: AuthorityBasis
  /**
   * patient_delegations.id of the grant invoked. Stored as
   * metadata.authority_grant_id. Set ONLY when authorityBasis is
   * 'delegated_by_principal'.
   */
  authorityGrantId?: string | null
  /**
   * Additional metadata. Caller-supplied keys win over the helper's
   * defaults — passing { global_patient_id: <other-uuid> } overrides
   * subjectGlobalPatientId for the resolved column derivation.
   */
  metadata?: Record<string, any>
}

export async function emitPatientAuditWithAuthority(
  params: PatientAuditWithAuthorityParams
): Promise<void> {
  const stitchedMetadata: Record<string, any> = {
    global_patient_id: params.subjectGlobalPatientId,
    ...(params.metadata ?? {}),
  }

  if (params.authorityBasis !== undefined) {
    stitchedMetadata.acting_as = params.authorityBasis
  }
  if (
    params.authorityGrantId !== undefined &&
    params.authorityGrantId !== null
  ) {
    stitchedMetadata.authority_grant_id = params.authorityGrantId
  }

  await logAuditEvent({
    clinicId: params.clinicId,
    actorUserId: params.actorUserId,
    actorKind: params.actorKind,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    metadata: stitchedMetadata,
  })
}

export async function getAuditLog(
  clinicId: string,
  options?: {
    action?: string
    entityType?: string
    limit?: number
    offset?: number
  }
) {
  const { createAdminClient } = await import('@shared/lib/supabase/admin')
  const supabase = createAdminClient('audit-read')

  let query = supabase
    .from('audit_events')
    .select('*, users!audit_events_actor_user_id_fkey(phone, email)')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })

  if (options?.action) query = query.eq('action', options.action)
  if (options?.entityType) query = query.eq('entity_type', options.entityType)
  if (options?.limit) query = query.limit(options.limit)
  if (options?.offset)
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1)

  const { data, error } = await query
  return { data: data || [], error }
}
