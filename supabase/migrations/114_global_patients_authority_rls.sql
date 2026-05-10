-- ============================================================================
-- Migration 114 — global_patients RLS extension for OR-of-three authority
--                 (B07 Phase D)
--
-- Audit references:
--   * audits/B07-architectural-review-2026-05-10.md § 4.5 (extend patient-side
--     RLS with `is_authorized_actor_on` OR-clause)
--   * audits/b07-phase-d-e-execution-2026-05-09.md Decision 7 (UPDATE narrowed
--     to guardian-only inline EXISTS — does NOT admit delegate; profile-update
--     not in MVP capability set; defends against silent delegate-update path
--     when handler lacks requireCapability)
--   * mig 113 (defines public.is_authorized_actor_on used here)
--
-- Pre-change policy snapshot (verbatim from pg_policies, 2026-05-09):
--
--   global_patients_no_delete_v2 (DELETE, PERMISSIVE, authenticated):
--     USING (false)
--   global_patients_no_direct_insert_v2 (INSERT, PERMISSIVE, authenticated):
--     WITH CHECK (false)
--   global_patients_select_v2 (SELECT, PERMISSIVE, authenticated):
--     USING ((claimed_user_id = auth.uid())
--            OR user_has_clinic_path_to_gp(id, auth.uid()))
--   global_patients_self_update_v2 (UPDATE, PERMISSIVE, authenticated):
--     USING (claimed_user_id = auth.uid())
--     WITH CHECK (claimed_user_id = auth.uid())
--
-- What this migration changes
-- ---------------------------
--   §114.1  ALTER POLICY global_patients_select_v2 — extend USING with
--           OR public.is_authorized_actor_on(id, auth.uid()).
--           SELECT becomes accessible to: self / clinic-with-PCR-or-share /
--           guardian-of-minor / active delegate. Permissive (any branch grants).
--
--   §114.2  ALTER POLICY global_patients_self_update_v2 — extend USING and
--           WITH CHECK with OR <inline guardian-link EXISTS>. UPDATE becomes
--           accessible to: self / guardian-of-minor. Delegate is INTENTIONALLY
--           NOT admitted — profile-update has no MVP capability and the
--           existing /api/patient/profile handler does not call
--           requireCapability. Phase D-E Decision 7.
--
--   §114.3  Smoke probe (DO block) — verify policies admit/deny correctly.
--
-- What this migration does NOT do
-- -------------------------------
--   * NOT touch the false-restricted DELETE / INSERT policies. Direct
--     inserts and deletes on global_patients remain blocked at the RLS
--     layer; the application uses admin-client paths for those.
--   * NOT add a new helper function (e.g., is_self_or_guardian_on). The
--     UPDATE policy uses inline EXISTS to avoid scope-creep. If a future
--     mig adds the same predicate to ≥3 policies, refactor to a helper at
--     that point.
--   * NOT use DROP+CREATE pattern. Per Phase D-E Decision 3 (ALTER POLICY
--     in place); preserves grant audit trail.
--
-- Depends on
-- ----------
--   * mig 113 (public.is_authorized_actor_on)
--   * mig 094a (public.user_has_clinic_path_to_gp — referenced by SELECT)
--   * mig 109 (global_patients.is_minor + guardian_global_patient_id)
--
-- Rollback
-- --------
-- REVERSIBLE. Companion: 114_global_patients_authority_rls.rollback.sql.
-- Restores the pre-change USING / WITH CHECK clauses verbatim.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §114.1 — Extend SELECT policy with OR-of-three (any authorized actor)
-- ---------------------------------------------------------------------------
ALTER POLICY global_patients_select_v2 ON public.global_patients
  USING (
    (claimed_user_id = auth.uid())
    OR public.user_has_clinic_path_to_gp(id, auth.uid())
    OR public.is_authorized_actor_on(id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- §114.2 — Extend UPDATE policy with guardian-only inline EXISTS
-- ---------------------------------------------------------------------------
-- Self OR guardian-of-minor. NOT delegate. Per Phase D-E Decision 7.
ALTER POLICY global_patients_self_update_v2 ON public.global_patients
  USING (
    (claimed_user_id = auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.global_patients g
       WHERE g.id = global_patients.guardian_global_patient_id
         AND global_patients.is_minor = TRUE
         AND g.claimed_user_id = auth.uid()
    )
  )
  WITH CHECK (
    (claimed_user_id = auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.global_patients g
       WHERE g.id = global_patients.guardian_global_patient_id
         AND global_patients.is_minor = TRUE
         AND g.claimed_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- §114.3 — Smoke probe
-- ---------------------------------------------------------------------------
-- Verifies the extended policies admit / deny SELECT correctly under role
-- switching. Exercises the SELECT path only — UPDATE smoke is structurally
-- identical (same OR-of-three pattern via inline EXISTS) and runs as part
-- of the matrix re-run, not inline.
--
-- Set role to authenticated + jwt sub to a target user; SELECT global_patients
-- and assert visibility per case. Cleanup at end restores fixtures.
DO $body$
DECLARE
  v_users UUID[];
  v_user_self UUID;
  v_user_guardian UUID;
  v_user_delegate UUID;

  v_gp_self UUID := '00000114-0000-0000-0000-000000000001'::uuid;
  v_gp_guardian UUID := '00000114-0000-0000-0000-000000000002'::uuid;
  v_gp_minor UUID := '00000114-0000-0000-0000-000000000003'::uuid;

  v_self_can_see_self BOOLEAN;
  v_guardian_can_see_minor BOOLEAN;
  v_delegate_can_see_principal BOOLEAN;
  v_unrelated_can_see_self BOOLEAN;
BEGIN
  -- Pick 3 unclaimed auth.users
  SELECT array_agg(id) INTO v_users FROM (
    SELECT id FROM auth.users
     WHERE id NOT IN (SELECT claimed_user_id FROM public.global_patients
                       WHERE claimed_user_id IS NOT NULL)
     ORDER BY created_at LIMIT 3
  ) sub;

  IF v_users IS NULL OR array_length(v_users, 1) < 3 THEN
    RAISE NOTICE 'mig 114 smoke probe: fewer than 3 unclaimed auth.users; skipping.';
    RETURN;
  END IF;

  v_user_self := v_users[1];
  v_user_guardian := v_users[2];
  v_user_delegate := v_users[3];

  -- Transient fixtures
  INSERT INTO public.global_patients (id, normalized_phone, display_name, claimed, claimed_user_id, claimed_at, is_minor, account_status)
    VALUES (v_gp_self, NULL, 'Mig 114 self fixture', TRUE, v_user_self, NOW(), FALSE, 'active');
  INSERT INTO public.global_patients (id, normalized_phone, display_name, claimed, claimed_user_id, claimed_at, is_minor, account_status)
    VALUES (v_gp_guardian, NULL, 'Mig 114 guardian fixture', TRUE, v_user_guardian, NOW(), FALSE, 'active');
  INSERT INTO public.global_patients (id, normalized_phone, display_name, claimed, claimed_user_id, claimed_at, is_minor, guardian_global_patient_id, account_status)
    VALUES (v_gp_minor, NULL, 'Mig 114 minor fixture', FALSE, NULL, NULL, TRUE, v_gp_guardian, 'active');

  -- Active delegation: v_gp_self → v_user_delegate
  INSERT INTO public.patient_delegations (principal_global_patient_id, delegate_user_id, capabilities, granted_by_user_id, accepted_at, expires_at)
    VALUES (v_gp_self, v_user_delegate, '["view_records"]'::jsonb, v_user_self, NOW(), NOW() + INTERVAL '1 day');

  -- Probe as v_user_self: should see v_gp_self
  PERFORM set_config('role', 'authenticated', TRUE);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_self::text, 'role', 'authenticated')::text, TRUE);
  SELECT EXISTS (SELECT 1 FROM public.global_patients WHERE id = v_gp_self) INTO v_self_can_see_self;
  IF NOT v_self_can_see_self THEN
    PERFORM set_config('role', 'postgres', TRUE);  -- restore
    RAISE EXCEPTION 'mig 114 smoke probe POS-self: self-claimed user cannot SELECT own gp';
  END IF;

  -- Probe as v_user_guardian: should see v_gp_minor (guardian-link branch)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_guardian::text, 'role', 'authenticated')::text, TRUE);
  SELECT EXISTS (SELECT 1 FROM public.global_patients WHERE id = v_gp_minor) INTO v_guardian_can_see_minor;
  IF NOT v_guardian_can_see_minor THEN
    PERFORM set_config('role', 'postgres', TRUE);
    RAISE EXCEPTION 'mig 114 smoke probe POS-guardian: guardian cannot SELECT minor''s gp';
  END IF;

  -- Probe as v_user_delegate: should see v_gp_self (delegation branch)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_delegate::text, 'role', 'authenticated')::text, TRUE);
  SELECT EXISTS (SELECT 1 FROM public.global_patients WHERE id = v_gp_self) INTO v_delegate_can_see_principal;
  IF NOT v_delegate_can_see_principal THEN
    PERFORM set_config('role', 'postgres', TRUE);
    RAISE EXCEPTION 'mig 114 smoke probe POS-delegate: delegate cannot SELECT principal''s gp';
  END IF;

  -- Probe as v_user_delegate seeing v_gp_minor (NEG: no relationship there)
  SELECT EXISTS (SELECT 1 FROM public.global_patients WHERE id = v_gp_minor) INTO v_unrelated_can_see_self;
  IF v_unrelated_can_see_self THEN
    PERFORM set_config('role', 'postgres', TRUE);
    RAISE EXCEPTION 'mig 114 smoke probe NEG: delegate of v_gp_self should NOT see unrelated v_gp_minor';
  END IF;

  -- Restore role for cleanup
  PERFORM set_config('role', 'postgres', TRUE);
  PERFORM set_config('request.jwt.claims', '', TRUE);

  -- Cleanup (FK-safe order)
  DELETE FROM public.patient_delegations
   WHERE principal_global_patient_id IN (v_gp_self, v_gp_guardian);
  DELETE FROM public.global_patients WHERE id = v_gp_minor;
  DELETE FROM public.global_patients WHERE id = v_gp_guardian;
  DELETE FROM public.global_patients WHERE id = v_gp_self;

  RAISE NOTICE 'mig 114 smoke probe: 4 SELECT-policy assertions PASS (3 POS + 1 NEG)';
END;
$body$ LANGUAGE plpgsql;

-- Post-condition assertions: policies modified as expected
DO $body$
DECLARE v_qual TEXT; v_with_check TEXT;
BEGIN
  SELECT qual::text INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'global_patients'
     AND policyname = 'global_patients_select_v2';
  IF v_qual NOT LIKE '%is_authorized_actor_on%' THEN
    RAISE EXCEPTION 'mig 114 post-condition: SELECT policy missing is_authorized_actor_on; got: %', v_qual;
  END IF;

  SELECT qual::text, with_check::text INTO v_qual, v_with_check FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'global_patients'
     AND policyname = 'global_patients_self_update_v2';
  IF v_qual NOT LIKE '%is_minor%' OR v_with_check NOT LIKE '%is_minor%' THEN
    RAISE EXCEPTION 'mig 114 post-condition: UPDATE policy missing guardian-link inline EXISTS; got USING=% WITH CHECK=%', v_qual, v_with_check;
  END IF;

  RAISE NOTICE 'mig 114 post-condition: SELECT + UPDATE policies extended as expected';
END $body$;
