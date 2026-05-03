-- ============================================================
-- mig 098 rollback — drop patient_code_* columns from global_patients
-- Date: 2026-05-02
--
-- ⚠️  PRECONDITION: only safe to run while NO regenerated bcrypt codes
-- exist in production data (every row has patient_code_hash IS NULL).
-- This precondition holds:
--   - immediately after mig 098 applies (columns added, no data yet)
--   - before mig 099 ships RPCs that populate the columns
--   - before the step-7 backfill script runs
-- After the first patient regenerates under the new system, rollback
-- becomes lossy: the bcrypt hash is destroyed and the plaintext is not
-- recoverable. The pre-flight assertion below refuses to run if any
-- non-NULL hash is present, to enforce this invariant.
--
-- ⚠️  Run AFTER rolling back any later migrations (099/100/101) that
-- depend on these columns. Order: 101 → 100 → 099 → 098.
-- ============================================================

BEGIN;

DO $pre$
DECLARE
  v_populated_count INT;
BEGIN
  SELECT COUNT(*) INTO v_populated_count
    FROM public.global_patients
   WHERE patient_code_hash IS NOT NULL;

  IF v_populated_count > 0 THEN
    RAISE EXCEPTION
      'mig 098 rollback REFUSED: % global_patients rows have non-NULL patient_code_hash. Rolling back would destroy bcrypt hashes that are not recoverable. If rollback is genuinely intended, run UPDATE public.global_patients SET patient_code_hash = NULL, patient_code_generated_at = NULL, patient_code_expires_at = NULL WHERE patient_code_hash IS NOT NULL; first (acknowledging the data loss), then re-run this rollback.',
      v_populated_count;
  END IF;
END $pre$;

-- Safe to drop — no populated rows.
ALTER TABLE public.global_patients
  DROP COLUMN IF EXISTS patient_code_hash,
  DROP COLUMN IF EXISTS patient_code_generated_at,
  DROP COLUMN IF EXISTS patient_code_expires_at;

-- Post-condition: columns absent.
DO $post$
DECLARE
  v_remaining INT;
BEGIN
  SELECT COUNT(*) INTO v_remaining
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='global_patients'
     AND column_name IN ('patient_code_hash','patient_code_generated_at','patient_code_expires_at');
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'mig 098 rollback post-condition failed: % patient_code_* columns still present', v_remaining;
  END IF;
  RAISE NOTICE 'mig 098 rollback: 3 patient_code_* columns dropped from global_patients';
END $post$;

COMMIT;
