-- ============================================================================
-- Migration 110 — patient_delegations table (B07 Phase B, Pattern B)
--
-- Audit references:
--   * audits/B07-architectural-review-2026-05-10.md § 5 (Pattern B —
--     adult-to-adult delegation; 16-column table; capability set)
--   * audits/b07-review-decisions-2026-05-10.md § Decision 1 (OR-of-three
--     authority predicate — Pattern B is one of the three branches)
--   * audits/b07-review-decisions-2026-05-10.md § Decision 5 (two-step
--     grant-then-accept flow; accepted_at IS NULL means inactive grant)
--   * audits/b07-phase-b-execution-2026-05-10.md § Decision 2 (partial
--     unique index instead of EXCLUDE; btree_gist not enabled on staging)
--   * Empirical Lessons #2 (smoke-probe assertion), #8 (committed migration
--     files), #13 (doc lockstep)
--   * DECISIONS_LOG.md D-008 (admin-scope eslint-locked literal-union pattern;
--     reused in Phase E for capability tokens — DB column accepts any jsonb)
--   * DECISIONS_LOG.md D-068 (cross-clinic sharing — delegation grants are
--     orthogonal to share grants; this table is the delegation ledger)
--
-- Originated by: cowork session 2026-05-10 (B07 Phase B)
-- Locked rulings: 2026-05-09 / 2026-05-10 — MVP capability set is exactly
--                 5 capabilities (view_records, receive_notifications,
--                 book_appointments, manage_medications,
--                 consent_to_messaging); consent_to_share is post-MVP and
--                 NOT included in this migration. Custody-dispute mechanism
--                 deferred to Phase 2; revocation is single-revocation-by-
--                 anyone-with-authority. Authority chain depth = 1 (a
--                 delegate of a guardian cannot chain to the minor).
--
-- Why this migration exists
-- -------------------------
-- Pattern B models adult-to-adult delegation: an adult patient (the
-- "principal") authorizes another adult (the "delegate") to act on their
-- behalf in capability-scoped ways. Examples: an elderly parent letting
-- their adult child book appointments and view records; a spouse handling
-- medication management during a recovery period. The relationship is
-- two-step: grant (by principal) → accept (by delegate). A grant without
-- an accept is inactive.
--
-- This is intentionally orthogonal to D-068 cross-clinic sharing. Sharing
-- moves a record into another clinic's view; delegation grants another
-- USER permission to act on the principal's records (across whichever
-- clinics the principal already has presence at). The two systems can
-- coexist on the same identity without conflict.
--
-- What it does
-- ------------
--   §110.0 CREATE TABLE public.patient_delegations (16 columns).
--   §110.1 CHECKs: delegate_not_self, revoke_consistency.
--   §110.2 Partial unique index — active delegations are unique by
--          (principal, delegate). EXCLUDE/btree_gist alternative is
--          documented in Decision 2; index is the chosen shape.
--   §110.3 Operational indexes (principal-active, delegate-active).
--   §110.4 updated_at trigger (matches pattern from
--          patient_clinic_records_touch_updated_at).
--   §110.5 Inline smoke probe.
--
-- What it does NOT do
-- -------------------
--   * NOT add RLS policies on this table. Phase D writes those.
--   * NOT add a CHECK on capability values. Per D-008, capability tokens
--     are eslint-locked at the application layer (literal union); DB
--     accepts any jsonb. Keeps future capability additions migration-free.
--   * NOT include `consent_to_share` capability. Post-MVP per ruling #4.
--   * NOT add a `chain_depth` column. Phase D's helper rejects chained
--     lookups in code; no schema enforcement needed.
--
-- Depends on
-- ----------
--   * mig 073 (global_patients exists)
--   * Postgres pgcrypto extension (for gen_random_uuid; already enabled)
--
-- Rollback
-- --------
-- REVERSIBLE. Companion: 110_patient_delegations.rollback.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 110.0 — Create patient_delegations table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  principal_global_patient_id UUID NOT NULL
    REFERENCES public.global_patients(id) ON DELETE RESTRICT,

  delegate_user_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,

  delegate_global_patient_id UUID
    REFERENCES public.global_patients(id) ON DELETE SET NULL,

  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,

  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  granted_by_user_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,

  accepted_at TIMESTAMPTZ,

  expires_at TIMESTAMPTZ,

  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID REFERENCES auth.users(id),
  revoke_reason TEXT,

  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  auto_renew_window_days INTEGER,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.patient_delegations IS
  'B07 Pattern B: adult-to-adult delegation grants. Principal grants a delegate '
  'capability-scoped authority to act on their records. Two-step: grant + accept '
  '(accepted_at IS NULL means inactive). RLS policies attached in Phase D.';

COMMENT ON COLUMN public.patient_delegations.capabilities IS
  'JSON array of capability tokens, e.g. ["view_records","book_appointments"]. '
  'Token validity is enforced eslint-side (D-008 pattern), not at the DB level.';

COMMENT ON COLUMN public.patient_delegations.delegate_global_patient_id IS
  'Denormalized convenience: the gp identity of the delegate (claimed gp). '
  'Filled when the delegate has a gp identity; nullable so non-claimed phone-only '
  'delegations could later exist (out of MVP scope).';

COMMENT ON COLUMN public.patient_delegations.accepted_at IS
  'Two-step flow: NULL = grant pending; NOT NULL = accepted and active. '
  'A non-revoked, non-expired, accepted_at IS NOT NULL row is the "active" state.';

COMMENT ON COLUMN public.patient_delegations.auto_renew IS
  'If TRUE and the delegation expires while the principal is still seeing '
  'the delegate (e.g. via repeat check-ins), the application layer renews '
  'expires_at by auto_renew_window_days. Out of Phase B scope; column ships '
  'forward-compatible.';

-- ---------------------------------------------------------------------------
-- 110.1 — CHECK constraints.
-- ---------------------------------------------------------------------------
ALTER TABLE public.patient_delegations
  ADD CONSTRAINT patient_delegations_delegate_not_self_chk
  CHECK (delegate_global_patient_id IS NULL
         OR delegate_global_patient_id <> principal_global_patient_id);

ALTER TABLE public.patient_delegations
  ADD CONSTRAINT patient_delegations_revoke_consistency_chk
  CHECK ((revoked_at IS NULL AND revoked_by_user_id IS NULL)
      OR (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL));

-- ---------------------------------------------------------------------------
-- 110.2 — Partial unique index for active-uniqueness (replaces EXCLUDE).
-- ---------------------------------------------------------------------------
-- Decision 2 in audits/b07-phase-b-execution-2026-05-10.md: btree_gist is
-- not enabled on staging; partial unique index is the pre-authorized
-- fallback per Phase B prompt. Functionally equivalent for this use case.
CREATE UNIQUE INDEX IF NOT EXISTS patient_delegations_active_unique
  ON public.patient_delegations (principal_global_patient_id, delegate_user_id)
  WHERE revoked_at IS NULL;

COMMENT ON INDEX public.patient_delegations_active_unique IS
  'B07 Pattern B: prevents duplicate active delegations for the same '
  '(principal, delegate) pair. Multiple revoked rows are allowed (history).';

-- ---------------------------------------------------------------------------
-- 110.3 — Operational indexes.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS patient_delegations_principal_active_idx
  ON public.patient_delegations (principal_global_patient_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS patient_delegations_delegate_active_idx
  ON public.patient_delegations (delegate_user_id, expires_at)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- 110.4 — updated_at trigger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.patient_delegations_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_delegations_touch_updated ON public.patient_delegations;
CREATE TRIGGER trg_patient_delegations_touch_updated
  BEFORE UPDATE ON public.patient_delegations
  FOR EACH ROW
  EXECUTE FUNCTION public.patient_delegations_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 110.5 — Smoke probe.
-- ---------------------------------------------------------------------------
-- Verifies:
--   POS — INSERT a valid delegation (accepted_at NULL, revoked_at NULL).
--   NEG-A — delegate_gp = principal_gp must fail.
--   NEG-B — revoked_at without revoked_by_user_id must fail.
--   NEG-C — duplicate active delegation must fail (partial unique index).
--   POS-2 — UPDATE on the row touches updated_at.
DO $$
DECLARE
  v_principal_gp UUID;
  v_delegate_user UUID;
  v_grantor_user UUID;
  v_delegation_id UUID;
  v_caught_neg_a BOOLEAN := FALSE;
  v_caught_neg_b BOOLEAN := FALSE;
  v_caught_neg_c BOOLEAN := FALSE;
  v_initial_updated TIMESTAMPTZ;
  v_post_update_updated TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_principal_gp
    FROM public.global_patients
   WHERE is_minor = FALSE
     AND id NOT IN ('6036cd97-f149-449f-8975-cb7cc5651059',
                    '50f41bd5-f41d-414a-9105-a2fade215cc3',
                    'fa8e3189-9260-424c-a62e-ba8f108265dc')
   LIMIT 1;
  IF v_principal_gp IS NULL THEN
    RAISE EXCEPTION 'mig 110 smoke probe: no usable principal gp.';
  END IF;

  SELECT id INTO v_delegate_user FROM auth.users LIMIT 1;
  IF v_delegate_user IS NULL THEN
    RAISE NOTICE 'mig 110 smoke probe: auth.users empty; cannot exercise FK paths. Schema-only verification deferred.';
    RETURN;
  END IF;

  SELECT id INTO v_grantor_user FROM auth.users WHERE id <> v_delegate_user LIMIT 1;
  IF v_grantor_user IS NULL THEN
    -- Single-user staging: cannot run POS/NEG without violating
    -- patient_delegations_grantor_not_delegate_chk (mig 112). Skip the
    -- probe gracefully — same pattern as the empty-auth.users branch.
    -- Schema-level CHECK constraints from the DDL above are still in place.
    RAISE NOTICE 'mig 110 smoke probe: only one auth.user available; cannot run POS/NEG with distinct grantor + delegate (would self-violate mig 112 grantor≠delegate CHECK). Skipped.';
    RETURN;
  END IF;

  -- POS — INSERT with an explicit OLD updated_at so the POS-2 trigger
  -- check at the end can verify the trigger advanced it. NOW() returns
  -- transaction-start time and would not visibly change within this DO block.
  INSERT INTO public.patient_delegations (
    principal_global_patient_id, delegate_user_id,
    capabilities, granted_by_user_id,
    created_at, updated_at
  ) VALUES (
    v_principal_gp, v_delegate_user,
    '["view_records"]'::jsonb, v_grantor_user,
    '2000-01-01T00:00:00Z'::timestamptz, '2000-01-01T00:00:00Z'::timestamptz
  )
  RETURNING id, updated_at INTO v_delegation_id, v_initial_updated;

  IF v_delegation_id IS NULL THEN
    RAISE EXCEPTION 'mig 110 smoke probe POS: INSERT did not return an id.';
  END IF;
  IF v_initial_updated <> '2000-01-01T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'mig 110 smoke probe POS: INSERT did not honor the seeded old updated_at.';
  END IF;

  -- NEG-A: delegate_global_patient_id = principal
  BEGIN
    INSERT INTO public.patient_delegations (
      principal_global_patient_id, delegate_user_id,
      delegate_global_patient_id, capabilities, granted_by_user_id
    ) VALUES (
      v_principal_gp, v_delegate_user, v_principal_gp,
      '["view_records"]'::jsonb, v_grantor_user
    );
  EXCEPTION
    WHEN check_violation THEN
      v_caught_neg_a := TRUE;
  END;
  IF NOT v_caught_neg_a THEN
    RAISE EXCEPTION 'mig 110 smoke probe NEG-A: delegate-equals-principal was NOT rejected.';
  END IF;

  -- NEG-B: revoked_at set without revoked_by_user_id
  BEGIN
    INSERT INTO public.patient_delegations (
      principal_global_patient_id, delegate_user_id,
      capabilities, granted_by_user_id, revoked_at
    ) VALUES (
      v_principal_gp, v_delegate_user,
      '["view_records"]'::jsonb, v_grantor_user, NOW()
    );
  EXCEPTION
    WHEN check_violation THEN
      v_caught_neg_b := TRUE;
  END;
  IF NOT v_caught_neg_b THEN
    RAISE EXCEPTION 'mig 110 smoke probe NEG-B: revoked_at without revoked_by_user_id was NOT rejected.';
  END IF;

  -- NEG-C: duplicate active delegation (same principal+delegate, both unrevoked)
  BEGIN
    INSERT INTO public.patient_delegations (
      principal_global_patient_id, delegate_user_id,
      capabilities, granted_by_user_id
    ) VALUES (
      v_principal_gp, v_delegate_user,
      '["book_appointments"]'::jsonb, v_grantor_user
    );
  EXCEPTION
    WHEN unique_violation THEN
      v_caught_neg_c := TRUE;
  END;
  IF NOT v_caught_neg_c THEN
    RAISE EXCEPTION 'mig 110 smoke probe NEG-C: duplicate active delegation was NOT rejected.';
  END IF;

  -- POS-2: updated_at trigger fires on UPDATE.
  -- The seeded updated_at is 2000-01-01; the trigger sets it to NOW() (the
  -- current transaction-start time, which is many years past 2000), so the
  -- new value is unambiguously different from the seed.
  UPDATE public.patient_delegations
     SET capabilities = '["view_records","book_appointments"]'::jsonb
   WHERE id = v_delegation_id;

  SELECT updated_at INTO v_post_update_updated
    FROM public.patient_delegations WHERE id = v_delegation_id;

  IF v_post_update_updated = v_initial_updated THEN
    RAISE EXCEPTION
      'mig 110 smoke probe POS-2: updated_at trigger did not fire on UPDATE (still % after UPDATE).',
      v_post_update_updated;
  END IF;
  IF v_post_update_updated < NOW() - INTERVAL '1 minute' THEN
    RAISE EXCEPTION
      'mig 110 smoke probe POS-2: updated_at advanced but value % is not close to NOW(); trigger semantics unexpected.',
      v_post_update_updated;
  END IF;

  -- Cleanup
  DELETE FROM public.patient_delegations WHERE id = v_delegation_id;

  RAISE NOTICE 'mig 110 smoke probe: POS + NEG-A + NEG-B + NEG-C + POS-2 all PASS.';
END;
$$ LANGUAGE plpgsql;
