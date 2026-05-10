-- ============================================================================
-- Migration 116 — patient_data_shares + audit_events RLS extension for
--                 OR-of-three authority (B07 Phase D)
--
-- Audit references:
--   * audits/B07-architectural-review-2026-05-10.md § 4.5 (extend patient-
--     side RLS with `is_authorized_actor_on` OR-clause)
--   * audits/b07-phase-d-e-execution-2026-05-09.md
--     Decision 6 (RLS = authority, handler = capability)
--     Decision 7 (UPDATE policies extended to guardian-only; delegate excluded)
--     Decision 8 (patient_data_shares INSERT policy NOT changed — prompt
--                 referenced non-existent grantor_user_id / grantor_global_patient_id
--                 columns; existing WITH CHECK false enforces RPC-only creation
--                 per mig 091's create_shares_for_grantors)
--   * mig 113 (defines public.is_authorized_actor_on)
--
-- Pre-change policy snapshot (verbatim from pg_policies, 2026-05-09):
--
--   patient_data_shares_no_delete_v2 (DELETE): USING (false)
--   patient_data_shares_no_direct_insert_v2 (INSERT): WITH CHECK (false)
--   patient_data_shares_select_v2 (SELECT):
--     USING (is_clinic_member(grantor_clinic_id, auth.uid())
--            OR is_clinic_member(grantee_clinic_id, auth.uid())
--            OR can_patient_access_global_patient(global_patient_id, auth.uid()))
--   patient_data_shares_revoke_update_v2 (UPDATE):
--     USING (is_clinic_member(grantor_clinic_id, auth.uid())
--            OR can_patient_access_global_patient(global_patient_id, auth.uid()))
--     WITH CHECK (revoked_at IS NOT NULL)
--
--   audit_events_clinic_member_select_v2 (SELECT, unchanged):
--     USING ((clinic_id IS NOT NULL) AND is_clinic_member(clinic_id, auth.uid()))
--   audit_events_patient_self_select_v2 (SELECT):
--     USING ((resolved_global_patient_id IS NOT NULL)
--            AND can_patient_access_global_patient(resolved_global_patient_id, auth.uid()))
--   owners_view_audit_events (SELECT, unchanged): clinic-OWNER role view
--
-- What this migration changes
-- ---------------------------
--   §116.1  ALTER POLICY patient_data_shares_select_v2 — extend USING with
--           OR public.is_authorized_actor_on(global_patient_id, auth.uid()).
--           Permissive: any authorized actor can SELECT shares of their gp.
--
--   §116.2  ALTER POLICY patient_data_shares_revoke_update_v2 — extend USING
--           with OR <guardian-link inline EXISTS>. Self / clinic-grantor /
--           guardian-of-minor can revoke. Delegate excluded per Decision 7.
--           WITH CHECK still enforces revoked_at IS NOT NULL (this is a
--           revoke-only policy; no other UPDATE shapes pass).
--
--   §116.3  ALTER POLICY audit_events_patient_self_select_v2 — extend USING
--           with OR public.is_authorized_actor_on(resolved_global_patient_id,
--           auth.uid()). Guardian / delegate can SELECT audit rows for the
--           gp they have authority over.
--
--   §116.4  Smoke probe (DO block) — verify shares + audit SELECT extensions.
--
-- What this migration does NOT do
-- -------------------------------
--   * NOT extend patient_data_shares INSERT — see Decision 8. Existing
--     `WITH CHECK false` enforces RPC-only creation through mig 091
--     create_shares_for_grantors. Capability gating (including
--     consent_to_share post-MVP) belongs in the handler that calls the RPC.
--   * NOT touch DELETE on shares (false-restricted; revoke is via UPDATE).
--   * NOT touch audit_events_clinic_member_select_v2 (clinic-side, no
--     patient-side leg to extend).
--   * NOT touch owners_view_audit_events (owner-side, no patient-side leg).
--
-- Depends on
-- ----------
--   * mig 113 (public.is_authorized_actor_on)
--   * mig 092 (public.is_clinic_member, public.can_patient_access_global_patient)
--   * mig 109 (global_patients.is_minor + guardian_global_patient_id for inline EXISTS)
--
-- Rollback
-- --------
-- REVERSIBLE. Companion: 116_shares_audit_authority_rls.rollback.sql.
-- ============================================================================

-- §116.1 — patient_data_shares SELECT extension
ALTER POLICY patient_data_shares_select_v2 ON public.patient_data_shares
  USING (
    public.is_clinic_member(grantor_clinic_id, auth.uid())
    OR public.is_clinic_member(grantee_clinic_id, auth.uid())
    OR public.can_patient_access_global_patient(global_patient_id, auth.uid())
    OR public.is_authorized_actor_on(global_patient_id, auth.uid())
  );

-- §116.2 — patient_data_shares UPDATE extension (guardian-link only — Decision 7)
ALTER POLICY patient_data_shares_revoke_update_v2 ON public.patient_data_shares
  USING (
    public.is_clinic_member(grantor_clinic_id, auth.uid())
    OR public.can_patient_access_global_patient(global_patient_id, auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.global_patients child
        JOIN public.global_patients guardian
          ON guardian.id = child.guardian_global_patient_id
       WHERE child.id = patient_data_shares.global_patient_id
         AND child.is_minor = TRUE
         AND guardian.claimed_user_id = auth.uid()
    )
  )
  WITH CHECK (revoked_at IS NOT NULL);

-- §116.3 — audit_events patient-self SELECT extension
ALTER POLICY audit_events_patient_self_select_v2 ON public.audit_events
  USING (
    (resolved_global_patient_id IS NOT NULL)
    AND (
      public.can_patient_access_global_patient(resolved_global_patient_id, auth.uid())
      OR public.is_authorized_actor_on(resolved_global_patient_id, auth.uid())
    )
  );

-- §116.4 — Smoke probe
DO $body$
DECLARE
  v_users UUID[];
  v_user_self UUID;
  v_user_guardian UUID;
  v_user_delegate UUID;
  v_gp_self UUID := '00000116-0000-0000-0000-000000000001'::uuid;
  v_gp_guardian UUID := '00000116-0000-0000-0000-000000000002'::uuid;
  v_gp_minor UUID := '00000116-0000-0000-0000-000000000003'::uuid;
  v_clinic_a UUID;
  v_clinic_b UUID;
  v_share_self UUID := '00000116-0000-0000-0000-000000000010'::uuid;
  v_share_minor UUID := '00000116-0000-0000-0000-000000000011'::uuid;
  v_audit_self UUID := '00000116-0000-0000-0000-000000000020'::uuid;
  v_audit_minor UUID := '00000116-0000-0000-0000-000000000021'::uuid;
  v_guardian_can_see_minor_share BOOLEAN;
  v_delegate_can_see_principal_share BOOLEAN;
  v_guardian_can_see_minor_audit BOOLEAN;
  v_delegate_can_see_principal_audit BOOLEAN;
BEGIN
  SELECT array_agg(id) INTO v_users FROM (
    SELECT id FROM auth.users
     WHERE id NOT IN (SELECT claimed_user_id FROM public.global_patients
                       WHERE claimed_user_id IS NOT NULL)
     ORDER BY created_at LIMIT 3
  ) sub;
  IF v_users IS NULL OR array_length(v_users, 1) < 3 THEN
    RAISE NOTICE 'mig 116 smoke probe: fewer than 3 unclaimed auth.users; skipping.';
    RETURN;
  END IF;
  v_user_self := v_users[1]; v_user_guardian := v_users[2]; v_user_delegate := v_users[3];

  -- Pick 2 clinics for grantor/grantee (need distinct ids)
  SELECT id INTO v_clinic_a FROM public.clinics ORDER BY id LIMIT 1;
  SELECT id INTO v_clinic_b FROM public.clinics WHERE id <> v_clinic_a ORDER BY id LIMIT 1;
  IF v_clinic_a IS NULL OR v_clinic_b IS NULL THEN
    RAISE NOTICE 'mig 116 smoke probe: fewer than 2 clinics; skipping.';
    RETURN;
  END IF;

  INSERT INTO public.global_patients (id, normalized_phone, display_name, claimed, claimed_user_id, claimed_at, is_minor, account_status)
    VALUES (v_gp_self, NULL, 'Mig 116 self fixture', TRUE, v_user_self, NOW(), FALSE, 'active');
  INSERT INTO public.global_patients (id, normalized_phone, display_name, claimed, claimed_user_id, claimed_at, is_minor, account_status)
    VALUES (v_gp_guardian, NULL, 'Mig 116 guardian fixture', TRUE, v_user_guardian, NOW(), FALSE, 'active');
  INSERT INTO public.global_patients (id, normalized_phone, display_name, claimed, claimed_user_id, claimed_at, is_minor, guardian_global_patient_id, account_status)
    VALUES (v_gp_minor, NULL, 'Mig 116 minor fixture', FALSE, NULL, NULL, TRUE, v_gp_guardian, 'active');

  -- Active delegation: v_gp_self → v_user_delegate
  INSERT INTO public.patient_delegations (principal_global_patient_id, delegate_user_id, capabilities, granted_by_user_id, accepted_at, expires_at)
    VALUES (v_gp_self, v_user_delegate, '["view_records"]'::jsonb, v_user_self, NOW(), NOW() + INTERVAL '1 day');

  -- Shares (must INSERT directly via service-role bypass; the policy WITH CHECK false
  -- only applies to authenticated. As migration runner we have BYPASSRLS.)
  INSERT INTO public.patient_data_shares (id, global_patient_id, grantor_clinic_id, grantee_clinic_id, granted_via, grant_reason)
    VALUES (v_share_self, v_gp_self, v_clinic_a, v_clinic_b, 'PATIENT_APP', 'mig 116 smoke probe');
  INSERT INTO public.patient_data_shares (id, global_patient_id, grantor_clinic_id, grantee_clinic_id, granted_via, grant_reason)
    VALUES (v_share_minor, v_gp_minor, v_clinic_a, v_clinic_b, 'PATIENT_APP', 'mig 116 smoke probe');

  -- Audit events for the gps (use actor_kind=migration since no acting user)
  INSERT INTO public.audit_events (id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata)
    VALUES (v_audit_self, NULL, 'migration', 'BACKFILL_DEPENDENT_GUARDIAN_RECONSTRUCTION', 'global_patients', v_gp_self,
            jsonb_build_object('global_patient_id', v_gp_self, 'note', 'mig 116 smoke probe'));
  INSERT INTO public.audit_events (id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata)
    VALUES (v_audit_minor, NULL, 'migration', 'BACKFILL_DEPENDENT_GUARDIAN_RECONSTRUCTION', 'global_patients', v_gp_minor,
            jsonb_build_object('global_patient_id', v_gp_minor, 'note', 'mig 116 smoke probe'));

  -- Probe as guardian: should see minor's share + audit
  PERFORM set_config('role', 'authenticated', TRUE);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_guardian::text, 'role', 'authenticated')::text, TRUE);

  SELECT EXISTS (SELECT 1 FROM public.patient_data_shares WHERE id = v_share_minor) INTO v_guardian_can_see_minor_share;
  IF NOT v_guardian_can_see_minor_share THEN
    PERFORM set_config('role', 'postgres', TRUE);
    RAISE EXCEPTION 'mig 116 smoke probe POS-guardian-share: guardian cannot SELECT minor share';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.audit_events WHERE id = v_audit_minor) INTO v_guardian_can_see_minor_audit;
  IF NOT v_guardian_can_see_minor_audit THEN
    PERFORM set_config('role', 'postgres', TRUE);
    RAISE EXCEPTION 'mig 116 smoke probe POS-guardian-audit: guardian cannot SELECT minor audit row';
  END IF;

  -- Probe as delegate: should see principal's share + audit
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_delegate::text, 'role', 'authenticated')::text, TRUE);

  SELECT EXISTS (SELECT 1 FROM public.patient_data_shares WHERE id = v_share_self) INTO v_delegate_can_see_principal_share;
  IF NOT v_delegate_can_see_principal_share THEN
    PERFORM set_config('role', 'postgres', TRUE);
    RAISE EXCEPTION 'mig 116 smoke probe POS-delegate-share: delegate cannot SELECT principal share';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.audit_events WHERE id = v_audit_self) INTO v_delegate_can_see_principal_audit;
  IF NOT v_delegate_can_see_principal_audit THEN
    PERFORM set_config('role', 'postgres', TRUE);
    RAISE EXCEPTION 'mig 116 smoke probe POS-delegate-audit: delegate cannot SELECT principal audit row';
  END IF;

  PERFORM set_config('role', 'postgres', TRUE);
  PERFORM set_config('request.jwt.claims', '', TRUE);

  -- Cleanup
  DELETE FROM public.audit_events WHERE id IN (v_audit_self, v_audit_minor);
  DELETE FROM public.patient_data_shares WHERE id IN (v_share_self, v_share_minor);
  DELETE FROM public.patient_delegations WHERE principal_global_patient_id IN (v_gp_self, v_gp_guardian);
  DELETE FROM public.global_patients WHERE id = v_gp_minor;
  DELETE FROM public.global_patients WHERE id = v_gp_guardian;
  DELETE FROM public.global_patients WHERE id = v_gp_self;

  RAISE NOTICE 'mig 116 smoke probe: 4 SELECT-policy assertions PASS (2 share + 2 audit)';
END;
$body$ LANGUAGE plpgsql;

DO $body$
DECLARE v_qual TEXT;
BEGIN
  SELECT qual::text INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'patient_data_shares' AND policyname = 'patient_data_shares_select_v2';
  IF v_qual NOT LIKE '%is_authorized_actor_on%' THEN
    RAISE EXCEPTION 'mig 116 post-condition: shares SELECT missing is_authorized_actor_on; got: %', v_qual;
  END IF;

  SELECT qual::text INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'patient_data_shares' AND policyname = 'patient_data_shares_revoke_update_v2';
  IF v_qual NOT LIKE '%is_minor%' THEN
    RAISE EXCEPTION 'mig 116 post-condition: shares UPDATE missing guardian-link inline EXISTS; got: %', v_qual;
  END IF;

  SELECT qual::text INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'audit_events' AND policyname = 'audit_events_patient_self_select_v2';
  IF v_qual NOT LIKE '%is_authorized_actor_on%' THEN
    RAISE EXCEPTION 'mig 116 post-condition: audit_events patient-self SELECT missing is_authorized_actor_on; got: %', v_qual;
  END IF;

  RAISE NOTICE 'mig 116 post-condition: shares SELECT + UPDATE + audit_events SELECT extended as expected';
END $body$;
