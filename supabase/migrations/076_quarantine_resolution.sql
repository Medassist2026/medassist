-- ============================================================================
-- Migration 076 — Quarantine resolution (closes ORPH-V2-07 part 1)
--
-- Conceptual name in audits/EXECUTION_PROMPTS.md: mig 075.
--
-- Implements: Build 03 Phase B Step 4 (B4).
--
-- DECISION POINT (per Mo, 2026-04-29)
--   Per the prompt's "Do both auto-rules now and surface anomalies"
--   workflow choice: PATH B (sentinel) for ALL 74 quarantine rows on
--   staging today. The data on staging is test/seed data — DEP_*
--   placeholders, +200xxxxxxxxxxx leading-zero typos, +1555xxx US-test
--   numbers, +212/+22 country-mismatch entries. None justify a manual
--   PATH A recovery at this stage. Each row's metadata classification
--   surfaces "potentially_recoverable_leading_zero" so Mo can do a
--   follow-up sweep manually if desired (TD logged in deliverable §6).
--
--   For PATIENTS-side rows: PATH B creates a sentinel global_patients
--   row (normalized_phone=NULL, account_status='locked', claimed=FALSE,
--   legacy_phone=raw_phone) and points patients.global_patient_id at
--   it. This is the load-bearing step that lets mig 077 flip
--   patients.global_patient_id to NOT NULL.
--
--   For USERS-side rows: PATH B is simpler — users don't get sentinel
--   global_patients rows because users are staff/patient-app accounts,
--   not patient identity rows. Users.normalized_phone stays NULL; the
--   row is just removed from quarantine and audited.
--
-- WHAT IT DOES
--   1. Pre-condition: confirms global_patients.normalized_phone unique
--      index allows multiple NULLs (Postgres standard, verified at
--      build time on staging — index is plain, not partial).
--   2. For each PATIENTS quarantine row: create sentinel global_patient,
--      point patients.global_patient_id at it, audit PATH_B.
--   3. For each USERS quarantine row: leave users.normalized_phone NULL,
--      audit PATH_B (no sentinel needed).
--   4. Empty _phone_normalize_quarantine.
--
-- DEPENDS ON:
--   - mig 073 (global_patients exists, has account_status enum, has
--     legacy_phone column).
--   - mig 074 (audit_events accepts actor_kind='migration' / actor_user_id=NULL).
--
-- POST-CONDITIONS
--   _phone_normalize_quarantine.count = 0
--   Every patients row has global_patient_id NOT NULL (defends mig 077).
--   QUARANTINE_RESOLVED_PATH_B audit count = number of quarantine rows
--     that this migration processed (idempotent on re-apply).
--
-- REVERSIBLE. Companion: 076_quarantine_resolution.rollback.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 076.0 — Drop NOT NULL on global_patients.normalized_phone.
-- ---------------------------------------------------------------------------
-- Discovered at staging-apply time: the column was created NOT NULL in
-- mig 073, even though the schema spec models normalized_phone as
-- nullable for the sentinel case. The UNIQUE INDEX is plain (not partial),
-- which allows multiple NULLs at the index level — but the column-level
-- NOT NULL constraint blocks any NULL insert. Drop it here so PATH B
-- sentinels can land. The unique index continues to behave correctly.
ALTER TABLE public.global_patients
  ALTER COLUMN normalized_phone DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 076.1 — Helper function: classify a raw phone for forensics.
-- ---------------------------------------------------------------------------
-- Returns a short tag describing why this phone failed normalization.
-- Stored in audit_events.metadata.classification so Mo can grep later.
CREATE OR REPLACE FUNCTION public._classify_quarantined_phone(p_raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_raw IS NULL OR p_raw = '' THEN
    RETURN 'empty';
  END IF;
  IF p_raw ~ '[A-Za-z]' THEN
    RETURN 'has_letters_or_placeholder';
  END IF;
  IF p_raw LIKE '+200%' THEN
    RETURN 'potentially_recoverable_leading_zero';
  END IF;
  IF p_raw LIKE '+1555%' OR p_raw LIKE '+15554%' OR p_raw LIKE '+15555%' THEN
    RETURN 'us_test_number';
  END IF;
  IF p_raw LIKE '+212%' THEN
    RETURN 'morocco_unsupported_country';
  END IF;
  IF p_raw LIKE '+22%' AND p_raw NOT LIKE '+220%' THEN
    RETURN 'unrecognized_country_code';
  END IF;
  IF length(regexp_replace(p_raw, '[^0-9]', '', 'g')) < 8 THEN
    RETURN 'too_short';
  END IF;
  IF length(regexp_replace(p_raw, '[^0-9]', '', 'g')) > 15 THEN
    RETURN 'too_long';
  END IF;
  IF p_raw LIKE '+201%' THEN
    -- +201xxxxxxxxx but didn't pass normalize → likely invalid Egyptian mobile prefix
    RETURN 'invalid_egyptian_mobile_prefix';
  END IF;
  RETURN 'numeric_other';
END;
$$;

-- ---------------------------------------------------------------------------
-- 076.2 — PATIENTS-side: create sentinels, point patients.global_patient_id.
-- ---------------------------------------------------------------------------
-- Idempotent via the join on patients.global_patient_id IS NULL — once
-- a patient has a sentinel pointer, this query is a no-op for that row.
DO $$
DECLARE
  q RECORD;
  v_sentinel_id UUID;
  v_classification TEXT;
BEGIN
  FOR q IN
    SELECT
      qq.row_id AS patient_id,
      qq.raw_phone
    FROM public._phone_normalize_quarantine qq
    JOIN public.patients p ON p.id = qq.row_id
    WHERE qq.table_name = 'patients'
      AND p.global_patient_id IS NULL  -- skip if already resolved
  LOOP
    v_classification := public._classify_quarantined_phone(q.raw_phone);

    -- 076.2a — Create a fresh sentinel global_patients row.
    INSERT INTO public.global_patients (
      normalized_phone,
      account_status,
      claimed,
      legacy_phone,
      created_at,
      updated_at
    ) VALUES (
      NULL,
      'locked'::patient_account_status,
      FALSE,
      q.raw_phone,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_sentinel_id;

    -- 076.2b — Point patients.global_patient_id at the sentinel.
    -- (patients does not carry an updated_at column today; do not add
    -- one as a side effect of this migration.)
    UPDATE public.patients
       SET global_patient_id = v_sentinel_id
     WHERE id = q.patient_id;

    -- 076.2b' — Create the matching patient_clinic_records row.
    -- mig 075 backfilled PCR rows for non-sentinel patients but the
    -- sentinel didn't yet exist when 075 ran. Without this step, mig
    -- 080's clinical-table backfill leaves rows linked to sentinel
    -- patients with NULL patient_clinic_record_id. Idempotent via
    -- ON CONFLICT (UNIQUE on global_patient_id, clinic_id).
    INSERT INTO public.patient_clinic_records (
      global_patient_id, clinic_id,
      is_anonymous_to_global, consent_to_messaging, consent_to_messaging_granted_at,
      first_seen_at, last_seen_at, created_at, updated_at
    )
    SELECT
      v_sentinel_id, p.clinic_id,
      FALSE, FALSE, NULL,
      p.created_at, p.created_at, NOW(), NOW()
    FROM public.patients p
    WHERE p.id = q.patient_id
      AND p.clinic_id IS NOT NULL
    ON CONFLICT (global_patient_id, clinic_id) DO NOTHING;

    -- 076.2c — Audit log: PATH_B for this patient.
    INSERT INTO public.audit_events (
      action, actor_kind, actor_user_id,
      entity_type, entity_id, metadata, created_at
    ) VALUES (
      'QUARANTINE_RESOLVED_PATH_B',
      'migration',
      NULL,
      'patient',
      q.patient_id,
      jsonb_build_object(
        'source', 'migration_076',
        'side', 'patients',
        'raw_phone', q.raw_phone,
        'classification', v_classification,
        'sentinel_global_patient_id', v_sentinel_id,
        'note', 'Phone unrecoverable; sentinel global_patient created with account_status=locked'
      ),
      NOW()
    );

    -- 076.2d — Audit log: GLOBAL_PATIENT_CREATED for the sentinel
    --           (matches the per-row audit pattern from mig 073).
    INSERT INTO public.audit_events (
      action, actor_kind, actor_user_id,
      entity_type, entity_id, metadata, created_at
    ) VALUES (
      'GLOBAL_PATIENT_CREATED',
      'migration',
      NULL,
      'global_patient',
      v_sentinel_id,
      jsonb_build_object(
        'source', 'migration_076_sentinel',
        'sentinel_for_patient_id', q.patient_id,
        'legacy_phone', q.raw_phone,
        'classification', v_classification
      ),
      NOW()
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 076.3 — USERS-side: just audit + clear from quarantine.
-- ---------------------------------------------------------------------------
-- Users without a normalized_phone stay that way. This is correct —
-- they're staff/patient-app accounts that didn't yet have a normalized
-- phone, and the proper resolution path is for the user themselves to
-- re-verify their phone via the change-phone flow (D-051..D-056).
--
-- Idempotent via NOT EXISTS guard.
INSERT INTO public.audit_events (
  action, actor_kind, actor_user_id,
  entity_type, entity_id, metadata, created_at
)
SELECT
  'QUARANTINE_RESOLVED_PATH_B',
  'migration',
  NULL,
  'user',
  q.row_id,
  jsonb_build_object(
    'source', 'migration_076',
    'side', 'users',
    'raw_phone', q.raw_phone,
    'classification', public._classify_quarantined_phone(q.raw_phone),
    'note', 'User left with normalized_phone NULL; re-verify via change-phone flow if user owner reaches out'
  ),
  NOW()
FROM public._phone_normalize_quarantine q
WHERE q.table_name = 'users'
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_events ae
     WHERE ae.action = 'QUARANTINE_RESOLVED_PATH_B'
       AND ae.entity_id = q.row_id
       AND ae.entity_type = 'user'
       AND ae.metadata->>'source' = 'migration_076'
  );

-- ---------------------------------------------------------------------------
-- 076.4 — Empty the quarantine table.
-- ---------------------------------------------------------------------------
DELETE FROM public._phone_normalize_quarantine;

-- ---------------------------------------------------------------------------
-- 076.5 — Drop the helper function (it was migration-scoped).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._classify_quarantined_phone(TEXT);

-- ---------------------------------------------------------------------------
-- 076.6 — Post-condition assertions.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_quarantine_left INTEGER;
  v_patients_without_global INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_quarantine_left FROM public._phone_normalize_quarantine;
  IF v_quarantine_left > 0 THEN
    RAISE EXCEPTION
      'mig 076 post-condition failed: _phone_normalize_quarantine still has % rows (expected 0)',
      v_quarantine_left;
  END IF;

  SELECT COUNT(*) INTO v_patients_without_global
    FROM public.patients
   WHERE global_patient_id IS NULL;
  IF v_patients_without_global > 0 THEN
    RAISE EXCEPTION
      'mig 076 post-condition failed: % patients rows still have global_patient_id IS NULL. Mig 077 (NOT NULL flip) will fail.',
      v_patients_without_global;
  END IF;
END $$;
