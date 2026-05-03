-- ============================================================================
-- Rollback for migration 104 — FORENSIC DROP: unused PII columns
--
-- Re-adds the three dropped columns as nullable with no DEFAULT. Does NOT
-- re-populate any data — the columns were 100% NULL on staging at the time
-- of mig 104's apply (per pre-drop assertion).
--
-- This rollback exists for procedural completeness. If the dropped columns
-- need to be reintroduced for a real product reason, prefer a forward
-- migration that ADDs them with the correct constraints/indexes for the
-- new use case rather than reverting via this file.
-- ============================================================================

BEGIN;

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS national_id_hash  text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS national_id_last4 text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS phone_verified_at timestamp with time zone;

COMMIT;
