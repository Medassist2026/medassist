-- ============================================================================
-- Migration 078 — User-side dedup detection (mirrors mig 072 pattern)
--
-- Conceptual name in audits/EXECUTION_PROMPTS.md: mig 075.5.
--
-- Implements: Build 03 Phase B Step 5a (B5a).
--
-- WHY THIS MIGRATION EXISTS
--   Build 02's mig 072 detected patient-side dedup clusters and wrote
--   _patient_dedup_plan (one row per cluster, with auto vs. manual_review
--   resolution and a decided_at gate). Mig 073 then CONSUMED that plan
--   to write is_canonical / duplicate_of_patient_id flags. The
--   detection-from-consumption split exists so a human can review
--   ambiguous clusters before flags are written.
--
--   The user-side mirror was deliberately deferred to this prompt. Build
--   02 staging (2026-04-28) surfaced 4 clusters in _user_phone_duplicates,
--   all size 2. This migration creates _user_dedup_plan and populates
--   it from the view, applying the same gating semantics.
--
-- DEVIATION FROM SPEC (per Mo, 2026-04-29)
--   Per the Build 03 prompt's "Do both auto-rules now and surface
--   anomalies" workflow choice:
--     - Size 2 clusters: resolution='auto_oldest_wins', decided_at=NOW().
--     - Size 3+ clusters: ALSO 'auto_oldest_wins' with decided_at=NOW(),
--       but additionally tagged with notes='LARGE_CLUSTER_AUTO_RESOLVED'
--       and emitted as USER_DEDUP_LARGE_CLUSTER_AUTO_RESOLVED audit row.
--
--   The original spec called for size-3+ clusters to be 'manual_review'
--   with decided_at IS NULL — a hard gate that would block mig 079.
--   Mo's choice trades that gate for "auto-resolve + surface for
--   post-hoc review." Documented in Build 03 results §6.
--
--   On staging today (2026-04-29) every cluster is size 2, so the
--   deviation has no observable effect — but the code path is in place
--   for future scale.
--
-- WHAT IT ADDS
--   1. _user_dedup_plan table — same shape as _patient_dedup_plan, keyed
--      on normalized_phone, holding the user_ids array.
--   2. Auto-population from _user_phone_duplicates.
--   3. Cross-side parity check: SELECT that surfaces any cluster where
--      the patient-side and user-side winners point at different logical
--      people. Logged via USER_DEDUP_CROSS_SIDE_MISMATCH audit (NOT
--      auto-resolved — Mo reviews).
--
-- DEPENDS ON:
--   - mig 071/072 (provides users.normalized_phone + _user_phone_duplicates).
--   - mig 074 (audit_events accepts actor_kind='migration').
--
-- POST-CONDITIONS
--   _user_dedup_plan covers every row in _user_phone_duplicates.
--   No row in _user_dedup_plan has decided_at IS NULL (per the
--   deviation — auto-rules apply to all sizes).
--
-- REVERSIBLE. Companion: 078_user_dedup_detection.rollback.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 078.1 — Create _user_dedup_plan.
-- ---------------------------------------------------------------------------
-- Mirrors _patient_dedup_plan column-for-column with the obvious type
-- substitutions (winner_user_id, loser_user_ids). Same leading-underscore
-- naming convention to keep it out of the application's regular schema
-- views — this is migration-state, not domain state.
CREATE TABLE IF NOT EXISTS public._user_dedup_plan (
  normalized_phone TEXT PRIMARY KEY,
  winner_user_id UUID NOT NULL,
  loser_user_ids UUID[] NOT NULL,
  resolution TEXT NOT NULL
    CHECK (resolution IN ('auto_oldest_wins', 'manual_review')),
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public._user_dedup_plan IS
  'User-side dedup plan. Mirrors _patient_dedup_plan but for users. Migration-scoped (leading underscore + no RLS = service-role only). Consumed by mig 079 to write is_canonical / duplicate_of_user_id flags. Build 03 deviation: size-3+ clusters auto-resolve rather than manual_review.';

-- ---------------------------------------------------------------------------
-- 078.2 — Auto-populate from _user_phone_duplicates.
-- ---------------------------------------------------------------------------
-- Per the deviation: every cluster gets resolution='auto_oldest_wins'
-- and decided_at=NOW(). Notes column tags large clusters for forensics.
-- Idempotent via ON CONFLICT — re-applying this migration is a no-op.
INSERT INTO public._user_dedup_plan (
  normalized_phone,
  winner_user_id,
  loser_user_ids,
  resolution,
  decided_by,
  decided_at,
  notes,
  created_at
)
SELECT
  d.normalized_phone,
  -- Winner = oldest user (lowest created_at). Same rule as mig 072 for patients.
  (
    SELECT u.id FROM public.users u
     WHERE u.id = ANY(d.user_ids)
     ORDER BY u.created_at ASC
     LIMIT 1
  ) AS winner_user_id,
  -- Losers = the rest of the cluster.
  (
    SELECT array_agg(u.id ORDER BY u.created_at ASC)
      FROM public.users u
     WHERE u.id = ANY(d.user_ids)
       AND u.id <> (
         SELECT u2.id FROM public.users u2
          WHERE u2.id = ANY(d.user_ids)
          ORDER BY u2.created_at ASC
          LIMIT 1
       )
  ) AS loser_user_ids,
  'auto_oldest_wins',
  NULL,
  NOW(),
  CASE
    WHEN d.dup_count >= 3 THEN 'LARGE_CLUSTER_AUTO_RESOLVED (deviation per Build 03 prompt)'
    ELSE 'auto_oldest_wins (size 2)'
  END,
  NOW()
FROM public._user_phone_duplicates d
ON CONFLICT (normalized_phone) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 078.3 — Audit log for size-3+ clusters that auto-resolved (deviation).
-- ---------------------------------------------------------------------------
-- Idempotent via NOT EXISTS guard.
INSERT INTO public.audit_events (
  action, actor_kind, actor_user_id,
  entity_type, entity_id, metadata, created_at
)
SELECT
  'USER_DEDUP_LARGE_CLUSTER_AUTO_RESOLVED',
  'migration',
  NULL,
  'user_dedup_plan',
  NULL,                                                -- entity_id is NULL (no specific row)
  jsonb_build_object(
    'source', 'migration_078',
    'normalized_phone', p.normalized_phone,
    'cluster_size', 1 + array_length(p.loser_user_ids, 1),
    'winner_user_id', p.winner_user_id,
    'loser_user_ids', to_jsonb(p.loser_user_ids),
    'note', 'Cluster size 3+ auto-resolved per Build 03 prompt deviation; manually review at orphan-ledger ORPH-V3-03'
  ),
  NOW()
FROM public._user_dedup_plan p
WHERE array_length(p.loser_user_ids, 1) >= 2  -- 1 winner + 2+ losers = size 3+
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_events ae
     WHERE ae.action = 'USER_DEDUP_LARGE_CLUSTER_AUTO_RESOLVED'
       AND ae.metadata->>'source' = 'migration_078'
       AND ae.metadata->>'normalized_phone' = p.normalized_phone
  );

-- ---------------------------------------------------------------------------
-- 078.4 — Cross-side parity check.
-- ---------------------------------------------------------------------------
-- For every normalized_phone that appears in BOTH _patient_dedup_plan
-- AND _user_dedup_plan, check whether the patient-side and user-side
-- winners point at the same logical person. They should — patient and
-- user records for the same phone are typically created at the same
-- check-in event. If they don't match, log a USER_DEDUP_CROSS_SIDE_MISMATCH
-- audit row so Mo can review (does NOT block mig 079; Mo decides whether
-- to override the user-side winner before mig 079 runs).
--
-- Idempotent via NOT EXISTS guard.
INSERT INTO public.audit_events (
  action, actor_kind, actor_user_id,
  entity_type, entity_id, metadata, created_at
)
SELECT
  'USER_DEDUP_CROSS_SIDE_MISMATCH',
  'migration',
  NULL,
  'user_dedup_plan',
  NULL,
  jsonb_build_object(
    'source', 'migration_078',
    'normalized_phone', pp.normalized_phone,
    'patient_winner_id', pp.winner_patient_id,
    'user_winner_id', up.winner_user_id,
    'note', 'Patient-side winner and user-side winner do not share an id. May indicate a phone-correction follow-up or two-distinct-people-share-a-phone scenario. Reviewable at orphan-ledger ORPH-V3-03.'
  ),
  NOW()
FROM public._patient_dedup_plan pp
JOIN public._user_dedup_plan up
  ON up.normalized_phone = pp.normalized_phone
WHERE pp.winner_patient_id <> up.winner_user_id
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_events ae
     WHERE ae.action = 'USER_DEDUP_CROSS_SIDE_MISMATCH'
       AND ae.metadata->>'source' = 'migration_078'
       AND ae.metadata->>'normalized_phone' = pp.normalized_phone
  );

-- ---------------------------------------------------------------------------
-- 078.5 — Post-condition assertions.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_view_clusters INTEGER;
  v_plan_clusters INTEGER;
  v_undecided INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_view_clusters FROM public._user_phone_duplicates;
  SELECT COUNT(*) INTO v_plan_clusters FROM public._user_dedup_plan;

  IF v_plan_clusters < v_view_clusters THEN
    RAISE EXCEPTION
      'mig 078 post-condition failed: _user_dedup_plan covers % clusters, expected at least %',
      v_plan_clusters, v_view_clusters;
  END IF;

  -- Per the deviation, no cluster should be left undecided.
  SELECT COUNT(*) INTO v_undecided FROM public._user_dedup_plan
   WHERE decided_at IS NULL;

  IF v_undecided > 0 THEN
    RAISE EXCEPTION
      'mig 078 post-condition failed: % clusters in _user_dedup_plan have decided_at IS NULL (expected 0 per the auto-rules-now deviation)',
      v_undecided;
  END IF;
END $$;
