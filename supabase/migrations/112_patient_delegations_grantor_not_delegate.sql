-- ============================================================================
-- Migration 112 — patient_delegations grantor ≠ delegate CHECK (B07 Phase B)
--
-- Audit references:
--   * audits/B07-architectural-review-2026-05-10.md § 5.3 (two-step grant
--     flow: principal grants; delegate accepts — implies grantor and delegate
--     are different parties)
--   * audits/b07-phase-b-execution-2026-05-10.md (this migration's decision
--     entry will be appended on apply)
--   * Mo 2026-05-10 review of Phase B's first batch — addition #1, schema-
--     design gap caught: mig 110 didn't enforce grantor≠delegate, exposed by
--     the smoke probe's single-user fallback path.
--   * Empirical Lesson #2 (smoke probes catch real schema gaps; the iteration
--     in mig 110's smoke probe fallback surfaced this gap)
--
-- Originated by: cowork session 2026-05-10 (B07 Phase B review-additions batch)
-- Locked rulings: 2026-05-10 — Mo's "addition 1" instruction; standalone
--                 mig 112; sympathetic update to mig 110's smoke probe to
--                 use distinct users (or skip POS gracefully if staging
--                 has fewer than 2 auth users).
--
-- Why this migration exists
-- -------------------------
-- The architectural review's two-step "grant then accept" flow (§ 5.3)
-- presumes grantor (the user clicking "delegate this account") and
-- delegate (the user accepting) are different humans. Mig 110 enforces
-- delegate_global_patient_id ≠ principal_global_patient_id (delegate
-- cannot be the same identity as principal), but it does NOT enforce
-- granted_by_user_id ≠ delegate_user_id. A self-grant (one user clicking
-- both buttons against their own gp) sneaks through the existing CHECK if
-- the delegate's gp differs from the principal's gp, which is degenerate
-- under the workflow but the schema permitted it.
--
-- This migration adds the missing CHECK. Pre-condition: zero rows
-- currently in patient_delegations (Phase B did not create any production
-- rows; mig 110's smoke probe DELETEd its test row).
--
-- Depends on
-- ----------
--   * mig 110 (the table exists)
--
-- Rollback
-- --------
-- REVERSIBLE. Companion: 112_patient_delegations_grantor_not_delegate.rollback.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 112.0 — CHECK: grantor and delegate must be different users.
-- ---------------------------------------------------------------------------
ALTER TABLE public.patient_delegations
  ADD CONSTRAINT patient_delegations_grantor_not_delegate_chk
  CHECK (granted_by_user_id <> delegate_user_id);

-- ---------------------------------------------------------------------------
-- 112.1 — Smoke probe.
-- ---------------------------------------------------------------------------
-- Verifies:
--   POS — INSERT with distinct grantor + delegate succeeds.
--   NEG — INSERT with granted_by_user_id = delegate_user_id rejected.
DO $$
DECLARE
  v_principal_gp UUID;
  v_delegate_user UUID;
  v_grantor_user UUID;
  v_delegation_id UUID;
  v_caught_neg BOOLEAN := FALSE;
BEGIN
  SELECT id INTO v_principal_gp
    FROM public.global_patients
   WHERE is_minor = FALSE
     AND id NOT IN ('6036cd97-f149-449f-8975-cb7cc5651059',
                    '50f41bd5-f41d-414a-9105-a2fade215cc3',
                    'fa8e3189-9260-424c-a62e-ba8f108265dc')
   LIMIT 1;
  IF v_principal_gp IS NULL THEN
    RAISE EXCEPTION 'mig 112 smoke probe: no usable principal gp.';
  END IF;

  SELECT id INTO v_delegate_user FROM auth.users LIMIT 1;
  IF v_delegate_user IS NULL THEN
    RAISE NOTICE 'mig 112 smoke probe: auth.users empty; cannot exercise FK paths.';
    RETURN;
  END IF;

  SELECT id INTO v_grantor_user FROM auth.users WHERE id <> v_delegate_user LIMIT 1;
  IF v_grantor_user IS NULL THEN
    RAISE NOTICE 'mig 112 smoke probe: only one auth.user; cannot run POS/NEG (would self-violate). CHECK still in place.';
    RETURN;
  END IF;

  -- POS — distinct grantor + delegate succeeds
  INSERT INTO public.patient_delegations (
    principal_global_patient_id, delegate_user_id, capabilities, granted_by_user_id
  ) VALUES (
    v_principal_gp, v_delegate_user, '["view_records"]'::jsonb, v_grantor_user
  )
  RETURNING id INTO v_delegation_id;
  IF v_delegation_id IS NULL THEN
    RAISE EXCEPTION 'mig 112 smoke POS: distinct-user INSERT did not return id.';
  END IF;

  -- NEG — grantor = delegate must fail
  BEGIN
    INSERT INTO public.patient_delegations (
      principal_global_patient_id, delegate_user_id, capabilities, granted_by_user_id
    ) VALUES (
      v_principal_gp, v_grantor_user, '["view_records"]'::jsonb, v_grantor_user
    );
  EXCEPTION
    WHEN check_violation THEN v_caught_neg := TRUE;
    -- Note: also catch unique_violation defensively; the active-uniqueness
    -- partial index would NOT fire here (different delegate_user_id), but
    -- being defensive about constraint-ordering surprises.
    WHEN unique_violation THEN
      v_caught_neg := FALSE;
  END;
  IF NOT v_caught_neg THEN
    -- Cleanup the POS row before raising
    DELETE FROM public.patient_delegations WHERE id = v_delegation_id;
    RAISE EXCEPTION 'mig 112 smoke NEG: grantor=delegate INSERT was NOT rejected by CHECK 112.0.';
  END IF;

  -- Cleanup
  DELETE FROM public.patient_delegations WHERE id = v_delegation_id;

  RAISE NOTICE 'mig 112 smoke probe: POS + NEG both PASS.';
END;
$$ LANGUAGE plpgsql;
