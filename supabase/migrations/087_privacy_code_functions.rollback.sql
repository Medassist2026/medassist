-- ============================================================================
-- Rollback for mig 087 — Privacy code SECURITY DEFINER functions
-- Drops in reverse dependency order. Idempotent.
-- ============================================================================

DROP FUNCTION IF EXISTS public.verify_sms_code(TEXT, TEXT, UUID, UUID, INET, TEXT, UUID);
DROP FUNCTION IF EXISTS public.initiate_sms_share(TEXT, UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.check_phone_uniform(TEXT);
DROP FUNCTION IF EXISTS public.verify_privacy_code(TEXT, TEXT, UUID, UUID, INET, TEXT, UUID);
DROP FUNCTION IF EXISTS public.regenerate_privacy_code(UUID);
DROP FUNCTION IF EXISTS public.record_privacy_code_attempt(UUID, UUID, UUID, UUID, privacy_code_attempt_result, INET, TEXT, UUID);
DROP FUNCTION IF EXISTS public._generate_sms_code_plaintext();
DROP FUNCTION IF EXISTS public._generate_privacy_code_plaintext();
