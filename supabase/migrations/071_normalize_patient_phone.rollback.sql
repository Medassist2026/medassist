-- ============================================================================
-- Rollback for migration 071_normalize_patient_phone.sql
-- Run only if mig 071 needs to be reverted. (Mig 072 must NOT be applied
-- when this rollback runs — 072 depends on the columns dropped here.)
--
-- This rollback drops every artifact mig 071 added. It is safe to run
-- on a fresh DB or on a DB where 071 already applied. It does NOT
-- touch any pre-existing column or table.
-- ============================================================================

-- Drop the index.
DROP INDEX IF EXISTS public.idx_patients_normalized_phone;

-- Drop the quarantine table. Manually export contents first if any
-- rows are present and you want to preserve the audit chain.
DROP TABLE IF EXISTS public._phone_normalize_quarantine;

-- Drop the normalized_phone columns we added (additive — no data loss
-- on the original `phone` columns).
ALTER TABLE public.users    DROP COLUMN IF EXISTS normalized_phone;
ALTER TABLE public.patients DROP COLUMN IF EXISTS normalized_phone;

-- Drop the helper function last (after every callable column we backfilled).
DROP FUNCTION IF EXISTS public.normalize_phone_e164(TEXT);
