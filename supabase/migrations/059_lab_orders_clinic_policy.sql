-- ============================================================================
-- Migration 059: Add clinic-scoped SELECT policy on lab_orders
-- ============================================================================
-- Third per-table policy migration. Same additive template as mig 055
-- (vital_signs) and mig 058 (imaging_orders): ADD a clinic-scoped SELECT
-- policy alongside legacy ones; do NOT drop anything. Cleanup is mig 068.
--
-- ORDER NOTE
-- ----------
-- This migration was promoted from "059 = lab_results, 060 = lab_orders"
-- (the original plan order) to "059 = lab_orders, 060 = lab_results"
-- because lab_results' new policy does an EXISTS subquery on lab_orders.
-- Putting lab_orders first means lab_results' OWNER branch is reachable
-- the moment its policy ships — no dormant-branch period.
--
-- Live policy state on lab_orders as of 2026-04-25 audit (post-mig-057):
--   INSERT "Doctors can create lab orders"
--          WITH CHECK (doctor_id = auth.uid())
--   SELECT "Doctors can view their lab orders"
--          USING (doctor_id = auth.uid())
--   SELECT "Patients can view own lab orders"
--          USING (patient_id = auth.uid())
--   relrowsecurity = true (enabled by mig 057)
--
-- After this migration, an additional SELECT policy named
-- "Clinic-scoped lab order access" is added with the can_access_patient
-- predicate. The 3 legacy policies are untouched.
--
-- UI sanity check (per the per-table inventory):
--   - 4 read call sites total. Patient app reads filter by
--     patient_id = user.id (covered by legacy "Patients can view own
--     lab orders"). Doctor reads use createAdminClient() (service-role
--     bypass; unaffected by RLS changes).
--   - The new policy is future-proofing: clinic OWNERs and assigned
--     ASSISTANT/FRONT_DESK gain RLS-level read access for surfaces that
--     might transition off the admin client.
--
-- Pre-flight (audited 2026-04-25):
--   - lab_orders has 0 rows in live data (cleanest possible test bed).
--   - Required NOT NULL no-default columns: patient_id, doctor_id, clinic_id.
--   - status / priority / ordered_at / created_at all default cleanly.
--   - relrowsecurity = true.
-- ============================================================================

DROP POLICY IF EXISTS "Clinic-scoped lab order access" ON public.lab_orders;

CREATE POLICY "Clinic-scoped lab order access"
ON public.lab_orders FOR SELECT
USING (
  doctor_id = auth.uid()
  OR patient_id = auth.uid()
  OR (
    clinic_id IS NOT NULL
    AND public.can_access_patient(clinic_id, patient_id, auth.uid(), 'READ')
  )
);

COMMENT ON POLICY "Clinic-scoped lab order access" ON public.lab_orders IS
  'Routes through can_access_patient() so clinic OWNERs and assigned ASSISTANT/FRONT_DESK staff can read lab orders. Coexists with legacy doctor- and patient-scoped policies until mig 068 cleanup.';

-- ============================================================================
-- Post-migration verification (run via execute_sql after apply):
--
-- 1. Policy presence (expect 4 total: 1 INSERT + 3 SELECT):
--      SELECT polname, polcmd::text FROM pg_policy
--      WHERE polrelid='public.lab_orders'::regclass
--      ORDER BY polcmd::text, polname;
--
-- 2. USING expression matches:
--      SELECT pg_get_expr(polqual, polrelid)
--      FROM pg_policy
--      WHERE polrelid='public.lab_orders'::regclass
--        AND polname='Clinic-scoped lab order access';
--
-- 3. e2e visibility tests (table is empty; INSERT/ROLLBACK gives clean
--    deterministic counts):
--
--    -- Stranger doctor: expect 0
--    BEGIN;
--    INSERT INTO public.lab_orders (patient_id, doctor_id, clinic_id)
--    VALUES (
--      (SELECT id FROM public.patients
--         WHERE clinic_id='298866c7-87b7-4405-9487-c7174bafaf99' LIMIT 1),
--      '619a7fdd-45a1-49b5-aed2-fbada918b232'::uuid,
--      '298866c7-87b7-4405-9487-c7174bafaf99'::uuid
--    );
--    SET LOCAL ROLE authenticated;
--    SET LOCAL "request.jwt.claims" TO '{"sub":"c982eabc-ed1d-409f-90e4-b135fcf945e6"}';
--    SELECT count(*) FROM public.lab_orders
--    WHERE clinic_id='298866c7-87b7-4405-9487-c7174bafaf99';  -- expect 0
--    ROLLBACK;
--
--    -- Naser-as-OWNER: expect 1 (clinic-scoped policy lets him in)
--    BEGIN;
--    INSERT INTO public.lab_orders (patient_id, doctor_id, clinic_id)
--    VALUES (
--      (SELECT id FROM public.patients
--         WHERE clinic_id='298866c7-87b7-4405-9487-c7174bafaf99' LIMIT 1),
--      '619a7fdd-45a1-49b5-aed2-fbada918b232'::uuid,
--      '298866c7-87b7-4405-9487-c7174bafaf99'::uuid
--    );
--    SET LOCAL ROLE authenticated;
--    SET LOCAL "request.jwt.claims" TO '{"sub":"619a7fdd-45a1-49b5-aed2-fbada918b232"}';
--    SELECT count(*) FROM public.lab_orders
--    WHERE clinic_id='298866c7-87b7-4405-9487-c7174bafaf99';  -- expect 1
--    ROLLBACK;
-- ============================================================================
