-- ============================================================================
-- Rollback for migration 102 — FORENSIC BACKFILL: helper functions + triggers
--
-- WARNING: this rollback drops 3 triggers and 6 functions. The trigger drops
-- have observable behavioral consequences:
--
--   * Dropping `update_patient_activity_on_appointment` and
--     `update_patient_activity_on_note` stops `patients.last_activity_at`
--     from being touched on appointment/note INSERT — `mark_dormant_accounts`
--     starts marking active patients as dormant prematurely.
--   * Dropping `update_patient_records_updated_at` leaves
--     `patient_medical_records.updated_at` stale on UPDATE.
--
-- Run only for emergency revert.
-- ============================================================================

BEGIN;

-- Triggers first (drop bindings before functions)
DROP TRIGGER IF EXISTS update_patient_activity_on_appointment ON public.appointments;
DROP TRIGGER IF EXISTS update_patient_activity_on_note         ON public.clinical_notes;
DROP TRIGGER IF EXISTS update_patient_records_updated_at       ON public.patient_medical_records;

-- Functions
DROP FUNCTION IF EXISTS public.mark_dormant_accounts();
DROP FUNCTION IF EXISTS public.is_account_dormant(timestamp with time zone);
DROP FUNCTION IF EXISTS public.create_sharing_preferences_after_appointment();
DROP FUNCTION IF EXISTS public.create_conversation_after_appointment();
DROP FUNCTION IF EXISTS public.update_patient_activity();
DROP FUNCTION IF EXISTS public.cleanup_expired_verification_data();

COMMIT;
