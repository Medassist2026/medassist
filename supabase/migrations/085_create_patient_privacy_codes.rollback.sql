-- ============================================================================
-- Rollback for mig 085 — patient_privacy_codes
--
-- Drops the FK on privacy_code_attempts.privacy_code_id first (so mig 084
-- rollback isn't blocked), then the table.
-- Idempotent.
-- ============================================================================

ALTER TABLE IF EXISTS public.privacy_code_attempts
  DROP CONSTRAINT IF EXISTS privacy_code_attempts_privacy_code_id_fkey;

DROP TABLE IF EXISTS public.patient_privacy_codes CASCADE;
