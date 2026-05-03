-- ============================================================================
-- Migration 100 — FORENSIC BACKFILL: 2026-04-08 RLS hardening fixes
--
-- Audit reference: audits/database-audit/out-of-band-2026-04-08.md
-- Originated by:   Audit Session C (2026-05-03)
--
-- Purpose
-- -------
-- Restore the two out-of-band RLS-hardening fixes applied via the migrations
-- CLI on 2026-04-08 (tracking rows 20260408145102 and 20260408145129) but
-- never committed as files. Captured verbatim from `schema_migrations.statements`
-- by Session B and reproduced here with idempotency guards.
--
-- WHY (audit finding)
-- -------------------
-- Session A enumerated two `schema_migrations` rows with no corresponding `.sql`
-- file in the repo. Session B recovered the SQL bodies. This migration brings
-- the migration tree into alignment with what's already deployed on staging.
-- Re-applying produces no-op (every CREATE POLICY is preceded by DROP POLICY
-- IF EXISTS).
--
-- IDEMPOTENCY
-- -----------
--   * RLS-enable uses ALTER TABLE ... ENABLE ROW LEVEL SECURITY (Postgres
--     treats this as a no-op when RLS is already enabled).
--   * Each CREATE POLICY is preceded by DROP POLICY IF EXISTS to guard
--     against re-application.
--
-- SMOKE PROBE
-- -----------
-- Final DO $$ block asserts that all 9 policies created here exist in
-- pg_policies after the migration body completes.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Part 1: enable_rls_on_unprotected_tables (tracking row 20260408145102)
-- ----------------------------------------------------------------------------

-- 1.a  check_in_queue
ALTER TABLE public.check_in_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Frontdesk can manage queue for their clinic" ON public.check_in_queue;
CREATE POLICY "Frontdesk can manage queue for their clinic"
  ON public.check_in_queue
  FOR ALL
  USING (
    doctor_id IN (
      SELECT cm_d.user_id
      FROM public.clinic_memberships cm_fd
      JOIN public.clinic_memberships cm_d ON cm_d.clinic_id = cm_fd.clinic_id
      WHERE cm_fd.user_id = auth.uid()
        AND cm_fd.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    doctor_id IN (
      SELECT cm_d.user_id
      FROM public.clinic_memberships cm_fd
      JOIN public.clinic_memberships cm_d ON cm_d.clinic_id = cm_fd.clinic_id
      WHERE cm_fd.user_id = auth.uid()
        AND cm_fd.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS "Doctors can read their own queue" ON public.check_in_queue;
CREATE POLICY "Doctors can read their own queue"
  ON public.check_in_queue
  FOR SELECT
  USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can update their own queue" ON public.check_in_queue;
CREATE POLICY "Doctors can update their own queue"
  ON public.check_in_queue
  FOR UPDATE
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- 1.b  payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Frontdesk can manage payments for their clinic" ON public.payments;
CREATE POLICY "Frontdesk can manage payments for their clinic"
  ON public.payments
  FOR ALL
  USING (
    doctor_id IN (
      SELECT cm_d.user_id
      FROM public.clinic_memberships cm_fd
      JOIN public.clinic_memberships cm_d ON cm_d.clinic_id = cm_fd.clinic_id
      WHERE cm_fd.user_id = auth.uid()
        AND cm_fd.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    doctor_id IN (
      SELECT cm_d.user_id
      FROM public.clinic_memberships cm_fd
      JOIN public.clinic_memberships cm_d ON cm_d.clinic_id = cm_fd.clinic_id
      WHERE cm_fd.user_id = auth.uid()
        AND cm_fd.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS "Doctors can view their own payments" ON public.payments;
CREATE POLICY "Doctors can view their own payments"
  ON public.payments
  FOR SELECT
  USING (doctor_id = auth.uid());

-- 1.c  front_desk_staff
ALTER TABLE public.front_desk_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Front desk staff can read own record" ON public.front_desk_staff;
CREATE POLICY "Front desk staff can read own record"
  ON public.front_desk_staff
  FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Front desk staff can update own record" ON public.front_desk_staff;
CREATE POLICY "Front desk staff can update own record"
  ON public.front_desk_staff
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Clinic members can view frontdesk staff in same clinic" ON public.front_desk_staff;
CREATE POLICY "Clinic members can view frontdesk staff in same clinic"
  ON public.front_desk_staff
  FOR SELECT
  USING (
    clinic_id IN (
      SELECT cm.clinic_id
      FROM public.clinic_memberships cm
      WHERE cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
    )
  );

-- ----------------------------------------------------------------------------
-- Part 2: fix_otp_codes_rls_phone_based_records (tracking row 20260408145129)
-- ----------------------------------------------------------------------------
-- Replace the patient-id-only OTP policy with a phone-based one that covers
-- registration / password_reset / etc. The original SQL used a bare
-- DROP POLICY IF EXISTS — preserved verbatim; the CREATE POLICY is wrapped
-- with our own DROP POLICY IF EXISTS for re-runnability.

DROP POLICY IF EXISTS "Patients can view own otp" ON public.otp_codes;

DROP POLICY IF EXISTS "Users can view own phone-based otp" ON public.otp_codes;
CREATE POLICY "Users can view own phone-based otp"
  ON public.otp_codes
  FOR SELECT
  USING (
    phone IN (
      SELECT u.phone FROM public.users u WHERE u.id = auth.uid()
    )
  );

COMMIT;

-- ============================================================================
-- Smoke probe — assert all 9 policies are present and 3 tables have RLS on
-- ============================================================================

DO $$
DECLARE
  v_missing TEXT[];
BEGIN
  -- Verify all 9 policies exist on their target tables
  SELECT array_agg(expected.policyname || '@' || expected.tablename)
    INTO v_missing
  FROM (VALUES
    ('Frontdesk can manage queue for their clinic',     'check_in_queue'),
    ('Doctors can read their own queue',                'check_in_queue'),
    ('Doctors can update their own queue',              'check_in_queue'),
    ('Frontdesk can manage payments for their clinic',  'payments'),
    ('Doctors can view their own payments',             'payments'),
    ('Front desk staff can read own record',            'front_desk_staff'),
    ('Front desk staff can update own record',          'front_desk_staff'),
    ('Clinic members can view frontdesk staff in same clinic', 'front_desk_staff'),
    ('Users can view own phone-based otp',              'otp_codes')
  ) AS expected(policyname, tablename)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = expected.tablename
      AND p.policyname = expected.policyname
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'forensic mig 100 failed: missing policies after apply: %', v_missing;
  END IF;

  -- Verify RLS is enabled on the 3 tables this migration hardens
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('check_in_queue', 'payments', 'front_desk_staff')
      AND c.relrowsecurity = FALSE
  ) THEN
    RAISE EXCEPTION 'forensic mig 100 failed: RLS not enabled on one of check_in_queue/payments/front_desk_staff';
  END IF;

  RAISE NOTICE 'forensic mig 100 smoke probe: PASS (9 policies present, RLS enabled on 3 tables)';
END $$;
