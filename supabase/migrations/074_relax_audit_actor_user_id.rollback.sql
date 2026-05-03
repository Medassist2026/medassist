-- ============================================================================
-- Rollback for mig 074 (conceptual mig 073.5).
--
-- This rollback is the messy part. Audit rows already written under
-- actor_kind IN ('system','migration') with actor_user_id IS NULL cannot
-- be retained if we re-add the NOT NULL constraint on actor_user_id —
-- they violate it. The rollback handles this conservatively:
--   1. Delete only the rows THIS migration wrote (filter by metadata
--      source = 'migration_073_backfill_via_074'). This is the safe
--      deletion — those rows would not exist without this migration.
--   2. Verify no other rows have actor_user_id IS NULL or
--      actor_kind != 'user'. If any exist (real audit activity from
--      between mig 074 apply and rollback), the rollback FAILS — that's
--      intentional. The rollback can't safely revert real audit history.
--   3. Drop the CHECK constraint, drop actor_kind, re-add NOT NULL FK.
--
-- If the post-074 audit activity blocks rollback, the operator must
-- manually decide: either delete those rows (loses history) or skip
-- the NOT NULL re-add (leaves the schema in a softer state).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- R074.1 — Delete the rows this migration inserted (safe — they didn't
--           exist before this migration ran).
-- ---------------------------------------------------------------------------
DELETE FROM public.audit_events
 WHERE metadata->>'source' = 'migration_073_backfill_via_074';

-- ---------------------------------------------------------------------------
-- R074.2 — Pre-check: any other non-'user' rows blocking rollback?
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_blocking_rows INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_blocking_rows
    FROM public.audit_events
   WHERE actor_user_id IS NULL
      OR actor_kind <> 'user';

  IF v_blocking_rows > 0 THEN
    RAISE EXCEPTION
      'mig 074 rollback blocked: % audit_events rows have actor_user_id NULL or actor_kind != ''user''. These were written by something other than mig 074 and cannot be safely reverted by this rollback. Either delete them manually (loses history) or skip the NOT NULL re-add at the bottom of this rollback.',
      v_blocking_rows;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- R074.3 — Drop the FK so we can re-shape the column.
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_events
  DROP CONSTRAINT IF EXISTS audit_events_actor_user_id_fkey;

-- ---------------------------------------------------------------------------
-- R074.4 — Drop the CHECK invariant.
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_events
  DROP CONSTRAINT IF EXISTS audit_events_actor_consistency;

-- ---------------------------------------------------------------------------
-- R074.5 — Drop actor_kind column.
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_events
  DROP COLUMN IF EXISTS actor_kind;

-- ---------------------------------------------------------------------------
-- R074.6 — Re-add NOT NULL on actor_user_id.
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_events
  ALTER COLUMN actor_user_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- R074.7 — Re-add the original FK (no ON DELETE clause).
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_events
  ADD CONSTRAINT audit_events_actor_user_id_fkey
    FOREIGN KEY (actor_user_id)
    REFERENCES public.users(id);
