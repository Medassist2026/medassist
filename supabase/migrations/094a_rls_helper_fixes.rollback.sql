-- ============================================================
-- mig 094a rollback — restore mig 092 + mig 093 policy state
-- Date: 2026-04-30
--
-- ⚠️  DO NOT USE THIS ROLLBACK except as part of a full rollback chain
-- (101 → 100 → 099 → 098 → 097 → ... → 094a → 094 → 093 → 092).  Rolling back ONLY 094a
-- restores the recursion bug and breaks every patient-table SELECT.
-- ============================================================

BEGIN;

-- 1. Restore mig 092 helper signatures (INVOKER)
CREATE OR REPLACE FUNCTION public.can_patient_access_global_patient(
  p_global_patient_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER PARALLEL SAFE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.global_patients
    WHERE id = p_global_patient_id
      AND claimed_user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_clinic_access_global_patient(
  p_global_patient_id UUID,
  p_clinic_id UUID
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER PARALLEL SAFE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.patient_clinic_records
    WHERE global_patient_id = p_global_patient_id
      AND clinic_id = p_clinic_id
  ) OR EXISTS (
    SELECT 1 FROM public.patient_data_shares
    WHERE global_patient_id = p_global_patient_id
      AND grantee_clinic_id = p_clinic_id
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

-- 2. Drop the new helper
DROP FUNCTION IF EXISTS public.user_has_clinic_path_to_gp(UUID, UUID);

-- 3. Restore mig 093 inline-EXISTS policies
DROP POLICY IF EXISTS global_patients_select_v2 ON public.global_patients;
CREATE POLICY global_patients_select_v2 ON public.global_patients
FOR SELECT TO authenticated
USING (
  claimed_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.patient_clinic_records pcr
    WHERE pcr.global_patient_id = global_patients.id
      AND public.is_clinic_member(pcr.clinic_id, auth.uid())
  )
);

DROP POLICY IF EXISTS patient_clinic_records_select_v2 ON public.patient_clinic_records;
CREATE POLICY patient_clinic_records_select_v2 ON public.patient_clinic_records
FOR SELECT TO authenticated
USING (
  public.is_clinic_member(clinic_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = patient_clinic_records.global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS patient_data_shares_select_v2 ON public.patient_data_shares;
CREATE POLICY patient_data_shares_select_v2 ON public.patient_data_shares
FOR SELECT TO authenticated
USING (
  public.is_clinic_member(grantor_clinic_id, auth.uid())
  OR public.is_clinic_member(grantee_clinic_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = patient_data_shares.global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS patient_data_shares_revoke_update_v2 ON public.patient_data_shares;
CREATE POLICY patient_data_shares_revoke_update_v2 ON public.patient_data_shares
FOR UPDATE TO authenticated
USING (
  public.is_clinic_member(grantor_clinic_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = patient_data_shares.global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
)
WITH CHECK (revoked_at IS NOT NULL);

DROP POLICY IF EXISTS privacy_code_attempts_select_v2 ON public.privacy_code_attempts;
CREATE POLICY privacy_code_attempts_select_v2 ON public.privacy_code_attempts
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = privacy_code_attempts.global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.clinic_id = privacy_code_attempts.attempted_by_clinic_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'OWNER'
      AND cm.status = 'ACTIVE'
  )
);

DROP POLICY IF EXISTS patients_select_v2 ON public.patients;
CREATE POLICY patients_select_v2 ON public.patients
FOR SELECT TO authenticated
USING (
  public.is_clinic_member(patients.clinic_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.patient_clinic_records pcr
    WHERE pcr.global_patient_id = patients.global_patient_id
      AND public.is_clinic_member(pcr.clinic_id, auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = patients.global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
);

COMMIT;
