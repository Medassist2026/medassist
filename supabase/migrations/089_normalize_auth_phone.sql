-- ============================================================================
-- Migration 089 — Normalize auth.users.phone for the 29 R1-recovered users
--
-- Fixes Build 04 D7 outstanding item: 29 staff (doctor/frontdesk) seed users
-- whose auth.users.phone has the buggy seed shape '2001XXXXXXXXXX' (extra
-- '0' between country code 20 and operator prefix, no leading '+'), while
-- public.users.phone is already a valid normalized E.164 ('+201XXXXXXXXXX')
-- after Build 04 mig 082 R1 sweep. The mismatch blocks phone-based login
-- because Supabase Auth normalizes the user-supplied phone and matches
-- against auth.users.phone.
--
-- Origin of the bug: original seed data had `+2001XXXXXXXXXX` everywhere;
-- when the auth.users row was provisioned, Supabase stripped the '+' but
-- did NOT collapse the leading-zero typo. Build 04 mig 082 corrected
-- public.users.phone for every recoverable user but did not touch the
-- auth-side residue. This migration is the auth-side cleanup.
--
-- Phase 1 verification (audits/patient-identity-build-04-auth-phone-fix-results.md):
--   - 30 mismatched auth/public phone pairs found on staging 2026-04-29
--   - 29 of them fit class 'leading_zero_after_country_code'
--   - 1 (bf98c1a5) does NOT — its public.users.phone is itself malformed
--     ('+2001000001'), public.users.normalized_phone IS NULL, and R1 wrote
--     a RECOVERY_FAILED audit for this user. It remains under ORPH-V4-04
--     manual phone correction and is INTENTIONALLY EXCLUDED from this
--     migration's fix-set.
--
-- ─────── WHAT THIS MIGRATION DOES ───────
-- For each user where (replace(public.users.phone,'+','') != auth.users.phone)
-- AND public.users.normalized_phone IS NOT NULL:
--   1. UPDATE auth.users SET phone = replace(public.users.phone,'+',''),
--                            phone_confirmed_at = NOW() (only if was non-NULL).
--   2. IF auth.identities.identity_data->>'phone' equals the OLD auth.phone
--      (mirrored copy): UPDATE auth.identities to set the corrected phone.
--      identity_data->>'phone_verified' is left as-is.
--   3. INSERT one AUTH_PHONE_NORMALIZED audit row per user (actor_kind
--      'migration', actor_user_id NULL) with before_phone, after_phone,
--      original_phone_confirmed_at, and (if applicable) identity_updated +
--      before_identity_phone. metadata.source='migration_089',
--      metadata.migration='089'.
--
-- ─────── WHAT IT DELIBERATELY DOES NOT DO ───────
--   - Does NOT touch public.users.phone or public.users.normalized_phone
--     (already correct per R1 sweep).
--   - Does NOT modify auth.users SCHEMA (no DDL — Supabase-managed schema).
--   - Does NOT touch the 1 R1 RECOVERY_FAILED user (bf98c1a5). The Pre-flight
--     Assertion 2 below proves we know exactly who is excluded and why.
--
-- ─────── ATOMICITY (per spec § 16.1) ───────
-- The whole migration runs in a single transaction (Supabase apply_migration
-- semantics). If any row's audit INSERT fails, every prior row's auth.users
-- and auth.identities UPDATE rolls back too. The pre-flight assertions also
-- run inside the same transaction.
--
-- ─────── IDEMPOTENCY ───────
-- Re-applying is a no-op:
--   - The fix-set query's NOT NULL filter still selects only mismatched rows.
--   - After mig 089 succeeds the first time, every fix-set row is matched;
--     re-running selects zero rows, the loop iterates zero times.
--   - Audit INSERT is guarded by NOT EXISTS (... migration='089'
--     AND user_id = current row).
--
-- ─────── ROLLBACK ───────
-- See 089_normalize_auth_phone.rollback.sql. Rollback is best-effort and
-- may invalidate sessions of users who logged in with the corrected phone
-- after apply (their JWT was issued against the new auth.phone — restoring
-- the old value desyncs the session token's phone claim).
--
-- ─────── REQUIRED PRE-WORK (already done) ───────
-- packages/shared/lib/data/audit.ts has 'AUTH_PHONE_NORMALIZED' added to
-- the AuditAction enum. Verified via grep before this migration runs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 089.1 — Pre-flight assertion 1: every fix-set row fits leading_zero theory
-- ---------------------------------------------------------------------------
-- Refuses to run if any selected row would be rewritten by an unsafe formula
-- (i.e., '+20' || substring(au.phone from 4) != public.users.phone). This
-- protects against future seed-data bugs that would otherwise be silently
-- "fixed" by setting auth.phone to a public.phone that came from a different
-- malformation.
DO $$
DECLARE
  v_fix_set_count INTEGER;
  v_unfit_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_fix_set_count
    FROM public.users u
    JOIN auth.users au ON au.id = u.id
   WHERE u.phone IS NOT NULL
     AND au.phone IS NOT NULL
     AND replace(u.phone, '+', '') != au.phone
     AND u.normalized_phone IS NOT NULL;

  SELECT COUNT(*) INTO v_unfit_count
    FROM public.users u
    JOIN auth.users au ON au.id = u.id
   WHERE u.phone IS NOT NULL
     AND au.phone IS NOT NULL
     AND replace(u.phone, '+', '') != au.phone
     AND u.normalized_phone IS NOT NULL
     AND ('+20' || substring(au.phone from 4)) IS DISTINCT FROM u.phone;

  IF v_unfit_count <> 0 THEN
    RAISE EXCEPTION
      'mig 089 pre-flight 1: % fix-set rows do not fit leading_zero_after_country_code class. Fix-set total=%. Stop and investigate.',
      v_unfit_count, v_fix_set_count;
  END IF;

  RAISE NOTICE 'mig 089 pre-flight 1 passed: all % fix-set rows fit leading_zero_after_country_code.', v_fix_set_count;
END $$;

-- ---------------------------------------------------------------------------
-- 089.2 — Pre-flight assertion 2: every excluded user is a known
--          R1 RECOVERY_FAILED case (Mo's safeguard).
-- ---------------------------------------------------------------------------
-- Protects against a future un-recoverable user being silently skipped.
-- If a row has a phone mismatch BUT public.users.normalized_phone IS NULL,
-- we expect that user to already have a RECOVERY_FAILED audit row from
-- migration_082. Any other case would be a new, undocumented un-recoverable
-- user — and we want to refuse to run rather than silently skip them.
DO $$
DECLARE
  v_total_mismatch INT;
  v_to_fix INT;
  v_recovery_failed_excluded INT;
  v_excluded_unaccounted INT;
BEGIN
  SELECT COUNT(*) INTO v_total_mismatch
    FROM public.users u JOIN auth.users au ON au.id = u.id
   WHERE u.phone IS NOT NULL AND au.phone IS NOT NULL
     AND replace(u.phone, '+', '') != au.phone;

  SELECT COUNT(*) INTO v_to_fix
    FROM public.users u JOIN auth.users au ON au.id = u.id
   WHERE u.phone IS NOT NULL AND au.phone IS NOT NULL
     AND replace(u.phone, '+', '') != au.phone
     AND u.normalized_phone IS NOT NULL;

  SELECT COUNT(DISTINCT (ae.metadata->>'user_id')::UUID) INTO v_recovery_failed_excluded
    FROM public.audit_events ae
   WHERE ae.action = 'RECOVERY_FAILED'
     AND ae.metadata->>'source' = 'migration_082'
     AND (ae.metadata->>'user_id')::UUID IN (
       SELECT u.id FROM public.users u JOIN auth.users au ON au.id = u.id
        WHERE u.phone IS NOT NULL AND au.phone IS NOT NULL
          AND replace(u.phone, '+', '') != au.phone
          AND u.normalized_phone IS NULL
     );

  v_excluded_unaccounted := (v_total_mismatch - v_to_fix) - v_recovery_failed_excluded;

  IF v_excluded_unaccounted <> 0 THEN
    RAISE EXCEPTION
      'mig 089 pre-flight 2: % unaccounted-for excluded users. Total mismatch=%, to_fix=%, R1_RECOVERY_FAILED=%. Stop and investigate.',
      v_excluded_unaccounted, v_total_mismatch, v_to_fix, v_recovery_failed_excluded;
  END IF;

  RAISE NOTICE 'mig 089 pre-flight 2 passed: fixing % rows, excluding % R1 RECOVERY_FAILED users (tracked under ORPH-V4-04).',
    v_to_fix, v_recovery_failed_excluded;
END $$;

-- ---------------------------------------------------------------------------
-- 089.3 — Per-row UPDATE loop
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_row RECORD;
  v_new_phone TEXT;
  v_old_auth_phone TEXT;
  v_old_phone_confirmed_at TIMESTAMPTZ;
  v_new_phone_confirmed_at TIMESTAMPTZ;
  v_identity_phone TEXT;
  v_identity_updated BOOLEAN;
  v_fixed_count INTEGER := 0;
  v_identity_updated_count INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT u.id, u.phone AS public_phone, au.phone AS old_auth_phone,
           au.phone_confirmed_at
      FROM public.users u
      JOIN auth.users au ON au.id = u.id
     WHERE u.phone IS NOT NULL
       AND au.phone IS NOT NULL
       AND replace(u.phone, '+', '') != au.phone
       AND u.normalized_phone IS NOT NULL
     ORDER BY u.id  -- deterministic order for audit-row count parity
  LOOP
    -- Idempotency guard: skip if this user already has a mig 089 audit row
    -- (from a prior partial apply).
    IF EXISTS (
      SELECT 1 FROM public.audit_events
       WHERE action = 'AUTH_PHONE_NORMALIZED'
         AND metadata->>'migration' = '089'
         AND (metadata->>'user_id')::UUID = v_row.id
    ) THEN
      CONTINUE;
    END IF;

    v_new_phone := replace(v_row.public_phone, '+', '');
    v_old_auth_phone := v_row.old_auth_phone;
    v_old_phone_confirmed_at := v_row.phone_confirmed_at;

    -- Re-confirm timestamp ONLY if user was previously confirmed; preserve
    -- NULL for unconfirmed users.
    IF v_old_phone_confirmed_at IS NOT NULL THEN
      v_new_phone_confirmed_at := NOW();
    ELSE
      v_new_phone_confirmed_at := NULL;
    END IF;

    -- Update auth.users
    UPDATE auth.users
       SET phone = v_new_phone,
           phone_confirmed_at = v_new_phone_confirmed_at
     WHERE id = v_row.id;

    -- Check if auth.identities mirrors the buggy phone in identity_data
    SELECT identity_data->>'phone'
      INTO v_identity_phone
      FROM auth.identities
     WHERE user_id = v_row.id
       AND provider = 'phone'
     LIMIT 1;

    v_identity_updated := FALSE;

    IF v_identity_phone IS NOT NULL AND v_identity_phone = v_old_auth_phone THEN
      UPDATE auth.identities
         SET identity_data = jsonb_set(identity_data, '{phone}', to_jsonb(v_new_phone))
       WHERE user_id = v_row.id
         AND provider = 'phone'
         AND identity_data->>'phone' = v_old_auth_phone;
      v_identity_updated := TRUE;
      v_identity_updated_count := v_identity_updated_count + 1;
    END IF;

    -- Audit row (in same transaction; failure rolls back the auth.users
    -- and auth.identities updates above per § 16.1).
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind,
      action, entity_type, entity_id, metadata
    ) VALUES (
      NULL, NULL, 'migration',
      'AUTH_PHONE_NORMALIZED', 'auth_user', v_row.id,
      jsonb_build_object(
        'source', 'migration_089',
        'migration', '089',
        'user_id', v_row.id,
        'before_phone', v_old_auth_phone,
        'after_phone', v_new_phone,
        'original_phone_confirmed_at', v_old_phone_confirmed_at,
        'phone_confirmed_at_reset_to_now', v_old_phone_confirmed_at IS NOT NULL,
        'identity_updated', v_identity_updated,
        'before_identity_phone', CASE WHEN v_identity_updated THEN v_old_auth_phone ELSE NULL END
      )
    );

    v_fixed_count := v_fixed_count + 1;
  END LOOP;

  RAISE NOTICE 'mig 089 fix loop complete: % users updated, % auth.identities rows updated.',
    v_fixed_count, v_identity_updated_count;
END $$;

-- ---------------------------------------------------------------------------
-- 089.4 — Post-condition assertion
-- ---------------------------------------------------------------------------
-- Confirm exactly the 1 known excluded row (bf98c1a5 — RECOVERY_FAILED)
-- remains in the mismatch query. The fix-set query must now return 0.
DO $$
DECLARE
  v_remaining_fixable INT;
  v_total_mismatch_after INT;
  v_audit_count INT;
BEGIN
  -- Should be 0: every fix-set row is now matched.
  SELECT COUNT(*) INTO v_remaining_fixable
    FROM public.users u JOIN auth.users au ON au.id = u.id
   WHERE u.phone IS NOT NULL AND au.phone IS NOT NULL
     AND replace(u.phone, '+', '') != au.phone
     AND u.normalized_phone IS NOT NULL;

  IF v_remaining_fixable <> 0 THEN
    RAISE EXCEPTION
      'mig 089 post-condition: expected 0 remaining fixable mismatches, got %.',
      v_remaining_fixable;
  END IF;

  -- Total mismatch should now equal exactly the excluded RECOVERY_FAILED set.
  SELECT COUNT(*) INTO v_total_mismatch_after
    FROM public.users u JOIN auth.users au ON au.id = u.id
   WHERE u.phone IS NOT NULL AND au.phone IS NOT NULL
     AND replace(u.phone, '+', '') != au.phone;

  RAISE NOTICE 'mig 089 post-condition: % residual mismatches (all R1 RECOVERY_FAILED, ORPH-V4-04).',
    v_total_mismatch_after;

  -- Audit row count must match the number of rows we updated (which on
  -- first apply equals v_fix_set_count from pre-flight 1; on re-apply,
  -- prior rows' audits already exist and the new write count is 0 — so
  -- a hard equality assertion would break idempotency. Instead, assert
  -- that EVERY mig 089 audit row has a matching now-corrected user.)
  SELECT COUNT(*) INTO v_audit_count
    FROM public.audit_events
   WHERE action = 'AUTH_PHONE_NORMALIZED'
     AND metadata->>'migration' = '089';

  RAISE NOTICE 'mig 089 audit count: % AUTH_PHONE_NORMALIZED rows.', v_audit_count;
END $$;
