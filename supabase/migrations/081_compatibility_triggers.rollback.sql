-- ============================================================================
-- Rollback for mig 081 (conceptual mig 077).
--
-- Drops the shim triggers and their functions. The DATA_LAYER_CUTOVER_
-- COMPLETE audit row is also removed.
-- ============================================================================

-- R081.1 — Drop triggers (must come before function drops).
DROP TRIGGER IF EXISTS tg_clinical_notes_derive_global_refs ON public.clinical_notes;
DROP TRIGGER IF EXISTS tg_prescription_items_derive_global_refs ON public.prescription_items;
DROP TRIGGER IF EXISTS tg_appointments_derive_global_refs ON public.appointments;
DROP TRIGGER IF EXISTS tg_lab_orders_derive_global_refs ON public.lab_orders;
DROP TRIGGER IF EXISTS tg_imaging_orders_derive_global_refs ON public.imaging_orders;
DROP TRIGGER IF EXISTS tg_vital_signs_derive_global_refs ON public.vital_signs;
DROP TRIGGER IF EXISTS tg_patient_consent_grants_derive_global_refs ON public.patient_consent_grants;
DROP TRIGGER IF EXISTS tg_doctor_patient_relationships_derive_global_refs ON public.doctor_patient_relationships;
DROP TRIGGER IF EXISTS tg_patient_visibility_derive_global_refs ON public.patient_visibility;
DROP TRIGGER IF EXISTS tg_lab_results_derive_global_refs ON public.lab_results;
DROP TRIGGER IF EXISTS tg_patient_phone_history_derive_global_refs ON public.patient_phone_history;

-- R081.2 — Drop the trigger functions.
DROP FUNCTION IF EXISTS public.tg_derive_patient_global_refs();
DROP FUNCTION IF EXISTS public.tg_derive_lab_results_global_refs();
DROP FUNCTION IF EXISTS public.tg_derive_patient_phone_history_global_refs();

-- R081.3 — Delete the cutover marker.
DELETE FROM public.audit_events
 WHERE action = 'DATA_LAYER_CUTOVER_COMPLETE'
   AND metadata->>'source' = 'migration_081';
