-- ============================================================================
-- Migration 058: Add clinic-scoped SELECT policy on imaging_orders
-- ============================================================================
-- Second per-table policy migration. Same additive template as mig 055
-- (vital_signs): ADD a new clinic-scoped SELECT policy alongside the
-- existing legacy policies; do NOT drop anything. Cleanup is mig 068.
--
-- Live policy state on imaging_orders as of 2026-04-25 audit:
--   ALL    "Doctors manage their imaging orders"
--          USING / WITH CHECK (doctor_id = auth.uid())
--   SELECT "Patients view own imaging orders"
--          USING (patient_id = auth.uid())
--
-- After this migration, an additional SELECT policy named
-- "Clinic-scoped imaging order access" is added with the
-- can_access_patient predicate. The two legacy policies are untouched.
--
-- UI sanity check (per the per-table inventory in the plan doc):
--   - 1 read call site: handlers/doctor/imaging-orders, uses
--     createAdminClient() -> service-role bypass. The new policy does
--     not change behavior for that call site.
--   - No patient-app reads of imaging_orders today (confirmed via grep).
--   - The new policy is future-proofing: it gives clinic OWNERs and
--     scoped ASSISTANTs RLS-level read access for a future doctor-app
--     surface that might transition off the admin client.
--
-- Pre-flight (audited 2026-04-25):
--   - imaging_orders has 1 row in live data (won't disturb).
--   - relrowsecurity = true (already enforced; not in mig 057's list).
--   - can_access_patient function present and tested in mig 054.
--   - clinic_id is NOT NULL on every row.
-- ============================================================================

DROP POLICY IF EXISTS "Clinic-scoped imaging order access" ON public.imaging_orders;

CREATE POLICY "Clinic-scoped imaging order access"
ON public.imaging_orders FOR SELECT
USING (
  doctor_id = auth.uid()
  OR patient_id = auth.uid()
  OR (
    clinic_id IS NOT NULL
    AND public.can_access_patient(clinic_id, patient_id, auth.uid(), 'READ')
  )
);

COMMENT ON POLICY "Clinic-scoped imaging order access" ON public.imaging_orders IS
  'Routes through can_access_patient() so clinic OWNERs and assigned ASSISTANT/FRONT_DESK staff can read imaging orders. Coexists with legacy doctor- and patient-scoped policies until mig 068 cleanup.';

-- ============================================================================
-- Post-migration verification (run via execute_sql after apply):
--
-- 1. Policy presence:
--      SELECT policyname FROM pg_policies
--      WHERE tablename='imaging_orders' AND cmd='SELECT'
--      ORDER BY policyname;
--      -- expect 2 SELECT policies (legacy + new) + 1 ALL (legacy)
--
-- 2. USING expression matches:
--      SELECT pg_get_expr(polqual, polrelid)
--      FROM pg_policy pol
--      JOIN pg_class c ON c.oid=pol.polrelid
--      WHERE c.relname='imaging_orders'
--        AND pol.polname='Clinic-scoped imaging order access';
--
-- 3. End-to-end visibility test under transaction (rolled back):
--    Required NOT NULL columns: doctor_id, patient_id, clinic_id,
--    modality, study_name. Insert a test order in Naser's clinic with
--    Naser as the doctor.
--
--    -- Stranger doctor: expect 0
--    BEGIN;
--    INSERT INTO public.imaging_orders (
--      patient_id, doctor_id, clinic_id, modality, study_name
--    ) VALUES (
--      (SELECT id FROM public.patients
--         WHERE clinic_id='298866c7-87b7-4405-9487-c7174bafaf99' LIMIT 1),
--      '619a7fdd-45a1-49b5-aed2-fbada918b232'::uuid,
--      '298866c7-87b7-4405-9487-c7174bafaf99'::uuid,
--      'XR', 'Chest XR'
--    );
--    SET LOCAL ROLE authenticated;
--    SET LOCAL "request.jwt.claims" TO '{"sub":"c982eabc-ed1d-409f-90e4-b135fcf945e6"}';
--    SELECT count(*) FROM public.imaging_orders WHERE clinic_id='298866c7-...';
--    -- expect 0 (stranger sees nothing in Naser's clinic)
--    ROLLBACK;
--
--    -- Naser-as-OWNER: expect 1 + baseline rows in his clinic
--    BEGIN;
--    INSERT INTO public.imaging_orders (
--      patient_id, doctor_id, clinic_id, modality, study_name
--    ) VALUES (
--      (SELECT id FROM public.patients
--         WHERE clinic_id='298866c7-87b7-4405-9487-c7174bafaf99' LIMIT 1),
--      '619a7fdd-45a1-49b5-aed2-fbada918b232'::uuid,
--      '298866c7-87b7-4405-9487-c7174bafaf99'::uuid,
--      'XR', 'Chest XR'
--    );
--    SET LOCAL ROLE authenticated;
--    SET LOCAL "request.jwt.claims" TO '{"sub":"619a7fdd-45a1-49b5-aed2-fbada918b232"}';
--    SELECT count(*) FROM public.imaging_orders WHERE clinic_id='298866c7-...';
--    -- expect: 1 + however many existing rows are in Naser's clinic
--    ROLLBACK;
-- ============================================================================
