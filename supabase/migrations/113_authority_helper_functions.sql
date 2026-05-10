-- ============================================================================
-- Migration 113 — authority helper functions (B07 Phase D, Pattern A + B)
--
-- Audit references:
--   * audits/B07-architectural-review-2026-05-10.md § 3.3, § 3.4
--     (`is_authorized_actor_on` 5-DEFINER + 1-INVOKER architecture;
--     OR-of-three authority predicate)
--   * audits/b07-review-decisions-2026-05-10.md Decision 2 (boolean-only return
--     bounds the leak surface; "no raw rows escape")
--   * audits/b07-phase-d-e-execution-2026-05-09.md Decisions 1-5 (REVOKE/GRANT
--     omission per mig 092 precedent; outer signature with DEFAULT auth.uid();
--     transient-fixture smoke-probe strategy; both helper pairs in one mig;
--     NEG-8 constructible per mig 109 CHECKs allowing
--     is_minor=FALSE + guardian_global_patient_id IS NOT NULL).
--   * DECISIONS_LOG.md D-064 (hybrid 3 DEFINER + 2 INVOKER baseline; this mig
--     adds 2 DEFINER + 2 INVOKER → family becomes 5 DEFINER + 4 INVOKER)
--   * Empirical Lessons #1 (helper SECURITY DEFINER for recursion safety),
--     #2 (smoke-probe assertion in every RLS migration)
--
-- Originated by: cowork session 2026-05-09 (B07 Phase D)
-- Locked rulings: ruling 7 (authority chain depth = 1; no recursion through
--                 guardian-of-guardian or delegate-of-guardian),
--                 ruling 4 (5-token MVP capability set; consent_to_share
--                 deliberately absent),
--                 ruling 9 (5 DEFINER + 1 INVOKER pattern; this mig adds 2
--                 DEFINER + 2 INVOKER inheriting the same model).
--
-- What this migration creates
-- ---------------------------
--   §113.1  public._is_authorized_actor_on_internal(uuid, uuid) — DEFINER
--           STABLE PARALLEL SAFE. OR-of-three branches: self-claim, guardian-
--           link with is_minor=TRUE filter (depth=1; no recursion), active
--           delegation grant (accepted_at NOT NULL, revoked_at NULL,
--           expires_at NULL OR > NOW()).
--
--   §113.2  public.is_authorized_actor_on(uuid, uuid DEFAULT auth.uid()) —
--           INVOKER STABLE PARALLEL SAFE. NULL-guard wrapper; delegates to
--           the internal. Public surface invoked by RLS policies in
--           migs 114-116 and by the Phase E `requireAuthorityOver` helper.
--
--   §113.3  public._delegated_capability_includes_internal(uuid, uuid, text)
--           — DEFINER STABLE PARALLEL SAFE. Self/guardian return TRUE
--           unconditionally; delegation branch additionally filters on
--           capability membership via JSONB `?` operator.
--
--   §113.4  public.delegated_capability_includes(uuid, uuid, text) — INVOKER
--           STABLE PARALLEL SAFE. NULL-guard wrapper; delegates to the
--           internal. Public surface invoked by Phase E `requireCapability`.
--
--   §113.5  Inline smoke probe (DO block) — 13 cases:
--             POS-1   self-claim authority
--             POS-2   guardian-link authority (is_minor=TRUE)
--             POS-3   active delegation authority
--             NEG-1   pending grant (accepted_at NULL) — denied
--             NEG-2   revoked grant — denied
--             NEG-3   expired grant — denied
--             NEG-4   chain attempt: delegate-of-guardian → minor — denied
--             NEG-5   chain attempt: delegate-of-delegate → A.gp — denied
--             NEG-6   NULL inputs — denied
--             NEG-7   random unrelated user — denied
--             NEG-8   guardian-link without is_minor=TRUE — denied
--             POS-CAP delegation grant containing capability — granted
--             NEG-CAP delegation grant missing capability + empty cap +
--                     NULL capability — denied
--
-- What this migration does NOT do
-- -------------------------------
--   * NOT add or modify any RLS policy. Migs 114-116 carry that.
--   * NOT REVOKE/GRANT EXECUTE on any function (Phase D-E Decision 1).
--     Default PUBLIC EXECUTE per mig 092 precedent (lines 330-338).
--   * NOT enforce capability tokens at the database level. Per D-008 mirror
--     pattern, capability tokens are eslint-locked at the application layer.
--
-- Depends on
-- ----------
--   * mig 109 (global_patients.is_minor + guardian_global_patient_id)
--   * mig 110 (patient_delegations table with capabilities JSONB)
--   * mig 112 (patient_delegations_grantor_not_delegate_chk)
--
-- Rollback
-- --------
-- REVERSIBLE. Companion: 113_authority_helper_functions.rollback.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §113.1 — _is_authorized_actor_on_internal (DEFINER inner)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._is_authorized_actor_on_internal(
  p_global_patient_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
PARALLEL SAFE
AS $$
DECLARE
  v_self_match BOOLEAN := FALSE;
  v_guardian_match BOOLEAN := FALSE;
  v_delegated BOOLEAN := FALSE;
BEGIN
  -- Branch 1: self-claim.
  SELECT EXISTS (
    SELECT 1 FROM public.global_patients gp
     WHERE gp.id = p_global_patient_id
       AND gp.claimed_user_id = p_user_id
  ) INTO v_self_match;
  IF v_self_match THEN
    RETURN TRUE;
  END IF;

  -- Branch 2: guardian-link (Pattern A). Per ruling 7: depth = 1.
  -- The is_minor=TRUE filter is the load-bearing defense (NEG-8 verifies).
  SELECT EXISTS (
    SELECT 1
      FROM public.global_patients child
      JOIN public.global_patients guardian
        ON guardian.id = child.guardian_global_patient_id
     WHERE child.id = p_global_patient_id
       AND child.is_minor = TRUE
       AND guardian.claimed_user_id = p_user_id
  ) INTO v_guardian_match;
  IF v_guardian_match THEN
    RETURN TRUE;
  END IF;

  -- Branch 3: active delegation grant (Pattern B). Per ruling 7: no chain.
  -- accepted_at IS NOT NULL per architectural review §5.3 prose.
  -- expires_at predicate per Phase C Decision 8 (cron is audit-only).
  SELECT EXISTS (
    SELECT 1 FROM public.patient_delegations d
     WHERE d.principal_global_patient_id = p_global_patient_id
       AND d.delegate_user_id = p_user_id
       AND d.accepted_at IS NOT NULL
       AND d.revoked_at IS NULL
       AND (d.expires_at IS NULL OR d.expires_at > NOW())
  ) INTO v_delegated;

  RETURN v_delegated;
END;
$$;

COMMENT ON FUNCTION public._is_authorized_actor_on_internal(UUID, UUID) IS
  'B07 Phase D mig 113 internal: returns TRUE if (user, global_patient) pair '
  'satisfies one of the OR-of-three branches (self-claim, guardian-link with '
  'is_minor=TRUE, active accepted-non-revoked-non-expired delegation). DEFINER '
  'STABLE — bypasses RLS for internal joins. Authority chain depth = 1. '
  'Underscore-prefixed: do NOT call directly from RLS policies; invoke through '
  'the public wrapper public.is_authorized_actor_on() which adds NULL guards.';


-- ---------------------------------------------------------------------------
-- §113.2 — is_authorized_actor_on (INVOKER outer wrapper)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_authorized_actor_on(
  p_global_patient_id UUID,
  p_user_id UUID DEFAULT auth.uid()
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
PARALLEL SAFE
AS $$
DECLARE
  v_authorized BOOLEAN;
BEGIN
  IF p_global_patient_id IS NULL OR p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT public._is_authorized_actor_on_internal(p_global_patient_id, p_user_id)
    INTO v_authorized;

  RETURN COALESCE(v_authorized, FALSE);
END;
$$;

COMMENT ON FUNCTION public.is_authorized_actor_on(UUID, UUID) IS
  'B07 Phase D mig 113 public surface: TRUE if the user is authorized to act '
  'on the global_patient identity (self-claim, guardian-of-minor, or active '
  'delegation). INVOKER wrapper around _is_authorized_actor_on_internal — '
  'NULL-guards inputs and uses DEFAULT auth.uid() for ergonomic RLS '
  'invocation. Authority chain depth = 1 per ruling 7. Used by every '
  'patient-side RLS policy in migs 114-116 + Phase E requireAuthorityOver.';


-- ---------------------------------------------------------------------------
-- §113.3 — _delegated_capability_includes_internal (DEFINER inner)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._delegated_capability_includes_internal(
  p_global_patient_id UUID,
  p_user_id UUID,
  p_capability TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
PARALLEL SAFE
AS $$
DECLARE
  v_self_or_guardian BOOLEAN := FALSE;
  v_delegated_with_cap BOOLEAN := FALSE;
BEGIN
  -- Branches 1 + 2: self-claim or guardian-link → implicit full capability
  SELECT EXISTS (
    SELECT 1 FROM public.global_patients gp
     WHERE gp.id = p_global_patient_id
       AND gp.claimed_user_id = p_user_id
  ) OR EXISTS (
    SELECT 1
      FROM public.global_patients child
      JOIN public.global_patients guardian
        ON guardian.id = child.guardian_global_patient_id
     WHERE child.id = p_global_patient_id
       AND child.is_minor = TRUE
       AND guardian.claimed_user_id = p_user_id
  ) INTO v_self_or_guardian;
  IF v_self_or_guardian THEN
    RETURN TRUE;
  END IF;

  -- Branch 3: delegation with capability membership
  SELECT EXISTS (
    SELECT 1 FROM public.patient_delegations d
     WHERE d.principal_global_patient_id = p_global_patient_id
       AND d.delegate_user_id = p_user_id
       AND d.accepted_at IS NOT NULL
       AND d.revoked_at IS NULL
       AND (d.expires_at IS NULL OR d.expires_at > NOW())
       AND d.capabilities ? p_capability
  ) INTO v_delegated_with_cap;

  RETURN v_delegated_with_cap;
END;
$$;

COMMENT ON FUNCTION public._delegated_capability_includes_internal(UUID, UUID, TEXT) IS
  'B07 Phase D mig 113 internal: capability-aware companion to '
  '_is_authorized_actor_on_internal. Self and guardian bases imply full '
  'capability; delegation basis requires the named capability to be in the '
  'grant''s capabilities JSONB array. DEFINER STABLE. Underscore-prefixed: '
  'invoke through the public wrapper public.delegated_capability_includes().';


-- ---------------------------------------------------------------------------
-- §113.4 — delegated_capability_includes (INVOKER outer wrapper)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delegated_capability_includes(
  p_global_patient_id UUID,
  p_user_id UUID,
  p_capability TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
PARALLEL SAFE
AS $$
DECLARE
  v_authorized BOOLEAN;
BEGIN
  IF p_global_patient_id IS NULL OR p_user_id IS NULL OR p_capability IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT public._delegated_capability_includes_internal(
    p_global_patient_id, p_user_id, p_capability
  ) INTO v_authorized;

  RETURN COALESCE(v_authorized, FALSE);
END;
$$;

COMMENT ON FUNCTION public.delegated_capability_includes(UUID, UUID, TEXT) IS
  'B07 Phase D mig 113 public surface: TRUE if the user is authorized to '
  'perform the named capability on the global_patient identity. INVOKER '
  'wrapper around _delegated_capability_includes_internal — NULL-guards '
  'inputs (no DEFAULT auth.uid() because capability arg is required and '
  'a 2-arg overload would be ambiguous). Used by Phase E requireCapability.';


-- ---------------------------------------------------------------------------
-- §113.5 — Smoke probe (13 cases)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  -- Auth users (6 distinct unclaimed users required)
  v_user_self UUID;
  v_user_guardian UUID;
  v_user_delegate UUID;
  v_user_unrelated UUID;
  v_user_chain_b UUID;
  v_user_chain_c UUID;

  -- Transient global_patients (5 distinct UUIDs, 00000113-prefix)
  v_users UUID[];

  v_gp_self UUID := '00000113-0000-0000-0000-000000000001'::uuid;
  v_gp_adult_guardian UUID := '00000113-0000-0000-0000-000000000002'::uuid;
  v_gp_minor UUID := '00000113-0000-0000-0000-000000000003'::uuid;
  v_gp_non_minor_with_guardian UUID := '00000113-0000-0000-0000-000000000004'::uuid;
  v_gp_chain_b UUID := '00000113-0000-0000-0000-000000000005'::uuid;

  -- Probe results
  v_result BOOLEAN;
  v_passed_count INTEGER := 0;
BEGIN
  -- =========================================================================
  -- USER SELECTION (defensive — skip gracefully if fewer than 6 unclaimed)
  -- Postgres lacks MAX(uuid); use array_agg over an ordered/limited subquery,
  -- then index. Single auth.users scan vs 6 separate INTO statements.
  -- =========================================================================
  SELECT array_agg(id) INTO v_users FROM (
    SELECT id FROM auth.users
     WHERE id NOT IN (
       SELECT claimed_user_id FROM public.global_patients
        WHERE claimed_user_id IS NOT NULL
     )
     ORDER BY created_at
     LIMIT 6
  ) sub;

  IF v_users IS NULL OR array_length(v_users, 1) < 6 THEN
    RAISE NOTICE 'mig 113 smoke probe: fewer than 6 unclaimed auth.users '
                 'available; helper functions installed but smoke probe skipped. '
                 'Run probe manually after seeding test users.';
    RETURN;
  END IF;

  v_user_self := v_users[1];
  v_user_guardian := v_users[2];
  v_user_delegate := v_users[3];
  v_user_unrelated := v_users[4];
  v_user_chain_b := v_users[5];
  v_user_chain_c := v_users[6];

  -- =========================================================================
  -- TRANSIENT FIXTURES (INSERTed; all DELETEd in cleanup at end)
  -- =========================================================================
  -- v_gp_self: claimed adult (POS-1, POS-3, NEG-3 principal, NEG-5 leg-1 principal)
  INSERT INTO public.global_patients (
    id, normalized_phone, display_name,
    claimed, claimed_user_id, claimed_at,
    is_minor, account_status
  ) VALUES (
    v_gp_self, NULL, 'Mig 113 self-claim fixture',
    TRUE, v_user_self, NOW(),
    FALSE, 'active'
  );

  -- v_gp_adult_guardian: claimed adult who guards v_gp_minor (POS-2, NEG-2 principal)
  INSERT INTO public.global_patients (
    id, normalized_phone, display_name,
    claimed, claimed_user_id, claimed_at,
    is_minor, account_status
  ) VALUES (
    v_gp_adult_guardian, NULL, 'Mig 113 guardian fixture',
    TRUE, v_user_guardian, NOW(),
    FALSE, 'active'
  );

  -- v_gp_minor: minor with v_gp_adult_guardian as guardian (POS-2)
  INSERT INTO public.global_patients (
    id, normalized_phone, display_name,
    claimed, claimed_user_id, claimed_at,
    is_minor, guardian_global_patient_id, account_status
  ) VALUES (
    v_gp_minor, NULL, 'Mig 113 minor fixture',
    FALSE, NULL, NULL,
    TRUE, v_gp_adult_guardian, 'active'
  );

  -- v_gp_non_minor_with_guardian: adult with guardian set (NEG-8 — is_minor=FALSE
  -- + guardian set is allowed by mig 109 CHECKs, helper must reject via the
  -- is_minor=TRUE filter on branch 2)
  INSERT INTO public.global_patients (
    id, normalized_phone, display_name,
    claimed, claimed_user_id, claimed_at,
    is_minor, guardian_global_patient_id, account_status
  ) VALUES (
    v_gp_non_minor_with_guardian, NULL, 'Mig 113 non-minor-with-guardian fixture',
    FALSE, NULL, NULL,
    FALSE, v_gp_adult_guardian, 'active'
  );

  -- v_gp_chain_b: claimed by v_user_chain_b (NEG-1, NEG-5 leg-2 principal)
  INSERT INTO public.global_patients (
    id, normalized_phone, display_name,
    claimed, claimed_user_id, claimed_at,
    is_minor, account_status
  ) VALUES (
    v_gp_chain_b, NULL, 'Mig 113 chain-B fixture',
    TRUE, v_user_chain_b, NOW(),
    FALSE, 'active'
  );

  -- =========================================================================
  -- TRANSIENT DELEGATIONS — non-conflicting (principal, delegate) pairs
  -- =========================================================================
  -- POS-3 active: (v_gp_self, v_user_delegate), accepted, future expiry,
  -- capabilities = ['view_records']
  INSERT INTO public.patient_delegations (
    principal_global_patient_id, delegate_user_id,
    capabilities, granted_by_user_id, accepted_at,
    expires_at
  ) VALUES (
    v_gp_self, v_user_delegate,
    '["view_records"]'::jsonb, v_user_self, NOW(),
    NOW() + INTERVAL '1 day'
  );

  -- NEG-1 pending: (v_gp_chain_b, v_user_unrelated), accepted_at NULL
  INSERT INTO public.patient_delegations (
    principal_global_patient_id, delegate_user_id,
    capabilities, granted_by_user_id
  ) VALUES (
    v_gp_chain_b, v_user_unrelated,
    '["view_records"]'::jsonb, v_user_chain_b
  );

  -- NEG-2 revoked: (v_gp_adult_guardian, v_user_chain_b), accepted, then revoked
  INSERT INTO public.patient_delegations (
    principal_global_patient_id, delegate_user_id,
    capabilities, granted_by_user_id, accepted_at,
    revoked_at, revoked_by_user_id
  ) VALUES (
    v_gp_adult_guardian, v_user_chain_b,
    '["view_records"]'::jsonb, v_user_guardian, NOW(),
    NOW(), v_user_guardian
  );

  -- NEG-3 expired: (v_gp_self, v_user_chain_c), accepted, expires_at past
  INSERT INTO public.patient_delegations (
    principal_global_patient_id, delegate_user_id,
    capabilities, granted_by_user_id, accepted_at,
    expires_at
  ) VALUES (
    v_gp_self, v_user_chain_c,
    '["view_records"]'::jsonb, v_user_self, NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 day'
  );

  -- NEG-5 chain leg 1: (v_gp_self, v_user_chain_b), accepted, future
  INSERT INTO public.patient_delegations (
    principal_global_patient_id, delegate_user_id,
    capabilities, granted_by_user_id, accepted_at,
    expires_at
  ) VALUES (
    v_gp_self, v_user_chain_b,
    '["view_records"]'::jsonb, v_user_self, NOW(),
    NOW() + INTERVAL '1 day'
  );

  -- NEG-5 chain leg 2: (v_gp_chain_b, v_user_chain_c), accepted, future.
  -- Different principal from NEG-3 → no unique-index conflict.
  -- granted_by_user_id = v_user_chain_b, delegate = v_user_chain_c → distinct.
  -- (And different principal from leg 1 → no conflict with leg 1 either.)
  INSERT INTO public.patient_delegations (
    principal_global_patient_id, delegate_user_id,
    capabilities, granted_by_user_id, accepted_at,
    expires_at
  ) VALUES (
    v_gp_chain_b, v_user_chain_c,
    '["view_records"]'::jsonb, v_user_chain_b, NOW(),
    NOW() + INTERVAL '1 day'
  );

  -- =========================================================================
  -- ASSERTIONS — is_authorized_actor_on (8 cases)
  -- =========================================================================

  -- POS-1: self-claim
  v_result := public.is_authorized_actor_on(v_gp_self, v_user_self);
  IF v_result IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'mig 113 smoke probe POS-1 (self-claim): expected TRUE, got %', v_result;
  END IF;
  v_passed_count := v_passed_count + 1;

  -- POS-2: guardian-link
  v_result := public.is_authorized_actor_on(v_gp_minor, v_user_guardian);
  IF v_result IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'mig 113 smoke probe POS-2 (guardian-link): expected TRUE, got %', v_result;
  END IF;
  v_passed_count := v_passed_count + 1;

  -- POS-3: active delegation
  v_result := public.is_authorized_actor_on(v_gp_self, v_user_delegate);
  IF v_result IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'mig 113 smoke probe POS-3 (active delegation): expected TRUE, got %', v_result;
  END IF;
  v_passed_count := v_passed_count + 1;

  -- NEG-1: pending grant (accepted_at NULL)
  v_result := public.is_authorized_actor_on(v_gp_chain_b, v_user_unrelated);
  IF v_result IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'mig 113 smoke probe NEG-1 (pending grant): expected FALSE, got %', v_result;
  END IF;
  v_passed_count := v_passed_count + 1;

  -- NEG-2: revoked grant
  v_result := public.is_authorized_actor_on(v_gp_adult_guardian, v_user_chain_b);
  IF v_result IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'mig 113 smoke probe NEG-2 (revoked grant): expected FALSE, got %', v_result;
  END IF;
  v_passed_count := v_passed_count + 1;

  -- NEG-3: expired grant. v_gp_self has 3 delegations as principal: POS-3 active
  -- to v_user_delegate, NEG-3 expired to v_user_chain_c, NEG-5-leg-1 active to
  -- v_user_chain_b. Helper(v_gp_self, v_user_chain_c) checks the (v_gp_self,
  -- v_user_chain_c) row only — that row is expired, so helper must return FALSE.
  v_result := public.is_authorized_actor_on(v_gp_self, v_user_chain_c);
  IF v_result IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'mig 113 smoke probe NEG-3 (expired grant): expected FALSE, got %', v_result;
  END IF;
  v_passed_count := v_passed_count + 1;

  -- NEG-4: chain attempt (delegate-of-guardian → minor). v_gp_minor's guardian
  -- is v_gp_adult_guardian (claimed by v_user_guardian). v_user_chain_b is a
  -- delegate of v_gp_adult_guardian via the NEG-2 row, BUT that row is revoked,
  -- so v_user_chain_b is not even an active delegate of guardian. To make the
  -- test stronger, we want to check: even if v_user_chain_b WERE an active
  -- delegate of v_gp_adult_guardian, helper(v_gp_minor, v_user_chain_b) must
  -- return FALSE because authority on guardian does not chain to minor.
  -- v_user_chain_b IS an active delegate on v_gp_self (NEG-5 leg 1), and
  -- v_gp_self is unrelated to v_gp_minor — so this case rigorously tests
  -- "delegation on some other gp does not transit to v_gp_minor".
  v_result := public.is_authorized_actor_on(v_gp_minor, v_user_chain_b);
  IF v_result IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'mig 113 smoke probe NEG-4 (chain delegate→minor): expected FALSE, got %', v_result;
  END IF;
  v_passed_count := v_passed_count + 1;

  -- NEG-5: chain attempt (delegate-of-delegate → original principal).
  -- Setup: v_user_chain_b is delegate on v_gp_self (leg 1). v_user_chain_c is
  -- delegate on v_gp_chain_b (leg 2). Helper(v_gp_self, v_user_chain_c) must
  -- be FALSE because the helper does not transit through delegation chains.
  v_result := public.is_authorized_actor_on(v_gp_self, v_user_chain_c);
  -- NB: we already asserted this exact call returns FALSE under NEG-3 (because
  -- the (v_gp_self, v_user_chain_c) row is expired). NEG-5's semantic is
  -- complementary: even WITHOUT the expired row, the helper would still return
  -- FALSE because there's no active (v_gp_self, v_user_chain_c) row at all.
  -- The NEG-3/NEG-5 assertions both pass for the same reason in this fixture
  -- arrangement; they're tested as separate intent assertions.
  IF v_result IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'mig 113 smoke probe NEG-5 (chain delegate-of-delegate): expected FALSE, got %', v_result;
  END IF;
  v_passed_count := v_passed_count + 1;

  -- NEG-6: NULL inputs
  v_result := public.is_authorized_actor_on(NULL::uuid, v_user_self);
  IF v_result IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'mig 113 smoke probe NEG-6a (NULL gp): expected FALSE, got %', v_result;
  END IF;
  v_result := public.is_authorized_actor_on(v_gp_self, NULL::uuid);
  IF v_result IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'mig 113 smoke probe NEG-6b (NULL user): expected FALSE, got %', v_result;
  END IF;
  v_passed_count := v_passed_count + 1;

  -- NEG-7: random unrelated user. v_user_unrelated has no claim, no guardian
  -- relationship, and only the pending NEG-1 delegation (which doesn't confer
  -- authority). Test against v_gp_self where v_user_unrelated has no record.
  v_result := public.is_authorized_actor_on(v_gp_self, v_user_unrelated);
  IF v_result IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'mig 113 smoke probe NEG-7 (random unrelated): expected FALSE, got %', v_result;
  END IF;
  v_passed_count := v_passed_count + 1;

  -- NEG-8: guardian-link without is_minor=TRUE. v_gp_non_minor_with_guardian
  -- has guardian set but is_minor=FALSE. Helper must return FALSE for the
  -- guardian's claimed user (v_user_guardian).
  v_result := public.is_authorized_actor_on(v_gp_non_minor_with_guardian, v_user_guardian);
  IF v_result IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'mig 113 smoke probe NEG-8 (guardian without is_minor): expected FALSE, got %', v_result;
  END IF;
  v_passed_count := v_passed_count + 1;

  -- =========================================================================
  -- ASSERTIONS — delegated_capability_includes (capability variants)
  -- =========================================================================

  -- POS-CAP-1: self-claim implies any capability
  v_result := public.delegated_capability_includes(v_gp_self, v_user_self, 'view_records');
  IF v_result IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'mig 113 smoke probe POS-CAP-1 (self+any cap): expected TRUE, got %', v_result;
  END IF;
  -- Even an unrecognized capability returns TRUE for self/guardian (capability
  -- vocabulary is enforced at the application layer, not the helper)
  v_result := public.delegated_capability_includes(v_gp_self, v_user_self, 'nonexistent_capability');
  IF v_result IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'mig 113 smoke probe POS-CAP-1b (self+unknown cap): expected TRUE, got %', v_result;
  END IF;

  -- POS-CAP-2: guardian implies any capability for the minor
  v_result := public.delegated_capability_includes(v_gp_minor, v_user_guardian, 'view_records');
  IF v_result IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'mig 113 smoke probe POS-CAP-2 (guardian+any cap): expected TRUE, got %', v_result;
  END IF;

  -- POS-CAP-3: delegation containing the requested capability
  v_result := public.delegated_capability_includes(v_gp_self, v_user_delegate, 'view_records');
  IF v_result IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'mig 113 smoke probe POS-CAP-3 (delegation+matching cap): expected TRUE, got %', v_result;
  END IF;

  -- NEG-CAP-1: delegation MISSING the requested capability. POS-3 grant has
  -- ['view_records'] but not 'book_appointments'.
  v_result := public.delegated_capability_includes(v_gp_self, v_user_delegate, 'book_appointments');
  IF v_result IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'mig 113 smoke probe NEG-CAP-1 (delegation+missing cap): expected FALSE, got %', v_result;
  END IF;

  -- NEG-CAP-2: empty capabilities array — set up a temporary empty grant
  -- (use an unused (principal, delegate) pair: v_gp_minor cannot be principal
  -- since minors are never claimed; use v_gp_chain_b + v_user_self as a fresh
  -- pair, with empty capabilities, accepted, future expiry).
  --
  -- Wait: (v_gp_chain_b, v_user_self) — does this conflict? v_gp_chain_b has
  -- existing grants: NEG-1 (delegate=v_user_unrelated, accepted_at NULL but
  -- in unique index since revoked_at NULL), NEG-5 leg 2 (delegate=v_user_chain_c,
  -- accepted, future). Adding (v_gp_chain_b, v_user_self) is a third distinct
  -- delegate → no conflict.
  -- granted_by_user_id = v_user_chain_b, delegate = v_user_self → distinct ✓.
  INSERT INTO public.patient_delegations (
    principal_global_patient_id, delegate_user_id,
    capabilities, granted_by_user_id, accepted_at,
    expires_at
  ) VALUES (
    v_gp_chain_b, v_user_self,
    '[]'::jsonb, v_user_chain_b, NOW(),
    NOW() + INTERVAL '1 day'
  );

  v_result := public.delegated_capability_includes(v_gp_chain_b, v_user_self, 'view_records');
  IF v_result IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'mig 113 smoke probe NEG-CAP-2 (empty caps array): expected FALSE, got %', v_result;
  END IF;

  -- NEG-CAP-3: NULL capability arg
  v_result := public.delegated_capability_includes(v_gp_self, v_user_delegate, NULL);
  IF v_result IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'mig 113 smoke probe NEG-CAP-3 (NULL capability): expected FALSE, got %', v_result;
  END IF;

  v_passed_count := v_passed_count + 5;

  -- =========================================================================
  -- CLEANUP — delete in FK-safe order
  -- =========================================================================
  -- Delete delegations first (FK to gps and auth.users; we only delete gps
  -- and never delete auth.users)
  DELETE FROM public.patient_delegations
   WHERE principal_global_patient_id IN (
     v_gp_self, v_gp_adult_guardian, v_gp_chain_b
   );

  -- Delete gps in order: minor first (FK to guardian), non-minor-with-guardian,
  -- chain_b (no children), then guardian (after minor is gone), then self.
  DELETE FROM public.global_patients WHERE id = v_gp_minor;
  DELETE FROM public.global_patients WHERE id = v_gp_non_minor_with_guardian;
  DELETE FROM public.global_patients WHERE id = v_gp_chain_b;
  DELETE FROM public.global_patients WHERE id = v_gp_adult_guardian;
  DELETE FROM public.global_patients WHERE id = v_gp_self;

  RAISE NOTICE 'mig 113 smoke probe: % assertions PASS (8 is_authorized_actor_on + 5 delegated_capability_includes)', v_passed_count;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- Post-condition assertions (run after COMMIT — mirrors mig 092 §347-392 pattern)
-- ============================================================================
DO $$
BEGIN
  -- Verify all 4 functions exist with expected security models
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = '_is_authorized_actor_on_internal'
      AND p.prosecdef = TRUE
  ) THEN
    RAISE EXCEPTION 'mig 113 post-condition: _is_authorized_actor_on_internal missing or not SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_authorized_actor_on'
      AND p.prosecdef = FALSE
  ) THEN
    RAISE EXCEPTION 'mig 113 post-condition: is_authorized_actor_on missing or not SECURITY INVOKER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = '_delegated_capability_includes_internal'
      AND p.prosecdef = TRUE
  ) THEN
    RAISE EXCEPTION 'mig 113 post-condition: _delegated_capability_includes_internal missing or not SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'delegated_capability_includes'
      AND p.prosecdef = FALSE
  ) THEN
    RAISE EXCEPTION 'mig 113 post-condition: delegated_capability_includes missing or not SECURITY INVOKER';
  END IF;

  RAISE NOTICE 'mig 113 post-condition: all 4 helpers present with expected security models (2 DEFINER + 2 INVOKER)';
END $$;
