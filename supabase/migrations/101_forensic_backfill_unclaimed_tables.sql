-- ============================================================================
-- Migration 101 — FORENSIC BACKFILL: 4 unclaimed tables + missing policies
--
-- Audit references:
--   * audits/database-audit/session-a-summary.md § "5 tables exist on staging
--     with no CREATE TABLE in any migration file"
--   * audits/database-audit/unclaimed-tables-usage.md (Session B classification)
--
-- Originated by: Audit Session C (2026-05-03)
--
-- Purpose
-- -------
-- Backfill the 4 ACTIVE unclaimed tables — `account_recovery_requests`,
-- `audit_log`, `phone_corrections`, `sms_reminders` — into the migration tree.
-- DDL is reproduced verbatim from
-- `audits/database-audit/staging-schema-2026-05-03.sql` (lines 78-92, 181-191,
-- 911-924, 1024-1039) plus constraints (lines 1154-1158, 1189, 1435-1441,
-- 1474-1479) and indexes (lines 1507-1546, 1777-1779, 1811-1816).
--
-- Also backfills `patient_phone_verification_issues` (lines 786-799) so that
-- mig 105 can drop a tracked-by-file table rather than a phantom one.
--
-- Per Session B finding (R3 + Session B § 4): `account_recovery_requests`
-- has RLS enabled but ZERO policies on staging. This migration adds an explicit
-- service-role-only ALL policy so the absence of policies is no longer a
-- silent gotcha.
--
-- WHY (audit finding)
-- -------------------
-- These tables exist on staging via SQL-editor applies. Without backfilling,
-- a fresh database reset would not recreate them. App code reads/writes them
-- (per Session B § 4): backfill is necessary for the migration tree to
-- describe actual production schema.
--
-- IDEMPOTENCY
-- -----------
--   * CREATE TABLE IF NOT EXISTS — body skipped if table already present
--   * ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS is NOT supported by
--     Postgres before 16; staging is 17.6, but for backwards compat we use
--     `DO $$ ... IF NOT EXISTS (pg_constraint) THEN ALTER TABLE ... ADD ...`
--     pattern.
--   * CREATE INDEX IF NOT EXISTS for indexes
--   * CREATE UNIQUE INDEX IF NOT EXISTS for the PK indexes (Postgres treats
--     these as the same constraint shape as PK).
--   * RLS-enable: ALTER TABLE ENABLE ROW LEVEL SECURITY is no-op when
--     already enabled.
--   * Policies use DROP POLICY IF EXISTS + CREATE POLICY pattern.
--
-- SMOKE PROBE
-- -----------
-- Final DO $$ asserts: 5 tables exist; key indexes exist; 5 expected policies
-- exist; the new service-role policy on `account_recovery_requests` is present.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. account_recovery_requests
-- Source: staging-schema-2026-05-03.sql:77-92, 1154-1158, 1507-1509
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_recovery_requests (
  id                   uuid NOT NULL DEFAULT uuid_generate_v4(),
  claimed_phone        text NOT NULL,
  claimed_patient_id   uuid,
  new_phone            text NOT NULL,
  status               text DEFAULT 'pending'::text,
  verification_method  text,
  verification_data    jsonb,
  reviewed_by          uuid,
  reviewed_at          timestamp with time zone,
  review_notes         text,
  created_at           timestamp with time zone DEFAULT now(),
  expires_at           timestamp with time zone DEFAULT (now() + '7 days'::interval),
  completed_at         timestamp with time zone,
  CONSTRAINT account_recovery_requests_pkey PRIMARY KEY (id),
  CONSTRAINT account_recovery_requests_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'verification_sent'::text, 'verified'::text,
                                'completed'::text, 'rejected'::text, 'expired'::text])),
  CONSTRAINT account_recovery_requests_verification_method_check
    CHECK (verification_method = ANY (ARRAY['email'::text, 'recovery_code'::text,
                                             'national_id'::text, 'manual_review'::text]))
);

-- FKs added separately so re-applies don't error if they already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'account_recovery_requests_claimed_patient_id_fkey'
  ) THEN
    ALTER TABLE public.account_recovery_requests
      ADD CONSTRAINT account_recovery_requests_claimed_patient_id_fkey
      FOREIGN KEY (claimed_patient_id) REFERENCES public.patients(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'account_recovery_requests_reviewed_by_fkey'
  ) THEN
    ALTER TABLE public.account_recovery_requests
      ADD CONSTRAINT account_recovery_requests_reviewed_by_fkey
      FOREIGN KEY (reviewed_by) REFERENCES public.users(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recovery_requests_phone
  ON public.account_recovery_requests USING btree (claimed_phone);
CREATE INDEX IF NOT EXISTS idx_recovery_requests_status
  ON public.account_recovery_requests USING btree (status);

ALTER TABLE public.account_recovery_requests ENABLE ROW LEVEL SECURITY;

-- New explicit service-role-only policy (Session B finding: 0 policies on staging).
DROP POLICY IF EXISTS "service_role_account_recovery" ON public.account_recovery_requests;
CREATE POLICY "service_role_account_recovery"
  ON public.account_recovery_requests
  FOR ALL
  USING (auth.role() = 'service_role'::text);


-- ----------------------------------------------------------------------------
-- 2. audit_log
-- Source: staging-schema-2026-05-03.sql:180-191, 1189, 1542-1546, policy 2026
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_log (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id        uuid,
  user_role      text,
  action         text NOT NULL,
  resource_type  text,
  resource_id    text,
  details        jsonb,
  ip_address     text,
  created_at     timestamp with time zone DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON public.audit_log USING btree (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created
  ON public.audit_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource
  ON public.audit_log USING btree (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user
  ON public.audit_log USING btree (user_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_audit_log" ON public.audit_log;
CREATE POLICY "service_role_audit_log"
  ON public.audit_log
  FOR ALL
  USING (auth.role() = 'service_role'::text);


-- ----------------------------------------------------------------------------
-- 3. phone_corrections
-- Source: staging-schema-2026-05-03.sql:910-924, 1435-1441, 1777-1779, policy 2944
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.phone_corrections (
  id                    uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id            uuid NOT NULL,
  old_phone             text NOT NULL,
  new_phone             text NOT NULL,
  reason                text NOT NULL,
  verification_method   text,
  initiated_by          text NOT NULL,
  initiated_by_user_id  uuid,
  status                text DEFAULT 'pending'::text,
  otp_hash              text,
  created_at            timestamp with time zone DEFAULT now(),
  completed_at          timestamp with time zone,
  CONSTRAINT phone_corrections_pkey PRIMARY KEY (id),
  CONSTRAINT phone_corrections_initiated_by_check
    CHECK (initiated_by = ANY (ARRAY['patient'::text, 'staff'::text, 'system'::text])),
  CONSTRAINT phone_corrections_reason_check
    CHECK (reason = ANY (ARRAY['entry_error'::text, 'patient_reported'::text,
                                'sms_failed'::text, 'duplicate_resolution'::text, 'other'::text])),
  CONSTRAINT phone_corrections_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'otp_sent'::text, 'completed'::text, 'cancelled'::text])),
  CONSTRAINT phone_corrections_verification_method_check
    CHECK (verification_method = ANY (ARRAY['otp_verified'::text, 'verbal_confirmation'::text,
                                             'national_id_verified'::text, 'admin_override'::text]))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'phone_corrections_initiated_by_user_id_fkey'
  ) THEN
    ALTER TABLE public.phone_corrections
      ADD CONSTRAINT phone_corrections_initiated_by_user_id_fkey
      FOREIGN KEY (initiated_by_user_id) REFERENCES public.users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'phone_corrections_patient_id_fkey'
  ) THEN
    ALTER TABLE public.phone_corrections
      ADD CONSTRAINT phone_corrections_patient_id_fkey
      FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_corrections_patient
  ON public.phone_corrections USING btree (patient_id);
CREATE INDEX IF NOT EXISTS idx_corrections_pending
  ON public.phone_corrections USING btree (status) WHERE (status = 'pending'::text);

ALTER TABLE public.phone_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage phone corrections" ON public.phone_corrections;
CREATE POLICY "Staff can manage phone corrections"
  ON public.phone_corrections
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role = ANY (ARRAY['doctor'::text, 'frontdesk'::text])
    )
  );


-- ----------------------------------------------------------------------------
-- 4. sms_reminders
-- Source: staging-schema-2026-05-03.sql:1023-1039, 1474-1479, 1811-1816, policy 3054
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sms_reminders (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id      uuid NOT NULL,
  appointment_id  uuid,
  clinic_id       uuid,
  phone_number    text NOT NULL,
  message_type    text NOT NULL,
  message_body    text NOT NULL,
  message_body_ar text,
  status          text DEFAULT 'pending'::text,
  twilio_sid      text,
  error_message   text,
  scheduled_for   timestamp with time zone,
  sent_at         timestamp with time zone,
  created_at      timestamp with time zone DEFAULT now(),
  CONSTRAINT sms_reminders_pkey PRIMARY KEY (id),
  CONSTRAINT sms_reminders_message_type_check
    CHECK (message_type = ANY (ARRAY['appointment_reminder'::text, 'followup'::text,
                                      'lab_ready'::text, 'custom'::text])),
  CONSTRAINT sms_reminders_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'failed'::text]))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sms_reminders_appointment_id_fkey'
  ) THEN
    ALTER TABLE public.sms_reminders
      ADD CONSTRAINT sms_reminders_appointment_id_fkey
      FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sms_reminders_clinic_id_fkey'
  ) THEN
    ALTER TABLE public.sms_reminders
      ADD CONSTRAINT sms_reminders_clinic_id_fkey
      FOREIGN KEY (clinic_id) REFERENCES public.clinics(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sms_reminders_patient_id_fkey'
  ) THEN
    ALTER TABLE public.sms_reminders
      ADD CONSTRAINT sms_reminders_patient_id_fkey
      FOREIGN KEY (patient_id) REFERENCES public.patients(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sms_reminders_appointment
  ON public.sms_reminders USING btree (appointment_id);
CREATE INDEX IF NOT EXISTS idx_sms_reminders_patient
  ON public.sms_reminders USING btree (patient_id);
CREATE INDEX IF NOT EXISTS idx_sms_reminders_scheduled
  ON public.sms_reminders USING btree (scheduled_for);
CREATE INDEX IF NOT EXISTS idx_sms_reminders_status
  ON public.sms_reminders USING btree (status);
CREATE INDEX IF NOT EXISTS idx_sms_reminders_type
  ON public.sms_reminders USING btree (message_type);

ALTER TABLE public.sms_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_sms" ON public.sms_reminders;
CREATE POLICY "service_role_sms"
  ON public.sms_reminders
  FOR ALL
  USING (auth.role() = 'service_role'::text);


-- ----------------------------------------------------------------------------
-- 5. patient_phone_verification_issues (orphan; tracked here so mig 105 drops
--    a known-tracked table; per R3 the table itself is dropped by mig 105).
-- Source: staging-schema-2026-05-03.sql:785-799, 1387-1391, 1736-1738, policy 2762
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.patient_phone_verification_issues (
  id                  uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id          uuid NOT NULL,
  phone               text NOT NULL,
  issue_type          text NOT NULL,
  error_message       text,
  error_code          text,
  resolved            boolean DEFAULT false,
  resolved_by         uuid,
  resolved_at         timestamp with time zone,
  resolution_action   text,
  resolution_notes    text,
  created_at          timestamp with time zone DEFAULT now(),
  CONSTRAINT patient_phone_verification_issues_pkey PRIMARY KEY (id),
  CONSTRAINT patient_phone_verification_issues_issue_type_check
    CHECK (issue_type = ANY (ARRAY['sms_delivery_failed'::text, 'otp_delivery_failed'::text,
                                    'patient_reported_wrong'::text, 'staff_flagged'::text,
                                    'duplicate_detected'::text])),
  CONSTRAINT patient_phone_verification_issues_resolution_action_check
    CHECK (resolution_action = ANY (ARRAY['phone_corrected'::text, 'verified_correct'::text,
                                           'account_merged'::text, 'dismissed'::text]))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patient_phone_verification_issues_patient_id_fkey'
  ) THEN
    ALTER TABLE public.patient_phone_verification_issues
      ADD CONSTRAINT patient_phone_verification_issues_patient_id_fkey
      FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patient_phone_verification_issues_resolved_by_fkey'
  ) THEN
    ALTER TABLE public.patient_phone_verification_issues
      ADD CONSTRAINT patient_phone_verification_issues_resolved_by_fkey
      FOREIGN KEY (resolved_by) REFERENCES public.users(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_phone_issues_patient
  ON public.patient_phone_verification_issues USING btree (patient_id);
CREATE INDEX IF NOT EXISTS idx_phone_issues_unresolved
  ON public.patient_phone_verification_issues USING btree (resolved, created_at DESC)
  WHERE (resolved = false);

ALTER TABLE public.patient_phone_verification_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view phone verification issues" ON public.patient_phone_verification_issues;
CREATE POLICY "Staff can view phone verification issues"
  ON public.patient_phone_verification_issues
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role = ANY (ARRAY['doctor'::text, 'frontdesk'::text])
    )
  );

COMMIT;

-- ============================================================================
-- Smoke probe — assert 5 tables, key indexes, 5 policies are present
-- ============================================================================

DO $$
DECLARE
  v_missing TEXT[];
BEGIN
  -- Tables
  SELECT array_agg(t)
    INTO v_missing
  FROM (VALUES
    ('account_recovery_requests'),
    ('audit_log'),
    ('phone_corrections'),
    ('sms_reminders'),
    ('patient_phone_verification_issues')
  ) AS expected(t)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = expected.t
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'forensic mig 101 failed: missing tables %', v_missing;
  END IF;

  -- Key indexes (one canonical index per table)
  SELECT array_agg(i)
    INTO v_missing
  FROM (VALUES
    ('idx_recovery_requests_status'),
    ('idx_audit_log_created'),
    ('idx_corrections_patient'),
    ('idx_sms_reminders_status'),
    ('idx_phone_issues_patient')
  ) AS expected(i)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = expected.i
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'forensic mig 101 failed: missing indexes %', v_missing;
  END IF;

  -- Policies
  SELECT array_agg(expected.policyname || '@' || expected.tablename)
    INTO v_missing
  FROM (VALUES
    ('service_role_account_recovery',           'account_recovery_requests'),
    ('service_role_audit_log',                  'audit_log'),
    ('Staff can manage phone corrections',      'phone_corrections'),
    ('service_role_sms',                        'sms_reminders'),
    ('Staff can view phone verification issues','patient_phone_verification_issues')
  ) AS expected(policyname, tablename)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = expected.tablename
      AND p.policyname = expected.policyname
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'forensic mig 101 failed: missing policies %', v_missing;
  END IF;

  RAISE NOTICE 'forensic mig 101 smoke probe: PASS (5 tables, 5 indexes, 5 policies present)';
END $$;
