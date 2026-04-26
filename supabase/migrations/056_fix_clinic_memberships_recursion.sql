-- ============================================================================
-- Migration 056: Fix clinic_memberships SELECT policy recursion
-- ============================================================================
-- Inserted into the per-table policy sequence (between mig 055 vital_signs
-- and the original mig 056 imaging_orders) to fix a pre-existing RLS bug
-- discovered during mig 055 verification.
--
-- ROOT CAUSE
-- ----------
-- The current "Members can view clinic memberships" SELECT policy on
-- public.clinic_memberships has a self-referential subquery:
--
--   USING (clinic_id IN (
--     SELECT cm.clinic_id FROM clinic_memberships cm
--     WHERE cm.user_id = auth.uid() AND cm.status = 'ACTIVE'
--   ))
--
-- That subquery on clinic_memberships triggers the same SELECT policy on
-- clinic_memberships (RLS evaluates the policy for every row of the inner
-- query), which contains the same subquery, which... infinite recursion.
--
-- WHY THE LIVE APP DOES NOT CRASH
-- -------------------------------
-- Every read of clinic_memberships in the app today goes through
-- createAdminClient() (service-role with BYPASSRLS). RLS does not apply,
-- so the recursion is dormant. It surfaces the moment an authenticated
-- read path tries to query clinic_memberships — including any RLS policy
-- on another table that subqueries clinic_memberships (e.g. the legacy
-- "Front desk can read clinic appointments" policy on appointments).
--
-- THE FIX
-- -------
-- Replace the self-referential subquery with a call to the new
-- public.is_clinic_member(clinic_id, user_id) function (created in
-- mig 054). The function is SECURITY DEFINER and owned by postgres
-- (rolbypassrls=true, verified 2026-04-25), so its internal SELECT on
-- clinic_memberships executes with BYPASSRLS and does NOT trigger the
-- table's own RLS policies. That breaks the recursion cycle.
--
-- The semantics of the policy are unchanged: "an authenticated user
-- can see this membership row if they are an active member of the same
-- clinic." Only the implementation strategy changes.
--
-- IMPACT ON OTHER POLICIES
-- ------------------------
-- The INSERT ("Owners can manage memberships") and UPDATE ("Owners can
-- update memberships") policies on clinic_memberships also have
-- subqueries on clinic_memberships, but those subqueries only recursed
-- via the SELECT policy. With the SELECT policy now non-recursive,
-- those subqueries resolve cleanly: they filter rows through the new
-- is_clinic_member-based SELECT policy (any active member of the clinic
-- can see the candidate rows), then the outer EXISTS checks the
-- OWNER-and-self predicate. Net behavior preserved.
--
-- This migration ONLY rewrites the SELECT policy. The INSERT/UPDATE
-- policies are not touched (their bodies still reference
-- clinic_memberships, but those subqueries become safe once SELECT is
-- fixed).
-- ============================================================================

DROP POLICY IF EXISTS "Members can view clinic memberships" ON public.clinic_memberships;

CREATE POLICY "Members can view clinic memberships"
ON public.clinic_memberships FOR SELECT
USING (public.is_clinic_member(clinic_id, auth.uid()));

COMMENT ON POLICY "Members can view clinic memberships" ON public.clinic_memberships IS
  'Members of a clinic can see all membership rows for that clinic. Implemented via is_clinic_member() SECURITY DEFINER function to avoid the self-referential RLS recursion the previous version had.';

-- ============================================================================
-- Post-migration verification (run via execute_sql after apply):
--
--   -- 1. Policy is in place with the new USING expression.
--   SELECT pg_get_expr(polqual, polrelid)
--   FROM pg_policy WHERE polname='Members can view clinic memberships';
--   -- expect: is_clinic_member(clinic_id, auth.uid())
--
--   -- 2. No more recursion. As authenticated:
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SET LOCAL "request.jwt.claims" TO
--     '{"sub":"619a7fdd-45a1-49b5-aed2-fbada918b232"}';
--   SELECT count(*) FROM public.clinic_memberships;
--   -- expect: 2 (Naser is in 2 clinic_memberships rows: OWNER and DOCTOR)
--   ROLLBACK;
--
--   -- 3. Tighter scope check: Naser does NOT see memberships of clinics
--   --    he is not in.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SET LOCAL "request.jwt.claims" TO
--     '{"sub":"619a7fdd-45a1-49b5-aed2-fbada918b232"}';
--   SELECT count(*) FROM public.clinic_memberships
--   WHERE clinic_id NOT IN (
--     '298866c7-87b7-4405-9487-c7174bafaf99'::uuid,
--     '8d27729f-9f9b-426a-aa48-cc16a419559a'::uuid
--   );
--   -- expect: 0
--   ROLLBACK;
-- ============================================================================
