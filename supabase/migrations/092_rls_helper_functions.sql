-- ============================================================
-- mig 092 — Prompt 6 Phase B: RLS helper functions
-- Date: 2026-04-30
-- Owner: Backend (cowork session 2)
--
-- Purpose
-- -------
-- Establish the four helper functions that the Prompt 6 per-table
-- RLS policies (migs 093–097) call from their USING / WITH CHECK
-- clauses.  Idempotent — safe to re-apply.
--
-- Hybrid security model per Mo's 2026-04-30 ruling (saved in memory
-- file project_prompt_06_architecture_rulings.md), refined for the
-- recursion-safety issue surfaced during cowork session 2.
--
-- VERIFIED 2026-05-03 PART 2 — see header subsection below for the
-- post-rulings reconciliation that REVERTED the R2 file edit.
--
--   1. is_clinic_member            — SECURITY DEFINER STABLE (kept)
--   2. can_clinic_access_global_patient — SECURITY INVOKER STABLE (new)
--   3. can_patient_access_global_patient — SECURITY INVOKER STABLE (R2-reverted, see below)
--   4. can_view_patient_data_at_clinic   — SECURITY DEFINER STABLE (new)
--
-- ----------------------------------------------------------------------------
-- VERIFIED 2026-05-03 PART 2 (post-rulings continuation, R2 REVERTED)
-- ----------------------------------------------------------------------------
-- This subsection records the reversal of Session C's R2 edit, which had
-- declared `can_patient_access_global_patient` as SECURITY DEFINER on the
-- (mistaken) inference that DEFINER was intentional and that staging's
-- DEFINER state was the authoritative source of truth. The R2 inference
-- was based on a recursion-cycle rationale that does not hold under the
-- post-mig-094a `global_patients` SELECT policy.
--
-- Reference: `audits/database-audit/preapply-verif-r2.md` § "Verdict:
-- CONTRADICTED" (V2 verification 2026-05-03).
--
-- R2 ruling reverted. Documented intent is INVOKER per
-- EXECUTION_PROMPTS.md § B3 + the 2026-04-30 hybrid 3-INVOKER ruling.
-- Staging's drift to DEFINER (introduced preemptively by mig 094a's
-- "uniform DEFINER" amendment, which mig 094a's own policy rewrites
-- subsequently rendered unnecessary) is reverted by mig 106
-- (`106_forensic_revert_helper_definer_drift.sql`) via
-- `ALTER FUNCTION ... SECURITY INVOKER`.
--
-- Helper #2 (`can_clinic_access_global_patient`) had the same shape of
-- staging drift (file INVOKER, staging DEFINER from mig 094a). Per
-- `audits/database-audit/preapply-verif-q2.md` § 1.5 verdict CONFIRMED
-- INVOKER, mig 106 reverts both helpers in a single ALTER FUNCTION pair.
--
-- After this header reversal + mig 106 apply: file declarations and
-- staging both report SECURITY INVOKER for helpers #2 and #3, and re-
-- applying this file is once again safely a no-op for the prosecdef
-- attribute. The post-condition assertions at the bottom of this file
-- have been flipped accordingly to assert prosecdef = FALSE for both
-- helpers.
--
-- Option B applied 2026-05-03 (Mo ruling, post-amendment-2 + Ask 4):
-- SET search_path = public, pg_temp added to BOTH helper #2
-- (`can_clinic_access_global_patient`) and helper #3
-- (`can_patient_access_global_patient`) INVOKER declarations per
-- defense-in-depth alignment. After mig 106 applies, staging preserves
-- the SET clause for both helpers (it was set in mig 094a's DEFINER
-- bodies and ALTER FUNCTION ... SECURITY INVOKER does not strip SET
-- clauses), so the file declarations match staging byte-for-byte for
-- this attribute too.
--
-- Helper #2 was added in Ask 4 (post-greenlight from Mo) after the
-- post-Step-0.5 verification surfaced that the original amendment-2
-- premise ("the other 3 helpers in mig 092 all have SET search_path
-- declarations") was factually inaccurate — only helpers #1 (DEFINER)
-- and #4 (DEFINER) had it before today. Ask 4 closes the gap so all
-- four helpers in mig 092 now declare SET search_path.
--
-- See runbook § 5 "Future reconciliation options — Option B" + Step
-- 4.5 ("Verify mig 092 file matches staging post-apply") for the
-- ruling and verification gates.
-- ----------------------------------------------------------------------------
--
-- DEVIATION FROM PROMPT 6 § B1 (documented):
--   Mo's prompt B1 specifies SECURITY INVOKER for is_clinic_member.
--   That cannot ship — clinic_memberships' own SELECT policy
--   ("Members can view clinic memberships" USING is_clinic_member(...))
--   uses this helper.  Under INVOKER, the helper's internal SELECT on
--   clinic_memberships would re-enter the policy, which re-calls the
--   helper → infinite recursion.  The existing is_clinic_member
--   shipped as DEFINER for exactly this reason.  We keep it DEFINER.
--   Mo's hybrid ruling stands; this row of the table just shifts from
--   INVOKER to DEFINER for correctness, not preference.
--
-- DEVIATION FROM SCHEMA SPEC § 4 (documented):
--   can_view_patient_data_at_clinic per schema spec § 4 line 564–606
--   includes a caregiver branch via dependent_account_links.  Per
--   Mo's 2026-04-30 ruling 2, caregiver paths are DEFERRED to Prompt
--   7.  Branch (b) of the schema spec text is omitted here; Prompt 7
--   adds it back with appropriate index work.
--
-- All four helpers are STABLE PARALLEL SAFE so RLS subqueries
-- evaluate them once per row and parallel scans don't re-enter.
-- DEFINER helpers SET search_path = public, pg_temp explicitly to
-- prevent search-path injection (Postgres docs § Security
-- Considerations for SECURITY DEFINER).
--
-- Indexes consulted (verified existing on staging):
--   * clinic_memberships(clinic_id, user_id)               UNIQUE — supports is_clinic_member
--   * idx_memberships_active(clinic_id, status)            partial WHERE status='ACTIVE'
--   * idx_memberships_user(user_id)                        — user-side reverse for INVOKER share check
--   * patient_clinic_records(global_patient_id, clinic_id) UNIQUE — supports can_clinic_access (PCR EXISTS)
--   * idx_pds_grantee_clinic_active(grantee_clinic_id)     partial — supports can_clinic_access (share EXISTS)
--   * idx_pds_grantor_clinic_active(grantor_clinic_id)     partial — supports can_view (directional share EXISTS)
--   * global_patients_claimed_user_id_uniq(claimed_user_id) UNIQUE partial — supports can_patient_access
--
-- No new indexes added by this migration.  If Phase B benchmarks
-- (audits/rls-helper-benchmark.md) show any helper >1ms, ADD a
-- composite (gpid, clinic_id) partial index on patient_data_shares
-- before Phase C ships.
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- 1. is_clinic_member — REPLACE existing definition idempotently.
--    The body is byte-identical to the existing helper; this OR
--    REPLACE re-asserts the security model and adds an explicit
--    SET search_path that the original 2024-era definition lacks.
--    SQL language (was already SQL); STABLE; SECURITY DEFINER.
--    Caller convention: pass auth.uid() explicitly.  We do NOT
--    add DEFAULT auth.uid() because every existing call site
--    passes auth.uid() literally (40+ policies); changing the
--    surface invites caller drift.
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_clinic_member(
  p_clinic_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
PARALLEL SAFE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_memberships
    WHERE clinic_id = p_clinic_id
      AND user_id = p_user_id
      AND status = 'ACTIVE'
  );
$$;

COMMENT ON FUNCTION public.is_clinic_member(UUID, UUID) IS
  'Prompt 6 mig 092: returns TRUE if (user, clinic) has an ACTIVE membership. SECURITY DEFINER for recursion safety with clinic_memberships SELECT policy.';


-- ──────────────────────────────────────────────────────────────────
-- 2. can_clinic_access_global_patient — INVOKER STABLE
--    True if (a) the clinic has a patient_clinic_records row for
--    this patient (the patient has been seen here), OR (b) the
--    clinic is the grantee of an active patient_data_shares row.
--    INVOKER is safe because every reachable call path has the
--    caller as a member of p_clinic_id (i.e. they can already SELECT
--    the relevant PCR / share rows under the new RLS).
--
--    SET search_path = public, pg_temp is declared explicitly per Mo
--    "Option B from runbook § 5" ruling 2026-05-03 (defense-in-depth
--    alignment): although search-path injection is primarily a DEFINER
--    concern, pinning the path under INVOKER is consistent with the
--    other helpers in this file and forecloses any future
--    search-path-rebinding attack vector irrespective of SECURITY mode.
--    After mig 106 applies, staging will report the same SET clause
--    (preserved by ALTER FUNCTION ... SECURITY INVOKER from mig 094a's
--    DEFINER body), so the file declaration matches staging byte-for-
--    byte for this attribute.
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_clinic_access_global_patient(
  p_global_patient_id UUID,
  p_clinic_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
PARALLEL SAFE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.patient_clinic_records
    WHERE global_patient_id = p_global_patient_id
      AND clinic_id = p_clinic_id
  ) OR EXISTS (
    SELECT 1 FROM public.patient_data_shares
    WHERE global_patient_id = p_global_patient_id
      AND grantee_clinic_id = p_clinic_id
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

COMMENT ON FUNCTION public.can_clinic_access_global_patient(UUID, UUID) IS
  'Prompt 6 mig 092: true if the clinic can access the patient (PCR exists OR active grantee share). INVOKER — caller must be member of the clinic for downstream SELECTs to clear RLS. SET search_path = public, pg_temp declared per Mo Option-B ruling 2026-05-03 (defense-in-depth alignment).';


-- ──────────────────────────────────────────────────────────────────
-- 3. can_patient_access_global_patient — INVOKER STABLE
--    True if the user is the claimed patient.
--
--    HISTORY: Session C originally edited this declaration to DEFINER
--    (R2 ruling, 2026-05-03) on the inference that staging's DEFINER
--    state was the authoritative source of truth and that DEFINER was
--    needed to break a recursion cycle with privacy_code_attempts /
--    global_patients SELECT policies. Pre-apply verification V2 found
--    that inference was faulty: under the post-094a `global_patients`
--    SELECT policy (which uses `claimed_user_id = auth.uid()` directly
--    + the DEFINER `user_has_clinic_path_to_gp` helper for the clinic
--    branch), there is no recursion path through this helper. R2
--    reverted 2026-05-03 PART 2 (Mo Q1 A1 ruling); see header
--    "VERIFIED 2026-05-03 PART 2" subsection above.
--
--    Why INVOKER (per documented intent — EXECUTION_PROMPTS.md § B3 +
--    2026-04-30 hybrid 3-INVOKER ruling): the helper runs as the
--    calling user. We're checking whether THEY are the claimed patient
--    for this global_patient. No bypass needed — the user can either
--    SEE their own claimed_user_id row in global_patients (under the
--    self-branch of global_patients_select_v2) or they can't, and the
--    EXISTS reflects that visibility.
--
--    SET search_path = public, pg_temp is declared explicitly per Mo
--    "Option B from runbook § 5" ruling 2026-05-03 (defense-in-depth
--    alignment): although search-path injection is primarily a DEFINER
--    concern, pinning the path under INVOKER is consistent with the
--    other helpers in this file and forecloses any future
--    search-path-rebinding attack vector irrespective of SECURITY mode.
--    After mig 106 applies, staging will report the same SET clause
--    (preserved by ALTER FUNCTION ... SECURITY INVOKER from mig 094a's
--    DEFINER body), so the file declaration matches staging byte-for-
--    byte for this attribute.
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_patient_access_global_patient(
  p_global_patient_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
PARALLEL SAFE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.global_patients
    WHERE id = p_global_patient_id
      AND claimed_user_id = p_user_id
  );
$$;

COMMENT ON FUNCTION public.can_patient_access_global_patient(UUID, UUID) IS
  'Prompt 6 mig 092: true if the user is the claimed patient for this global_patient row. SECURITY INVOKER STABLE per documented intent (EXECUTION_PROMPTS § B3, 2026-04-30 hybrid ruling). R2 DEFINER edit reverted 2026-05-03 PART 2; staging realignment via mig 106 (ALTER FUNCTION ... SECURITY INVOKER). SET search_path = public, pg_temp declared per Mo Option-B ruling 2026-05-03 (defense-in-depth alignment).';


-- ──────────────────────────────────────────────────────────────────
-- 4. can_view_patient_data_at_clinic — DEFINER STABLE
--    Central directional-consent predicate per schema spec § 4.
--    Used by every clinical-data RLS policy (clinical_notes,
--    prescriptions, lab_results, encounters, ...).
--    Returns TRUE if any of:
--      (a) viewer is the patient themselves
--      (b) [DEFERRED to Prompt 7] caregiver
--      (c) viewer is a member of the data-owning clinic
--      (d) directional consent: an active patient_data_shares row
--          from p_data_clinic_id (grantor) to a clinic the viewer
--          is a member of.
--    DEFINER because clauses (c) and (d) need to read clinic_memberships
--    rows for clinics the user may not be a member of (in the share
--    case the viewer IS a member of the grantee, but checking
--    membership requires a join the viewer's RLS may not see).
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_view_patient_data_at_clinic(
  p_global_patient_id UUID,
  p_data_clinic_id UUID,
  p_viewer_user_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
PARALLEL SAFE
AS $$
  SELECT
    -- (a) Patient self
    EXISTS (
      SELECT 1 FROM public.global_patients gp
      WHERE gp.id = p_global_patient_id
        AND gp.claimed_user_id = p_viewer_user_id
    )
    -- (b) DEFERRED to Prompt 7 — caregiver path via dependent_account_links.
    --     Schema spec § 4 line 577–585 includes:
    --       OR EXISTS (SELECT 1 FROM public.dependent_account_links dal
    --                  JOIN public.global_patients cg ON cg.id = dal.caregiver_global_patient_id
    --                  WHERE dal.dependent_global_patient_id = p_global_patient_id
    --                    AND cg.claimed_user_id = p_viewer_user_id
    --                    AND dal.revoked_at IS NULL)
    --     Re-introduce in Prompt 7 alongside dependent_account_links indexes.
    -- (c) Auto-share with self: viewer is a member of the data clinic
    OR EXISTS (
      SELECT 1 FROM public.clinic_memberships cm
      WHERE cm.clinic_id = p_data_clinic_id
        AND cm.user_id = p_viewer_user_id
        AND cm.status = 'ACTIVE'
    )
    -- (d) Directional consent: an active grantor=p_data_clinic_id share
    --     to a clinic the viewer is a member of.
    OR EXISTS (
      SELECT 1
      FROM public.patient_data_shares pds
      JOIN public.clinic_memberships cm
        ON cm.clinic_id = pds.grantee_clinic_id
       AND cm.user_id = p_viewer_user_id
       AND cm.status = 'ACTIVE'
      WHERE pds.global_patient_id = p_global_patient_id
        AND pds.grantor_clinic_id = p_data_clinic_id
        AND pds.revoked_at IS NULL
        AND (pds.expires_at IS NULL OR pds.expires_at > NOW())
    );
$$;

COMMENT ON FUNCTION public.can_view_patient_data_at_clinic(UUID, UUID, UUID) IS
  'Prompt 6 mig 092: central directional-consent predicate per schema spec § 4. Used by every clinical-data RLS policy (mig 094+). DEFINER STABLE. Caregiver branch DEFERRED to Prompt 7.';


-- ──────────────────────────────────────────────────────────────────
-- Function ownership: leave as the migration runner's role.
-- For DEFINER functions Postgres uses the OWNER role when bypassing
-- RLS.  In Supabase the postgres role owns DDL by default — that's
-- the right context.  No explicit GRANT/REVOKE needed: EXECUTE on
-- functions in public schema is granted to PUBLIC by default for
-- SECURITY INVOKER, and SECURITY DEFINER intentionally inherits that
-- to allow RLS policies (which run as `authenticated`) to call them.
-- ──────────────────────────────────────────────────────────────────

COMMIT;

-- ============================================================
-- Post-condition checks (assertions the migration itself can run
-- AFTER COMMIT to verify the helpers are wired correctly; these
-- run via apply_migration's auto-verify section).
-- ============================================================

-- 1. All four functions exist with the expected signatures
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_clinic_member'
      AND p.prosecdef = TRUE
  ) THEN
    RAISE EXCEPTION 'mig 092 post-condition failed: is_clinic_member missing or not SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'can_clinic_access_global_patient'
      AND p.prosecdef = FALSE
  ) THEN
    RAISE EXCEPTION 'mig 092 post-condition failed: can_clinic_access_global_patient missing or not SECURITY INVOKER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'can_patient_access_global_patient'
      AND p.prosecdef = FALSE
  ) THEN
    RAISE EXCEPTION 'mig 092 post-condition failed: can_patient_access_global_patient missing or not SECURITY INVOKER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'can_view_patient_data_at_clinic'
      AND p.prosecdef = TRUE
  ) THEN
    RAISE EXCEPTION 'mig 092 post-condition failed: can_view_patient_data_at_clinic missing or not SECURITY DEFINER';
  END IF;

  RAISE NOTICE 'mig 092 post-condition: all 4 helpers present with expected security model';
END $$;
