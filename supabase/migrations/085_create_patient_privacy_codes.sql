-- ============================================================================
-- Migration 085 — patient_privacy_codes (rate-limited, regeneratable codes)
--
-- Per audits/patient-identity-schema-spec.md § 5 (canonical).
-- Implements ORPH-V4-02 (RLS DENY-ALL placeholder; real policies in Prompt 6).
--
-- DESIGN — append-only-then-revoke (NOT one-row-per-patient).
--   On regenerate, the existing active row is marked revoked
--   (revoked_at = NOW(), revoked_reason = 'regenerated') and a NEW row
--   is INSERTed. A partial UNIQUE index on (global_patient_id) WHERE
--   revoked_at IS NULL guarantees at most one active code per patient
--   without dirtying global_patients on every attempt.
--
-- WHY MULTI-ROW
--   - Forensic retention of revoked code_hash for incident review (we
--     can detect if a leaked code was used post-rotation).
--   - regenerate is naturally atomic across two rows (UPDATE old + INSERT
--     new + audit), satisfying schema-spec § 16.1 atomicity contract.
--   - Future per-clinic-scoped codes is a column-add here, not a
--     re-architecting of global_patients.
--
-- ALSO BACKFILLS the FK from privacy_code_attempts.privacy_code_id (mig
-- 084 created the column without the FK so it could land first).
--
-- RLS PLACEHOLDER — DENY-ALL.
--   Even the patient cannot SELECT their own code_hash row. All access
--   is via SECURITY DEFINER functions in mig 087.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patient_privacy_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  global_patient_id UUID NOT NULL
    REFERENCES public.global_patients(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  -- Storage: bcrypt by default; algorithm column for forward compat
  -- (e.g., switch to argon2id without backfilling all rows).
  code_hash TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'bcrypt',

  -- Per-code rate-limit + lockout state. Two distinct mechanisms run in
  -- verify_privacy_code (mig 087):
  --   - Per-clinic 1h window — 5 failures from one clinic against this
  --     patient triggers a 1-hour block (no SMS).
  --   - Per-code lifetime — 5 failures total (across ALL clinics) sets
  --     locked_until = NOW + 24h AND fires patient SMS.
  attempts_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,

  -- Lifecycle.
  regenerated_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
    CHECK (revoked_reason IS NULL OR revoked_reason IN (
      'regenerated','admin_reset','phone_change','merged','deceased'
    )),

  CONSTRAINT patient_privacy_codes_attempts_nonneg_chk
    CHECK (attempts_count >= 0),
  CONSTRAINT patient_privacy_codes_regen_nonneg_chk
    CHECK (regenerated_count >= 0),
  CONSTRAINT patient_privacy_codes_revoke_consistency_chk
    CHECK (
      (revoked_at IS NULL AND revoked_reason IS NULL)
      OR (revoked_at IS NOT NULL AND revoked_reason IS NOT NULL)
    )
);

-- "Exactly one active code per patient." Multiple revoked rows allowed
-- for forensic retention.
CREATE UNIQUE INDEX IF NOT EXISTS patient_privacy_codes_active_uniq
  ON public.patient_privacy_codes (global_patient_id)
  WHERE revoked_at IS NULL;

-- Lockout-window scan (verify_privacy_code Step 1).
CREATE INDEX IF NOT EXISTS patient_privacy_codes_locked_until_idx
  ON public.patient_privacy_codes (locked_until)
  WHERE locked_until IS NOT NULL AND revoked_at IS NULL;

COMMENT ON TABLE public.patient_privacy_codes IS
  'Hashed, rate-limited privacy codes. One ACTIVE row per patient (partial UNIQUE active index); regeneration appends a new row and marks the old revoked. Real RLS in Prompt 6 (ORPH-V4-02). Until then DENY-ALL — all access via SECURITY DEFINER (mig 087).';

COMMENT ON COLUMN public.patient_privacy_codes.code_hash IS
  'Bcrypt-hashed 6-character privacy code from base32 alphabet 23456789ABCDEFGHJKLMNPQRSTUVWXYZ (excl. ambiguous 0,1,I,O). Generated via gen_random_bytes (cryptographically secure). Cost factor 12. Plaintext is RETURNED ONCE by regenerate_privacy_code and never stored.';

-- Now that patient_privacy_codes exists, add the FK from
-- privacy_code_attempts.privacy_code_id (created in mig 084 without an FK).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'privacy_code_attempts_privacy_code_id_fkey'
  ) THEN
    ALTER TABLE public.privacy_code_attempts
      ADD CONSTRAINT privacy_code_attempts_privacy_code_id_fkey
      FOREIGN KEY (privacy_code_id)
      REFERENCES public.patient_privacy_codes(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS — DENY-ALL placeholder (ORPH-V4-02 closes in Prompt 6).
ALTER TABLE public.patient_privacy_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_privacy_codes_no_select ON public.patient_privacy_codes;
DROP POLICY IF EXISTS patient_privacy_codes_no_insert ON public.patient_privacy_codes;
DROP POLICY IF EXISTS patient_privacy_codes_no_update ON public.patient_privacy_codes;
DROP POLICY IF EXISTS patient_privacy_codes_no_delete ON public.patient_privacy_codes;

CREATE POLICY patient_privacy_codes_no_select ON public.patient_privacy_codes
  FOR SELECT TO authenticated USING (FALSE);
CREATE POLICY patient_privacy_codes_no_insert ON public.patient_privacy_codes
  FOR INSERT TO authenticated WITH CHECK (FALSE);
CREATE POLICY patient_privacy_codes_no_update ON public.patient_privacy_codes
  FOR UPDATE TO authenticated USING (FALSE);
CREATE POLICY patient_privacy_codes_no_delete ON public.patient_privacy_codes
  FOR DELETE TO authenticated USING (FALSE);
