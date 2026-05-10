-- ============================================================================
-- Rollback for mig 116 — restore shares + audit_events policies
-- ============================================================================

ALTER POLICY patient_data_shares_select_v2 ON public.patient_data_shares
  USING (
    public.is_clinic_member(grantor_clinic_id, auth.uid())
    OR public.is_clinic_member(grantee_clinic_id, auth.uid())
    OR public.can_patient_access_global_patient(global_patient_id, auth.uid())
  );

ALTER POLICY patient_data_shares_revoke_update_v2 ON public.patient_data_shares
  USING (
    public.is_clinic_member(grantor_clinic_id, auth.uid())
    OR public.can_patient_access_global_patient(global_patient_id, auth.uid())
  )
  WITH CHECK (revoked_at IS NOT NULL);

ALTER POLICY audit_events_patient_self_select_v2 ON public.audit_events
  USING (
    (resolved_global_patient_id IS NOT NULL)
    AND public.can_patient_access_global_patient(resolved_global_patient_id, auth.uid())
  );
