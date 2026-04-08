-- ============================================================================
-- Migration 041: Fix otp_codes purpose CHECK constraint
--
-- Problem: The otp_codes table has a CHECK constraint that only allows old
-- purposes from the original schema. The auth flow uses 'registration',
-- 'password_reset', and 'reset_token' — all of which fail the check silently,
-- making the reset password flow and registration OTPs non-functional.
--
-- Fix: Replace the restrictive constraint with one that includes all purposes
-- used by the application code.
-- ============================================================================

-- Drop the old restrictive constraint
ALTER TABLE public.otp_codes
  DROP CONSTRAINT IF EXISTS otp_codes_purpose_check;

-- Add updated constraint that includes all purposes used by the app
ALTER TABLE public.otp_codes
  ADD CONSTRAINT otp_codes_purpose_check
  CHECK (purpose = ANY (ARRAY[
    'phone_verification'::text,
    'phone_change_old'::text,
    'phone_change_new'::text,
    'phone_correction'::text,
    'account_recovery'::text,
    'login'::text,
    'registration'::text,
    'password_reset'::text,
    'reset_token'::text
  ]));
