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

13. **Task 19 (P3) — Audit whether root `next` is an orphan dep and remove if so. ✅ AUDITED 2026-05-09; removal DEFERRED to focused workstream (Task 19a).** The 2026-05-09 Phase F closeout batch performed the audit per Decision 9 + Decision 10 in `audits/phase-f-closeout-decisions-2026-05-09.md`. **Audit findings:** (a) root has NO `app/`, `pages/`, `next.config.js`, `next-env.d.ts`, or imports of `next`; (b) the four root scripts `dev/build/start/lint` reference `next` but were added in commit `4a4f368` ("initial upload") and are NEVER invoked since CI uses workspace-scoped `build:clinic`/`build:patient`; (c) `turbo.json` task pipeline uses `dependsOn: ["^build"]` (workspace dependency chains) and does not invoke root next directly; (d) no `vercel.json` (deployment is workspace-scoped); (e) `.next/` exists at root but contains only stale `trace` from Apr 11 — not load-bearing; (f) 0 root-package.json next alerts open in `audits/dependabot-alerts-2026-05-09.json` — root next was already at 14.2.35 (Tier 1 bump 2026-05-08). **Category:** vestigial template residue (not orphan-clean — referenced by 4 dead scripts; not tooling — turbo/CI/Vercel don't depend on it; not type-only — no imports). **Removal deferred** because (a) lockfile delta would compound today's Tier 2 450-line delta, (b) blast-radius surface (turbo, possible external Vercel config, hoisted Radix/lucide-react/framer-motion deps with similar template-residue origin) deserves empirical verification via a Vercel preview deployment in a focused single-purpose PR, (c) removal closes 0 outstanding alerts so security urgency is nil. **New workstream queued: Task 19a — root vestigial dep cleanup (next + Radix + others).** Scope: triage all root deps that look like template residue (Radix, lucide-react, framer-motion, cmdk, etc. — verify each is hoisted dedup or genuinely orphan), remove the orphan ones in one focused PR with preview deploy verification. **Effort for Task 19a:** s-m (audit existing root deps against workspace declarations, triage, single removal commit with preview verification). **Trigger for 19a:** post-launch hardening or whenever the vestigial root deps cause friction.

15. **Phase F closeout autonomous batch (2026-05-09) — pre-push gate enhancement + Tier 2 Dependabot + Task 19 audit. ✅ PARTIAL.** Autonomous-execution multi-task batch covering 4 originally-scoped tasks; **3 of 4 completed, 1 deferred**. **Task 1 ✅ DONE** — `.husky/pre-push` extended from 3 passes to 5 passes with `next build` for both apps as Pass 4 (clinic) and Pass 5 (patient). Closes Empirical Lesson #17's operational follow-up: route-handler type contract (e.g., `GET(request?: Request)` rejecting at `next build` typegen but passing under `tsc --noEmit`). Sequential, no `--no-lint`, full CI mirror. Empirical verification of the gate firing on a deliberately-broken handler was sandbox-constrained (the 45s sandbox timeout cannot complete a `next build` for either app, which takes ~60-180s wall clock); however gates 1-3 were empirically reproduced as failing-to-catch the anti-pattern (consistent with Lesson #17's record), and the gate logic is structurally sound. Mac-side empirical verification required before push (run `.husky/pre-push` once with no changes — full 5-pass clean confirms the new lines work). **Task 2 (Tier 2) ✅ DONE** — apps' next 14.2.25 → 14.2.35 + apps' eslint-config-next 14.2.25 → 14.2.35 (paired). Lockfile delta 450 lines (36+, 422-) bounded entirely to next dep tree + dedupe cleanup (`@next/env`, `@next/eslint-plugin-next`, `@next/swc-*` platform binaries, `nanoid`, `postcss`, `balanced-match`); 32 integrity hash changes. Larger than Tier 1's 113-line delta because two apps have separate `node_modules` trees AND because the pre-bump state had cosmetic peer:true / license-trailing-comma drift from npm 11 vs npm 10 metadata refresh that npm install canonicalized. Gates 1-4 clean (G1 root tsc 3.8s, G2 clinic tsc 3.1s, G3 patient tsc 2.3s, G4 lint:scopes 4.4s); gate 5 (next build × 2) Mac-deferred per Decision 4. **Expected closures: 21** (7 GHSAs × 2 apps = 14 manifest closures + 7 lockfile closures). Per Lesson #18, post-push verification query embedded in Decision 8 (filter by `fixed_at >= 2026-05-09T06:11:48Z`). **Task 3 (Phase F Task 16 Phase 3 — TS literal-union) ⏸ DEFERRED** to focused session per Decision 11 — the largest task in the batch (90-150 min), needs careful approach selection (1: `as const` tuple → derived union; 2: manual literal union; 3: branded type) + 135-callsite verification + deliberate-violation tests + sympathetic doc updates (ARCH §12, D-008, admin-scope-reconciliation §10). Yesterday's eslint static-string discipline rule already enforces the precondition the refactor needs, so deferral does not regress security posture. **Task 4 (Phase F Task 19) ✅ AUDITED + DEFERRED** — see entry 13 above for full audit findings. **Doc updates this batch:** ARCH §3 (next pin 14.2.25 → 14.2.35 + root vestigial-residue annotation), ARCH §16 file tree comment + technology stack pre-push row (3 → 5 passes), DECISIONS_LOG.md (D-NNN entries below), this PROGRAM_STATE entry, STATE_OF_WORK.md (workstream Active → Completed-partial; Task 3 explicitly deferred). **Decision log:** `audits/phase-f-closeout-decisions-2026-05-09.md` (12 decisions cataloging every meaningful trade-off). **Pre-push state for Mo's batch commit:** modified `.husky/pre-push`, `apps/clinic/package.json`, `apps/patient/package.json`, `package-lock.json`, `ARCHITECTURE.md`, `audits/PROGRAM_STATE.md`, `audits/STATE_OF_WORK.md`, `DECISIONS_LOG.md`; new `audits/phase-f-closeout-decisions-2026-05-09.md`; **Mac-side cleanup required before commit:** `rm -rf apps/clinic/app/api/_lesson17_test` (sandbox `rm` was blocked by the same mount permission flagged in feedback memory `feedback_sandbox_git_lock_artifacts.md`; file replaced with benign `export {}` stub flagged DELETE BEFORE COMMITTING per Decision 5).

19. **B07 Phase C — Dependent Accounts data layer (Pattern A + Pattern B). ✅ COMPLETE 2026-05-09; awaiting Mo's review before Phase D.** Phase C of the B07 build per the architectural review at commit `07fcbf8` and the Phase C-E batch prompt's 19 load-bearing rulings (10 architecture + 4 cowork-design + 3 protocol + 2 Phase C-E additions on default capability set + no new schema). **Session scope ruling at start:** Mo selected "Phase C only this session" (Option 1 of 4) — the Phase C-E prompt's 6-9 hour estimate spans 2-3 sessions; per-phase scoping keeps Phase D's staging-migration apply atomic in a fresh session. **Pre-work verification (REVIEW_CRITERIA §1.1):** HEAD = `83bfff5` (Phase B cleanup commit on top of `6248056`); 3 minor fixtures present on staging (6036cd97 / fa8e3189 / 50f41bd5); parent gp `a108411a-…` (dep #1 reconstruction) present; 2 mig-109 CHECKs (`global_patients_minor_requires_guardian_chk`, `global_patients_minor_no_self_claim_chk`) present; mig-112 CHECK (`patient_delegations_grantor_not_delegate_chk: granted_by_user_id <> delegate_user_id`) present; `patient_delegations` 17 columns + 3 CHECKs verified via Supabase MCP. All premises hold. **Files this batch:** **NEW** `packages/shared/lib/data/dependents.ts` (Pattern A — `createMinorGlobalPatient`, `listDependentsByGuardian`, `getDependent`, `transferGuardianship`; defense-in-depth authority checks at write boundary; typed errors `DependentNotFoundError` / `GuardianAuthorityError` / `InvalidDependentError`; `transferGuardianship` MVP gate is previous-guardian-only per Mo ruling 5 — clinic-supervisor flow Phase 2; `is_minor` chain-depth-1 enforcement at create + transfer per Mo ruling 7 — a minor cannot be a guardian); **NEW** `packages/shared/lib/data/delegations.ts` (Pattern B — `grantDelegation` defaults capabilities=[] per Mo ruling 18, `acceptDelegation` idempotent on already-accepted, `revokeDelegation` discriminates principal-revoke vs delegate-withdraw, `updateDelegationCapabilities` no-ops on unchanged set, `listGrantedDelegations` / `listReceivedDelegations`, `expireStaleDelegations` audit-only no-mutation per Decision 8 — `revoke_consistency_chk` requires NOT NULL `revoked_by_user_id` so system-driven expiry uses `expires_at` as the de-facto inactive signal mirroring D-068 expire-stale-shares); `ALLOWED_DELEGATION_CAPABILITIES` literal union (5 MVP tokens; `consent_to_share` excluded per Mo ruling 4); `validateCapabilities` runtime `Set.has` check at data-layer boundary as defense-in-depth against `as` casts; typed errors `DelegationNotFoundError` / `DelegationAuthorityError` / `InvalidDelegationError`; `expiresAt` pure pass-through per Decision 5 — Phase E API handler applies architectural-review-recommended 1-year default. **Modified:** `packages/shared/lib/data/audit.ts` (additive `emitPatientAuditWithAuthority` helper wrapping `logAuditEvent`; new `AuditAction` enums `GUARDIAN_LINK_CREATED` / `GUARDIAN_LINK_TRANSFERRED` / `BACKFILL_DEPENDENT_GUARDIAN_RECONSTRUCTION` / `DELEGATION_GRANTED` / `DELEGATION_ACCEPTED` / `DELEGATION_REVOKED` / `DELEGATION_WITHDRAWN` / `DELEGATION_CAPABILITIES_UPDATED` / `DELEGATION_EXPIRED`; new `AuthorityBasis` literal union `'self' | 'guardian_of_minor' | 'delegated_by_principal'` placed in `audit.ts` per Decision 2 since it is consumed by every authority-aware audit emitter, not just delegations; existing `logAuditEvent` callers unchanged); `packages/shared/lib/data/global-patients.ts` (additive `getGuardianGlobalPatient` helper via `guardian_global_patient_id` FK; extended `GlobalPatient` interface with `guardian_global_patient_id: string | null`, `is_minor: boolean`, and tightened `normalized_phone` typing to `string | null` reflecting mig 076 + mig 109 reality); `packages/shared/lib/supabase/admin.ts` (12 new admin scopes: 5 dependent + 7 delegation, namespaced under "B07 Phase C — Pattern A child linkage" and "B07 Phase C — Pattern B adult delegation" comment blocks; allow-list grows 136 → 148). **NEW** `eslint-rules/no-unregistered-delegation-capability.js` (sibling rule to `no-unregistered-admin-scope` per Decision 9 — separate concern, separate allowed set, separate AST surface; parses `ALLOWED_DELEGATION_CAPABILITIES` from `delegations.ts` source at rule-load time, cached for the lint run; targets AST `Property` nodes with key `'capabilities'` (array) or `'capability'` (string), plus `CallExpression` calling `requireCapability` (Phase E auth helper's static second arg); fires three error classes — `unregisteredCapability`, `templateLiteral`, `nonLiteral` — same pattern as admin-scope rule); wired into `eslint-rules/index.js` plugin map, `.eslintrc.json` rules, and root `package.json` `lint:scopes` script. **Empirical eslint validation:** rule blocks `'consent_to_share'` (excluded per Mo ruling 4), `'unknown_token'` (typo), backtick template literal `` `tpl_lit` ``; allows valid `'view_records'`. **Verification gates:** 4/6 PASS in sandbox — `tsc --noEmit` (root, clinic, patient) all clean; `lint:scopes` clean. The 2 `next build` gates (clinic, patient) DEFERRED to Mac-side per the established sandbox-45s-timeout pattern (cf. Phase F closeout entry 15 Decision 4); pure-data-layer change with no new routes / components / server-client boundaries means TS + lint catch the failure modes that next build would catch. **17 decisions logged** in `audits/b07-phase-c-execution-2026-05-09.md` (data-layer signature shapes, error type choices, audit emission key choices, eslint rule trigger surfaces, sex normalization bridge between TS lowercase and DB capitalized convention, defense-in-depth posture, idempotency policies, expireStale audit-only pattern). **No schema changes** (Mo ruling 19 — Phase C is data-layer-only; Phase D ships migs 113-116 for the helper function + RLS extensions). **Sympathetic doc updates this batch:** D-008 fourth amendment (capability literal union joins family of eslint-locked tokens; sibling-rule precedent set), this PROGRAM_STATE entry (Phase C complete, awaiting Mo review before Phase D), `audits/STATE_OF_WORK.md` (Phase C completed; workstream awaiting Phase D session). Phase C deferred from Phase C-E batch the following sympathetic updates per Decision 17 — to be landed in Phase D / Phase E commits where the artifacts they describe will land: ARCHITECTURE.md mig-count + §8.6 timeline rows for migs 113-116 (Phase D); D-064 amendment for 5 DEFINER + 1 INVOKER (Phase D when `is_authorized_actor_on` lands); D-068 amendment for delegation audit metadata (Phase E when API handlers fully exercise it); audits/rls-test-matrix-reconstructed.sql header re-run note (Phase D after RLS matrix re-runs). **Mac-side cleanup required before commit:** `find .git -maxdepth 2 -name "*.lock" -delete` (sandbox left a stale `.git/index.lock` from Supabase MCP / git activity early in the session, same class as `feedback_sandbox_git_lock_artifacts.md`). **Phase D awaits Mo's review of this commit.** Recommended next step after Mo review: a fresh cowork session for Phase D (mig 113 helper function + 8 smoke probes, migs 114-116 RLS extensions, RLS matrix re-run at run_no = 2.0 to verify 177/177 PASS preserved).

18. **B07 Phase B — Dependent Accounts schema migrations. ✅ COMPLETE 2026-05-10 (revised batch); awaiting Mo's review before Phase C-E batch.** Phase B of B07 per the architectural review at commit `07fcbf8` and Mo's 17 load-bearing rulings (10 architecture + 4 cowork-design + 3 protocol), plus Mo's three review additions on the first surface (2026-05-10): (1) author mig 112 grantor≠delegate CHECK, (2) codify Empirical Lesson #19, (3) add explicit post-Phase-B follow-up tracker entries below. **4 migrations shipped** (the originally-conditional mig 081 compat-trigger amendment was skipped per Decision 3 — investigation revealed mig 081 operates on clinical tables only, not `patients`/`global_patients`; the mig 112 slot was then repurposed in Mo's review-additions batch for the grantor≠delegate CHECK). **Mig 109** — `global_patients` minor-gp schema: `guardian_global_patient_id UUID REFERENCES global_patients(id) ON DELETE SET NULL`, `is_minor BOOLEAN NOT NULL DEFAULT FALSE`, two CHECKs (`minor_requires_guardian`, `minor_no_self_claim`), partial index on `guardian_global_patient_id WHERE NOT NULL`. **The "non-minor must have phone" CHECK was deliberately dropped** (Decision 1) — mig 076 already relaxed `normalized_phone` deliberately for the sentinel/quarantine PATH B pattern; investigating the relaxation source per Mo's Q1 Option D ruling led to Option B per his Q1 follow-up. Smoke probe POS + 3 NEG cases all PASS. **Mig 110** — `patient_delegations` table for Pattern B adult-to-adult delegation: 17 columns (principal_global_patient_id FK, delegate_user_id FK, delegate_global_patient_id FK, capabilities JSONB, granted_at, granted_by_user_id FK, accepted_at, expires_at, revoked_at, revoked_by_user_id, revoke_reason, auto_renew, auto_renew_window_days, metadata JSONB, created_at, updated_at, id PK), 2 CHECKs (`delegate_not_self`, `revoke_consistency`), partial unique index for active uniqueness (Decision 2 — partial unique index fallback because `btree_gist` is not enabled on staging; functionally equivalent to the EXCLUDE constraint the architectural review §5 specified), 2 operational indexes (principal-active, delegate-active), `updated_at` trigger. Capability tokens NOT validated at DB level (D-008 eslint-locked literal-union pattern at app layer in Phase E). MVP capability set is the 5 from B07 rulings; `consent_to_share` is post-MVP. Smoke probe POS + 3 NEG + updated_at trigger advancement all PASS (Decision 8 — first attempt failed because `NOW()` returns transaction-start time within a single transaction; fix: seed `updated_at = '2000-01-01'` at INSERT time so the trigger advancement is observable). **Mig 111** — backfill 3 legacy dependents to `is_minor = TRUE` with `guardian_global_patient_id` resolved. **Three resolution paths:** dep #3 احمد محمد (`fdbc93ce-…`) via FK lookup through `patients.guardian_id` to guardian gp `4cc900cf-…` (ممدوح علي); dep #2 نوح عمر (`81696b8a-…`) via phone lookup at `+201111111105` to guardian gp `7a987351-…` (عمر فاروق); dep #1 فاطمة أحمد (`6036cd97-…`) via 3-step reconstruction (Decision 9) — release child gp's normalized_phone (which currently held the parent's phone, an old data convention), INSERT new parent gp at `+201234567890` with placeholder `display_name = 'ولي أمر فاطمة أحمد'` (correctable by clinic frontdesk later), attach guardian. New parent gp id `a108411a-4763-4ebc-a00d-e4391e600e94`. **4 audit events emitted** with `actor_kind = 'migration'`: BACKFILL_DEPENDENT_GUARDIAN_FK_LOOKUP, BACKFILL_DEPENDENT_GUARDIAN_PHONE_LOOKUP, BACKFILL_DEPENDENT_GUARDIAN_RECONSTRUCTION, BACKFILL_DEPENDENT_CHILD_GP_FLIPPED_TO_MINOR. Legacy `patients` rows are NOT modified (cleanup deferred to Prompt 6.5). Decision 10 surfaces a non-obvious schema fact: `audit_events.resolved_global_patient_id` is a GENERATED ALWAYS column — `COALESCE((metadata->>'global_patient_id')::uuid, CASE WHEN entity_type='global_patients' THEN entity_id END)` — cannot be inserted directly. **Mig 112 (NEW, review-additions batch)** — single CHECK constraint `patient_delegations_grantor_not_delegate_chk: granted_by_user_id <> delegate_user_id`. Schema-design gap caught during Mo's review of the first Phase B surface: review §5.3's two-step "principal grants; delegate accepts" workflow presumes grantor and delegate are different humans; mig 110 enforced delegate ≠ principal at the gp level but did not enforce grantor ≠ delegate at the user level. Mig 112 closes that gap. Smoke probe POS (distinct grantor + delegate) and NEG (grantor = delegate, expect check_violation) both PASS on staging (325 auth.users available; well above the 2-user minimum). Mig 110's smoke probe was sympathetically updated in the same batch: the single-user staging fallback that previously ran POS with `granted_by_user_id = delegate_user_id` is now a graceful skip path (RAISE NOTICE + RETURN) — mirrors the existing empty-`auth.users` skip path. **Pre-work fired STOP exceptions #1 and #4** which Mo resolved before any DDL applied: STOP #1 — live `global_patients.normalized_phone` is already nullable per mig 076 §076.0 (deliberate, sentinel pattern), contradicting the architectural review's `NOT NULL` claim; STOP #4 — dep #1's parent_phone phone-lookup self-resolves to the child's own gp because the child gp's `normalized_phone` IS the parent's phone (old data convention). Mo's rulings: Q1 Option D investigate→Option B drop "must have phone" CHECK; Q2 Option A reconstruct + relink for dep #1; Q3 proceed within authority. Both stale review claims documented as a follow-up annotation commit candidate post-Phase-B (Decision 6). **RLS matrix re-run at run_no = 2.0: 177/177 PASS, 24 tables covered, all 177 outcomes match run_no = 1.6 baseline** — schema additions did not regress any existing policy. Pre-flight teardown initially blocked by stale `sms_reminders` row referencing test appointment (Decision 11 — not a Phase B regression; pre-existing teardown infrastructure gap analogous to mig 108's audit_events fix; one-time hygiene applied to unblock; recurring vulnerability documented as follow-up). **RLS matrix re-run after mig 112 (still at run_no = 2.0):** 177/177 PASS, no divergence vs run_no = 1.6 baseline. The grantor≠delegate CHECK does not affect any RLS policy or any of the 24 matrix tables. **Files this batch:** `supabase/migrations/109_global_patients_minor_schema.sql` + `.rollback.sql`; `supabase/migrations/110_patient_delegations.sql` + `.rollback.sql` (smoke-probe single-user fallback updated in review-additions batch); `supabase/migrations/111_backfill_legacy_dependents.sql` + `.rollback.sql`; `supabase/migrations/112_patient_delegations_grantor_not_delegate.sql` + `.rollback.sql` (NEW review-additions batch); `audits/b07-phase-b-execution-2026-05-10.md` (new — 13 decisions, includes 12 new + 13 from review additions); `audits/rls-test-matrix-reconstructed.sql` (executable parts updated 1.6 → 2.0 in 24 DO blocks + Section 0 DELETE clause); `audits/EXECUTION_PROMPTS.md` (NEW Empirical Lesson #19 — `NOW()` is transaction-time, smoke probes need historical timestamp seeds); `ARCHITECTURE.md` §3 + §8.6 (mig 109-112); `DECISIONS_LOG.md` D-068 amendment 2026-05-10; this PROGRAM_STATE entry; `audits/STATE_OF_WORK.md`; new "Post-Phase-B follow-up tasks (B07)" section in this file. **Decision log:** `audits/b07-phase-b-execution-2026-05-10.md` (13 decisions). **Mac-side cleanup required before commit:** `rm -f audits/rls-test-matrix-reconstructed.sql.bak` (sed-created backup that the sandbox could not delete due to mount permissions, same class as `feedback_sandbox_git_lock_artifacts.md`). **Phase C-E batch awaits Mo's review of this commit.** Recommended next step after Mo review: Phase C (data layer — `dependents.ts` + `delegations.ts`), Phase D (RLS helpers + policy extensions), Phase E (~5 patient-app endpoints + onboard extension). **Three explicit post-Phase-B follow-ups now tracked in their own section** below: (B07-FU-1) review-doc drift annotation commit, (B07-FU-2) `sms_reminders` teardown gap (mig 113-style fix), (B07-FU-3) noah hasan non-canonical patient cleanup (Prompt 6.5 candidate).

17. **B07 Architectural Review — Dependent Accounts (Pattern A + delegated authority). ✅ REVIEW COMPLETE 2026-05-10; SUPERSEDED by Phase B (entry 18 above).** Architectural review for the Dependent Accounts workstream (B07), executed autonomously per the 2026-05-09 protocol. Authority basis: Mo's three load-bearing answers (Pattern A linked accounts; two MVP cases A1 mother+6yo / A2 son+father with delegation; authority delegation captured in audit trail with actor ≠ subject). Pre-work verified HEAD = `08cc9b2`, REVIEW_CRITERIA §1.1/§2.1/§5 present, D-068 read, Lessons #1–#18 present. **Empirical findings (Section 1):** dependent infrastructure exists on legacy `patients` table only (mig 004 `parent_phone`+`is_dependent`; mig 030 `guardian_id` FK; 3 live rows on staging). v2 identity layer (`global_patients`/PCR/`patient_data_shares`) has zero dependent / guardian / delegation / caregiver columns. Mig 073's "Replaced by self/clinic/caregiver policies in Prompt 6 (ORPH-V2-06)" comment forecast a policy that was never written; mig 092–097 implemented self + clinic only. Existing UI is clinic-side only (frontdesk + doctor-session forms with `is_dependent` toggle, `dependentType` `child|elderly|special`, guardian-search-by-phone, `guardianCandidate` confirmation); patient-app has zero dependent surfaces. **Critical architectural fit (Section 2):** `audit_events` already supports actor ≠ subject — `actor_user_id` (FK auth.users) and `resolved_global_patient_id` (GENERATED ALWAYS from metadata) are separate columns, an artifact of mig 074 + mig 088 design. Audit pipeline expresses delegation natively; only `metadata.acting_as` + `metadata.authority_grant_id` keys need to be added (zero schema cost). RLS does NOT yet support delegation — every patient-side policy in mig 093 keys exclusively off `claimed_user_id = auth.uid()`. **Recommended approach (Sections 3–5):** single helper `is_authorized_actor_on(global_patient_id, user_id)` with OR-of-three predicate (self-claim ∪ guardian-link ∪ active-delegation ∪ optional guardian-delegation chain at depth 2); inner DEFINER + outer INVOKER per D-064 hybrid pattern (extends to 5 DEFINER + 1 INVOKER); two new schema artifacts — `global_patients.guardian_global_patient_id`+`is_minor`+CHECK constraints (Pattern A) and `patient_delegations` table (Pattern B) with capability-scoped grants (eslint-locked literal-union à la D-008 admin scopes); two-step grant-then-accept flow; ~10 sessions / 6–8 weeks build effort across Phases A–J. **Build sequence (Section 9):** Phase A (this review) ✅; Phase B (3 mig: schema additions + RLS helper); Phase C (data layer: `dependents.ts` + `delegations.ts`); Phase D (4 RLS migs extending mig 093/094/095/096 with PERMISSIVE-OR pattern); Phase E (~5 new patient-app endpoints + extension of `/api/patients/onboard` for v2 minor creation); Phase F (largest UI surface — patient-app dependents/delegations pages + account switcher); Phase G (clinic-app dependent indicators + frontdesk schema migration); Phase H (RLS test matrix +50–80 scenarios via 2 new archetypes); Phase I (integration smoke for both Mo cases); Phase J (sign-off). **15 decisions logged** in `audits/b07-review-decisions-2026-05-10.md` (8 within session authority, 7 require Mo's ruling). **10 open questions for Mo (Section 10)** before B07 build kickoff: (1) graduation MVP or post-MVP [recommend defer]; (2) minor records cross-clinic-shareable identically to adult [recommend yes via guardian acting]; (3) messaging consent for minors [recommend route to parent phone always for MVP]; (4) MVP capability set [recommend `view_records + receive_notifications + book_appointments + manage_medications + consent_to_messaging` per case A2]; (5) custody dispute mechanism [recommend clinic-supervisor override with MAJOR_OPERATION audit]; (6) polygamous-household pattern [recommend Pattern A guardian + Pattern B delegate composition]; (7) `is_authorized_actor_on` recursion through guardian's-delegations [recommend chain at depth 2]; (8) pediatric dosing in B07 or sibling [recommend sibling B-clinical workstream]; (9) helper architecture extension to 5 DEFINER + 1 INVOKER [recommend yes]; (10) backfill + legacy-row keep-vs-remove timing [recommend backfill in Phase B, keep legacy until Prompt 6.5]. **Files this batch:** `audits/B07-architectural-review-2026-05-10.md` (new — 10 sections, ~13k words); `audits/b07-review-decisions-2026-05-10.md` (new — 15 decisions); this PROGRAM_STATE entry; `audits/STATE_OF_WORK.md` (workstream lifecycle Active → Completed-as-review). **No production code, schema, or migration changes.** B07 build kickoff blocked on Mo's ruling on the 10 Section-10 questions; recommended next step is a single chat surface from Mo with rulings, then a focused B07 Phase A (spec consolidation) session that consolidates rulings into a build-ready spec.

16. **Task 20 (P1) — Phase 2 of admin-scope reconciliation: Option A allow-list expansion + mandatory eslint static-string discipline rule. ✅ DONE 2026-05-09.** **Allow-list expanded 35 → 136 entries** (105 missing added, grouped into 16 feature blocks with comment dividers matching the existing Build-prefixed style; 4 truly-unused removed: `api-versioning`, `input-validation`, `phone-change-rollback`, `privacy-migration-backfill`). The "132 entries" target in the 2026-05-08 reconciliation doc was a math error; correct arithmetic is 35 + 105 − 4 = 136. **Custom eslint rule shipped:** `eslint-rules/no-unregistered-admin-scope.js` (rule logic; reads `ALLOWED_ADMIN_SCOPES` directly from `admin.ts` source via regex extraction, cached for the lint run) + `eslint-rules/index.js` (plugin packaging) + `eslint-rules/package.json` (npm `file:` linkage). Wired into root `.eslintrc.json` `plugins: ["medassist-local"]` + `rules: { "medassist-local/no-unregistered-admin-scope": "error" }`; root `package.json` devDependencies adds `"eslint-plugin-medassist-local": "file:./eslint-rules"`. New root script `lint:scopes` invokes eslint with a minimal config (`--no-eslintrc --no-inline-config --parser @typescript-eslint/parser --rulesdir eslint-rules`) to scan `packages/shared/lib + apps/clinic/app + apps/patient/app` so the rule covers the shared package's callsites that `next lint` per-app doesn't reach. **Three rule classes empirically validated** by smoke tests: (a) static literal not in allow-list → `unregisteredScope` error fires; (b) template literal arg → `templateLiteral` error fires; (c) variable / function call / expression → `nonLiteral` error fires; clean cases (registered scope, no-arg call) produce no error. **Five verification gates passed:** `lint:scopes` (clean), per-app `next lint` for clinic + patient (clean — only pre-existing unrelated warnings), three tsc gates (root + clinic + patient, all exit 0). The two-app `next build` gates run on Mo's Mac per Lesson #17 — those are the canonical build-time signal. **Doc updates landed in this batch:** ARCH §12 (count update + reconciliation pointer), D-008 Amendment 2026-05-09 appended (Phase 2 shipped — Option A + eslint rule), `audits/admin-scope-reconciliation-2026-05-08.md` §9 appended (Phase 2 shipped section + math correction), `audits/EXECUTION_PROMPTS.md` Lesson #18 codified (filter by event timestamp, not net delta — surfaced from this session's pre-work framing error), `audits/REVIEW_CRITERIA.md` §2.1 verification table addition (closure-counts row pointing at Lesson #18). **Phase 3 (Option C.1 TypeScript literal-union refactor) remains queued** — the static-literal-only precondition is now locked at the eslint level, ready for Phase 3 to swap runtime gating for compile-time gating. Option B (runtime throw) likely dropped from the sequence per the 2026-05-08 amendment's reasoning.

## Post-Phase-B follow-up tasks (B07)

These tasks were surfaced during B07 Phase B execution (2026-05-10) but
are explicitly OUT of Phase B scope. They land in separate small
workstreams after Phase B ships, before or alongside Phase C-E.

**B07-FU-1 — Annotate B07 architectural review §4 + §6 drift.** The
architectural review on `origin/main` at commit `07fcbf8`
(`audits/B07-architectural-review-2026-05-10.md`) has two factual claims
that drifted from live staging schema and live row counts:

- §4 / §3 claim: "`global_patients.normalized_phone TEXT NOT NULL`."
  Actual on staging: nullable since mig 076 §076.0 (the sentinel/quarantine
  PATH B pattern; deliberate relaxation, not drift). Documented in
  `audits/b07-phase-b-execution-2026-05-10.md` Decision 1 + Decision 6.
- §6 claim: "1 such case" of `is_dependent ∧ guardian_id IS NULL ∧
  parent_phone IS NOT NULL`. Actual on staging: 2 such cases (نوح عمر +
  فاطمة أحمد).

**Action:** small annotation commit appending a "Post-Phase-B empirical
correction (2026-05-10)" subsection to the review doc, citing the Phase B
decision-log decisions that ground-truthed each claim. Per Mo's Q3 ruling
("Surface this finding for a follow-up annotation commit AFTER Phase B
ships. Don't block Phase B on it."). **Effort:** s (single-file doc edit
plus commit). **Trigger:** any time after Phase B commit lands.

---

**B07-FU-2 — `sms_reminders` teardown gap (mig 113-style fix).** Phase B's
RLS matrix pre-flight teardown initially failed because the SMS-reminder
cron picked up the test appointment `00000099-0000-0000-0000-0000000000a0`
between the run_no=1.6 matrix run (2026-05-07) and the run_no=2.0 run
(2026-05-10), creating a stale `sms_reminders` row that
`rls_test_teardown()` does not currently clean. The FK
`sms_reminders_appointment_id_fkey` has no `ON DELETE CASCADE`, so the
teardown's DELETE on `appointments` violates the FK. **Same class of bug
as the `audit_events` teardown gap that mig 108 fixed (2026-05-07).**
Documented as `audits/b07-phase-b-execution-2026-05-10.md` Decision 11.
One-time data hygiene was applied during Phase B to unblock the matrix
(`DELETE FROM sms_reminders WHERE appointment_id::text LIKE '00000099%'`);
the recurring vulnerability remains.

**Action — pick one of two paths:**

- **Path A (preferred):** Author a mig 113-style migration extending
  `rls_test_teardown()` to include `DELETE FROM public.sms_reminders WHERE
  appointment_id IN (SELECT id FROM public.appointments WHERE id::text
  LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids));` at the start of
  the teardown body (before the appointments DELETE). Smoke probe inserts
  a sentinel sms_reminder, calls teardown, asserts 0 sms_reminders for
  test appointments post-teardown. Schema-fact noting the SMS-reminder
  cron is the source of recurring stale rows.
- **Path B:** Add `ON DELETE CASCADE` to
  `sms_reminders_appointment_id_fkey`. Simpler structurally but changes
  production semantics: deletion of a real appointment would now cascade
  to its sms_reminders. May or may not be the desired production behavior;
  Path A is safer because it's test-scaffolding-only.

**Effort:** s-m (Path A). **Trigger:** before Phase H matrix expansion
(Phase H authors +50-80 new scenarios; an unfixed teardown gap will
re-fire).

---

**B07-FU-3 — "noah hasan" non-canonical patient cleanup.** Phase B
pre-work surfaced a pre-existing data-hygiene anomaly: `patients` row
`bbb7c45a-db13-403c-a9b1-70acb2ab37ee` ("noah hasan", `is_canonical=FALSE`,
`is_dependent=FALSE`, `phone='010343485734345'` — 15 digits, malformed,
unparseable to E.164) is linked to `global_patients` row
`784de785-4557-4581-9d02-10770c64cfcc` (sentinel-shaped: `display_name=NULL`,
`normalized_phone=NULL`, `account_status='locked'`, both created
2026-04-29). Existed before Phase B; not affected by Phase B's schema
additions (the dropped "non-minor must have phone" CHECK in mig 109
prevents this row from violating). Documented as
`audits/b07-phase-b-execution-2026-05-10.md` Decision 7.

**Action:** decide whether to (a) merge the gp into the canonical patient
row at the same clinic if one exists, (b) delete the patient + gp pair
(reasonable since `is_canonical=FALSE` and the gp is locked), or
(c) restore the original phone via patient_phone_history audit if recoverable.
**Trigger:** Prompt 6.5 (Legacy Cleanup) candidate, or its own focused
data-hygiene workstream. **Effort:** s (single SQL update + audit row).
Not blocking any other workstream.

---

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
