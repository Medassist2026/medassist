-- ============================================================================
-- Migration 064: Add clinic-scoped SELECT policy on payments
-- ============================================================================
-- Eighth per-table policy migration. Same is_clinic_member triple-OR
-- pattern as mig 061 (check_in_queue) and mig 062 (conversations).
-- Lifts mig 021 lines 266-278 verbatim.
--
-- Live policy state on payments as of 2026-04-25 audit:
--   ALL    "Frontdesk can manage payments for their clinic"
--          USING / WITH CHECK (doctor_id IN ... clinic_memberships join)
--   INSERT "Front desk can create payments"
--          WITH CHECK (users.role = 'frontdesk')
--          ^ legacy global cross-clinic leak (insert) -- mig 068 cleanup
--   SELECT "Doctors can view their own payments"
--          USING (doctor_id = auth.uid())
--   SELECT "Front desk can view payments"
--          USING (users.role = 'frontdesk')
--          ^ legacy global cross-clinic leak (read) -- mig 068 cleanup
--   relrowsecurity = true (already enforced)
--
-- After this migration, an additional SELECT policy named
-- "Clinic-scoped payment access" is added. The 4 legacy policies are
-- untouched.
--
-- BLAST RADIUS NOTE
-- -----------------
-- payments has the highest call-site count of the is_clinic_member-
-- pattern tables (13 read sites per the plan's inventory). The new
-- policy is additive: existing reads keep working via the legacy
-- policies. Real-world traffic split:
--   - createAdminClient() routes (most read paths) -- service-role
--     bypass, unaffected by RLS.
--   - Authenticated frontdesk routes -- coverage today comes from the
--     legacy "Front desk can view payments" policy. After mig 068 they
--     transition to the new is_clinic_member-based policy. Same access
--     rights minus the global cross-clinic leak.
--   - Public invoice URL (/api/public/invoice) -- uses anon key, hits
--     RLS without an authenticated user. Neither old nor new policy
--     grants anon access; that route relies on a separate signed-URL
--     mechanism (or service-role bypass server-side). Not affected by
--     this migration.
--
-- Pre-flight (audited 2026-04-25):
--   - 0 rows in live data (no production payments yet).
--   - Required NOT NULL no-default columns: patient_id, doctor_id,
--     amount, payment_method, clinic_id.
--   - payment_method must be one of {cash, card, insurance, other}.
--   - amount must be >= 0.
--   - is_clinic_member function present and tested.
-- ============================================================================

DROP POLICY IF EXISTS "Clinic-scoped payment access" ON public.payments;

CREATE POLICY "Clinic-scoped payment access"
ON public.payments FOR SELECT
USING (
  doctor_id = auth.uid()
  OR patient_id = auth.uid()
  OR (
    clinic_id IS NOT NULL
    AND public.is_clinic_member(clinic_id, auth.uid())
  )
);

COMMENT ON POLICY "Clinic-scoped payment access" ON public.payments IS
  'Routes through is_clinic_member() so any active clinic member (OWNER, DOCTOR, ASSISTANT, FRONT_DESK) can read payments for their clinic. Coexists with legacy doctor-scoped and global-frontdesk policies until mig 068 cleanup (the global frontdesk policy has a cross-clinic leak).';

-- ============================================================================
-- Post-migration verification (run via execute_sql after apply):
--
-- 1. Policy presence (expect 5: 1 ALL + 1 INSERT + 3 SELECT):
--      SELECT polname, polcmd::text FROM pg_policy
--      WHERE polrelid='public.payments'::regclass
--      ORDER BY polcmd::text, polname;
--
-- 2. e2e (table is empty -- INSERT/ROLLBACK pattern):
--    BEGIN;
--    INSERT INTO public.payments (
--      patient_id, doctor_id, clinic_id, amount, payment_method
--    ) VALUES (
--      (SELECT id FROM public.patients
--         WHERE clinic_id='298866c7-87b7-4405-9487-c7174bafaf99' LIMIT 1),
--      '619a7fdd-45a1-49b5-aed2-fbada918b232'::uuid,
--      '298866c7-87b7-4405-9487-c7174bafaf99'::uuid,
--      150.00, 'cash'
--    );
--    SET LOCAL ROLE authenticated;
--    SET LOCAL "request.jwt.claims" TO '{"sub":"c982eabc-..."}';
--    SELECT count(*) FROM public.payments
--    WHERE clinic_id='298866c7-87b7-4405-9487-c7174bafaf99';  -- expect 0
--    ROLLBACK;
--
--    -- Naser-as-OWNER: expect 1
-- ============================================================================
