-- ============================================================================
-- Migration 108 — Fix rls_test_teardown() to clean PCR audit_events rows
--
-- Audit references:
--   * audits/STATE_OF_WORK.md § "Phase F Task 18 — Fix rls_test_teardown()
--     audit_events cleanup"
--   * audits/PROGRAM_STATE.md § "Phase F follow-up tasks" Task 18
--   * DECISIONS_LOG.md D-074 (Phase D #1.5 matrix is the canonical RLS
--     regression artifact; audit_events.S6 dynamic-row workaround amended)
--   * audits/rls-test-matrix-reconstructed.sql § "Section 19 — audit_events"
--     (the dynamic-row workaround being removed by this fix)
--   * Empirical Lessons #2 (smoke-probe assertion), #7 (verify schema state
--     independently of the migration tree), #8 (committed migration files),
--     #12 (durable test scaffolding), #13 (doc lockstep)
--
-- Originated by: cowork session 2026-05-07 (Phase F Task 18)
-- Locked rulings: 2026-05-07 — single audit_events DELETE clause extension;
--                 no structural changes to teardown function.
--
-- Why this migration exists
-- -------------------------
-- D-074 (commit aa2b991, Phase D #1.5 matrix reconstruction at run_no=1.5)
-- surfaced that public.rls_test_teardown() only cleans audit_events rows
-- whose entity_type IN ('global_patients', 'patient_data_share'). The PCR
-- AFTER-INSERT audit trigger installed by mig 088 (tg_audit_pcr_insert_trg
-- on public.patient_clinic_records) emits one audit_events row per PCR
-- INSERT with entity_type='patient_clinic_record'. rls_test_seed() inserts
-- 4 PCR rows per cycle, so audit_events accumulates +4 rows per seed cycle
-- across the test gps (run #1 captured patient_y at 8 rows; run #1.5 saw
-- 10 rows; staging today is at 40 rows total across the three gps).
--
-- The matrix file currently works around this by computing
-- audit_events.S6's expected_rows DYNAMICALLY at run time (count from
-- postgres role for patient_y_gp). The outcome match (SUCCESS=SUCCESS) is
-- preserved, but the row-count value drifts cycle-over-cycle, breaking
-- run-to-run comparability for that one row.
--
-- This migration: extends the audit_events DELETE clause inside
-- rls_test_teardown() to also catch:
--   * resolved_global_patient_id = ANY(k_gp_uuids)
--       — catches PCR audits where the resolver populated the column
--         (the case for all 40 rows on staging today)
--   * (entity_type='patient_clinic_record' AND
--      (metadata->>'global_patient_id')::uuid = ANY(k_gp_uuids))
--       — defensive belt-and-suspenders for PCR audits where the resolver
--         hasn't yet populated resolved_global_patient_id (trigger timing)
--
-- Investigation results (logged here for forensics; full detail in
-- STATE_OF_WORK.md task surface, 2026-05-07):
--   * Live teardown body (pulled from pg_proc) is structurally a SUPERSET
--     of audits/rls-test-seed.sql (extra ops/comm + clinical-data cleanup
--     blocks added in Sessions 11 + 14a). This migration redefines the
--     function authoritatively from the live body + the audit_events fix.
--     The audits/rls-test-seed.sql file itself is out of date relative to
--     staging — Lesson #7 in action — but updating that file is out of
--     scope for Task 18 (it is reference scaffolding; the live function
--     is canonical).
--   * audit_events.resolved_global_patient_id is a GENERATED ALWAYS
--     column (uuid, NULL allowed) — verified via
--     information_schema.columns.generation_expression on staging:
--       COALESCE(
--         NULLIF(metadata->>'global_patient_id', '')::uuid,
--         CASE WHEN entity_type='global_patients' THEN entity_id ELSE NULL END
--       )
--     This means there is NO resolver timing concern; the column is
--     populated at INSERT time. The "defensive metadata fallback" clause
--     (entity_type='patient_clinic_record' AND
--      (metadata->>'global_patient_id')::uuid = ANY(k_gp_uuids)) is thus
--     functionally redundant w.r.t. the resolved_global_patient_id clause,
--     but is kept for readability / transparency of intent.
--   * Only one audit-emitting trigger surfaces on seeded tables:
--     tg_audit_pcr_insert_trg on patient_clinic_records (mig 088).
--     No other audit-pipeline accumulators found in the seeded surface.
--   * No other tables were found with rows tied to test data that the
--     live teardown isn't already cleaning. The fix is bounded.
--
-- Idempotency
-- -----------
-- - CREATE OR REPLACE FUNCTION makes re-applying this migration a no-op
--   in terms of definition. The smoke probe DOES write+delete a sentinel
--   audit_events row inside its DO block, but cleans it up before the
--   block returns; nothing about repeated apply changes externally
--   visible state.
--
-- Downstream effects
-- ------------------
-- - Existing callers (rls_test_seed() invokes rls_test_teardown()
--   internally; matrix file calls it explicitly at top) keep working —
--   the function signature and RETURNS TABLE shape are unchanged.
-- - The audit_events DELETE picks up an additional clause; pre-existing
--   accumulated PCR audit rows for test gps will be cleaned the next
--   time rls_test_teardown() runs.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Pre-check: capture pre-state so the smoke probe can verify cleanup
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_func_exists BOOLEAN;
  v_pre_pcr_audit_rows INT;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='rls_test_teardown')
    INTO v_func_exists;
  IF NOT v_func_exists THEN
    RAISE EXCEPTION 'mig 108 ABORT: public.rls_test_teardown not found (was expected from rls-test-seed.sql era)';
  END IF;

  SELECT count(*) INTO v_pre_pcr_audit_rows
  FROM public.audit_events
  WHERE entity_type = 'patient_clinic_record'
    AND resolved_global_patient_id = ANY(ARRAY[
      '00000099-0000-0000-0000-000000000031'::uuid,
      '00000099-0000-0000-0000-000000000032'::uuid,
      '00000099-0000-0000-0000-000000000033'::uuid
    ]);

  RAISE NOTICE
    'mig 108 pre-check: rls_test_teardown exists=%, accumulated PCR audit rows for test gps (will be cleaned by next teardown call)=%',
    v_func_exists, v_pre_pcr_audit_rows;
END $$;

-- ----------------------------------------------------------------------------
-- 1) Redefine rls_test_teardown() with the extended audit_events DELETE.
--
-- Body is the live staging body (verified via pg_get_functiondef on
-- 2026-05-07) verbatim, with ONLY the audit_events DELETE clause extended
-- to also cover entity_type='patient_clinic_record' rows attributed to
-- test global_patients (via resolved_global_patient_id or the
-- metadata.global_patient_id fallback).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_test_teardown()
RETURNS TABLE(entity TEXT, removed INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  k_clinic_uuids UUID[] := ARRAY[
    '00000099-0000-0000-0000-000000000001'::UUID,
    '00000099-0000-0000-0000-000000000002'::UUID
  ];
  k_user_uuids UUID[] := ARRAY[
    '00000099-0000-0000-0000-000000000010'::UUID,
    '00000099-0000-0000-0000-000000000011'::UUID,
    '00000099-0000-0000-0000-000000000012'::UUID,
    '00000099-0000-0000-0000-000000000013'::UUID,
    '00000099-0000-0000-0000-000000000020'::UUID,
    '00000099-0000-0000-0000-000000000021'::UUID,
    '00000099-0000-0000-0000-000000000022'::UUID
  ];
  k_gp_uuids UUID[] := ARRAY[
    '00000099-0000-0000-0000-000000000031'::UUID,
    '00000099-0000-0000-0000-000000000032'::UUID,
    '00000099-0000-0000-0000-000000000033'::UUID
  ];
  k_share_uuids UUID[] := ARRAY[
    '00000099-0000-0000-0000-000000000050'::UUID,
    '00000099-0000-0000-0000-000000000051'::UUID,
    '00000099-0000-0000-0000-000000000052'::UUID
  ];
  v_n INT;
BEGIN
  -- New ops/comm rows first (children of clinic_id / conversation)
  DELETE FROM public.notifications WHERE id::text LIKE '00000099%';
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'notifications'; removed := v_n; RETURN NEXT;
  DELETE FROM public.messages WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'messages'; removed := v_n; RETURN NEXT;
  DELETE FROM public.conversations WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'conversations'; removed := v_n; RETURN NEXT;
  DELETE FROM public.payments WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'payments'; removed := v_n; RETURN NEXT;
  DELETE FROM public.check_in_queue WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'check_in_queue'; removed := v_n; RETURN NEXT;
  DELETE FROM public.appointments WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'appointments'; removed := v_n; RETURN NEXT;
  DELETE FROM public.doctor_availability WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'doctor_availability'; removed := v_n; RETURN NEXT;

  -- Clinical-data
  DELETE FROM public.lab_results WHERE id::text LIKE '00000099%';
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'lab_results'; removed := v_n; RETURN NEXT;
  DELETE FROM public.prescription_items WHERE id::text LIKE '00000099%';
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'prescription_items'; removed := v_n; RETURN NEXT;
  DELETE FROM public.lab_orders WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'lab_orders'; removed := v_n; RETURN NEXT;
  DELETE FROM public.imaging_orders WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'imaging_orders'; removed := v_n; RETURN NEXT;
  DELETE FROM public.vital_signs WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'vital_signs'; removed := v_n; RETURN NEXT;
  DELETE FROM public.clinical_notes WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'clinical_notes'; removed := v_n; RETURN NEXT;

  -- Privacy + audit
  DELETE FROM public.privacy_code_attempts WHERE id::text LIKE '00000099%' OR global_patient_id = ANY(k_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'privacy_code_attempts'; removed := v_n; RETURN NEXT;
  DELETE FROM public.privacy_code_sms_tokens WHERE id::text LIKE '00000099%' OR global_patient_id = ANY(k_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'privacy_code_sms_tokens'; removed := v_n; RETURN NEXT;
  DELETE FROM public.patient_privacy_codes WHERE id::text LIKE '00000099%' OR global_patient_id = ANY(k_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'patient_privacy_codes'; removed := v_n; RETURN NEXT;

  -- audit_events: extended by mig 108 to also catch PCR audit rows
  -- (entity_type='patient_clinic_record' from mig 088's trigger).
  -- The two new clauses (resolved_global_patient_id and the
  -- metadata->>'global_patient_id' fallback) close the gap surfaced by
  -- D-074 / Phase D #1.5 matrix reconstruction.
  DELETE FROM public.audit_events
    WHERE (entity_type = 'global_patients'        AND entity_id = ANY(k_gp_uuids))
       OR (entity_type = 'patient_data_share'     AND entity_id = ANY(k_share_uuids))
       OR (entity_type = 'patient_clinic_record'  AND (metadata->>'global_patient_id')::uuid = ANY(k_gp_uuids))
       OR  resolved_global_patient_id = ANY(k_gp_uuids)
       OR  metadata->>'rls_test_v1' = 'true';
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'audit_events'; removed := v_n; RETURN NEXT;

  DELETE FROM public.patient_data_shares WHERE id = ANY(k_share_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'patient_data_shares'; removed := v_n; RETURN NEXT;
  DELETE FROM public.patient_clinic_records WHERE global_patient_id = ANY(k_gp_uuids) OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'patient_clinic_records'; removed := v_n; RETURN NEXT;
  DELETE FROM public.patients WHERE id = ANY(k_user_uuids) OR clinic_id = ANY(k_clinic_uuids) OR global_patient_id = ANY(k_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'patients'; removed := v_n; RETURN NEXT;
  DELETE FROM public.global_patients WHERE id = ANY(k_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'global_patients'; removed := v_n; RETURN NEXT;
  DELETE FROM public.clinic_memberships WHERE clinic_id = ANY(k_clinic_uuids) OR user_id = ANY(k_user_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'clinic_memberships'; removed := v_n; RETURN NEXT;
  DELETE FROM public.doctors WHERE id = ANY(k_user_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'doctors'; removed := v_n; RETURN NEXT;
  DELETE FROM public.users WHERE id = ANY(k_user_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'users'; removed := v_n; RETURN NEXT;
  DELETE FROM auth.users WHERE id = ANY(k_user_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'auth.users'; removed := v_n; RETURN NEXT;
  DELETE FROM public.clinics WHERE id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'clinics'; removed := v_n; RETURN NEXT;
  RETURN;
END $$;

COMMENT ON FUNCTION public.rls_test_teardown() IS
  'Phase D RLS test matrix: removes all seed data installed by rls_test_seed(). '
  'Updated mig 108 (Phase F Task 18, 2026-05-07) to extend audit_events cleanup '
  'with two new clauses — resolved_global_patient_id = ANY(test_gps) and '
  'entity_type=patient_clinic_record + metadata.global_patient_id = ANY(test_gps) '
  '— closing the PCR audit accumulation gap surfaced by D-074. NOTE: function '
  'body diverges from audits/rls-test-seed.sql (which is out of date); the '
  'live function is canonical (Lesson #7).';

COMMIT;

-- ============================================================================
-- Smoke probe — Empirical Lesson #2 in action.
--
-- Insert a sentinel PCR audit row attributed to test gp patient_y_gp (with a
-- distinguishable metadata marker so we know we hit OUR sentinel, not a
-- stray PCR audit). Call rls_test_teardown(). Assert (a) the sentinel was
-- cleaned, (b) the teardown returned an audit_events entity row with
-- removed >= 1, (c) any pre-existing accumulated PCR audit rows for test
-- gps are also gone (the whole point of the fix). RAISE EXCEPTION on miss.
--
-- Design note: the sentinel is inserted INSIDE this DO block (post-COMMIT
-- of the function definition). The teardown call cleans the sentinel AND
-- whatever else is in the test-gp scope. After the probe, the test scope
-- is empty — which is the correct post-condition for any teardown call.
-- ============================================================================

DO $$
DECLARE
  k_patient_y_gp UUID := '00000099-0000-0000-0000-000000000032';
  v_sentinel_id UUID;
  v_pre_count INT;
  v_post_count INT;
  v_audit_removed INT;
BEGIN
  -- (a) Snapshot the current accumulated PCR audit row count for test gps.
  SELECT count(*) INTO v_pre_count
  FROM public.audit_events
  WHERE entity_type = 'patient_clinic_record'
    AND resolved_global_patient_id = ANY(ARRAY[
      '00000099-0000-0000-0000-000000000031'::uuid,
      '00000099-0000-0000-0000-000000000032'::uuid,
      '00000099-0000-0000-0000-000000000033'::uuid
    ]);

  -- (b) Insert the sentinel row. Use INSERT ... RETURNING id to capture the
  --     auto-generated UUID. We bypass the trigger by inserting directly
  --     into audit_events (the trigger fires on PCR INSERT, not audit_events
  --     INSERT). actor_kind='system' + actor_user_id=NULL satisfies the
  --     audit_events_actor_consistency CHECK constraint.
  -- IMPORTANT: resolved_global_patient_id is a GENERATED ALWAYS column on
  --     audit_events (verified 2026-05-07 via information_schema). It is
  --     computed at INSERT time from
  --       COALESCE((metadata->>'global_patient_id')::uuid,
  --                CASE WHEN entity_type='global_patients' THEN entity_id END).
  --     We CANNOT specify it in the INSERT column list (Postgres errors
  --     "cannot insert a non-DEFAULT value into column ... is a generated
  --     column"). Setting metadata.global_patient_id = patient_y_gp causes
  --     the generated column to be populated to patient_y_gp automatically.
  INSERT INTO public.audit_events (
    action, actor_kind, actor_user_id, clinic_id, entity_type, entity_id,
    metadata, created_at
  ) VALUES (
    'PATIENT_CLINIC_RECORD_CREATED',
    'system',
    NULL,
    '00000099-0000-0000-0000-000000000001'::uuid,
    'patient_clinic_record',
    gen_random_uuid(),
    jsonb_build_object(
      'source', 'mig_108_smoke_probe',
      'global_patient_id', k_patient_y_gp::text
    ),
    NOW()
  ) RETURNING id INTO v_sentinel_id;

  -- (c) Call teardown. Capture the audit_events return-row's `removed` count.
  SELECT t.removed INTO v_audit_removed
  FROM public.rls_test_teardown() t
  WHERE t.entity = 'audit_events';

  -- (d) Assertion 1: sentinel must be gone.
  IF EXISTS (SELECT 1 FROM public.audit_events WHERE id = v_sentinel_id) THEN
    RAISE EXCEPTION
      'mig 108 smoke probe FAIL: sentinel audit_events row id=% was NOT cleaned by rls_test_teardown(). '
      'The audit_events DELETE clause extension did not catch the sentinel.',
      v_sentinel_id;
  END IF;

  -- (e) Assertion 2: teardown must report removing at least the sentinel
  --     (and likely the pre-existing accumulated rows too).
  IF v_audit_removed IS NULL OR v_audit_removed < 1 THEN
    RAISE EXCEPTION
      'mig 108 smoke probe FAIL: teardown returned audit_events.removed=% (expected >=1; sentinel + %s pre-existing rows = %s)',
      v_audit_removed, v_pre_count, v_pre_count + 1;
  END IF;

  -- (f) Assertion 3: all PCR audit rows for test gps are cleaned.
  SELECT count(*) INTO v_post_count
  FROM public.audit_events
  WHERE entity_type = 'patient_clinic_record'
    AND resolved_global_patient_id = ANY(ARRAY[
      '00000099-0000-0000-0000-000000000031'::uuid,
      '00000099-0000-0000-0000-000000000032'::uuid,
      '00000099-0000-0000-0000-000000000033'::uuid
    ]);
  IF v_post_count <> 0 THEN
    RAISE EXCEPTION
      'mig 108 smoke probe FAIL: % PCR audit rows for test gps remain after teardown (expected 0; pre-cleanup count was %)',
      v_post_count, v_pre_count;
  END IF;

  RAISE NOTICE
    'mig 108 smoke probe: PASS (sentinel cleaned; audit_events.removed=% covered % pre-existing PCR rows + 1 sentinel; post-cleanup PCR audit count for test gps = 0)',
    v_audit_removed, v_pre_count;
END $$;
