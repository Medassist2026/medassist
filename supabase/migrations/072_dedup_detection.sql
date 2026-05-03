-- ============================================================================
-- Migration 072 — Patient phone dedup DETECTION (no consumption).
-- Implements: patient-identity-migration-plan.md Step 2.
--
-- BUILD prompt: Patient Identity Build 02 (restored by Build 02 follow-up
-- Fix 1 + Fix 2). The previous shape compressed detection into mig 071
-- and consumption into mig 072 — losing the human-review gate the
-- migration plan deliberately introduced. This migration RESTORES that
-- gate as a real migration boundary.
--
-- WHAT IT ADDS (read-only — does NOT mutate `patients.*`)
--   1. `_patient_phone_duplicates` view — clusters of patient rows
--      sharing a normalized_phone.
--   2. `_user_phone_duplicates` view — same for users.
--   3. `_patient_dedup_plan` table — per-cluster, per-row decision
--      surface. Auto-resolved (cluster size 2) entries are written
--      with `resolution = 'auto_oldest_wins'`, `decided_at = NOW()`,
--      `decided_by = NULL`. Manual-review (cluster size 3+) entries
--      are written with `resolution = 'manual_review'`, `decided_at =
--      NULL`. Mig 073's pre-flight assertion REFUSES to run while any
--      `decided_at IS NULL` row remains — that's the gate.
--   4. Auto-population of `_patient_dedup_plan` from
--      `_patient_phone_duplicates`.
--
-- WHAT IT DOES NOT DO
--   - Does NOT add `is_canonical` / `duplicate_of_patient_id` columns.
--     Those land in mig 073 once Mo signs off on `_patient_dedup_plan`.
--   - Does NOT write `PATIENT_DEDUP_FLAGGED` audit rows. Those land in
--     mig 073 next to the actual flag write on `patients`.
--   - Does NOT touch `global_patients` (created in mig 073).
--   - Does NOT touch `_phone_normalize_quarantine` (mig 071 owns that).
--
-- DEPENDS ON: mig 071 (provides patients.normalized_phone column +
-- users.normalized_phone column).
--
-- REVERSIBLE. Companion: 072_dedup_detection.rollback.sql.
-- ============================================================================

-- 072.1 — Detection: duplicate clusters in public.patients on normalized_phone.
-- The patient_ids array is ordered by (created_at ASC, id ASC) so the
-- auto-population below can index `[1]` for "oldest wins" deterministically.
CREATE OR REPLACE VIEW public._patient_phone_duplicates AS
SELECT
  normalized_phone,
  COUNT(*)::INT AS dup_count,
  array_agg(id ORDER BY created_at, id)         AS patient_ids,
  array_agg(clinic_id ORDER BY created_at, id)  AS clinic_ids,
  array_agg(full_name ORDER BY created_at, id)  AS full_names,
  MIN(created_at) AS earliest_created,
  MAX(created_at) AS latest_created
FROM public.patients
WHERE normalized_phone IS NOT NULL
GROUP BY normalized_phone
HAVING COUNT(*) > 1;

COMMENT ON VIEW public._patient_phone_duplicates IS
  'Duplicate clusters keyed by normalized_phone. Inputs to _patient_dedup_plan auto-population (mig 072) and audits/dedup-resolution.md cluster inventory (Mo, post-stage).';

-- 072.2 — Detection: duplicate clusters in public.users on normalized_phone.
-- The migration plan calls for parity with the patients view. Per Mo's
-- locked decision, users-side dedup resolution is owed to Prompt 3 — this
-- migration only emits the detection surface.
CREATE OR REPLACE VIEW public._user_phone_duplicates AS
SELECT
  normalized_phone,
  COUNT(*)::INT AS dup_count,
  array_agg(id ORDER BY created_at, id) AS user_ids,
  MIN(created_at) AS earliest_created,
  MAX(created_at) AS latest_created
FROM public.users
WHERE normalized_phone IS NOT NULL
GROUP BY normalized_phone
HAVING COUNT(*) > 1;

COMMENT ON VIEW public._user_phone_duplicates IS
  'Duplicate clusters keyed by normalized_phone in public.users. Read-only surface for Prompt 3 user/global identity reconciliation. Not consumed by mig 073 (which only operates on patients dedup).';

-- 072.3 — `_patient_dedup_plan`: the human-review-and-override surface.
-- Per Fix 2's locked decision, this is the persisted dedup decision
-- table. Mig 073 reads it to decide which patients row becomes the
-- canonical winner of a cluster.
CREATE TABLE IF NOT EXISTS public._patient_dedup_plan (
  normalized_phone TEXT PRIMARY KEY,
  winner_patient_id UUID NOT NULL,
  loser_patient_ids UUID[] NOT NULL,
  resolution TEXT NOT NULL CHECK (resolution IN (
    'auto_oldest_wins',
    'manual_review'
  )),
  -- NULL for auto-rule rows (system decision, no actor).
  -- auth.users.id for human-overridden rows (Mo or a delegated reviewer).
  decided_by UUID,
  -- NULL until the cluster is resolved. Mig 073 refuses to run while
  -- any row has decided_at IS NULL.
  decided_at TIMESTAMPTZ,
  -- Override reasoning. Required for manual_review rows once a human
  -- supplies decided_by. Optional for auto-rule rows.
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public._patient_dedup_plan IS
  'Per-cluster dedup decision surface. Auto-resolved clusters (size 2) get decided_at = NOW() at insert time. Manual-review clusters (size 3+) get decided_at = NULL until Mo reviews and updates. Mig 073 asserts no row has decided_at IS NULL before consuming.';

COMMENT ON COLUMN public._patient_dedup_plan.notes IS
  'Override reasoning. Required for manual_review rows where decided_by IS NOT NULL. Optional for auto rows.';

-- 072.4 — Auto-populate `_patient_dedup_plan`.
-- Insert one row per cluster reported by the detection view:
--   * Cluster size 2  → resolution = 'auto_oldest_wins',
--                        decided_at = NOW(),
--                        decided_by = NULL (system).
--   * Cluster size 3+ → resolution = 'manual_review',
--                        decided_at = NULL (gate signal),
--                        winner_patient_id = oldest as placeholder
--                          (Mo can override before mig 073 runs).
--
-- Idempotent: ON CONFLICT (normalized_phone) DO NOTHING. Existing rows
-- (e.g. ones Mo has already overridden) are not stomped on re-run.
INSERT INTO public._patient_dedup_plan (
  normalized_phone,
  winner_patient_id,
  loser_patient_ids,
  resolution,
  decided_by,
  decided_at,
  notes
)
SELECT
  d.normalized_phone,
  d.patient_ids[1]                            AS winner_patient_id,
  d.patient_ids[2:array_length(d.patient_ids, 1)] AS loser_patient_ids,
  CASE WHEN d.dup_count = 2 THEN 'auto_oldest_wins'
       ELSE 'manual_review'
  END                                         AS resolution,
  NULL::UUID                                  AS decided_by,
  CASE WHEN d.dup_count = 2 THEN NOW()
       ELSE NULL
  END                                         AS decided_at,
  NULL                                        AS notes
FROM public._patient_phone_duplicates d
ON CONFLICT (normalized_phone) DO NOTHING;

-- ============================================================================
-- POST-CONDITIONS (run by hand or by migration test harness)
-- ============================================================================
--   -- Every duplicate cluster has a row in _patient_dedup_plan:
--   SELECT COUNT(*) FROM public._patient_phone_duplicates d
--   LEFT JOIN public._patient_dedup_plan p ON p.normalized_phone = d.normalized_phone
--   WHERE p.normalized_phone IS NULL;
--   -- Expect: 0
--
--   -- Auto-resolved clusters have decided_at IS NOT NULL:
--   SELECT COUNT(*) FROM public._patient_dedup_plan
--   WHERE resolution = 'auto_oldest_wins' AND decided_at IS NULL;
--   -- Expect: 0
--
--   -- Manual_review clusters have decided_at IS NULL (gate signal):
--   SELECT COUNT(*) FROM public._patient_dedup_plan
--   WHERE resolution = 'manual_review' AND decided_at IS NOT NULL;
--   -- Expect: 0 immediately after mig 072.
--   -- Expect: > 0 after Mo reviews and signs off; mig 073 then accepts.
--
--   -- winner_patient_id is in the cluster's patient_ids array:
--   SELECT COUNT(*) FROM public._patient_dedup_plan p
--   JOIN public._patient_phone_duplicates d ON d.normalized_phone = p.normalized_phone
--   WHERE NOT (p.winner_patient_id = ANY(d.patient_ids));
--   -- Expect: 0
-- ============================================================================
