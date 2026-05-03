-- ============================================================================
-- Rollback for mig 080 (conceptual mig 076).
--
-- Drops indexes first, then columns. Order is important: indexes before
-- columns so we don't get "cannot drop column because index depends on it"
-- errors. Each DROP COLUMN is IF EXISTS so a partial-rollback after a
-- partial-apply doesn't blow up.
-- ============================================================================

-- R080.1 — Drop indexes.
DROP INDEX IF EXISTS public.clinical_notes_global_patient_idx;
DROP INDEX IF EXISTS public.clinical_notes_pcr_idx;
DROP INDEX IF EXISTS public.clinical_notes_global_patient_clinic_idx;
DROP INDEX IF EXISTS public.prescription_items_global_patient_idx;
DROP INDEX IF EXISTS public.prescription_items_pcr_idx;
DROP INDEX IF EXISTS public.appointments_global_patient_idx;
DROP INDEX IF EXISTS public.appointments_pcr_idx;
DROP INDEX IF EXISTS public.appointments_global_patient_clinic_idx;
DROP INDEX IF EXISTS public.lab_orders_global_patient_idx;
DROP INDEX IF EXISTS public.lab_orders_pcr_idx;
DROP INDEX IF EXISTS public.lab_results_global_patient_idx;
DROP INDEX IF EXISTS public.lab_results_pcr_idx;
DROP INDEX IF EXISTS public.imaging_orders_global_patient_idx;
DROP INDEX IF EXISTS public.imaging_orders_pcr_idx;
DROP INDEX IF EXISTS public.vital_signs_global_patient_idx;
DROP INDEX IF EXISTS public.vital_signs_pcr_idx;
DROP INDEX IF EXISTS public.patient_consent_grants_global_patient_idx;
DROP INDEX IF EXISTS public.patient_consent_grants_pcr_idx;
DROP INDEX IF EXISTS public.patient_phone_history_global_patient_idx;
DROP INDEX IF EXISTS public.doctor_patient_relationships_global_patient_idx;
DROP INDEX IF EXISTS public.doctor_patient_relationships_pcr_idx;
DROP INDEX IF EXISTS public.patient_visibility_global_patient_idx;
DROP INDEX IF EXISTS public.patient_visibility_pcr_idx;

-- R080.2 — Drop columns.
ALTER TABLE public.clinical_notes
  DROP COLUMN IF EXISTS patient_clinic_record_id,
  DROP COLUMN IF EXISTS global_patient_id;

ALTER TABLE public.prescription_items
  DROP COLUMN IF EXISTS patient_clinic_record_id,
  DROP COLUMN IF EXISTS global_patient_id;

ALTER TABLE public.appointments
  DROP COLUMN IF EXISTS patient_clinic_record_id,
  DROP COLUMN IF EXISTS global_patient_id;

ALTER TABLE public.lab_orders
  DROP COLUMN IF EXISTS patient_clinic_record_id,
  DROP COLUMN IF EXISTS global_patient_id;

ALTER TABLE public.lab_results
  DROP COLUMN IF EXISTS patient_clinic_record_id,
  DROP COLUMN IF EXISTS global_patient_id;

ALTER TABLE public.imaging_orders
  DROP COLUMN IF EXISTS patient_clinic_record_id,
  DROP COLUMN IF EXISTS global_patient_id;

ALTER TABLE public.vital_signs
  DROP COLUMN IF EXISTS patient_clinic_record_id,
  DROP COLUMN IF EXISTS global_patient_id;

ALTER TABLE public.patient_consent_grants
  DROP COLUMN IF EXISTS patient_clinic_record_id,
  DROP COLUMN IF EXISTS global_patient_id;

ALTER TABLE public.patient_phone_history
  DROP COLUMN IF EXISTS global_patient_id;

ALTER TABLE public.doctor_patient_relationships
  DROP COLUMN IF EXISTS patient_clinic_record_id,
  DROP COLUMN IF EXISTS global_patient_id;

ALTER TABLE public.patient_visibility
  DROP COLUMN IF EXISTS patient_clinic_record_id,
  DROP COLUMN IF EXISTS global_patient_id;
