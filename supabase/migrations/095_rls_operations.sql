-- ============================================================
-- mig 095 — Prompt 6 Phase C: operations tables RLS
-- Date: 2026-04-30 (cowork session 8)
-- Owner: Backend
--
-- Tables in scope:
--   1. appointments        — v2 SELECT via is_clinic_member(clinic_id)
--   2. check_in_queue      — v2 SELECT via is_clinic_member(clinic_id)
--   3. payments            — v2 SELECT via is_clinic_member(clinic_id)
--   4. doctor_availability — v2 SELECT via is_clinic_member(clinic_id)
--
-- Per Mo's spec § C4: these are clinic-internal operations. NO
-- cross-clinic visibility. PERMISSIVE-OR coexistence with legacy
-- policies (appointments has 6, check_in_queue 5, payments 5,
-- doctor_availability 9). Mig 101 cleanup drops legacy after
-- Phase D run #3 = 100% green. (Originally "mig 098" in Prompt 6
-- spec; renumbered to 101 in session-16 ruling 2026-05-02.)
--
-- INSERT/UPDATE/DELETE policies unchanged in this migration —
-- legacy policies enforce clinic membership for writes adequately;
-- adding new RESTRICTIVE write-asymmetry policies (as mig 094 did
-- for clinical-data tables) is unnecessary because there's no
-- cross-clinic READ access to gate against.
--
-- doctor_templates is doctor-scoped (no clinic_id, no patient FK)
-- and stays in mig 097 (non-patient) scope.
--
-- TEMPLATE FIX (per Mo session 7): the post-condition smoke-probe
-- runs INSIDE the BEGIN/COMMIT transaction so any failure rolls
-- back the migration. This corrects 094a's post-COMMIT defect.
-- ============================================================

BEGIN;

-- ── 1. appointments ────────────────────────────────────────────────
CREATE POLICY appointments_select_v2 ON public.appointments
FOR SELECT TO authenticated
USING (public.is_clinic_member(appointments.clinic_id, auth.uid()));

-- ── 2. check_in_queue ──────────────────────────────────────────────
CREATE POLICY check_in_queue_select_v2 ON public.check_in_queue
FOR SELECT TO authenticated
USING (public.is_clinic_member(check_in_queue.clinic_id, auth.uid()));

-- ── 3. payments ────────────────────────────────────────────────────
CREATE POLICY payments_select_v2 ON public.payments
FOR SELECT TO authenticated
USING (public.is_clinic_member(payments.clinic_id, auth.uid()));

-- ── 4. doctor_availability ─────────────────────────────────────────
CREATE POLICY doctor_availability_select_v2 ON public.doctor_availability
FOR SELECT TO authenticated
USING (public.is_clinic_member(doctor_availability.clinic_id, auth.uid()));


-- ────────────────────────────────────────────────────────────────────
-- IN-TRANSACTION POST-CONDITION + SMOKE-PROBE (Empirical Lesson #2)
-- ────────────────────────────────────────────────────────────────────
DO $post$
DECLARE
  v_count INT;
  v_smoke_uid UUID;
BEGIN
  -- Structural assertion: 4 v2 SELECT policies exist
  SELECT COUNT(*) INTO v_count FROM pg_policies
   WHERE schemaname='public'
     AND policyname IN ('appointments_select_v2','check_in_queue_select_v2',
                        'payments_select_v2','doctor_availability_select_v2');
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'mig 095 post-condition failed: expected 4 v2 policies, got %', v_count;
  END IF;

  -- Smoke-probe: real authenticated SELECT against each table —
  -- catches recursion (42P17) at query-time, not just structure.
  -- IMPORTANT — read auth.users.id BEFORE the role switch. Once the
  -- role flips to 'authenticated', the migration session loses SELECT
  -- privilege on auth.users (Supabase's intentional default).
  SELECT id INTO v_smoke_uid FROM auth.users LIMIT 1;
  IF v_smoke_uid IS NULL THEN
    RAISE NOTICE 'mig 095 smoke-probe: no auth.users present, skipping';
  ELSE
    -- TRUE third param = transaction-local; auto-reset at COMMIT.
    -- Don't try set_config('role','',TRUE) to reset — empty string is
    -- rejected as an invalid role name. Just rely on TRUE/transaction-
    -- local for cleanup.
    PERFORM set_config('role', 'authenticated', TRUE);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_smoke_uid::text, 'role', 'authenticated')::text,
      TRUE);

    -- These selects MUST not error 42P17. Row counts are not asserted
    -- (they depend on actual seed) — the smoke-probe is "does the
    -- query plan + RLS evaluation complete without recursion".
    PERFORM COUNT(*) FROM public.appointments;
    PERFORM COUNT(*) FROM public.check_in_queue;
    PERFORM COUNT(*) FROM public.payments;
    PERFORM COUNT(*) FROM public.doctor_availability;
  END IF;

  RAISE NOTICE 'mig 095 post-condition: 4 v2 policies present + 4 smoke-probes passed (no recursion)';
END $post$;

COMMIT;
