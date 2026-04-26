-- ============================================================================
-- Migration 067: Add clinic-scoped SELECT policy on patients
-- ============================================================================
-- Final per-table policy migration. patients is the identity table that
-- every other table joins through; biggest blast radius. Lifts mig 021
-- lines 123-140 verbatim.
--
-- POLICY SHAPE
-- ------------
-- Three-way OR, with one path that's now dead code:
--
--   id = auth.uid()
--      ^ patient self-view via the global-identity rule (patient_id and
--        user_id are the same UUID for any registered patient).
--   OR (clinic_id IS NOT NULL AND can_access_patient(clinic_id, id, ...))
--      ^ clinic OWNER / DOCTOR with pv grant / assigned ASSISTANT|FRONT_DESK.
--        Note: passes `id` as the patient_id parameter — the patient's
--        own row IS the patient_id in this table.
--   OR EXISTS (... doctor_patient_relationships dpr ...)
--      ^ legacy fallback for patients with NULL clinic_id. Mig 051
--        enforced clinic_id NOT NULL on patients (confirmed: 0 NULL
--        rows live), so this branch is unreachable. Preserved verbatim
--        per "never silently deviate" — it documents the pre-NOT-NULL
--        access path and matches mig 021's source.
--
-- Live policy state on patients as of 2026-04-25 audit:
--   INSERT × 3:
--     "Doctors can create walk-in patients"      (users.role='doctor')
--     "Front desk can create patients"           (users.role='frontdesk')
--     "Patients can insert own record ..."       (auth.uid() = id)
--   SELECT × 2:
--     "Front desk can view all patients"         (global frontdesk leak)
--     "Patients can read own profile"            (auth.uid() = id)
--   UPDATE × 2:
--     "Doctors can update walk-in patients ..."  (created_by_doctor_id or users.role='doctor')
--     "Patients can update own profile"          (auth.uid() = id)
--   relrowsecurity = true (already enforced)
--
-- After this migration, an additional SELECT policy named
-- "Clinic members can view patients" is added. The 7 legacy policies
-- are untouched.
--
-- BLAST RADIUS NOTE
-- -----------------
-- 21 read sites in the codebase, mostly via createAdminClient() (admin
-- bypass; unaffected). The new policy is the FIRST time doctors get
-- RLS-level read access to patients (today they only access patients
-- via service role).
--
-- Two architecture notes for the doc:
--   1. Doctors today access patients exclusively via admin client —
--      not via RLS. The new policy adds an RLS path. Application
--      behavior is unchanged in production but defense-in-depth is
--      tightened.
--   2. The legacy "Front desk can view all patients" still uses the
--      global users.role='frontdesk' check (cross-clinic leak). Mig
--      068 will close it.
--
-- Pre-flight (audited 2026-04-25):
--   - 35 rows in live data; 23 in Naser's clinic; 0 with NULL
--     clinic_id (mig 051 invariant holds).
--   - 1 registered patient in Naser's clinic (rest are walk-ins).
--   - can_access_patient function present and tested.
-- ============================================================================

DROP POLICY IF EXISTS "Clinic members can view patients" ON public.patients;

CREATE POLICY "Clinic members can view patients"
ON public.patients FOR SELECT
USING (
  -- Patient viewing own data
  id = auth.uid()
  -- Or clinic member with patient access
  OR (
    clinic_id IS NOT NULL
    AND public.can_access_patient(clinic_id, id, auth.uid(), 'READ')
  )
  -- Legacy: doctor_patient_relationships (for patients without clinic_id).
  -- Dead code today: mig 051 enforced patients.clinic_id NOT NULL.
  -- Preserved verbatim from mig 021 per architecture rule.
  OR EXISTS (
    SELECT 1 FROM public.doctor_patient_relationships dpr
    WHERE dpr.patient_id = patients.id
      AND dpr.doctor_id = auth.uid()
      AND dpr.status = 'active'
  )
);

COMMENT ON POLICY "Clinic members can view patients" ON public.patients IS
  'Routes through can_access_patient() so clinic OWNERs and assigned ASSISTANT/FRONT_DESK staff can read patients in their clinic. Patient self-view via the global-identity rule (id = auth.uid()). Legacy DPR fallback is dead code post-mig-051 but preserved for documentation. Coexists with legacy frontdesk-global and patient-self policies until mig 068 cleanup.';

-- ============================================================================
-- Post-migration verification (run via execute_sql after apply):
--
-- 1. Policy presence (expect 8: 3 INSERT + 3 SELECT + 2 UPDATE):
--      SELECT polname, polcmd::text FROM pg_policy
--      WHERE polrelid='public.patients'::regclass
--      ORDER BY polcmd::text, polname;
--
-- 2. Real-data e2e:
--    -- Stranger doctor: expect 0 visible in Naser's clinic
--    -- Naser-as-OWNER: expect 23 (the baseline in his clinic)
--    -- Patient-self: pick a registered patient, simulate as them,
--       expect 1 (their own row)
-- ============================================================================
