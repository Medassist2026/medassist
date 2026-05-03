-- ============================================================================
-- Rollback for mig 079 (conceptual mig 075.7).
--
-- Removes the canonical flag columns from users and the audit rows
-- this migration wrote. Order: drop index, drop FK, drop columns,
-- delete audit rows.
-- ============================================================================

-- R079.1 — Drop the index.
DROP INDEX IF EXISTS public.users_is_canonical_idx;

-- R079.2 — Drop columns (FK dropped automatically with the column).
ALTER TABLE public.users DROP COLUMN IF EXISTS duplicate_of_user_id;
ALTER TABLE public.users DROP COLUMN IF EXISTS is_canonical;

-- R079.3 — Delete the audit rows this migration wrote.
DELETE FROM public.audit_events
 WHERE action = 'USER_DEDUP_FLAGGED'
   AND metadata->>'source' = 'migration_079';
