-- ============================================================================
-- Rollback for migration 101 — FORENSIC BACKFILL: 4 unclaimed tables
--
-- WARNING: this rollback DROPs the 4 backfilled tables (CASCADE) plus the
-- orphan `patient_phone_verification_issues` table. Any rows in those tables
-- will be lost. As of 2026-05-03, row counts on staging are:
--
--   account_recovery_requests:           0 rows
--   audit_log:                          19 rows  ← lossy rollback
--   phone_corrections:                   0 rows
--   sms_reminders:                       4 rows  ← lossy rollback
--   patient_phone_verification_issues:   0 rows
--
-- DO NOT run unless mig 101 itself caused a regression. The application code
-- in `packages/shared/lib/audit/logger.ts` and `packages/shared/lib/sms/`
-- writes to `audit_log` and `sms_reminders` continuously; running this
-- rollback drops the receiving tables under the writers.
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS public.patient_phone_verification_issues CASCADE;
DROP TABLE IF EXISTS public.sms_reminders                      CASCADE;
DROP TABLE IF EXISTS public.phone_corrections                  CASCADE;
DROP TABLE IF EXISTS public.audit_log                          CASCADE;
DROP TABLE IF EXISTS public.account_recovery_requests          CASCADE;

COMMIT;
