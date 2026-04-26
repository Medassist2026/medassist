-- ============================================================================
-- Migration 055: Add clinic-scoped SELECT policy on vital_signs
-- ============================================================================
-- First per-table policy migration in the mig 020/021 RLS rewrite.
-- Lowest blast radius: vital_signs has 0 rows on the live DB today, and
-- the only read paths are patient-persona handlers filtering by
-- `patient_id = auth.uid()` (covered by an existing legacy policy).
--
-- This migration is ADDITIVE per Mo's approval of the additive-then-
-- cleanup approach in docs/investigations/RLS_REWRITE_PLAN.md section 5.
-- The legacy SELECT policies stay in place; the new one is added
-- alongside. RLS uses OR for SELECT, so the union is the new effective
-- predicate. Cleanup of the legacy policies is deferred to mig 066
-- (after 055-065 are stable in production).
--
-- Live policy state on vital_signs as of 2026-04-25 audit:
--   SELECT  "Doctors can view their patients vitals"
--           USING (doctor_id = auth.uid()
--                  OR patient_id IN (SELECT a.patient_id FROM appointments a
--                                    WHERE a.doctor_id = auth.uid()))
--   SELECT  "Patients can view own vitals"
--           USING (patient_id = auth.uid())
--   INSERT  "Doctors can create vitals"
--           WITH CHECK (doctor_id = auth.uid())
--
-- After this migration, an additional SELECT policy named
-- "Clinic-scoped vital signs access" is added with the can_access_patient
-- predicate. The two legacy SELECT policies and the INSERT policy are
-- untouched.
--
-- UI sanity check (2026-04-25):
--   - 4 read call sites, all patient-persona, all filter by patient_id =
--     auth.uid(). Hit by the existing "Patients can view own vitals"
--     policy. Adding the new policy does not change their behavior.
--   - No doctor-app or front-desk-app code reads vital_signs.
--   - No UI logic depends on "OWNER cannot see vitals via RLS" (an
--     assumption the new policy would invalidate). Safe to ship.
-- ============================================================================

-- DROP POLICY IF EXISTS by the NEW name only — keeps this migration
-- idempotent. The legacy policies "Doctors can view their patients vitals"
-- and "Patients can view own vitals" are intentionally NOT dropped here.
DROP POLICY IF EXISTS "Clinic-scoped vital signs access" ON public.vital_signs;

CREATE POLICY "Clinic-scoped vital signs access"
ON public.vital_signs FOR SELECT
USING (
  -- Doctor who recorded the vital reading
  doctor_id = auth.uid()
  -- Patient viewing their own vitals
  OR patient_id = auth.uid()
  -- Clinic member with patient access (OWNER short-circuit, DOCTOR via
  -- patient_visibility grant, ASSISTANT/FRONT_DESK via assignment scope)
  OR (
    clinic_id IS NOT NULL
    AND public.can_access_patient(clinic_id, patient_id, auth.uid(), 'READ')
  )
);

COMMENT ON POLICY "Clinic-scoped vital signs access" ON public.vital_signs IS
  'Routes through can_access_patient() so clinic OWNERs and assigned ASSISTANT/FRONT_DESK staff can read vitals. Coexists with legacy doctor- and patient-scoped policies until mig 066 cleanup.';

-- ============================================================================
-- Post-migration verification (run via execute_sql after apply):
--
-- 1. Confirm the new policy is present alongside the legacy ones:
--      SELECT policyname FROM pg_policies
--      WHERE tablename='vital_signs' AND cmd='SELECT'
--      ORDER BY policyname;
--      -- expect 3 rows: the two legacy + "Clinic-scoped vital signs access"
--
-- 2. Confirm the policy USING expression matches what we authored:
--      SELECT pg_get_expr(polqual, polrelid)
--      FROM pg_policy pol
--      JOIN pg_class c ON c.oid = pol.polrelid
--      WHERE c.relname='vital_signs' AND pol.polname='Clinic-scoped vital signs access';
--
-- 3. Simulated-auth row counts (vital_signs has 0 rows, so each is 0;
--    the value is in proving the policy doesn't error under each persona):
--
--    -- Naser as OWNER of clinic 298866c7
--    BEGIN;
--    SET LOCAL ROLE authenticated;
--    SET LOCAL "request.jwt.claims" TO '{"sub":"619a7fdd-45a1-49b5-aed2-fbada918b232"}';
--    SELECT auth.uid(), count(*) FROM public.vital_signs;
--    ROLLBACK;
--
--    -- Stranger doctor c982eabc
--    BEGIN;
--    SET LOCAL ROLE authenticated;
--    SET LOCAL "request.jwt.claims" TO '{"sub":"c982eabc-ed1d-409f-90e4-b135fcf945e6"}';
--    SELECT auth.uid(), count(*) FROM public.vital_signs;
--    ROLLBACK;
--
-- 4. End-to-end visibility test with a temporary row (rolled back so the
--    table stays clean):
--
--    BEGIN;
--    -- Insert a test vital under Naser-as-OWNER's clinic, with him as the doctor.
--    INSERT INTO public.vital_signs (
--      patient_id, doctor_id, clinic_id, recorded_at,
--      systolic_bp, diastolic_bp
--    )
--    SELECT
--      (SELECT id FROM public.patients WHERE clinic_id='298866c7-87b7-4405-9487-c7174bafaf99' LIMIT 1),
--      '619a7fdd-45a1-49b5-aed2-fbada918b232'::uuid,
--      '298866c7-87b7-4405-9487-c7174bafaf99'::uuid,
--      NOW(), 120, 80;
--
--    -- Naser-as-OWNER reads (expect 1)
--    SET LOCAL ROLE authenticated;
--    SET LOCAL "request.jwt.claims" TO '{"sub":"619a7fdd-45a1-49b5-aed2-fbada918b232"}';
--    SELECT count(*) AS naser_owner_sees FROM public.vital_signs;
--
--    -- Stranger doctor reads (expect 0)
--    SET LOCAL "request.jwt.claims" TO '{"sub":"c982eabc-ed1d-409f-90e4-b135fcf945e6"}';
--    SELECT count(*) AS stranger_sees FROM public.vital_signs;
--
--    ROLLBACK;
-- ============================================================================
