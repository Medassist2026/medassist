-- ============================================================================
-- Rollback for migration 112 — patient_delegations grantor ≠ delegate CHECK.
-- ============================================================================

ALTER TABLE public.patient_delegations
  DROP CONSTRAINT IF EXISTS patient_delegations_grantor_not_delegate_chk;
