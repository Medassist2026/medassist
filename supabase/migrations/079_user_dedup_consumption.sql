-- ============================================================================
-- Migration 079 — User-side dedup consumption (mirrors mig 073 pattern)
--
-- Conceptual name in audits/EXECUTION_PROMPTS.md: mig 075.7.
--
-- Implements: Build 03 Phase B Step 5b (B5b).
--
-- WHY THIS MIGRATION EXISTS
--   Mig 078 created _user_dedup_plan and resolved every cluster (per
--   the auto-rules deviation). This migration writes the canonical
--   flags that downstream code reads:
--     - users.is_canonical BOOLEAN — mirror of patients.is_canonical
--     - users.duplicate_of_user_id UUID — mirror of patients.duplicate_of_patient_id
--
-- WHAT IT DOES
--   1. Pre-flight assertion: refuses to run if any _user_dedup_plan row
--      has decided_at IS NULL. Hard gate identical to mig 073.
--   2. ADD COLUMN users.is_canonical BOOLEAN (nullable initially —
--      backfilled below).
--   3. ADD COLUMN users.duplicate_of_user_id UUID FK → users(id).
--   4. Backfill from _user_dedup_plan:
--      - Winner ids → is_canonical=TRUE, duplicate_of_user_id=NULL.
--      - Loser ids → is_canonical=FALSE, duplicate_of_user_id=winner.
--   5. Backfill non-cluster users: is_canonical=TRUE.
--   6. ALTER COLUMN is_canonical SET NOT NULL (after backfill).
--   7. Index on (is_canonical) for canonical-set queries.
--   8. USER_DEDUP_FLAGGED audit per loser.
--
-- DEPENDS ON:
--   - mig 071 (users.normalized_phone exists).
--   - mig 074 (audit_events accepts actor_kind='migration').
--   - mig 078 (_user_dedup_plan exists and is fully resolved).
--
-- POST-CONDITIONS
--   Every user has is_canonical NOT NULL.
--   Every loser has is_canonical=FALSE and duplicate_of_user_id pointing
--     at its cluster's winner.
--   USER_DEDUP_FLAGGED audit count = total loser count across all
--     clusters in _user_dedup_plan.
--
-- LIFECYCLE
--   Forward-compat: legacy code paths that filter users by canonical
--   may not exist yet. Cleanup of legacy duplicate user rows is Prompt
--   6.5; this migration only ADDS the flags, never deletes.
--
-- REVERSIBLE. Companion: 079_user_dedup_consumption.rollback.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 079.1 — Pre-flight assertion (the gate).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_unresolved INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_unresolved
    FROM public._user_dedup_plan
   WHERE decided_at IS NULL;

  IF v_unresolved > 0 THEN
    RAISE EXCEPTION
      'mig 079 blocked: % unresolved user dedup clusters in _user_dedup_plan. Mo must SET decided_at + decided_by on every manual_review row before this migration runs. Override pattern: UPDATE _user_dedup_plan SET decided_at = NOW(), decided_by = ''<mo-user-id>'', notes = ''reviewed: keep oldest'' WHERE normalized_phone = ''<phone>'';',
      v_unresolved;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 079.2 — Add columns to users.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_canonical BOOLEAN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS duplicate_of_user_id UUID
    REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.users.is_canonical IS
  'TRUE for the canonical user in a phone-dedup cluster (or for users with no duplicates). FALSE for non-canonical losers. Backfilled by mig 079 from _user_dedup_plan.';

COMMENT ON COLUMN public.users.duplicate_of_user_id IS
  'Pointer from a non-canonical user to its canonical winner. NULL when is_canonical=TRUE. Mirrors patients.duplicate_of_patient_id.';

-- ---------------------------------------------------------------------------
-- 079.3 — Backfill: winners → TRUE.
-- ---------------------------------------------------------------------------
UPDATE public.users u
   SET is_canonical = TRUE,
       duplicate_of_user_id = NULL
  FROM public._user_dedup_plan p
 WHERE u.id = p.winner_user_id;

-- ---------------------------------------------------------------------------
-- 079.4 — Backfill: losers → FALSE + pointer.
-- ---------------------------------------------------------------------------
UPDATE public.users u
   SET is_canonical = FALSE,
       duplicate_of_user_id = p.winner_user_id
  FROM public._user_dedup_plan p
 WHERE u.id = ANY(p.loser_user_ids);

-- ---------------------------------------------------------------------------
-- 079.5 — Backfill: every other user (no cluster) → TRUE.
-- ---------------------------------------------------------------------------
UPDATE public.users
   SET is_canonical = TRUE,
       duplicate_of_user_id = NULL
 WHERE is_canonical IS NULL;

-- ---------------------------------------------------------------------------
-- 079.6 — Enforce NOT NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ALTER COLUMN is_canonical SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 079.7 — Index for canonical-set queries.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS users_is_canonical_idx
  ON public.users (is_canonical)
  WHERE is_canonical = TRUE;

-- ---------------------------------------------------------------------------
-- 079.8 — USER_DEDUP_FLAGGED audit per loser.
-- ---------------------------------------------------------------------------
-- Idempotent via NOT EXISTS guard on entity_id.
INSERT INTO public.audit_events (
  action, actor_kind, actor_user_id,
  entity_type, entity_id, metadata, created_at
)
SELECT
  'USER_DEDUP_FLAGGED',
  'migration',
  NULL,
  'user',
  loser_id,
  jsonb_build_object(
    'source', 'migration_079',
    'normalized_phone', p.normalized_phone,
    'duplicate_of_user_id', p.winner_user_id,
    'cluster_size', 1 + array_length(p.loser_user_ids, 1)
  ),
  NOW()
FROM public._user_dedup_plan p,
     unnest(p.loser_user_ids) AS loser_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_events ae
   WHERE ae.action = 'USER_DEDUP_FLAGGED'
     AND ae.entity_id = loser_id
);

-- ---------------------------------------------------------------------------
-- 079.9 — Post-condition assertions.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_winners_wrong INTEGER;
  v_losers_wrong INTEGER;
  v_users_null_canonical INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_winners_wrong
    FROM public._user_dedup_plan p
    LEFT JOIN public.users u ON u.id = p.winner_user_id
   WHERE u.is_canonical IS DISTINCT FROM TRUE;

  IF v_winners_wrong > 0 THEN
    RAISE EXCEPTION
      'mig 079 post-condition failed: % winners do not have is_canonical=TRUE',
      v_winners_wrong;
  END IF;

  SELECT COUNT(*) INTO v_losers_wrong
    FROM public._user_dedup_plan p,
         unnest(p.loser_user_ids) AS loser_id
    LEFT JOIN public.users u ON u.id = loser_id
   WHERE u.is_canonical IS DISTINCT FROM FALSE
      OR u.duplicate_of_user_id IS DISTINCT FROM p.winner_user_id;

  IF v_losers_wrong > 0 THEN
    RAISE EXCEPTION
      'mig 079 post-condition failed: % losers do not have is_canonical=FALSE + correct duplicate_of_user_id pointer',
      v_losers_wrong;
  END IF;

  SELECT COUNT(*) INTO v_users_null_canonical
    FROM public.users
   WHERE is_canonical IS NULL;

  IF v_users_null_canonical > 0 THEN
    RAISE EXCEPTION
      'mig 079 post-condition failed: % users still have is_canonical IS NULL',
      v_users_null_canonical;
  END IF;
END $$;
