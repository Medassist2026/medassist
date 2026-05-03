-- ============================================================================
-- Migration 091 — Atomic multi-grantor share creation.
--
-- Build prompt 05 follow-up § Phase 1.
-- Closes Build 05 results § 3 atomicity caveat (the partial-failure window
-- where the per-grantor TS loop committed shares N-1 + N+1 if share N
-- failed).
--
-- WHAT THIS DOES
--   Wraps the existing create_data_share (mig 090) in a SECURITY DEFINER
--   function that loops in a SINGLE PL/pgSQL transaction. Any RAISE inside
--   any inner create_data_share call rolls back ALL share + audit rows
--   from this batch — no partial state can leak.
--
-- IDEMPOTENCY
--   Inherited from create_data_share (idempotent on the
--   (grantor, grantee, patient) triple). Re-running with the same args
--   returns idempotent_hit=true for each row that already had an active
--   share.
--
-- DEFENSIVE GUARDS
--   - Empty grantor list rejected (caller programmer error).
--   - grantee in grantor list rejected (caller should have filtered;
--     the inner create_data_share would also reject via CHECK, but failing
--     fast at the wrapper level produces a clearer error message).
--
-- WHAT THIS DOES NOT DO
--   - Does not modify create_data_share itself.
--   - Does not change the AuditAction vocabulary.
--   - Does not change the RLS placeholder (still DENY-ALL until Prompt 6).
--
-- NOTE on RETURNS shape
--   create_data_share RETURNS JSONB (mig 090). This wrapper extracts the
--   relevant keys into TABLE columns so callers get type-safe row results
--   instead of having to parse JSONB on the TS side.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_shares_for_grantors(
  p_global_patient_id  UUID,
  p_grantor_clinic_ids UUID[],
  p_grantee_clinic_id  UUID,
  p_granted_via        TEXT,
  p_actor_user_id      UUID,
  p_actor_kind         TEXT DEFAULT 'user',
  p_grant_reason       TEXT DEFAULT NULL
)
RETURNS TABLE (
  share_id          UUID,
  audit_event_id    UUID,
  grantor_clinic_id UUID,
  expires_at        TIMESTAMPTZ,
  idempotent_hit    BOOLEAN
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_grantor_id UUID;
  v_result     JSONB;
BEGIN
  -- Pre-flight: refuse empty grantor list. Callers should filter
  -- grantor==grantee before invoking; an empty list after that filter
  -- means the caller intended a no-op and should not have called us at
  -- all. Surface as an error so the bug surfaces upstream instead of
  -- being swallowed silently.
  IF p_grantor_clinic_ids IS NULL OR array_length(p_grantor_clinic_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'create_shares_for_grantors: empty grantor list';
  END IF;

  -- Pre-flight: refuse grantee in grantor list. The inner CHECK on
  -- patient_data_shares would also catch this, but the inner failure
  -- aborts the whole batch — nicer UX to fail fast at the wrapper with
  -- a clear message.
  IF p_grantee_clinic_id = ANY(p_grantor_clinic_ids) THEN
    RAISE EXCEPTION 'create_shares_for_grantors: grantee % is in grantor list',
      p_grantee_clinic_id;
  END IF;

  -- Atomic loop. The PL/pgSQL function body runs in the caller's
  -- transaction (or its own implicit one if called as a top-level
  -- statement); any RAISE — including those inside create_data_share —
  -- propagates up and rolls back every prior INSERT/UPDATE in this
  -- batch.
  FOREACH v_grantor_id IN ARRAY p_grantor_clinic_ids LOOP
    v_result := public.create_data_share(
      p_global_patient_id   := p_global_patient_id,
      p_grantor_clinic_id   := v_grantor_id,
      p_grantee_clinic_id   := p_grantee_clinic_id,
      p_granted_via         := p_granted_via,
      p_grant_reason        := p_grant_reason,
      p_actor_user_id       := p_actor_user_id,
      p_actor_kind          := p_actor_kind,
      p_default_expiry_days := 90
    );

    share_id          := NULLIF(v_result->>'share_id', '')::UUID;
    audit_event_id    := NULLIF(v_result->>'audit_event_id', '')::UUID;
    grantor_clinic_id := v_grantor_id;
    expires_at        := NULLIF(v_result->>'expires_at', '')::TIMESTAMPTZ;
    idempotent_hit    := COALESCE((v_result->>'idempotent_hit')::BOOLEAN, FALSE);
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.create_shares_for_grantors(
  UUID, UUID[], UUID, TEXT, UUID, TEXT, TEXT
) IS
  'Atomic multi-grantor share creation. All shares + audit rows commit '
  'together or roll back together. Closes Build 05 § 3 atomicity caveat. '
  'Idempotent per (grantor, grantee, patient) triple via inner '
  'create_data_share idempotency.';

GRANT EXECUTE ON FUNCTION public.create_shares_for_grantors(
  UUID, UUID[], UUID, TEXT, UUID, TEXT, TEXT
) TO authenticated;
