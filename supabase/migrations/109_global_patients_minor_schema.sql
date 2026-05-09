-- ============================================================================
-- Migration 109 — global_patients minor-gp schema additions (B07 Phase B)
--
-- Audit references:
--   * audits/B07-architectural-review-2026-05-10.md § 4 (global_patients
--     additions for Pattern A child linkage)
--   * audits/b07-review-decisions-2026-05-10.md § Decision 1 (OR-of-three
--     authority predicate — schema must support `is_minor` and
--     `guardian_global_patient_id` queries from a SECURITY DEFINER context)
--   * audits/b07-phase-b-execution-2026-05-10.md § Decision 1 (CHECK shape;
--     "adults must have phone" CHECK dropped because mig 076 deliberately
--     relaxed `normalized_phone` for sentinel pattern)
--   * audits/b07-phase-b-execution-2026-05-10.md § Decision 6 (review-doc
--     drift; review claimed `normalized_phone NOT NULL` — live staging since
--     mig 076 has it nullable)
--   * Empirical Lessons #2 (smoke-probe assertion), #7 (verify schema state),
--     #8 (committed migration files), #13 (doc lockstep), #16 (verify
--     architectural claims against ground truth)
--   * DECISIONS_LOG.md D-068 (cross-clinic sharing — minors share identically
--     to adults; this migration produces the data shape that lets the share
--     layer treat minors uniformly)
--
-- Originated by: cowork session 2026-05-10 (B07 Phase B)
-- Locked rulings: 2026-05-09 / 2026-05-10 — graduation deferred to Phase 2
--                 (is_minor column ships forward-compatible; no graduation
--                 cron in Phase B); single guardian per minor (no polygamous
--                 modeling); ON DELETE SET NULL (custody-dispute mechanism
--                 deferred to Phase 2); Pattern A is one of three predicate
--                 branches in the helper function (Phase D writes the
--                 helper).
--
-- Why this migration exists
-- -------------------------
-- B07 introduces dependent accounts. Pattern A models a guardian-of-minor
-- relationship by attaching a guardian FK on the minor's global_patients
-- row. The minor is a first-class identity (cross-clinic shareable per
-- D-068) but cannot self-claim an auth.users account; their guardian acts
-- on their behalf. This migration adds the two columns + two CHECK
-- constraints + one partial index that make the minor shape representable
-- and queryable.
--
-- The Phase D helper function (`is_authorized_actor_on(actor_uuid, gp_uuid)`)
-- will need to evaluate "is `actor_uuid` the guardian of the minor `gp_uuid`?"
-- in a SECURITY DEFINER context. The partial index added here keeps that
-- lookup fast as the minor population scales.
--
-- What it does
-- ------------
--   §109.0 Add `guardian_global_patient_id uuid REFERENCES global_patients(id)
--          ON DELETE SET NULL`. Self-referential FK; SET NULL is intentional
--          (a minor whose guardian gp is deleted should not be cascade-deleted;
--          they remain a valid minor identity awaiting custody reassignment).
--   §109.1 Add `is_minor BOOLEAN NOT NULL DEFAULT FALSE`. All existing rows
--          default to FALSE; mig 111 flips the 3 backfilled dependents.
--   §109.2 Add CHECK `is_minor = FALSE OR guardian_global_patient_id IS NOT NULL`
--          — a minor must have a guardian (Pattern A is FK-anchored).
--   §109.3 Add CHECK `is_minor = FALSE OR claimed_user_id IS NULL`
--          — a minor must NOT self-claim an auth.users account.
--   §109.4 Add partial index on `guardian_global_patient_id WHERE NOT NULL`,
--          for the helper-function lookup path (Phase D).
--   §109.5 Inline smoke probe: positive case + 3 negative cases, with clean
--          teardown.
--
-- What it does NOT do
-- -------------------
--   * NOT add a "non-minor must have a phone" CHECK. Per Decision 1 in the
--     execution log, mig 076 deliberately relaxed normalized_phone for the
--     sentinel/quarantine pattern, and three live NULL-phone sentinel rows
--     exist (locked, account_status='locked'). Adding such a CHECK would
--     violate on those existing rows and conflict with the documented
--     intent of mig 076 §076.0.
--   * NOT add an `acting_as` column. The `acting_as = 'guardian_of_minor'`
--     audit metadata path (D-068 amendment) is captured in
--     audit_events.metadata; no schema column needed in Phase B.
--   * NOT add a graduation timer / cron / column. Per ruling #1, graduation
--     is Phase 2; this schema is forward-compatible (flipping is_minor and
--     setting claimed_user_id is a one-row update at graduation time).
--
-- Depends on
-- ----------
--   * mig 073 (global_patients table exists with claimed_user_id column)
--   * mig 076 (normalized_phone is already nullable on staging)
--
-- Rollback
-- --------
-- REVERSIBLE. Companion: 109_global_patients_minor_schema.rollback.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 109.0 — Add guardian_global_patient_id self-referential FK.
-- ---------------------------------------------------------------------------
ALTER TABLE public.global_patients
  ADD COLUMN IF NOT EXISTS guardian_global_patient_id UUID
    REFERENCES public.global_patients(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.global_patients.guardian_global_patient_id IS
  'B07 Pattern A: for minor gps (is_minor = TRUE), this FK points at the '
  'guardian gp. NULL for adult gps. ON DELETE SET NULL — minor remains a '
  'valid identity awaiting custody reassignment if guardian gp is deleted '
  '(custody-dispute mechanism deferred to Phase 2).';

-- ---------------------------------------------------------------------------
-- 109.1 — Add is_minor flag.
-- ---------------------------------------------------------------------------
ALTER TABLE public.global_patients
  ADD COLUMN IF NOT EXISTS is_minor BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.global_patients.is_minor IS
  'B07 Pattern A: TRUE for minor identities (children, infants). Minors '
  'cannot self-claim an auth.users account; their guardian acts on their '
  'behalf via the actor_kind=user, actor_user_id=<guardian>, '
  'subject=<minor> audit pattern. Graduation (flipping is_minor=FALSE and '
  'allowing self-claim) is deferred to Phase 2.';

-- ---------------------------------------------------------------------------
-- 109.2 — CHECK: a minor must have a guardian.
-- ---------------------------------------------------------------------------
ALTER TABLE public.global_patients
  ADD CONSTRAINT global_patients_minor_requires_guardian_chk
  CHECK (is_minor = FALSE OR guardian_global_patient_id IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 109.3 — CHECK: a minor must NOT self-claim an auth.users account.
-- ---------------------------------------------------------------------------
ALTER TABLE public.global_patients
  ADD CONSTRAINT global_patients_minor_no_self_claim_chk
  CHECK (is_minor = FALSE OR claimed_user_id IS NULL);

-- ---------------------------------------------------------------------------
-- 109.4 — Partial index for guardian-lookup path (Phase D helper function).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS global_patients_guardian_idx
  ON public.global_patients (guardian_global_patient_id)
  WHERE guardian_global_patient_id IS NOT NULL;

COMMENT ON INDEX public.global_patients_guardian_idx IS
  'B07: supports the Phase D helper function `is_authorized_actor_on()` '
  'when scanning for "is this user the guardian of any minor identity?" — '
  'used in the OR-of-three authority predicate.';

-- ---------------------------------------------------------------------------
-- 109.5 — Smoke probe (inline DO block; cleans up on success and on failure).
-- ---------------------------------------------------------------------------
-- Verifies:
--   POS — INSERT a minor gp pointing at an existing guardian gp succeeds.
--   NEG-A — INSERT a minor without a guardian fails (CHECK 109.2).
--   NEG-B — INSERT a minor with claimed_user_id set fails (CHECK 109.3).
--   NEG-C — UPDATE an existing gp to is_minor=TRUE without setting a guardian
--           fails (CHECK 109.2 on UPDATE).
DO $$
DECLARE
  v_guardian_id UUID;
  v_minor_id UUID;
  v_existing_gp_id UUID;
  v_smoke_user_id UUID;
  v_caught_neg_a BOOLEAN := FALSE;
  v_caught_neg_b BOOLEAN := FALSE;
  v_caught_neg_c BOOLEAN := FALSE;
BEGIN
  -- Pick any existing gp to use as the guardian for the smoke probe (an
  -- adult, not a minor — staging has 66 gps, plenty of choice). We avoid
  -- using one of the legacy dependents (those are the targets of mig 111).
  SELECT id INTO v_guardian_id
    FROM public.global_patients
   WHERE is_minor = FALSE
     AND id NOT IN ('6036cd97-f149-449f-8975-cb7cc5651059',
                    '50f41bd5-f41d-414a-9105-a2fade215cc3',
                    'fa8e3189-9260-424c-a62e-ba8f108265dc')
     AND normalized_phone IS NOT NULL
   LIMIT 1;

  IF v_guardian_id IS NULL THEN
    RAISE EXCEPTION
      'mig 109 smoke probe: could not find an adult gp to use as guardian. Aborting.';
  END IF;

  -- Pick any existing gp for NEG-C (the UPDATE target).
  SELECT id INTO v_existing_gp_id
    FROM public.global_patients
   WHERE is_minor = FALSE
     AND id <> v_guardian_id
     AND id NOT IN ('6036cd97-f149-449f-8975-cb7cc5651059',
                    '50f41bd5-f41d-414a-9105-a2fade215cc3',
                    'fa8e3189-9260-424c-a62e-ba8f108265dc')
   LIMIT 1;

  IF v_existing_gp_id IS NULL THEN
    RAISE EXCEPTION 'mig 109 smoke probe: could not find a second gp for NEG-C. Aborting.';
  END IF;

  -- ----- POS: insert a valid minor gp -----------------------------------
  INSERT INTO public.global_patients (
    id, normalized_phone, display_name, is_minor, guardian_global_patient_id,
    claimed, claimed_user_id, account_status, preferred_language
  ) VALUES (
    gen_random_uuid(),
    NULL,
    'SMOKE PROBE 109 — minor child',
    TRUE,
    v_guardian_id,
    FALSE,
    NULL,
    'active',
    'ar'
  )
  RETURNING id INTO v_minor_id;

  IF v_minor_id IS NULL THEN
    RAISE EXCEPTION 'mig 109 smoke probe POS: minor INSERT did not return an id.';
  END IF;

  -- Verify the row reads back with is_minor = TRUE.
  PERFORM 1 FROM public.global_patients
   WHERE id = v_minor_id AND is_minor = TRUE
     AND guardian_global_patient_id = v_guardian_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mig 109 smoke probe POS: row did not read back as expected.';
  END IF;

  -- ----- NEG-A: minor without guardian (must fail CHECK 109.2) ----------
  BEGIN
    INSERT INTO public.global_patients (
      id, normalized_phone, display_name, is_minor, guardian_global_patient_id,
      claimed, claimed_user_id, account_status, preferred_language
    ) VALUES (
      gen_random_uuid(),
      NULL,
      'SMOKE PROBE 109 NEG-A — minor without guardian',
      TRUE,
      NULL,
      FALSE,
      NULL,
      'active',
      'ar'
    );
  EXCEPTION
    WHEN check_violation THEN
      v_caught_neg_a := TRUE;
  END;
  IF NOT v_caught_neg_a THEN
    RAISE EXCEPTION
      'mig 109 smoke probe NEG-A: minor-without-guardian INSERT was NOT rejected. CHECK 109.2 missing.';
  END IF;

  -- ----- NEG-B: minor with claimed_user_id (must fail CHECK 109.3) ------
  -- We need a real auth.users id for the FK on claimed_user_id. Pick any
  -- existing auth.users row.
  SELECT id INTO v_smoke_user_id FROM auth.users LIMIT 1;
  IF v_smoke_user_id IS NULL THEN
    -- Empty auth.users: skip NEG-B (rare on staging; document it).
    RAISE NOTICE 'mig 109 smoke probe NEG-B: auth.users empty; skipped (CHECK still in place).';
    v_caught_neg_b := TRUE; -- treat as not-applicable
  ELSE
    BEGIN
      INSERT INTO public.global_patients (
        id, normalized_phone, display_name, is_minor, guardian_global_patient_id,
        claimed, claimed_user_id, claimed_at, account_status, preferred_language
      ) VALUES (
        gen_random_uuid(),
        NULL,
        'SMOKE PROBE 109 NEG-B — minor with claim',
        TRUE,
        v_guardian_id,
        TRUE,
        v_smoke_user_id,
        NOW(),
        'active',
        'ar'
      );
    EXCEPTION
      WHEN check_violation THEN
        v_caught_neg_b := TRUE;
    END;
    IF NOT v_caught_neg_b THEN
      RAISE EXCEPTION
        'mig 109 smoke probe NEG-B: minor-with-claim INSERT was NOT rejected. CHECK 109.3 missing.';
    END IF;
  END IF;

  -- ----- NEG-C: flip an existing adult gp to is_minor without guardian -
  BEGIN
    UPDATE public.global_patients
       SET is_minor = TRUE
     WHERE id = v_existing_gp_id;
  EXCEPTION
    WHEN check_violation THEN
      v_caught_neg_c := TRUE;
  END;
  IF NOT v_caught_neg_c THEN
    -- Roll the unintended UPDATE back; otherwise the smoke leaves bad data.
    UPDATE public.global_patients SET is_minor = FALSE WHERE id = v_existing_gp_id;
    RAISE EXCEPTION
      'mig 109 smoke probe NEG-C: UPDATE-to-minor without guardian was NOT rejected. CHECK 109.2 not enforced on UPDATE.';
  END IF;

  -- ----- Cleanup: remove POS row -----
  DELETE FROM public.global_patients WHERE id = v_minor_id;

  RAISE NOTICE 'mig 109 smoke probe: POS + NEG-A + NEG-B + NEG-C all PASS.';
END;
$$ LANGUAGE plpgsql;
