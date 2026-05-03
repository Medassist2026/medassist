-- ============================================================================
-- Rollback for migration 072_dedup_detection.sql
-- Run only if mig 072 needs to be reverted. (Mig 073 must NOT be applied
-- when this rollback runs — 073 reads `_patient_dedup_plan`.)
--
-- The detection views are pure read-only artifacts; the dedup-plan
-- table is the only stateful drop here. If Mo has hand-edited rows
-- (manual_review overrides), export them first or this rollback drops
-- them with the table.
-- ============================================================================

-- Drop in reverse order of creation. The plan table has no FK to the
-- views, so order is just for clarity.
DROP TABLE IF EXISTS public._patient_dedup_plan;
DROP VIEW  IF EXISTS public._user_phone_duplicates;
DROP VIEW  IF EXISTS public._patient_phone_duplicates;
