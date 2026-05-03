-- ============================================================
-- mig 094a — Prompt 6 Phase C: RLS recursion fix + helper-uniformity
-- Date: 2026-04-30 (cowork session 5)
-- Owner: Backend
--
-- ⚠️  CRITICAL FIX MIGRATION
-- This migration corrects a P0 bug introduced by mig 093 and confirmed
-- live on staging.  Mig 093 SELECT policies on `global_patients`,
-- `patient_clinic_records`, `patient_data_shares`, `privacy_code_attempts`,
-- and `patients` contained inline EXISTS subqueries against each other.
-- Under SECURITY INVOKER (the default RLS predicate evaluation context),
-- each EXISTS hits the queried table's own RLS policy, which contains
-- another EXISTS pointing back — Postgres detects the cycle and aborts:
--
--   ERROR:  42P17: infinite recursion detected in policy
--           for relation "patient_clinic_records"
--
-- The exact recursion chain:
--   1. SELECT FROM patient_clinic_records  (as authenticated user)
--   2. → patient_clinic_records_select_v2 USING evaluates inline EXISTS
--        on global_patients (patient-self branch)
--   3. → global_patients SELECT policy is invoked under INVOKER
--   4. → global_patients_select_v2 USING evaluates inline EXISTS on
--        patient_clinic_records (clinic-via-PCR branch)
--   5. → patient_clinic_records SELECT policy invoked again
--   6. → cycle.
--
-- Caught by the Phase D step-2 test-harness prototype, BEFORE scenario
-- authoring — exactly the prototype-before-author discipline this
-- program is supposed to apply.  Documented in build-06-results.md § 3.
--
-- THE FIX
-- -------
-- Mo's amended rule (2026-04-30): every helper called from any RLS
-- USING clause is SECURITY DEFINER.  No exceptions.  Mo's original
-- "hybrid INVOKER+DEFINER" ruling was empirically falsified by this
-- bug.  Uniform rule beats exception:
--
--   * is_clinic_member                  — DEFINER (already, mig 092)
--   * can_patient_access_global_patient — DEFINER (FLIP from INVOKER)
--   * can_clinic_access_global_patient  — DEFINER (FLIP from INVOKER)
--   * can_view_patient_data_at_clinic   — DEFINER (already, mig 092)
--   * user_has_clinic_path_to_gp        — DEFINER (NEW, this migration)
--
-- Then every policy that contains an inline EXISTS-against-another-
-- patient-table is rewritten to call a helper instead of the inline
-- EXISTS.  DEFINER bypasses RLS during the helper's internal joins,
-- so no policy is re-entered → no recursion.
--
-- Performance: DEFINER is strictly faster here than the INVOKER chain
-- it replaces.  An INVOKER helper would have re-evaluated each table's
-- RLS policy on every join; DEFINER skips that work entirely.  The
-- mig 092 benchmark numbers (warm median 0.014–0.023ms) hold or
-- improve.
--
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- 1. Helper functions — flip security model + add the new one
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_patient_access_global_patient(
  p_global_patient_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
PARALLEL SAFE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.global_patients
    WHERE id = p_global_patient_id
      AND claimed_user_id = p_user_id
  );
$$;

COMMENT ON FUNCTION public.can_patient_access_global_patient(UUID, UUID) IS
  'mig 094a: FLIPPED to SECURITY DEFINER. Reads global_patients which has a SELECT policy that recurses through patient_clinic_records — INVOKER would re-enter the calling policy.';


CREATE OR REPLACE FUNCTION public.can_clinic_access_global_patient(
  p_global_patient_id UUID,
  p_clinic_id UUID
) RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
PARALLEL SAFE
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

COMMENT ON FUNCTION public.can_clinic_access_global_patient(UUID, UUID) IS
  'mig 094a: FLIPPED to SECURITY DEFINER per uniform-rule. Reads PCR + patient_data_shares — both have policies with cross-table EXISTS that recurse under INVOKER.';


CREATE OR REPLACE FUNCTION public.user_has_clinic_path_to_gp(
  p_global_patient_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
PARALLEL SAFE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.patient_clinic_records pcr
    JOIN public.clinic_memberships cm
      ON cm.clinic_id = pcr.clinic_id
     AND cm.user_id = p_user_id
     AND cm.status = 'ACTIVE'
    WHERE pcr.global_patient_id = p_global_patient_id
  );
$$;

COMMENT ON FUNCTION public.user_has_clinic_path_to_gp(UUID, UUID) IS
  'mig 094a NEW: returns TRUE if the user is an ACTIVE member of any clinic where the gp has a PCR. DEFINER, replaces inline EXISTS in global_patients/patients SELECT policies that would have recursed.';


-- ────────────────────────────────────────────────────────────────────
-- 2. Rewrite policies that had inline cross-table EXISTS
-- ────────────────────────────────────────────────────────────────────

-- 2a. global_patients_select_v2 — replace PCR EXISTS with helper

DROP POLICY IF EXISTS global_patients_select_v2 ON public.global_patients;

CREATE POLICY global_patients_select_v2 ON public.global_patients
FOR SELECT TO authenticated
USING (
  claimed_user_id = auth.uid()
  OR public.user_has_clinic_path_to_gp(id, auth.uid())
);


-- 2b. patient_clinic_records_select_v2 — replace global_patients EXISTS with helper

DROP POLICY IF EXISTS patient_clinic_records_select_v2 ON public.patient_clinic_records;

CREATE POLICY patient_clinic_records_select_v2 ON public.patient_clinic_records
FOR SELECT TO authenticated
USING (
  public.is_clinic_member(clinic_id, auth.uid())
  OR public.can_patient_access_global_patient(global_patient_id, auth.uid())
);


-- 2c. patient_data_shares_select_v2 — replace global_patients EXISTS with helper

DROP POLICY IF EXISTS patient_data_shares_select_v2 ON public.patient_data_shares;

CREATE POLICY patient_data_shares_select_v2 ON public.patient_data_shares
FOR SELECT TO authenticated
USING (
  public.is_clinic_member(grantor_clinic_id, auth.uid())
  OR public.is_clinic_member(grantee_clinic_id, auth.uid())
  OR public.can_patient_access_global_patient(global_patient_id, auth.uid())
);


-- 2d. patient_data_shares_revoke_update_v2 — replace global_patients EXISTS with helper

DROP POLICY IF EXISTS patient_data_shares_revoke_update_v2 ON public.patient_data_shares;

CREATE POLICY patient_data_shares_revoke_update_v2 ON public.patient_data_shares
FOR UPDATE TO authenticated
USING (
  public.is_clinic_member(grantor_clinic_id, auth.uid())
  OR public.can_patient_access_global_patient(global_patient_id, auth.uid())
)
WITH CHECK (revoked_at IS NOT NULL);


-- 2e. privacy_code_attempts_select_v2 — replace global_patients EXISTS with helper.
--     The clinic_memberships EXISTS stays inline (it does NOT recurse — clinic_memberships
--     SELECT policy uses is_clinic_member which is DEFINER, breaking any cycle).

DROP POLICY IF EXISTS privacy_code_attempts_select_v2 ON public.privacy_code_attempts;

CREATE POLICY privacy_code_attempts_select_v2 ON public.privacy_code_attempts
FOR SELECT TO authenticated
USING (
  public.can_patient_access_global_patient(global_patient_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.clinic_id = privacy_code_attempts.attempted_by_clinic_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'OWNER'
      AND cm.status = 'ACTIVE'
  )
);


-- 2f. patients_select_v2 — replace BOTH inline EXISTS with helpers

DROP POLICY IF EXISTS patients_select_v2 ON public.patients;

CREATE POLICY patients_select_v2 ON public.patients
FOR SELECT TO authenticated
USING (
  public.is_clinic_member(patients.clinic_id, auth.uid())
  OR public.user_has_clinic_path_to_gp(patients.global_patient_id, auth.uid())
  OR public.can_patient_access_global_patient(patients.global_patient_id, auth.uid())
);


COMMIT;


-- ============================================================
-- Post-condition: verify all helpers are SECURITY DEFINER
-- ============================================================

DO $$
DECLARE
  v_should_be_definer TEXT[] := ARRAY[
    'is_clinic_member',
    'can_patient_access_global_patient',
    'can_clinic_access_global_patient',
    'can_view_patient_data_at_clinic',
    'user_has_clinic_path_to_gp'
  ];
  fname TEXT;
  v_count INT;
BEGIN
  FOREACH fname IN ARRAY v_should_be_definer LOOP
    SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = fname
      AND p.prosecdef = TRUE;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'mig 094a post-condition failed: % is missing or not SECURITY DEFINER', fname;
    END IF;
  END LOOP;

  -- Verify the rewritten policies still exist
  FOREACH fname IN ARRAY ARRAY[
    'global_patients_select_v2',
    'patient_clinic_records_select_v2',
    'patient_data_shares_select_v2',
    'patient_data_shares_revoke_update_v2',
    'privacy_code_attempts_select_v2',
    'patients_select_v2'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname=fname) THEN
      RAISE EXCEPTION 'mig 094a post-condition failed: policy % missing after rewrite', fname;
    END IF;
  END LOOP;

  RAISE NOTICE 'mig 094a post-condition: 5 DEFINER helpers + 6 rewritten policies present';
END $$;
