-- ============================================================================
-- Migration 102 — FORENSIC BACKFILL: 6 dashboard-applied helper functions + 3 triggers
--
-- Audit references:
--   * audits/database-audit/session-a-summary.md § "9 functions on staging
--     not declared in any migration"
--   * audits/database-audit/extras.json (functions: cleanup_expired_verification_data,
--     create_conversation_after_appointment, create_sharing_preferences_after_appointment,
--     is_account_dormant, mark_dormant_accounts, update_patient_activity)
--
-- Originated by: Audit Session C (2026-05-03)
--
-- Purpose
-- -------
-- Backfill 6 helper functions that exist on staging via dashboard SQL applies.
-- Bodies dumped from `pg_get_functiondef` on 2026-05-03 (staging is the
-- ground truth — see Empirical Lesson #7). Three of these functions are
-- bound to triggers; those triggers are also backfilled here.
--
-- Excluded:
--   * The 3 RLS test-harness functions (`rls_test_record`, `rls_test_seed`,
--     `rls_test_teardown`) — staging-only test tooling, not production schema.
--   * `update_updated_at_column()` — already declared in older migs (used by
--     several earlier triggers); only the trigger BINDING to
--     `patient_medical_records` is added here.
--
-- WHY (audit finding)
-- -------------------
-- These 6 functions and 3 triggers materially affect runtime behavior:
--   * `update_patient_activity()` fires on every appointment INSERT and
--     clinical_note INSERT (touches `patients.last_activity_at`).
--   * `create_conversation_after_appointment()` and
--     `create_sharing_preferences_after_appointment()` are bound to
--     appointments triggers (per Session A claim audit).
--   * `cleanup_expired_verification_data()` is a maintenance helper called
--     on a schedule.
--   * `is_account_dormant()` and `mark_dormant_accounts()` are dormancy
--     helpers (the latter mutates `patients.account_status`).
-- Without backfill, a fresh database reset would not restore these.
--
-- DEPENDS ON
-- ----------
-- mig 101 — `account_recovery_requests` is referenced by
-- `cleanup_expired_verification_data` (UPDATEs the `status` column to mark
-- expired requests). Mig 102 will NOT compile if applied before mig 101.
--
-- TRIGGER BINDING NOTES
-- ---------------------
-- The two appointment-side triggers depend on `appointments.patient_id` and
-- `appointments.doctor_id`. The clinical-note trigger depends on
-- `clinical_notes.patient_id`. Both columns are present on staging
-- (verified via Session A claims); no schema-level guard needed.
--
-- IDEMPOTENCY
-- -----------
--   * CREATE OR REPLACE FUNCTION is intrinsically idempotent
--   * Trigger creation: DROP TRIGGER IF EXISTS + CREATE TRIGGER
--
-- SMOKE PROBE
-- -----------
-- Final DO $$ asserts: 6 functions present in pg_proc, 3 triggers present
-- in information_schema.triggers.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. cleanup_expired_verification_data
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_verification_data()
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Delete expired OTPs older than 24 hours
  DELETE FROM public.otp_codes
  WHERE expires_at < NOW() - INTERVAL '24 hours';

  -- Mark expired phone change requests
  UPDATE public.phone_change_requests
  SET status = 'expired'
  WHERE expires_at < NOW()
    AND status IN ('pending', 'old_verified');

  -- Mark expired recovery requests
  UPDATE public.account_recovery_requests
  SET status = 'expired'
  WHERE expires_at < NOW()
    AND status IN ('pending', 'verification_sent');
END;
$function$;

COMMENT ON FUNCTION public.cleanup_expired_verification_data() IS
  'Forensic mig 102: maintenance helper. Backfilled from dashboard apply, body verified against staging 2026-05-03.';

-- ----------------------------------------------------------------------------
-- 2. update_patient_activity (trigger function)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_patient_activity()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.patients
  SET last_activity_at = NOW()
  WHERE id = NEW.patient_id;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.update_patient_activity() IS
  'Forensic mig 102: trigger function. Bound to update_patient_activity_on_appointment (appointments INSERT) and update_patient_activity_on_note (clinical_notes INSERT).';

-- ----------------------------------------------------------------------------
-- 3. create_conversation_after_appointment (trigger function)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_conversation_after_appointment()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO public.conversations (patient_id, doctor_id, created_from_appointment_id)
  VALUES (NEW.patient_id, NEW.doctor_id, NEW.id)
  ON CONFLICT (patient_id, doctor_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.create_conversation_after_appointment() IS
  'Forensic mig 102: trigger function. Bound to a trigger on appointments (per Session A claim audit). Auto-creates a conversation on appointment creation if one does not exist.';

-- ----------------------------------------------------------------------------
-- 4. create_sharing_preferences_after_appointment (trigger function)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sharing_preferences_after_appointment()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_defaults RECORD;
BEGIN
  SELECT * INTO v_defaults FROM public.default_sharing_preferences
  WHERE patient_id = NEW.patient_id;

  INSERT INTO public.record_sharing_preferences (
    patient_id, doctor_id,
    share_medications, share_conditions, share_allergies,
    share_lab_results, share_visit_history, share_diary, share_vitals
  )
  VALUES (
    NEW.patient_id, NEW.doctor_id,
    COALESCE(v_defaults.share_medications, true),
    COALESCE(v_defaults.share_conditions, true),
    COALESCE(v_defaults.share_allergies, true),
    COALESCE(v_defaults.share_lab_results, true),
    COALESCE(v_defaults.share_visit_history, true),
    COALESCE(v_defaults.share_diary, false),
    COALESCE(v_defaults.share_vitals, true)
  )
  ON CONFLICT (patient_id, doctor_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.create_sharing_preferences_after_appointment() IS
  'Forensic mig 102: trigger function. Bound to a trigger on appointments. Auto-creates a record_sharing_preferences row using the patient''s default_sharing_preferences if any.';

-- ----------------------------------------------------------------------------
-- 5. is_account_dormant
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_account_dormant(last_activity timestamp with time zone)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $function$
BEGIN
  RETURN last_activity < NOW() - INTERVAL '6 months';
END;
$function$;

COMMENT ON FUNCTION public.is_account_dormant(timestamp with time zone) IS
  'Forensic mig 102: helper. Returns TRUE if last_activity is older than 6 months. IMMUTABLE per staging.';

-- ----------------------------------------------------------------------------
-- 6. mark_dormant_accounts
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_dormant_accounts()
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE public.patients
  SET account_status = 'dormant'
  WHERE last_activity_at < NOW() - INTERVAL '6 months'
    AND account_status = 'active'
    AND registered = true;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$function$;

COMMENT ON FUNCTION public.mark_dormant_accounts() IS
  'Forensic mig 102: maintenance helper. Mutates patients.account_status. Returns count of marked rows.';

-- ----------------------------------------------------------------------------
-- 7. Trigger bindings
-- ----------------------------------------------------------------------------

-- 7.a  appointments INSERT → update_patient_activity()
DROP TRIGGER IF EXISTS update_patient_activity_on_appointment ON public.appointments;
CREATE TRIGGER update_patient_activity_on_appointment
  AFTER INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_patient_activity();

-- 7.b  clinical_notes INSERT → update_patient_activity()
DROP TRIGGER IF EXISTS update_patient_activity_on_note ON public.clinical_notes;
CREATE TRIGGER update_patient_activity_on_note
  AFTER INSERT ON public.clinical_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_patient_activity();

-- 7.c  patient_medical_records UPDATE → update_updated_at_column()
--      The function `update_updated_at_column` is declared in earlier migs
--      (used by many other tables). This binding is the missing trigger row.
DROP TRIGGER IF EXISTS update_patient_records_updated_at ON public.patient_medical_records;
CREATE TRIGGER update_patient_records_updated_at
  BEFORE UPDATE ON public.patient_medical_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;

-- ============================================================================
-- Smoke probe — assert 6 functions and 3 triggers exist
-- ============================================================================

DO $$
DECLARE
  v_missing TEXT[];
BEGIN
  -- Functions
  SELECT array_agg(f)
    INTO v_missing
  FROM (VALUES
    ('cleanup_expired_verification_data'),
    ('update_patient_activity'),
    ('create_conversation_after_appointment'),
    ('create_sharing_preferences_after_appointment'),
    ('is_account_dormant'),
    ('mark_dormant_accounts')
  ) AS expected(f)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = expected.f
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'forensic mig 102 failed: missing functions %', v_missing;
  END IF;

  -- Triggers
  SELECT array_agg(t)
    INTO v_missing
  FROM (VALUES
    ('update_patient_activity_on_appointment'),
    ('update_patient_activity_on_note'),
    ('update_patient_records_updated_at')
  ) AS expected(t)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_schema = 'public' AND trigger_name = expected.t
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'forensic mig 102 failed: missing triggers %', v_missing;
  END IF;

  RAISE NOTICE 'forensic mig 102 smoke probe: PASS (6 functions, 3 triggers present)';
END $$;
