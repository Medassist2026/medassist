-- ============================================================================
-- Migration 065: Add clinic-scoped SELECT policy on appointments
-- ============================================================================
-- Ninth per-table policy migration. Same is_clinic_member triple-OR
-- pattern as mig 061/062/064. Lifts mig 021 lines 178-190 verbatim.
--
-- Live policy state on appointments as of 2026-04-25 audit:
--   ALL    "Front desk can manage appointments"
--          USING (users.role = 'frontdesk')           <-- global leak
--   INSERT "Doctors and front desk can create appointments"
--          WITH CHECK (clinic-aware compound predicate)
--   SELECT "Doctors can read their appointments"
--          USING (doctor_id IN (SELECT id FROM doctors WHERE id = auth.uid()))
--          ^ depends on the legacy `doctors` table; mig 068 will replace
--   SELECT "Front desk can read clinic appointments"
--          USING (doctor_id IN ... clinic_memberships join)
--          (clinic-scoped, but a different shape than is_clinic_member)
--   SELECT "Front desk can view all appointments"
--          USING (users.role = 'frontdesk')           <-- global leak
--   relrowsecurity = true (already enforced)
--
-- After this migration, an additional SELECT policy named
-- "Clinic-scoped appointment access" is added. The 5 legacy policies
-- are untouched.
--
-- BLAST RADIUS NOTE
-- -----------------
-- 15 read sites in the codebase, mostly via createAdminClient() (service-
-- role bypass; unaffected). The new policy adds clinic-OWNER and
-- assigned-staff RLS-level read access for surfaces that might transition
-- off the admin client. Real schedule reads in production (today's
-- queue, doctor calendar, frontdesk dashboard) all go through the admin
-- client.
--
-- TWO legacy cross-clinic leaks remain after this migration (the global
-- frontdesk policies). They are flagged for cleanup in mig 068. Until
-- then, any user whose users.role = 'frontdesk' can read appointments
-- across all clinics. The clinic_memberships rollout reconciled most
-- frontdesk users into clinic-scoped membership rows, but the legacy
-- users.role check is still in place.
--
-- clinic_id NOT NULL invariant: mig 053 backfilled 3 NULL appointments
-- and added the NOT NULL constraint, so the `clinic_id IS NOT NULL`
-- guard in the new policy is now redundant. Preserved verbatim per
-- "never silently deviate."
--
-- Pre-flight (audited 2026-04-25):
--   - 17 rows in live data; 14 in Naser's clinic (298866c7).
--   - clinic_id NOT NULL across all rows.
--   - Required NOT NULL no-default columns: doctor_id, clinic_id,
--     start_time, created_by_role.
--   - patient_id is NULLABLE (e.g. blocked-off slots).
--   - is_clinic_member function present and tested.
-- ============================================================================

DROP POLICY IF EXISTS "Clinic-scoped appointment access" ON public.appointments;

CREATE POLICY "Clinic-scoped appointment access"
ON public.appointments FOR SELECT
USING (
  doctor_id = auth.uid()
  OR patient_id = auth.uid()
  OR (
    clinic_id IS NOT NULL
    AND public.is_clinic_member(clinic_id, auth.uid())
  )
);

COMMENT ON POLICY "Clinic-scoped appointment access" ON public.appointments IS
  'Routes through is_clinic_member() so any active clinic member (OWNER, DOCTOR, ASSISTANT, FRONT_DESK) can see appointments in their clinic. Coexists with legacy doctor- and global-frontdesk-scoped policies until mig 068 cleanup (the global frontdesk policies have cross-clinic leaks).';

-- ============================================================================
-- Post-migration verification (run via execute_sql after apply):
--
-- 1. Policy presence (expect 6: 1 ALL + 1 INSERT + 4 SELECT):
--      SELECT polname, polcmd::text FROM pg_policy
--      WHERE polrelid='public.appointments'::regclass
--      ORDER BY polcmd::text, polname;
--
-- 2. Real-data e2e:
--    -- Stranger doctor: expect 0 visible in Naser's clinic
--    -- Naser-as-OWNER: expect 14 (the baseline in his clinic)
-- ============================================================================
