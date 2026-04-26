-- ============================================================================
-- Migration 063: Add clinic-scoped SELECT policy on messages
-- ============================================================================
-- Seventh per-table policy migration. EXISTS-via-parent shape, mirroring
-- mig 060 (lab_results). Lifts mig 021 lines 313-329 verbatim.
--
-- ORDER NOTE
-- ----------
-- This was originally mig 062 in the plan. Promoted conversations to
-- 062 and demoted messages to 063 so the EXISTS subquery's clinic-OWNER
-- branch is reachable on day 1 (mig 062 added is_clinic_member access
-- on the parent conversations table).
--
-- Live policy state on messages as of 2026-04-25 audit:
--   INSERT "Participants can send messages"
--          WITH CHECK (EXISTS conversation where status='active' AND user is participant)
--   SELECT "Participants can view messages"
--          USING  (EXISTS conversation where user is participant)
--   UPDATE "Participants can update message read state"
--          USING  (EXISTS conversation where user is participant)
--   relrowsecurity = true (already enforced)
--
-- After this migration, an additional SELECT policy named
-- "Clinic-scoped message access" is added. The 3 legacy policies are
-- untouched.
--
-- POLICY DESIGN NOTE
-- ------------------
-- Same belt-and-suspenders pattern as mig 060: the inner EXISTS
-- subquery duplicates the OR triple that conversations' own RLS already
-- enforces. Strictly stricter: if a future conversations policy ever
-- grants access via a path not covered by patient_id / doctor_id /
-- is_clinic_member, this policy still requires one of the three.
-- Preserved verbatim from mig 021 per the "never silently deviate"
-- architecture rule.
--
-- UI sanity check (per the inventory):
--   - 4 read sites total. Patient and doctor messaging handlers use
--     RLS-respecting clients filtered by conversation_id, with
--     conversation membership already verified at the parent layer.
--   - data/messaging-consent.ts uses admin client.
--   - The new policy adds clinic-OWNER and assigned-staff RLS-level
--     read access; nothing user-visible today (no admin surface for
--     browsing clinic messages exists). Defense-in-depth.
--
-- Pre-flight (audited 2026-04-25):
--   - 6 rows in live data; 4 in Naser's clinic (298866c7).
--   - Mig 062 (conversations) shipped immediately before, so
--     conversations RLS already grants Naser (OWNER) access to all 2
--     conversations in his clinic. Therefore the inner EXISTS subquery
--     resolves and Naser sees all 4 messages.
--   - Stranger sees 0 (not a member of clinic 298866c7 -> conversations
--     RLS denies inner subquery -> messages RLS denies).
-- ============================================================================

DROP POLICY IF EXISTS "Clinic-scoped message access" ON public.messages;

CREATE POLICY "Clinic-scoped message access"
ON public.messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (
        c.patient_id = auth.uid()
        OR c.doctor_id = auth.uid()
        OR (
          c.clinic_id IS NOT NULL
          AND public.is_clinic_member(c.clinic_id, auth.uid())
        )
      )
  )
);

COMMENT ON POLICY "Clinic-scoped message access" ON public.messages IS
  'Routes through is_clinic_member() on the parent conversation so clinic OWNERs and assigned ASSISTANT/FRONT_DESK staff can read messages in their clinic. Coexists with the legacy "Participants can view messages" policy until mig 068 cleanup.';

-- ============================================================================
-- Post-migration verification (run via execute_sql after apply):
--
-- 1. Policy presence (expect 4: 1 INSERT + 2 SELECT + 1 UPDATE):
--      SELECT polname, polcmd::text FROM pg_policy
--      WHERE polrelid='public.messages'::regclass
--      ORDER BY polcmd::text, polname;
--
-- 2. Real-data e2e:
--    -- Stranger doctor: expect 0 visible in Naser's clinic
--    -- Naser-as-OWNER: expect 4
-- ============================================================================
