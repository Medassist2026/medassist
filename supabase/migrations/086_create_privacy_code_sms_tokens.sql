-- ============================================================================
-- Migration 086 — privacy_code_sms_tokens (5-minute SMS share codes)
--
-- Schema spec didn't pre-define this table; designed in Prompt 4 launch
-- per the spec's design principles (production-shape, atomic, RLS DENY-ALL
-- placeholder until Prompt 6).
-- Implements ORPH-V4-03.
--
-- WHY THIS TABLE
--   When a patient doesn't have the patient app yet (or doesn't have
--   their privacy code at hand), front-desk can trigger a 4-digit SMS
--   that the patient reads back. The 4-digit choice (vs 6) is
--   deliberate — patients read these aloud over a phone call, and
--   short codes reduce read-back error.
--
-- LIFECYCLE
--   - Mint via initiate_sms_share (mig 087). Bcrypt-hashed at cost 12,
--     same as the long-form privacy code.
--   - Verify via verify_sms_code (mig 087). Single-use enforced via
--     used_at IS NULL guard inside the verify function.
--   - TTL 5 minutes. Verified-but-expired tokens return the same
--     uniform failure shape as wrong-code attempts.
--   - Per-patient send rate limit: 3 unused/active tokens in the last
--     hour. Prevents clinic-side spam-send.
--
-- ATOMICITY (per § 16.1)
--   verify_sms_code runs UPDATE used_at + INSERT privacy_code_attempts +
--   INSERT audit_events in the same transaction. Failure of any
--   sub-write rolls back the whole verify.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.privacy_code_sms_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  global_patient_id UUID NOT NULL
    REFERENCES public.global_patients(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  -- Who is asking for access. Both required for the consent SMS template
  -- which names the clinic AND doctor by name (the patient must understand
  -- exactly who they're authorizing).
  requesting_clinic_id UUID NOT NULL
    REFERENCES public.clinics(id)
    ON DELETE RESTRICT,
  requesting_doctor_id UUID NOT NULL
    REFERENCES public.users(id)
    ON DELETE RESTRICT,

  -- Bcrypt-hashed 4-digit numeric code. Cost factor 12 (matches the
  -- long-form privacy code; the verify function pays the same ~400ms
  -- regardless of code length, satisfying the timing parity invariant).
  sms_code_hash TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'bcrypt',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- TTL: created_at + 5 minutes. expires_at is set explicitly by the
  -- INSERT path so partial UNIQUE indexes can use it directly.
  expires_at TIMESTAMPTZ NOT NULL,

  -- Single-use enforcement. NULL ⇒ unused; NOT NULL ⇒ verify_sms_code
  -- already redeemed it. Subsequent attempts get the uniform failure.
  used_at TIMESTAMPTZ,
  used_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Forensic counter (verify attempts on this token; per-token cap).
  attempts_count INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT privacy_code_sms_tokens_attempts_nonneg_chk
    CHECK (attempts_count >= 0),
  CONSTRAINT privacy_code_sms_tokens_used_consistency_chk
    CHECK (
      (used_at IS NULL AND used_by_user_id IS NULL)
      OR (used_at IS NOT NULL)
    ),
  CONSTRAINT privacy_code_sms_tokens_expires_after_created_chk
    CHECK (expires_at > created_at)
);

-- Backs the per-patient send rate limit query: count unused active
-- tokens in the last hour.
CREATE INDEX IF NOT EXISTS privacy_code_sms_tokens_patient_active_idx
  ON public.privacy_code_sms_tokens (global_patient_id, created_at DESC)
  WHERE used_at IS NULL;

-- Backs verify_sms_code's lookup (gpid + clinic for the active unused token).
CREATE INDEX IF NOT EXISTS privacy_code_sms_tokens_verify_idx
  ON public.privacy_code_sms_tokens (global_patient_id, requesting_clinic_id, expires_at DESC)
  WHERE used_at IS NULL;

COMMENT ON TABLE public.privacy_code_sms_tokens IS
  'Short-lived (5-minute) 4-digit SMS share codes for patients without the patient app. One-time-use enforced via used_at. Per-patient send rate limit (3 unused active tokens/hour) checked at INSERT in initiate_sms_share. Bcrypt cost 12 — same timing as the long-form privacy code, ensuring uniform verify latency. Real RLS in Prompt 6 (ORPH-V4-03).';

COMMENT ON COLUMN public.privacy_code_sms_tokens.sms_code_hash IS
  'Bcrypt-hashed 4-digit numeric code (0000-9999). Cost factor 12. Plaintext returned ONCE by initiate_sms_share to the SMS sender; never stored. The 4-digit choice trades brute-force resistance for read-aloud usability — the 5-minute TTL plus per-token attempts cap makes the brute-force risk acceptable (~10000 / 5min = 33 attempts/sec required, far above any rate-limit envelope).';

-- RLS — DENY-ALL placeholder (ORPH-V4-03 closes in Prompt 6).
ALTER TABLE public.privacy_code_sms_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS privacy_code_sms_tokens_no_select ON public.privacy_code_sms_tokens;
DROP POLICY IF EXISTS privacy_code_sms_tokens_no_insert ON public.privacy_code_sms_tokens;
DROP POLICY IF EXISTS privacy_code_sms_tokens_no_update ON public.privacy_code_sms_tokens;
DROP POLICY IF EXISTS privacy_code_sms_tokens_no_delete ON public.privacy_code_sms_tokens;

CREATE POLICY privacy_code_sms_tokens_no_select ON public.privacy_code_sms_tokens
  FOR SELECT TO authenticated USING (FALSE);
CREATE POLICY privacy_code_sms_tokens_no_insert ON public.privacy_code_sms_tokens
  FOR INSERT TO authenticated WITH CHECK (FALSE);
CREATE POLICY privacy_code_sms_tokens_no_update ON public.privacy_code_sms_tokens
  FOR UPDATE TO authenticated USING (FALSE);
CREATE POLICY privacy_code_sms_tokens_no_delete ON public.privacy_code_sms_tokens
  FOR DELETE TO authenticated USING (FALSE);
