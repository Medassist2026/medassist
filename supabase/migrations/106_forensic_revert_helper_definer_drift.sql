-- ============================================================================
-- Migration 106 — FORENSIC REVERT: helper-function security-mode drift
--
-- Audit references:
--   * audits/database-audit/preapply-verif-r2.md
--     (Q1 — can_patient_access_global_patient: documented intent INVOKER,
--      staging drifted to DEFINER via mig 094a's now-stale "uniform-DEFINER"
--      amendment; R2's earlier file edit to mig 092 was based on faulty
--      recursion-safety inference)
--   * audits/database-audit/preapply-verif-q2.md
--     (Q2 — can_clinic_access_global_patient: same shape, same staging
--      drift, same now-stale amendment, same Q1-style remediation)
--   * audits/database-audit/preapply-verif-087.md (Q3 — separate, mig 087)
--
-- Originated by: Audit Session C continuation (2026-05-03), post-rulings
-- Locked rulings: Mo Q1 A1 (revert can_patient to INVOKER on staging),
--                 Mo Q2 (CONFIRMED INVOKER per preapply-verif-q2.md § 1.5)
--
-- Purpose
-- -------
-- Revert the security mode of two RLS helper functions on staging from
-- DEFINER back to INVOKER, restoring the documented intent recorded in
-- (a) audits/EXECUTION_PROMPTS.md § B2/B3, (b) the 2026-04-30 hybrid
-- "3 INVOKER + 1 DEFINER" architectural ruling, and (c) the original mig
-- 092 file body and post-condition.
--
-- THE TWO FUNCTIONS
-- -----------------
--   * public.can_patient_access_global_patient(uuid, uuid)  — DEFINER → INVOKER
--   * public.can_clinic_access_global_patient(uuid, uuid)   — DEFINER → INVOKER
--
-- WHY (audit finding)
-- -------------------
-- Mig 094a (cowork session 5, 2026-04-30) preemptively flipped both helpers
-- to SECURITY DEFINER as part of an "every helper is DEFINER, no exceptions"
-- amendment introduced specifically to defend against a recursion bug in the
-- mig 093 SELECT policies. Mig 094a itself rewrote those SELECT policies to
-- use helper calls instead of inline cross-table EXISTS, which eliminated the
-- recursion path the amendment was defending against. The amendment's
-- rationale is now stale on its own surface.
--
-- Mo's Q1 ruling (2026-05-03) re-affirmed the original 3-INVOKER architecture
-- for can_patient_access_global_patient: the helper has no recursion path
-- under the post-094a policy surface, and INVOKER is the documented intent.
-- Q2's investigation found can_clinic_access_global_patient has zero current
-- callers and the same now-stale recursion rationale; Q2 verdict CONFIRMED
-- INVOKER (see preapply-verif-q2.md § 1.5 for the four-quadrant analysis).
--
-- This is the ONLY behavioral migration in the forensic-fix sequence
-- (100-106). All others are documentation-aligning backfills, helper-body
-- restorations, or schema cleanups. This migration changes runtime
-- authorization context for two functions, so Phase D scenarios MUST be
-- re-run after this migration applies (see apply-runbook-v2.md § 7).
--
-- NO BODY CHANGE
-- --------------
-- Both helpers' bodies are unchanged. The internal queries against
-- patient_clinic_records, patient_data_shares, and global_patients are
-- byte-identical. The SET search_path = public, pg_temp option is preserved
-- across the security-mode change (ALTER FUNCTION ... SECURITY INVOKER does
-- not modify the function's SET clauses). Under INVOKER, the explicit
-- search_path is harmless but not required by the documented INVOKER body in
-- mig 092 — leaving it in place is a benign cosmetic divergence and avoids
-- a separate ALTER step.
--
-- IDEMPOTENCY
-- -----------
-- ALTER FUNCTION ... SECURITY INVOKER is idempotent — re-running the
-- migration on a staging where both helpers are already INVOKER is a no-op
-- (no error, no body change). The smoke probe at the end asserts both
-- helpers are SECURITY INVOKER (prosecdef = FALSE), which catches any
-- accidental re-flip from a misordered apply.
--
-- ORDER NOTE
-- ----------
-- Apply this migration AFTER 100-105 in the forensic sequence, BEFORE
-- re-applying mig 087 in place, BEFORE re-applying mig 092 in place (which
-- has a post-condition asserting can_clinic_access_global_patient is
-- INVOKER — that assertion would FIRE today and PASS after this migration).
--
-- DOWNSTREAM EFFECT ON MIG 092 POST-CONDITION
-- -------------------------------------------
-- mig 092's post-condition (lines 294-302) asserts:
--   p.proname = 'can_clinic_access_global_patient' AND p.prosecdef = FALSE
-- After this migration applies, that assertion will pass. Before this
-- migration, it would RAISE EXCEPTION on re-apply. This is the precise
-- staging drift Q2's bonus finding identified.
--
-- mig 092's post-condition for can_patient_access_global_patient currently
-- asserts prosecdef = TRUE (DEFINER — per the R2 file edit). After this
-- migration applies, that assertion would FAIL. This is a known stale file
-- declaration per Mo's Q1 directive ("Don't edit mig 092"). The runbook's
-- Step 5 (mig 092 re-apply) is therefore SKIPPED in v2 — see
-- apply-runbook-v2.md § 5 for the rationale.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Pre-revert sanity: confirm both helpers exist and are currently DEFINER.
-- If they're already INVOKER (idempotent re-apply or someone else flipped
-- them in the meantime), log a NOTICE and skip the ALTER (still safe).
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_patient_definer BOOLEAN;
  v_clinic_definer  BOOLEAN;
BEGIN
  SELECT p.prosecdef INTO v_patient_definer
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'can_patient_access_global_patient'
    AND pg_get_function_identity_arguments(p.oid) = 'p_global_patient_id uuid, p_user_id uuid';

  IF v_patient_definer IS NULL THEN
    RAISE EXCEPTION 'forensic mig 106 ABORT: can_patient_access_global_patient(uuid, uuid) not found on staging';
  END IF;

  SELECT p.prosecdef INTO v_clinic_definer
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'can_clinic_access_global_patient'
    AND pg_get_function_identity_arguments(p.oid) = 'p_global_patient_id uuid, p_clinic_id uuid';

  IF v_clinic_definer IS NULL THEN
    RAISE EXCEPTION 'forensic mig 106 ABORT: can_clinic_access_global_patient(uuid, uuid) not found on staging';
  END IF;

  IF v_patient_definer THEN
    RAISE NOTICE 'forensic mig 106 pre-check: can_patient_access_global_patient is currently DEFINER — will revert to INVOKER';
  ELSE
    RAISE NOTICE 'forensic mig 106 pre-check: can_patient_access_global_patient already INVOKER — ALTER will be a no-op';
  END IF;

  IF v_clinic_definer THEN
    RAISE NOTICE 'forensic mig 106 pre-check: can_clinic_access_global_patient is currently DEFINER — will revert to INVOKER';
  ELSE
    RAISE NOTICE 'forensic mig 106 pre-check: can_clinic_access_global_patient already INVOKER — ALTER will be a no-op';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Revert both helpers to SECURITY INVOKER. Body and SET search_path are
-- preserved. STABLE / PARALLEL SAFE / RETURNS BOOLEAN are preserved.
-- ----------------------------------------------------------------------------

ALTER FUNCTION public.can_patient_access_global_patient(uuid, uuid)
  SECURITY INVOKER;

ALTER FUNCTION public.can_clinic_access_global_patient(uuid, uuid)
  SECURITY INVOKER;

-- ----------------------------------------------------------------------------
-- Refresh comments to reflect the revert. Original comments still reference
-- mig 092 / 094a context; we append a 2026-05-03 reconciliation note via
-- COMMENT ON FUNCTION (which fully replaces the prior comment string).
-- ----------------------------------------------------------------------------

COMMENT ON FUNCTION public.can_patient_access_global_patient(uuid, uuid) IS
  'Prompt 6 mig 092: true if the user is the claimed patient for this global_patient row. SECURITY INVOKER STABLE. Reverted from DEFINER → INVOKER on staging by mig 106 (2026-05-03) per Mo Q1 A1 ruling: mig 094a''s "uniform DEFINER" amendment was based on a recursion path that mig 094a itself rewrote out of existence. Documented intent restored to match EXECUTION_PROMPTS.md § B3 + the 2026-04-30 hybrid 3-INVOKER ruling.';

COMMENT ON FUNCTION public.can_clinic_access_global_patient(uuid, uuid) IS
  'Prompt 6 mig 092: true if the clinic can access the patient (PCR exists OR active grantee share). SECURITY INVOKER STABLE. Reverted from DEFINER → INVOKER on staging by mig 106 (2026-05-03) per Mo Q2 ruling (CONFIRMED INVOKER, audits/database-audit/preapply-verif-q2.md § 1.5). INVOKER is safe because every reachable call path has the caller as a member of p_clinic_id; the post-094a policy surface (PCR/PDS SELECT policies use helper calls, not inline EXISTS) eliminates the recursion path mig 094a was defending against.';

COMMIT;

-- ============================================================================
-- Smoke probe — assert both helpers are SECURITY INVOKER (prosecdef = FALSE)
-- ============================================================================

DO $$
DECLARE
  v_count INT;
  fname TEXT;
  v_should_be_invoker TEXT[] := ARRAY[
    'can_patient_access_global_patient',
    'can_clinic_access_global_patient'
  ];
BEGIN
  FOREACH fname IN ARRAY v_should_be_invoker LOOP
    SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = fname
      AND p.prosecdef = FALSE;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'forensic mig 106 smoke probe: % is not SECURITY INVOKER after revert', fname;
    END IF;
  END LOOP;

  -- Also assert is_clinic_member and can_view_patient_data_at_clinic remain
  -- DEFINER (untouched by this migration). Catches accidental over-broad ALTERs.
  FOREACH fname IN ARRAY ARRAY[
    'is_clinic_member',
    'can_view_patient_data_at_clinic'
  ] LOOP
    SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = fname
      AND p.prosecdef = TRUE;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'forensic mig 106 smoke probe: % is not SECURITY DEFINER (should be unchanged)', fname;
    END IF;
  END LOOP;

  RAISE NOTICE 'forensic mig 106 smoke probe: PASS (2 helpers reverted to INVOKER, 2 helpers remain DEFINER)';
END $$;
