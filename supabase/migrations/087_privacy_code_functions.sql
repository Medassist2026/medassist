-- ============================================================================
-- Migration 087 — Privacy code SECURITY DEFINER functions
--
-- Six functions: regenerate_privacy_code, verify_privacy_code,
-- check_phone_uniform, initiate_sms_share, verify_sms_code,
-- record_privacy_code_attempt (internal). Plus _generate_privacy_code_plaintext
-- (internal helper).
--
-- Per audits/patient-identity-schema-spec.md § 16 and § 16.1.
-- Per audits/patient-identity-migration-plan.md Steps 6 + 8.
-- Per audits/EXECUTION_PROMPTS.md.md Prompt 4 § B4.
--
-- ----------------------------------------------------------------------------
-- VERIFIED 2026-05-03 (Audit Session C, ruling R6)
-- ----------------------------------------------------------------------------
-- The schema_migrations tracking table on staging has THREE rows for this
-- migration:
--    087_privacy_code_functions             (original)
--    087_privacy_code_functions_search_path_fix (hot-patch added SET search_path)
--    087_privacy_code_function_grants_hardening  (hot-patch tightened REVOKE/GRANT)
-- Only one .sql file ever existed in the repo. Session A flagged this as
-- "live function/view bodies are authoritative; file no longer reliable."
--
-- Audit Session C dumped the live function definitions from staging via
-- pg_get_functiondef on 2026-05-03 and compared body, search_path, and grant
-- state against this file. Result: the file content already incorporates
-- both hot-patches:
--   * SET search_path = public, extensions, pg_temp present on every body.
--   * REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated on internal helpers.
--   * GRANT EXECUTE TO authenticated on the user-facing functions.
--   * GRANT EXECUTE TO anon, authenticated on check_phone_uniform.
-- These match staging's live grant state exactly (verified via
-- information_schema.routine_privileges).
--
-- One narrow body difference was found: verify_privacy_code declared and
-- selected an unused local variable v_pc_revoked_at. Live staging does not.
-- The variable was never referenced in the function body — safe to drop.
-- This file edit removes that dead variable to bring the file fully into
-- byte-level alignment with the deployed function.
--
-- 2026-05-03 (continuation, Q3 ruling): a second body diff was caught by
-- the pre-apply re-verification (audits/database-audit/preapply-verif-087.md).
-- The wrong-code branch's terminal RETURN was missing its uniform-timing pad
-- statement (`PERFORM pg_sleep(GREATEST(0, ...))`) that every other branch
-- in verify_privacy_code emits before its RETURN. Added the missing pg_sleep
-- pad in wrong-code branch terminal RETURN per preapply-verif-087.md so the
-- file body matches live byte-for-byte. After this edit `PERFORM pg_sleep`
-- count = 7 in both file and live (verified Step "Re-verify" in
-- audits/database-audit/mig-087-edit-confirmation.md).
--
-- This file is now CANONICAL. Re-applying via Supabase migrations CLI is a
-- no-op (CREATE OR REPLACE FUNCTION + same body + same grants).
--
-- INVARIANTS (load-bearing for the entire privacy model)
--   - Uniform shape: every failure of verify_* / check_* returns the
--     same JSONB { exists/success: false, requires_code: true }. NO
--     error code distinguishes "rate_limited" from "wrong code" from
--     "no such patient" externally. Internally we still log the precise
--     reason in privacy_code_attempts.
--   - Uniform timing: every function pads to >= 50ms wall-clock so an
--     attacker cannot distinguish branches via response latency. Bcrypt
--     verify takes ~400ms at cost 12, dominating other branches naturally.
--     For fast branches (rate-limited, no-such-patient) we pg_sleep the
--     difference.
--   - Atomic transactions: every multi-write function commits all writes
--     together or none. Per § 16.1.
--   - SECURITY DEFINER: function runs with the schema owner's privileges
--     (bypasses RLS). All authorization checks are inline.
--   - GRANTS: GRANT EXECUTE TO authenticated, anon (the check_phone_uniform
--     path is callable pre-auth from front desk; the API layer verifies
--     auth and clinic context separately).
--
-- AUDIT ROW PAIRING
--   Every successful or failed privacy_code action writes BOTH a
--   privacy_code_attempts row AND an audit_events row in the same
--   transaction. Failure of either rolls back the parent operation.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. _generate_privacy_code_plaintext — internal helper
-- ----------------------------------------------------------------------------
-- Returns a 6-character base32 plaintext from gen_random_bytes (CSPRNG).
-- Modulo bias check: 256 / 32 = 8 exactly → no bias. If alphabet size
-- ever changes to a non-divisor of 256, switch to rejection sampling.
-- Underscore prefix marks it as internal (callers use regenerate_privacy_code).
CREATE OR REPLACE FUNCTION public._generate_privacy_code_plaintext()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_alphabet_len CONSTANT INT := 32;
  v_plaintext TEXT := '';
  v_random_bytes BYTEA;
  v_byte INT;
  v_i INT;
BEGIN
  v_random_bytes := gen_random_bytes(6);
  FOR v_i IN 1..6 LOOP
    v_byte := get_byte(v_random_bytes, v_i - 1);
    v_plaintext := v_plaintext ||
      substr(v_alphabet, 1 + (v_byte % v_alphabet_len), 1);
  END LOOP;
  RETURN v_plaintext;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._generate_privacy_code_plaintext() FROM PUBLIC, anon, authenticated;
-- Internal only — service_role only (Supabase grants EXECUTE to anon+authenticated by default;
-- explicit revoke from those roles is required, REVOKE FROM PUBLIC alone is not enough).

-- ----------------------------------------------------------------------------
-- 2. _generate_sms_code_plaintext — internal helper (4-digit)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._generate_sms_code_plaintext()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_random_bytes BYTEA;
  v_n INT;
BEGIN
  v_random_bytes := gen_random_bytes(2);
  -- 16-bit unsigned in [0, 65535]. Map to [0, 9999] via modulo.
  -- 65536 / 10000 = 6.5536 → modulo bias is ~5e-5 (negligible for the
  -- 5-minute TTL + per-token attempts cap. Acceptable trade-off vs
  -- rejection sampling.)
  v_n := (get_byte(v_random_bytes, 0) * 256 + get_byte(v_random_bytes, 1)) % 10000;
  RETURN lpad(v_n::TEXT, 4, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public._generate_sms_code_plaintext() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. record_privacy_code_attempt — internal append-only writer
-- ----------------------------------------------------------------------------
-- Single INSERT inside the caller's transaction. No autonomous transaction.
CREATE OR REPLACE FUNCTION public.record_privacy_code_attempt(
  p_global_patient_id UUID,
  p_privacy_code_id UUID,
  p_attempted_by_user_id UUID,
  p_attempted_by_clinic_id UUID,
  p_result privacy_code_attempt_result,
  p_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_request_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  INSERT INTO public.privacy_code_attempts (
    global_patient_id, privacy_code_id,
    attempted_by_user_id, attempted_by_clinic_id,
    result, ip_address, user_agent, request_id
  )
  VALUES (
    p_global_patient_id, p_privacy_code_id,
    p_attempted_by_user_id, p_attempted_by_clinic_id,
    p_result, p_ip, p_user_agent, p_request_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.record_privacy_code_attempt(UUID, UUID, UUID, UUID, privacy_code_attempt_result, INET, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. regenerate_privacy_code — patient-initiated mint or service-role mint
-- ----------------------------------------------------------------------------
-- Atomic per § 16.1: revoke old + insert new + audit, or none.
-- Returns the plaintext to the caller ONCE. Caller must NOT log it.
CREATE OR REPLACE FUNCTION public.regenerate_privacy_code(
  p_global_patient_id UUID
) RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_is_patient BOOLEAN;
  v_caller_is_service BOOLEAN;
  v_actor_kind TEXT;
  v_actor_user UUID;
  v_plaintext TEXT;
  v_hash TEXT;
  v_new_id UUID;
  v_new_regen_count INT;
BEGIN
  -- Authorize: either the claimed patient, or service-role.
  -- (Service-role calls auth.uid() = NULL; the column claimed_user_id
  -- is also NULL pre-claim, but the caller_is_service short-circuit
  -- handles that case.)
  v_caller_is_service := (auth.role() = 'service_role');

  IF NOT v_caller_is_service THEN
    SELECT (claimed_user_id = auth.uid())
      INTO v_caller_is_patient
      FROM public.global_patients
     WHERE id = p_global_patient_id;
    IF NOT COALESCE(v_caller_is_patient, FALSE) THEN
      RAISE EXCEPTION 'unauthorized: only the claimed patient or service role may regenerate this code';
    END IF;
    v_actor_kind := 'user';
    v_actor_user := auth.uid();
  ELSE
    v_actor_kind := 'system';
    v_actor_user := NULL;
  END IF;

  -- Mint plaintext + hash.
  v_plaintext := public._generate_privacy_code_plaintext();
  v_hash := crypt(v_plaintext, gen_salt('bf', 12));

  -- Compute the new regenerated_count = max(prior) + 1, or 0 if none.
  SELECT COALESCE(MAX(regenerated_count), -1) + 1
    INTO v_new_regen_count
    FROM public.patient_privacy_codes
   WHERE global_patient_id = p_global_patient_id;

  -- Revoke any existing ACTIVE row.
  UPDATE public.patient_privacy_codes
     SET revoked_at = NOW(),
         revoked_reason = 'regenerated'
   WHERE global_patient_id = p_global_patient_id
     AND revoked_at IS NULL;

  -- Insert new active row.
  INSERT INTO public.patient_privacy_codes (
    global_patient_id, code_hash, algorithm, regenerated_count
  ) VALUES (
    p_global_patient_id, v_hash, 'bcrypt', v_new_regen_count
  )
  RETURNING id INTO v_new_id;

  -- Audit. Atomic with the table writes (same transaction).
  INSERT INTO public.audit_events (
    clinic_id, actor_user_id, actor_kind, action,
    entity_type, entity_id, metadata
  ) VALUES (
    NULL, v_actor_user, v_actor_kind, 'PRIVACY_CODE_REGENERATED',
    'global_patients', p_global_patient_id,
    jsonb_build_object(
      'privacy_code_id', v_new_id,
      'regenerated_count', v_new_regen_count,
      'minted_via', CASE WHEN v_caller_is_service THEN 'lazy_mint' ELSE 'patient_request' END
    )
  );

  RETURN v_plaintext;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.regenerate_privacy_code(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_privacy_code(UUID) TO authenticated;

COMMENT ON FUNCTION public.regenerate_privacy_code(UUID) IS
  'Mints (or rotates) a privacy code. RETURN value is the plaintext code; callers must NOT log it, store it, or pass through any caching layer. Atomic per schema-spec § 16.1: revoke + insert + audit succeed together or all roll back. Authorized for the claimed patient (auth.uid() = global_patients.claimed_user_id) or service-role.';

-- ----------------------------------------------------------------------------
-- 5. verify_privacy_code — three-step ordering, uniform shape + timing
-- ----------------------------------------------------------------------------
-- Returns JSONB. Success: { success: true, global_patient_id: <uuid> }.
-- Failure: { success: false, requires_code: true } (uniform — caller
-- cannot distinguish failure mode externally).
--
-- Step 0: per-(clinic, gpid) rate limit (5/hr → reject, no SMS).
-- Step 1: per-code lockout (locked_until > NOW → reject).
-- Step 2: bcrypt verify; on miss increment attempts_count. If new count
--          >= 5, set locked_until = NOW + 24h AND emit PRIVACY_CODE_LOCKED
--          audit (TS layer fans out to SMS).
--
-- Uniform timing: every branch pads to >= 50ms wall-clock.
-- Bcrypt verify alone is ~400ms at cost 12, so Step 2 naturally exceeds
-- the floor. The fast branches (Step 0 + Step 1 + no-such-patient) need
-- explicit pg_sleep padding.
CREATE OR REPLACE FUNCTION public.verify_privacy_code(
  p_phone TEXT,
  p_code TEXT,
  p_attempted_by_user_id UUID,
  p_attempted_by_clinic_id UUID,
  p_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_request_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_start TIMESTAMPTZ := clock_timestamp();
  v_min_ms CONSTANT INT := 50;
  v_normalized TEXT;
  v_gpid UUID;
  v_recent_failures INT;
  v_pc_id UUID;
  v_pc_hash TEXT;
  v_pc_attempts INT;
  v_pc_locked_until TIMESTAMPTZ;
  -- v_pc_revoked_at removed 2026-05-03 (Audit Session C R6) — variable was
  -- declared and SELECTed into but never referenced. Live staging function
  -- already lacks it; this edit aligns the file.
  v_match BOOLEAN;
  v_new_attempts INT;
  v_actual_ms NUMERIC;
  v_failure_payload CONSTANT JSONB :=
    jsonb_build_object('success', FALSE, 'requires_code', TRUE);
BEGIN
  v_normalized := public.normalize_phone_e164(p_phone);

  -- If phone doesn't normalize OR no global_patient at this phone:
  -- record nothing (we have no gpid to anchor the audit), pad timing,
  -- return uniform failure. This is the "no such patient" privacy-leak
  -- prevention path.
  IF v_normalized IS NULL THEN
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  SELECT id INTO v_gpid
    FROM public.global_patients
   WHERE normalized_phone = v_normalized
   LIMIT 1;

  IF v_gpid IS NULL THEN
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  -- Step 0: per-(clinic, gpid) rate limit.
  SELECT COUNT(*)
    INTO v_recent_failures
    FROM public.privacy_code_attempts
   WHERE global_patient_id = v_gpid
     AND attempted_by_clinic_id = p_attempted_by_clinic_id
     AND created_at > NOW() - INTERVAL '1 hour'
     AND result IN ('failure','locked_out','rate_limited');

  IF v_recent_failures >= 5 THEN
    PERFORM public.record_privacy_code_attempt(
      v_gpid, NULL, p_attempted_by_user_id, p_attempted_by_clinic_id,
      'rate_limited', p_ip, p_user_agent, p_request_id
    );
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action,
      entity_type, entity_id, metadata
    ) VALUES (
      p_attempted_by_clinic_id, p_attempted_by_user_id, 'user',
      'PRIVACY_CODE_ATTEMPT_FAILURE',
      'global_patients', v_gpid,
      jsonb_build_object('reason', 'rate_limited', 'request_id', p_request_id)
    );
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  -- Step 1: per-code lockout.
  -- (revoked_at no longer SELECTed into a variable — the WHERE clause
  -- revoked_at IS NULL already filters out revoked rows. Aligned with
  -- live staging definition 2026-05-03 by Audit Session C R6.)
  SELECT id, code_hash, attempts_count, locked_until
    INTO v_pc_id, v_pc_hash, v_pc_attempts, v_pc_locked_until
    FROM public.patient_privacy_codes
   WHERE global_patient_id = v_gpid
     AND revoked_at IS NULL
   LIMIT 1;

  -- No active code? Treat as failure (uniform shape) but don't write a
  -- patient-specific audit — there's nothing to attribute to.
  IF v_pc_id IS NULL THEN
    PERFORM public.record_privacy_code_attempt(
      v_gpid, NULL, p_attempted_by_user_id, p_attempted_by_clinic_id,
      'failure', p_ip, p_user_agent, p_request_id
    );
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  IF v_pc_locked_until IS NOT NULL AND v_pc_locked_until > NOW() THEN
    PERFORM public.record_privacy_code_attempt(
      v_gpid, v_pc_id, p_attempted_by_user_id, p_attempted_by_clinic_id,
      'locked_out', p_ip, p_user_agent, p_request_id
    );
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action,
      entity_type, entity_id, metadata
    ) VALUES (
      p_attempted_by_clinic_id, p_attempted_by_user_id, 'user',
      'PRIVACY_CODE_ATTEMPT_FAILURE',
      'global_patients', v_gpid,
      jsonb_build_object('reason', 'locked_out', 'request_id', p_request_id)
    );
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  -- Step 2: bcrypt verify.
  -- bcrypt's crypt() is constant-time per OpenBSD spec.
  v_match := (crypt(p_code, v_pc_hash) = v_pc_hash);

  IF v_match THEN
    -- Reset per-code lifetime counter on successful auth.
    UPDATE public.patient_privacy_codes
       SET attempts_count = 0,
           last_attempt_at = NOW(),
           locked_until = NULL
     WHERE id = v_pc_id;

    PERFORM public.record_privacy_code_attempt(
      v_gpid, v_pc_id, p_attempted_by_user_id, p_attempted_by_clinic_id,
      'success', p_ip, p_user_agent, p_request_id
    );
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action,
      entity_type, entity_id, metadata
    ) VALUES (
      p_attempted_by_clinic_id, p_attempted_by_user_id, 'user',
      'PRIVACY_CODE_ATTEMPT_SUCCESS',
      'global_patients', v_gpid,
      jsonb_build_object('privacy_code_id', v_pc_id, 'request_id', p_request_id)
    );

    -- bcrypt verify is naturally ~400ms; no padding needed but we keep
    -- the safety floor.
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN jsonb_build_object(
      'success', TRUE,
      'global_patient_id', v_gpid
    );
  END IF;

  -- Wrong code. Increment lifetime counter; trip 24h lockout at 5.
  v_new_attempts := v_pc_attempts + 1;
  UPDATE public.patient_privacy_codes
     SET attempts_count = v_new_attempts,
         last_attempt_at = NOW(),
         locked_until = CASE WHEN v_new_attempts >= 5
                             THEN NOW() + INTERVAL '24 hours'
                             ELSE locked_until END
   WHERE id = v_pc_id;

  PERFORM public.record_privacy_code_attempt(
    v_gpid, v_pc_id, p_attempted_by_user_id, p_attempted_by_clinic_id,
    'failure', p_ip, p_user_agent, p_request_id
  );
  INSERT INTO public.audit_events (
    clinic_id, actor_user_id, actor_kind, action,
    entity_type, entity_id, metadata
  ) VALUES (
    p_attempted_by_clinic_id, p_attempted_by_user_id, 'user',
    'PRIVACY_CODE_ATTEMPT_FAILURE',
    'global_patients', v_gpid,
    jsonb_build_object('reason', 'wrong_code', 'attempts_count', v_new_attempts, 'request_id', p_request_id)
  );

  IF v_new_attempts >= 5 THEN
    -- Patient SMS notification on per-code lockout. The TS wrapper reads
    -- this audit row and dispatches via Twilio. We do NOT inline-send
    -- from a SECURITY DEFINER function (no HTTP from within the DB,
    -- and atomicity matters more than send-latency).
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action,
      entity_type, entity_id, metadata
    ) VALUES (
      p_attempted_by_clinic_id, NULL, 'system',
      'PRIVACY_CODE_LOCKED',
      'global_patients', v_gpid,
      jsonb_build_object(
        'privacy_code_id', v_pc_id,
        'locked_until', (NOW() + INTERVAL '24 hours'),
        'attempts_count', v_new_attempts,
        'sms_dispatch_pending', TRUE
      )
    );
  END IF;

  PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
  RETURN v_failure_payload;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_privacy_code(TEXT, TEXT, UUID, UUID, INET, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_privacy_code(TEXT, TEXT, UUID, UUID, INET, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.verify_privacy_code(TEXT, TEXT, UUID, UUID, INET, TEXT, UUID) IS
  'Three-step verify: per-clinic rate limit (Step 0), per-code lockout (Step 1), bcrypt compare (Step 2). Uniform shape on every failure. Uniform timing >= 50ms (bcrypt naturally pads success). On 5 lifetime failures, sets locked_until=NOW+24h and emits PRIVACY_CODE_LOCKED for the TS layer to fan out as patient SMS. Atomic per § 16.1.';

-- ----------------------------------------------------------------------------
-- 6. check_phone_uniform — search-privacy parity
-- ----------------------------------------------------------------------------
-- ALWAYS returns { exists: false, requires_code: true } regardless of
-- input. NEVER reveals whether the phone matches a global_patient.
-- Pads timing to >= 50ms wall-clock.
CREATE OR REPLACE FUNCTION public.check_phone_uniform(
  p_phone TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_start TIMESTAMPTZ := clock_timestamp();
  v_min_ms CONSTANT INT := 50;
  v_normalized TEXT;
  v_dummy BOOLEAN;
BEGIN
  v_normalized := public.normalize_phone_e164(p_phone);

  -- Do the lookup but discard the result. The lookup runs even on NULL
  -- normalized so the timing profile is uniform.
  IF v_normalized IS NULL THEN
    SELECT FALSE INTO v_dummy;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.global_patients
       WHERE normalized_phone = v_normalized
    ) INTO v_dummy;
  END IF;

  -- Pad to floor.
  PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));

  RETURN jsonb_build_object(
    'exists', FALSE,
    'requires_code', TRUE
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_phone_uniform(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_phone_uniform(TEXT) TO authenticated, anon;

COMMENT ON FUNCTION public.check_phone_uniform(TEXT) IS
  'Search-privacy parity: returns identical shape AND timing regardless of whether the phone matches a global_patient. The actual lookup happens but its result is discarded; only privacy-code redemption reveals existence. Min response time 50ms.';

-- ----------------------------------------------------------------------------
-- 7. initiate_sms_share — mint a 4-digit SMS token + queue dispatch
-- ----------------------------------------------------------------------------
-- Returns { requires_code: true } regardless of whether the phone matched
-- (uniform — don't leak existence via "we sent SMS" vs "no SMS sent").
-- The TS layer reads the SMS_CONSENT_SENT audit and dispatches via Twilio.
CREATE OR REPLACE FUNCTION public.initiate_sms_share(
  p_phone TEXT,
  p_requesting_clinic_id UUID,
  p_requesting_doctor_id UUID,
  p_request_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_start TIMESTAMPTZ := clock_timestamp();
  v_min_ms CONSTANT INT := 50;
  v_normalized TEXT;
  v_gpid UUID;
  v_recent_unused INT;
  v_plaintext TEXT;
  v_hash TEXT;
  v_token_id UUID;
  v_uniform_payload CONSTANT JSONB :=
    jsonb_build_object('requires_code', TRUE);
BEGIN
  v_normalized := public.normalize_phone_e164(p_phone);

  IF v_normalized IS NULL THEN
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_uniform_payload;
  END IF;

  SELECT id INTO v_gpid
    FROM public.global_patients
   WHERE normalized_phone = v_normalized
   LIMIT 1;

  IF v_gpid IS NULL THEN
    -- No patient at this phone. Return uniform without minting.
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_uniform_payload;
  END IF;

  -- Per-patient send rate limit: 3 unused active tokens in the last hour.
  -- Prevents a single clinic from spam-sending consent SMS to one patient.
  SELECT COUNT(*) INTO v_recent_unused
    FROM public.privacy_code_sms_tokens
   WHERE global_patient_id = v_gpid
     AND used_at IS NULL
     AND created_at > NOW() - INTERVAL '1 hour';

  IF v_recent_unused >= 3 THEN
    -- Quietly reject (uniform shape). Audit so we can detect abuse.
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action,
      entity_type, entity_id, metadata
    ) VALUES (
      p_requesting_clinic_id, p_requesting_doctor_id, 'user',
      'SMS_CODE_FAILED',
      'global_patients', v_gpid,
      jsonb_build_object(
        'reason', 'send_rate_limited',
        'recent_unused', v_recent_unused,
        'request_id', p_request_id
      )
    );
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_uniform_payload;
  END IF;

  -- Mint plaintext + hash.
  v_plaintext := public._generate_sms_code_plaintext();
  v_hash := crypt(v_plaintext, gen_salt('bf', 12));

  INSERT INTO public.privacy_code_sms_tokens (
    global_patient_id,
    requesting_clinic_id,
    requesting_doctor_id,
    sms_code_hash,
    algorithm,
    expires_at
  ) VALUES (
    v_gpid,
    p_requesting_clinic_id,
    p_requesting_doctor_id,
    v_hash,
    'bcrypt',
    NOW() + INTERVAL '5 minutes'
  )
  RETURNING id INTO v_token_id;

  -- Audit row carries the plaintext — the TS layer reads it once, sends
  -- the SMS, then erases it. (Plaintext-in-audit is acceptable here
  -- because the audit_events table itself has DENY-ALL until Prompt 6
  -- and only the TS sender reads via service-role.)
  INSERT INTO public.audit_events (
    clinic_id, actor_user_id, actor_kind, action,
    entity_type, entity_id, metadata
  ) VALUES (
    p_requesting_clinic_id, p_requesting_doctor_id, 'user',
    'SMS_CONSENT_SENT',
    'global_patients', v_gpid,
    jsonb_build_object(
      'sms_token_id', v_token_id,
      'expires_at', NOW() + INTERVAL '5 minutes',
      'sms_plaintext', v_plaintext,
      'requesting_clinic_id', p_requesting_clinic_id,
      'requesting_doctor_id', p_requesting_doctor_id,
      'request_id', p_request_id,
      'sms_dispatch_pending', TRUE
    )
  );

  PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
  RETURN v_uniform_payload;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.initiate_sms_share(TEXT, UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.initiate_sms_share(TEXT, UUID, UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.initiate_sms_share(TEXT, UUID, UUID, UUID) IS
  'Mints a 5-minute 4-digit SMS share token. Returns uniform { requires_code: true } regardless of whether the phone matched. The plaintext is written to audit_events.metadata for the TS sender to dispatch (DENY-ALL on audit_events keeps it from clinic clients). Per-patient send rate limit (3 unused tokens/hr) prevents spam.';

-- ----------------------------------------------------------------------------
-- 8. verify_sms_code — single-use SMS verify
-- ----------------------------------------------------------------------------
-- Same shape as verify_privacy_code. Sets used_at on success.
CREATE OR REPLACE FUNCTION public.verify_sms_code(
  p_phone TEXT,
  p_code TEXT,
  p_attempted_by_user_id UUID,
  p_attempted_by_clinic_id UUID,
  p_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_request_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_start TIMESTAMPTZ := clock_timestamp();
  v_min_ms CONSTANT INT := 50;
  v_normalized TEXT;
  v_gpid UUID;
  v_token RECORD;
  v_match BOOLEAN;
  v_failure_payload CONSTANT JSONB :=
    jsonb_build_object('success', FALSE, 'requires_code', TRUE);
BEGIN
  v_normalized := public.normalize_phone_e164(p_phone);

  IF v_normalized IS NULL THEN
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  SELECT id INTO v_gpid
    FROM public.global_patients
   WHERE normalized_phone = v_normalized
   LIMIT 1;

  IF v_gpid IS NULL THEN
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  -- Find the most recent unused unexpired token for (gpid, clinic).
  SELECT id, sms_code_hash, expires_at, attempts_count
    INTO v_token
    FROM public.privacy_code_sms_tokens
   WHERE global_patient_id = v_gpid
     AND requesting_clinic_id = p_attempted_by_clinic_id
     AND used_at IS NULL
     AND expires_at > NOW()
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_token.id IS NULL THEN
    PERFORM public.record_privacy_code_attempt(
      v_gpid, NULL, p_attempted_by_user_id, p_attempted_by_clinic_id,
      'failure', p_ip, p_user_agent, p_request_id
    );
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action,
      entity_type, entity_id, metadata
    ) VALUES (
      p_attempted_by_clinic_id, p_attempted_by_user_id, 'user',
      'SMS_CODE_FAILED',
      'global_patients', v_gpid,
      jsonb_build_object('reason', 'no_active_token', 'request_id', p_request_id)
    );
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  -- Per-token attempts cap: 5 failures across this single token → reject.
  IF v_token.attempts_count >= 5 THEN
    PERFORM public.record_privacy_code_attempt(
      v_gpid, NULL, p_attempted_by_user_id, p_attempted_by_clinic_id,
      'rate_limited', p_ip, p_user_agent, p_request_id
    );
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action,
      entity_type, entity_id, metadata
    ) VALUES (
      p_attempted_by_clinic_id, p_attempted_by_user_id, 'user',
      'SMS_CODE_FAILED',
      'global_patients', v_gpid,
      jsonb_build_object('reason', 'token_attempts_exhausted', 'sms_token_id', v_token.id, 'request_id', p_request_id)
    );
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  v_match := (crypt(p_code, v_token.sms_code_hash) = v_token.sms_code_hash);

  IF v_match THEN
    UPDATE public.privacy_code_sms_tokens
       SET used_at = NOW(),
           used_by_user_id = p_attempted_by_user_id,
           attempts_count = attempts_count + 1
     WHERE id = v_token.id;

    PERFORM public.record_privacy_code_attempt(
      v_gpid, NULL, p_attempted_by_user_id, p_attempted_by_clinic_id,
      'success', p_ip, p_user_agent, p_request_id
    );
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action,
      entity_type, entity_id, metadata
    ) VALUES (
      p_attempted_by_clinic_id, p_attempted_by_user_id, 'user',
      'SMS_CODE_VERIFIED',
      'global_patients', v_gpid,
      jsonb_build_object('sms_token_id', v_token.id, 'request_id', p_request_id)
    );
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN jsonb_build_object(
      'success', TRUE,
      'global_patient_id', v_gpid
    );
  END IF;

  -- Wrong code on a real token. Increment per-token attempts; uniform failure.
  UPDATE public.privacy_code_sms_tokens
     SET attempts_count = attempts_count + 1
   WHERE id = v_token.id;

  PERFORM public.record_privacy_code_attempt(
    v_gpid, NULL, p_attempted_by_user_id, p_attempted_by_clinic_id,
    'failure', p_ip, p_user_agent, p_request_id
  );
  INSERT INTO public.audit_events (
    clinic_id, actor_user_id, actor_kind, action,
    entity_type, entity_id, metadata
  ) VALUES (
    p_attempted_by_clinic_id, p_attempted_by_user_id, 'user',
    'SMS_CODE_FAILED',
    'global_patients', v_gpid,
    jsonb_build_object('reason', 'wrong_code', 'sms_token_id', v_token.id, 'request_id', p_request_id)
  );

  PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
  RETURN v_failure_payload;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_sms_code(TEXT, TEXT, UUID, UUID, INET, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_sms_code(TEXT, TEXT, UUID, UUID, INET, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.verify_sms_code(TEXT, TEXT, UUID, UUID, INET, TEXT, UUID) IS
  'Single-use SMS share verify. Sets used_at on success. Returns uniform shape on every failure (no active token, expired, wrong code, attempts exhausted). Atomic per § 16.1.';
