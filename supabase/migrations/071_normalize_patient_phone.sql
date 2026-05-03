-- ============================================================================
-- Migration 071 — Phone normalization (E.164) for patients + users
-- Implements: patient-identity-migration-plan.md Step 1 ONLY.
--
-- BUILD prompt: Patient Identity Build 02 (re-trimmed by Build 02 follow-up
-- Fix 1 — restore the 3-migration sequence). The dedup detection that was
-- previously bundled into this file moved to mig 072; the global_patients +
-- patients pointer + dedup-flag work moved to mig 073. The boundary
-- between detection (mig 072) and consumption (mig 073) is the human
-- review gate documented in audits/dedup-resolution.md — compressing it
-- away is forbidden by Fix 1's locked decision.
--
-- This migration is INTENTIONALLY ADDITIVE and IDEMPOTENT.
-- It does NOT change any RLS policy. It does NOT delete any row.
-- It does NOT alter the application's read path — `patients.phone` and
-- `users.phone` are still the columns the app reads.
--
-- WHAT IT ADDS
--   1. `public.normalize_phone_e164(text)` — pure SQL normalizer that
--      mirrors `packages/shared/lib/utils/phone-normalize.ts`. Keep the
--      two implementations in lock-step — diverging behavior breaks
--      the global_patients UNIQUE invariant in mig 073.
--   2. `patients.normalized_phone` — TEXT, populated for every row
--      whose `phone` parses. Rows whose phone does NOT parse are
--      logged in `_phone_normalize_quarantine` for human review;
--      they are EXCLUDED from any subsequent global_patients backfill.
--   3. `users.normalized_phone` — TEXT, same idea on users. Restored by
--      Fix 1; Build 02 had omitted this in error.
--   4. `_phone_normalize_quarantine` — table of un-normalizable rows
--      from BOTH `patients` and `users`, keyed by (table_name, row_id).
--   5. Index `idx_patients_normalized_phone` — used by mig 072's
--      detection view and mig 073's backfill JOINs.
--
-- POST-CONDITIONS (validation queries documented at the bottom of file).
--
-- REVERSIBLE. Rollback companion lives in
-- supabase/migrations/071_normalize_patient_phone.rollback.sql.
-- ============================================================================

-- 071.1 — Helper function: mirror of normalizeEgyptianPhone (TS).
-- IMPORTANT: keep in lock-step with packages/shared/lib/utils/phone-normalize.ts
CREATE OR REPLACE FUNCTION public.normalize_phone_e164(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_western TEXT;
  v_cleaned TEXT;
  v_has_plus BOOLEAN;
  v_digits TEXT;
  v_twelve TEXT;
  v_mobile_prefix TEXT;
BEGIN
  IF p_phone IS NULL THEN
    RETURN NULL;
  END IF;

  -- Convert Arabic-Indic numerals (٠-٩) to Western 0-9.
  v_western := translate(p_phone, '٠١٢٣٤٥٦٧٨٩', '0123456789');

  -- Strip permitted formatting characters: spaces, tabs, dashes, dots,
  -- parens. Keep digits and a single optional leading '+'.
  v_cleaned := regexp_replace(v_western, '[\s\-.()]', '', 'g');

  IF length(v_cleaned) = 0 THEN
    RETURN NULL;
  END IF;

  v_has_plus := left(v_cleaned, 1) = '+';
  v_digits := CASE WHEN v_has_plus THEN substring(v_cleaned FROM 2) ELSE v_cleaned END;

  -- Reject anything containing a non-digit character outside a single
  -- leading '+'. (We've already stripped formatting chars.)
  IF v_digits !~ '^[0-9]+$' THEN
    RETURN NULL;
  END IF;

  -- Reduce to "201XXXXXXXXX" (12-digit) form.
  IF left(v_digits, 2) = '00' THEN
    -- International 00-prefix.
    v_digits := substring(v_digits FROM 3);
    IF left(v_digits, 2) <> '20' THEN RETURN NULL; END IF;
    IF length(v_digits) <> 12 THEN RETURN NULL; END IF;
    v_twelve := v_digits;
  ELSIF left(v_digits, 2) = '20' THEN
    IF length(v_digits) <> 12 THEN RETURN NULL; END IF;
    v_twelve := v_digits;
  ELSIF left(v_digits, 1) = '0' THEN
    -- Local 11-digit form starting with 01.
    IF length(v_digits) <> 11 THEN RETURN NULL; END IF;
    IF left(v_digits, 2) <> '01' THEN RETURN NULL; END IF;
    v_twelve := '20' || substring(v_digits FROM 2);
  ELSIF length(v_digits) = 10 THEN
    -- Missing leading zero.
    v_mobile_prefix := substring(v_digits FROM 1 FOR 2);
    IF v_mobile_prefix NOT IN ('10', '11', '12', '15') THEN RETURN NULL; END IF;
    v_twelve := '20' || v_digits;
  ELSE
    RETURN NULL;
  END IF;

  -- Final invariants.
  IF length(v_twelve) <> 12 OR left(v_twelve, 2) <> '20' THEN
    RETURN NULL;
  END IF;

  v_mobile_prefix := substring(v_twelve FROM 3 FOR 2);
  IF v_mobile_prefix NOT IN ('10', '11', '12', '15') THEN
    RETURN NULL;
  END IF;

  RETURN '+' || v_twelve;
END;
$$;

COMMENT ON FUNCTION public.normalize_phone_e164(TEXT) IS
  'E.164 normalizer for Egyptian mobiles. Mirror of packages/shared/lib/utils/phone-normalize.ts::normalizeEgyptianPhone. Returns +20XXXXXXXXXX or NULL. IMMUTABLE for index use.';

-- 071.2 — Add normalized_phone column on patients.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS normalized_phone TEXT;

COMMENT ON COLUMN public.patients.normalized_phone IS
  'E.164 form of patients.phone, populated by mig 071. Source of truth for the global_patients backfill in mig 073.';

-- 071.3 — Add normalized_phone column on users.
-- Restored by Fix 1; the migration plan specifies users gets a parallel
-- column so the dedup detection view (mig 072) can also report user-side
-- duplicates and so the future user-side backfill can JOIN on it.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS normalized_phone TEXT;

COMMENT ON COLUMN public.users.normalized_phone IS
  'E.164 form of users.phone, populated by mig 071. Used by mig 072 _user_phone_duplicates detection and by Prompt 3 user/global identity reconciliation.';

-- 071.4 — Quarantine table for rows whose phone failed to normalize.
-- Holds rows from BOTH patients AND users; (table_name, row_id) PK
-- keeps the keying unambiguous.
CREATE TABLE IF NOT EXISTS public._phone_normalize_quarantine (
  table_name TEXT NOT NULL,
  row_id UUID NOT NULL,
  raw_phone TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (table_name, row_id)
);

COMMENT ON TABLE public._phone_normalize_quarantine IS
  'Rows whose phone column did not parse as Egyptian E.164. Reviewed manually before mig 073 runs. Holds entries from public.patients and public.users.';

-- 071.5 — Backfill: normalize every patient phone we can.
-- Idempotent: WHERE normalized_phone IS NULL guards against re-run.
UPDATE public.patients
   SET normalized_phone = public.normalize_phone_e164(phone)
 WHERE normalized_phone IS NULL
   AND phone IS NOT NULL;

-- 071.6 — Backfill: normalize every user phone we can.
UPDATE public.users
   SET normalized_phone = public.normalize_phone_e164(phone)
 WHERE normalized_phone IS NULL
   AND phone IS NOT NULL;

-- 071.7 — Quarantine any patient rows whose phone did not normalize.
INSERT INTO public._phone_normalize_quarantine (table_name, row_id, raw_phone)
SELECT 'patients', p.id, p.phone
  FROM public.patients p
 WHERE p.phone IS NOT NULL
   AND p.normalized_phone IS NULL
ON CONFLICT (table_name, row_id) DO NOTHING;

-- 071.8 — Quarantine any user rows whose phone did not normalize.
INSERT INTO public._phone_normalize_quarantine (table_name, row_id, raw_phone)
SELECT 'users', u.id, u.phone
  FROM public.users u
 WHERE u.phone IS NOT NULL
   AND u.normalized_phone IS NULL
ON CONFLICT (table_name, row_id) DO NOTHING;

-- 071.9 — Index for mig 072 detection view + mig 073 backfill JOINs.
CREATE INDEX IF NOT EXISTS idx_patients_normalized_phone
  ON public.patients(normalized_phone)
  WHERE normalized_phone IS NOT NULL;

-- ============================================================================
-- POST-CONDITIONS (run by hand or by migration test harness)
-- ============================================================================
--   -- All non-null patient phones normalized OR quarantined:
--   SELECT COUNT(*) AS unnormalized FROM public.patients
--    WHERE phone IS NOT NULL AND normalized_phone IS NULL
--      AND id NOT IN (SELECT row_id FROM public._phone_normalize_quarantine
--                      WHERE table_name = 'patients');
--   -- Expect: 0
--
--   -- All non-null user phones normalized OR quarantined:
--   SELECT COUNT(*) AS unnormalized FROM public.users
--    WHERE phone IS NOT NULL AND normalized_phone IS NULL
--      AND id NOT IN (SELECT row_id FROM public._phone_normalize_quarantine
--                      WHERE table_name = 'users');
--   -- Expect: 0
--
--   -- Every normalized form matches the E.164 regex:
--   SELECT COUNT(*) FROM public.patients
--    WHERE normalized_phone IS NOT NULL
--      AND normalized_phone !~ '^\+[1-9][0-9]{6,14}$';
--   -- Expect: 0
--
--   SELECT COUNT(*) FROM public.users
--    WHERE normalized_phone IS NOT NULL
--      AND normalized_phone !~ '^\+[1-9][0-9]{6,14}$';
--   -- Expect: 0
--
--   -- Quarantine count (acceptable; not blocking unless > 0 AND those
--   -- rows belong to live, active patients/users):
--   SELECT table_name, COUNT(*) FROM public._phone_normalize_quarantine
--    GROUP BY table_name;
-- ============================================================================
