-- ============================================================================
-- Migration 046: Enforce clinical_notes.clinic_id NOT NULL
-- ============================================================================
--
-- Background
-- ----------
-- Migration 045 backfilled clinical_notes.clinic_id from each doctor's
-- earliest ACTIVE clinic_membership. 33 of 56 NULL rows resolved. The
-- remaining 23 belong to test/seed accounts (Phase5/7/8/14 Doctor, Dr
-- Session Holder/Phase2/Phase2C, plus 4 from Jan 25 with NULL doctor_name)
-- whose doctors have zero ACTIVE memberships, so the backfill could not
-- assign them a clinic. All are bound to test patients (Phase5 Patient,
-- Patient Smoke, Patient Phase2 Smoke, etc., or NULL) — no real patient
-- data is touched.
--
-- This migration finishes the cleanup so the column can be NOT NULL,
-- which closes the architectural hole that allowed commit ed5aa2a's
-- clinic-scoped queries to silently drop rows.
--
-- Pre-flight (run 2026-04-24 against mtmdotixlhwksyoordbl):
--   23 clinical_notes will be deleted
--   15 medication_reminders cascade-delete (all for test patients)
--    0 prescription_items / lab_orders / payments / vital_signs touched
--
-- ON DELETE behavior of FKs referencing clinical_notes(id):
--   medication_reminders.clinical_note_id  → CASCADE  (auto-deleted)
--   prescription_items.clinical_note_id    → CASCADE  (none affected)
--   lab_orders.clinical_note_id            → SET NULL (none affected)
--   payments.clinical_note_id              → SET NULL (none affected)
--   vital_signs.clinical_note_id           → SET NULL (none affected)
--
-- Save-path enforcement (out-of-band, deployed alongside this):
--   - apps API handler returns 400 NO_ACTIVE_CLINIC if no clinic resolves
--   - data layer's createClinicalNote requires clinicId at the type level
--     and throws at runtime as defense-in-depth
-- ============================================================================

-- 1. Delete the 23 unresolvable test/seed rows (cascades to medication_reminders)
DELETE FROM public.clinical_notes
WHERE clinic_id IS NULL;

-- 2. Enforce the invariant going forward
ALTER TABLE public.clinical_notes
  ALTER COLUMN clinic_id SET NOT NULL;

-- 3. Update the column comment to reflect the new state
COMMENT ON COLUMN public.clinical_notes.clinic_id IS
  'Owning clinic for this note. NOT NULL — every clinical note has a clinic. '
  'Enforced at three layers: schema (this constraint), data layer '
  '(CreateClinicalNoteParams.clinicId is required), and API handler '
  '(returns 400 NO_ACTIVE_CLINIC if no clinic resolves). Backfilled in '
  'migration 045; NOT NULL added in 046 after deleting unresolvable test rows.';
