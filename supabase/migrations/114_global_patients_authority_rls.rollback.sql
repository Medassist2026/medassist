-- ============================================================================
-- Rollback for mig 114 — restore global_patients policies to pre-change state
-- (verbatim from pg_policies snapshot 2026-05-09 in mig 114 header)
-- ============================================================================

ALTER POLICY global_patients_select_v2 ON public.global_patients
  USING (
    (claimed_user_id = auth.uid())
    OR public.user_has_clinic_path_to_gp(id, auth.uid())
  );

ALTER POLICY global_patients_self_update_v2 ON public.global_patients
  USING (claimed_user_id = auth.uid())
  WITH CHECK (claimed_user_id = auth.uid());
