-- ============================================================================
-- Rollback for migration 103 — FORENSIC BACKFILL: keep patients.email
--
-- WARNING: dropping `patients.email` is data-lossy. As of 2026-05-03, 1 of
-- 38 rows on staging has a non-null email value. Running this rollback
-- discards that value irrevocably.
--
-- Run only for emergency revert.
-- ============================================================================

BEGIN;

ALTER TABLE public.patients DROP COLUMN IF EXISTS email;

COMMIT;
