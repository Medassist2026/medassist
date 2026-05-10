-- ============================================================================
-- Migration 115 — patient_clinic_records RLS extension for OR-of-three
--                 (B07 Phase D)
--
-- Audit references:
--   * audits/B07-architectural-review-2026-05-10.md § 4.5 (extend patient-
--     side RLS with `is_authorized_actor_on` OR-clause)
--   * audits/b07-phase-d-e-execution-2026-05-09.md Decision 6 (RLS = authority,
--     handler = capability) — PCR SELECT permissive to any authorized actor;
--     handler-layer requireCapability gates actions.
--   * mig 113 (defines public.is_authorized_actor_on used here)
--
-- Pre-change policy snapshot (verbatim from pg_policies, 2026-05-09):
--
--   patient_clinic_records_no_delete_v2 (DELETE): USING (false)
--   patient_clinic_records_insert_v2 (INSERT):
--     WITH CHECK is_clinic_member(clinic_id, auth.uid())
--   patient_clinic_records_select_v2 (SELECT):
--     USING (is_clinic_member(clinic_id, auth.uid())
--            OR can_patient_access_global_patient(global_patient_id, auth.uid()))
--   patient_clinic_records_update_v2 (UPDATE):
--     USING is_clinic_member(clinic_id, auth.uid())
--     WITH CHECK is_clinic_member(clinic_id, auth.uid())
--
-- What this migration changes
-- ---------------------------
--   §115.1  ALTER POLICY patient_clinic_records_select_v2 — extend USING with
--           OR public.is_authorized_actor_on(global_patient_id, auth.uid()).
--           SELECT becomes accessible to: clinic-member / self-claim (kept
--           via existing helper for short-circuit) / guardian-of-minor /
--           active delegate.
--
--   §115.2  Smoke probe (DO block) — verify SELECT policy admits guardians
--           and delegates correctly.
--
-- What this migration does NOT do
-- -------------------------------
--   * NOT extend INSERT or UPDATE — PCRs are clinic-side ledger writes;
--     patients/guardians/delegates do not create or mutate PCR rows.
--   * NOT touch DELETE (false-restricted).
--   * NOT remove `can_patient_access_global_patient` from the SELECT
--     predicate — it short-circuits cheaply for the self-claim case
--     (single PK lookup) before falling through to is_authorized_actor_on
--     which has the broader OR-of-three.
--
-- Depends on
-- ----------
--   * mig 113 (public.is_authorized_actor_on)
--   * mig 092 (public.is_clinic_member, public.can_patient_access_global_patient)
--
-- Rollback
-- --------
-- REVERSIBLE. Companion: 115_patient_clinic_records_authority_rls.rollback.sql.
-- ============================================================================

ALTER POLICY patient_clinic_records_select_v2 ON public.patient_clinic_records
  USING (
    public.is_clinic_member(clinic_id, auth.uid())
    OR public.can_patient_access_global_patient(global_patient_id, auth.uid())
    OR public.is_authorized_actor_on(global_patient_id, auth.uid())
  );

-- §115.2 — Smoke probe
DO $body$
DECLARE
  v_users UUID[];
  v_user_self UUID;
  v_user_guardian UUID;
  v_user_delegate UUID;

  v_gp_self UUID := '00000115-0000-0000-0000-000000000001'::uuid;
  v_gp_guardian UUID := '00000115-0000-0000-0000-000000000002'::uuid;
  v_gp_minor UUID := '00000115-0000-0000-0000-000000000003'::uuid;

  v_clinic_id UUID;
  v_pcr_self UUID := '00000115-0000-0000-0000-000000000010'::uuid;
  v_pcr_minor UUID := '00000115-0000-0000-0000-000000000011'::uuid;

  v_guardian_can_see_minor_pcr BOOLEAN;
  v_delegate_can_see_principal_pcr BOOLEAN;
  v_unrelated_user_visibility BOOLEAN;
BEGIN
  -- Pick 3 unclaimed users
  SELECT array_agg(id) INTO v_users FROM (
    SELECT id FROM auth.users
     WHERE id NOT IN (SELECT claimed_user_id FROM public.global_patients
                       WHERE claimed_user_id IS NOT NULL)
     ORDER BY created_at LIMIT 3
  ) sub;

  IF v_users IS NULL OR array_length(v_users, 1) < 3 THEN
    RAISE NOTICE 'mig 115 smoke probe: fewer than 3 unclaimed auth.users; skipping.';
    RETURN;
  END IF;

  v_user_self := v_users[1];
  v_user_guardian := v_users[2];
  v_user_delegate := v_users[3];

  -- Pick any clinic
  SELECT id INTO v_clinic_id FROM public.clinics LIMIT 1;
  IF v_clinic_id IS NULL THEN
    RAISE NOTICE 'mig 115 smoke probe: no clinics on staging; skipping.';
    RETURN;
  END IF;

  -- Transient gps
  INSERT INTO public.global_patients (id, normalized_phone, display_name, claimed, claimed_user_id, claimed_at, is_minor, account_status)
    VALUES (v_gp_self, NULL, 'Mig 115 self fixture', TRUE, v_user_self, NOW(), FALSE, 'active');
  INSERT INTO public.global_patients (id, normalized_phone, display_name, claimed, claimed_user_id, claimed_at, is_minor, account_status)
    VALUES (v_gp_guardian, NULL, 'Mig 115 guardian fixture', TRUE, v_user_guardian, NOW(), FALSE, 'active');
  INSERT INTO public.global_patients (id, normalized_phone, display_name, claimed, claimed_user_id, claimed_at, is_minor, guardian_global_patient_id, account_status)
    VALUES (v_gp_minor, NULL, 'Mig 115 minor fixture', FALSE, NULL, NULL, TRUE, v_gp_guardian, 'active');

  -- PCRs (one per gp at v_clinic_id)
  INSERT INTO public.patient_clinic_records (id, global_patient_id, clinic_id)
    VALUES (v_pcr_self, v_gp_self, v_clinic_id);
  INSERT INTO public.patient_clinic_records (id, global_patient_id, clinic_id)
    VALUES (v_pcr_minor, v_gp_minor, v_clinic_id);

  -- Active delegation: v_gp_self → v_user_delegate
  INSERT INTO public.patient_delegations (principal_global_patient_id, delegate_user_id, capabilities, granted_by_user_id, accepted_at, expires_at)
    VALUES (v_gp_self, v_user_delegate, '["view_records"]'::jsonb, v_user_self, NOW(), NOW() + INTERVAL '1 day');

  -- Probe as v_user_guardian: should SELECT v_pcr_minor
  PERFORM set_config('role', 'authenticated', TRUE);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_guardian::text, 'role', 'authenticated')::text, TRUE);
  SELECT EXISTS (SELECT 1 FROM public.patient_clinic_records WHERE id = v_pcr_minor) INTO v_guardian_can_see_minor_pcr;
  IF NOT v_guardian_can_see_minor_pcr THEN
    PERFORM set_config('role', 'postgres', TRUE);
    RAISE EXCEPTION 'mig 115 smoke probe POS-guardian: guardian cannot SELECT minor PCR';
  END IF;

  -- Probe as v_user_delegate: should SELECT v_pcr_self
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_delegate::text, 'role', 'authenticated')::text, TRUE);
  SELECT EXISTS (SELECT 1 FROM public.patient_clinic_records WHERE id = v_pcr_self) INTO v_delegate_can_see_principal_pcr;
  IF NOT v_delegate_can_see_principal_pcr THEN
    PERFORM set_config('role', 'postgres', TRUE);
    RAISE EXCEPTION 'mig 115 smoke probe POS-delegate: delegate cannot SELECT principal PCR';
  END IF;

  -- Probe as v_user_delegate seeing v_pcr_minor (NEG: delegate of self is NOT delegate of minor)
  SELECT EXISTS (SELECT 1 FROM public.patient_clinic_records WHERE id = v_pcr_minor) INTO v_unrelated_user_visibility;
  IF v_unrelated_user_visibility THEN
    PERFORM set_config('role', 'postgres', TRUE);
    RAISE EXCEPTION 'mig 115 smoke probe NEG: delegate of self should NOT see unrelated minor PCR';
  END IF;

  PERFORM set_config('role', 'postgres', TRUE);
  PERFORM set_config('request.jwt.claims', '', TRUE);

  -- Cleanup
  DELETE FROM public.patient_delegations WHERE principal_global_patient_id IN (v_gp_self, v_gp_guardian);
  DELETE FROM public.patient_clinic_records WHERE id IN (v_pcr_self, v_pcr_minor);
  DELETE FROM public.global_patients WHERE id = v_gp_minor;
  DELETE FROM public.global_patients WHERE id = v_gp_guardian;
  DELETE FROM public.global_patients WHERE id = v_gp_self;

  RAISE NOTICE 'mig 115 smoke probe: 3 PCR-SELECT assertions PASS (2 POS + 1 NEG)';
END;
$body$ LANGUAGE plpgsql;

DO $body$
DECLARE v_qual TEXT;
BEGIN
  SELECT qual::text INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'patient_clinic_records'
     AND policyname = 'patient_clinic_records_select_v2';
  IF v_qual NOT LIKE '%is_authorized_actor_on%' THEN
    RAISE EXCEPTION 'mig 115 post-condition: SELECT policy missing is_authorized_actor_on; got: %', v_qual;
  END IF;
  RAISE NOTICE 'mig 115 post-condition: SELECT policy extended with is_authorized_actor_on';
END $body$;
