# MedAssist Program State — 2026-05-03

## North Star
Patient records network for Egypt. Clinic management is the wedge product.

## Execution Plan
EXECUTION_PROMPTS.md — 11-prompt sequence converting clinic-scoped
architecture to global-identity architecture.

## Status by Prompt
- Prompts 0, 0.5: COMPLETE per audit doc claims; foundation audit COMPLETE 2026-05-03 (Sessions A, B, C done)
- Prompts 1-5: COMPLETE per audit doc claims; foundation audit COMPLETE 2026-05-03
- Prompt 6 (RLS Policy Rewrite): IN PROGRESS, paused mid-Phase-F awaiting forensic-fix migration apply
- Prompts 6.5, 7-11: NOT STARTED

## Environment
Single Supabase project: medassist-egypt (mtmdotixlhwksyoordbl)
PostgreSQL 17.6, region eu-central-1, status ACTIVE_HEALTHY.
No production environment yet. Current project becomes launch foundation.

## Current Blocker
**Phase D matrix reconstruction.** All 7 forensic migs (100-106) applied
to staging cleanly 2026-05-03. The runbook's Phase D run #1.5 validation
gate cannot run because `audits/rls-test-matrix.sql` is a scaffold without
executable SQL — the run #1 matrix was authored interactively across cowork
sessions with outcomes recorded but SQL not persisted (Empirical Lesson
#12). Templating reconstruction is viable per `preapply-scan-mig100-101-102.md`
Phase D pre-flight analysis. Estimated effort: 2-4 hours focused work in
a fresh session. Push to remote held until Phase D #1.5 = 177/177 PASS.

## Active Pause Point
**Audit detour Day 1 complete (2026-05-03).** Forensic apply done.
Phase D matrix reconstruction is the gate for resuming Phase F.
Specifics in `audits/database-audit/PHASE_D_RECONSTRUCTION_HANDOFF.md`.

## What is shipped to medassist-egypt (verified by Session A audit; unchanged by Session C)
- 65 tables in `public` (excludes 3 views, 2 internal `_dedup_plan`/`_phone_normalize_quarantine`/`_rls_test_results` tables created outside formal migrations).
- 801 columns, 355 constraints (67 PK, 172 FK, 95 CHECK, 21 UNIQUE), 327 indexes.
- 202 RLS policies; RLS enabled on every base table (62/62 of the actual app tables).
- 62 functions (36 SECURITY DEFINER, 26 SECURITY INVOKER); 30 distinct triggers (42 (table,trigger,event) rows).
- 7 enum types (assignment_scope, assignment_status, clinic_role, consent_type, membership_status, patient_account_status, privacy_code_attempt_result, visibility_mode).
- 3 views (`_patient_phone_duplicates`, `_user_phone_duplicates`, `effective_messaging_consent`).
- 1 generated column: `audit_events.resolved_global_patient_id` (STORED).
- 5 extensions: pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1, uuid-ossp 1.1.
- All Phase 8 tables (doctor_patient_relationships, patient_diary, patient_health_metrics, medication_adherence_log) — 010 triplet applied (via SQL editor, no tracking row; all three files produce the same schema so it doesn't matter which).
- All clinical data tables have global_patient_id + patient_clinic_record_id FKs (patient identity rollout): appointments, clinical_notes, doctor_patient_relationships, imaging_orders, lab_orders, lab_results, patient_consent_grants, patient_visibility, prescription_items, vital_signs, plus patients itself and patient_phone_history.
- Privacy-code stack: patient_privacy_codes, privacy_code_attempts, privacy_code_sms_tokens, plus 5 helper functions and `tg_audit_pcr_insert_trg` audit trigger.
- patient_data_shares (mig 090) + atomic helper from mig 091 — ON staging.
- RLS helper functions from mig 092 (4 funcs in claim file: `app_user_id`, `is_clinic_member`, `clinic_member_role`, `is_clinic_member_definer` — verify in Session B). `can_patient_access_global_patient` is `SECURITY DEFINER` on staging (Session C R2 aligns the file).
- Mig 098 (patient_code_schema) tracking row present (applied 2026-05-03 02:28 UTC).

## What is NOT shipped (verified by Session A audit; unchanged by Session C)
- File `099_patient_code_rpcs.sql` — present in repo, no tracking row, RPC functions not yet on staging.
- 5 tables on staging that exist with NO `CREATE TABLE` migration in the repo (provenance is "Supabase SQL editor"): `account_recovery_requests`, `audit_log`, `patient_phone_verification_issues`, `phone_corrections`, `sms_reminders`. Schema is real and has been used; Session C authors mig 101 to backfill them and mig 105 to drop the orphan.
- 9 functions on staging not declared in any migration (`cleanup_expired_verification_data`, `is_account_dormant`, `mark_dormant_accounts`, `create_conversation_after_appointment`, `create_sharing_preferences_after_appointment`, `update_patient_activity`, plus 3 RLS-test-harness functions). Session C mig 102 backfills 6 of them (excludes test-harness).
- 2 tracking rows (`20260408145102 enable_rls_on_unprotected_tables`, `20260408145129 fix_otp_codes_rls_phone_based_records`) reference SQL applied directly to staging with no file ever committed. Session C mig 100 backfills the verbatim SQL.
- Files where the working-tree content is NOT what's on staging: `076_quarantine_resolution.sql` (tracking has v3), `080_add_global_refs_to_clinical_tables.sql` (tracking has v2), `083_effective_messaging_consent_view.sql` (tracking has v1 + v2), `087_privacy_code_functions.sql` (tracking has 3 successive entries: original, search_path_fix, grants_hardening — Session C R6 verified file already incorporates the hot-patches and applied a minor body alignment).
- Mig 068 (`068_cleanup_legacy_policies.sql`): no tracking row; project memory says apply was aborted; superseded by 092-097.

## Pending forensic-fix migrations to apply (authored by Session C 2026-05-03; NOT YET APPLIED)

In apply order:

1. `supabase/migrations/100_forensic_backfill_2026_04_08_rls.sql` — backfills the two 2026-04-08 RLS hardening fixes (RLS-enable on `check_in_queue`/`payments`/`front_desk_staff`, 8 policies, plus the OTP phone-based policy fix).
2. `supabase/migrations/101_forensic_backfill_unclaimed_tables.sql` — backfills 5 tables (`account_recovery_requests`, `audit_log`, `phone_corrections`, `sms_reminders`, `patient_phone_verification_issues`) with full DDL, FKs, indexes, RLS, and 5 policies. Adds explicit `service_role_account_recovery` policy (Session B finding: 0 policies on staging).
3. `supabase/migrations/102_forensic_backfill_helper_functions.sql` — backfills 6 dashboard-applied helper functions (`cleanup_expired_verification_data`, `update_patient_activity`, `create_conversation_after_appointment`, `create_sharing_preferences_after_appointment`, `is_account_dormant`, `mark_dormant_accounts`) and 3 triggers (on `appointments`, `clinical_notes`, `patient_medical_records`).
4. `supabase/migrations/103_forensic_backfill_pii_columns_keep_email.sql` — declares `patients.email` with `IF NOT EXISTS` guard (already on staging).
5. `supabase/migrations/104_forensic_drop_unused_pii_columns.sql` — drops `patients.national_id_hash`, `patients.national_id_last4`, `patients.phone_verified_at`. Pre-drop assertion verifies all 3 are 100% NULL.
6. `supabase/migrations/105_forensic_drop_patient_phone_verification_issues.sql` — drops the orphan table. Pre-drop assertion verifies row count is 0.
7. `supabase/migrations/106_forensic_revert_helper_definer_drift.sql` — **NEW (post-rulings session, 2026-05-03).** Reverts `can_patient_access_global_patient` and `can_clinic_access_global_patient` from `SECURITY DEFINER` → `SECURITY INVOKER` via `ALTER FUNCTION`. The **only behavioral migration** in the forensic-fix sequence; Phase D matrix re-runs as #1.5 is the critical validation gate (pass criterion 177/177).

In-place file edits (no new tracking rows; safe to re-apply against staging as no-op):

- `supabase/migrations/087_privacy_code_functions.sql` — header VERIFIED 2026-05-03 subsection added; dead unused variable `v_pc_revoked_at` removed from `verify_privacy_code` (R6). 2026-05-03 continuation: missing `PERFORM pg_sleep(...)` pad added to wrong-code branch's terminal RETURN (Q3 ruling); file now matches live byte-for-byte.
- `supabase/migrations/092_rls_helper_functions.sql` — R2 ruling reverted 2026-05-03 PART 2 (Mo amendment 1, applied as Step 0.5 of v2 runbook): helper #3 declaration `SECURITY DEFINER` → `SECURITY INVOKER`; post-condition assertion flipped from `prosecdef = TRUE` to `prosecdef = FALSE` for helper #3; header VERIFIED 2026-05-03 PART 2 subsection added documenting the reversal. Option B applied 2026-05-03 to **BOTH helpers #2 and #3** (Mo amendment-2 Ask 1 + Ask 4): `SET search_path = public, pg_temp` re-added to both INVOKER declarations per defense-in-depth alignment; inline body comments + COMMENT ON FUNCTION + header note updated. After mig 106 applies, file declarations match staging byte-for-byte for both helpers (prosecdef = FALSE; proconfig = {search_path=public, pg_temp}). All four helpers in mig 092 now declare SET search_path uniformly. **Re-apply SKIPPED in v2 runbook** by choice — Step 4.5 verifies file/staging alignment without a re-apply step.

Companion doc:

- `audits/database-audit/mig-022-archive-plan.md` — file-move plan for `022_doctor_fees.sql` (R1).

Each forensic migration has a `.rollback.sql` companion. Each is idempotent (re-runnable as no-op). Each ends with a smoke probe (`DO $$ BEGIN ... RAISE EXCEPTION/NOTICE`) that fires after the migration body.

## Pre-Apply Verification (2026-05-03) — RESOLVED, RUNBOOK v2 AUTHORED

Three pre-apply checks were run against staging before the forensic-fix
apply window. All three are now **greenlit** and the v2 runbook is
authored. Apply is **READY** (subject to Mo's go-ahead).

- **V1 (mig 087 body alignment) — GREEN.** Resolved 2026-05-03 via Q3
  ruling: mig 087 file edited to add the missing `PERFORM pg_sleep(...)`
  pad before the wrong-code branch's terminal `RETURN v_failure_payload;`.
  File and live both at count = 7 post-edit. Detail:
  `audits/database-audit/mig-087-edit-confirmation.md`.
- **V2 / Q1 (R2 ruling lineage for `can_patient_access_global_patient`) —
  GREEN.** Resolved 2026-05-03 via Mo Q1 A1: revert staging from
  DEFINER → INVOKER (matches documented intent in EXECUTION_PROMPTS.md § B3
  + 2026-04-30 hybrid 3-INVOKER ruling). Mo amendment 1 (post-Part-3): mig
  092 file edited (Step 0.5 of v2 runbook) to revert R2 — helper #3
  declaration DEFINER → INVOKER, post-condition flipped to assert
  `prosecdef = FALSE`, header VERIFIED 2026-05-03 PART 2 subsection
  added. After mig 106 applies, re-applying mig 092 in place produces
  no behavioral change (closes the future-trap of the v2 draft's "Don't
  edit mig 092" stance). Detail: `audits/database-audit/preapply-verif-r2.md`.
- **VQ2 (`can_clinic_access_global_patient` security mode) — GREEN.**
  Resolved 2026-05-03 via verdict CONFIRMED INVOKER per Part 1 of the
  post-rulings session. Same Q1-style pattern: documented intent (older
  docs + 2026-04-30 hybrid ruling) is INVOKER; mig 094a's "uniform
  DEFINER" amendment was based on a recursion path that mig 094a itself
  rewrote out of existence; helper has zero current callers; INVOKER is
  architecturally safe. Detail:
  `audits/database-audit/preapply-verif-q2.md`.
- **V3 (apply runbook) — WRITTEN, AMENDED.** `audits/database-audit/apply-runbook-v2.md`
  authored. Includes new `106_forensic_revert_helper_definer_drift.sql`
  (the only behavioral migration in the forensic-fix sequence; flips
  both `can_patient_*` and `can_clinic_*` helpers from DEFINER → INVOKER
  via `ALTER FUNCTION ... SECURITY INVOKER`). Amended 2026-05-03 per
  Mo's two rounds of amendments. First round: (1) added Step 0.5 — mig
  092 file edit reverts R2 in the working tree before any apply,
  closing the future-trap; (2) added Phase D run #1.5 expected outcomes
  + failure-class triage to Step 7. Second round: (Ask 1) Option B
  applied to helper #3 (SET search_path re-added per defense-in-depth);
  (Ask 2) Step 4.5 added — file-vs-staging verification probe between
  mig 106 apply and Step 5; (Ask 3) Phase F task #8 added — search_path
  audit across all RLS helpers. Helper #2 symmetric Option-B
  application surfaced as open question (queued for Mo confirmation;
  file factually lacks SET search_path on helper #2 contrary to
  amendment-2 premise). Mig 092 in-place re-apply remains skipped in
  v2 by choice. Pass criterion for Phase D #1.5: 177/177 PASS.

## Phase F follow-up tasks (post-forensic-apply, not in Session C scope)

These tasks land in code-side cleanup PRs after forensic migrations 100-105 apply:

1. **Delete the 7 doctor-fees callsites** per `audits/database-audit/mig-022-archive-plan.md` and move `022_doctor_fees.sql` to `supabase/migrations/_archived/022_doctor_fees.sql.RETIRED`. (R1)
2. **Delete patient_code retirement files** per `audits/database-audit/patient-code-usage.md`:
   - Delete `packages/shared/lib/api/handlers/patient/my-code/handler.ts`
   - Delete `apps/patient/app/api/patient/my-code/route.ts`
   - Delete the my-code section of `apps/patient/app/(patient)/patient/more/page.tsx` (callsites L359, L394)
   - Edit out `patient_code?: string | null` in `packages/shared/lib/data/patients.ts:34`
   - Regenerate `packages/shared/lib/supabase/types.ts` (3 lines auto-clean)
   (R7 — no DB migration needed; `patients.patient_code` column was never on staging.)
3. **Drop or scope `patients.email` exposure.** Currently `doctor/patients/[id]/handler.ts` returns `patient.email || ''`. Decide: drop the column + remove the field from the response, OR wire a write path and scope by clinic/share. (R4 — Session C kept the column.)
4. **Audit-log consolidation review.** `audit_log` (unclaimed table, used by SMS service + patient-dedup) and `audit_events` (in migration tree, used by phone changes) coexist with different schemas, writers, consumers. Consolidation = product decision. (R5 — Year-2 tech debt.)
5. **`front_desk_staff`-in-policy targeted re-scan.** Session B's structural-drift spot-check found that `invoice_requests::frontdesk_invoice_requests` was rewritten on staging to use `clinic_memberships` instead of `front_desk_staff`, with the file body never updated. The pattern is likely systematic. A `grep` across `supabase/migrations/04*.sql` for policies referencing `front_desk_staff` followed by per-policy structural verification against staging would surface other forgotten rewrites. (Session B recommendation #2.)
6. **Resolve mig 068 (`068_cleanup_legacy_policies.sql`) status.** Memory says apply was aborted; superseded by 092-097. Decide: delete from repo, or leave as a known-skipped file with a `.RETIRED` annotation header.
7. **Resolve mig 099 (`099_patient_code_rpcs.sql`) status.** Drafted but not applied. With `patient_code` column gone (R7 retirement), the RPCs are dead. Delete from repo.
8. **`SET search_path` audit on RLS helpers.** Verify all RLS helper functions (DEFINER and INVOKER) have explicit `SET search_path = public, pg_temp` declarations. Defense-in-depth against search-path injection — pinning the path holds regardless of SECURITY mode. Currently only DEFINER helpers (mig 092 #1 `is_clinic_member`, #4 `can_view_patient_data_at_clinic`) and the just-added INVOKER helpers in mig 092 (#2 `can_clinic_access_global_patient` and #3 `can_patient_access_global_patient` per Mo Option-B 2026-05-03 + Ask 4) have it. Hardening pass before launch — confirm the same pattern is applied to any helpers introduced in migs 093-097, plus the post-094a helper `user_has_clinic_path_to_gp` (which is DEFINER and should already have it — verify) and the privacy-code SECURITY DEFINER functions in mig 087 (verify per `audits/database-audit/preapply-verif-087.md`). Output: a one-pass enumeration of every `CREATE OR REPLACE FUNCTION` in `supabase/migrations/` that touches RLS-relevant authorization with a TRUE/FALSE column for "has SET search_path."
9. **Compute precise EXTRA_ON_STAGING reconciliation post-forensic-apply.** Confirm the policy-count shrinkage from 136 EXTRA pre-apply to expected ~122 EXTRA post-apply via a migration tree CREATE POLICY parser + `pg_policies` diff. Tooling pass — not blocking. Useful for `audits/database-audit/AUDIT_FINAL.md` narrative completeness. Same reconciliation also applies to EXTRA functions (9 → 3, test-harness only) and EXTRA tables (5 → 0). Run after Phase F closes; the absolute counts (Q1-Q6a per runbook v2 Step 6) already confirm correct state changes.
10. **Task 18 — Fix `rls_test_teardown()` audit_events cleanup. ✅ DONE 2026-05-07.** Mig 108 (`108_fix_rls_test_teardown_audit_events.sql` + rollback) extends `rls_test_teardown()`'s `audit_events` DELETE clause with `resolved_global_patient_id = ANY(test_gps)` and a defensive `entity_type='patient_clinic_record' AND metadata->>'global_patient_id' = ANY(test_gps)` clause — closing the cycle-accumulation gap surfaced by D-074 / Phase D #1.5 matrix reconstruction. Smoke probe asserts cleanup: post-fix matrix re-run at `run_no = 1.6` produces 177/177 PASS with `audit_events.S6` row count stable at 1 per cycle (was 8 in run #1, 10 in run #1.5). Schema-fact captured: `audit_events.resolved_global_patient_id` is GENERATED ALWAYS, computed from `metadata->>'global_patient_id'` or `entity_id` when `entity_type='global_patients'`. See `DECISIONS_LOG.md` D-074 amendment + `ARCHITECTURE.md` §8.6 mig 108 row.
11. **Task 10 (P0) — Add `auto-renew-on-visit-gpid-lookup` to `ALLOWED_ADMIN_SCOPES`. ✅ DONE 2026-05-08** (commit `0abce28`). The Build 05 § B7 / D-068 auto-renew-on-visit hook in the frontdesk check-in handler (`packages/shared/lib/api/handlers/frontdesk/checkin/handler.ts:145`) calls `createAdminClient('auto-renew-on-visit-gpid-lookup')` for the `patients.global_patient_id` resolution before delegating to `autoRenewOnVisit`. The scope was missing from `ALLOWED_ADMIN_SCOPES` in `packages/shared/lib/supabase/admin.ts`, producing a `console.warn` at runtime on every active-share check-in. **Single-line addition** to admin.ts (new feature-grouped comment block: "Patient sharing lifecycle (mig 090 / Build 05 § B7 — D-068)"). Verified scope string at call site matched the task description exactly; allow-list confirmed not to already contain the scope or any near-duplicate (kebab-case convention preserved). Scope is intentionally bounded — the broader admin-scope reconciliation (135 distinct scopes vs 35 now in allow-list — precise count, supersedes "~36" approximation) remains queued as **Task 16** (now TRIAGED below). **Out-of-scope finding surfaced for the broader Task 16:** `packages/shared/lib/data/patient-shares.ts:332` uses `createAdminClient('patient-shares-auto-renew')` — also not in the allow-list (different logical scope: the actual share renewal RPC inside `autoRenewOnVisit`, distinct from the GPID lookup at the handler call site). **Doc updates landed in this commit:** ARCH §12 admin scope count (~35 → ~36 in allow-list — both now corrected to the precise 35 in the 2026-05-08 batch below), D-008 Amendment 2026-05-04 appended with closure note, STATE_OF_WORK.md (workstream Active → Completed; bookkeeping fix `d8daa60` → `bad1100` for the prior CI doc-reconciliation entry per `git log` ground truth). *(Bookkeeping fix 2026-05-08: this entry originally recorded the commit hash as `5ad4003`, which was orphaned by `git commit --amend`; corrected to `0abce28` per `git log` ground truth on origin/main. Same Path 2 annotation pattern STATE_OF_WORK.md uses for `d8daa60 → bad1100` and the prior fix STATE_OF_WORK line 131 already applied to `5ad4003 → 0abce28`. Third instance of the off-by-amend pattern; caught by REVIEW_CRITERIA §1.2 STATE_OF_WORK currency check.)*

12. **Task 16 (P1) — admin-scope reconciliation. ✅ TRIAGED 2026-05-08.** The 2026-05-08 reconciliation pass (`audits/admin-scope-reconciliation-2026-05-08.md`) produced a complete inventory + categorization + recommendation. **Inventory (precise counts, supersede earlier ~approximations):** 210 total `createAdminClient(...)` invocations (207 explicit-arg + 3 no-arg defaulting to `'api-route'`); 135 unique scope strings at callsites; 35 entries in `ALLOWED_ADMIN_SCOPES`; 105 callsite scopes missing from the allow-list; 4 truly-unused allow-list entries (`api-versioning`, `input-validation`, `phone-change-rollback`, `privacy-migration-backfill`); 0 typos / near-misses; 0 dynamic template-literal callsites; uniform kebab-case naming (no snake_case / camelCase / anomalies); 100% of missing scopes are in production code paths (zero in build/test tooling). Largest single cluster: Build 05 patient-sharing lifecycle (D-068), 18 of the 105 missing scopes. **Recommended option D (sequenced hybrid):** Phase 1 (this batch — TRIAGED, no code change). Phase 2 (workstream queued as Task 20 below): Option A (expand allow-list to 132 entries: 35 + 105 missing − 4 truly-unused − 4 unused-but-kept-as-default-includes; group by feature with comment dividers) **+ mandatory eslint / pre-commit rule** that blocks (a) static-string scopes not in the allow-list and (b) ANY non-static-literal `createAdminClient(...)` callsite (template literals / variables / expressions). The eslint rule is non-negotiable; without it, Phase 2 is cosmetic. Phase 3 (m): Option C.1 (replace runtime `Set` with TypeScript literal-union type `AdminScope`; drop the `Set.has()` check). Option B (runtime throw) likely DROPPED once Phase 2's commit-time check + Phase 3's compile-time check land. **Doc updates this batch:** ARCH §12 (~36 → 35; reconciliation pointer added), D-008 Amendment 2026-05-08 appended (inventory + Option D recommendation + Phase 2/3 sequencing), this PROGRAM_STATE entry, new Task 20 entry below for the Phase 2 workstream.

13. **Task 19 (P3) — Audit whether root `next` is an orphan dep and remove if so.** Surfaced in 2026-05-08 D2 (Dependabot triage / critical-alert remediation, commit batch ID TBD). Root `package.json` declares `"next": "14.1.0"` and four `next *` scripts (`dev`, `build`, `start`, `lint`); no `app/` or `pages/` directory at the workspace root and no `next.config.js`. Apps build via `npm run build:clinic` / `:patient` against their workspace-local `next@14.2.25`; the root `next` does not serve production traffic. The pragmatic 14.2.35 bump in this batch's D2 keeps the root `next` temporarily; the long-term right answer may be removing it entirely (would close all 7 root-only `next` advisories permanently, reduce `node_modules` size, eliminate the orphan-script confusion). Not pursued in this batch because removal is more than a version bump — touches root scripts, may affect tsc/eslint resolution of `next/*` types in shared code. **Effort:** s–m (audit + delete + verify scripts + verify shared-package type resolution). **Trigger:** post-launch hardening or whenever the root `next` causes a follow-on issue.

14. **Task 20 (P1) — Phase 2 of admin-scope reconciliation: Option A allow-list expansion + mandatory eslint static-string discipline rule.** Picks up after Task 16 TRIAGED. **Scope:** edit `packages/shared/lib/supabase/admin.ts` to add 105 missing scopes (grouped by feature with comment dividers matching existing Build-prefixed style); remove 4 truly-unused entries; result is 132-entry allow-list. Author custom eslint rule (preferred) or git pre-commit hook that fails commit when (a) `createAdminClient('xyz')` passes a static literal not in the allow-list, (b) `createAdminClient(...)` passes a non-static-literal (template literal / variable / expression). **Verification:** `comm -23 callsites.txt allowlist.txt` empty; three tsc gates clean; eslint rule self-test against contrived bad commits (must reject); spot-run a known-active callsite (e.g., frontdesk check-in) and confirm no `console.warn` fires. **Effort:** m (allow-list expansion is s; eslint rule + tests is the bulk). **Lockstep doc updates:** ARCH §12 count 35 → 132; D-008 amendment recording the Phase 2 closure; PROGRAM_STATE Task 16 (TRIAGED → DONE-Phase-2); STATE_OF_WORK.md workstream lifecycle. Possibly a new Empirical Lesson if eslint authoring surfaces a non-obvious insight. **Trigger:** Mo's confirmation to start Phase 2; any cowork session after this batch lands.

## Next Action
**Open fresh cowork session 2026-05-04. Read `audits/database-audit/PHASE_D_RECONSTRUCTION_HANDOFF.md` as the entry point. Reconstruct the Phase D matrix per the templating theory. Run matrix as run_no = 1.5 against staging. Push to remote if 177/177 PASS. Resume Phase F Step 2 after push.**

**Historical record (frozen at 2026-05-03 close-out — kept for context):** the apply-phase plan that ran today is below. All steps complete except Step 7 (Phase D #1.5) which is queued for the fresh session.

1. Step 0 sanity check (read-only probes against staging).
2. Step 0.5 — mig 092 R2 reversal (working-tree edit, completed 2026-05-03;
   file is in the working tree ready for the Step 1 commit).
3. Step 1 commit pre-apply state (audit deliverables + edited mig 087 +
   edited mig 092 + new mig 106 + runbook v2 + this PROGRAM_STATE update).
4. Step 2 apply forensic mig 100 → 105 in order, smoke-probe-by-smoke-probe.
5. Step 3 apply new mig 106 (the only behavioral migration; flips both
   helpers DEFINER → INVOKER).
6. Step 4 apply mig 087 in-place (true no-op post-Part-2 edit).
7. Step 5 mig 092 in-place re-apply: SKIPPED by choice (cosmetic SET
   search_path divergence; trap closed by Step 0.5).
8. Step 6 verify EXTRA_ON_STAGING shrinkage.
9. Step 7 re-run Phase D matrix as run #1.5 — pass criterion 177/177.
   Expected outcomes + failure-class triage documented in runbook § 7.
10. Step 8 push to remote (only if 177/177 PASS).
11. Step 9 update PROGRAM_STATE post-apply.
12. Step 10 resume Phase F Step 2.

Deferred reconciliations (out of this session's scope, queued
separately):
- Decide between Option A (`ALTER FUNCTION ... RESET search_path` on
  helpers #2 and #3 to remove the cosmetic divergence) and Option B
  (re-add `SET search_path = public, pg_temp` to mig 092's INVOKER
  bodies + EXECUTION_PROMPTS § B2/B3). See runbook § 5 "Future
  reconciliation options."
- Doc-only update to mig 094a's prologue noting helpers #2 and #3 were
  reverted by mig 106; preserve 094a's policy rewrites (the actual
  recursion fix).
- Update auto-memory `project_prompt_06_architecture_rulings.md` to
  capture Mo Q1/Q2 rulings overruling the mig 094a uniform-DEFINER
  amendment.

## Resume Plan (post-audit)
**Outcome B confirmed by Session C (Outcome A no longer possible — drift is
real, bounded, and now described by 6 forensic migrations + 2 in-place
file edits + 1 archive-plan doc).**

Specific path to resume:
1. Mo reviews `audits/database-audit/forensic-fix-plan.md`,
   `forensic-fix-summary.md`, and the 6 migration files.
2. Mo applies mig 100 → 101 → 102 → 103 → 104 → 105 in order to staging
   (via Supabase migrations CLI, NOT dashboard SQL editor — see Empirical
   Lesson #8). Each smoke probe must emit its `PASS` NOTICE.
3. Mo applies the in-place edits to mig 087 and mig 092 (these re-apply
   as no-ops since staging already matches the corrected definitions).
4. Mo verifies `EXTRA_ON_STAGING` enumeration shrinks: 5 unclaimed tables
   → 0; 9 EXTRA functions → 3 (test-harness only); 136 EXTRA policies →
   approximately 122 (the 14 backfilled here plus the 4 mig 101 policies).
5. Phase F Step 2 (atomic triage edit) resumes per the locked plan.

## What is NOT changing
- The 11-prompt EXECUTION_PROMPTS.md sequence
- Architectural decisions through Prompt 5
- Phase A-E findings of Prompt 6 (verified by audit; unchanged)
- Empirical Lessons #1-#6 (#7 and #8 added by Session C — see EXECUTION_PROMPTS.md)

## Known operational gap (separate from audit, flagged 2026-05-03)
Supabase dashboard shows "No backups" for medassist-egypt.
Manual backup recommended before launch. The schema snapshot from
this audit (audits/database-audit/staging-schema-2026-05-03.sql)
doubles as the first committed backup; commit it to git for permanent
recovery point.

## Last updated
2026-05-03 by Audit Session C; pre-apply verification appended later same
day — V1 NON-GREENLIGHT, V2 CONTRADICTED, V3 deferred. Resolved later
same day in the post-rulings continuation session: V1 GREEN (mig 087
edited to add missing pg_sleep, Part 2), V2/Q1 GREEN (Mo A1 ruling: revert
staging to INVOKER), VQ2 GREEN (verdict CONFIRMED INVOKER per
`preapply-verif-q2.md` § 1.5), V3 GREEN (apply-runbook-v2.md authored,
includes new mig 106 forensic-revert). Amended further in the same
session per Mo's two amendments: (1) Step 0.5 added — mig 092 file
edited to revert R2 (closes the future-trap of leaving the file
mismatched with documented intent); (2) Phase D run #1.5 expected
outcomes + failure-class triage added to Step 7. Working tree now has
all six file changes ready for the Step 1 commit.
