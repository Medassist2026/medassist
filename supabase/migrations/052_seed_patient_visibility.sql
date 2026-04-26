-- ============================================================================
-- Migration 052: Seed patient_visibility from doctor_patient_relationships
-- ============================================================================
-- Replicates the INSERT at the tail of mig 020 (lines 141-164). That INSERT
-- effectively never landed: today (2026-04-25) patient_visibility holds 2
-- hand-created rows, while doctor_patient_relationships has ~32 active rows
-- with non-null clinic_id. Without seeded visibility, the new
-- can_access_patient() function (mig 054) will return FALSE for almost
-- every legitimate doctor->patient pair the moment we route the per-table
-- policies (mig 055-065) through it.
--
-- Differences from mig 020's INSERT (deliberate, documented in
-- docs/investigations/RLS_REWRITE_PLAN.md section "Mig 052"):
--
--   1. The mig 020 INSERT used `ON CONFLICT DO NOTHING` but
--      patient_visibility never had a UNIQUE constraint to conflict on.
--      Without one, ON CONFLICT DO NOTHING is a silent no-op on every row.
--      We replace it with `WHERE NOT EXISTS (...)` so re-running this
--      migration is safe and the existing 2 hand-created rows are not
--      duplicated.
--
--   2. We add a partial UNIQUE index BEFORE the seed so future inserts
--      from app code cannot accidentally create duplicate doctor grants.
--      The index is partial (DOCTOR grants only) because ROLE grants may
--      legitimately repeat for the same clinic+patient (e.g. one row per
--      role).
--
-- This migration depends on:
--   - public.patient_visibility table exists (it does - mig 020 created it)
--   - public.doctor_patient_relationships.clinic_id column exists
--     (it does - earlier mig populated it; mig 051 made other clinic_id
--     columns NOT NULL)
--
-- This migration does NOT depend on the new enums (mig 053) or functions
-- (mig 054). The mode/consent values inserted are still TEXT today and
-- match the CHECK constraint domain. Mig 053 will convert them to enums.
-- ============================================================================

-- Step 1: Partial UNIQUE index. Prevents duplicate DOCTOR grants for the
-- same (clinic, patient) pair. Uses CREATE INDEX IF NOT EXISTS so
-- re-running the migration is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_patient_visibility_doctor_grant
  ON public.patient_visibility (clinic_id, patient_id, grantee_user_id)
  WHERE grantee_type = 'DOCTOR';

-- Step 2: Seed visibility from active DPRs.
--
-- Predicates:
--   dpr.status = 'active'         -> ignore revoked/inactive relationships
--   dpr.clinic_id IS NOT NULL     -> a DPR without a clinic cannot produce
--                                    a clinic-scoped visibility row
--   NOT EXISTS (...)              -> idempotency: skip rows that already
--                                    exist (the 2 hand-created ones, plus
--                                    anything inserted between this
--                                    migration being authored and applied)
--
-- DISTINCT guards against the rare case where a DPR appears twice (e.g.
-- separate active rows for the same doctor+patient+clinic).
INSERT INTO public.patient_visibility (
  clinic_id,
  patient_id,
  grantee_type,
  grantee_user_id,
  mode,
  consent
)
SELECT DISTINCT
  dpr.clinic_id,
  dpr.patient_id,
  'DOCTOR',
  dpr.doctor_id,
  'DOCTOR_SCOPED_OWNER',
  'IMPLICIT_CLINIC_POLICY'
FROM public.doctor_patient_relationships dpr
WHERE dpr.status = 'active'
  AND dpr.clinic_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.patient_visibility pv
    WHERE pv.clinic_id = dpr.clinic_id
      AND pv.patient_id = dpr.patient_id
      AND pv.grantee_type = 'DOCTOR'
      AND pv.grantee_user_id = dpr.doctor_id
  );

-- ============================================================================
-- Post-migration verification (run manually after apply_migration):
--
--   -- Every active clinic-scoped DPR should produce a visibility row.
--   -- Expected: 0 rows.
--   SELECT COUNT(*) AS uncovered_dprs
--   FROM public.doctor_patient_relationships dpr
--   WHERE dpr.status = 'active'
--     AND dpr.clinic_id IS NOT NULL
--     AND NOT EXISTS (
--       SELECT 1 FROM public.patient_visibility pv
--       WHERE pv.clinic_id = dpr.clinic_id
--         AND pv.patient_id = dpr.patient_id
--         AND pv.grantee_type = 'DOCTOR'
--         AND pv.grantee_user_id = dpr.doctor_id
--     );
--
--   -- Total row count should land between dpr_active_with_clinic (32)
--   -- and dpr_active_with_clinic + pre_existing_pv_rows (32 + 2 = 34),
--   -- depending on whether the 2 hand-created rows duplicate any DPR.
--   SELECT COUNT(*) AS pv_total FROM public.patient_visibility;
-- ============================================================================
