-- ============================================================================
-- Migration 066: Add clinic-scoped SELECT + INSERT policies on clinical_notes
-- ============================================================================
-- Tenth per-table policy migration. clinical_notes is the second-highest
-- blast-radius table after `patients` (28 read sites in the codebase).
-- This migration adds TWO new policies — one SELECT, one INSERT —
-- mirroring mig 021 lines 142-170. Same additive-then-cleanup pattern.
--
-- Live policy state on clinical_notes as of 2026-04-25 audit:
--   INSERT "Doctors can create clinical notes"
--          WITH CHECK (doctor_id = auth.uid())
--          ^ mig 068 will drop this; the new INSERT below replaces it
--   SELECT "Doctors can read own clinical notes"
--          USING (doctor_id = auth.uid())
--   SELECT "Patients can read their clinical notes"
--          USING (patient_id = auth.uid() AND synced_to_patient = true)
--   UPDATE "Doctors can update own clinical notes"
--          USING (doctor_id = auth.uid())
--   relrowsecurity = true (already enforced)
--
-- After this migration:
--   - 1 new SELECT policy "Clinic-scoped note access" with full
--     can_access_patient triple-OR plus the patient-self synced-only
--     branch.
--   - 1 new INSERT policy "Doctors can insert notes in their clinic"
--     that combines doctor_id = auth.uid() AND is_clinic_member check.
--
-- INSERT TIGHTENING: STRUCTURAL NOW, EFFECTIVE AT MIG 068
-- -------------------------------------------------------
-- The new INSERT policy is STRICTER than the legacy
-- "Doctors can create clinical notes" — it adds the requirement that
-- the doctor be an active member of the clinic they're attaching the
-- note to. But Postgres OR's permissive INSERT policies, so as long as
-- the legacy policy stays in place a doctor whose clinic_membership
-- was revoked could still INSERT a note (the legacy policy allows it).
--
-- The additive-then-cleanup approach Mo approved means we ship the
-- structure now (this migration) and the actual tightening lands when
-- mig 068 drops the legacy INSERT. UX impact in the interim: zero —
-- the legacy policy is strictly looser, so anyone who can insert today
-- can still insert tomorrow.
--
-- Why structural-now? Two reasons:
--   1. Mig 068 becomes a pure DROP migration (no behavioral surprises).
--   2. The new policy is visible in pg_policies as the documented
--      intended INSERT predicate, even before it takes effect.
--
-- UI sanity check (per the inventory):
--   - 28 read sites; mostly via createAdminClient() (admin bypass).
--     Notable RLS-respecting reads: data/clinical-notes.ts
--     (getDoctorNotes, getPatientNotes, getClinicalNote), the doctor's
--     patient detail handler (admin client + clinic_id filter at app
--     layer), patient handlers/notes/visits/health-summary.
--   - The new SELECT policy preserves all current access paths and
--     adds clinic-OWNER + assigned-staff + clinic-wide visibility.
--   - The new INSERT policy is dormant until mig 068; existing INSERTs
--     keep working unchanged.
--
-- Pre-flight (audited 2026-04-25):
--   - 45 rows in live data; 33 in Naser's clinic; 4 with
--     synced_to_patient=true.
--   - clinic_id NOT NULL across all rows.
--   - Required NOT NULL no-default columns: doctor_id, patient_id,
--     clinic_id. Everything else has sensible defaults
--     (chief_complaint='{}'::text[], diagnosis='[]'::jsonb,
--     medications='[]'::jsonb, plan='', synced_to_patient=false).
--   - can_access_patient and is_clinic_member functions present.
-- ============================================================================

-- New SELECT policy
DROP POLICY IF EXISTS "Clinic-scoped note access" ON public.clinical_notes;

CREATE POLICY "Clinic-scoped note access"
ON public.clinical_notes FOR SELECT
USING (
  -- Doctor who wrote the note
  doctor_id = auth.uid()
  -- Patient viewing their own synced-to-patient notes
  OR (patient_id = auth.uid() AND COALESCE(synced_to_patient, FALSE) = TRUE)
  -- Clinic member with patient access
  OR (
    clinic_id IS NOT NULL
    AND public.can_access_patient(clinic_id, patient_id, auth.uid(), 'READ')
  )
);

COMMENT ON POLICY "Clinic-scoped note access" ON public.clinical_notes IS
  'Routes through can_access_patient() so clinic OWNERs and assigned ASSISTANT/FRONT_DESK staff can read notes for patients they have access to. Patient self-view requires synced_to_patient=true (matches legacy policy). Coexists with legacy doctor- and patient-scoped policies until mig 068 cleanup.';

-- New INSERT policy (structurally tighter; effectively dormant until mig 068)
DROP POLICY IF EXISTS "Doctors can insert notes in their clinic" ON public.clinical_notes;

CREATE POLICY "Doctors can insert notes in their clinic"
ON public.clinical_notes FOR INSERT
WITH CHECK (
  doctor_id = auth.uid()
  AND (
    clinic_id IS NULL
    OR public.is_clinic_member(clinic_id, auth.uid())
  )
);

COMMENT ON POLICY "Doctors can insert notes in their clinic" ON public.clinical_notes IS
  'Tighter than the legacy "Doctors can create clinical notes": adds is_clinic_member check on top of doctor_id = auth.uid(). Effective once mig 068 drops the legacy permissive INSERT (which currently OR-overrides this one).';

-- ============================================================================
-- Post-migration verification (run via execute_sql after apply):
--
-- 1. Policy presence (expect 6: 2 INSERT + 3 SELECT + 1 UPDATE):
--      SELECT polname, polcmd::text FROM pg_policy
--      WHERE polrelid='public.clinical_notes'::regclass
--      ORDER BY polcmd::text, polname;
--
-- 2. Real-data e2e for SELECT:
--    -- Stranger doctor: expect 0 visible in Naser's clinic
--    -- Naser-as-OWNER: expect 33 (the baseline in his clinic)
--
-- 3. Confirm INSERT policy is dormant (legacy still grants broad insert).
--    No active production write paths break. The new policy's stricter
--    predicate becomes the active gate after mig 068.
-- ============================================================================
