-- ============================================================================
-- Migration 073 — global_patients table + patients dedup flags +
--                  patients.global_patient_id pointer
-- Implements: patient-identity-migration-plan.md Step 3
--             (+ the `is_canonical` / `duplicate_of_patient_id`
--                consumption of mig 072's `_patient_dedup_plan`).
--
-- BUILD prompt: Patient Identity Build 02 (renamed from old mig 072 +
-- amended by Build 02 follow-up Fix 1, Fix 2, Fix 4). The previous shape
-- bundled detection + flag write into mig 071 and the global-table create
-- into mig 072 — losing the human review gate. Fix 1 split that into
-- three migrations; this is the third. Fix 2 added the `_patient_dedup_plan`
-- table that this migration now CONSUMES rather than re-deriving from
-- raw row data. Fix 4 replaced the TEXT CHECK constraint on
-- `account_status` with the spec-defined `patient_account_status` ENUM.
--
-- WHAT IT ADDS (in this order, to keep dependencies clean)
--   1. Pre-flight assertion: refuses to run while any `_patient_dedup_plan`
--      row has `decided_at IS NULL`. The gate.
--   2. `patient_account_status` ENUM type — per schema-spec § 1.
--   3. `patients.is_canonical` BOOLEAN.
--   4. `patients.duplicate_of_patient_id` UUID (FK to patients.id).
--   5. Backfill of those two columns from `_patient_dedup_plan`.
--      Singletons (phones not in the plan) → is_canonical = TRUE.
--      Quarantined (normalized_phone IS NULL) → is_canonical = FALSE.
--   6. Audit-log: `PATIENT_DEDUP_FLAGGED` for every loser row.
--   7. `global_patients` table — using the ENUM type for `account_status`.
--   8. UNIQUE indexes + the active-claim partial index.
--   9. Touch trigger to keep `updated_at` current.
--  10. RLS DENY-ALL placeholder (real policies are Prompt 6, ORPH-V2-06).
--  11. Backfill `global_patients` from canonical patients rows
--      (one row per is_canonical = TRUE patient with non-null normalized_phone).
--  12. Audit-log: `GLOBAL_PATIENT_CREATED` for every backfilled row.
--  13. `patients.global_patient_id` UUID (FK to global_patients.id).
--  14. Backfill the pointer for every linkable patients row.
--  15. Pre-condition assertion that every non-quarantined patients row
--      now has a non-null global_patient_id (defends mig 075's NOT NULL
--      flip in Prompt 3 — see ORPH-V2-07).
--
-- DEPENDS ON:
--   - mig 071 (provides patients.normalized_phone column).
--   - mig 072 (provides _patient_dedup_plan; the gate keys off this).
--
-- REVERSIBLE. Companion: 073_create_global_patients.rollback.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 073.1 — PRE-FLIGHT ASSERTION (the gate).
-- ---------------------------------------------------------------------------
-- Refuses to run while any cluster in _patient_dedup_plan still has
-- decided_at IS NULL. That state is the explicit signal that Mo has not
-- yet reviewed a manual_review cluster. The error message names the
-- exact override SQL pattern for fastest recovery.
DO $$
DECLARE
  v_unresolved INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_unresolved
    FROM public._patient_dedup_plan
   WHERE decided_at IS NULL;
  IF v_unresolved > 0 THEN
    RAISE EXCEPTION
      'mig 073 blocked: % unresolved dedup clusters in _patient_dedup_plan. Mo must SET decided_at + decided_by on every manual_review row before this migration runs. See audits/dedup-resolution.md "How to override an auto-resolution" for the exact SQL.',
      v_unresolved;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 073.2 — patient_account_status ENUM type (Fix 4).
-- ---------------------------------------------------------------------------
-- Schema-spec § 1 defines this as a real ENUM. CREATE TYPE has no
-- IF NOT EXISTS in Postgres before 14, so wrap in a DO block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'patient_account_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.patient_account_status AS ENUM (
      'active',
      'suspended',
      'locked',
      'deceased',
      'merged'
    );
  END IF;
END $$;

COMMENT ON TYPE public.patient_account_status IS
  'Lifecycle state for a global_patients row. Spec: audits/patient-identity-schema-spec.md § 1. Distinct from patient_clinic_status (per-clinic relationship status, e.g. dormant/archived) — those are clinic-level and ship in mig 074.';

-- ---------------------------------------------------------------------------
-- 073.3 — Patients dedup-flag columns (consumed from mig 072 plan).
-- ---------------------------------------------------------------------------
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS is_canonical BOOLEAN;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS duplicate_of_patient_id UUID
  REFERENCES public.patients(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.patients.is_canonical IS
  'TRUE on the winning row of a normalized_phone duplicate cluster (from _patient_dedup_plan). Singletons are TRUE by default. Rows with NULL normalized_phone are FALSE (quarantined). NULL only transiently between this migration’s ALTER and its UPDATE.';

COMMENT ON COLUMN public.patients.duplicate_of_patient_id IS
  'On non-canonical duplicates, points at the canonical patients.id selected by mig 072 _patient_dedup_plan. NULL on canonical rows and singletons.';

-- ---------------------------------------------------------------------------
-- 073.4 — Backfill is_canonical / duplicate_of_patient_id from
--          _patient_dedup_plan + singleton rule + quarantine rule.
-- ---------------------------------------------------------------------------
-- (a) Winners from the plan: is_canonical = TRUE, duplicate_of_patient_id = NULL.
UPDATE public.patients p
   SET is_canonical = TRUE,
       duplicate_of_patient_id = NULL
  FROM public._patient_dedup_plan plan
 WHERE p.id = plan.winner_patient_id
   AND (p.is_canonical IS DISTINCT FROM TRUE
        OR p.duplicate_of_patient_id IS NOT NULL);

-- (b) Losers from the plan: is_canonical = FALSE, duplicate_of_patient_id = winner.
UPDATE public.patients p
   SET is_canonical = FALSE,
       duplicate_of_patient_id = plan.winner_patient_id
  FROM public._patient_dedup_plan plan
 WHERE p.id = ANY(plan.loser_patient_ids)
   AND (p.is_canonical IS DISTINCT FROM FALSE
        OR p.duplicate_of_patient_id IS DISTINCT FROM plan.winner_patient_id);

-- (c) Singletons: phones with normalized_phone but NOT in any plan row.
--     They're canonical by definition (cluster size 1).
UPDATE public.patients p
   SET is_canonical = TRUE,
       duplicate_of_patient_id = NULL
 WHERE p.normalized_phone IS NOT NULL
   AND p.is_canonical IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM public._patient_dedup_plan plan
      WHERE plan.normalized_phone = p.normalized_phone
   );

-- (d) Quarantined rows (normalized_phone IS NULL): mark FALSE so we
--     never treat them as canonical in the global_patients backfill.
UPDATE public.patients
   SET is_canonical = FALSE
 WHERE normalized_phone IS NULL
   AND is_canonical IS NULL;

-- ---------------------------------------------------------------------------
-- 073.5 — Audit-log every loser row (PATIENT_DEDUP_FLAGGED).
-- ---------------------------------------------------------------------------
-- Wrapped in a sub-block so a shape-mismatch in audit_events doesn't
-- abort the migration; the audit row is nice-to-have, not load-bearing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'audit_events'
  ) THEN
    BEGIN
      INSERT INTO public.audit_events (
        clinic_id, actor_user_id, action, entity_type, entity_id, metadata
      )
      SELECT
        NULL,
        NULL,
        'PATIENT_DEDUP_FLAGGED',
        'patients',
        p.id,
        jsonb_build_object(
          'source', 'migration_073',
          'is_canonical', p.is_canonical,
          'duplicate_of_patient_id', p.duplicate_of_patient_id,
          'normalized_phone', p.normalized_phone
        )
      FROM public.patients p
      WHERE p.duplicate_of_patient_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.audit_events ae
           WHERE ae.action = 'PATIENT_DEDUP_FLAGGED'
             AND ae.entity_id = p.id
             AND ae.metadata->>'source' = 'migration_073'
        );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'audit_events PATIENT_DEDUP_FLAGGED insert skipped (mismatched shape): %', SQLERRM;
    END;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 073.6 — global_patients table (Fix 4: ENUM type, not TEXT CHECK).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.global_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity (load-bearing UNIQUE).
  normalized_phone TEXT NOT NULL,
  legacy_phone TEXT,

  -- Demographics carried forward from the canonical patients row.
  display_name TEXT,
  date_of_birth DATE,
  age INTEGER CHECK (age IS NULL OR (age >= 0 AND age <= 120)),
  sex TEXT CHECK (sex IS NULL OR sex IN ('Male','Female','Other','prefer_not_to_say')),
  preferred_language TEXT NOT NULL DEFAULT 'ar',

  -- Auth claim — per migration plan Step 3 "Claim Migration", every
  -- backfilled row starts unclaimed. The patient app's first-login
  -- flow calls claim_or_create_global_patient (Prompt 10) to flip
  -- this. NEVER infer claim from "users row exists" — see
  -- ORPH-V2-01.
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_at TIMESTAMPTZ,
  claimed_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Lifecycle. Fix 4: spec-defined ENUM, not TEXT-with-CHECK.
  account_status public.patient_account_status NOT NULL DEFAULT 'active',
  merged_into UUID REFERENCES public.global_patients(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  deceased_at TIMESTAMPTZ,

  -- Anonymous research opt-in (default FALSE per Egypt PDPL 151/2020 Art.12).
  consent_to_anonymous_research BOOLEAN NOT NULL DEFAULT FALSE,
  consent_to_anonymous_research_at TIMESTAMPTZ,

  -- Bookkeeping.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Invariants.
  CONSTRAINT global_patients_phone_e164_chk
    CHECK (normalized_phone ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT global_patients_claim_consistency_chk
    CHECK (
      (claimed = FALSE AND claimed_user_id IS NULL AND claimed_at IS NULL)
      OR (claimed = TRUE AND claimed_user_id IS NOT NULL AND claimed_at IS NOT NULL)
    ),
  CONSTRAINT global_patients_merge_consistency_chk
    CHECK (
      (account_status = 'merged' AND merged_into IS NOT NULL)
      OR (account_status <> 'merged' AND merged_into IS NULL)
    ),
  CONSTRAINT global_patients_deceased_consistency_chk
    CHECK (
      (account_status = 'deceased' AND deceased_at IS NOT NULL)
      OR (account_status <> 'deceased')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS global_patients_normalized_phone_uniq
  ON public.global_patients (normalized_phone);

CREATE UNIQUE INDEX IF NOT EXISTS global_patients_claimed_user_id_uniq
  ON public.global_patients (claimed_user_id)
  WHERE claimed_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS global_patients_claimed_user_id_active_idx
  ON public.global_patients (claimed_user_id)
  WHERE account_status = 'active';

COMMENT ON TABLE public.global_patients IS
  'Source of truth for patient identity. One row per real human, keyed by E.164 normalized_phone. Backfilled from canonical patients rows by mig 073.';
COMMENT ON COLUMN public.global_patients.normalized_phone IS
  'E.164 phone — the only globally unique identity key.';
COMMENT ON COLUMN public.global_patients.legacy_phone IS
  'Original non-normalized form preserved during cut-over.';
COMMENT ON COLUMN public.global_patients.merged_into IS
  'When a duplicate is collapsed, loser points to winner. RESTRICT on delete preserves audit chain.';
COMMENT ON COLUMN public.global_patients.account_status IS
  'patient_account_status ENUM. Spec: audits/patient-identity-schema-spec.md § 2.';

-- ---------------------------------------------------------------------------
-- 073.7 — Touch trigger to keep updated_at current.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_global_patients_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_global_patients_touch_updated ON public.global_patients;
CREATE TRIGGER trg_global_patients_touch_updated
BEFORE UPDATE ON public.global_patients
FOR EACH ROW EXECUTE FUNCTION public.touch_global_patients_updated_at();

-- ---------------------------------------------------------------------------
-- 073.8 — RLS placeholder: DENY-ALL to authenticated. Real policies in
-- Prompt 6 (ORPH-V2-06).
-- ---------------------------------------------------------------------------
ALTER TABLE public.global_patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS global_patients_deny_all ON public.global_patients;
CREATE POLICY global_patients_deny_all ON public.global_patients
  FOR ALL TO authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

COMMENT ON POLICY global_patients_deny_all ON public.global_patients IS
  'PLACEHOLDER. Replaced by self/clinic/caregiver policies in Prompt 6 (ORPH-V2-06).';

-- ---------------------------------------------------------------------------
-- 073.9 — Backfill global_patients from canonical patient rows.
-- ---------------------------------------------------------------------------
-- One row per is_canonical = TRUE patient with non-null normalized_phone.
-- Idempotent: ON CONFLICT (normalized_phone) DO NOTHING.
--
-- account_status mapping (spec ENUM has no 'dormant' — that's a
-- patient_clinic_status concept):
--   * legacy 'dormant' / 'merged' / NULL / unknown → 'active'
--   * legacy 'active' / 'suspended' / 'locked' / 'deceased' → pass through
INSERT INTO public.global_patients (
  id,
  normalized_phone,
  legacy_phone,
  display_name,
  age,
  sex,
  account_status,
  created_at,
  updated_at
)
SELECT
  p.id,                            -- preserve UUID for FK ease in mig 075
  p.normalized_phone,
  p.phone,                         -- raw legacy form
  p.full_name,
  p.age,
  p.sex,
  CASE
    WHEN p.account_status = 'active'    THEN 'active'::public.patient_account_status
    WHEN p.account_status = 'suspended' THEN 'suspended'::public.patient_account_status
    WHEN p.account_status = 'locked'    THEN 'locked'::public.patient_account_status
    WHEN p.account_status = 'deceased'  THEN 'deceased'::public.patient_account_status
    ELSE 'active'::public.patient_account_status
  END,
  p.created_at,
  NOW()
FROM public.patients p
WHERE p.normalized_phone IS NOT NULL
  AND p.is_canonical = TRUE
ON CONFLICT (normalized_phone) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 073.10 — Audit-log every global_patients backfill (GLOBAL_PATIENT_CREATED).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'audit_events'
  ) THEN
    BEGIN
      INSERT INTO public.audit_events (
        clinic_id, actor_user_id, action, entity_type, entity_id, metadata
      )
      SELECT
        NULL,
        NULL,
        'GLOBAL_PATIENT_CREATED',
        'global_patients',
        gp.id,
        jsonb_build_object('source','migration_073_backfill')
        FROM public.global_patients gp
       WHERE NOT EXISTS (
         SELECT 1 FROM public.audit_events ae
          WHERE ae.action = 'GLOBAL_PATIENT_CREATED'
            AND ae.entity_id = gp.id
            AND ae.metadata->>'source' = 'migration_073_backfill'
       );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'audit_events GLOBAL_PATIENT_CREATED insert skipped (mismatched shape): %', SQLERRM;
    END;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 073.11 — patients.global_patient_id pointer column.
-- ---------------------------------------------------------------------------
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS global_patient_id UUID
  REFERENCES public.global_patients(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_patients_global_patient_id
  ON public.patients(global_patient_id);

COMMENT ON COLUMN public.patients.global_patient_id IS
  'FK to global_patients. Populated by mig 073 from normalized_phone match. NULL only for quarantined rows (normalized_phone IS NULL). NOT NULL flip is owed by Prompt 3 (ORPH-V2-07).';

-- ---------------------------------------------------------------------------
-- 073.12 — Backfill global_patient_id on every patients row that has
--          a normalized_phone match in global_patients.
-- ---------------------------------------------------------------------------
UPDATE public.patients p
   SET global_patient_id = gp.id
  FROM public.global_patients gp
 WHERE gp.normalized_phone = p.normalized_phone
   AND p.global_patient_id IS NULL;

-- ---------------------------------------------------------------------------
-- 073.13 — Pre-condition assertion: every non-quarantined patients row
--          has a non-null global_patient_id. Defends Prompt 3's NOT NULL
--          flip (ORPH-V2-07).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_unquarantined_null INT;
BEGIN
  SELECT COUNT(*)::INT
    INTO v_unquarantined_null
    FROM public.patients p
   WHERE p.global_patient_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public._phone_normalize_quarantine q
        WHERE q.table_name = 'patients' AND q.row_id = p.id
     );
  IF v_unquarantined_null > 0 THEN
    RAISE EXCEPTION 'mig 073 abort: % patients rows have NULL global_patient_id and are NOT in quarantine. Resolve via dedup-resolution.md before retry.', v_unquarantined_null;
  END IF;
END $$;

-- We intentionally DO NOT add NOT NULL on patients.global_patient_id
-- in this migration. Quarantined rows (normalized_phone IS NULL) MUST
-- remain NULL until human review. The NOT NULL flip is owed by
-- Prompt 3 — registered in orphan ledger as ORPH-V2-07.

-- ============================================================================
-- POST-CONDITIONS (run by hand or by migration test harness)
-- ============================================================================
--   -- Every cluster's winner has is_canonical = TRUE in patients:
--   SELECT COUNT(*) FROM public._patient_dedup_plan p
--   LEFT JOIN public.patients pt ON pt.id = p.winner_patient_id
--   WHERE pt.is_canonical IS DISTINCT FROM TRUE;
--   -- Expect: 0
--
--   -- Every cluster's loser has is_canonical = FALSE and points to winner:
--   SELECT COUNT(*) FROM public._patient_dedup_plan p
--   JOIN unnest(p.loser_patient_ids) WITH ORDINALITY l(loser_id, n) ON TRUE
--   LEFT JOIN public.patients pt ON pt.id = l.loser_id
--   WHERE pt.is_canonical IS DISTINCT FROM FALSE
--      OR pt.duplicate_of_patient_id IS DISTINCT FROM p.winner_patient_id;
--   -- Expect: 0
--
--   -- global_patients count = canonical unique normalized_phones in patients:
--   SELECT
--     (SELECT COUNT(DISTINCT normalized_phone) FROM public.patients
--       WHERE normalized_phone IS NOT NULL AND is_canonical = TRUE) AS canonical_unique_phones,
--     (SELECT COUNT(*) FROM public.global_patients) AS global_patients_count;
--   -- Expect: equal.
--
--   -- Every backfilled global_patients row is unclaimed:
--   SELECT COUNT(*) FROM public.global_patients
--    WHERE claimed = TRUE OR claimed_at IS NOT NULL OR claimed_user_id IS NOT NULL;
--   -- Expect: 0.
--
--   -- Every patients row with normalized_phone is linked:
--   SELECT COUNT(*) FROM public.patients
--    WHERE normalized_phone IS NOT NULL AND global_patient_id IS NULL;
--   -- Expect: 0.
--
--   -- UNIQUE on global_patients.normalized_phone holds:
--   SELECT normalized_phone, COUNT(*) FROM public.global_patients
--    GROUP BY 1 HAVING COUNT(*) > 1;
--   -- Expect: 0 rows.
-- ============================================================================
