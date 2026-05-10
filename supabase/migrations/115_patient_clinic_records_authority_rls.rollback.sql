-- ============================================================================
-- Rollback for mig 115 — restore PCR SELECT policy to pre-change state
-- ============================================================================
ALTER POLICY patient_clinic_records_select_v2 ON public.patient_clinic_records
  USING (
    public.is_clinic_member(clinic_id, auth.uid())
    OR public.can_patient_access_global_patient(global_patient_id, auth.uid())
  );
