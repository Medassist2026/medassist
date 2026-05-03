-- ============================================================================
-- Migration 105 — FORENSIC DROP: patient_phone_verification_issues (orphan table)
--
-- Audit references:
--   * audits/database-audit/unclaimed-tables-usage.md § 3
--     ("NO REFERENCES — preservation value: LOW")
--   * audits/database-audit/session-b-summary.md § 4 verdict matrix
--
-- Originated by: Audit Session C (2026-05-03)
-- Locked ruling: Mo R3 — drop the orphan table.
--
-- Purpose
-- -------
-- Drop `public.patient_phone_verification_issues`. Session B confirmed zero
-- application code references (no `.from('patient_phone_verification_issues')`
-- callsites in apps/ or packages/), zero writers, zero readers. The table
-- exists on staging via a dashboard SQL apply but no code path uses it.
--
-- Mig 101 backfilled the table's DDL into the migration tree as part of
-- bringing all 5 unclaimed tables into the file system. Mig 105 then drops
-- the orphan one.
--
-- WHY (audit finding)
-- -------------------
-- It is dead schema. Likely scaffolding for an admin "review issues with
-- patient phone verification" surface that was never built. Schema +
-- 1 RLS policy + 2 indexes contributing to staging surface area with no
-- product value.
--
-- DATA SAFETY
-- -----------
-- Pre-drop assertion: row count must be 0. If any row exists at apply time
-- (i.e., something started writing here between 2026-05-03 audit and apply),
-- the migration fails LOUDLY with `RAISE EXCEPTION` rather than dropping
-- the data.
--
-- ORDER NOTE
-- ----------
-- This migration MUST run after mig 101 (which backfilled the policy + DDL).
-- Sequence: forensic mig 101 → 102 → 103 → 104 → 105. Mig 105 is intentionally
-- the last forensic mig in the 100-105 sequence.
--
-- IDEMPOTENCY
-- -----------
-- DROP POLICY IF EXISTS + DROP TABLE IF EXISTS — both no-op if already absent.
-- The pre-drop row-count assertion runs against the table only if it exists;
-- if the table was already dropped by a prior apply, the EXISTS check skips
-- the assertion.
--
-- SMOKE PROBE
-- -----------
-- Final DO $$ asserts the table is absent post-DROP.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Pre-drop safety check: row count must be 0
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_rows INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'patient_phone_verification_issues'
  ) THEN
    EXECUTE 'SELECT COUNT(*) FROM public.patient_phone_verification_issues'
      INTO v_rows;

    IF v_rows > 0 THEN
      RAISE EXCEPTION 'forensic mig 105 ABORT: patient_phone_verification_issues has % rows; refusing to drop data', v_rows;
    END IF;

    RAISE NOTICE 'forensic mig 105 pre-drop check: PASS (table empty)';
  ELSE
    RAISE NOTICE 'forensic mig 105 pre-drop check: table already absent (prior apply)';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Drop the policy first, then the table
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Staff can view phone verification issues"
  ON public.patient_phone_verification_issues;

DROP TABLE IF EXISTS public.patient_phone_verification_issues;

COMMIT;

-- ============================================================================
-- Smoke probe — assert the table is absent
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'patient_phone_verification_issues'
  ) THEN
    RAISE EXCEPTION 'forensic mig 105 failed: patient_phone_verification_issues still present after DROP';
  END IF;
  RAISE NOTICE 'forensic mig 105 smoke probe: PASS (orphan table dropped)';
END $$;
