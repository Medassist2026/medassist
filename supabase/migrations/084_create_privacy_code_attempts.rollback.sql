-- ============================================================================
-- Rollback for mig 084 — privacy_code_attempts
--
-- Drops the table (CASCADE removes RLS policies) and the enum.
-- Idempotent.
-- ============================================================================

DROP TABLE IF EXISTS public.privacy_code_attempts CASCADE;

-- Only drop the enum if no other table is using it. Defensive — at this
-- point in the rollback ladder, mig 085+ should be rolled back already
-- (privacy_code_attempts is the only consumer).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_attribute a
      JOIN pg_type t ON t.oid = a.atttypid
     WHERE t.typname = 'privacy_code_attempt_result'
       AND a.attrelid > 0
  ) THEN
    DROP TYPE IF EXISTS privacy_code_attempt_result;
  END IF;
END $$;
