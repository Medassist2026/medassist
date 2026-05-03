-- ============================================================================
-- Rollback for mig 075 (conceptual mig 074).
--
-- Removes the patient_clinic_records table and the audit rows this
-- migration wrote. Order matters — drop trigger before function before
-- table; delete audit rows last so they're available for forensics if
-- something fails mid-rollback.
-- ============================================================================

-- R075.1 — Drop trigger and function.
DROP TRIGGER IF EXISTS patient_clinic_records_touch_updated_at_trg
  ON public.patient_clinic_records;
DROP FUNCTION IF EXISTS public.patient_clinic_records_touch_updated_at();

-- R075.2 — Drop policy then table.
DROP POLICY IF EXISTS patient_clinic_records_deny_all
  ON public.patient_clinic_records;

DROP TABLE IF EXISTS public.patient_clinic_records;

-- R075.3 — Delete the audit rows this migration wrote.
DELETE FROM public.audit_events
 WHERE action = 'PATIENT_CLINIC_RECORD_CREATED'
   AND metadata->>'source' = 'migration_075_backfill';
