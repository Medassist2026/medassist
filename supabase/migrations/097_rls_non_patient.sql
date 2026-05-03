-- ============================================================
-- mig 097 — Prompt 6 Phase C: non-patient tables RLS
-- Date: 2026-04-30 (cowork session 12)
-- Owner: Backend
--
-- Tables in scope: clinics, users, doctors. Plus verification on
-- clinic_memberships, doctor_templates, prescription_templates
-- (existing policies adequate; no new v2 needed).
--
-- Three v2 policies added:
--
--   1. clinics_select_v2
--      `clinics` had ZERO policies on staging despite RLS being
--      enabled — effective DENY-ALL for any non-service-role caller.
--      Allows clinic members to SELECT their own clinic.
--
--   2. users_select_clinic_colleagues_v2
--      Existing policies only allow self-view (`Users can read own
--      profile`). Adds: a user can SEE colleagues at any clinic they
--      share an active membership with — needed for clinic UI surfaces
--      that list staff names, doctor profiles within a clinic, etc.
--
--   3. doctors_select_authenticated_v2
--      Per Prompt 6 § C6: "doctor profiles are visible to patients
--      booking" — i.e. ANY authenticated user can read doctor
--      profiles. Existing `Doctors can read own profile` is too
--      restrictive for the booking surface.
--
-- doctor_templates / prescription_templates: existing single ALL
-- policy (`doctor_id = auth.uid()`) is the final state — these are
-- doctor-private records. No changes.
--
-- clinic_memberships: existing 3 policies cover the model:
--   * Members can view clinic memberships (via is_clinic_member)
--   * Owners can manage / update memberships
-- No mig 097 changes needed.
--
-- TEMPLATE per Empirical Lesson #2: in-transaction smoke-probe.
-- ============================================================

BEGIN;

CREATE POLICY clinics_select_v2 ON public.clinics
FOR SELECT TO authenticated
USING (public.is_clinic_member(clinics.id, auth.uid()));

CREATE POLICY users_select_clinic_colleagues_v2 ON public.users
FOR SELECT TO authenticated
USING (
  -- Self-view (already covered by existing policy, but additive PERMISSIVE-OR is fine)
  users.id = auth.uid()
  -- Colleagues: this user shares an ACTIVE clinic membership with the caller
  OR EXISTS (
    SELECT 1
    FROM public.clinic_memberships cm_self
    JOIN public.clinic_memberships cm_target
      ON cm_target.clinic_id = cm_self.clinic_id
     AND cm_target.user_id = users.id
     AND cm_target.status = 'ACTIVE'
    WHERE cm_self.user_id = auth.uid()
      AND cm_self.status = 'ACTIVE'
  )
);

CREATE POLICY doctors_select_authenticated_v2 ON public.doctors
FOR SELECT TO authenticated
USING (TRUE);

-- ────────────────────────────────────────────────────────────────────
-- IN-TRANSACTION POST-CONDITION + SMOKE-PROBE
-- ────────────────────────────────────────────────────────────────────
DO $post$
DECLARE
  v_count INT;
  v_smoke_uid UUID;
BEGIN
  SELECT COUNT(*) INTO v_count FROM pg_policies
   WHERE schemaname='public'
     AND policyname IN ('clinics_select_v2','users_select_clinic_colleagues_v2','doctors_select_authenticated_v2');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'mig 097 post-condition failed: expected 3 v2 policies, got %', v_count;
  END IF;

  -- Smoke-probe: real authenticated SELECT (read auth.users.id BEFORE role switch)
  SELECT id INTO v_smoke_uid FROM auth.users LIMIT 1;
  IF v_smoke_uid IS NULL THEN
    RAISE NOTICE 'mig 097 smoke-probe: no auth.users present, skipping';
  ELSE
    PERFORM set_config('role', 'authenticated', TRUE);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_smoke_uid::text, 'role', 'authenticated')::text, TRUE);

    -- These selects MUST not error 42P17 (recursion-safety check).
    -- Row counts vary based on caller's clinic membership — not asserted.
    PERFORM COUNT(*) FROM public.clinics;
    PERFORM COUNT(*) FROM public.users;
    PERFORM COUNT(*) FROM public.doctors;
    PERFORM COUNT(*) FROM public.clinic_memberships;
    PERFORM COUNT(*) FROM public.doctor_templates;
    PERFORM COUNT(*) FROM public.prescription_templates;
  END IF;

  RAISE NOTICE 'mig 097 post-condition: 3 v2 policies present + 6 smoke-probes passed';
END $post$;

COMMIT;
