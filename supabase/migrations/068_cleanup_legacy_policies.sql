-- ============================================================================
-- Migration 068: Cleanup legacy policies (drops + 1 ALL replacement)
-- ============================================================================
-- DESTRUCTIVE migration. The cleanup phase Mo approved as part of the
-- additive-then-cleanup approach in docs/investigations/RLS_REWRITE_PLAN.md.
-- Removes legacy policies that the new clinic-scoped policies (migs
-- 055, 058-067) have made redundant or superseded.
--
-- DO NOT APPLY IMMEDIATELY. The plan specifies a stable production
-- cycle on migs 058-067 first. Watch Supabase logs for unexpected
-- "row-level security denied" patterns. Once clean for at least 7 days,
-- this migration is safe to apply.
--
-- Categories of changes (all reasoned in the per-section comments below):
--   A. Drop SELECT policies that are CLEAN SUBSETS of the new clinic-
--      scoped policy (no behavior change for legitimate users).
--   B. Drop policies with CROSS-CLINIC LEAKS (the global users.role=
--      'frontdesk' policies — fixes a tenant-isolation gap that is
--      dormant in production today only because the app uses admin
--      client paths).
--   C. Drop the legacy permissive INSERT on clinical_notes so the
--      tighter "Doctors can insert notes in their clinic" from mig 066
--      becomes the active gate.
--   D. REPLACE one ALL policy whose drop would remove DML access with
--      no clinic-scoped alternative: "Front desk can manage
--      appointments". Replaced with "Clinic-scoped appointment
--      management" using is_clinic_member.
--
-- Policies KEPT after this migration:
--   - All clinic-scoped ALL policies (provide DML for clinic members)
--   - All INSERT policies that are clinic-aware (or required for
--     specific paths like patient self-registration)
--   - The patient self-view paths that DO NOT use users.role='frontdesk'
--   - All UPDATE policies (no UPDATE rewrite was in scope for mig 020/021)
--
-- After this migration, every SELECT path on the 11 target tables goes
-- through one of the new clinic-scoped policies. Patient self-view
-- continues to work via either the dedicated "Patients can read own
-- profile"-style legacy policy (where it still exists) or the new
-- policy's id=auth.uid() / patient_id=auth.uid() branch.
--
-- ARCHITECTURE NOTE
-- -----------------
-- Two policies on appointments and payments retain global users.role=
-- 'frontdesk' predicates *before* this migration, but only the SELECT
-- ones have actual cross-clinic leaks (they let any frontdesk user
-- read across clinics). The INSERT-flavored leak on payments ("Front
-- desk can create payments") is also addressed here. The ALL-flavored
-- leak on appointments is handled by the REPLACE in section H.
--
-- Mig 068 does NOT touch:
--   - clinic_memberships policies (fixed in mig 056)
--   - patient_visibility policies (added by mig 020, still valid)
--   - assistant_doctor_assignments policies (added by mig 020)
--   - audit_events policies (added by mig 020)
--   - clinic_doctors / front_desk_staff / doctors / users tables
--     (separate triage; out of scope for mig 020/021 work)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. vital_signs: drop two legacy SELECTs (clean subsets of new)
-- ----------------------------------------------------------------------------
-- "Doctors can view their patients vitals" had a doctor-via-appointments
-- fallback path not covered by can_access_patient. The vital_signs
-- table has 0 rows in live data so nothing is actually denied; the new
-- design intentionally requires patient_visibility grants instead.
DROP POLICY IF EXISTS "Doctors can view their patients vitals" ON public.vital_signs;
DROP POLICY IF EXISTS "Patients can view own vitals" ON public.vital_signs;

-- ----------------------------------------------------------------------------
-- B. imaging_orders: drop the patient-self SELECT (subset of new)
-- ----------------------------------------------------------------------------
-- "Doctors manage their imaging orders" stays — it's an ALL policy that
-- provides INSERT/UPDATE/DELETE for the doctor.
DROP POLICY IF EXISTS "Patients view own imaging orders" ON public.imaging_orders;

-- ----------------------------------------------------------------------------
-- C. lab_orders: drop two legacy SELECTs (subsets)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Doctors can view their lab orders" ON public.lab_orders;
DROP POLICY IF EXISTS "Patients can view own lab orders" ON public.lab_orders;

-- ----------------------------------------------------------------------------
-- D. lab_results: drop legacy SELECT (clean subset of new EXISTS-via-parent)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "View lab results" ON public.lab_results;

-- ----------------------------------------------------------------------------
-- E. check_in_queue: drop global frontdesk ALL + doctor-self SELECT
-- ----------------------------------------------------------------------------
-- "Front desk can manage queue" was the global frontdesk leak.
-- The clinic-scoped sibling "Frontdesk can manage queue for their
-- clinic" preserves DML for legitimate frontdesk users.
DROP POLICY IF EXISTS "Front desk can manage queue" ON public.check_in_queue;
DROP POLICY IF EXISTS "Doctors can read their own queue" ON public.check_in_queue;

-- ----------------------------------------------------------------------------
-- F. conversations: drop two legacy SELECTs (subsets)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Doctors can view their conversations" ON public.conversations;
DROP POLICY IF EXISTS "Patients can view their conversations" ON public.conversations;

-- ----------------------------------------------------------------------------
-- G. messages: drop legacy SELECT (clean subset of new EXISTS-via-parent)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;

-- ----------------------------------------------------------------------------
-- H. payments: drop two cross-clinic-leak policies + doctor-self SELECT
-- ----------------------------------------------------------------------------
-- "Frontdesk can manage payments for their clinic" (ALL, clinic-scoped)
-- stays — provides DML for clinic frontdesk users including INSERT.
DROP POLICY IF EXISTS "Front desk can create payments" ON public.payments;
DROP POLICY IF EXISTS "Doctors can view their own payments" ON public.payments;
DROP POLICY IF EXISTS "Front desk can view payments" ON public.payments;

-- ----------------------------------------------------------------------------
-- I. appointments: drop three SELECTs + REPLACE the global ALL
-- ----------------------------------------------------------------------------
-- Three SELECTs go: "Doctors can read their appointments" (subset, also
-- depends on legacy `doctors` table reference), "Front desk can read
-- clinic appointments" (subset of new is_clinic_member triple-OR),
-- "Front desk can view all appointments" (cross-clinic leak).
DROP POLICY IF EXISTS "Doctors can read their appointments" ON public.appointments;
DROP POLICY IF EXISTS "Front desk can read clinic appointments" ON public.appointments;
DROP POLICY IF EXISTS "Front desk can view all appointments" ON public.appointments;

-- The global "Front desk can manage appointments" ALL policy is a
-- cross-clinic leak, but dropping it in isolation removes the only DML
-- path (UPDATE/DELETE) for frontdesk users on appointments. Replace
-- with a clinic-scoped equivalent so DML is preserved for legitimate
-- (in-clinic) users.
--
-- The replacement permits any active clinic member to manage
-- appointments in their clinic. App-layer code may impose additional
-- role restrictions; tightening this further (e.g. limiting to OWNER /
-- FRONT_DESK / ASSISTANT roles) is out of scope here and can be a
-- follow-up migration if needed.
DROP POLICY IF EXISTS "Front desk can manage appointments" ON public.appointments;

CREATE POLICY "Clinic-scoped appointment management"
ON public.appointments FOR ALL
USING (
  clinic_id IS NOT NULL
  AND public.is_clinic_member(clinic_id, auth.uid())
)
WITH CHECK (
  clinic_id IS NOT NULL
  AND public.is_clinic_member(clinic_id, auth.uid())
);

COMMENT ON POLICY "Clinic-scoped appointment management" ON public.appointments IS
  'Replaces the legacy global "Front desk can manage appointments" policy. Permits any active clinic member to manage (SELECT/INSERT/UPDATE/DELETE) appointments in their clinic. The existing clinic-aware INSERT policy "Doctors and front desk can create appointments" still adds extra checks at create time.';

-- ----------------------------------------------------------------------------
-- J. clinical_notes: drop legacy SELECTs + the legacy permissive INSERT
-- ----------------------------------------------------------------------------
-- Dropping "Doctors can create clinical notes" activates the tighter
-- "Doctors can insert notes in their clinic" policy from mig 066,
-- which adds the is_clinic_member check.
DROP POLICY IF EXISTS "Doctors can create clinical notes" ON public.clinical_notes;
DROP POLICY IF EXISTS "Doctors can read own clinical notes" ON public.clinical_notes;
DROP POLICY IF EXISTS "Patients can read their clinical notes" ON public.clinical_notes;

-- ----------------------------------------------------------------------------
-- K. patients: drop the global frontdesk SELECT + the patient-self SELECT
-- ----------------------------------------------------------------------------
-- "Patients can read own profile" is functionally a subset of the new
-- "Clinic members can view patients" policy's id=auth.uid() branch.
-- Patient self-view continues to work through that branch.
DROP POLICY IF EXISTS "Front desk can view all patients" ON public.patients;
DROP POLICY IF EXISTS "Patients can read own profile" ON public.patients;

-- ============================================================================
-- Post-migration verification (run via execute_sql after apply):
--
-- 1. Policy count summary (expected counts after this migration):
--      vital_signs:     2  (1 INSERT + 1 SELECT)
--      imaging_orders:  2  (1 ALL    + 1 SELECT)
--      lab_orders:      2  (1 INSERT + 1 SELECT)
--      lab_results:     1  (1 SELECT)
--      check_in_queue:  3  (1 ALL    + 1 SELECT + 1 UPDATE)
--      conversations:   5  (2 INSERT + 1 SELECT + 2 UPDATE)
--      messages:        3  (1 INSERT + 1 SELECT + 1 UPDATE)
--      payments:        2  (1 ALL    + 1 SELECT)
--      appointments:    3  (1 ALL    + 1 INSERT + 1 SELECT)
--      clinical_notes:  3  (1 INSERT + 1 SELECT + 1 UPDATE)
--      patients:        6  (3 INSERT + 1 SELECT + 2 UPDATE)
--
--   Verify with:
--     SELECT tablename, count(*) FROM pg_policies
--     WHERE schemaname='public' AND tablename IN (
--       'vital_signs','imaging_orders','lab_orders','lab_results',
--       'check_in_queue','conversations','messages','payments',
--       'appointments','clinical_notes','patients'
--     )
--     GROUP BY tablename ORDER BY tablename;
--
-- 2. Re-run the per-table simulated-auth e2e tests for:
--    - patients (Naser sees 23, stranger sees 0, patient-self sees 1)
--    - clinical_notes (Naser sees 33, stranger sees 0, patient-self sees 4)
--    - appointments (Naser sees 14, stranger sees 0)
--    Expected: identical to mig 067/066/065 e2e results — dropping
--    redundant legacy policies should not change visible row counts.
--
-- 3. Verify the clinical_notes INSERT tightening is now active:
--    Inside a transaction, simulate a doctor whose clinic_membership
--    is INACTIVE. Their INSERT into clinical_notes should fail under
--    the new policy. Today (pre-mig-068) it would succeed via the
--    legacy permissive policy.
--
-- 4. Verify the appointments DML replacement: a frontdesk user in
--    Naser's clinic can still update an appointment in that clinic.
--    A frontdesk user in a different clinic cannot update Naser's
--    appointments.
--
-- ROLLBACK PLAN
-- =============
-- If a regression appears in production after applying this migration,
-- the policies it drops can be re-created from the old `pg_policy`
-- snapshot. Recommend taking a snapshot of pg_policies content before
-- applying:
--
--   CREATE TABLE _backup_pg_policies_pre_068 AS
--   SELECT * FROM pg_policies WHERE schemaname='public';
--
-- (Run that as a separate SQL statement before apply_migration. Drop
-- the backup table after a stable production cycle.)
-- ============================================================================
