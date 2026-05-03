-- ============================================================================
-- Rollback for migration 088 — patient_clinic_records AFTER INSERT audit trigger
-- ============================================================================
--
-- Drops the trigger first, then the trigger function. Idempotent: re-running
-- is a no-op.
--
-- This rollback does NOT delete any audit rows the trigger may have written
-- between forward apply and rollback. Those rows have
-- metadata.source = 'trigger_pcr_insert' if Mo wants to filter them later,
-- but deleting historical audit rows would be the same forensic violation
-- this whole migration was designed to avoid — leave them in place.
-- ============================================================================

DROP TRIGGER IF EXISTS tg_audit_pcr_insert_trg ON public.patient_clinic_records;
DROP FUNCTION IF EXISTS public.tg_audit_pcr_insert() CASCADE;
