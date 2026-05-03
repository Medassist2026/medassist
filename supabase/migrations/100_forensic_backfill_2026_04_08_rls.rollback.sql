-- ============================================================================
-- Rollback for migration 100 — FORENSIC BACKFILL: 2026-04-08 RLS hardening fixes
--
-- WARNING: this rollback removes 9 RLS policies and disables RLS on 3 tables
-- (check_in_queue, payments, front_desk_staff). Without those policies the
-- listed tables become DENY-ALL to authenticated users; with RLS disabled
-- they become readable by anyone holding a connection.
--
-- This rollback is for emergency revert only. DO NOT run unless mig 100
-- itself caused a regression that cannot be patched forward.
-- ============================================================================

BEGIN;

-- Drop the 9 policies created by mig 100
DROP POLICY IF EXISTS "Frontdesk can manage queue for their clinic"          ON public.check_in_queue;
DROP POLICY IF EXISTS "Doctors can read their own queue"                     ON public.check_in_queue;
DROP POLICY IF EXISTS "Doctors can update their own queue"                   ON public.check_in_queue;
DROP POLICY IF EXISTS "Frontdesk can manage payments for their clinic"       ON public.payments;
DROP POLICY IF EXISTS "Doctors can view their own payments"                  ON public.payments;
DROP POLICY IF EXISTS "Front desk staff can read own record"                 ON public.front_desk_staff;
DROP POLICY IF EXISTS "Front desk staff can update own record"               ON public.front_desk_staff;
DROP POLICY IF EXISTS "Clinic members can view frontdesk staff in same clinic" ON public.front_desk_staff;
DROP POLICY IF EXISTS "Users can view own phone-based otp"                   ON public.otp_codes;

-- Restore the prior incomplete OTP policy.
-- (Original mig 100 dropped this. We recreate it to return to pre-2026-04-08
-- state. The body is the patient-id-only filter that the 2026-04-08 fix
-- replaced.)
CREATE POLICY "Patients can view own otp"
  ON public.otp_codes
  FOR SELECT
  USING (patient_id = auth.uid());

-- Disable RLS on the three tables that this mig hardened.
-- WARNING: this exposes the tables to all authenticated reads.
ALTER TABLE public.check_in_queue   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.front_desk_staff DISABLE ROW LEVEL SECURITY;

COMMIT;
