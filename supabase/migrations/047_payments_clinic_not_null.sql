-- ============================================================================
-- Migration 047: Enforce payments.clinic_id NOT NULL
-- ============================================================================
--
-- Background
-- ----------
-- Investigation 2026-04-24 found 9 of 9 payments rows have clinic_id IS NULL.
-- All 9 belong to test/seed accounts (Phase4/4B/5/15/18/20 Doctor, "bla bla")
-- whose doctors have no ACTIVE clinic_memberships, so the standard backfill
-- (used by mig 045 for clinical_notes) cannot resolve them.
--
-- Root cause is two-layered, same shape as the clinical_notes regression:
--   1. data layer (data/frontdesk.ts:1010 createPayment) doesn't accept or
--      write clinic_id at all
--   2. API handler (handlers/frontdesk/payments/create/handler.ts) doesn't
--      resolve a clinic before calling createPayment, even though the
--      frontdesk-scope helper (getFrontdeskClinicId) is right there
-- The save-path layer is fixed in the same PR as this migration.
--
-- Cleanup decision: since 9/9 are unresolvable test rows with no real
-- patient data, we DELETE rather than backfill. This unblocks adding
-- NOT NULL, which preserves the multi-tenant scoping invariant the
-- analytics layer relies on (commit ed5aa2a).
--
-- Pre-flight (run 2026-04-24):
--   9 payments to delete
--   0 invoice_requests cascade-deleted
--   0 other tables affected
--
-- ON DELETE behavior of FKs referencing payments(id):
--   invoice_requests.payment_id → CASCADE (none affected today)
-- ============================================================================

-- 1. Delete the 9 unresolvable test payments
DELETE FROM public.payments
WHERE clinic_id IS NULL;

-- 2. Enforce the invariant going forward
ALTER TABLE public.payments
  ALTER COLUMN clinic_id SET NOT NULL;

-- 3. Document the constraint for future readers
COMMENT ON COLUMN public.payments.clinic_id IS
  'Owning clinic for this payment. NOT NULL — every payment is scoped to a '
  'clinic for analytics + multi-tenant RLS. Enforced at three layers: schema '
  '(this constraint), data layer (createPayment requires clinicId), and API '
  'handler (resolves clinic via getFrontdeskClinicId before calling). Test '
  'rows deleted in this migration; previously every payment in the table was '
  'a null-clinic test row.';
