-- ============================================================================
-- Migration 053: Enums + clinic columns + appointments.clinic_id NOT NULL
-- ============================================================================
-- Brings the schema up to mig 020/021's enum contract and finishes the
-- clinic_id NOT NULL invariant that mig 051 missed for appointments.
--
-- Five logical steps, in this order (order matters):
--
--   1. CREATE the 4 enums missing from mig 020 (visibility_mode,
--      consent_type, assignment_scope, assignment_status). DO/EXCEPTION
--      pattern matches mig 020 so this is safe to re-run.
--
--   2. Backfill appointments.clinic_id from patients.clinic_id (3 NULL
--      rows on the live DB as of audit; all 3 patient.clinic_ids are
--      clinics the doctor is an active member of, so the backfill is
--      deterministic).
--
--   3. ALTER appointments.clinic_id SET NOT NULL (closes the gap mig 051
--      left).
--
--   4. Convert 4 TEXT columns to enum types. Sequence per column is:
--      drop default -> drop CHECK -> ALTER TYPE -> add new default. The
--      grantee_type column stays TEXT (mig 020 specified TEXT with CHECK).
--      assistant_doctor_assignments.scope's existing default 'full' is
--      NOT in the enum domain, but the table is empty (0 rows) so the
--      USING cast is never evaluated; we just drop+replace the default.
--
--   5. Add clinics.default_visibility (visibility_mode) and
--      clinics.settings (jsonb). Mirrors mig 021 lines 334-336.
--
-- Dependencies:
--   - Mig 052 (patient_visibility seeded) — not strictly required, but
--     pre-conditions for mig 054 are now in line.
--   - clinic_role enum exists (it does — added by an earlier migration).
--
-- Reversibility note:
--   - CREATE TYPE is rollback-safe inside a transaction.
--   - ALTER COLUMN ... TYPE is rollback-safe.
--   - The whole migration runs in one implicit transaction (Supabase
--     wraps apply_migration), so a failure at any step leaves the DB
--     untouched.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Step 1: Enums
-- ----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE visibility_mode AS ENUM (
    'DOCTOR_SCOPED_OWNER',
    'CLINIC_WIDE',
    'SHARED_BY_CONSENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE consent_type AS ENUM (
    'IMPLICIT_CLINIC_POLICY',
    'DOCTOR_TO_DOCTOR_TRANSFER',
    'PATIENT_CONSENT_CODE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE assignment_scope AS ENUM (
    'APPOINTMENTS_ONLY',
    'PATIENT_DEMOGRAPHICS',
    'FULL_DOCTOR_SUPPORT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE assignment_status AS ENUM (
    'ACTIVE',
    'REVOKED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- Step 2: Backfill appointments.clinic_id from patients.clinic_id
-- ----------------------------------------------------------------------------
-- 3 rows expected per the pre-flight audit; all resolvable.
UPDATE public.appointments a
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE a.patient_id = p.id
  AND a.clinic_id IS NULL;

-- ----------------------------------------------------------------------------
-- Step 3: SET NOT NULL on appointments.clinic_id (idempotent guard)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'clinic_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.appointments
      ALTER COLUMN clinic_id SET NOT NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Step 4: TEXT -> enum conversions
-- ----------------------------------------------------------------------------

-- 4a. assistant_doctor_assignments.scope
--     Current default 'full' is NOT in the enum domain. 0 rows, so the
--     USING cast is never evaluated.
ALTER TABLE public.assistant_doctor_assignments
  ALTER COLUMN scope DROP DEFAULT;

ALTER TABLE public.assistant_doctor_assignments
  ALTER COLUMN scope TYPE assignment_scope
  USING scope::assignment_scope;

ALTER TABLE public.assistant_doctor_assignments
  ALTER COLUMN scope SET DEFAULT 'APPOINTMENTS_ONLY'::assignment_scope;

-- 4b. assistant_doctor_assignments.status
ALTER TABLE public.assistant_doctor_assignments
  DROP CONSTRAINT IF EXISTS assistant_doctor_assignments_status_check;

ALTER TABLE public.assistant_doctor_assignments
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.assistant_doctor_assignments
  ALTER COLUMN status TYPE assignment_status
  USING status::assignment_status;

ALTER TABLE public.assistant_doctor_assignments
  ALTER COLUMN status SET DEFAULT 'ACTIVE'::assignment_status;

-- 4c. patient_visibility.mode
ALTER TABLE public.patient_visibility
  DROP CONSTRAINT IF EXISTS patient_visibility_mode_check;

ALTER TABLE public.patient_visibility
  ALTER COLUMN mode DROP DEFAULT;

ALTER TABLE public.patient_visibility
  ALTER COLUMN mode TYPE visibility_mode
  USING mode::visibility_mode;

ALTER TABLE public.patient_visibility
  ALTER COLUMN mode SET DEFAULT 'DOCTOR_SCOPED_OWNER'::visibility_mode;

-- 4d. patient_visibility.consent
ALTER TABLE public.patient_visibility
  DROP CONSTRAINT IF EXISTS patient_visibility_consent_check;

ALTER TABLE public.patient_visibility
  ALTER COLUMN consent DROP DEFAULT;

ALTER TABLE public.patient_visibility
  ALTER COLUMN consent TYPE consent_type
  USING consent::consent_type;

ALTER TABLE public.patient_visibility
  ALTER COLUMN consent SET DEFAULT 'IMPLICIT_CLINIC_POLICY'::consent_type;

-- (patient_visibility.grantee_type stays TEXT with its CHECK constraint —
-- mig 020 specified TEXT, not enum.)

-- ----------------------------------------------------------------------------
-- Step 5: clinics.default_visibility + clinics.settings
-- ----------------------------------------------------------------------------
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS default_visibility visibility_mode
    DEFAULT 'DOCTOR_SCOPED_OWNER'::visibility_mode;

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS settings jsonb
    DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.clinics.default_visibility IS
  'Default patient visibility mode for new patients. Solo clinics should use DOCTOR_SCOPED_OWNER, centers can use CLINIC_WIDE.';
COMMENT ON COLUMN public.clinics.settings IS
  'Clinic-level configuration and settings stored as JSON.';

-- ============================================================================
-- Post-migration verification (run manually):
--
--   -- All 4 enums present
--   SELECT typname FROM pg_type
--   WHERE typname IN ('visibility_mode','consent_type','assignment_scope','assignment_status')
--   ORDER BY typname;  -- expect 4 rows
--
--   -- All 4 columns are now enum-typed
--   SELECT table_name, column_name, udt_name
--   FROM information_schema.columns
--   WHERE table_schema='public'
--     AND (table_name,column_name) IN (
--       ('assistant_doctor_assignments','scope'),
--       ('assistant_doctor_assignments','status'),
--       ('patient_visibility','mode'),
--       ('patient_visibility','consent')
--     );
--
--   -- appointments.clinic_id is NOT NULL
--   SELECT is_nullable FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='appointments' AND column_name='clinic_id';
--   -- expect 'NO'
--
--   -- clinics has the new columns and they are populated for every row
--   SELECT COUNT(*) FROM public.clinics WHERE default_visibility IS NULL;
--   -- expect 0
-- ============================================================================
