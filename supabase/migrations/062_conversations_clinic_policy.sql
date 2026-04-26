-- ============================================================================
-- Migration 062: Add clinic-scoped SELECT policy on conversations
-- ============================================================================
-- Sixth per-table policy migration. Same is_clinic_member triple-OR
-- pattern as mig 061 (check_in_queue). Lifts mig 021 lines 299-308
-- verbatim.
--
-- ORDER NOTE
-- ----------
-- Promoted from "062 = messages, 063 = conversations" (the original
-- plan order) to "062 = conversations, 063 = messages" because messages'
-- new policy does an EXISTS subquery on conversations. Putting
-- conversations first means messages' OWNER branch is reachable on
-- day 1 — same trade-off we made for lab_orders/lab_results.
--
-- Live policy state on conversations as of 2026-04-25 audit:
--   INSERT "Create conversation after appointment"
--          WITH CHECK (created_from_appointment_id linked to user's appointment)
--   INSERT "Create conversation after visit"
--          WITH CHECK (similar but stricter: completed visit + consent)
--   SELECT "Doctors can view their conversations"
--          USING (doctor_id = auth.uid())
--   SELECT "Patients can view their conversations"
--          USING (patient_id = auth.uid())
--   UPDATE "Doctors can update conversation status"
--          USING (doctor_id = auth.uid())
--   UPDATE "Participants can update conversation counters"
--          USING / WITH CHECK (doctor_id = auth.uid() OR patient_id = auth.uid())
--   relrowsecurity = true (already enforced)
--
-- After this migration, an additional SELECT policy named
-- "Clinic-scoped conversation access" is added. The 6 legacy policies
-- are untouched.
--
-- UI sanity check (per the inventory):
--   - 10 read sites total. Patient and doctor messaging handlers use
--     RLS-respecting clients filtered by patient_id / doctor_id —
--     covered by the legacy SELECT policies AND by the new policy's
--     direct checks.
--   - data/messaging-consent.ts uses admin client for some operations.
--   - The new policy adds clinic-OWNER and assigned-staff RLS-level
--     read access, which today does nothing user-visible (no admin
--     surface for browsing clinic conversations exists). Defense-
--     in-depth.
--
-- Pre-flight (audited 2026-04-25):
--   - 4 rows in live data; 2 in Naser's clinic (298866c7), 2 elsewhere.
--   - Real-data verification: stranger sees 0 in Naser's clinic;
--     Naser-as-OWNER sees 2.
--   - is_clinic_member function present and tested.
-- ============================================================================

DROP POLICY IF EXISTS "Clinic-scoped conversation access" ON public.conversations;

CREATE POLICY "Clinic-scoped conversation access"
ON public.conversations FOR SELECT
USING (
  patient_id = auth.uid()
  OR doctor_id = auth.uid()
  OR (
    clinic_id IS NOT NULL
    AND public.is_clinic_member(clinic_id, auth.uid())
  )
);

COMMENT ON POLICY "Clinic-scoped conversation access" ON public.conversations IS
  'Routes through is_clinic_member() so any active clinic member (OWNER, DOCTOR, ASSISTANT, FRONT_DESK) can see conversations in their clinic. Coexists with legacy participant-scoped policies until mig 068 cleanup.';

-- ============================================================================
-- Post-migration verification (run via execute_sql after apply):
--
-- 1. Policy presence (expect 7: 2 INSERT + 3 SELECT + 2 UPDATE):
--      SELECT polname, polcmd::text FROM pg_policy
--      WHERE polrelid='public.conversations'::regclass
--      ORDER BY polcmd::text, polname;
--
-- 2. Real-data e2e:
--    -- Stranger doctor: expect 0 visible in Naser's clinic
--    -- Naser-as-OWNER: expect 2
-- ============================================================================
