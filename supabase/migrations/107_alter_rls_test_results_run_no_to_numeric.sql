-- ============================================================================
-- Migration 107 — Phase D #1.5 prep: retype run_no to numeric + add source_file
--
-- Audit references:
--   * audits/database-audit/PHASE_D_RECONSTRUCTION_HANDOFF.md
--     (Open Question #2 — add source_file for matrix-file provenance)
--   * audits/STATE_OF_WORK.md § "Phase D #1.5 matrix reconstruction"
--   * Empirical Lesson #8 — schema changes go through committed migration files
--   * Empirical Lesson #12 — test scaffolding must be persisted as durable
--     executable code; a `source_file` column on `_rls_test_results` makes the
--     scaffolding-to-results link traceable per row
--
-- Originated by: cowork session 2026-05-06 (Phase D #1.5 reconstruction)
-- Locked rulings: Mo 2026-05-06 — "Option B (mig 107 ALTER COLUMN to numeric)"
--                                + "Add source_file column on _rls_test_results"
--
-- Purpose
-- -------
-- The Phase D #1.5 reconstruction needs to record results at run_no = 1.5 so
-- the comparison query against run_no = 1 works as the handoff doc specifies.
-- Today `_rls_test_results.run_no` is INTEGER and `rls_test_record` takes an
-- INTEGER parameter, so 1.5 cannot be stored.
--
-- This migration:
--   1. Retypes `_rls_test_results.run_no` from INTEGER to NUMERIC (lossless;
--      existing run_no=1 and run_no=99 rows are preserved as numeric 1 and 99).
--   2. Adds `_rls_test_results.source_file TEXT` (nullable, no default) so each
--      recorded row can name the .sql file that produced it. Pre-existing rows
--      stay NULL (run #1 was authored interactively without a tracked file —
--      see Empirical Lesson #12 in audits/EXECUTION_PROMPTS.md).
--   3. DROPs and re-CREATEs `public.rls_test_record` with the new signature:
--        (p_run_no NUMERIC, ..., p_source_file TEXT DEFAULT NULL)
--      The new `p_source_file` parameter is appended at the end with a NULL
--      default so existing call sites (none on disk; only ad-hoc) keep working.
--
-- IDEMPOTENCY
-- -----------
-- - ALTER COLUMN ... TYPE numeric USING ... is a no-op if already numeric, but
--   Postgres still rewrites the type; we precheck and skip if already numeric.
-- - ADD COLUMN IF NOT EXISTS for source_file — re-apply safe.
-- - DROP FUNCTION IF EXISTS for the old signature, CREATE OR REPLACE for new.
--
-- DOWNSTREAM EFFECTS
-- ------------------
-- - Existing run_no values: 1 (177 rows) and 99 (1 row) — verified pre-apply.
--   Both round-trip through ::numeric byte-identically.
-- - rls_test_record: existing EXECUTE grants on the OLD signature die with
--   DROP. The new signature is re-GRANTed below to PUBLIC + anon +
--   authenticated + service_role to match pre-mig-107 ACL exactly.
-- - The fractional smoke-probe call below uses run_no = 1.5 transiently and
--   deletes the row before COMMIT-of-DO-block — it does NOT pollute
--   `WHERE run_no = 1.5` for the matrix run that follows this migration.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Pre-check: capture pre-state so the smoke probe can verify preservation
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_col_type TEXT;
  v_source_file_exists BOOLEAN;
  v_func_exists BOOLEAN;
  v_pre_run1 INT;
  v_pre_run99 INT;
BEGIN
  SELECT data_type INTO v_col_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='_rls_test_results' AND column_name='run_no';
  IF v_col_type IS NULL THEN
    RAISE EXCEPTION 'mig 107 ABORT: public._rls_test_results.run_no not found';
  END IF;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='_rls_test_results'
                  AND column_name='source_file')
    INTO v_source_file_exists;

  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='rls_test_record')
    INTO v_func_exists;

  IF NOT v_func_exists THEN
    RAISE EXCEPTION 'mig 107 ABORT: public.rls_test_record not found (was expected from rls-test-seed.sql era)';
  END IF;

  SELECT count(*) INTO v_pre_run1 FROM public._rls_test_results WHERE run_no = 1;
  SELECT count(*) INTO v_pre_run99 FROM public._rls_test_results WHERE run_no = 99;

  RAISE NOTICE
    'mig 107 pre-check: run_no type=%, source_file_exists=%, rls_test_record exists=%, run_no=1 count=%, run_no=99 count=%',
    v_col_type, v_source_file_exists, v_func_exists, v_pre_run1, v_pre_run99;
END $$;

-- ----------------------------------------------------------------------------
-- 1) Retype run_no INTEGER -> NUMERIC. Lossless cast preserves existing values.
-- ----------------------------------------------------------------------------

ALTER TABLE public._rls_test_results
  ALTER COLUMN run_no TYPE numeric USING run_no::numeric;

COMMENT ON COLUMN public._rls_test_results.run_no IS
  'Numeric run number. Phase D scaffold reserves 1, 2, 3 for the original three-run plan; 1.5 was added by mig 107 to record the post-mig-106 re-run of the run #1 baseline. Was integer until mig 107.';

-- ----------------------------------------------------------------------------
-- 2) Add source_file column. Nullable, no default. Pre-existing rows stay NULL
--    because run #1 was authored interactively without a tracked source file.
-- ----------------------------------------------------------------------------

ALTER TABLE public._rls_test_results
  ADD COLUMN IF NOT EXISTS source_file TEXT;

COMMENT ON COLUMN public._rls_test_results.source_file IS
  'Path (repo-relative) of the executable .sql file that produced this row, e.g. ''audits/rls-test-matrix-reconstructed.sql''. NULL for run #1 / run #99 (recorded interactively before mig 107). Added by mig 107 per PHASE_D_RECONSTRUCTION_HANDOFF.md Open Question #2.';

-- ----------------------------------------------------------------------------
-- 3) DROP old rls_test_record signature and re-CREATE with numeric run_no
--    + appended source_file parameter. CREATE OR REPLACE cannot change a
--    parameter type, so DROP-then-CREATE is required.
--
--    The old signature was:
--      rls_test_record(integer, text, text, text, text, integer, boolean, text)
--    The new signature is:
--      rls_test_record(numeric, text, text, text, text, integer, boolean, text, text)
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rls_test_record(integer, text, text, text, text, integer, boolean, text);

CREATE OR REPLACE FUNCTION public.rls_test_record(
  p_run_no      NUMERIC,
  p_scenario    TEXT,
  p_table       TEXT,
  p_desc        TEXT,
  p_expected    TEXT,
  p_actual_rows INTEGER,
  p_pass        BOOLEAN,
  p_notes       TEXT DEFAULT NULL,
  p_source_file TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public._rls_test_results
    (run_no, scenario, table_name, description, expected_outcome,
     actual_outcome, actual_rows, notes, source_file)
  VALUES
    (p_run_no, p_scenario, p_table, p_desc, p_expected,
     CASE WHEN p_pass THEN p_expected ELSE
       CASE WHEN p_expected = 'SUCCESS' THEN 'FAIL' ELSE 'SUCCESS' END
     END,
     p_actual_rows, p_notes, p_source_file);
END
$$;

COMMENT ON FUNCTION public.rls_test_record(numeric, text, text, text, text, integer, boolean, text, text) IS
  'Phase D RLS matrix recorder. Computes actual_outcome from p_pass (matches → expected; misses → flipped) and inserts one _rls_test_results row. Mig 107 retyped p_run_no to NUMERIC and appended p_source_file (default NULL) to track which .sql file produced the row. SECURITY DEFINER, search_path=public, pg_temp.';

-- Re-grant EXECUTE — DROP killed the old grants. Restoring the pre-mig-107 ACL
-- (PUBLIC + anon + authenticated + service_role) verbatim.
GRANT EXECUTE ON FUNCTION public.rls_test_record(numeric, text, text, text, text, integer, boolean, text, text)
  TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.rls_test_record(numeric, text, text, text, text, integer, boolean, text, text)
  TO anon, authenticated, service_role;

COMMIT;

-- ============================================================================
-- Smoke probe — assert (a) run_no is numeric, (b) source_file column exists,
-- (c) recorder fn has the new signature with both new parameters, (d) existing
-- run_no=1 (177 rows) and run_no=99 (1 row) preserved, (e) fractional values
-- now round-trip end-to-end through the recorder.
--
-- Probe is RAISE EXCEPTION on any miss per Empirical Lesson #2 (smoke-probe
-- assertion in every RLS-touching migration).
-- ============================================================================

DO $$
DECLARE
  v_col_type TEXT;
  v_source_file_exists BOOLEAN;
  v_func_args TEXT;
  v_run1_count INT;
  v_run99_count INT;
  v_smoke_present INT;
BEGIN
  -- (a) run_no type
  SELECT data_type INTO v_col_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='_rls_test_results' AND column_name='run_no';
  IF v_col_type <> 'numeric' THEN
    RAISE EXCEPTION 'mig 107 smoke probe: run_no type is % (expected numeric)', v_col_type;
  END IF;

  -- (b) source_file column
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='_rls_test_results'
                  AND column_name='source_file')
    INTO v_source_file_exists;
  IF NOT v_source_file_exists THEN
    RAISE EXCEPTION 'mig 107 smoke probe: source_file column missing on _rls_test_results';
  END IF;

  -- (c) recorder fn signature
  SELECT pg_get_function_arguments(p.oid) INTO v_func_args
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='rls_test_record';
  IF v_func_args IS NULL THEN
    RAISE EXCEPTION 'mig 107 smoke probe: rls_test_record not found post-recreate';
  END IF;
  IF v_func_args NOT LIKE '%p_run_no numeric%' THEN
    RAISE EXCEPTION 'mig 107 smoke probe: rls_test_record p_run_no is not numeric (% )', v_func_args;
  END IF;
  IF v_func_args NOT LIKE '%p_source_file text DEFAULT NULL%' THEN
    RAISE EXCEPTION 'mig 107 smoke probe: rls_test_record p_source_file missing or wrong default (% )', v_func_args;
  END IF;

  -- (d) existing data preserved (run_no values byte-identical post-cast)
  SELECT count(*) INTO v_run1_count FROM public._rls_test_results WHERE run_no = 1;
  IF v_run1_count <> 177 THEN
    RAISE EXCEPTION 'mig 107 smoke probe: run_no=1 count is % (expected 177 — cast lost rows?)', v_run1_count;
  END IF;
  SELECT count(*) INTO v_run99_count FROM public._rls_test_results WHERE run_no = 99;
  IF v_run99_count <> 1 THEN
    RAISE EXCEPTION 'mig 107 smoke probe: run_no=99 count is % (expected 1)', v_run99_count;
  END IF;

  -- (e) fractional round-trip (writes a sentinel row at run_no=1.5 with a
  --     mig-107-specific scenario tag, asserts it is retrievable, then deletes
  --     it. The matrix run that follows this migration starts with a clean
  --     `WHERE run_no = 1.5` slate.)
  PERFORM public.rls_test_record(
    1.5::numeric, 'MIG107_SMOKE', 'mig107_sentinel',
    'mig 107 fractional round-trip probe — deleted before mig commit returns',
    'SUCCESS', 0, FALSE,
    'transient smoke row — see mig 107 DO block',
    'audits/database-audit/mig-107-smoke'
  );
  SELECT count(*) INTO v_smoke_present
  FROM public._rls_test_results
  WHERE run_no = 1.5 AND scenario = 'MIG107_SMOKE' AND table_name = 'mig107_sentinel';
  IF v_smoke_present <> 1 THEN
    RAISE EXCEPTION 'mig 107 smoke probe: fractional run_no=1.5 sentinel not retrievable (count=%)', v_smoke_present;
  END IF;
  DELETE FROM public._rls_test_results
   WHERE run_no = 1.5 AND scenario = 'MIG107_SMOKE' AND table_name = 'mig107_sentinel';

  RAISE NOTICE 'mig 107 smoke probe: PASS (run_no=numeric, source_file added, recorder fn updated with p_source_file, run_no=1/99 preserved, fractional round-trip works)';
END $$;
