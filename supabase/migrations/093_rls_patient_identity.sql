-- ============================================================
-- mig 093 — Prompt 6 Phase C: patient identity tables RLS rewrite
-- Date: 2026-04-30
-- Owner: Backend (cowork session 3)
--
-- Tables in scope:
--   1. global_patients              — drop V2-06 placeholder, real policies
--   2. patient_clinic_records       — drop V3-01 placeholder, real policies
--   3. patient_data_shares          — drop V5-01 placeholders, real policies
--   4. privacy_code_attempts        — drop V4-01 SELECT placeholder, real
--                                     SELECT policy. INSERT/UPDATE/DELETE
--                                     placeholders STAY (writes via SECURITY
--                                     DEFINER record_privacy_code_attempt only).
--   5. patients (LEGACY)            — ADD mirror policies alongside 8
--                                     existing policies (PERMISSIVE-OR).
--                                     Dropped in mig 101 once Phase D run
--                                     #3 is 100% green; table itself drops
--                                     in Prompt 6.5.
--                                     (Slot was originally referred to as
--                                     "mig 098" in Prompt 6 spec; renumbered
--                                     to 101 per session-16 ruling 2026-05-02
--                                     because Phase F added migs 098/099/100
--                                     for patient_code work + clinic-resolve
--                                     RPC. The legacy-drop migration itself
--                                     was never written under the original
--                                     slot — verify before any rename.)
--
-- Tables NOT touched (deliberately keep their DENY-ALL final state):
--   * patient_privacy_codes  — schema spec § 5: code_hash never readable
--                              by any client; ALL access via SECURITY
--                              DEFINER verify_privacy_code() /
--                              regenerate_privacy_code(). 4 DENY-ALL
--                              policies are the FINAL state.
--   * privacy_code_sms_tokens — same pattern (ORPH-V4-03 final state).
--
-- Closures (Phase H verifies):
--   ORPH-V2-06 (global_patients RLS placeholder)
--   ORPH-V3-01 (patient_clinic_records RLS placeholder)
--   ORPH-V4-01 (privacy_code_attempts RLS placeholder — only SELECT
--               replaced; INSERT/UPDATE/DELETE keep DENY-ALL by design)
--   ORPH-V4-02 (patient_privacy_codes — closure is the explicit
--               confirmation that DENY-ALL IS the final state)
--   ORPH-V4-03 (privacy_code_sms_tokens — same)
--   ORPH-V5-01 (patient_data_shares RLS placeholder)
--
-- Design notes:
--   * No caregiver paths (Mo's ruling 2: deferred to Prompt 7).
--   * is_clinic_member is SECURITY DEFINER (mig 092 documented deviation).
--   * Coexistence strategy per Mo § C1: PERMISSIVE-OR. Old policies
--     remain on `patients` until mig 101. For tables WITH DENY-ALL
--     placeholders, the placeholders are dropped in this same migration
--     because PERMISSIVE-OR can't unblock a FALSE policy on the existing
--     SELECT/INSERT path — the placeholders block all reads regardless
--     of any other PERMISSIVE policy added.
--   * The SECURITY DEFINER functions that write to these tables
--     (claim_or_create_global_patient, create_data_share,
--     record_privacy_code_attempt, etc.) bypass RLS entirely as
--     OWNER=postgres — no RLS changes affect those write paths.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- 1. global_patients
-- ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS global_patients_deny_all ON public.global_patients;

-- SELECT: clinic members can see patients in clinics they belong to (via PCR);
--         claimed patients can see themselves.
CREATE POLICY global_patients_select_v2 ON public.global_patients
FOR SELECT TO authenticated
USING (
  -- Patient self-view
  claimed_user_id = auth.uid()
  -- Clinic member viewing a patient who has a PCR at their clinic
  OR EXISTS (
    SELECT 1
    FROM public.patient_clinic_records pcr
    WHERE pcr.global_patient_id = global_patients.id
      AND public.is_clinic_member(pcr.clinic_id, auth.uid())
  )
);

-- INSERT: forbidden — only via SECURITY DEFINER claim_or_create_global_patient.
CREATE POLICY global_patients_no_direct_insert_v2 ON public.global_patients
FOR INSERT TO authenticated
WITH CHECK (FALSE);

-- UPDATE: patient updating own demographics. Note: normalized_phone immutability
-- is enforced by the phone_change_requests flow + auth.users update lockout
-- (mig 070 + mig 089), NOT by RLS WITH CHECK (which can't compare old vs new).
CREATE POLICY global_patients_self_update_v2 ON public.global_patients
FOR UPDATE TO authenticated
USING (claimed_user_id = auth.uid())
WITH CHECK (claimed_user_id = auth.uid());

-- DELETE: forbidden. Soft-delete via account_status='deceased'/'merged'.
CREATE POLICY global_patients_no_delete_v2 ON public.global_patients
FOR DELETE TO authenticated
USING (FALSE);

COMMENT ON POLICY global_patients_select_v2 ON public.global_patients IS
  'Prompt 6 mig 093: clinic-via-PCR + patient-self. Caregiver path deferred to Prompt 7.';


-- ────────────────────────────────────────────────────────────────────
-- 2. patient_clinic_records
-- ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS patient_clinic_records_deny_all ON public.patient_clinic_records;

CREATE POLICY patient_clinic_records_select_v2 ON public.patient_clinic_records
FOR SELECT TO authenticated
USING (
  -- Clinic member of THIS row's clinic
  public.is_clinic_member(clinic_id, auth.uid())
  -- Patient self-view
  OR EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = patient_clinic_records.global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
);

CREATE POLICY patient_clinic_records_insert_v2 ON public.patient_clinic_records
FOR INSERT TO authenticated
WITH CHECK (public.is_clinic_member(clinic_id, auth.uid()));

CREATE POLICY patient_clinic_records_update_v2 ON public.patient_clinic_records
FOR UPDATE TO authenticated
USING (public.is_clinic_member(clinic_id, auth.uid()))
WITH CHECK (public.is_clinic_member(clinic_id, auth.uid()));

CREATE POLICY patient_clinic_records_no_delete_v2 ON public.patient_clinic_records
FOR DELETE TO authenticated
USING (FALSE);


-- ────────────────────────────────────────────────────────────────────
-- 3. patient_data_shares
-- ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS patient_data_shares_no_select ON public.patient_data_shares;
DROP POLICY IF EXISTS patient_data_shares_no_insert ON public.patient_data_shares;
DROP POLICY IF EXISTS patient_data_shares_no_update ON public.patient_data_shares;
DROP POLICY IF EXISTS patient_data_shares_no_delete ON public.patient_data_shares;

CREATE POLICY patient_data_shares_select_v2 ON public.patient_data_shares
FOR SELECT TO authenticated
USING (
  -- Grantor clinic member (their own grant log)
  public.is_clinic_member(grantor_clinic_id, auth.uid())
  -- Grantee clinic member (so they see what they have access to)
  OR public.is_clinic_member(grantee_clinic_id, auth.uid())
  -- Patient self-view (sharing UI)
  OR EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = patient_data_shares.global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
);

-- INSERT: forbidden — only via SECURITY DEFINER create_data_share /
-- create_shares_for_grantors / auto_renew_shares_on_visit.
CREATE POLICY patient_data_shares_no_direct_insert_v2 ON public.patient_data_shares
FOR INSERT TO authenticated
WITH CHECK (FALSE);

-- UPDATE: only revocation by grantor clinic member or patient self.
-- WITH CHECK enforces "revoked_at must be set" — column-level invariants
-- like "only revoked_at, revoked_by_user_id, revocation_reason changed"
-- are enforced by the trigger from mig 090.
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

-- DELETE: forbidden — soft revoke only.
CREATE POLICY patient_data_shares_no_delete_v2 ON public.patient_data_shares
FOR DELETE TO authenticated
USING (FALSE);


-- ────────────────────────────────────────────────────────────────────
-- 4. privacy_code_attempts — replace SELECT placeholder with real policy
-- ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS privacy_code_attempts_no_select ON public.privacy_code_attempts;

-- SELECT: patient self-view their own attempts; clinic OWNER sees attempts
-- originating from their clinic (forensics + audit review).
CREATE POLICY privacy_code_attempts_select_v2 ON public.privacy_code_attempts
FOR SELECT TO authenticated
USING (
  -- Patient self
  EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = privacy_code_attempts.global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
  -- Clinic OWNER for the attempt's originating clinic
  OR EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.clinic_id = privacy_code_attempts.attempted_by_clinic_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'OWNER'
      AND cm.status = 'ACTIVE'
  )
);

-- INSERT/UPDATE/DELETE policies stay as-is (privacy_code_attempts_no_insert /
-- _no_update / _no_delete remain in place). All writes through SECURITY DEFINER
-- record_privacy_code_attempt(...).


-- ────────────────────────────────────────────────────────────────────
-- 5. patients (LEGACY) — Mo's ruling 3: write mirror policies for
--    PERMISSIVE-OR coexistence with the 8 existing policies.
-- ────────────────────────────────────────────────────────────────────

CREATE POLICY patients_select_v2 ON public.patients
FOR SELECT TO authenticated
USING (
  -- Direct clinic-id match: clinic member of patients.clinic_id
  public.is_clinic_member(patients.clinic_id, auth.uid())
  -- Identity-model match: clinic member of any clinic the patient has a PCR at
  OR EXISTS (
    SELECT 1 FROM public.patient_clinic_records pcr
    WHERE pcr.global_patient_id = patients.global_patient_id
      AND public.is_clinic_member(pcr.clinic_id, auth.uid())
  )
  -- Claimed patient self-view (in case the legacy app surface still reads patients)
  OR EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.id = patients.global_patient_id
      AND gp.claimed_user_id = auth.uid()
  )
);

CREATE POLICY patients_insert_v2 ON public.patients
FOR INSERT TO authenticated
WITH CHECK (public.is_clinic_member(patients.clinic_id, auth.uid()));

CREATE POLICY patients_update_v2 ON public.patients
FOR UPDATE TO authenticated
USING (public.is_clinic_member(patients.clinic_id, auth.uid()))
WITH CHECK (public.is_clinic_member(patients.clinic_id, auth.uid()));

-- DELETE: deliberately NOT shipped as v2 (existing legacy policies handle
-- whatever delete the app does today; new identity model is no-delete).

COMMIT;

-- ============================================================
-- Post-condition: every v2 policy exists with the expected cmd
-- ============================================================
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  -- Checks all v2 policies exist
  FOR v_missing IN
    SELECT * FROM (VALUES
      ('global_patients','global_patients_select_v2'),
      ('global_patients','global_patients_no_direct_insert_v2'),
      ('global_patients','global_patients_self_update_v2'),
      ('global_patients','global_patients_no_delete_v2'),
      ('patient_clinic_records','patient_clinic_records_select_v2'),
      ('patient_clinic_records','patient_clinic_records_insert_v2'),
      ('patient_clinic_records','patient_clinic_records_update_v2'),
      ('patient_clinic_records','patient_clinic_records_no_delete_v2'),
      ('patient_data_shares','patient_data_shares_select_v2'),
      ('patient_data_shares','patient_data_shares_no_direct_insert_v2'),
      ('patient_data_shares','patient_data_shares_revoke_update_v2'),
      ('patient_data_shares','patient_data_shares_no_delete_v2'),
      ('privacy_code_attempts','privacy_code_attempts_select_v2'),
      ('patients','patients_select_v2'),
      ('patients','patients_insert_v2'),
      ('patients','patients_update_v2')
    ) AS expected(t, p)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_policies pp
      WHERE pp.schemaname='public' AND pp.tablename = expected.t AND pp.policyname = expected.p
    )
    LIMIT 1
  LOOP
    RAISE EXCEPTION 'mig 093 post-condition failed: missing policy % on %', v_missing.p, v_missing.t;
  END LOOP;

  -- Check the placeholders we DROPPED are gone
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname='global_patients_deny_all') THEN
    RAISE EXCEPTION 'mig 093 post-condition failed: global_patients_deny_all not dropped';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname='patient_clinic_records_deny_all') THEN
    RAISE EXCEPTION 'mig 093 post-condition failed: patient_clinic_records_deny_all not dropped';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='patient_data_shares' AND policyname IN ('patient_data_shares_no_select','patient_data_shares_no_insert','patient_data_shares_no_update','patient_data_shares_no_delete')) THEN
    RAISE EXCEPTION 'mig 093 post-condition failed: at least one patient_data_shares placeholder still present';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname='privacy_code_attempts_no_select') THEN
    RAISE EXCEPTION 'mig 093 post-condition failed: privacy_code_attempts_no_select not dropped';
  END IF;

  -- Check the DENY-ALL policies we LEFT ALONE are still present
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='patient_privacy_codes' AND cmd='SELECT') THEN
    RAISE EXCEPTION 'mig 093 post-condition failed: patient_privacy_codes SELECT policy missing (must stay DENY-ALL)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='privacy_code_sms_tokens' AND cmd='SELECT') THEN
    RAISE EXCEPTION 'mig 093 post-condition failed: privacy_code_sms_tokens SELECT policy missing (must stay DENY-ALL)';
  END IF;

  RAISE NOTICE 'mig 093 post-condition: 16 v2 policies present, 6 placeholders dropped, 2 DENY-ALL tables intact';
END $$;
