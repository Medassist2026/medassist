-- ============================================================================
-- Rollback for migration 109 — global_patients minor-gp schema additions.
--
-- IMPORTANT: this rollback drops:
--   * partial index `global_patients_guardian_idx`
--   * CHECK `global_patients_minor_no_self_claim_chk`
--   * CHECK `global_patients_minor_requires_guardian_chk`
--   * column `is_minor`
--   * column `guardian_global_patient_id`
--
-- If mig 111 has applied (3 dependents flipped to is_minor=TRUE), this
-- rollback FIRST resets those flips. Mig 111's rollback should be applied
-- BEFORE this rollback in the proper order; this is a defensive belt for
-- partial-rollback scenarios.
-- ============================================================================

-- Defensive: if any rows still have is_minor=TRUE, set them back to FALSE
-- (the column is about to be dropped anyway, but the CHECK constraint would
-- fail if we tried to drop with active TRUE rows that conflict). This step
-- is harmless if all rows are already FALSE.
UPDATE public.global_patients
   SET is_minor = FALSE,
       guardian_global_patient_id = NULL
 WHERE is_minor = TRUE OR guardian_global_patient_id IS NOT NULL;

-- Drop in reverse order of creation.
DROP INDEX IF EXISTS public.global_patients_guardian_idx;

ALTER TABLE public.global_patients
  DROP CONSTRAINT IF EXISTS global_patients_minor_no_self_claim_chk;

ALTER TABLE public.global_patients
  DROP CONSTRAINT IF EXISTS global_patients_minor_requires_guardian_chk;

ALTER TABLE public.global_patients
  DROP COLUMN IF EXISTS is_minor;

ALTER TABLE public.global_patients
  DROP COLUMN IF EXISTS guardian_global_patient_id;
