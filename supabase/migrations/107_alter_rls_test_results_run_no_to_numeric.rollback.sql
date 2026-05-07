-- ============================================================================
-- Rollback for migration 107 — restore _rls_test_results.run_no to integer,
-- drop source_file column, restore original rls_test_record signature.
--
-- USE CASE
-- --------
-- Only if mig 107's downstream Phase D #1.5 matrix run surfaces a defect we
-- want to roll back the schema change for (e.g., numeric type interferes with
-- some other harness). Rollback is destructive: any rows recorded with a
-- fractional run_no (1.5, 1.6, ...) are blocked from rollback unless deleted
-- first; any source_file values are dropped with the column.
--
-- PRE-ROLLBACK GUARD
-- ------------------
-- The DO block below counts fractional run_no rows; if any exist, the rollback
-- ABORTS with an instructive error so the operator can decide what to do
-- (delete the fractional rows, or migrate the data forward, before retrying).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Pre-rollback guard: refuse to lose fractional run_no rows silently.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_fractional INT;
BEGIN
  SELECT count(*) INTO v_fractional
  FROM public._rls_test_results
  WHERE run_no <> floor(run_no);
  IF v_fractional > 0 THEN
    RAISE EXCEPTION
      'mig 107 rollback ABORT: % fractional run_no row(s) would be silently truncated by integer cast. Delete or migrate them first (e.g., DELETE FROM public._rls_test_results WHERE run_no <> floor(run_no);), then retry.',
      v_fractional;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1) DROP the new function signature, recreate the old one.
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rls_test_record(numeric, text, text, text, text, integer, boolean, text, text);

CREATE OR REPLACE FUNCTION public.rls_test_record(
  p_run_no      INTEGER,
  p_scenario    TEXT,
  p_table       TEXT,
  p_desc        TEXT,
  p_expected    TEXT,
  p_actual_rows INTEGER,
  p_pass        BOOLEAN,
  p_notes       TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public._rls_test_results
    (run_no, scenario, table_name, description, expected_outcome,
     actual_outcome, actual_rows, notes)
  VALUES
    (p_run_no, p_scenario, p_table, p_desc, p_expected,
     CASE WHEN p_pass THEN p_expected ELSE
       CASE WHEN p_expected = 'SUCCESS' THEN 'FAIL' ELSE 'SUCCESS' END
     END,
     p_actual_rows, p_notes);
END
$$;

GRANT EXECUTE ON FUNCTION public.rls_test_record(integer, text, text, text, text, integer, boolean, text)
  TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.rls_test_record(integer, text, text, text, text, integer, boolean, text)
  TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2) Drop source_file column.
-- ----------------------------------------------------------------------------

ALTER TABLE public._rls_test_results DROP COLUMN IF EXISTS source_file;

-- ----------------------------------------------------------------------------
-- 3) Retype run_no NUMERIC -> INTEGER. Pre-rollback guard above ensures no
--    fractional rows exist; integer cast is lossless for whole numerics.
-- ----------------------------------------------------------------------------

ALTER TABLE public._rls_test_results
  ALTER COLUMN run_no TYPE integer USING run_no::integer;

COMMENT ON COLUMN public._rls_test_results.run_no IS NULL;

COMMIT;

-- ============================================================================
-- Smoke probe
-- ============================================================================

DO $$
DECLARE
  v_col_type TEXT;
  v_source_file_exists BOOLEAN;
  v_func_args TEXT;
BEGIN
  SELECT data_type INTO v_col_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='_rls_test_results' AND column_name='run_no';
  IF v_col_type <> 'integer' THEN
    RAISE EXCEPTION 'mig 107 rollback smoke probe: run_no type is % (expected integer)', v_col_type;
  END IF;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='_rls_test_results'
                  AND column_name='source_file')
    INTO v_source_file_exists;
  IF v_source_file_exists THEN
    RAISE EXCEPTION 'mig 107 rollback smoke probe: source_file column still present';
  END IF;

  SELECT pg_get_function_arguments(p.oid) INTO v_func_args
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='rls_test_record';
  IF v_func_args NOT LIKE '%p_run_no integer%' THEN
    RAISE EXCEPTION 'mig 107 rollback smoke probe: rls_test_record p_run_no not integer (% )', v_func_args;
  END IF;
  IF v_func_args LIKE '%p_source_file%' THEN
    RAISE EXCEPTION 'mig 107 rollback smoke probe: rls_test_record still has p_source_file (% )', v_func_args;
  END IF;

  RAISE NOTICE 'mig 107 rollback smoke probe: PASS';
END $$;
