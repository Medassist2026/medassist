-- ============================================================================
-- Rollback for mig 078 (conceptual mig 075.5).
--
-- Drops _user_dedup_plan and removes the audit rows this migration wrote.
-- Note: this rollback only undoes mig 078. Mig 079 (which CONSUMES
-- _user_dedup_plan) must be rolled back FIRST or its effects will be
-- left behind (users.is_canonical / duplicate_of_user_id orphaned).
-- ============================================================================

-- R078.1 — Sanity check: _user_dedup_plan should not be in use anymore.
DO $$
DECLARE
  v_users_flagged INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_users_flagged
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'users'
     AND column_name = 'is_canonical';

  IF v_users_flagged > 0 THEN
    RAISE NOTICE
      'mig 078 rollback warning: users.is_canonical column still exists. Run 079_user_dedup_consumption.rollback.sql FIRST. Continuing anyway.';
  END IF;
END $$;

-- R078.2 — Drop the table.
DROP TABLE IF EXISTS public._user_dedup_plan;

-- R078.3 — Delete the audit rows this migration wrote.
DELETE FROM public.audit_events
 WHERE action IN (
   'USER_DEDUP_LARGE_CLUSTER_AUTO_RESOLVED',
   'USER_DEDUP_CROSS_SIDE_MISMATCH'
 )
 AND metadata->>'source' = 'migration_078';
