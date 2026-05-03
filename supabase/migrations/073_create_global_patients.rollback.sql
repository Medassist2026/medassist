-- ============================================================================
-- Rollback for migration 073_create_global_patients.sql
-- Run only if mig 073 needs to be reverted. (No later migration depends
-- on its outputs at the time this is written — Prompt 3+'s mig 074-077
-- read through `patients.global_patient_id` and would break first.)
--
-- IRRECOVERABLE without manual intervention:
--   - audit_events rows with action='PATIENT_DEDUP_FLAGGED' and
--     metadata.source='migration_073'.
--   - audit_events rows with action='GLOBAL_PATIENT_CREATED' and
--     metadata.source='migration_073_backfill'.
-- The audit chain is preserved by leaving them in place; patient data
-- itself is fully recoverable because no patients.* column other than
-- the additive flag/pointer columns is touched.
--
-- Drop order matters because of dependencies:
--   patients.global_patient_id (column FK to global_patients)
-- → patients.duplicate_of_patient_id (self-FK on patients; no dependency
--                                     on global_patients but drop early)
-- → patients.is_canonical
-- → trigger on global_patients
-- → policy on global_patients
-- → global_patients table (CASCADE picks up index/policy/trigger leftovers)
-- → public.patient_account_status type (table-typed column must drop first)
-- → public.touch_global_patients_updated_at function
-- ============================================================================

-- 1. Drop the FK pointer column on patients first (it would block
--    global_patients drop on its own; even though the FK is to gp.id
--    not the other way around, drop in the order the table was added).
DROP INDEX IF EXISTS public.idx_patients_global_patient_id;
ALTER TABLE public.patients DROP COLUMN IF EXISTS global_patient_id;

-- 2. Drop the dedup-flag columns.
ALTER TABLE public.patients DROP COLUMN IF EXISTS duplicate_of_patient_id;
ALTER TABLE public.patients DROP COLUMN IF EXISTS is_canonical;

-- 3. Drop the global_patients table. CASCADE picks up the trigger and
--    policy. Must drop the table BEFORE dropping the type, because the
--    table’s account_status column depends on patient_account_status.
DROP TABLE IF EXISTS public.global_patients CASCADE;

-- 4. Drop the ENUM type now that nothing references it.
DROP TYPE IF EXISTS public.patient_account_status;

-- 5. Drop the touch helper function.
DROP FUNCTION IF EXISTS public.touch_global_patients_updated_at();

-- Note: PATIENT_DEDUP_FLAGGED + GLOBAL_PATIENT_CREATED audit_events rows
-- are intentionally left in place. They form the audit chain showing
-- the flagging + create + rollback sequence.
