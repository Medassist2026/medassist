-- ============================================================================
-- Migration 090 — patient_data_shares table + lifecycle functions
--
-- Build prompt 05 § B1.
-- Per audits/patient-identity-schema-spec.md § 4.
-- Per audits/EXECUTION_PROMPTS.md Prompt 5 § B1.
--
-- Closes ORPH-V4-05 (share creation deferred from Build 04 verify handlers).
--
-- DESIGN NOTES (architectural)
--   1. Directional consent: a row represents grantor_clinic_id GRANTING
--      grantee_clinic_id permission to view this patient's records.
--      grantor != grantee (CHECK constraint). Patient at clinics A+B+C,
--      arriving at clinic D with a privacy code, produces THREE rows
--      (A→D, B→D, C→D) so a later revocation of A→D doesn't tear down
--      B→D or C→D. See Build 05 results § 3 (multi-grantor decision).
--
--   2. Active = revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()).
--      Multiple historical rows per (grantor, grantee, patient) triple are
--      normal (revoke + re-grant). NO uniqueness constraint on the active
--      triple — query active shares with the WHERE clause above.
--
--   3. Atomicity: every share-lifecycle write goes through a SECURITY DEFINER
--      function defined in this migration. Each function writes the
--      audit_events row FIRST (RETURNING id), then writes/updates the
--      patient_data_shares row referencing audit_event_id. A failure on
--      either rolls back the whole transaction.
--
--   4. RLS DENY-ALL placeholder. Real policies (clinic-self via membership,
--      patient-self via global_patients.claimed_user_id, plus the active-
--      share bridge for cross-clinic) ship in Prompt 6 (ORPH-V5-01).
--
--   5. Default expiry: 90 days from NOW() unless a specific expiry is
--      passed. The expiry can be NULL (permanent) when the patient extends
--      to PERMANENT in the patient app.
--
-- AUDIT ACTIONS (added to AuditAction TS enum BEFORE this migration ran)
--   SHARE_GRANTED, SHARE_EXTENDED, SHARE_REVOKED, SHARE_AUTO_RENEWED,
--   SHARE_EXPIRED. See packages/shared/lib/data/audit.ts comment block.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table — patient_data_shares
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.patient_data_shares (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_patient_id  UUID NOT NULL REFERENCES public.global_patients(id),
  grantor_clinic_id  UUID NOT NULL REFERENCES public.clinics(id),
  grantee_clinic_id  UUID NOT NULL REFERENCES public.clinics(id),
  granted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at         TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  granted_via        TEXT NOT NULL,
  grant_reason       TEXT,
  audit_event_id     UUID REFERENCES public.audit_events(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT patient_data_shares_grantor_grantee_distinct
    CHECK (grantor_clinic_id != grantee_clinic_id),

  CONSTRAINT patient_data_shares_granted_via_check
    CHECK (granted_via IN ('PRIVACY_CODE', 'SMS_CODE', 'PATIENT_APP', 'AUTO_RENEW'))
);

COMMENT ON TABLE public.patient_data_shares IS
  'Per audits/patient-identity-schema-spec.md § 4 + locked decision 2026-04-26: '
  'directional cross-clinic data-share grants. '
  'Active = WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()). '
  'Multiple historical rows per (grantor, grantee, patient) are expected and intentional. '
  'See Build 05 results § 3 for the multi-grantor design decision.';

COMMENT ON COLUMN public.patient_data_shares.expires_at IS
  'NULL = permanent share (patient explicitly extended to PERMANENT). '
  'Otherwise the share is active until this timestamp.';

COMMENT ON COLUMN public.patient_data_shares.revoked_at IS
  'NULL = active. Set to NOW() when the patient or system revokes the share. '
  'Once set, the share is permanently revoked — re-granting writes a new row.';

COMMENT ON COLUMN public.patient_data_shares.granted_via IS
  'How the share was created: '
  'PRIVACY_CODE = clinic verified the patient''s 6-char code; '
  'SMS_CODE = clinic verified a 4-digit SMS token; '
  'PATIENT_APP = patient granted directly from the patient app; '
  'AUTO_RENEW = encounter-triggered renewal (NOT currently used — '
  'autoRenewOnVisit extends existing rows rather than minting; reserved).';

COMMENT ON COLUMN public.patient_data_shares.audit_event_id IS
  'FK to audit_events.id for the SHARE_GRANTED row written when this share '
  'was created. Nullable (a) because audit_events.id columns can be set NULL '
  'by audit_events.actor_user_id ON DELETE SET NULL cascade behavior, and '
  '(b) because pre-this-migration shares (none today) wouldn''t have one. '
  'Going forward, every newly-created share has a non-NULL audit_event_id.';

-- ----------------------------------------------------------------------------
-- 2. Indices
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_pds_global_patient
  ON public.patient_data_shares(global_patient_id);

-- Hot path: clinic asks "what active shares grant me access?"
CREATE INDEX IF NOT EXISTS idx_pds_grantee_clinic_active
  ON public.patient_data_shares(grantee_clinic_id, expires_at)
  WHERE revoked_at IS NULL;

-- Hot path: clinic asks "what shares did I grant?"
CREATE INDEX IF NOT EXISTS idx_pds_grantor_clinic_active
  ON public.patient_data_shares(grantor_clinic_id, expires_at)
  WHERE revoked_at IS NULL;

-- Cron sweep: find expiring shares for notification
CREATE INDEX IF NOT EXISTS idx_pds_expires
  ON public.patient_data_shares(expires_at)
  WHERE revoked_at IS NULL AND expires_at IS NOT NULL;

-- Patient app: list all shares for a patient
CREATE INDEX IF NOT EXISTS idx_pds_global_patient_active
  ON public.patient_data_shares(global_patient_id, granted_at DESC)
  WHERE revoked_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. updated_at trigger (reuse public.touch_updated_at from mig 013)
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS tg_patient_data_shares_touch_updated_at
  ON public.patient_data_shares;

CREATE TRIGGER tg_patient_data_shares_touch_updated_at
  BEFORE UPDATE ON public.patient_data_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4. RLS DENY-ALL placeholder (Prompt 6 will replace with real policies)
-- ----------------------------------------------------------------------------

ALTER TABLE public.patient_data_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_data_shares_no_select ON public.patient_data_shares;
DROP POLICY IF EXISTS patient_data_shares_no_insert ON public.patient_data_shares;
DROP POLICY IF EXISTS patient_data_shares_no_update ON public.patient_data_shares;
DROP POLICY IF EXISTS patient_data_shares_no_delete ON public.patient_data_shares;

CREATE POLICY patient_data_shares_no_select ON public.patient_data_shares
  FOR SELECT USING (false);
CREATE POLICY patient_data_shares_no_insert ON public.patient_data_shares
  FOR INSERT WITH CHECK (false);
CREATE POLICY patient_data_shares_no_update ON public.patient_data_shares
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY patient_data_shares_no_delete ON public.patient_data_shares
  FOR DELETE USING (false);

-- ============================================================================
-- 5. SECURITY DEFINER lifecycle functions
--
-- All functions follow the mig 087 pattern:
--   - SECURITY DEFINER, SET search_path explicit
--   - Audit row INSERT FIRST (RETURNING id), then share row write
--   - Single transaction; failure of either rolls back the whole op
--   - Returns JSONB so callers (TS layer) can dispatch on shape
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 5a. create_data_share — used by verify-privacy-code, verify-sms-code,
--                         and patient-app direct grants
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_data_share(
  p_global_patient_id UUID,
  p_grantor_clinic_id UUID,
  p_grantee_clinic_id UUID,
  p_granted_via       TEXT,
  p_grant_reason      TEXT,
  p_actor_user_id     UUID,
  p_actor_kind        TEXT,
  p_default_expiry_days INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_audit_id  UUID;
  v_share_id  UUID;
  v_expires   TIMESTAMPTZ;
  v_existing  patient_data_shares%ROWTYPE;
BEGIN
  -- Argument validation
  IF p_global_patient_id IS NULL OR p_grantor_clinic_id IS NULL
     OR p_grantee_clinic_id IS NULL OR p_granted_via IS NULL THEN
    RAISE EXCEPTION 'create_data_share: required arg is NULL';
  END IF;
  IF p_grantor_clinic_id = p_grantee_clinic_id THEN
    RAISE EXCEPTION 'create_data_share: grantor and grantee must differ';
  END IF;
  IF p_granted_via NOT IN ('PRIVACY_CODE','SMS_CODE','PATIENT_APP','AUTO_RENEW') THEN
    RAISE EXCEPTION 'create_data_share: invalid granted_via %', p_granted_via;
  END IF;
  IF p_actor_kind NOT IN ('user','system','migration') THEN
    RAISE EXCEPTION 'create_data_share: invalid actor_kind %', p_actor_kind;
  END IF;
  IF p_actor_kind = 'user' AND p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'create_data_share: actor_kind=user requires actor_user_id';
  END IF;
  IF p_actor_kind <> 'user' AND p_actor_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'create_data_share: actor_kind=% forbids actor_user_id', p_actor_kind;
  END IF;

  -- Idempotency: if an active share already exists for this triple,
  -- return it without writing a new row. This prevents duplicate
  -- shares from a doubled-up verify call.
  SELECT * INTO v_existing
    FROM public.patient_data_shares
   WHERE global_patient_id = p_global_patient_id
     AND grantor_clinic_id  = p_grantor_clinic_id
     AND grantee_clinic_id  = p_grantee_clinic_id
     AND revoked_at IS NULL
     AND (expires_at IS NULL OR expires_at > NOW())
   ORDER BY granted_at DESC
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'created',          false,
      'idempotent_hit',   true,
      'share_id',         v_existing.id,
      'audit_event_id',   v_existing.audit_event_id,
      'global_patient_id', v_existing.global_patient_id,
      'grantor_clinic_id', v_existing.grantor_clinic_id,
      'grantee_clinic_id', v_existing.grantee_clinic_id,
      'granted_at',       v_existing.granted_at,
      'expires_at',       v_existing.expires_at,
      'granted_via',      v_existing.granted_via
    );
  END IF;

  -- Compute expiry — NULL means permanent (only via PATIENT_APP path
  -- when patient explicitly chose PERMANENT; create_data_share itself
  -- always uses default_expiry_days, never NULL on creation).
  v_expires := NOW() + make_interval(days => COALESCE(p_default_expiry_days, 90));

  -- Step 1: write audit_events row first (RETURNING id for FK use).
  INSERT INTO public.audit_events (
    clinic_id,
    actor_user_id,
    actor_kind,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    p_grantee_clinic_id,
    p_actor_user_id,
    p_actor_kind,
    'SHARE_GRANTED',
    'patient_data_share',
    NULL,                  -- entity_id back-filled below once share_id known
    jsonb_build_object(
      'global_patient_id', p_global_patient_id,
      'grantor_clinic_id', p_grantor_clinic_id,
      'grantee_clinic_id', p_grantee_clinic_id,
      'expires_at',        v_expires,
      'granted_via',       p_granted_via,
      'grant_reason',      p_grant_reason
    )
  )
  RETURNING id INTO v_audit_id;

  -- Step 2: write the share row referencing audit_event_id.
  INSERT INTO public.patient_data_shares (
    global_patient_id,
    grantor_clinic_id,
    grantee_clinic_id,
    granted_at,
    expires_at,
    revoked_at,
    granted_via,
    grant_reason,
    audit_event_id
  )
  VALUES (
    p_global_patient_id,
    p_grantor_clinic_id,
    p_grantee_clinic_id,
    NOW(),
    v_expires,
    NULL,
    p_granted_via,
    p_grant_reason,
    v_audit_id
  )
  RETURNING id INTO v_share_id;

  -- Backfill entity_id on the audit row now that share_id is known.
  UPDATE public.audit_events
     SET entity_id = v_share_id,
         metadata  = metadata || jsonb_build_object('share_id', v_share_id)
   WHERE id = v_audit_id;

  RETURN jsonb_build_object(
    'created',          true,
    'idempotent_hit',   false,
    'share_id',         v_share_id,
    'audit_event_id',   v_audit_id,
    'global_patient_id', p_global_patient_id,
    'grantor_clinic_id', p_grantor_clinic_id,
    'grantee_clinic_id', p_grantee_clinic_id,
    'granted_at',       NOW(),
    'expires_at',       v_expires,
    'granted_via',      p_granted_via
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_data_share(
  UUID, UUID, UUID, TEXT, TEXT, UUID, TEXT, INTEGER
) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5b. extend_data_share — patient extends an existing active share
--                         (90 days, 1 year, or PERMANENT)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.extend_data_share(
  p_share_id      UUID,
  p_duration      TEXT,           -- '90_DAYS' | '1_YEAR' | 'PERMANENT'
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_share        patient_data_shares%ROWTYPE;
  v_new_expires  TIMESTAMPTZ;
  v_audit_id     UUID;
BEGIN
  IF p_share_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'extend_data_share: share_id and actor_user_id required';
  END IF;
  IF p_duration NOT IN ('90_DAYS','1_YEAR','PERMANENT') THEN
    RAISE EXCEPTION 'extend_data_share: invalid duration %', p_duration;
  END IF;

  -- Lock the share row for the duration of the txn (concurrency safety).
  SELECT * INTO v_share
    FROM public.patient_data_shares
   WHERE id = p_share_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'extend_data_share: share % not found', p_share_id;
  END IF;
  IF v_share.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'extend_data_share: share % is revoked', p_share_id;
  END IF;

  -- Compute new expiry based on duration. NEVER shorten — if the new
  -- candidate expiry is earlier than the current expires_at, no-op.
  IF p_duration = 'PERMANENT' THEN
    v_new_expires := NULL;
  ELSIF p_duration = '90_DAYS' THEN
    v_new_expires := GREATEST(
      COALESCE(v_share.expires_at, NOW()),  -- if currently NULL (perm), already permanent — no-op below
      NOW() + INTERVAL '90 days'
    );
  ELSE  -- 1_YEAR
    v_new_expires := GREATEST(
      COALESCE(v_share.expires_at, NOW()),
      NOW() + INTERVAL '1 year'
    );
  END IF;

  -- No-op shortcut: already permanent, or new expiry not later than current.
  IF v_share.expires_at IS NULL THEN
    -- Currently permanent. Any extend is a no-op.
    RETURN jsonb_build_object(
      'changed',         false,
      'reason',          'already_permanent',
      'share_id',        v_share.id,
      'expires_at',      NULL,
      'previous_expires_at', NULL
    );
  END IF;

  IF p_duration <> 'PERMANENT' AND v_new_expires <= v_share.expires_at THEN
    RETURN jsonb_build_object(
      'changed',         false,
      'reason',          'would_shorten',
      'share_id',        v_share.id,
      'expires_at',      v_share.expires_at,
      'previous_expires_at', v_share.expires_at
    );
  END IF;

  -- Audit row first.
  INSERT INTO public.audit_events (
    clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
  )
  VALUES (
    v_share.grantee_clinic_id,
    p_actor_user_id,
    'user',
    'SHARE_EXTENDED',
    'patient_data_share',
    v_share.id,
    jsonb_build_object(
      'share_id',             v_share.id,
      'previous_expires_at',  v_share.expires_at,
      'new_expires_at',       v_new_expires,
      'duration',             p_duration
    )
  )
  RETURNING id INTO v_audit_id;

  -- Update share row.
  UPDATE public.patient_data_shares
     SET expires_at = v_new_expires
   WHERE id = p_share_id;

  RETURN jsonb_build_object(
    'changed',           true,
    'share_id',          v_share.id,
    'expires_at',        v_new_expires,
    'previous_expires_at', v_share.expires_at,
    'audit_event_id',    v_audit_id,
    'duration',          p_duration
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.extend_data_share(UUID, TEXT, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5c. revoke_data_share — patient or system revokes a share
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_data_share(
  p_share_id            UUID,
  p_actor_user_id       UUID,
  p_actor_kind          TEXT,    -- 'user' (patient) or 'system' (cron/admin)
  p_revoke_reason       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_share     patient_data_shares%ROWTYPE;
  v_audit_id  UUID;
BEGIN
  IF p_share_id IS NULL THEN
    RAISE EXCEPTION 'revoke_data_share: share_id required';
  END IF;
  IF p_actor_kind NOT IN ('user','system') THEN
    RAISE EXCEPTION 'revoke_data_share: actor_kind must be user or system';
  END IF;
  IF p_actor_kind = 'user' AND p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'revoke_data_share: actor_kind=user requires actor_user_id';
  END IF;
  IF p_actor_kind <> 'user' AND p_actor_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'revoke_data_share: actor_kind=% forbids actor_user_id', p_actor_kind;
  END IF;

  SELECT * INTO v_share
    FROM public.patient_data_shares
   WHERE id = p_share_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'revoke_data_share: share % not found', p_share_id;
  END IF;

  -- Idempotent: already revoked → no-op + return current state.
  IF v_share.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'changed',     false,
      'reason',      'already_revoked',
      'share_id',    v_share.id,
      'revoked_at',  v_share.revoked_at
    );
  END IF;

  INSERT INTO public.audit_events (
    clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
  )
  VALUES (
    v_share.grantee_clinic_id,
    p_actor_user_id,
    p_actor_kind,
    'SHARE_REVOKED',
    'patient_data_share',
    v_share.id,
    jsonb_build_object(
      'share_id',               v_share.id,
      'revoked_by_actor_kind',  p_actor_kind,
      'revoke_reason',          p_revoke_reason,
      'previous_expires_at',    v_share.expires_at,
      'granted_via',            v_share.granted_via
    )
  )
  RETURNING id INTO v_audit_id;

  UPDATE public.patient_data_shares
     SET revoked_at = NOW()
   WHERE id = p_share_id;

  RETURN jsonb_build_object(
    'changed',         true,
    'share_id',        v_share.id,
    'revoked_at',      NOW(),
    'audit_event_id',  v_audit_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_data_share(UUID, UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5d. auto_renew_shares_on_visit — encounter-triggered renewal
--
-- Extends every active, non-permanent share for (global_patient_id,
-- grantee_clinic_id) to MAX(current expires_at, NOW + 90d). Skips:
--   - revoked shares
--   - already-PERMANENT shares (expires_at IS NULL)
--   - shares whose current expiry is already > NOW + 90d
-- Returns a JSONB summary { renewed_count, share_ids[] }.
--
-- actor_kind = 'system' (encounter-triggered, no acting user).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auto_renew_shares_on_visit(
  p_global_patient_id UUID,
  p_grantee_clinic_id UUID,
  p_encounter_id      UUID  -- nullable, for audit metadata trail
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_share         patient_data_shares%ROWTYPE;
  v_new_expires   TIMESTAMPTZ;
  v_renewed_ids   UUID[] := ARRAY[]::UUID[];
  v_renewed_count INTEGER := 0;
  v_audit_id      UUID;
BEGIN
  IF p_global_patient_id IS NULL OR p_grantee_clinic_id IS NULL THEN
    RAISE EXCEPTION 'auto_renew_shares_on_visit: required arg is NULL';
  END IF;

  FOR v_share IN
    SELECT *
      FROM public.patient_data_shares
     WHERE global_patient_id = p_global_patient_id
       AND grantee_clinic_id = p_grantee_clinic_id
       AND revoked_at IS NULL
       AND expires_at IS NOT NULL  -- skip permanent
     FOR UPDATE
  LOOP
    v_new_expires := NOW() + INTERVAL '90 days';

    -- Skip if current expiry is already further out.
    IF v_share.expires_at >= v_new_expires THEN
      CONTINUE;
    END IF;

    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
    )
    VALUES (
      v_share.grantee_clinic_id,
      NULL,
      'system',
      'SHARE_AUTO_RENEWED',
      'patient_data_share',
      v_share.id,
      jsonb_build_object(
        'share_id',             v_share.id,
        'previous_expires_at',  v_share.expires_at,
        'new_expires_at',       v_new_expires,
        'encounter_id',         p_encounter_id,
        'trigger',              'visit'
      )
    )
    RETURNING id INTO v_audit_id;

    UPDATE public.patient_data_shares
       SET expires_at = v_new_expires
     WHERE id = v_share.id;

    v_renewed_ids := array_append(v_renewed_ids, v_share.id);
    v_renewed_count := v_renewed_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'renewed_count', v_renewed_count,
    'share_ids',     to_jsonb(v_renewed_ids)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_renew_shares_on_visit(UUID, UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5e. mark_share_expired_notification — cron records that an expiry
--                                       notification was sent for a share
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_share_expired_notification(
  p_share_id  UUID,
  p_cron_run_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_share     patient_data_shares%ROWTYPE;
  v_audit_id  UUID;
  v_already   BOOLEAN;
BEGIN
  IF p_share_id IS NULL THEN
    RAISE EXCEPTION 'mark_share_expired_notification: share_id required';
  END IF;

  SELECT * INTO v_share
    FROM public.patient_data_shares
   WHERE id = p_share_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_share_expired_notification: share % not found', p_share_id;
  END IF;

  -- Idempotency: check whether we already wrote a SHARE_EXPIRED notified=true
  -- audit for this share.
  SELECT EXISTS (
    SELECT 1
      FROM public.audit_events
     WHERE action = 'SHARE_EXPIRED'
       AND entity_type = 'patient_data_share'
       AND entity_id = p_share_id
       AND (metadata->>'notified')::BOOLEAN IS TRUE
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object(
      'changed', false,
      'reason',  'already_notified',
      'share_id', p_share_id
    );
  END IF;

  INSERT INTO public.audit_events (
    clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
  )
  VALUES (
    v_share.grantee_clinic_id,
    NULL,
    'system',
    'SHARE_EXPIRED',
    'patient_data_share',
    v_share.id,
    jsonb_build_object(
      'share_id',     v_share.id,
      'expired_at',   v_share.expires_at,
      'notified',     true,
      'cron_run_id',  p_cron_run_id
    )
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'changed',        true,
    'share_id',       p_share_id,
    'audit_event_id', v_audit_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_share_expired_notification(UUID, TEXT) TO authenticated;

-- ============================================================================
-- End of migration 090.
-- Migration application is tracked by Supabase's migration metadata table;
-- no per-migration audit row is needed (and the audit_events.action vocabulary
-- is reserved for domain-level events, not infra-level migration markers).
-- ============================================================================
