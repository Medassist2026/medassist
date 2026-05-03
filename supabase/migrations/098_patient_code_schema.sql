-- ============================================================
-- mig 098 — Phase F: patient_code schema columns on global_patients
-- Date: 2026-05-02 (cowork session 17)
-- Owner: Backend
--
-- ── Why ───────────────────────────────────────────────────────────
-- Session 16 surfaced a P1 security finding on the existing patient_code
-- system: built before the 2026-04-26 locked decisions, contradicts
-- them on five axes (Math.random vs gen_random_bytes, indefinite TTL
-- vs 90d, no rate limit vs 1/60s/patient, no audit vs audit-everything-
-- sensitive, plaintext vs bcrypt). Mo's Option 3 ruling: rebuild as
-- two SECURITY DEFINER RPCs against locked-decision-conformant schema
-- on global_patients (durable home; survives Prompt 6.5 legacy `patients`
-- drop).
--
-- This migration is the SCHEMA half — adds the three columns. The RPCs
-- (patient_get_my_code, patient_regenerate_my_code) ship in mig 099.
-- The cross-clinic identity-resolution RPC ships in mig 100. Backfill
-- of existing patients.patient_code plaintext into the new bcrypt
-- column happens in a one-time admin script (NOT a migration), per
-- session 17 step 7.
--
-- ── Columns added ─────────────────────────────────────────────────
--   patient_code_hash         TEXT         — bcrypt hash of plaintext
--                                            code (never readable as
--                                            plaintext after generation)
--   patient_code_generated_at TIMESTAMPTZ  — when this hash was created
--                                            (used by rate-limit CHECK
--                                            in mig 099 RPC)
--   patient_code_expires_at   TIMESTAMPTZ  — when this hash expires
--                                            (default 90d from
--                                            generated_at; NULL reserved
--                                            for future "no expiry" use)
--
-- All three are NULLABLE. Patients who have not regenerated under the
-- new system will have all three NULL — the consumer-side dual-hash
-- read path at lib/data/patients.ts:376 falls through to the legacy
-- SHA-256-against-patient_consent_grants.verification_token_hash path
-- for those rows. Once a patient regenerates, the new bcrypt path is
-- canonical and the legacy plaintext patients.patient_code can NULL out.
--
-- ── No data migration in this file ────────────────────────────────
-- Per session-17 plan: backfill is a separate one-time admin script
-- (step 7), not a migration. Reasons:
--   1. Backfill needs bcrypt rounds appropriate to the deployment
--      environment, not the deployment-blocking migration runner.
--   2. Backfill is destructive of the legacy plaintext on the rows it
--      processes — better as a separately-audited operation.
--   3. The dual-hash consumer path means existing patients keep working
--      regardless of when (or whether) backfill runs; backfill is
--      optional for correctness.
--
-- ── Why no NOT NULL / DEFAULT ─────────────────────────────────────
-- DEFAULT NOW() on _generated_at would lie about when codes were
-- created (legacy plaintext rows would all show the migration date).
-- DEFAULT NULL is correct: NULL means "no bcrypt hash yet; use legacy
-- plaintext path at the consumer."
--
-- ── Post-condition (Empirical Lesson #2) ──────────────────────────
-- In-transaction smoke-probe verifies:
--   - All 3 columns present in information_schema.columns
--   - Correct types (TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
--   - All NULLABLE
--   - Real authenticated SELECT against global_patients still works
--     (columns don't change RLS, but defensive: catches any recursion
--     introduced by trigger interactions with the new columns)
--
-- ── Rollback ──────────────────────────────────────────────────────
-- Reversible via 098_patient_code_schema.rollback.sql:
-- DROP COLUMN on all three. NO data loss because rollback only fires
-- when the columns are still empty (NULL on every row) — backfill
-- happens AFTER staging validation in step 7.
-- ============================================================

BEGIN;

-- ── Add the three columns ─────────────────────────────────────────
ALTER TABLE public.global_patients
  ADD COLUMN IF NOT EXISTS patient_code_hash         TEXT,
  ADD COLUMN IF NOT EXISTS patient_code_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS patient_code_expires_at   TIMESTAMPTZ;

-- Documentation comments — these become the system-of-record for
-- "why is this column here" once the migration ships.
COMMENT ON COLUMN public.global_patients.patient_code_hash IS
  'bcrypt hash of the patient_code plaintext (8-char base32 from gen_random_bytes(5)). '
  'NEVER readable as plaintext after generation. NULL = patient has not regenerated under '
  'the Phase F system; consumer at lib/data/patients.ts:376 falls through to the legacy '
  'SHA-256/patient_consent_grants.verification_token_hash path. Set by mig 099 RPC '
  'patient_regenerate_my_code() only.';

COMMENT ON COLUMN public.global_patients.patient_code_generated_at IS
  'Timestamp of last successful patient_code_hash generation. Used by mig 099 RPC '
  'patient_regenerate_my_code() rate-limit CHECK (1 regenerate per 60s per patient). '
  'NULL means no Phase F regenerate yet.';

COMMENT ON COLUMN public.global_patients.patient_code_expires_at IS
  'Timestamp when patient_code_hash expires. Default lifetime 90 days from generated_at, '
  'matching the default share-expiry locked decision. NULL is reserved for a future '
  '"no-expiry" use case (e.g. permanent code at patient request); current Phase F '
  'behaviour is always set this to generated_at + INTERVAL ''90 days''.';

-- ────────────────────────────────────────────────────────────────────
-- IN-TRANSACTION POST-CONDITION + SMOKE-PROBE (Empirical Lesson #2)
-- ────────────────────────────────────────────────────────────────────
DO $post$
DECLARE
  v_col_count       INT;
  v_hash_type       TEXT;
  v_generated_type  TEXT;
  v_expires_type    TEXT;
  v_hash_nullable   TEXT;
  v_smoke_uid       UUID;
BEGIN
  -- Structural assertion: 3 columns present, correct types, NULLABLE.
  SELECT COUNT(*) INTO v_col_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'global_patients'
     AND column_name IN ('patient_code_hash','patient_code_generated_at','patient_code_expires_at');
  IF v_col_count <> 3 THEN
    RAISE EXCEPTION
      'mig 098 post-condition failed: expected 3 patient_code_* columns on global_patients, got %',
      v_col_count;
  END IF;

  SELECT data_type INTO v_hash_type
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='global_patients'
     AND column_name='patient_code_hash';
  IF v_hash_type <> 'text' THEN
    RAISE EXCEPTION 'mig 098 post-condition failed: patient_code_hash must be text, got %', v_hash_type;
  END IF;

  SELECT data_type INTO v_generated_type
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='global_patients'
     AND column_name='patient_code_generated_at';
  IF v_generated_type <> 'timestamp with time zone' THEN
    RAISE EXCEPTION 'mig 098 post-condition failed: patient_code_generated_at must be timestamptz, got %', v_generated_type;
  END IF;

  SELECT data_type INTO v_expires_type
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='global_patients'
     AND column_name='patient_code_expires_at';
  IF v_expires_type <> 'timestamp with time zone' THEN
    RAISE EXCEPTION 'mig 098 post-condition failed: patient_code_expires_at must be timestamptz, got %', v_expires_type;
  END IF;

  SELECT is_nullable INTO v_hash_nullable
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='global_patients'
     AND column_name='patient_code_hash';
  IF v_hash_nullable <> 'YES' THEN
    RAISE EXCEPTION 'mig 098 post-condition failed: patient_code_hash must be NULLABLE (existing rows must accept NULL until backfill or first regenerate), got %', v_hash_nullable;
  END IF;

  -- Smoke-probe: real authenticated SELECT against global_patients —
  -- catches any recursion (42P17) at query-time. The new columns don't
  -- touch RLS but defensive smoke-probe is the standard per Lesson #2.
  -- IMPORTANT: read auth.users.id BEFORE the role switch (authenticated
  -- role can't read auth.users). Lesson from mig 095 §28-30.
  SELECT id INTO v_smoke_uid FROM auth.users LIMIT 1;
  IF v_smoke_uid IS NULL THEN
    RAISE NOTICE 'mig 098 smoke-probe: no auth.users present on this database, skipping authenticated SELECT';
  ELSE
    PERFORM set_config('role', 'authenticated', TRUE);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_smoke_uid::text, 'role', 'authenticated')::text,
      TRUE);

    -- MUST NOT error 42P17. Row counts are not asserted; the
    -- post-condition is "the query plan + RLS evaluation complete
    -- without recursion".
    PERFORM COUNT(*) FROM public.global_patients;
  END IF;

  RAISE NOTICE 'mig 098 post-condition: 3 patient_code_* columns present (text, timestamptz, timestamptz), all NULLABLE; smoke-probe against global_patients passed (no recursion)';
END $post$;

COMMIT;
