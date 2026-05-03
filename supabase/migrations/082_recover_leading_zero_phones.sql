-- ============================================================================
-- Migration 082 — Recover leading-zero user phones (R1 sweep)
--
-- Closes Build 03 R1 (audits/patient-identity-build-03-results.md § 7).
-- This is Phase 0 of Prompt 4 (audits/EXECUTION_PROMPTS.md.md).
--
-- WHY THIS MIGRATION EXISTS
--   Build 03 deferred PATH A recovery for the 37 user rows with
--   classification = 'potentially_recoverable_leading_zero' (Mo's
--   "auto-rules now" decision, 2026-04-29). All 37 rows have phone
--   '+200xxxxxxxxxxx' — a surplus '0' between the country code and the
--   operator prefix. Dropping that '0' produces a normalize-able
--   Egyptian mobile number for ~31 of the 37; for the remaining 6 the
--   recovery either still fails normalization (too short / wrong
--   prefix) or collides with an existing global_patients row.
--
-- WHAT IT DOES (per row, idempotently)
--   1. Compute corrected_phone = '+20' || substring(raw_phone from 5).
--   2. Try public.normalize_phone_e164(corrected_phone). Three outcomes:
--      a) NULL → write RECOVERY_FAILED audit, leave the user row alone.
--         Operator must investigate manually (ORPH-V4-04).
--      b) NOT NULL, no existing global_patients row → success path:
--         UPDATE users SET phone = corrected, normalized_phone = norm.
--         INSERT a new global_patients row.
--         Write QUARANTINE_RECOVERED audit.
--      c) NOT NULL, existing global_patients row → collision path:
--         UPDATE users SET phone = corrected, normalized_phone = norm.
--         The user becomes a non-canonical link to the existing
--         global_patient (no new global_patients row created).
--         Write RECOVERY_COLLIDED audit with metadata.matched_gp_id.
--
--   Each audit row is keyed by users.id in metadata.user_id so re-applies
--   are idempotent (NOT EXISTS guards).
--
-- POST-CONDITIONS
--   SELECT COUNT(*) FROM public.users
--    WHERE normalized_phone IS NULL AND phone LIKE '+200%';
--   -- Expect: number of RECOVERY_FAILED audit rows (leftover unrecoverables)
--
--   SELECT
--     (SELECT COUNT(*) FROM public.audit_events
--       WHERE action='QUARANTINE_RECOVERED'
--         AND metadata->>'source'='migration_082') AS recovered,
--     (SELECT COUNT(*) FROM public.audit_events
--       WHERE action='RECOVERY_FAILED'
--         AND metadata->>'source'='migration_082') AS failed,
--     (SELECT COUNT(*) FROM public.audit_events
--       WHERE action='RECOVERY_COLLIDED'
--         AND metadata->>'source'='migration_082') AS collided;
--   -- Expected on staging today: 31 + 3 + 3 = 37 (predicted by Phase A
--   -- read-only inventory before this migration applied).
--
-- AUDIT ACTIONS REQUIRED IN packages/shared/lib/data/audit.ts BEFORE APPLY
--   QUARANTINE_RECOVERED, RECOVERY_FAILED, RECOVERY_COLLIDED.
--
-- ATOMICITY
--   Each user row is processed in its own per-row block; failures inside
--   one row's block (e.g., deny-list trigger) abort the whole migration.
--   Per § 16.1, the audit INSERT and the users UPDATE / global_patients
--   INSERT are in the same transaction (the migration body) — so if the
--   audit fails, the user-row mutation rolls back too.
-- ============================================================================

-- THREE COLLISION CASES (verified Phase A read-only inventory):
--   recovery_failed   — normalize_phone_e164(corrected) returns NULL (3 rows on staging)
--   user_side_collided — another user already has phone=corrected_phone     (2 rows)
--                        UPDATE would violate users_phone_key UNIQUE.
--                        Resolution: mark recovering user as duplicate of
--                        the existing user (is_canonical=FALSE, duplicate_of_user_id),
--                        leave phone unchanged. Operator must reconcile in
--                        ORPH-V4-04 review.
--   gp_side_collided   — corrected_phone normalizes, no user-side collision,
--                        but a global_patients row already exists (3 rows).
--                        Resolution: UPDATE user.phone safely (no UNIQUE
--                        conflict), audit; user is now linked to the
--                        existing global identity via normalized_phone.
--   recovered         — clean path; UPDATE user, INSERT global_patients (29 rows).

DO $$
DECLARE
  v_row RECORD;
  v_corrected TEXT;
  v_norm TEXT;
  v_existing_user UUID;
  v_existing_gp UUID;
  v_new_gp_id UUID;
  v_recovered_count INTEGER := 0;
  v_failed_count INTEGER := 0;
  v_user_collided_count INTEGER := 0;
  v_gp_collided_count INTEGER := 0;
BEGIN
  -- Process every user row that looks like a leading-zero candidate.
  -- We scope to phone LIKE '+200%' AND normalized_phone IS NULL so
  -- previously-recovered rows are untouched (idempotency).
  FOR v_row IN
    SELECT id, phone
      FROM public.users
     WHERE phone LIKE '+200%'
       AND normalized_phone IS NULL
     ORDER BY id  -- deterministic apply order for audit-row count parity
  LOOP
    -- Idempotency guard: skip if we already wrote a result audit for
    -- this user during a prior apply.
    IF EXISTS (
      SELECT 1 FROM public.audit_events
       WHERE action IN ('QUARANTINE_RECOVERED','RECOVERY_FAILED','RECOVERY_COLLIDED')
         AND metadata->>'source' = 'migration_082'
         AND (metadata->>'user_id')::UUID = v_row.id
    ) THEN
      CONTINUE;
    END IF;

    -- Compute the corrected phone: +200xxxx... → +20xxxx...
    v_corrected := '+20' || substring(v_row.phone from 5);
    v_norm := public.normalize_phone_e164(v_corrected);

    IF v_norm IS NULL THEN
      -- Path A: still un-normalize-able. Leave user row alone.
      INSERT INTO public.audit_events (
        clinic_id, actor_user_id, actor_kind,
        action, entity_type, entity_id, metadata
      ) VALUES (
        NULL, NULL, 'migration',
        'RECOVERY_FAILED', 'users', v_row.id,
        jsonb_build_object(
          'source', 'migration_082',
          'user_id', v_row.id,
          'raw_phone', v_row.phone,
          'attempted_corrected', v_corrected,
          'reason', 'normalize_phone_e164_returned_null'
        )
      );
      v_failed_count := v_failed_count + 1;
      CONTINUE;
    END IF;

    -- Pre-check 1: user-side collision. If another user row already has
    -- phone = corrected_phone, UPDATE would violate users_phone_key.
    -- Resolution: mark the recovering user as duplicate of the existing
    -- user; leave the phone alone for ORPH-V4-04 manual review.
    SELECT id INTO v_existing_user
      FROM public.users
     WHERE phone = v_corrected
       AND id <> v_row.id
     LIMIT 1;

    IF v_existing_user IS NOT NULL THEN
      UPDATE public.users
         SET is_canonical = FALSE,
             duplicate_of_user_id = v_existing_user
       WHERE id = v_row.id
         AND is_canonical IS DISTINCT FROM FALSE;

      INSERT INTO public.audit_events (
        clinic_id, actor_user_id, actor_kind,
        action, entity_type, entity_id, metadata
      ) VALUES (
        NULL, NULL, 'migration',
        'RECOVERY_COLLIDED', 'users', v_row.id,
        jsonb_build_object(
          'source', 'migration_082',
          'user_id', v_row.id,
          'raw_phone', v_row.phone,
          'corrected_phone', v_corrected,
          'normalized_phone', v_norm,
          'reason', 'user_side_phone_collision',
          'matched_user_id', v_existing_user
        )
      );
      v_user_collided_count := v_user_collided_count + 1;
      CONTINUE;
    END IF;

    -- Pre-check 2: global_patients-side collision.
    SELECT id INTO v_existing_gp
      FROM public.global_patients
     WHERE normalized_phone = v_norm
     LIMIT 1;

    IF v_existing_gp IS NOT NULL THEN
      -- Path C: GP-side collision. UPDATE user phone safely (no user
      -- collision passed pre-check 1). User links to existing global identity.
      -- Note: public.users has no updated_at column (verified Phase A).
      UPDATE public.users
         SET phone = v_corrected,
             normalized_phone = v_norm
       WHERE id = v_row.id;

      INSERT INTO public.audit_events (
        clinic_id, actor_user_id, actor_kind,
        action, entity_type, entity_id, metadata
      ) VALUES (
        NULL, NULL, 'migration',
        'RECOVERY_COLLIDED', 'users', v_row.id,
        jsonb_build_object(
          'source', 'migration_082',
          'user_id', v_row.id,
          'raw_phone', v_row.phone,
          'corrected_phone', v_corrected,
          'normalized_phone', v_norm,
          'reason', 'global_patients_collision',
          'matched_gp_id', v_existing_gp
        )
      );
      v_gp_collided_count := v_gp_collided_count + 1;
    ELSE
      -- Path B: clean recovery. Create new global_patients row.
      UPDATE public.users
         SET phone = v_corrected,
             normalized_phone = v_norm
       WHERE id = v_row.id;

      INSERT INTO public.global_patients (
        normalized_phone,
        legacy_phone,
        display_name,
        preferred_language,
        claimed,
        account_status
      ) VALUES (
        v_norm,
        v_row.phone,
        NULL,           -- patient app will populate at first claim
        'ar',
        FALSE,
        'active'
      )
      RETURNING id INTO v_new_gp_id;

      INSERT INTO public.audit_events (
        clinic_id, actor_user_id, actor_kind,
        action, entity_type, entity_id, metadata
      ) VALUES (
        NULL, NULL, 'migration',
        'QUARANTINE_RECOVERED', 'users', v_row.id,
        jsonb_build_object(
          'source', 'migration_082',
          'user_id', v_row.id,
          'raw_phone', v_row.phone,
          'corrected_phone', v_corrected,
          'normalized_phone', v_norm,
          'new_global_patient_id', v_new_gp_id
        )
      );

      INSERT INTO public.audit_events (
        clinic_id, actor_user_id, actor_kind,
        action, entity_type, entity_id, metadata
      ) VALUES (
        NULL, NULL, 'migration',
        'GLOBAL_PATIENT_CREATED', 'global_patients', v_new_gp_id,
        jsonb_build_object(
          'source', 'migration_082',
          'normalized_phone', v_norm,
          'legacy_phone', v_row.phone,
          'origin_user_id', v_row.id
        )
      );
      v_recovered_count := v_recovered_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'mig 082 R1 sweep complete: recovered=% gp_collided=% user_collided=% failed=%',
    v_recovered_count, v_gp_collided_count, v_user_collided_count, v_failed_count;
END $$;
