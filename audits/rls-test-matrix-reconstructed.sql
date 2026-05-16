-- ============================================================================
-- Phase D RLS test matrix — RECONSTRUCTED (executable)
--
-- File:        audits/rls-test-matrix-reconstructed.sql
-- Authored:    2026-05-06 (cowork session — Phase D #1.5 reconstruction)
-- Re-run:      2026-05-07 (cowork session — Phase F Task 18) at run_no = 1.6
--              after mig 108 fixed rls_test_teardown's audit_events cleanup;
--              audit_events.S6 expected_rows reverted from dynamic baseline
--              to hardcoded 1 (the post-fix per-cycle stable value).
-- Re-run:      2026-05-10 (cowork session — B07 Phase B) at run_no = 2.0
--              against staging post-mig-109/110/111. 177/177 PASS,
--              comparison vs run_no = 1.6 baseline: zero divergence (all 177
--              outcomes match). Phase B's schema additions on global_patients
--              (guardian_global_patient_id, is_minor) and the new
--              patient_delegations table did NOT regress any existing RLS
--              policy. The matrix file's executable v_run := 1.6 declarations
--              (24 DO blocks + Section 0 DELETE) were globally rewritten to
--              v_run := 2.0 for this re-run; the historical 1.6 narration in
--              this header and below is preserved verbatim. Pre-flight
--              teardown initially blocked by a stale sms_reminders row
--              referencing the test appointment 00000099-…000a0 (FK has no
--              ON DELETE CASCADE; rls_test_teardown does not yet handle
--              sms_reminders cleanup — same class as the audit_events gap
--              that mig 108 fixed). One-time hygiene applied: DELETE FROM
--              sms_reminders WHERE appointment_id::text LIKE '00000099%';
--              recurring vulnerability tracked as a follow-up in
--              audits/b07-phase-b-execution-2026-05-10.md Decision 11.
-- Re-run:      2026-05-10 (cowork session — B07 Phase D RLS extensions) at
--              run_no = 3.0 against staging post-mig-113/114/115/116.
--              177/177 PASS, comparison vs run_no = 2.0 baseline: zero
--              divergence (all 177 scenarios match), confirming that the
--              mig 113-116 ALTER POLICY edits are regression-clean. Phase
--              D's PERMISSIVE OR additions (extending patient-side RLS
--              legs with public.is_authorized_actor_on / inline guardian-
--              link EXISTS) do not narrow any existing predicate; the new
--              branches evaluate FALSE for all existing matrix personas
--              (none have guardian/delegation relationships). The matrix
--              file's executable v_run := 2.0 declarations (24 DO blocks
--              + Section 0 DELETE) were globally rewritten to v_run := 3.0
--              for this re-run via two sed substitutions; the historical
--              2.0 narration in this header is preserved verbatim above.
--              Pre-flight stale-sms_reminders check (B07-FU-2 follow-up):
--              0 rows present, no cleanup required this cycle. Executed
--              via Supabase MCP execute_sql in 6 batched chunks (Section 0
--              pre-flight; Sections 1-4; 5-9; 10-14; 15-19; 20-24);
--              Section 25 inline validation queries skipped (informational).
--              Tables covered: 24. All 4 Phase D-modified tables
--              (global_patients, patient_clinic_records, patient_data_shares,
--              audit_events) confirmed regression-clean.
-- Re-run:      2026-05-11 (B07 Phase H — RLS test matrix expansion at
--              run_no = 4.0) added Sections 26-28 (15 scenarios — guardian,
--              delegate, cross-clinic minor archetypes) + new
--              rls_test_seed_b07_phase_h() function on staging. Sections
--              1-25 carried forward from 3.0 (zero DB changes). 188/192 PASS;
--              4 findings surfaced as STOP exception #2 (S26-4, S26-5,
--              S28-3, S28-5). See audits/b07-phase-h-execution-2026-05-11.md.
-- Re-run:      2026-05-12 (B07 Phase H.1 — Scenario amendments per Mo's
--              triage rulings) at run_no = 4.1. S26-4 + S26-5 expected
--              flipped SUCCESS → FAIL (Phase D OR-of-three intentionally
--              excludes DPR + legacy patients per mig 113-116 design).
--              S28-3 + S28-5 fixture amended: seed function now creates
--              PCR-at-clinic_b for minor_m2 and share_grantor (represents
--              post-share-consumed state where mig 091 RPC has created PCRs
--              at grantee — share existence alone does NOT grant gp
--              visibility; `user_has_clinic_path_to_gp` requires
--              PCR-at-grantee). Expected: 192/192 PASS. See
--              audits/b07-phase-h1-execution-2026-05-12.md.
-- Predecessor: audits/rls-test-matrix.sql (scaffold, scenario semantics only)
-- Run target:  staging (mtmdotixlhwksyoordbl), latest records at run_no = 4.1
--
-- WHAT THIS FILE IS
-- -----------------
-- Executable PL/pgSQL test matrix that replays the 177 scenarios captured in
-- _rls_test_results WHERE run_no = 1, against the post-mig-108 staging RLS
-- policy + helper surface. The matrix is the canonical regression artifact
-- closing the Phase D #1.5 push gate (PHASE_D_RECONSTRUCTION_HANDOFF.md).
-- Re-run 2026-05-07 at run_no = 1.6 with mig 108's audit_events cleanup fix.
--
-- WHY (Empirical Lesson #12)
-- --------------------------
-- Run #1 was authored interactively across cowork sessions 5/7/10/11/13/14a;
-- outcomes recorded in _rls_test_results but the source SQL was never
-- persisted. Lesson #12 codified this as a process-level finding: test
-- scaffolding must be persisted as durable executable code. This file is that
-- artifact — every row recorded by this run carries `source_file =
-- 'audits/rls-test-matrix-reconstructed.sql'` (column added by mig 107).
--
-- HARNESS PATTERN (Empirical Lesson #3)
-- -------------------------------------
-- Per scenario:
--   1. EXECUTE 'SET LOCAL ROLE authenticated';
--   2. EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
--                     json_build_object('sub', persona, 'role', 'authenticated'));
--   3. EXECUTE the test query (as authenticated under the persona's claims).
--   4. RESET ROLE.
--   5. PERFORM public.rls_test_record(1.6, scenario, table, desc, expected,
--                                     actual, pass, notes, source_file).
--
-- Steps 1+2 are SEPARATE STATEMENTS, never inlined into a CTE / WITH clause —
-- inline set_config(...) lets Postgres build the query plan under
-- session_user's BYPASSRLS attribute and silently bypass RLS. Verified during
-- Phase D step 2 (2026-04-30).
--
-- WRITE-PATH SCENARIOS (S9 / S10)
-- -------------------------------
-- S9 (INSERT_DENY): EXECUTE INSERT inside BEGIN/EXCEPTION; expected to be
--                   caught by RLS RESTRICTIVE WITH CHECK as 42501
--                   (insufficient_privilege). PASS when caught.
--                   actual_rows = NULL, notes = 'caught=RLS_BLOCKED_42501'.
--                   Matches the run #1 record shape verbatim.
--
-- S10 (UPDATE_NOOP): EXECUTE UPDATE; UPDATE returns ROW_COUNT = 0 because the
--                    target rows are invisible to the persona under RLS. PASS
--                    when ROW_COUNT = 0. No exception expected; if 42501 is
--                    raised (defensive), still PASS.
--
-- PASS CRITERION
-- --------------
-- For each scenario:
--   READ:        pass = (expected='SUCCESS' AND actual = expected_rows)
--                    OR (expected='FAIL'    AND actual = 0)
--   INSERT_DENY: pass = (42501 was caught)
--   UPDATE_NOOP: pass = (ROW_COUNT = 0)
--
-- expected_rows is read from run #1's actual_rows for the same (table,
-- scenario) — per PHASE_D_RECONSTRUCTION_HANDOFF.md Open Question #4: the
-- PASS criterion is "matches run #1", not re-derived from the spec.
--
-- SCENARIO CATALOGUE (S1-S10 + S7a/b/c, copied from rls-test-matrix.sql §1)
-- ------------------------------------------------------------------------
--   S1   Self-clinic SELECT positive
--   S2   Self-clinic SELECT negative (non-existent / true negative)
--   S3   Cross-clinic SELECT — ACTIVE share / direct PCR / etc.
--   S4   Cross-clinic SELECT — REVOKED share / cross-clinic-not-member
--   S5   Cross-clinic SELECT — EXPIRED share / bidirectional negative
--   S6   Patient SELF / patient-self path
--   S7   Patient OTHER / OUTBOUND-from-self filter
--   S7a/b/c (audit_events only) — patient_y_user sees own audit (8 rows;
--           ground truth) and does NOT see other patients' / unresolved rows
--   S8   Frontdesk same-clinic / OWNER same-clinic
--   S9   Cross-clinic share INSERT BLOCKED (clinical-data tables)
--   S10  Cross-clinic share UPDATE BLOCKED  (clinical-data tables)
--
-- TABLES COVERED (24)
-- -------------------
-- 8-scenario standard (S1-S8): appointments, check_in_queue,
--   clinic_memberships, clinics, conversations, doctor_availability, doctors,
--   global_patients, messages, notifications, patient_clinic_records,
--   patient_data_shares, payments, privacy_code_attempts, users (15 tables)
-- 10-scenario clinical-flagship (S1-S10): clinical_notes (1 table)
-- 7-scenario clinical-data (S1, S2, S3, S7, S8, S9, S10): imaging_orders,
--   lab_orders, lab_results, prescription_items, vital_signs (5 tables)
-- 4-scenario DENY-ALL (S1-S4): patient_privacy_codes, privacy_code_sms_tokens
-- 4-scenario audit (S6, S7a, S7b, S7c): audit_events
-- Total: 24 tables, 177 scenarios.
--
-- USAGE
-- -----
--   1. Apply migs 107 + 108 first (107 added run_no NUMERIC + source_file;
--      108 fixed rls_test_teardown's audit_events cleanup so the matrix is
--      reproducible without a dynamic-row workaround).
--   2. Run this file end-to-end against staging (single execute_sql call OR
--      via supabase migration run on the file body — but DO NOT register it
--      as a migration; this is test code, not schema).
--   3. The file is idempotent: it DELETEs run_no = 1.6 first, refreshes the
--      seed (which calls teardown internally), then writes 177 fresh rows.
--   4. Validation queries at the bottom of this file produce the pass/fail
--      report and the comparison query against run #1.
--
-- FAILURE-CLASS TRIAGE (apply-runbook-v2.md § 7)
-- ----------------------------------------------
-- 1-3 failures: STOP. Surface failed scenarios verbatim. Do NOT push.
-- >3 failures:  STOP immediately. Mig 106 rollback candidate.
-- Test-authoring error → fix file, re-run.
-- RLS regression → STOP, surface, STATE_OF_WORK = "Blocked: RLS regression".
-- ============================================================================


-- ============================================================================
-- Section 0 — Pre-flight: refresh seed + clear prior run #1.6
-- ============================================================================

DELETE FROM public._rls_test_results WHERE run_no = 4.1;

-- Phase H pre-teardown cleanup: B07 fixtures (00000200-prefixed) created by
-- rls_test_seed_b07_phase_h have FK references (DPR → PCR) that block
-- rls_test_teardown's PCR delete. Pre-deleting them here lets teardown proceed.
DELETE FROM public.doctor_patient_relationships WHERE id::text LIKE '00000200%';
DELETE FROM public.patient_data_shares WHERE id::text LIKE '00000200%';
DELETE FROM public.patient_delegations WHERE id::text LIKE '00000200%';
DELETE FROM public.patients WHERE id::text LIKE '00000200%';

-- Phase I pre-teardown cleanup: B07 Phase I fixtures (00000300-prefixed) created by
-- rls_test_seed_b07_phase_i (mother/father/son personas) + Phase I.A workflow rows
-- (Aya minor gps, father appointments, son delegation). Per Lesson #21 +
-- audits/b07-phase-i-execution-2026-05-12.md Section 6 Option A retention decision.
-- Aya minors got auto-generated UUIDs (not 00000300- prefix) so cleanup keys on
-- guardian_global_patient_id linkage as well.
DELETE FROM public.patient_delegations WHERE id::text LIKE '00000300%';
DELETE FROM public.doctor_patient_relationships WHERE id::text LIKE '00000300%' OR global_patient_id IN (
  SELECT id FROM public.global_patients WHERE guardian_global_patient_id::text LIKE '00000300%'
);
DELETE FROM public.patient_medication_intake WHERE patient_id::text LIKE '00000300%';
DELETE FROM public.appointments WHERE patient_id::text LIKE '00000300%';
DELETE FROM public.patients WHERE id::text LIKE '00000300%' OR global_patient_id::text LIKE '00000300%' OR global_patient_id IN (
  SELECT id FROM public.global_patients WHERE guardian_global_patient_id::text LIKE '00000300%'
);
DELETE FROM public.patient_clinic_records WHERE global_patient_id::text LIKE '00000300%' OR global_patient_id IN (
  SELECT id FROM public.global_patients WHERE guardian_global_patient_id::text LIKE '00000300%'
);

-- B07-FU-2 cleanup: clear stale sms_reminders that block teardown of
-- test appointments. The cron emits these but rls_test_teardown's
-- current scope does not include the table (see PROGRAM_STATE B07-FU-2).
DELETE FROM public.sms_reminders
  WHERE appointment_id IN (SELECT id FROM public.appointments WHERE id::text LIKE '00000099%');

SELECT public.rls_test_teardown();
SELECT public.rls_test_seed();
-- Phase H run_no = 4.0 adds the B07 authority-archetype fixtures via the
-- dedicated seed function landed alongside this matrix update (see
-- audits/b07-phase-h-execution-2026-05-11.md §1). The function is idempotent
-- and additive on top of rls_test_seed.
SELECT public.rls_test_seed_b07_phase_h();


-- ============================================================================
-- Section 1 — appointments (8 scenarios: S1-S8)
-- ============================================================================

DO $appointments$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_clinic_b       UUID := '00000099-0000-0000-0000-000000000002';
  s_appt_x         UUID := '00000099-0000-0000-0000-0000000000a0';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'appointments';
  v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_doctor_a,       'doctor_a clinic_a',                          'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.appointments WHERE clinic_id = %L', s_clinic_a)),
    ('S2', s_doctor_a,       'non-existent',                                'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.appointments WHERE id = %L', s_nonexistent)),
    ('S3', s_doctor_b,       'doctor_b clinic_b (no row seeded)',           'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.appointments WHERE clinic_id = %L', s_clinic_b)),
    ('S4', s_doctor_a,       'doctor_a queries clinic_b (cross-clinic)',    'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.appointments WHERE clinic_id = %L', s_clinic_b)),
    ('S5', s_doctor_b,       'doctor_b queries clinic_a appt (bidirectional)', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.appointments WHERE clinic_id = %L', s_clinic_a)),
    ('S6', s_patient_y_user, 'patient_y_user (not patient on this appt) queries', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.appointments WHERE id = %L', s_appt_x)),
    ('S7', s_patient_y_user, 'patient_y_user filter excludes own (others)', 'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.appointments WHERE patient_id <> %L', s_patient_y_user)),
    ('S8', s_frontdesk_a,    'frontdesk_a clinic_a',                        'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.appointments WHERE clinic_id = %L', s_clinic_a))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';

    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN
      EXECUTE rec.sql INTO v_count;
    EXCEPTION
      WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501';
    END;

    EXECUTE 'RESET ROLE';

    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);

    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $appointments$;


-- ============================================================================
-- Section 2 — check_in_queue (8 scenarios: S1-S8)
-- ============================================================================

DO $check_in_queue$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_clinic_b       UUID := '00000099-0000-0000-0000-000000000002';
  s_checkin_x      UUID := '00000099-0000-0000-0000-0000000000a1';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'check_in_queue';
  v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_doctor_a,       'doctor_a clinic_a',         'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.check_in_queue WHERE clinic_id = %L', s_clinic_a)),
    ('S2', s_doctor_a,       'non-existent',              'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.check_in_queue WHERE id = %L', s_nonexistent)),
    ('S3', s_doctor_b,       'doctor_b clinic_b (no row)','FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.check_in_queue WHERE clinic_id = %L', s_clinic_b)),
    ('S4', s_doctor_a,       'doctor_a clinic_b',         'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.check_in_queue WHERE clinic_id = %L', s_clinic_b)),
    ('S5', s_doctor_b,       'doctor_b clinic_a (bidirectional)', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.check_in_queue WHERE clinic_id = %L', s_clinic_a)),
    ('S6', s_patient_y_user, 'patient_y_user (not patient on this queue) queries', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.check_in_queue WHERE id = %L', s_checkin_x)),
    ('S7', s_patient_y_user, 'patient_y_user filter excludes self', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.check_in_queue WHERE patient_id <> %L', s_patient_y_user)),
    ('S8', s_frontdesk_a,    'frontdesk_a clinic_a',      'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.check_in_queue WHERE clinic_id = %L', s_clinic_a))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $check_in_queue$;


-- ============================================================================
-- Section 3 — clinic_memberships (8 scenarios: S1-S8)
-- ============================================================================

DO $clinic_memberships$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_owner_a        UUID := '00000099-0000-0000-0000-000000000013';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_clinic_b       UUID := '00000099-0000-0000-0000-000000000002';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'clinic_memberships';
  v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_doctor_a,       'doctor_a sees clinic_a memberships (3 expected: doctor_a + frontdesk_a + owner_a)', 'SUCCESS', 3, 'READ',
       format('SELECT count(*)::int FROM public.clinic_memberships WHERE clinic_id = %L', s_clinic_a)),
    ('S2', s_doctor_a,       'doctor_a queries non-existent membership', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.clinic_memberships WHERE user_id = %L', s_nonexistent)),
    ('S3', s_doctor_b,       'doctor_b sees clinic_b memberships (1 expected)', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.clinic_memberships WHERE clinic_id = %L', s_clinic_b)),
    ('S4', s_doctor_a,       'doctor_a tries to see clinic_b memberships (cross-clinic NEGATIVE)', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.clinic_memberships WHERE clinic_id = %L', s_clinic_b)),
    ('S5', s_doctor_b,       'doctor_b tries to see clinic_a memberships (bidirectional negative)', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.clinic_memberships WHERE clinic_id = %L', s_clinic_a)),
    ('S6', s_patient_y_user, 'patient_y_user (no clinic membership) sees 0 memberships', 'FAIL', 0, 'READ',
       'SELECT count(*)::int FROM public.clinic_memberships WHERE clinic_id IN (''00000099-0000-0000-0000-000000000001'', ''00000099-0000-0000-0000-000000000002'')'),
    ('S7', s_owner_a,        'owner_a sees clinic_a memberships (3 expected)', 'SUCCESS', 3, 'READ',
       format('SELECT count(*)::int FROM public.clinic_memberships WHERE clinic_id = %L', s_clinic_a)),
    ('S8', s_frontdesk_a,    'frontdesk_a sees clinic_a memberships (3 expected)', 'SUCCESS', 3, 'READ',
       format('SELECT count(*)::int FROM public.clinic_memberships WHERE clinic_id = %L', s_clinic_a))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $clinic_memberships$;


-- ============================================================================
-- Section 4 — clinics (8 scenarios: S1-S8)
-- ============================================================================

DO $clinics$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_owner_a        UUID := '00000099-0000-0000-0000-000000000013';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_clinic_b       UUID := '00000099-0000-0000-0000-000000000002';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'clinics'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_doctor_a,       'doctor_a sees clinic_a',                'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.clinics WHERE id = %L', s_clinic_a)),
    ('S2', s_doctor_a,       'non-existent clinic id',                'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.clinics WHERE id = %L', s_nonexistent)),
    ('S3', s_doctor_b,       'doctor_b sees clinic_b',                'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.clinics WHERE id = %L', s_clinic_b)),
    ('S4', s_doctor_a,       'doctor_a does NOT see clinic_b',        'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.clinics WHERE id = %L', s_clinic_b)),
    ('S5', s_doctor_b,       'doctor_b does NOT see clinic_a (bidirectional)', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.clinics WHERE id = %L', s_clinic_a)),
    ('S6', s_patient_y_user, 'patient_y_user (no clinic) sees 0',     'FAIL',    0, 'READ',
       'SELECT count(*)::int FROM public.clinics WHERE id IN (''00000099-0000-0000-0000-000000000001'', ''00000099-0000-0000-0000-000000000002'')'),
    ('S7', s_owner_a,        'owner_a sees clinic_a',                 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.clinics WHERE id = %L', s_clinic_a)),
    ('S8', s_frontdesk_a,    'frontdesk_a sees clinic_a',             'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.clinics WHERE id = %L', s_clinic_a))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $clinics$;


-- ============================================================================
-- Section 5 — clinical_notes (10 scenarios: S1-S10, including write tests)
-- ============================================================================

DO $clinical_notes$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_patient_x_user UUID := '00000099-0000-0000-0000-000000000021';
  s_patient_z_user UUID := '00000099-0000-0000-0000-000000000022';
  s_patient_x_gp   UUID := '00000099-0000-0000-0000-000000000031';
  s_patient_y_gp   UUID := '00000099-0000-0000-0000-000000000032';
  s_patient_z_gp   UUID := '00000099-0000-0000-0000-000000000033';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_note_y         UUID := '00000099-0000-0000-0000-000000000080';
  s_note_x         UUID := '00000099-0000-0000-0000-000000000081';
  s_note_z         UUID := '00000099-0000-0000-0000-000000000082';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';
  s_pcr_x_at_a     UUID;

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'clinical_notes'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  -- Resolve patient_x's PCR id at clinic_a (auto-generated by seed)
  SELECT pcr.id INTO s_pcr_x_at_a FROM public.patient_clinic_records pcr
   WHERE pcr.global_patient_id = s_patient_x_gp AND pcr.clinic_id = s_clinic_a;

  FOR rec IN SELECT * FROM (VALUES
    ('S1',  s_doctor_a,       'doctor_a reads own clinic note via clinic_a membership', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.clinical_notes WHERE id = %L', s_note_y)),
    ('S2',  s_doctor_a,       'doctor_a reads non-existent id (true negative)',          'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.clinical_notes WHERE id = %L', s_nonexistent)),
    ('S3',  s_doctor_b,       'doctor_b reads patient_x clinic_a note via ACTIVE share', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.clinical_notes WHERE id = %L', s_note_x)),
    ('S4',  s_doctor_b,       'doctor_b reads patient_z clinic_a note via REVOKED share', 'FAIL',   0, 'READ',
       format('SELECT count(*)::int FROM public.clinical_notes WHERE id = %L', s_note_z)),
    ('S5',  s_doctor_b,       'doctor_b reads patient_y clinic_a note via EXPIRED share', 'FAIL',   0, 'READ',
       format('SELECT count(*)::int FROM public.clinical_notes WHERE id = %L', s_note_y)),
    ('S6',  s_patient_y_user, 'patient_y_user reads own clinical_note via patient self', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.clinical_notes WHERE id = %L', s_note_y)),
    ('S7',  s_patient_y_user, 'patient_y_user reads patient_x note (different patient)', 'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.clinical_notes WHERE id = %L', s_note_x)),
    ('S8',  s_frontdesk_a,    'frontdesk_a reads clinic_a notes via clinic membership',  'SUCCESS', 3, 'READ',
       format('SELECT count(*)::int FROM public.clinical_notes WHERE clinic_id = %L', s_clinic_a)),
    ('S9',  s_doctor_b,       'doctor_b INSERT clinic_a note via Path-2 trigger-bypass — RLS RESTRICTIVE binds', 'FAIL', NULL, 'INSERT_DENY',
       format('INSERT INTO public.clinical_notes (doctor_id, patient_id, clinic_id, global_patient_id, patient_clinic_record_id) VALUES (%L, %L, %L, %L, %L)',
              s_doctor_b, s_patient_x_user, s_clinic_a, s_patient_x_gp, s_pcr_x_at_a)),
    ('S10', s_doctor_b,       'doctor_b UPDATE clinic_a note — RESTRICTIVE+PERMISSIVE deny -> 0 rows',           'FAIL', 0, 'UPDATE_NOOP',
       format('UPDATE public.clinical_notes SET plan = ''rls-test-attempted-update'' WHERE id = %L', s_note_x))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';

    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN
      IF rec.kind = 'READ' THEN
        EXECUTE rec.sql INTO v_count;
      ELSIF rec.kind = 'INSERT_DENY' THEN
        EXECUTE rec.sql;
        v_count := 1;  -- INSERT succeeded (unexpected)
      ELSIF rec.kind = 'UPDATE_NOOP' THEN
        EXECUTE rec.sql;
        GET DIAGNOSTICS v_count = ROW_COUNT;
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_caught := TRUE; v_count := NULL; v_notes := 'caught=RLS_BLOCKED_42501';
      WHEN check_violation THEN
        v_caught := TRUE; v_count := NULL; v_notes := 'caught=RLS_BLOCKED_42501';
    END;

    EXECUTE 'RESET ROLE';

    IF rec.kind = 'INSERT_DENY' THEN
      v_pass := v_caught;
    ELSIF rec.kind = 'UPDATE_NOOP' THEN
      v_pass := (v_count = 0) OR v_caught;
      IF v_caught THEN v_count := NULL; END IF;
    ELSE
      v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
             OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    END IF;

    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $clinical_notes$;


-- ============================================================================
-- Section 6 — conversations (8 scenarios: S1-S8)
-- ============================================================================

DO $conversations$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_clinic_b       UUID := '00000099-0000-0000-0000-000000000002';
  s_conv_yx        UUID := '00000099-0000-0000-0000-0000000000a4';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'conversations'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_doctor_a,       'doctor_a sees own conv (doctor_id matches)', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.conversations WHERE id = %L', s_conv_yx)),
    ('S2', s_doctor_a,       'non-existent',                               'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.conversations WHERE id = %L', s_nonexistent)),
    ('S3', s_doctor_b,       'doctor_b not participant, not in clinic_a',  'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.conversations WHERE id = %L', s_conv_yx)),
    ('S4', s_doctor_a,       'doctor_a clinic_b (none)',                   'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.conversations WHERE clinic_id = %L', s_clinic_b)),
    ('S5', s_doctor_b,       'doctor_b cross-clinic to clinic_a',          'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.conversations WHERE clinic_id = %L', s_clinic_a)),
    ('S6', s_patient_y_user, 'patient_y_user sees own conv (patient_id matches)', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.conversations WHERE id = %L', s_conv_yx)),
    ('S7', s_patient_y_user, 'patient_y_user filter excludes own — others','FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.conversations WHERE patient_id <> %L', s_patient_y_user)),
    ('S8', s_frontdesk_a,    'frontdesk_a clinic_a',                       'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.conversations WHERE clinic_id = %L', s_clinic_a))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $conversations$;


-- ============================================================================
-- Section 7 — doctor_availability (8 scenarios: S1-S8)
-- ============================================================================

DO $doctor_availability$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_clinic_b       UUID := '00000099-0000-0000-0000-000000000002';
  s_avail_a        UUID := '00000099-0000-0000-0000-0000000000a3';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'doctor_availability'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_doctor_a,       'doctor_a sees own',                                          'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.doctor_availability WHERE id = %L', s_avail_a)),
    ('S2', s_doctor_a,       'non-existent',                                                'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.doctor_availability WHERE id = %L', s_nonexistent)),
    ('S3', s_doctor_b,       'doctor_b clinic_b (no row)',                                  'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.doctor_availability WHERE clinic_id = %L', s_clinic_b)),
    ('S4', s_doctor_a,       'doctor_a clinic_b',                                           'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.doctor_availability WHERE clinic_id = %L', s_clinic_b)),
    ('S5', s_doctor_b,       'doctor_b cross-clinic (not member)',                          'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.doctor_availability WHERE clinic_id = %L', s_clinic_a)),
    ('S6', s_patient_y_user, 'patient_y_user sees doctor_a availability (booking surface)', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.doctor_availability WHERE doctor_id = %L', s_doctor_a)),
    ('S7', s_patient_y_user, 'patient_y_user queries non-existent',                         'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.doctor_availability WHERE id = %L', s_nonexistent)),
    ('S8', s_frontdesk_a,    'frontdesk_a clinic_a',                                        'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.doctor_availability WHERE clinic_id = %L', s_clinic_a))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $doctor_availability$;


-- ============================================================================
-- Section 8 — doctors (8 scenarios: S1-S8; mostly SUCCESS — public-by-spec C6)
-- ============================================================================

DO $doctors$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_owner_a        UUID := '00000099-0000-0000-0000-000000000013';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'doctors'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_doctor_a,       'doctor_a sees self',                                       'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.doctors WHERE id = %L', s_doctor_a)),
    ('S2', s_doctor_a,       'non-existent doctor',                                      'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.doctors WHERE id = %L', s_nonexistent)),
    ('S3', s_doctor_a,       'doctor_a sees doctor_b (cross-clinic — public per spec § C6)', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.doctors WHERE id = %L', s_doctor_b)),
    ('S4', s_patient_y_user, 'patient_y_user sees doctor_a (booking surface)',           'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.doctors WHERE id = %L', s_doctor_a)),
    ('S5', s_patient_y_user, 'patient_y_user sees doctor_b (booking surface)',           'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.doctors WHERE id = %L', s_doctor_b)),
    ('S6', s_patient_y_user, 'patient_y_user sees owner_a (also a doctor)',              'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.doctors WHERE id = %L', s_owner_a)),
    ('S7', s_doctor_a,       'doctor_a sees owner_a (any authenticated)',                'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.doctors WHERE id = %L', s_owner_a)),
    ('S8', s_frontdesk_a,    'frontdesk_a sees doctor_a (any authenticated)',            'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.doctors WHERE id = %L', s_doctor_a))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $doctors$;


-- ============================================================================
-- Section 9 — global_patients (8 scenarios: S1-S8)
-- ============================================================================

DO $global_patients$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_patient_x_gp   UUID := '00000099-0000-0000-0000-000000000031';
  s_patient_y_gp   UUID := '00000099-0000-0000-0000-000000000032';
  s_patient_z_gp   UUID := '00000099-0000-0000-0000-000000000033';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'global_patients'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_doctor_a,       'doctor_a reads patient_x gp via clinic_a PCR', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', s_patient_x_gp)),
    ('S2', s_doctor_a,       'doctor_a reads non-existent gp (true negative)', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', s_nonexistent)),
    ('S3', s_doctor_b,       'doctor_b reads patient_x gp via clinic_b PCR (direct path)', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', s_patient_x_gp)),
    ('S4', s_doctor_b,       'doctor_b reads patient_y gp via expired share only (no PCR at B) — identity NOT exposed', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', s_patient_y_gp)),
    ('S5', s_doctor_b,       'doctor_b reads patient_z gp via revoked share only (no PCR at B) — identity NOT exposed', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', s_patient_z_gp)),
    ('S6', s_patient_y_user, 'patient_y_user reads own gp (claimed)', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', s_patient_y_gp)),
    ('S7', s_patient_y_user, 'patient_y_user reads OTHER patient (patient_x) gp', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', s_patient_x_gp)),
    ('S8', s_frontdesk_a,    'frontdesk_a reads patient_x gp via clinic_a PCR', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', s_patient_x_gp))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $global_patients$;


-- ============================================================================
-- Section 10 — messages (8 scenarios: S1-S8)
-- ============================================================================

DO $messages$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_patient_x_user UUID := '00000099-0000-0000-0000-000000000021';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_clinic_b       UUID := '00000099-0000-0000-0000-000000000002';
  s_msg_yx         UUID := '00000099-0000-0000-0000-0000000000a5';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'messages'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_doctor_a,       'doctor_a sees own message (sender)',         'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.messages WHERE id = %L', s_msg_yx)),
    ('S2', s_doctor_a,       'non-existent',                                'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.messages WHERE id = %L', s_nonexistent)),
    ('S3', s_doctor_b,       'doctor_b not participant, not in clinic_a',  'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.messages WHERE id = %L', s_msg_yx)),
    ('S4', s_doctor_a,       'doctor_a clinic_b (none)',                   'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.messages WHERE clinic_id = %L', s_clinic_b)),
    ('S5', s_doctor_b,       'doctor_b cross-clinic to A (not participant, not member)', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.messages WHERE clinic_id = %L', s_clinic_a)),
    ('S6', s_patient_y_user, 'patient_y_user sees msg (participant via conversation)', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.messages WHERE id = %L', s_msg_yx)),
    ('S7', s_patient_x_user, 'patient_x_user (not participant) does not see', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.messages WHERE id = %L', s_msg_yx)),
    ('S8', s_frontdesk_a,    'frontdesk_a clinic_a',                       'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.messages WHERE clinic_id = %L', s_clinic_a))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $messages$;


-- ============================================================================
-- Section 11 — notifications (8 scenarios: S1-S8; user-scoped via recipient_id)
-- ============================================================================

DO $notifications$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_owner_a        UUID := '00000099-0000-0000-0000-000000000013';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_notif_y        UUID := '00000099-0000-0000-0000-0000000000a6';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'notifications'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_patient_y_user, 'patient_y_user (recipient) sees own',          'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.notifications WHERE id = %L', s_notif_y)),
    ('S2', s_patient_y_user, 'non-existent',                                  'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.notifications WHERE id = %L', s_nonexistent)),
    ('S3', s_doctor_a,       'doctor_a (not recipient)',                      'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.notifications WHERE id = %L', s_notif_y)),
    ('S4', s_doctor_b,       'doctor_b (not recipient)',                      'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.notifications WHERE id = %L', s_notif_y)),
    ('S5', s_frontdesk_a,    'frontdesk_a (not recipient)',                   'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.notifications WHERE id = %L', s_notif_y)),
    ('S6', s_owner_a,        'owner_a (not recipient)',                       'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.notifications WHERE id = %L', s_notif_y)),
    ('S7', s_patient_y_user, 'recipient queries cross-recipient (filter)',    'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.notifications WHERE recipient_id <> %L', s_patient_y_user)),
    ('S8', s_patient_y_user, 'recipient counts all own',                      'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.notifications WHERE recipient_id = %L', s_patient_y_user))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $notifications$;


-- ============================================================================
-- Section 12 — patient_clinic_records (8 scenarios: S1-S8)
-- ============================================================================

DO $pcr$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_patient_x_gp   UUID := '00000099-0000-0000-0000-000000000031';
  s_patient_y_gp   UUID := '00000099-0000-0000-0000-000000000032';
  s_patient_z_gp   UUID := '00000099-0000-0000-0000-000000000033';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_clinic_b       UUID := '00000099-0000-0000-0000-000000000002';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'patient_clinic_records'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_doctor_a,       'doctor_a reads patient_x PCR at clinic_a (clinic-self)', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.patient_clinic_records WHERE global_patient_id = %L AND clinic_id = %L', s_patient_x_gp, s_clinic_a)),
    ('S2', s_doctor_a,       'doctor_a reads patient_x PCR at clinic_b (not member)',  'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.patient_clinic_records WHERE global_patient_id = %L AND clinic_id = %L', s_patient_x_gp, s_clinic_b)),
    ('S3', s_doctor_b,       'doctor_b reads patient_x PCR at clinic_b (clinic-self)', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.patient_clinic_records WHERE global_patient_id = %L AND clinic_id = %L', s_patient_x_gp, s_clinic_b)),
    ('S4', s_doctor_b,       'doctor_b reads patient_y PCR at clinic_a (expired share, not member of A)', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.patient_clinic_records WHERE global_patient_id = %L AND clinic_id = %L', s_patient_y_gp, s_clinic_a)),
    ('S5', s_doctor_b,       'doctor_b reads patient_z PCR at clinic_a (revoked share, not member of A)', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.patient_clinic_records WHERE global_patient_id = %L AND clinic_id = %L', s_patient_z_gp, s_clinic_a)),
    ('S6', s_patient_y_user, 'patient_y_user reads own PCRs (patient self)', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.patient_clinic_records WHERE global_patient_id = %L', s_patient_y_gp)),
    ('S7', s_patient_y_user, 'patient_y_user reads OTHER patient (patient_x) PCRs', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.patient_clinic_records WHERE global_patient_id = %L', s_patient_x_gp)),
    ('S8', s_frontdesk_a,    'frontdesk_a reads patient_x PCR at clinic_a', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.patient_clinic_records WHERE global_patient_id = %L AND clinic_id = %L', s_patient_x_gp, s_clinic_a))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $pcr$;


-- ============================================================================
-- Section 13 — patient_data_shares (8 scenarios: S1-S8)
-- ============================================================================

DO $pds$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_patient_y_gp   UUID := '00000099-0000-0000-0000-000000000032';
  s_patient_x_gp   UUID := '00000099-0000-0000-0000-000000000031';
  s_share_active   UUID := '00000099-0000-0000-0000-000000000050';
  s_share_revoked  UUID := '00000099-0000-0000-0000-000000000051';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'patient_data_shares'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_doctor_a,       'doctor_a (grantor side) sees all 3 shares', 'SUCCESS', 3, 'READ',
       format('SELECT count(*)::int FROM public.patient_data_shares WHERE grantor_clinic_id = %L', s_clinic_a)),
    ('S2', s_doctor_a,       'doctor_a queries non-existent share id (true negative)', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.patient_data_shares WHERE id = %L', s_nonexistent)),
    ('S3', s_doctor_b,       'doctor_b (grantee side) sees all 3 shares incl. revoked/expired', 'SUCCESS', 3, 'READ',
       'SELECT count(*)::int FROM public.patient_data_shares WHERE grantee_clinic_id = ''00000099-0000-0000-0000-000000000002'''),
    ('S4', s_doctor_b,       'doctor_b reads ACTIVE share row (visible to grantee member)', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.patient_data_shares WHERE id = %L', s_share_active)),
    ('S5', s_doctor_b,       'doctor_b reads REVOKED share row (still visible — metadata only; access is gated by helper)', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.patient_data_shares WHERE id = %L', s_share_revoked)),
    ('S6', s_patient_y_user, 'patient_y_user reads own share via patient-self path', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.patient_data_shares WHERE global_patient_id = %L', s_patient_y_gp)),
    ('S7', s_patient_y_user, 'patient_y_user reads OTHER patient share', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.patient_data_shares WHERE global_patient_id = %L', s_patient_x_gp)),
    ('S8', s_frontdesk_a,    'frontdesk_a (grantor clinic member) sees all 3 grantor shares', 'SUCCESS', 3, 'READ',
       format('SELECT count(*)::int FROM public.patient_data_shares WHERE grantor_clinic_id = %L', s_clinic_a))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $pds$;


-- ============================================================================
-- Section 14 — patient_privacy_codes (4 scenarios: S1-S4, all DENY-ALL)
-- ============================================================================

DO $ppc$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_owner_a        UUID := '00000099-0000-0000-0000-000000000013';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_priv_code      UUID := '00000099-0000-0000-0000-000000000070';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'patient_privacy_codes'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_doctor_a,       'doctor_a (DOCTOR clinic_a) — DENY-ALL hides seeded code', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.patient_privacy_codes WHERE id = %L', s_priv_code)),
    ('S2', s_owner_a,        'owner_a (OWNER clinic_a) — DENY-ALL hides even OWNER',     'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.patient_privacy_codes WHERE id = %L', s_priv_code)),
    ('S3', s_patient_y_user, 'patient_y_user (claimed patient) — DENY-ALL hides own code (access via verify_privacy_code RPC only)', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.patient_privacy_codes WHERE id = %L', s_priv_code)),
    ('S4', s_doctor_b,       'doctor_b (DOCTOR clinic_b) — DENY-ALL hides any code regardless of clinic', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.patient_privacy_codes WHERE id = %L', s_priv_code))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $ppc$;


-- ============================================================================
-- Section 15 — payments (8 scenarios: S1-S8)
-- ============================================================================

DO $payments$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_clinic_b       UUID := '00000099-0000-0000-0000-000000000002';
  s_payment_x      UUID := '00000099-0000-0000-0000-0000000000a2';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'payments'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_doctor_a,       'doctor_a clinic_a',                                 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.payments WHERE clinic_id = %L', s_clinic_a)),
    ('S2', s_doctor_a,       'non-existent',                                       'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.payments WHERE id = %L', s_nonexistent)),
    ('S3', s_doctor_b,       'doctor_b clinic_b',                                  'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.payments WHERE clinic_id = %L', s_clinic_b)),
    ('S4', s_doctor_a,       'doctor_a clinic_b',                                  'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.payments WHERE clinic_id = %L', s_clinic_b)),
    ('S5', s_doctor_b,       'doctor_b clinic_a (bidirectional)',                  'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.payments WHERE clinic_id = %L', s_clinic_a)),
    ('S6', s_patient_y_user, 'patient_y_user (not patient on this payment) queries', 'FAIL',  0, 'READ',
       format('SELECT count(*)::int FROM public.payments WHERE id = %L', s_payment_x)),
    ('S7', s_patient_y_user, 'patient_y_user filter excludes self',                'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.payments WHERE patient_id <> %L', s_patient_y_user)),
    ('S8', s_frontdesk_a,    'frontdesk_a clinic_a',                               'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.payments WHERE clinic_id = %L', s_clinic_a))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $payments$;


-- ============================================================================
-- Section 16 — privacy_code_attempts (8 scenarios: S1-S8; OWNER-only at clinic)
-- ============================================================================

DO $pca$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_owner_a        UUID := '00000099-0000-0000-0000-000000000013';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_patient_y_gp   UUID := '00000099-0000-0000-0000-000000000032';
  s_patient_x_gp   UUID := '00000099-0000-0000-0000-000000000031';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_clinic_b       UUID := '00000099-0000-0000-0000-000000000002';
  s_attempt        UUID := '00000099-0000-0000-0000-000000000071';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'privacy_code_attempts'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_doctor_a,       'doctor_a (DOCTOR, not OWNER) — should NOT see attempts at own clinic', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.privacy_code_attempts WHERE attempted_by_clinic_id = %L', s_clinic_a)),
    ('S2', s_doctor_a,       'doctor_a queries non-existent attempt id', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.privacy_code_attempts WHERE id = %L', s_nonexistent)),
    ('S3', s_doctor_b,       'doctor_b at clinic_b — no attempts originating there', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.privacy_code_attempts WHERE attempted_by_clinic_id = %L', s_clinic_b)),
    ('S4', s_owner_a,        'owner_a (OWNER clinic_a) reads attempt originating at clinic_a', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.privacy_code_attempts WHERE id = %L', s_attempt)),
    ('S5', s_owner_a,        'owner_a (clinic_a OWNER) reads attempts at clinic_b — must see 0', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.privacy_code_attempts WHERE attempted_by_clinic_id = %L', s_clinic_b)),
    ('S6', s_patient_y_user, 'patient_y_user reads own attempt (patient self path)', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.privacy_code_attempts WHERE global_patient_id = %L', s_patient_y_gp)),
    ('S7', s_patient_y_user, 'patient_y_user queries OTHER patient_x attempts (none seeded but policy denies anyway)', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.privacy_code_attempts WHERE global_patient_id = %L', s_patient_x_gp)),
    ('S8', s_frontdesk_a,    'frontdesk_a (FRONT_DESK, not OWNER) — should NOT see attempts', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.privacy_code_attempts WHERE attempted_by_clinic_id = %L', s_clinic_a))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $pca$;


-- ============================================================================
-- Section 17 — privacy_code_sms_tokens (4 scenarios: S1-S4, DENY-ALL)
-- ============================================================================

DO $pcst$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_owner_a        UUID := '00000099-0000-0000-0000-000000000013';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_sms_token      UUID := '00000099-0000-0000-0000-000000000072';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'privacy_code_sms_tokens'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_doctor_b,       'doctor_b (requesting doctor) — DENY-ALL hides own request', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.privacy_code_sms_tokens WHERE id = %L', s_sms_token)),
    ('S2', s_owner_a,        'owner_a (OWNER) — DENY-ALL hides even OWNER role',           'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.privacy_code_sms_tokens WHERE id = %L', s_sms_token)),
    ('S3', s_patient_y_user, 'patient_y_user — DENY-ALL hides any token (access via verify_sms_code RPC)', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.privacy_code_sms_tokens WHERE id = %L', s_sms_token)),
    ('S4', s_doctor_a,       'doctor_a (DOCTOR clinic_a) — DENY-ALL hides any token',     'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.privacy_code_sms_tokens WHERE id = %L', s_sms_token))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $pcst$;


-- ============================================================================
-- Section 18 — users (8 scenarios: S1-S8)
-- ============================================================================

DO $users$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'users'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S1', s_doctor_a,       'doctor_a sees self',                                                'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.users WHERE id = %L', s_doctor_a)),
    ('S2', s_doctor_a,       'doctor_a queries non-existent user',                                 'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.users WHERE id = %L', s_nonexistent)),
    ('S3', s_doctor_a,       'doctor_a sees colleagues at clinic_a (self + frontdesk_a + owner_a = 3)', 'SUCCESS', 3, 'READ',
       'SELECT count(*)::int FROM public.users WHERE id IN (''00000099-0000-0000-0000-000000000010'', ''00000099-0000-0000-0000-000000000012'', ''00000099-0000-0000-0000-000000000013'')'),
    ('S4', s_doctor_a,       'doctor_a does NOT see doctor_b (different clinic) — KEY WIRING TEST', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.users WHERE id = %L', s_doctor_b)),
    ('S5', s_doctor_b,       'doctor_b does NOT see doctor_a (bidirectional NEGATIVE)',            'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.users WHERE id = %L', s_doctor_a)),
    ('S6', s_patient_y_user, 'patient_y_user (no clinic membership) sees only self',               'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.users WHERE id = %L', s_patient_y_user)),
    ('S7', s_patient_y_user, 'patient_y_user does NOT see doctor_a',                               'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.users WHERE id = %L', s_doctor_a)),
    ('S8', s_frontdesk_a,    'frontdesk_a sees clinic_a colleagues (3)',                           'SUCCESS', 3, 'READ',
       'SELECT count(*)::int FROM public.users WHERE id IN (''00000099-0000-0000-0000-000000000010'', ''00000099-0000-0000-0000-000000000012'', ''00000099-0000-0000-0000-000000000013'')')
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $users$;


-- ============================================================================
-- Section 19 — audit_events (4 scenarios: S6, S7a, S7b, S7c)
--
-- IMPORTANT — audit_events.S6 expected_rows is HARDCODED to 1 (mig 108 fix).
-- ----------------------------------------------------------------------------
-- Pre-mig-108 (run #1, run #1.5): rls_test_teardown() only cleaned
-- audit_events rows with entity_type IN ('global_patients',
-- 'patient_data_share'); PCR audit rows (entity_type='patient_clinic_record',
-- emitted by mig 088's tg_audit_pcr_insert_trg) accumulated +4 rows per
-- seed cycle across the three test gps. Run #1 captured 8 (cycle 8 of the
-- historical seed-teardown loop); run #1.5 saw 10 (cycle 10).
--
-- The pre-fix matrix worked around this by computing S6's expected_rows
-- DYNAMICALLY at run time from postgres role (v_y_baseline). Outcome match
-- (SUCCESS=SUCCESS) was preserved but the row-count value drifted cycle-
-- over-cycle, breaking run-to-run comparability for that one scenario.
--
-- Post-mig-108 (run #1.6 onwards): teardown also cleans audit_events rows
-- where resolved_global_patient_id = ANY(test_gps), so each seed cycle
-- starts from a clean baseline. The seed inserts 1 PCR per gp at clinic_a
-- (plus an extra clinic_b PCR for patient_x), so post-seed audit_events
-- contains exactly 1 row resolving to patient_y_gp (clinic_a PCR INSERT).
-- This matrix file pins audit_events.S6 expected_rows to that hardcoded
-- value of 1 — D-074 amendment.
--
-- The comparison query against run #1 will report row-count divergence on
-- audit_events.S6 (8 vs 1); outcome match (SUCCESS=SUCCESS) preserved.
-- The divergence is the *expected* post-fix invariant, not a regression.
-- S7a/b/c stay at 0 (FAIL) — leaks remain 0 regardless of cycle / fix.
-- ============================================================================

DO $audit_events$
DECLARE
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_patient_x_gp   UUID := '00000099-0000-0000-0000-000000000031';
  s_patient_y_gp   UUID := '00000099-0000-0000-0000-000000000032';
  s_patient_z_gp   UUID := '00000099-0000-0000-0000-000000000033';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'audit_events'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S6',  s_patient_y_user,
       'patient_y_user sees own audit rows via resolved_global_patient_id (1 expected post-mig-108; was 8 in run #1 due to seed-cycle accumulation pre-fix)',
       'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.audit_events WHERE resolved_global_patient_id = %L', s_patient_y_gp)),
    ('S7a', s_patient_y_user, 'patient_y_user does NOT see patient_x audit rows (0; ground truth 16)', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.audit_events WHERE resolved_global_patient_id = %L', s_patient_x_gp)),
    ('S7b', s_patient_y_user, 'patient_y_user does NOT see patient_z audit rows (0; ground truth 8)', 'FAIL', 0, 'READ',
       format('SELECT count(*)::int FROM public.audit_events WHERE resolved_global_patient_id = %L', s_patient_z_gp)),
    ('S7c', s_patient_y_user, 'patient_y_user does NOT see admin/unresolved audit rows (0; ground truth ~196)', 'FAIL', 0, 'READ',
       'SELECT count(*)::int FROM public.audit_events WHERE resolved_global_patient_id IS NULL')
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN EXECUTE rec.sql INTO v_count;
    EXCEPTION WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501'; END;
    EXECUTE 'RESET ROLE';
    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $audit_events$;


-- ============================================================================
-- Sections 20-24 — clinical-data tables (7 scenarios each:
-- S1, S2, S3, S7, S8, S9 INSERT_DENY, S10 UPDATE_NOOP)
--
-- imaging_orders, lab_orders, lab_results, prescription_items, vital_signs
--
-- These five tables share an identical scenario shape per run #1; only the
-- target table + S9 INSERT column-list differs. Each gets its own DO block.
-- ============================================================================


-- ============================================================================
-- Section 20 — imaging_orders
-- ============================================================================

DO $imaging_orders$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_patient_x_user UUID := '00000099-0000-0000-0000-000000000021';
  s_patient_x_gp   UUID := '00000099-0000-0000-0000-000000000031';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_imaging_x      UUID := '00000099-0000-0000-0000-000000000092';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';
  s_pcr_x_at_a     UUID;

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'imaging_orders'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  SELECT pcr.id INTO s_pcr_x_at_a FROM public.patient_clinic_records pcr
   WHERE pcr.global_patient_id = s_patient_x_gp AND pcr.clinic_id = s_clinic_a;

  FOR rec IN SELECT * FROM (VALUES
    ('S1',  s_doctor_a,       'doctor_a sees own row',                            'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.imaging_orders WHERE id = %L', s_imaging_x)),
    ('S2',  s_doctor_a,       'non-existent id',                                  'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.imaging_orders WHERE id = %L', s_nonexistent)),
    ('S3',  s_doctor_b,       'doctor_b reads via ACTIVE share',                  'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.imaging_orders WHERE id = %L', s_imaging_x)),
    ('S7',  s_patient_y_user, 'patient_y_user reads patient_x',                   'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.imaging_orders WHERE id = %L', s_imaging_x)),
    ('S8',  s_frontdesk_a,    'frontdesk_a reads clinic_a',                       'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.imaging_orders WHERE clinic_id = %L', s_clinic_a)),
    ('S9',  s_doctor_b,       'doctor_b cross-clinic INSERT',                     'FAIL', NULL, 'INSERT_DENY',
       format('INSERT INTO public.imaging_orders (doctor_id, patient_id, modality, study_name, clinic_id, global_patient_id, patient_clinic_record_id) VALUES (%L, %L, ''ct'', ''rls-1.5-attempt'', %L, %L, %L)',
              s_doctor_b, s_patient_x_user, s_clinic_a, s_patient_x_gp, s_pcr_x_at_a)),
    ('S10', s_doctor_b,       'doctor_b cross-clinic UPDATE',                     'FAIL', 0, 'UPDATE_NOOP',
       format('UPDATE public.imaging_orders SET study_name = ''rls-1.5-update-attempt'' WHERE id = %L', s_imaging_x))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN
      IF rec.kind = 'READ' THEN EXECUTE rec.sql INTO v_count;
      ELSIF rec.kind = 'INSERT_DENY' THEN EXECUTE rec.sql; v_count := 1;
      ELSIF rec.kind = 'UPDATE_NOOP' THEN EXECUTE rec.sql; GET DIAGNOSTICS v_count = ROW_COUNT;
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN v_caught := TRUE; v_count := NULL; v_notes := 'caught=RLS_BLOCKED_42501';
      WHEN check_violation THEN v_caught := TRUE; v_count := NULL; v_notes := 'caught=RLS_BLOCKED_42501';
    END;
    EXECUTE 'RESET ROLE';
    IF rec.kind = 'INSERT_DENY' THEN
      v_pass := v_caught;
    ELSIF rec.kind = 'UPDATE_NOOP' THEN
      v_pass := (v_count = 0) OR v_caught;
      IF v_caught THEN v_count := NULL; END IF;
    ELSE
      v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
             OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    END IF;
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $imaging_orders$;


-- ============================================================================
-- Section 21 — lab_orders
-- ============================================================================

DO $lab_orders$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_patient_x_user UUID := '00000099-0000-0000-0000-000000000021';
  s_patient_x_gp   UUID := '00000099-0000-0000-0000-000000000031';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_lab_order_x    UUID := '00000099-0000-0000-0000-000000000090';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';
  s_pcr_x_at_a     UUID;

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'lab_orders'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  SELECT pcr.id INTO s_pcr_x_at_a FROM public.patient_clinic_records pcr
   WHERE pcr.global_patient_id = s_patient_x_gp AND pcr.clinic_id = s_clinic_a;

  FOR rec IN SELECT * FROM (VALUES
    ('S1',  s_doctor_a,       'doctor_a sees own clinic_a row',     'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.lab_orders WHERE id = %L', s_lab_order_x)),
    ('S2',  s_doctor_a,       'non-existent id',                    'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.lab_orders WHERE id = %L', s_nonexistent)),
    ('S3',  s_doctor_b,       'doctor_b reads via ACTIVE share',    'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.lab_orders WHERE id = %L', s_lab_order_x)),
    ('S7',  s_patient_y_user, 'patient_y_user reads patient_x',     'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.lab_orders WHERE id = %L', s_lab_order_x)),
    ('S8',  s_frontdesk_a,    'frontdesk_a reads clinic_a',          'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.lab_orders WHERE clinic_id = %L', s_clinic_a)),
    ('S9',  s_doctor_b,       'doctor_b cross-clinic INSERT',       'FAIL', NULL, 'INSERT_DENY',
       format('INSERT INTO public.lab_orders (doctor_id, patient_id, clinic_id, global_patient_id, patient_clinic_record_id) VALUES (%L, %L, %L, %L, %L)',
              s_doctor_b, s_patient_x_user, s_clinic_a, s_patient_x_gp, s_pcr_x_at_a)),
    ('S10', s_doctor_b,       'doctor_b cross-clinic UPDATE',       'FAIL', 0, 'UPDATE_NOOP',
       format('UPDATE public.lab_orders SET notes = ''rls-1.5-update-attempt'' WHERE id = %L', s_lab_order_x))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN
      IF rec.kind = 'READ' THEN EXECUTE rec.sql INTO v_count;
      ELSIF rec.kind = 'INSERT_DENY' THEN EXECUTE rec.sql; v_count := 1;
      ELSIF rec.kind = 'UPDATE_NOOP' THEN EXECUTE rec.sql; GET DIAGNOSTICS v_count = ROW_COUNT;
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN v_caught := TRUE; v_count := NULL; v_notes := 'caught=RLS_BLOCKED_42501';
      WHEN check_violation THEN v_caught := TRUE; v_count := NULL; v_notes := 'caught=RLS_BLOCKED_42501';
    END;
    EXECUTE 'RESET ROLE';
    IF rec.kind = 'INSERT_DENY' THEN
      v_pass := v_caught;
    ELSIF rec.kind = 'UPDATE_NOOP' THEN
      v_pass := (v_count = 0) OR v_caught;
      IF v_caught THEN v_count := NULL; END IF;
    ELSE
      v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
             OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    END IF;
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $lab_orders$;


-- ============================================================================
-- Section 22 — lab_results (S9 INSERT requires lab_order_id + lab_test_id FK)
-- ============================================================================

DO $lab_results$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_patient_x_gp   UUID := '00000099-0000-0000-0000-000000000031';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_lab_order_x    UUID := '00000099-0000-0000-0000-000000000090';
  s_lab_result_x   UUID := '00000099-0000-0000-0000-000000000091';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';
  s_pcr_x_at_a     UUID;
  s_lab_test_id    UUID;

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'lab_results'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  SELECT pcr.id INTO s_pcr_x_at_a FROM public.patient_clinic_records pcr
   WHERE pcr.global_patient_id = s_patient_x_gp AND pcr.clinic_id = s_clinic_a;
  SELECT lt.id INTO s_lab_test_id FROM public.lab_tests lt LIMIT 1;

  FOR rec IN SELECT * FROM (VALUES
    ('S1',  s_doctor_a,       'doctor_a sees own row',           'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.lab_results WHERE id = %L', s_lab_result_x)),
    ('S2',  s_doctor_a,       'non-existent id',                  'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.lab_results WHERE id = %L', s_nonexistent)),
    ('S3',  s_doctor_b,       'doctor_b reads via ACTIVE share', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.lab_results WHERE id = %L', s_lab_result_x)),
    ('S7',  s_patient_y_user, 'patient_y_user reads patient_x',  'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.lab_results WHERE id = %L', s_lab_result_x)),
    ('S8',  s_frontdesk_a,    'frontdesk_a reads clinic_a',       'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.lab_results WHERE clinic_id = %L', s_clinic_a)),
    ('S9',  s_doctor_b,       'doctor_b cross-clinic INSERT',    'FAIL', NULL, 'INSERT_DENY',
       format('INSERT INTO public.lab_results (lab_order_id, lab_test_id, clinic_id, global_patient_id, patient_clinic_record_id) VALUES (%L, %L, %L, %L, %L)',
              s_lab_order_x, s_lab_test_id, s_clinic_a, s_patient_x_gp, s_pcr_x_at_a)),
    ('S10', s_doctor_b,       'doctor_b cross-clinic UPDATE',    'FAIL', 0, 'UPDATE_NOOP',
       format('UPDATE public.lab_results SET result_text = ''rls-1.5-update-attempt'' WHERE id = %L', s_lab_result_x))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN
      IF rec.kind = 'READ' THEN EXECUTE rec.sql INTO v_count;
      ELSIF rec.kind = 'INSERT_DENY' THEN EXECUTE rec.sql; v_count := 1;
      ELSIF rec.kind = 'UPDATE_NOOP' THEN EXECUTE rec.sql; GET DIAGNOSTICS v_count = ROW_COUNT;
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN v_caught := TRUE; v_count := NULL; v_notes := 'caught=RLS_BLOCKED_42501';
      WHEN check_violation THEN v_caught := TRUE; v_count := NULL; v_notes := 'caught=RLS_BLOCKED_42501';
    END;
    EXECUTE 'RESET ROLE';
    IF rec.kind = 'INSERT_DENY' THEN
      v_pass := v_caught;
    ELSIF rec.kind = 'UPDATE_NOOP' THEN
      v_pass := (v_count = 0) OR v_caught;
      IF v_caught THEN v_count := NULL; END IF;
    ELSE
      v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
             OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    END IF;
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $lab_results$;


-- ============================================================================
-- Section 23 — prescription_items
-- ============================================================================

DO $prescription_items$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_patient_x_user UUID := '00000099-0000-0000-0000-000000000021';
  s_patient_x_gp   UUID := '00000099-0000-0000-0000-000000000031';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_note_x         UUID := '00000099-0000-0000-0000-000000000081';
  s_pres_x         UUID := '00000099-0000-0000-0000-000000000094';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';
  s_pcr_x_at_a     UUID;

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'prescription_items'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  SELECT pcr.id INTO s_pcr_x_at_a FROM public.patient_clinic_records pcr
   WHERE pcr.global_patient_id = s_patient_x_gp AND pcr.clinic_id = s_clinic_a;

  FOR rec IN SELECT * FROM (VALUES
    ('S1',  s_doctor_a,       'doctor_a sees own row',          'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.prescription_items WHERE id = %L', s_pres_x)),
    ('S2',  s_doctor_a,       'non-existent id',                'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.prescription_items WHERE id = %L', s_nonexistent)),
    ('S3',  s_doctor_b,       'doctor_b reads via ACTIVE share', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.prescription_items WHERE id = %L', s_pres_x)),
    ('S7',  s_patient_y_user, 'patient_y_user reads patient_x', 'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.prescription_items WHERE id = %L', s_pres_x)),
    ('S8',  s_frontdesk_a,    'frontdesk_a reads clinic_a',      'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.prescription_items WHERE clinic_id = %L', s_clinic_a)),
    ('S9',  s_doctor_b,       'doctor_b cross-clinic INSERT',   'FAIL', NULL, 'INSERT_DENY',
       format('INSERT INTO public.prescription_items (clinical_note_id, patient_id, doctor_id, drug_name, frequency, duration, clinic_id, global_patient_id, patient_clinic_record_id) VALUES (%L, %L, %L, ''rls-1.5-attempt-drug'', ''daily'', ''7d'', %L, %L, %L)',
              s_note_x, s_patient_x_user, s_doctor_b, s_clinic_a, s_patient_x_gp, s_pcr_x_at_a)),
    ('S10', s_doctor_b,       'doctor_b cross-clinic UPDATE',   'FAIL', 0, 'UPDATE_NOOP',
       format('UPDATE public.prescription_items SET drug_name = ''rls-1.5-update-attempt'' WHERE id = %L', s_pres_x))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN
      IF rec.kind = 'READ' THEN EXECUTE rec.sql INTO v_count;
      ELSIF rec.kind = 'INSERT_DENY' THEN EXECUTE rec.sql; v_count := 1;
      ELSIF rec.kind = 'UPDATE_NOOP' THEN EXECUTE rec.sql; GET DIAGNOSTICS v_count = ROW_COUNT;
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN v_caught := TRUE; v_count := NULL; v_notes := 'caught=RLS_BLOCKED_42501';
      WHEN check_violation THEN v_caught := TRUE; v_count := NULL; v_notes := 'caught=RLS_BLOCKED_42501';
    END;
    EXECUTE 'RESET ROLE';
    IF rec.kind = 'INSERT_DENY' THEN
      v_pass := v_caught;
    ELSIF rec.kind = 'UPDATE_NOOP' THEN
      v_pass := (v_count = 0) OR v_caught;
      IF v_caught THEN v_count := NULL; END IF;
    ELSE
      v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
             OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    END IF;
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $prescription_items$;


-- ============================================================================
-- Section 24 — vital_signs
-- ============================================================================

DO $vital_signs$
DECLARE
  s_doctor_a       UUID := '00000099-0000-0000-0000-000000000010';
  s_doctor_b       UUID := '00000099-0000-0000-0000-000000000011';
  s_frontdesk_a    UUID := '00000099-0000-0000-0000-000000000012';
  s_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  s_patient_x_user UUID := '00000099-0000-0000-0000-000000000021';
  s_patient_x_gp   UUID := '00000099-0000-0000-0000-000000000031';
  s_clinic_a       UUID := '00000099-0000-0000-0000-000000000001';
  s_vital_x        UUID := '00000099-0000-0000-0000-000000000093';
  s_nonexistent    UUID := '99999999-9999-9999-9999-999999999999';
  s_pcr_x_at_a     UUID;

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT := 'vital_signs'; v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  SELECT pcr.id INTO s_pcr_x_at_a FROM public.patient_clinic_records pcr
   WHERE pcr.global_patient_id = s_patient_x_gp AND pcr.clinic_id = s_clinic_a;

  FOR rec IN SELECT * FROM (VALUES
    ('S1',  s_doctor_a,       'doctor_a sees own row',          'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.vital_signs WHERE id = %L', s_vital_x)),
    ('S2',  s_doctor_a,       'non-existent id',                'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.vital_signs WHERE id = %L', s_nonexistent)),
    ('S3',  s_doctor_b,       'doctor_b reads via ACTIVE share', 'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.vital_signs WHERE id = %L', s_vital_x)),
    ('S7',  s_patient_y_user, 'patient_y_user reads patient_x', 'FAIL',    0, 'READ',
       format('SELECT count(*)::int FROM public.vital_signs WHERE id = %L', s_vital_x)),
    ('S8',  s_frontdesk_a,    'frontdesk_a reads clinic_a',      'SUCCESS', 1, 'READ',
       format('SELECT count(*)::int FROM public.vital_signs WHERE clinic_id = %L', s_clinic_a)),
    ('S9',  s_doctor_b,       'doctor_b cross-clinic INSERT',   'FAIL', NULL, 'INSERT_DENY',
       format('INSERT INTO public.vital_signs (doctor_id, patient_id, clinic_id, global_patient_id, patient_clinic_record_id) VALUES (%L, %L, %L, %L, %L)',
              s_doctor_b, s_patient_x_user, s_clinic_a, s_patient_x_gp, s_pcr_x_at_a)),
    ('S10', s_doctor_b,       'doctor_b cross-clinic UPDATE',   'FAIL', 0, 'UPDATE_NOOP',
       format('UPDATE public.vital_signs SET notes = ''rls-1.5-update-attempt'' WHERE id = %L', s_vital_x))
  ) AS t(scenario, persona, description, expected_outcome, expected_rows, kind, sql)
  LOOP
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN
      IF rec.kind = 'READ' THEN EXECUTE rec.sql INTO v_count;
      ELSIF rec.kind = 'INSERT_DENY' THEN EXECUTE rec.sql; v_count := 1;
      ELSIF rec.kind = 'UPDATE_NOOP' THEN EXECUTE rec.sql; GET DIAGNOSTICS v_count = ROW_COUNT;
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN v_caught := TRUE; v_count := NULL; v_notes := 'caught=RLS_BLOCKED_42501';
      WHEN check_violation THEN v_caught := TRUE; v_count := NULL; v_notes := 'caught=RLS_BLOCKED_42501';
    END;
    EXECUTE 'RESET ROLE';
    IF rec.kind = 'INSERT_DENY' THEN
      v_pass := v_caught;
    ELSIF rec.kind = 'UPDATE_NOOP' THEN
      v_pass := (v_count = 0) OR v_caught;
      IF v_caught THEN v_count := NULL; END IF;
    ELSE
      v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
             OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);
    END IF;
    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $vital_signs$;


-- ============================================================================
-- Section 25 — Inline validation queries (informational; comment out if running
-- this file as a single execute_sql call)
--
-- NOTE: These are reference SELECTs — the operator runs them after the file
-- completes. They do not write to _rls_test_results.
-- ============================================================================

-- Run #1.6 aggregate
-- SELECT
--   sum(CASE WHEN actual_outcome = expected_outcome THEN 1 ELSE 0 END) AS pass,
--   sum(CASE WHEN actual_outcome <> expected_outcome THEN 1 ELSE 0 END) AS fail,
--   count(*) AS total
-- FROM public._rls_test_results
-- WHERE run_no = 1.6;

-- Per-table breakdown
-- SELECT table_name,
--   count(*) FILTER (WHERE actual_outcome = expected_outcome) AS pass,
--   count(*) FILTER (WHERE actual_outcome <> expected_outcome) AS fail,
--   string_agg(scenario, ',' ORDER BY scenario) FILTER (WHERE actual_outcome <> expected_outcome) AS failing_scenarios
-- FROM public._rls_test_results WHERE run_no = 1.6
-- GROUP BY table_name ORDER BY table_name;

-- Comparison query against run #1 (per PHASE_D_RECONSTRUCTION_HANDOFF.md)
-- SELECT r1.table_name, r1.scenario, r1.description,
--        r1.actual_outcome AS run1_outcome, r1.actual_rows AS run1_rows,
--        r16.actual_outcome AS run16_outcome, r16.actual_rows AS run16_rows
-- FROM public._rls_test_results r1
-- LEFT JOIN public._rls_test_results r16
--   ON r16.run_no = 1.6
--   AND r16.table_name = r1.table_name
--   AND r16.scenario = r1.scenario
-- WHERE r1.run_no = 1
--   AND (r1.actual_outcome <> r16.actual_outcome
--     OR r1.actual_rows <> r16.actual_rows
--     OR r16.actual_outcome IS NULL);
--
-- NOTE: with mig 108 in place, audit_events.S6 row count is now stable at 1
-- per cycle (run #1 captured 8 because it was cycle 8 of historical
-- accumulation pre-mig-108; run #1.6 captures 1 per the post-fix invariant).
-- The comparison query will report a row-count divergence on
-- audit_events.S6 (8 vs 1) but outcome match (SUCCESS=SUCCESS) is preserved.
-- This divergence is expected and is the cycle-stable post-fix value.

-- Expected outcomes:
--   run #1.6 aggregate: pass = 177, fail = 0, total = 177
--   comparison query: 1 row (audit_events.S6 row-count divergence — see note above)

-- ============================================================================
-- Phase H — B07 authority-archetype scenarios (run_no = 4.0)
-- ============================================================================
-- Added 2026-05-11 per audits/b07-phase-h-execution-2026-05-11.md.
-- Sections 26-28 cover the new authority archetypes shipped in Phase B (guardian-of-minor)
-- and Phase E (delegate-with-capability), plus cross-clinic minor visibility paths.
--
-- Fixtures (00000200-prefixed) provided by rls_test_seed_b07_phase_h(), called from Section 0.
-- See the seed function for the persona/UUID assignment.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Section 26 — Guardian-as-authority-on-minor (5 scenarios)
-- ----------------------------------------------------------------------------

DO $b07_guardian$
DECLARE
  k_guardian        UUID := '00000200-0000-0000-0000-000000000010';
  k_random_other    UUID := '00000099-0000-0000-0000-000000000020'; -- patient_y_user
  k_gp_minor_m1     UUID := '00000200-0000-0000-0000-000000000201';
  k_pid_minor_m1    UUID := '00000200-0000-0000-0000-000000000301';
  k_clinic_a        UUID := '00000099-0000-0000-0000-000000000001';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT;
  v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S26-1', 'global_patients', k_guardian, 'guardian SELECTs minor''s gp row', 'SUCCESS', 1,
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', k_gp_minor_m1)),
    ('S26-2', 'patient_clinic_records', k_guardian, 'guardian SELECTs minor''s PCR at registering clinic', 'SUCCESS', 1,
       format('SELECT count(*)::int FROM public.patient_clinic_records WHERE global_patient_id = %L AND clinic_id = %L', k_gp_minor_m1, k_clinic_a)),
    ('S26-3', 'global_patients', k_random_other, 'random other authenticated user CANNOT SELECT minor''s gp', 'FAIL', 0,
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', k_gp_minor_m1)),
    -- Amended Phase H.1 (2026-05-12, ruling 37): DPR is internal clinic plumbing;
    -- Phase D OR-of-three intentionally does NOT extend to doctor_patient_relationships
    -- per mig 113-116 design (authority helpers target gp/PCR/clinical-content tables).
    -- Guardian authority on minor data flows through PCR (mig 115) + global_patients
    -- (mig 114), not via the doctor-routing table. Expected: FAIL.
    ('S26-4', 'doctor_patient_relationships', k_guardian, 'guardian BLOCKED from minor''s DPR row (Phase D scope intentionally excludes DPR — internal clinic plumbing)', 'FAIL', 0,
       format('SELECT count(*)::int FROM public.doctor_patient_relationships WHERE patient_id = %L', k_pid_minor_m1)),
    -- Amended Phase H.1 (2026-05-12, ruling 37): Legacy `patients` RLS (from mig 010)
    -- does NOT honor `is_authorized_actor_on`. Guardians access minor data via
    -- patient_clinic_records (mig 115 extended) and global_patients (mig 114 extended),
    -- not via legacy patients. Scenario will be obsolete after legacy patients
    -- deprecation (prompt 6.5). Expected: FAIL.
    ('S26-5', 'patients', k_guardian, 'guardian BLOCKED from minor''s legacy patients row (legacy RLS pre-dates Phase D; obsolete post-prompt-6.5)', 'FAIL', 0,
       format('SELECT count(*)::int FROM public.patients WHERE id = %L', k_pid_minor_m1))
  ) AS t(scenario, table_name, persona, description, expected_outcome, expected_rows, sql)
  LOOP
    v_table := rec.table_name;
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';

    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN
      EXECUTE rec.sql INTO v_count;
    EXCEPTION
      WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501';
    END;

    EXECUTE 'RESET ROLE';

    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);

    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $b07_guardian$;


-- ----------------------------------------------------------------------------
-- Section 27 — Delegate-as-capability-scoped-authority (5 scenarios)
-- ----------------------------------------------------------------------------
-- Note: capability-token enforcement is HANDLER-layer (per Phase E Decision 7);
-- RLS allows the read for any active delegation. These scenarios test the RLS
-- layer's delegation-state filtering (accepted/pending/expired/revoked) which is
-- what Phase D's helpers enforce. Per-capability gating lives at the API handler.

DO $b07_delegate$
DECLARE
  k_delegate         UUID := '00000200-0000-0000-0000-000000000011';
  k_gp_p_acc         UUID := '00000200-0000-0000-0000-000000000120';
  k_gp_p_pend        UUID := '00000200-0000-0000-0000-000000000121';
  k_gp_p_exp         UUID := '00000200-0000-0000-0000-000000000122';
  k_gp_p_rev         UUID := '00000200-0000-0000-0000-000000000123';
  k_clinic_a         UUID := '00000099-0000-0000-0000-000000000001';

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT;
  v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S27-1', 'global_patients', k_delegate, 'delegate (accepted) SELECTs principal''s gp', 'SUCCESS', 1,
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', k_gp_p_acc)),
    ('S27-2', 'global_patients', k_delegate, 'delegate (PENDING — not accepted) blocked from principal''s gp', 'FAIL', 0,
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', k_gp_p_pend)),
    ('S27-3', 'global_patients', k_delegate, 'delegate (EXPIRED) blocked from principal''s gp', 'FAIL', 0,
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', k_gp_p_exp)),
    ('S27-4', 'global_patients', k_delegate, 'delegate (REVOKED) blocked from principal''s gp', 'FAIL', 0,
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', k_gp_p_rev)),
    ('S27-5', 'patient_clinic_records', k_delegate, 'delegate (accepted) SELECTs principal''s PCR', 'SUCCESS', 1,
       format('SELECT count(*)::int FROM public.patient_clinic_records WHERE global_patient_id = %L AND clinic_id = %L', k_gp_p_acc, k_clinic_a))
  ) AS t(scenario, table_name, persona, description, expected_outcome, expected_rows, sql)
  LOOP
    v_table := rec.table_name;
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';

    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN
      EXECUTE rec.sql INTO v_count;
    EXCEPTION
      WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501';
    END;

    EXECUTE 'RESET ROLE';

    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);

    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $b07_delegate$;


-- ----------------------------------------------------------------------------
-- Section 28 — Cross-clinic minor + adult-with-share visibility (5 scenarios)
-- ----------------------------------------------------------------------------

DO $b07_xclinic$
DECLARE
  k_doctor_a         UUID := '00000099-0000-0000-0000-000000000010';
  k_doctor_b         UUID := '00000099-0000-0000-0000-000000000011';
  k_gp_minor_m1      UUID := '00000200-0000-0000-0000-000000000201'; -- registered clinic_a, no share
  k_gp_minor_m2      UUID := '00000200-0000-0000-0000-000000000202'; -- registered clinic_a, active share to clinic_b
  k_gp_minor_m3      UUID := '00000200-0000-0000-0000-000000000203'; -- registered clinic_a, expired share to clinic_b
  k_gp_share_grantor UUID := '00000200-0000-0000-0000-000000000130'; -- adult with active share to clinic_b

  rec RECORD; v_count INT; v_pass BOOLEAN; v_caught BOOLEAN; v_notes TEXT;
  v_table TEXT;
  v_run NUMERIC := 4.1;
  v_src TEXT := 'audits/rls-test-matrix-reconstructed.sql';
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('S28-1', 'global_patients', k_doctor_a, 'doctor_a SELECTs minor_m1 gp (DPR scope at registering clinic)', 'SUCCESS', 1,
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', k_gp_minor_m1)),
    ('S28-2', 'global_patients', k_doctor_b, 'doctor_b BLOCKED from minor_m1 gp (no share, no scope at clinic_b)', 'FAIL', 0,
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', k_gp_minor_m1)),
    ('S28-3', 'global_patients', k_doctor_b, 'doctor_b SELECTs minor_m2 gp (active share to clinic_b)', 'SUCCESS', 1,
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', k_gp_minor_m2)),
    ('S28-4', 'global_patients', k_doctor_b, 'doctor_b BLOCKED from minor_m3 gp (share to clinic_b is EXPIRED)', 'FAIL', 0,
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', k_gp_minor_m3)),
    ('S28-5', 'global_patients', k_doctor_b, 'doctor_b SELECTs share_grantor adult gp (active share to clinic_b)', 'SUCCESS', 1,
       format('SELECT count(*)::int FROM public.global_patients WHERE id = %L', k_gp_share_grantor))
  ) AS t(scenario, table_name, persona, description, expected_outcome, expected_rows, sql)
  LOOP
    v_table := rec.table_name;
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
      json_build_object('sub', rec.persona, 'role', 'authenticated')::text);
    EXECUTE 'SET LOCAL ROLE authenticated';

    v_caught := FALSE; v_notes := NULL; v_count := NULL;
    BEGIN
      EXECUTE rec.sql INTO v_count;
    EXCEPTION
      WHEN insufficient_privilege THEN v_caught := TRUE; v_notes := 'caught=RLS_BLOCKED_42501';
    END;

    EXECUTE 'RESET ROLE';

    v_pass := (rec.expected_outcome = 'SUCCESS' AND v_count = rec.expected_rows)
           OR (rec.expected_outcome = 'FAIL'    AND v_count = 0);

    PERFORM public.rls_test_record(v_run, rec.scenario, v_table, rec.description,
                                   rec.expected_outcome, v_count, v_pass, v_notes, v_src);
  END LOOP;
END $b07_xclinic$;


-- ============================================================================
-- End of reconstructed Phase D matrix (extended Phase H — Section 26-28)
-- ============================================================================
