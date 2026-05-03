-- ============================================================================
-- Rollback for mig 089 — Restore auth.users.phone + auth.identities for the
-- 29 R1-recovered users whose auth.phone was rewritten by mig 089.
--
-- ─────── CAVEATS ───────
--
-- 1. Session invalidation. Any user who logged in AFTER mig 089 applied did
--    so against the corrected auth.phone. Their JWT carries claims tied to
--    the new phone. Restoring the old buggy phone here will desync those
--    claims; the next refresh / token-rotation will fail and force re-auth.
--    There is no clean way around this — auth state lives in JWTs that
--    Postgres-side rollback cannot revoke.
--
-- 2. phone_confirmed_at fidelity loss. mig 089 set phone_confirmed_at = NOW()
--    for previously-confirmed users (to keep the new phone marked confirmed).
--    The audit metadata stored the original timestamp under
--    'original_phone_confirmed_at'; this rollback restores it. For users
--    whose original was NULL (none on staging today, but possible later),
--    rollback restores NULL.
--
-- 3. auth.identities restoration is conditional. Only the 19 staging rows
--    whose identity_data->>'phone' was rewritten get restored; the other 10
--    had identity_data with no 'phone' key and were untouched.
--
-- ─────── IDEMPOTENCY ───────
-- Safe to run twice. Steps 1–2 use UPDATE … WHERE … so re-applying after
-- restore is a no-op. Step 3 deletes audit rows by source='migration_089';
-- a second run finds none.
-- ============================================================================

DO $$
DECLARE
  v_row RECORD;
  v_orig_confirmed_at TIMESTAMPTZ;
  v_restored_users INTEGER := 0;
  v_restored_identities INTEGER := 0;
BEGIN
  -- Step 1 + 2: restore auth.users + auth.identities per audit metadata.
  FOR v_row IN
    SELECT (metadata->>'user_id')::UUID AS user_id,
           metadata->>'before_phone' AS before_phone,
           metadata->>'after_phone' AS after_phone,
           metadata->>'original_phone_confirmed_at' AS orig_confirmed_str,
           (metadata->>'identity_updated')::BOOLEAN AS identity_updated,
           metadata->>'before_identity_phone' AS before_identity_phone
      FROM public.audit_events
     WHERE action = 'AUTH_PHONE_NORMALIZED'
       AND metadata->>'migration' = '089'
  LOOP
    -- Cast original_phone_confirmed_at carefully: it may be NULL or a
    -- timestamp string. JSON null becomes SQL NULL via metadata->>'…'.
    v_orig_confirmed_at := NULLIF(v_row.orig_confirmed_str, '')::TIMESTAMPTZ;

    UPDATE auth.users
       SET phone = v_row.before_phone,
           phone_confirmed_at = v_orig_confirmed_at
     WHERE id = v_row.user_id
       AND phone = v_row.after_phone;

    IF FOUND THEN
      v_restored_users := v_restored_users + 1;
    END IF;

    IF v_row.identity_updated IS TRUE AND v_row.before_identity_phone IS NOT NULL THEN
      UPDATE auth.identities
         SET identity_data = jsonb_set(
               identity_data, '{phone}', to_jsonb(v_row.before_identity_phone)
             )
       WHERE user_id = v_row.user_id
         AND provider = 'phone'
         AND identity_data->>'phone' = v_row.after_phone;

      IF FOUND THEN
        v_restored_identities := v_restored_identities + 1;
      END IF;
    END IF;
  END LOOP;

  -- Step 3: delete the audit rows themselves.
  DELETE FROM public.audit_events
   WHERE action = 'AUTH_PHONE_NORMALIZED'
     AND metadata->>'migration' = '089';

  RAISE NOTICE 'mig 089 rollback: % auth.users restored, % auth.identities restored.',
    v_restored_users, v_restored_identities;
END $$;
