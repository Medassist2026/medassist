-- ============================================================================
-- Rollback for mig 082 — Recover leading-zero user phones (R1 sweep)
--
-- Restores users.phone to raw_phone, drops normalized_phone, removes the
-- global_patients rows this migration created (identifiable by
-- audit_events.metadata->>'source' = 'migration_082'), and deletes the
-- audit rows.
--
-- IDEMPOTENT: safe to run twice (NOT EXISTS guards on every step).
-- ============================================================================

DO $$
DECLARE
  v_row RECORD;
BEGIN
  -- Step 1: restore users for QUARANTINE_RECOVERED rows.
  -- The audit metadata.raw_phone holds the pre-recovery value.
  FOR v_row IN
    SELECT (metadata->>'user_id')::UUID AS user_id,
           metadata->>'raw_phone' AS raw_phone
      FROM public.audit_events
     WHERE action = 'QUARANTINE_RECOVERED'
       AND metadata->>'source' = 'migration_082'
  LOOP
    UPDATE public.users
       SET phone = v_row.raw_phone,
           normalized_phone = NULL
     WHERE id = v_row.user_id
       AND normalized_phone IS NOT NULL;
  END LOOP;

  -- Step 2a: restore users for RECOVERY_COLLIDED rows where reason was
  -- a global_patients-side collision (we DID UPDATE the phone).
  FOR v_row IN
    SELECT (metadata->>'user_id')::UUID AS user_id,
           metadata->>'raw_phone' AS raw_phone
      FROM public.audit_events
     WHERE action = 'RECOVERY_COLLIDED'
       AND metadata->>'source' = 'migration_082'
       AND metadata->>'reason' = 'global_patients_collision'
  LOOP
    UPDATE public.users
       SET phone = v_row.raw_phone,
           normalized_phone = NULL
     WHERE id = v_row.user_id
       AND normalized_phone IS NOT NULL;
  END LOOP;

  -- Step 2b: restore users for RECOVERY_COLLIDED rows where reason was
  -- a user-side phone collision (we did NOT UPDATE phone, only
  -- is_canonical/duplicate_of_user_id).
  FOR v_row IN
    SELECT (metadata->>'user_id')::UUID AS user_id
      FROM public.audit_events
     WHERE action = 'RECOVERY_COLLIDED'
       AND metadata->>'source' = 'migration_082'
       AND metadata->>'reason' = 'user_side_phone_collision'
  LOOP
    UPDATE public.users
       SET is_canonical = TRUE,
           duplicate_of_user_id = NULL
     WHERE id = v_row.user_id;
  END LOOP;

  -- Step 3: delete the global_patients rows we created (only those
  -- tagged by the GLOBAL_PATIENT_CREATED audit with source=migration_082).
  -- Cascade is safe — these rows have no FK dependants yet (sweep just ran).
  DELETE FROM public.global_patients
   WHERE id IN (
     SELECT entity_id
       FROM public.audit_events
      WHERE action = 'GLOBAL_PATIENT_CREATED'
        AND metadata->>'source' = 'migration_082'
        AND entity_id IS NOT NULL
   );

  -- Step 4: delete the audit rows themselves.
  DELETE FROM public.audit_events
   WHERE metadata->>'source' = 'migration_082';
END $$;
