-- ============================================================================
-- Rollback for mig 086 — privacy_code_sms_tokens
-- Idempotent.
-- ============================================================================

DROP TABLE IF EXISTS public.privacy_code_sms_tokens CASCADE;
