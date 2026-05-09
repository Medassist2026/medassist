-- ============================================================================
-- Rollback for migration 110 — patient_delegations table.
-- Drops trigger, function, indexes, and table in dependency-safe order.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_patient_delegations_touch_updated ON public.patient_delegations;

DROP FUNCTION IF EXISTS public.patient_delegations_touch_updated_at();

-- Indexes are dropped automatically when the table is dropped, but listed
-- here for explicitness (in case someone runs partial rollback).
DROP INDEX IF EXISTS public.patient_delegations_active_unique;
DROP INDEX IF EXISTS public.patient_delegations_principal_active_idx;
DROP INDEX IF EXISTS public.patient_delegations_delegate_active_idx;

DROP TABLE IF EXISTS public.patient_delegations;
