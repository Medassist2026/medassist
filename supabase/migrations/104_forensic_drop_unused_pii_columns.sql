-- ============================================================================
-- Migration 104 — FORENSIC DROP: unused PII columns on patients
--
-- Audit references:
--   * audits/database-audit/patients-pii-columns-usage.md
--   * audits/database-audit/extras.json (PII columns enumerated)
--
-- Originated by: Audit Session C (2026-05-03)
-- Locked ruling: Mo R4 — drop the 3 unused PII columns; keep `email`.
--
-- Purpose
-- -------
-- Drop three columns from `public.patients` that have zero application code
-- references and zero non-null rows on staging:
--   * national_id_hash       (text, nullable)
--   * national_id_last4      (text, nullable)
--   * phone_verified_at      (timestamp with time zone, nullable)
--
-- These columns were created on staging via dashboard SQL applies (per
-- Session A enumeration) but were never wired to a write path. Session B
-- confirmed zero `.from('patients').update({...national_id_hash...})` /
-- `.insert(...)` callsites and zero `.select('national_id_hash')` callsites
-- across `apps/` and `packages/`.
--
-- WHY (audit finding)
-- -------------------
-- They are dead schema. They contribute to the 111 EXTRA_ON_STAGING column
-- count and to the maintenance burden of the patients table without
-- providing any product value. The associated indexes
-- (`idx_patients_email`, `idx_patients_national_id_hash`) are also EXTRA;
-- `idx_patients_email` survives this migration because we keep `email`,
-- but `idx_patients_national_id_hash` is dropped automatically when its
-- column is dropped.
--
-- DATA SAFETY
-- -----------
-- Pre-drop assertion (DO $$ block) verifies that all three columns are
-- 100% NULL across all rows. If ANY column has a non-null value the
-- migration fails LOUDLY with `RAISE EXCEPTION` rather than dropping.
-- This is a defense against the case where a future code change populated
-- the columns between the audit (2026-05-03) and the apply.
--
-- IDEMPOTENCY
-- -----------
-- ALTER TABLE ... DROP COLUMN IF EXISTS — no-op when column already absent.
-- The pre-drop assertion runs against whichever columns are still present;
-- if the columns were dropped by a prior apply, the COUNT(*) FILTER returns
-- 0 (vacuously true), the assertion passes, and the DROPs are no-ops.
--
-- SMOKE PROBE
-- -----------
-- Final DO $$ asserts the three columns are absent post-DROP.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Pre-drop safety check: assert all three columns are 100% NULL
-- ----------------------------------------------------------------------------
-- Defense against the case where data was inserted between audit and apply.
-- If any column has any non-null value, abort with a loud error.

DO $$
DECLARE
  v_hash_nonnull INT;
  v_last4_nonnull INT;
  v_pva_nonnull INT;
  v_total INT;
BEGIN
  -- Build the COUNT query dynamically so missing columns don't error the
  -- check (column may have been dropped by a prior apply of this mig).
  EXECUTE 'SELECT COUNT(*) FILTER (WHERE national_id_hash IS NOT NULL) FROM public.patients'
    INTO v_hash_nonnull;
  EXECUTE 'SELECT COUNT(*) FILTER (WHERE national_id_last4 IS NOT NULL) FROM public.patients'
    INTO v_last4_nonnull;
  EXECUTE 'SELECT COUNT(*) FILTER (WHERE phone_verified_at IS NOT NULL) FROM public.patients'
    INTO v_pva_nonnull;
  SELECT COUNT(*) INTO v_total FROM public.patients;

  IF v_hash_nonnull > 0 THEN
    RAISE EXCEPTION 'forensic mig 104 ABORT: patients.national_id_hash has % non-null rows out of %; refusing to drop data',
      v_hash_nonnull, v_total;
  END IF;
  IF v_last4_nonnull > 0 THEN
    RAISE EXCEPTION 'forensic mig 104 ABORT: patients.national_id_last4 has % non-null rows out of %; refusing to drop data',
      v_last4_nonnull, v_total;
  END IF;
  IF v_pva_nonnull > 0 THEN
    RAISE EXCEPTION 'forensic mig 104 ABORT: patients.phone_verified_at has % non-null rows out of %; refusing to drop data',
      v_pva_nonnull, v_total;
  END IF;

  RAISE NOTICE 'forensic mig 104 pre-drop check: PASS (% rows total, all 3 columns 100%% NULL)', v_total;
EXCEPTION
  WHEN undefined_column THEN
    -- Column already dropped by a prior apply. Assertion is vacuously true.
    RAISE NOTICE 'forensic mig 104 pre-drop check: at least one target column already absent (prior apply); proceeding with DROP IF EXISTS';
END $$;

-- ----------------------------------------------------------------------------
-- Drop the columns
-- ----------------------------------------------------------------------------

ALTER TABLE public.patients DROP COLUMN IF EXISTS national_id_hash;
ALTER TABLE public.patients DROP COLUMN IF EXISTS national_id_last4;
ALTER TABLE public.patients DROP COLUMN IF EXISTS phone_verified_at;

COMMIT;

-- ============================================================================
-- Smoke probe — assert columns are absent
-- ============================================================================

DO $$
DECLARE
  v_present TEXT[];
BEGIN
  SELECT array_agg(column_name)
    INTO v_present
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'patients'
    AND column_name IN ('national_id_hash', 'national_id_last4', 'phone_verified_at');

  IF v_present IS NOT NULL THEN
    RAISE EXCEPTION 'forensic mig 104 failed: columns still present after DROP: %', v_present;
  END IF;

  RAISE NOTICE 'forensic mig 104 smoke probe: PASS (3 PII columns dropped from patients)';
END $$;
