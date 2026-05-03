-- ============================================================================
-- Rollback for mig 077 (conceptual mig 075.2).
--
-- Reverts patients.global_patient_id back to NULL-able. Safe to run
-- standalone (no audit rows or downstream data to clean up).
-- ============================================================================

ALTER TABLE public.patients
  ALTER COLUMN global_patient_id DROP NOT NULL;
