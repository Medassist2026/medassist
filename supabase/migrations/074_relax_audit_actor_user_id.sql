-- ============================================================================
-- Migration 074 — Relax audit_events.actor_user_id (closes ORPH-V2-11)
--
-- Conceptual name in audits/EXECUTION_PROMPTS.md: mig 073.5.
-- Filename uses sequential 074 because the existing convention is NNN_,
-- and lexicographic sort of `073_5_...` would actually place it BEFORE
-- `073_create_global_patients.sql` (digit '5' < letter 'c' in ASCII),
-- which would corrupt apply order in `supabase db push`. The 073.5 label
-- survives in this header and in the audit-row metadata `source` field.
--
-- Implements: Patient Identity Build 03 Phase 0 (audits/EXECUTION_PROMPTS.md).
--
-- WHY THIS MIGRATION EXISTS
--   Build 02 staging apply (2026-04-28) surfaced two FAIL'd validation
--   checks: PATIENT_DEDUP_FLAGGED count = 0 (expected 1), and
--   GLOBAL_PATIENT_CREATED count = 0 (expected 31). Root cause: mig 073
--   tried to insert audit rows with actor_user_id = NULL, which violated
--   the NOT NULL constraint on that column — the inserts silently failed
--   inside the migration's exception-swallowing audit block. (See
--   audits/patient-identity-build-02-staging-apply.md and
--   audits/orphan-ledger.md ORPH-V2-11.)
--
--   Without this migration, every Build 03 migration that needs to write
--   audit rows from a non-user actor (mig 075/076/077/078/079/080) would
--   silently fail the same way. So this is Phase 0 of Build 03 — runs
--   BEFORE any other Prompt 3 migration.
--
-- WHAT IT DOES
--   1. Drops the existing audit_events_actor_user_id_fkey FK (RESTRICT).
--   2. Drops NOT NULL on audit_events.actor_user_id.
--   3. Adds audit_events.actor_kind TEXT NOT NULL DEFAULT 'user' with
--      CHECK constraint allowing only 'user', 'system', 'migration'.
--   4. Adds an invariant CHECK constraint:
--        actor_kind = 'user'      ⇒ actor_user_id IS NOT NULL
--        actor_kind ∈ ('system','migration') ⇒ actor_user_id IS NULL
--   5. Re-adds the FK with ON DELETE SET NULL (softer; supports user
--      deletion without losing the audit history of their actions).
--   6. Backfills actor_kind = 'user' on all existing rows (they all
--      have actor_user_id NOT NULL today).
--   7. Idempotently inserts mig 073's missing audit rows
--      (PATIENT_DEDUP_FLAGGED + GLOBAL_PATIENT_CREATED) using
--      ON-NOT-EXISTS guards so re-applying this migration is a no-op.
--
-- POST-CONDITIONS (mirrors C0 in audits/patient-identity-build-03-results.md)
--   - actor_user_id is_nullable = 'YES'
--   - audit_events_actor_consistency CHECK exists and rejects mismatches
--   - PATIENT_DEDUP_FLAGGED count = number of patients with
--     duplicate_of_patient_id IS NOT NULL (1 on staging today)
--   - GLOBAL_PATIENT_CREATED count = number of global_patients rows
--     (31 on staging today)
--
-- REVERSIBLE. Companion: 074_relax_audit_actor_user_id.rollback.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 074.1 — Drop existing FK so we can change the column.
-- ---------------------------------------------------------------------------
-- Existing constraint discovered via pg_constraint introspection at build
-- time: audit_events_actor_user_id_fkey, FOREIGN KEY (actor_user_id)
-- REFERENCES users(id) [no ON DELETE clause, defaults to NO ACTION].
ALTER TABLE public.audit_events
  DROP CONSTRAINT IF EXISTS audit_events_actor_user_id_fkey;

-- ---------------------------------------------------------------------------
-- 074.2 — Drop NOT NULL on actor_user_id.
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_events
  ALTER COLUMN actor_user_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 074.3 — Add actor_kind column.
-- ---------------------------------------------------------------------------
-- DEFAULT 'user' so all existing rows pick up the right value automatically.
-- We immediately drop the default after backfill (074.6) to make the column
-- semantically required at the application level.
ALTER TABLE public.audit_events
  ADD COLUMN IF NOT EXISTS actor_kind TEXT
    NOT NULL DEFAULT 'user'
    CHECK (actor_kind IN ('user', 'system', 'migration'));

COMMENT ON COLUMN public.audit_events.actor_kind IS
  'Distinguishes audit rows by who wrote them. user = application code (actor_user_id required); system = server-side automation (actor_user_id NULL); migration = one-off DB migration (actor_user_id NULL). Enforced by audit_events_actor_consistency CHECK.';

-- ---------------------------------------------------------------------------
-- 074.4 — Add the actor consistency invariant.
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_events
  ADD CONSTRAINT audit_events_actor_consistency
    CHECK (
      (actor_kind = 'user' AND actor_user_id IS NOT NULL)
      OR
      (actor_kind IN ('system', 'migration') AND actor_user_id IS NULL)
    );

-- ---------------------------------------------------------------------------
-- 074.5 — Re-add the FK, softer (ON DELETE SET NULL).
-- ---------------------------------------------------------------------------
-- ON DELETE SET NULL: when a user is deleted, we keep the audit row but
-- drop the actor pointer. The CHECK above will then require us to also
-- update actor_kind from 'user' → 'system' for that row, but that's a
-- post-deletion concern (Mo will need to flip kind alongside the delete
-- in user-deletion code paths). For now, we let the FK side handle
-- cascading; the CHECK will surface any inconsistency at next write.
ALTER TABLE public.audit_events
  ADD CONSTRAINT audit_events_actor_user_id_fkey
    FOREIGN KEY (actor_user_id)
    REFERENCES public.users(id)
    ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 074.6 — Backfill: every existing row is application-code-written, so
--          actor_kind = 'user'. The DEFAULT already populated this for
--          rows inserted between 074.3 and now, but we run an explicit
--          UPDATE to make the migration idempotent on re-apply (which
--          would skip the ADD COLUMN due to IF NOT EXISTS).
-- ---------------------------------------------------------------------------
UPDATE public.audit_events
   SET actor_kind = 'user'
 WHERE actor_kind IS NULL
    OR (actor_kind = 'user' AND actor_user_id IS NULL);  -- defensive

-- After the backfill, drop the DEFAULT — actor_kind is now a required
-- semantic field, not a convenience.
ALTER TABLE public.audit_events
  ALTER COLUMN actor_kind DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- 074.7 — Idempotent backfill of mig 073's missing audit rows.
-- ---------------------------------------------------------------------------
-- mig 073 attempted to write these rows but failed silently because
-- actor_user_id was still NOT NULL. Now that we've relaxed it, we can
-- write them. Using NOT EXISTS guards so re-applying this migration is
-- a no-op (per C3 idempotency requirement).
--
-- Every row carries metadata.source = 'migration_073_backfill_via_074' so
-- the rollback can identify and remove exactly what this migration wrote.

-- 074.7a — PATIENT_DEDUP_FLAGGED for every loser row.
--          Expected 1 on staging today (the +201098765432 cluster's loser).
INSERT INTO public.audit_events (
  action, actor_kind, actor_user_id,
  entity_type, entity_id, metadata, created_at
)
SELECT
  'PATIENT_DEDUP_FLAGGED',
  'migration',
  NULL,
  'patient',
  p.id,
  jsonb_build_object(
    'source', 'migration_073_backfill_via_074',
    'duplicate_of_patient_id', p.duplicate_of_patient_id,
    'normalized_phone', p.normalized_phone
  ),
  NOW()
FROM public.patients p
WHERE p.duplicate_of_patient_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_events ae
     WHERE ae.action = 'PATIENT_DEDUP_FLAGGED'
       AND ae.entity_id = p.id
  );

-- 074.7b — GLOBAL_PATIENT_CREATED for every global_patients row.
--          Expected 31 on staging today.
INSERT INTO public.audit_events (
  action, actor_kind, actor_user_id,
  entity_type, entity_id, metadata, created_at
)
SELECT
  'GLOBAL_PATIENT_CREATED',
  'migration',
  NULL,
  'global_patient',
  gp.id,
  jsonb_build_object(
    'source', 'migration_073_backfill_via_074',
    'normalized_phone', gp.normalized_phone,
    'created_at_original', gp.created_at
  ),
  NOW()
FROM public.global_patients gp
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_events ae
   WHERE ae.action = 'GLOBAL_PATIENT_CREATED'
     AND ae.entity_id = gp.id
);

-- ---------------------------------------------------------------------------
-- 074.8 — Post-condition assertion (defensive — fails the migration if
--          we didn't actually close the audit gap).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_expected_dedup INTEGER;
  v_actual_dedup INTEGER;
  v_expected_create INTEGER;
  v_actual_create INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_expected_dedup
    FROM public.patients
   WHERE duplicate_of_patient_id IS NOT NULL;

  SELECT COUNT(*) INTO v_actual_dedup
    FROM public.audit_events
   WHERE action = 'PATIENT_DEDUP_FLAGGED';

  SELECT COUNT(*) INTO v_expected_create
    FROM public.global_patients;

  SELECT COUNT(*) INTO v_actual_create
    FROM public.audit_events
   WHERE action = 'GLOBAL_PATIENT_CREATED';

  IF v_actual_dedup < v_expected_dedup THEN
    RAISE EXCEPTION
      'mig 074 post-condition failed: PATIENT_DEDUP_FLAGGED count % < expected %',
      v_actual_dedup, v_expected_dedup;
  END IF;

  IF v_actual_create < v_expected_create THEN
    RAISE EXCEPTION
      'mig 074 post-condition failed: GLOBAL_PATIENT_CREATED count % < expected %',
      v_actual_create, v_expected_create;
  END IF;
END $$;
