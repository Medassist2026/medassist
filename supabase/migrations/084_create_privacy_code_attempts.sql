-- ============================================================================
-- Migration 084 — privacy_code_attempts (append-only audit + rate-limit substrate)
--
-- Per audits/patient-identity-schema-spec.md § 6 (canonical) and migration
-- plan Step 8 (mig 078 in plan numbering; 084 in actual filename order).
-- Implements ORPH-V4-01 (RLS DENY-ALL placeholder; real policies in Prompt 6).
--
-- ALSO CREATES the privacy_code_attempt_result enum (schema spec § 1)
-- since Phase A confirmed it doesn't exist yet on staging.
--
-- WHY THIS TABLE
--   Three jobs at once:
--   (a) Audit trail of every privacy-code verification attempt (success
--       or failure), keyed by (gpid, attempting clinic, attempting user).
--       Append-only — never UPDATE, never DELETE.
--   (b) Rate-limit substrate for verify_privacy_code's two ordered checks:
--       Step 0 — per-(clinic, gpid) sliding-hour: 5 failures → reject.
--       Step 1 — per-code lifetime: 5 failures across all clinics →
--                 24h lockout on the patient_privacy_codes row.
--   (c) Forensic trail (ip + ua) for incident review.
--
-- INDICES
--   - (gpid, clinic, created_at DESC) — Step 0 per-clinic-window query
--   - (gpid, created_at DESC)         — Step 1 lifetime + patient app timeline
--   - (clinic, created_at DESC)       — clinic ops
--   - (ip, created_at DESC) WHERE NOT NULL — IP rate-limit (Prompt 7+)
--
-- RLS PLACEHOLDER — DENY-ALL.
--   All access goes through SECURITY DEFINER record_privacy_code_attempt
--   (called only inside verify_privacy_code in mig 087). Real policies
--   (patient self-view + clinic OWNER per-clinic) ship in Prompt 6.
-- ============================================================================

-- 1. Enum (additive — coexists with existing 053 enums).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'privacy_code_attempt_result') THEN
    CREATE TYPE privacy_code_attempt_result AS ENUM (
      'success',
      'failure',
      'locked_out',
      'code_revoked',
      'rate_limited'
    );
  END IF;
END $$;

-- 2. Table.
CREATE TABLE IF NOT EXISTS public.privacy_code_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  global_patient_id UUID NOT NULL
    REFERENCES public.global_patients(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  -- privacy_code_id deferred until mig 085 creates patient_privacy_codes.
  -- Mig 085 ALTERs to add this FK. Until then, the column exists as UUID
  -- without a constraint (forward-compatible — record_privacy_code_attempt
  -- can already write the column).
  privacy_code_id UUID,

  -- Who tried (always known — even rate_limited rows have an attempted_by_user_id
  -- and clinic_id from the API session).
  attempted_by_user_id UUID NOT NULL
    REFERENCES public.users(id) ON DELETE RESTRICT,
  attempted_by_clinic_id UUID NOT NULL
    REFERENCES public.clinics(id) ON DELETE RESTRICT,

  -- Outcome.
  result privacy_code_attempt_result NOT NULL,

  -- Forensics (best-effort; not all attempts come with these).
  ip_address INET,
  user_agent TEXT,

  -- Optional grouping for batched flows (e.g., a single front-desk session
  -- with multiple verify attempts). Lets ops trace one user's session.
  request_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indices.
CREATE INDEX IF NOT EXISTS privacy_code_attempts_clinic_window_idx
  ON public.privacy_code_attempts (global_patient_id, attempted_by_clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS privacy_code_attempts_lifetime_idx
  ON public.privacy_code_attempts (global_patient_id, created_at DESC)
  WHERE result IN ('failure','locked_out');

CREATE INDEX IF NOT EXISTS privacy_code_attempts_clinic_time_idx
  ON public.privacy_code_attempts (attempted_by_clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS privacy_code_attempts_ip_time_idx
  ON public.privacy_code_attempts (ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;

-- 4. Comments.
COMMENT ON TABLE public.privacy_code_attempts IS
  'Append-only audit + rate-limit feed for privacy-code attempts. Every attempt — success, failure, lockout, expired, rate_limited — gets a row written by record_privacy_code_attempt (mig 087). Real RLS policies ship in Prompt 6 (ORPH-V4-01). Until then DENY-ALL placeholder; only SECURITY DEFINER paths read/write.';

COMMENT ON INDEX public.privacy_code_attempts_clinic_window_idx IS
  'Backs the per-clinic rate limit in verify_privacy_code: 5 failures/hour/(global_patient, clinic) before this clinic is rate-limited from this patient for the next hour. Locked numerics from EXECUTION_PROMPTS.md.md.';

COMMENT ON INDEX public.privacy_code_attempts_lifetime_idx IS
  'Backs the per-code 24h lockout: when the lifetime failure count for a patient_privacy_codes row hits 5, set locked_until = NOW + 24h. Partial index keeps the hot window narrow.';

-- 5. RLS — DENY-ALL placeholder (ORPH-V4-01 closes in Prompt 6).
ALTER TABLE public.privacy_code_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS privacy_code_attempts_no_select ON public.privacy_code_attempts;
DROP POLICY IF EXISTS privacy_code_attempts_no_insert ON public.privacy_code_attempts;
DROP POLICY IF EXISTS privacy_code_attempts_no_update ON public.privacy_code_attempts;
DROP POLICY IF EXISTS privacy_code_attempts_no_delete ON public.privacy_code_attempts;

CREATE POLICY privacy_code_attempts_no_select ON public.privacy_code_attempts
  FOR SELECT TO authenticated USING (FALSE);
CREATE POLICY privacy_code_attempts_no_insert ON public.privacy_code_attempts
  FOR INSERT TO authenticated WITH CHECK (FALSE);
CREATE POLICY privacy_code_attempts_no_update ON public.privacy_code_attempts
  FOR UPDATE TO authenticated USING (FALSE);
CREATE POLICY privacy_code_attempts_no_delete ON public.privacy_code_attempts
  FOR DELETE TO authenticated USING (FALSE);
