-- ============================================================================
-- Migration 103 — FORENSIC BACKFILL: keep patients.email (declarative)
--
-- Audit references:
--   * audits/database-audit/patients-pii-columns-usage.md (Session B verdict)
--   * audits/database-audit/extras.json (PII columns enumerated)
--
-- Originated by: Audit Session C (2026-05-03)
-- Locked ruling: Mo R4 — keep `patients.email`; drop the other 3 PII columns
-- in mig 104.
--
-- Purpose
-- -------
-- Bring the migration tree into alignment with staging for the one PII column
-- that is being preserved: `patients.email`. The column already exists on
-- staging via dashboard SQL apply (per Session A enumeration). This migration
-- declares it via a forensic file so a fresh database reset would recreate it.
--
-- Mig 104 (next) drops the OTHER three PII columns
-- (`national_id_hash`, `national_id_last4`, `phone_verified_at`) which have
-- zero app references on the write side and zero data on staging.
--
-- WHY (audit finding)
-- -------------------
-- Session B § 5 verdict: `patients.email` is "DEAD on the write side, EXPOSED
-- on the read side via doctor/patients/[id]/handler.ts". Always NULL today
-- (1 of 38 rows non-null on staging at audit time, per § 1 of forensic-fix-plan.md).
-- The doctor handler returns `patient.email` to authenticated doctors, so
-- the column is exposed even if never populated by app code.
--
-- DEFERRED to Phase F follow-up: either
--   (a) drop `patients.email` and remove the field from the doctor handler's
--       response, OR
--   (b) wire a write path for `patients.email` and scope the doctor read.
-- Either way, the decision is product/architecture work outside Session C.
--
-- IDEMPOTENCY
-- -----------
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS — no-op when column exists.
--
-- SMOKE PROBE
-- -----------
-- Final DO $$ asserts column presence in information_schema.columns.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- patients.email — preserve. Per Session A enumeration, this column already
-- exists on staging (text, nullable, no DEFAULT). The IF NOT EXISTS guard
-- makes this migration safely re-runnable and ensures a fresh DB reset
-- restores the column.
-- ----------------------------------------------------------------------------

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.patients.email IS
  'Forensic mig 103 (preserved per R4 2026-05-03). Currently exposed via doctor/patients/[id]/handler.ts but never written by app code. Phase F follow-up: scope or drop. See audits/database-audit/patients-pii-columns-usage.md.';

-- ----------------------------------------------------------------------------
-- DELIBERATELY EXCLUDED from this migration (per R4):
--   * patients.national_id_hash      → dropped in mig 104
--   * patients.national_id_last4     → dropped in mig 104
--   * patients.phone_verified_at     → dropped in mig 104
-- These three columns have zero app code references, zero non-null rows on
-- staging, and represent a half-built hashed-PII storage scheme that was
-- never wired. Mig 104 drops them with safety assertions.
-- ----------------------------------------------------------------------------

COMMIT;

-- ============================================================================
-- Smoke probe — assert patients.email is present
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'patients'
      AND column_name = 'email'
  ) THEN
    RAISE EXCEPTION 'forensic mig 103 failed: patients.email not present after apply';
  END IF;
  RAISE NOTICE 'forensic mig 103 smoke probe: PASS (patients.email preserved)';
END $$;
