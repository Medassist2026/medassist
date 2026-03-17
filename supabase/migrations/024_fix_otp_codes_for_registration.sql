-- ============================================================================
-- Migration 024: Fix OTP Codes Table for Registration Flow
-- Problem: otp_codes requires patient_id NOT NULL, but during registration
-- no patient exists yet. Also missing columns: phone, code_hash, used, attempts.
-- ============================================================================

-- Make patient_id nullable (registration OTPs don't have a patient yet)
ALTER TABLE public.otp_codes
  ALTER COLUMN patient_id DROP NOT NULL;

-- Add phone column for phone-based OTP lookup (registration + login)
ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Add code_hash for backward compat (mirrors otp_hash)
ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS code_hash TEXT;

-- Add used flag
ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS used BOOLEAN NOT NULL DEFAULT false;

-- Add attempt tracking
ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5;

-- Add used_at timestamp (alias for consumed_at)
ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

-- Index for phone-based lookups (registration/login flow)
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_purpose
  ON public.otp_codes(phone, purpose, expires_at DESC)
  WHERE used = false;

-- Drop the old RLS policy that required patient_id = auth.uid()
-- Service role (admin client) bypasses RLS, so OTP operations still work
DROP POLICY IF EXISTS "Patients can view own otp" ON public.otp_codes;

-- New policy: patients can view OTPs linked to their patient_id
CREATE POLICY "Patients can view own otp"
ON public.otp_codes FOR SELECT
USING (patient_id IS NOT NULL AND patient_id = auth.uid());

-- Service role policy: admin can manage all OTPs (used by send-otp API)
-- Note: service_role already bypasses RLS, this is just for documentation
