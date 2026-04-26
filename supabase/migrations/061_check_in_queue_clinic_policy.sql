-- ============================================================================
-- Migration 061: Add clinic-scoped SELECT policy on check_in_queue
-- ============================================================================
-- Fifth per-table policy migration. Pattern shift: this policy uses
-- public.is_clinic_member() rather than public.can_access_patient().
-- Per mig 021 lines 284-293, the queue is a workflow surface where
-- clinic membership is the right gate (a front-desk staffer needs to
-- see the whole waiting room) — patient-level visibility would be too
-- restrictive here.
--
-- Live policy state on check_in_queue as of 2026-04-25 audit:
--   ALL    "Front desk can manage queue"
--          USING (users.role = 'frontdesk')
--          ^ legacy global cross-clinic leak; to be cleaned up in mig 068
--   ALL    "Frontdesk can manage queue for their clinic"
--          USING (doctor_id IN (... clinic_memberships join ...))
--          WITH CHECK (same)
--   SELECT "Doctors can read their own queue"
--          USING (doctor_id = auth.uid())
--   UPDATE "Doctors can update their own queue"
--          USING / WITH CHECK (doctor_id = auth.uid())
--   relrowsecurity = true (already enforced)
--
-- After this migration, an additional SELECT policy named
-- "Clinic-scoped queue access" is added. The 4 legacy policies are
-- untouched.
--
-- UI sanity check (per the inventory in the plan doc):
--   - 7 read sites total. Most use createAdminClient() (service-role
--     bypass; unaffected by RLS changes). The new policy is mostly
--     defense-in-depth.
--   - Doctor's own-queue reads work via either legacy
--     "Doctors can read their own queue" or the new policy's
--     doctor_id = auth.uid() branch.
--   - Front-desk reads via authenticated session (when not using admin
--     client) work via either the legacy clinic-scoped policy or the
--     new is_clinic_member branch.
--
-- Pre-flight (audited 2026-04-25):
--   - 8 rows in live data total; 7 in Naser's clinic (298866c7), 1
--     elsewhere. Verification can run against real production data
--     instead of INSERT/ROLLBACK.
--   - relrowsecurity = true.
--   - is_clinic_member function present and tested.
-- ============================================================================

DROP POLICY IF EXISTS "Clinic-scoped queue access" ON public.check_in_queue;

CREATE POLICY "Clinic-scoped queue access"
ON public.check_in_queue FOR SELECT
USING (
  doctor_id = auth.uid()
  OR patient_id = auth.uid()
  OR (
    clinic_id IS NOT NULL
    AND public.is_clinic_member(clinic_id, auth.uid())
  )
);

COMMENT ON POLICY "Clinic-scoped queue access" ON public.check_in_queue IS
  'Routes through is_clinic_member() so any active clinic member (OWNER, DOCTOR, ASSISTANT, FRONT_DESK) can read the queue for their clinic. Coexists with legacy doctor- and frontdesk-scoped policies until mig 068 cleanup.';

-- ============================================================================
-- Post-migration verification (run via execute_sql after apply):
--
-- 1. Policy presence (expect 5: 2 ALL + 2 SELECT + 1 UPDATE):
--      SELECT polname, polcmd::text FROM pg_policy
--      WHERE polrelid='public.check_in_queue'::regclass
--      ORDER BY polcmd::text, polname;
--
-- 2. USING expression matches:
--      SELECT pg_get_expr(polqual, polrelid)
--      FROM pg_policy
--      WHERE polrelid='public.check_in_queue'::regclass
--        AND polname='Clinic-scoped queue access';
--
-- 3. Real-data e2e (no INSERT needed — Naser's clinic has 7 rows):
--
--    -- Stranger doctor: expect 0 visible in Naser's clinic
--    BEGIN;
--    SET LOCAL ROLE authenticated;
--    SET LOCAL "request.jwt.claims" TO '{"sub":"c982eabc-ed1d-409f-90e4-b135fcf945e6"}';
--    SELECT count(*) FROM public.check_in_queue
--    WHERE clinic_id='298866c7-87b7-4405-9487-c7174bafaf99';  -- expect 0
--    ROLLBACK;
--
--    -- Naser-as-OWNER: expect 7
--    BEGIN;
--    SET LOCAL ROLE authenticated;
--    SET LOCAL "request.jwt.claims" TO '{"sub":"619a7fdd-45a1-49b5-aed2-fbada918b232"}';
--    SELECT count(*) FROM public.check_in_queue
--    WHERE clinic_id='298866c7-87b7-4405-9487-c7174bafaf99';  -- expect 7
--    ROLLBACK;
-- ============================================================================
