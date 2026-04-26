-- ============================================================================
-- Migration 060: Add clinic-scoped SELECT policy on lab_results
-- ============================================================================
-- Fourth per-table policy migration. Same additive template as 055/058/059
-- but the policy body differs: lab_results gates access via an EXISTS
-- subquery on the parent lab_orders, not via columns on lab_results
-- itself. This mirrors mig 021 lines 230-246 verbatim.
--
-- ORDER NOTE
-- ----------
-- Mig 059 (lab_orders) was promoted ahead of this one so the EXISTS
-- subquery's clinic-scoped branch is reachable on day 1, not dormant
-- until 060+1.
--
-- POLICY DESIGN NOTE
-- ------------------
-- The inner subquery duplicates predicates that lab_orders' own RLS
-- already enforces (doctor_id = auth.uid(), patient_id = auth.uid(),
-- can_access_patient). Why not just `EXISTS (SELECT 1 FROM lab_orders
-- WHERE id = lab_results.lab_order_id)` and let RLS gate it?
--
--   The verbose form is strictly stricter than the simple one. If a
--   future lab_orders policy ever grants access via a path not covered
--   by the three OR branches (e.g. a hypothetical auditor role), the
--   simple form would let lab_results through but the verbose form
--   would not. Mig 021 chose the verbose form deliberately as a belt-
--   and-suspenders measure. Per architecture rule "never silently
--   deviate", we ship mig 021's wording.
--
-- Live policy state on lab_results as of 2026-04-25 (post-mig-057):
--   SELECT "View lab results"
--          USING (lab_order_id IN (SELECT lab_orders.id FROM lab_orders
--                                  WHERE doctor_id=auth.uid() OR patient_id=auth.uid()))
--   relrowsecurity = true (enabled by mig 057)
--
-- After this migration, an additional SELECT policy named
-- "Clinic-scoped lab results access" is added. Legacy policy untouched.
--
-- UI sanity check (per the per-table inventory):
--   - 1 read site: data/clinical.ts getLabOrderResults — RLS-respecting
--     client, joins via lab_order_id. Coverage preserved by both policies.
--   - Patient health-summary handler joins lab_results via lab_orders
--     subquery, also RLS-respecting.
--   - The new policy adds clinic-OWNER and assigned-staff RLS access
--     transitively through the parent lab_orders.
--
-- Pre-flight (audited 2026-04-25):
--   - lab_results has 0 rows in live data.
--   - Required NOT NULL no-default columns: lab_order_id, lab_test_id,
--     clinic_id.
--   - lab_test_id has FK to lab_tests (22-row catalog from mig 057).
--   - relrowsecurity = true.
-- ============================================================================

DROP POLICY IF EXISTS "Clinic-scoped lab results access" ON public.lab_results;

CREATE POLICY "Clinic-scoped lab results access"
ON public.lab_results FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.lab_orders lo
    WHERE lo.id = lab_results.lab_order_id
      AND (
        lo.doctor_id = auth.uid()
        OR lo.patient_id = auth.uid()
        OR (
          lo.clinic_id IS NOT NULL
          AND public.can_access_patient(lo.clinic_id, lo.patient_id, auth.uid(), 'READ')
        )
      )
  )
);

COMMENT ON POLICY "Clinic-scoped lab results access" ON public.lab_results IS
  'Routes through can_access_patient() on the parent lab_orders so clinic OWNERs and assigned ASSISTANT/FRONT_DESK staff can read lab results. Coexists with the legacy "View lab results" policy until mig 068 cleanup.';

-- ============================================================================
-- Post-migration verification (run via execute_sql after apply):
--
-- 1. Policy presence (expect 2 SELECTs: legacy + new):
--      SELECT polname FROM pg_policy
--      WHERE polrelid='public.lab_results'::regclass
--      ORDER BY polname;
--
-- 2. e2e visibility tests. Need to insert both a lab_orders parent and a
--    lab_results child in one transaction.
--
--    -- Stranger doctor: expect 0
--    BEGIN;
--    WITH new_order AS (
--      INSERT INTO public.lab_orders (patient_id, doctor_id, clinic_id)
--      VALUES (
--        (SELECT id FROM public.patients
--           WHERE clinic_id='298866c7-87b7-4405-9487-c7174bafaf99' LIMIT 1),
--        '619a7fdd-45a1-49b5-aed2-fbada918b232'::uuid,
--        '298866c7-87b7-4405-9487-c7174bafaf99'::uuid
--      ) RETURNING id
--    )
--    INSERT INTO public.lab_results (lab_order_id, lab_test_id, clinic_id)
--    SELECT no.id, (SELECT id FROM public.lab_tests LIMIT 1),
--      '298866c7-87b7-4405-9487-c7174bafaf99'::uuid
--    FROM new_order no;
--    SET LOCAL ROLE authenticated;
--    SET LOCAL "request.jwt.claims" TO '{"sub":"c982eabc-ed1d-409f-90e4-b135fcf945e6"}';
--    SELECT count(*) FROM public.lab_results
--    WHERE clinic_id='298866c7-87b7-4405-9487-c7174bafaf99';  -- expect 0
--    ROLLBACK;
--
--    -- Naser-as-OWNER: expect 1
--    -- (same INSERT pattern, then auth as Naser, expect count=1)
-- ============================================================================
