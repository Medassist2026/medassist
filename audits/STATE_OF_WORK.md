# MedAssist — State of Work
> Living document. Updated at the START and END of every cowork session.
> Source of truth for "what are we working on, what's done, what's next, what's blocked."

**Last updated:** 2026-05-07 (THREE workstreams shipped today: Phase F Task 18 — mig 108 + matrix run_no=1.6 = 177/177 PASS; CI run 25535878629 root cause + 1-char fix in `patient/sharing/handler.ts` line 27 — CI run 25539467112 green; CI fix-attribution doc reconciliation + Lesson #17 codified — annotates the prior 2026-05-07 amendments that miscredited `9774252` as the operational fix)
**Last session:** Phase F Task 18 — Fix `rls_test_teardown()` audit_events cleanup. D-074's run #1.5 surfaced that PCR audit rows accumulate +4 per seed cycle because the teardown's audit_events DELETE clause only matched `entity_type IN ('global_patients', 'patient_data_share')`. Investigation pulled live function body from `pg_proc` (Lesson #7) — confirmed staging body is a SUPERSET of `audits/rls-test-seed.sql` (extra ops/comm + clinical-data cleanup blocks added in Sessions 11 + 14a; the file is out of date). Verified `audit_events.resolved_global_patient_id` is a GENERATED ALWAYS column (computed from `metadata->>'global_patient_id'` or `entity_id` when `entity_type='global_patients'`) — no resolver-trigger timing concern. Authored mig 108 + rollback: `CREATE OR REPLACE FUNCTION public.rls_test_teardown()` with the live body verbatim plus two new audit_events DELETE clauses (`resolved_global_patient_id = ANY(test_gps)` master clause + defensive `entity_type='patient_clinic_record' AND metadata->>'global_patient_id' = ANY(test_gps)` for readability). Smoke probe inserts a sentinel PCR audit row with `metadata.global_patient_id` set to `patient_y_gp` (cannot directly INSERT the generated column), calls teardown, asserts the sentinel + 40 pre-existing accumulated PCR rows are all cleaned. Mig 108 applied 2026-05-07 (smoke = PASS). Re-ran the matrix at `run_no = 1.6` against staging post-teardown+seed: **177/177 PASS, fail=0 across all 24 tables**, `audit_events.S6 = 1` (the post-fix cycle-stable invariant; was 8 in run #1, 10 in run #1.5). Comparison-vs-run-#1 query returns exactly one divergence row (audit_events.S6 row count 8→1, outcome SUCCESS=SUCCESS preserved) — that's the expected post-fix invariant per D-074 amendment. Files touched: `supabase/migrations/108_fix_rls_test_teardown_audit_events.sql` + `.rollback.sql` (new), `audits/rls-test-matrix-reconstructed.sql` (run_no 1.5→1.6 in 24 DO blocks + Section 0; audit_events.S6 dynamic→hardcoded 1; Section 25 validation queries updated; new D-074 amendment commentary in Section 19), `ARCHITECTURE.md` (§3 row count 110→111 + highest base 107→108; §8.6 mig 108 row added), `DECISIONS_LOG.md` (D-074 amendment blockquote added after Outcome — D-004/D-005/D-008 pattern), `audits/STATE_OF_WORK.md`, `audits/PROGRAM_STATE.md`.

**Parallel session today (CI run 25535878629 root cause + fix):** Investigation of CI run 25535878629 (failure on commit `134e272`, doc-only). Failed job: **Build Patient App** step 5, exit 1, 26s. Type-check + clinic build pass. Investigation surfaced this is the SIXTH consecutive failure (runs 115–120 since `19fb148` on 2026-05-07 03:38 UTC; last green = `778467a` run 114) — every red run failed at the same step. **Mid-session, Mo uploaded the `patient-build-log` artifact contents from run 25535878629**, which exposed the actual error: `packages/shared/lib/api/handlers/patient/sharing/handler.ts` line 27 declared `export async function GET(request?: Request)`. The optional `?` makes the parameter type `Request | undefined`, which Next.js's route-handler type contract rejects at `next build` time (it requires exactly `NextRequest | Request`). **Failure class B (TypeScript), NOT class A (webpack-alias)** as the Lesson #14 amendment claimed. `tsc --noEmit` does not enforce Next's route-handler contract — only `next build` does — which is why pre-push and the Lint-and-Type-Check CI job both pass clean while the Build Patient App job fails. **Fix applied:** removed the `?` (one character), making `request: Request` non-optional; pattern matches the `DELETE` handler on line 139 of the same file. Only callsite is the re-export in `apps/patient/app/api/patient/sharing/route.ts`. All three tsc gates re-verified clean post-fix (root + per-app patient + per-app clinic — all exit 0). **Outcome:** committed as `80ee270`; CI run 25539467112 is green. **Out-of-scope follow-up surfaced for Mo's ruling AT THE TIME:** the Lesson #14 / ARCH §2 / D-065 amendments in commit `134e272` cite `9774252`'s webpack-alias work as the operational fix for the original CI failure (run 25475031898). That empirical claim is contradicted by the 6-run pattern surfaced this session — the actual fix is the type-handler change applied here. **Resolution:** Mo accepted reframing into a separate cowork session (see "Doc reconciliation + Lesson #17" entry below); commit `80ee270` ships the operational fix, and the doc reconciliation commit ships the empirical-justification correction + Lesson #17. Files touched (this session): `packages/shared/lib/api/handlers/patient/sharing/handler.ts` (1-character source fix), `audits/STATE_OF_WORK.md`.

**Earlier session (kept for context):** Empirical Lesson #14 amendment. CI run 25475031898 (failed with opaque `Process completed with exit code 1`) proved the original two-level path-alias rule (root tsconfig + per-app tsconfig) incomplete — Next 14.2.x's webpack resolver does not always honor tsconfig path aliases for cross-segment imports inside an app. Operational fix shipped in commit `9774252` (per-app webpack alias additions in both apps' `next.config.js`); this session amends the lesson text + cross-refs to reflect three-level reality (root tsconfig + per-app tsconfig + per-app `next.config.js` `config.resolve.alias`). Files touched: `audits/EXECUTION_PROMPTS.md` (Lesson #14 retitled THREE levels, addendum paragraph + rule #2 extended in-place), `ARCHITECTURE.md` §2 (Path alias mechanics paragraph rewritten as 3-level enumeration with CI run + commit `9774252` references), `DECISIONS_LOG.md` D-065 (Amendment 2026-05-07 blockquote subsection added after Outcome — D-004/D-005/D-008 pattern; original Decision body preserved as historical record), `audits/STATE_OF_WORK.md`. ARCH §2 + D-065 amendments are in-scope per Lesson #13 lockstep discipline (half-maintained docs are worse than no docs). **Note:** The empirical claim that `9774252` operationalizes the fix is contradicted by the run 115–120 pattern surfaced in this current session — Lesson #14 may need a second amendment after the actual root cause is identified.

---

## Active workstreams

(One section per workstream currently in flight. Workstream = bounded body of work
with a defined end state. When a workstream is fully done, MOVE its section to
"Completed workstreams" below; do not delete.)

(Phase F Task 18 — Fix `rls_test_teardown()` audit_events cleanup — moved to "Completed workstreams" below; mig 108 applied to staging; matrix re-run at run_no=1.6 = 177/177 PASS; audit_events.S6 stable at 1 per cycle.)


---

## Pending workstreams (queued, not started)

(Highest-priority Phase F follow-ups. Mirror summary; canonical record lives in `audits/PROGRAM_STATE.md` § "Phase F follow-up tasks". Numeric tags below match PROGRAM_STATE numbering. The list is 9 items in PROGRAM_STATE today; planned Tasks 16 (P1) and 17 (P3) are queued in `audits/discipline-cleanup/inventory-2026-05-04.md` but have not yet been added to PROGRAM_STATE.md — surfaced here as "Task 16 (planned)" / "Task 17 (planned)".)

### Workstream: Phase F Task 1 — doctor-fees callsite cleanup + mig 022 archive
- **Why queued:** R1 of forensic plan; mig 022 is dead code on staging behind the global-identity rewrite. Code-side cleanup is decoupled from forensic SQL.
- **Trigger:** Phase D #1.5 matrix reconstruction passes; push to remote releases the Phase F gate.
- **Estimated scope:** s
- **Cross-refs:** `audits/database-audit/mig-022-archive-plan.md`, `audits/database-audit/doctor-fees-usage.md`

### Workstream: Phase F Task 2 — patient_code retirement code deletion
- **Why queued:** R7 of forensic plan; column was never on staging, so DB side is already clean. Codebase still references the column in 4 files.
- **Trigger:** Phase F resumption.
- **Estimated scope:** s
- **Cross-refs:** `audits/database-audit/patient-code-usage.md`; targets `packages/shared/lib/api/handlers/patient/my-code/handler.ts`, `apps/patient/app/api/patient/my-code/route.ts`, `apps/patient/app/(patient)/patient/more/page.tsx` (L359, L394), `packages/shared/lib/data/patients.ts:34`, regenerate `packages/shared/lib/supabase/types.ts`

### Workstream: Phase F Task 3 — `patients.email` exposure decision
- **Why queued:** R4 of forensic plan kept the column. Product decision needed: drop OR wire write path + scope-by-clinic-or-share.
- **Trigger:** Mo product decision.
- **Estimated scope:** s (decision) → m (implementation if "wire write path")
- **Cross-refs:** `doctor/patients/[id]/handler.ts` (returns `patient.email || ''`)

### Workstream: Phase F Task 4 — audit_log vs audit_events consolidation
- **Why queued:** R5 of forensic plan tagged Year-2 tech debt. Two tables coexist with different schemas, writers, consumers — `audit_log` (SMS service + dedup) vs `audit_events` (phone changes pipeline).
- **Trigger:** Year-2 product planning; not blocking launch.
- **Estimated scope:** l
- **Cross-refs:** `audits/database-audit/unclaimed-tables-usage.md`, mig 101 (audit_log backfill)

### Workstream: Phase F Task 5 — `front_desk_staff`-in-policy targeted re-scan
- **Why queued:** Session B's structural-drift spot-check found `invoice_requests::frontdesk_invoice_requests` policy USING-clause was rewritten on staging to use `clinic_memberships` instead of `front_desk_staff`, file body never updated. Pattern is likely systematic across `supabase/migrations/04*.sql`.
- **Trigger:** Phase F resumption (low risk; can run anytime after Phase D #1.5).
- **Estimated scope:** m
- **Cross-refs:** Session B recommendation #2 in `audits/database-audit/structural-drift-spotcheck.md`

### Workstream: Phase F Task 6 — resolve mig 068 status
- **Why queued:** No tracking row; project memory says apply was aborted; superseded by 092-097. Decide: delete from repo, or annotate `.RETIRED` header.
- **Trigger:** Phase F resumption.
- **Estimated scope:** s
- **Cross-refs:** `supabase/migrations/068_cleanup_legacy_policies.sql`

### Workstream: Phase F Task 7 — resolve mig 099 status
- **Why queued:** RPCs target the now-gone `patients.patient_code` column (R7). Dead code.
- **Trigger:** Phase F resumption.
- **Estimated scope:** s
- **Note:** May already be resolved — commit `6adeffa` on 2026-05-04 reads "chore: delete mig 099 (patient_code RPCs) — retired per R7". **Verify before re-doing the work.**
- **Cross-refs:** `supabase/migrations/099_patient_code_rpcs.sql`

### Workstream: Phase F Task 8 — `SET search_path` audit on RLS helpers
- **Why queued:** Defense-in-depth hardening pass before launch. Confirm every `CREATE OR REPLACE FUNCTION` touching RLS-relevant authorization has `SET search_path = public, pg_temp`.
- **Trigger:** Pre-launch hardening (not blocking; queued post-Phase-F-resume).
- **Estimated scope:** s
- **Cross-refs:** mig 092 #1–#4 (helpers), mig 094a `user_has_clinic_path_to_gp`, privacy-code SECURITY DEFINER funcs in mig 087; output is a one-pass enumeration table per `PROGRAM_STATE.md` § Phase F #8

### Workstream: Phase F Task 9 — EXTRA_ON_STAGING reconciliation tooling
- **Why queued:** Tooling pass for `audits/database-audit/AUDIT_FINAL.md` narrative completeness. Confirm policy-count shrinkage from 136 → ~122 EXTRA via migration-tree CREATE POLICY parser + `pg_policies` diff. Same reconciliation for functions (9 → 3) and tables (5 → 0).
- **Trigger:** After Phase F closes; absolute counts (Q1–Q6a per runbook v2 Step 6) already confirm correct state.
- **Estimated scope:** m
- **Cross-refs:** runbook v2 Step 6 outputs; `audits/database-audit/migration-claims-vs-reality.md`

### Workstream: Phase F Task 16 (planned, P1) — admin-scope reconciliation
- **Why queued:** Pushback 2 from `audits/discipline-cleanup/inventory-2026-05-04.md`: ~135 distinct unregistered admin scopes use `console.warn` only at runtime (D-008's admin-client audit trail is "mostly aspirational at current state"). Decide: tighten validation to throw, expand allow-list, or revisit the scope-tracking pattern entirely.
- **Trigger:** Add to PROGRAM_STATE.md as Task 10 (or renumber); then Phase F resumption.
- **Estimated scope:** m–l
- **Cross-refs:** `audits/discipline-cleanup/inventory-2026-05-04.md` § "Pushback 2"; D-008 in DECISIONS_LOG.md (may need amendment); `auto-renew-on-visit-gpid-lookup` admin scope mismatch in `checkin/handler.ts` is a reference example

### Workstream: Phase F Task 17 (planned, P3) — en.ts under-population for Build 05 strings
- **Why queued:** Q9 ruling deferred per D-003 Arabic-first; en.ts mirroring is content authoring, not discipline cleanup. Pre-defer verification still required: confirm components don't import en.ts directly.
- **Trigger:** Add to PROGRAM_STATE.md; pre-launch i18n pass.
- **Estimated scope:** s
- **Cross-refs:** `audits/discipline-cleanup/inventory-2026-05-04.md` § "Q9 surfacing"

---

## Blocked workstreams (started, then blocked)

None currently — Phase D #1.5 was queued but is now classified as Active above (it has not been started yet, but it is the highest-priority workstream and is unblocked for pickup).

---

## Completed workstreams (chronological)

- **2026-04-30:** Patient identity Builds 02–03 — global_patients + patient_clinic_records foundation; mig 071–082 applied to staging across multiple commits ending with 25/25 + 23/23 validation outcomes.
- **2026-05-01 → 2026-05-02:** Build 04 privacy code feature + sharing data layer foundation. Commit `f61356f` (2026-05-04 UTC by author timestamp; Mo's narrative dates the work 5/1–5/2). mig 083–088 covered.
- **2026-05-02 → 2026-05-03:** Foundation Audit Sessions A / B / C — claims-vs-reality audit, structural drift spot-check, forensic-fix authoring + apply. Migs 100–106 applied to staging. Commit `797a5c3` (foundation audit complete + forensic fixes ready) followed by `23229f8` (forensic apply complete + Phase D queued).
- **2026-05-04:** Build 05 patient sharing lifecycle — initiate / revoke / extend / expire. Commit `61f8752`.
- **2026-05-04:** Per-app TypeScript path aliases — `@patient/*` and `@clinic/*` retire shared `@/*`. Codified by D-065. Commit `bb50305`. Empirical Lesson #14 captures the trap.
- **2026-05-04 (later, by author timestamp = 2026-05-07 UTC):** Phase 5 deep audit reconciliation — ARCHITECTURE.md / DECISIONS_LOG.md / PRODUCT_SPEC.md brought current with shipped reality (Builds 02–05); Empirical Lessons #13 and #16 codified. Commit `19fb148`.
- **2026-05-04 (latest, commit `6934db3`):** Audit corpus artifacts tracked in git — finalizes the audit detour. HEAD as of this STATE_OF_WORK setup.
- **2026-05-06:** Phase D #1.5 matrix reconstruction. **Outcome:** 177/177 PASS at `run_no = 1.5`, fail = 0 across all 24 tables. Push gate to `origin/main` released. **Shipped:** mig 107 (`run_no INTEGER → NUMERIC` + `source_file TEXT` + `rls_test_record(...)` re-creation) + `audits/rls-test-matrix-reconstructed.sql` (executable matrix; per-table DO blocks; tuple loops; SET-LOCAL-ROLE harness pattern). **Comparison vs run #1:** one row diverges, `audit_events.S6` count 8 → 10, attributed to seed-cycle accumulation of `entity_type='patient_clinic_record'` audit events not cleaned by `rls_test_teardown()`; outcomes match (SUCCESS=SUCCESS); NOT an RLS regression. **Architectural ruling:** D-074 (the matrix is the canonical RLS regression artifact for the hybrid 3-DEFINER + 2-INVOKER mode going forward; future RLS-touching changes re-run it before push). **Files changed:** `supabase/migrations/107_alter_rls_test_results_run_no_to_numeric.sql` + `.rollback.sql`, `audits/rls-test-matrix-reconstructed.sql`, `audits/STATE_OF_WORK.md`, `ARCHITECTURE.md` (§8.6 timeline + Database row + §12 regression coverage paragraph), `DECISIONS_LOG.md` (D-074).
- **2026-05-07:** Empirical Lesson #14 amendment — three-level path alias requirement. **Trigger:** CI run 25475031898 failed with opaque `Process completed with exit code 1` because the patient-app build's `@patient/*` imports weren't resolving at the webpack level — Next 14.2.x's webpack resolver does not always honor tsconfig path aliases for cross-segment imports inside an app. **Operational fix already shipped:** commit `9774252` (CI build-log capture + per-app webpack alias additions in both `apps/patient/next.config.js` and `apps/clinic/next.config.js`). **This session amends doc text to reflect three-level reality:** Lesson #14 retitled to "THREE levels" with new "Empirical proof addendum (CI run 25475031898, 2026-05-07)" paragraph + rule #2 extended in-place; ARCH §2 "Path alias mechanics" paragraph rewritten as 3-level enumeration with CI run + commit `9774252` references; D-065 received an `> **Amendment 2026-05-07 — third level required (next.config.js webpack alias)**` blockquote subsection after Outcome (D-004/D-005/D-008 pattern; original two-level Decision body preserved as historical record, amended standing rule supersedes). **Scope decision:** Option (c) per Lesson #13 lockstep discipline — half-maintained docs are worse than no docs. **Files changed:** `audits/EXECUTION_PROMPTS.md`, `ARCHITECTURE.md` §2, `DECISIONS_LOG.md` D-065, `audits/STATE_OF_WORK.md`. **Last commit:** 134e272. **NOTE (added 2026-05-07 follow-up):** The empirical claim in this entry — that `9774252` is the operational fix for the original failure — is contradicted by run 25535878629's build-log artifact (see entry below). Lesson #14 / ARCH §2 / D-065 amendments retain validity as a forward-looking discipline rule (declaring webpack aliases at the third level remains correct best practice), but their cited empirical justification (CI run 25475031898) was probably the same TypeScript route-handler-contract error misdiagnosed as a webpack-alias issue. A second amendment may be warranted; out of scope for the current investigation workstream — flagged for Mo's follow-up ruling.

- **2026-05-07 (later, same day):** CI run 25535878629 root-cause investigation + fix. **Trigger:** Mo reported run 25535878629 failed; same opaque exit-code-1 pattern that prompted commit `9774252`. **Investigation surfaced a broader pattern** — six consecutive failed CI runs (115–120) since commit `19fb148`; last green = `778467a` (run 114, 2026-04-27); every red run failed at the same step. **Root cause** (from build-log artifact uploaded by Mo mid-session): `packages/shared/lib/api/handlers/patient/sharing/handler.ts` line 27 declared `export async function GET(request?: Request)`. The optional `?` makes the parameter type `Request | undefined`, which Next.js's route-handler type contract rejects (it requires exactly `NextRequest | Request`). This was caught by Next at build time, NOT by `tsc --noEmit` (which is why pre-push tsc + the Lint-and-Type-Check job both pass clean — Next's route-handler contract is enforced separately, only at `next build` time). **Failure class B (TypeScript), not Class A (webpack).** **Fix:** removed the `?` — `request: Request` non-optional. Pattern matches the `DELETE` handler on line 139 of the same file. Single-character source change; only callsite is the re-export in `apps/patient/app/api/patient/sharing/route.ts` which preserves the type. **Verification:** all three tsc gates pass clean post-fix (root + per-app patient + per-app clinic); **CI run 25539467112 against `80ee270` is green.** **Mid-session correction to the prior 2026-05-07 entry:** `9774252`'s webpack-alias additions in `next.config.js` were unrelated to the failure mode; the doc amendment in `134e272` (Lesson #14 / ARCH §2 / D-065) is built on a misdiagnosis. **Resolution:** Mo accepted reframing as a follow-on cowork session (see next entry: "CI fix-attribution doc reconciliation + Lesson #17"). **Files changed (this session):** `packages/shared/lib/api/handlers/patient/sharing/handler.ts` (one-character fix), `audits/STATE_OF_WORK.md`. **Last commit:** `80ee270`.

- **2026-05-07 (later still, same day):** CI fix-attribution doc reconciliation + Lesson #17 codification. **Trigger:** the `80ee270` workstream above flagged that the Lesson #14 / ARCH §2 / D-065 amendments shipped in commit `134e272` miscredited `9774252`'s webpack-alias additions as the operational fix for CI run 25475031898 — empirically wrong, since runs 118 (`aa2b991`), 119 (`134e272`), and 120 (`f766a05`) all failed post-`9774252`. **Reframe approach:** annotation, not rewrite — Lesson #14, ARCH §2, and D-065 each receive a sympathetic correction paragraph immediately after the empirically-wrong claim, leaving the existing content intact as a record of what was believed. The path-alias three-level rule itself stands as defensible forward-looking discipline; only the cited empirical justification needed correction. `9774252` is reframed as what it actually was: (a) a build-log-capture infrastructure commit that enabled diagnosis six runs later — load-bearing operational discipline, and (b) preventive third-declaration-site webpack aliases — defensible discipline in their own right but not the active bug fix. **Lesson #17 codified** in `audits/EXECUTION_PROMPTS.md` between Lesson #16 and the prompt-tracker block: title is "`tsc --noEmit` does not enforce Next.js route-handler type contracts." Standing rule: route handlers and the handlers they re-export must accept their first arg non-optionally as `request: Request | NextRequest`. Reviewers reject any `?` on the first parameter. Body logic that conditionally uses `request` narrows inside the function. Phase F follow-up flagged (out of scope): consider adding `next build` to the pre-push gate or as a fast-fail CI step. **Files changed (this session):** `audits/EXECUTION_PROMPTS.md` (Lesson #14 receives "Correction 2026-05-07 (later, post-investigation)" paragraph + new Lesson #17 added after Lesson #16), `ARCHITECTURE.md` §2 (correction blockquote appended), `DECISIONS_LOG.md` D-065 (second amendment blockquote — "Amendment 2026-05-07 (later) — empirical-justification correction"; footer updated), `audits/STATE_OF_WORK.md` (this entry, header, methodology rules section). **Last commit:** `d8daa60`.
- **2026-05-07:** Phase F Task 18 — Fix `rls_test_teardown()` audit_events cleanup. **Outcome:** mig 108 applied to staging; matrix re-run at `run_no = 1.6` produces **177/177 PASS, fail=0 across all 24 tables**, `audit_events.S6` row count stable at 1 per cycle (was 8 in run #1, 10 in run #1.5 due to the unfixed teardown). **Shipped:** mig 108 (forward + rollback) extending `audit_events` DELETE clause with `resolved_global_patient_id = ANY(test_gps)` + defensive `entity_type='patient_clinic_record' AND metadata->>'global_patient_id' = ANY(test_gps)` (the latter is functionally redundant since `resolved_global_patient_id` is a GENERATED ALWAYS column, but kept for readability). **Investigation findings:** (a) live `rls_test_teardown()` body on staging is a SUPERSET of `audits/rls-test-seed.sql` (extra ops/comm + clinical-data cleanup blocks added in Sessions 11 + 14a — the seed.sql file is out of date relative to staging, Lesson #7 in action; mig 108 redefines authoritatively from the live body); (b) `audit_events.resolved_global_patient_id` is a GENERATED ALWAYS column (computed from `metadata->>'global_patient_id'` or `entity_id` when `entity_type='global_patients'`), not a separate resolver-trigger output — so smoke probe omits it from the INSERT and lets the generated expression compute it; (c) only one audit-emitting trigger surfaced on seeded tables (`tg_audit_pcr_insert_trg` on `patient_clinic_records`, mig 088) — fix was bounded to a single audit_events DELETE clause extension. **Files changed:** `supabase/migrations/108_fix_rls_test_teardown_audit_events.sql` + `.rollback.sql`, `audits/rls-test-matrix-reconstructed.sql` (run_no 1.5→1.6 in 24 DO blocks + Section 0; audit_events.S6 dynamic→hardcoded 1; Section 25 validation queries updated; new D-074 amendment commentary in Section 19), `ARCHITECTURE.md` (§3 row count 110→111, highest base 107→108; §8.6 mig 108 row), `DECISIONS_LOG.md` (D-074 amendment blockquote), `audits/STATE_OF_WORK.md`, `audits/PROGRAM_STATE.md` (Task 18 marked Done).

---

## Phase F follow-up tasks (operational backlog)

(Mirror of `audits/PROGRAM_STATE.md` Phase F task list — SUMMARY only; PROGRAM_STATE is the canonical record. Rebuild this section from PROGRAM_STATE at every session start. Currently 9 canonical items + 1 done (Task 18) + 2 planned-not-yet-canonical items; see "Pending workstreams" above for one-liners + triggers.)

1. Doctor-fees callsite cleanup + mig 022 archive (R1) — **s**
2. patient_code retirement code deletion (R7) — **s**
3. `patients.email` exposure decision (R4) — **s decision / m impl**
4. `audit_log` vs `audit_events` consolidation (R5) — **l**, Year-2 tech debt
5. `front_desk_staff`-in-policy targeted re-scan (Session B rec #2) — **m**
6. Resolve mig 068 status — **s**
7. Resolve mig 099 status — **s** (likely already done in commit `6adeffa`; verify)
8. `SET search_path` audit on RLS helpers — **s**, pre-launch hardening
9. EXTRA_ON_STAGING reconciliation tooling — **m**, post-Phase-F
10. Task 18 — Fix `rls_test_teardown()` audit_events cleanup — **✅ DONE 2026-05-07** (mig 108; matrix re-run at run_no=1.6 = 177/177 PASS; audit_events.S6 stable at 1)
- **Task 16 (planned, P1):** admin-scope reconciliation (~135 unregistered scopes vs ALLOWED_ADMIN_SCOPES) — **m–l**
- **Task 17 (planned, P3):** en.ts under-population for Build 05 strings — **s**, pre-launch i18n

---

## Open strategic decisions

(Decisions that need to be made but aren't time-sensitive. Promoted to active workstreams when a session takes them on.)

- **WhatsApp delivery:** PRODUCT_SPEC mentions WhatsApp 6 times; today implementation is Twilio SMS only with a `sendWhatsApp()` stub at `packages/shared/lib/sms/twilio-client.ts:60-62`. Decide: update code (integrate 360dialog/WATI) or update spec (SMS-first acceptable for v1). Source: `audits/01-feature-audit.md` C3.
- **Drug interaction rules:** PRODUCT_SPEC promises ~500 critical drug interactions as a P0 hook. Current state per `audits/01-feature-audit.md` is "dramatically thinner than PRODUCT_SPEC describes." Decide: build internally, license a database, or partner.
- **E-Fatorah / Egyptian Tax Authority e-receipt integration:** Scope and timing not yet decided. No callsite audit performed; surfaced here for tracking.
- **Dependabot vulnerabilities (1 critical + 41 others):** Surfaced in the 2026-05-04 push (post-`accc580` package-lock restore). Triage and remediation plan needed before launch hardening.

---

## Methodology rules in force

(Compressed reference list of Empirical Lessons currently active. Cross-references `audits/EXECUTION_PROMPTS.md` § "Empirical lessons" for the full body.)

- **Lesson #1 (amended 2026-04-30 → 2026-05-03):** RLS helpers default to SECURITY DEFINER; INVOKER allowed only when internal queries provably do NOT trigger RLS recursion through the helper itself. Current locked set: 3 DEFINER + 2 INVOKER hybrid (`is_clinic_member` / `can_view_patient_data_at_clinic` / `user_has_clinic_path_to_gp` DEFINER; `can_clinic_access_global_patient` / `can_patient_access_global_patient` INVOKER post-mig-106). See D-064.
- **Lesson #2:** Smoke-probe assertion in every RLS migration — `SET LOCAL ROLE 'authenticated'` + a real SELECT/INSERT inside the migration's transaction. Structure-only assertions cannot catch query-time recursion.
- **Lesson #3:** Test harness pattern — `SET LOCAL ROLE 'authenticated'` as a separate statement, NOT inside a WITH clause's `set_config(...)`. Inline form leaves the plan built under session_user's BYPASSRLS attribute.
- **Lesson #4:** Prototype-before-author for any RLS work touching cross-table predicates. A 10-minute harness probe is cheaper than authoring scenarios against a recursion-broken policy.
- **Lesson #5:** Cross-clinic write-asymmetry probe technique — patient with cross-clinic PCR visibility can be used to bypass write triggers and prove RESTRICTIVE INSERT policies hold in isolation.
- **Lesson #6 (Phase F session 16, 2026-05-02):** Per-callsite re-reading at Phase F start. Triage tags are sorting hints, not decisions. Re-read each callsite to confirm what it does AND whether it predates relevant locked decisions before authoring RPC / MIGRATE-TO-USER / KEEP-ADMIN.
- **Lesson #7 (Foundation Audit Session A, 2026-05-03):** Verify schema state independently of the migration tree. Schema is ground truth; migration files are intent. When they disagree, staging wins by default until a decision is made.
- **Lesson #8 (Sessions A + C, 2026-05-03):** All schema changes go through committed migration files. No dashboard SQL editor applies. No `supabase db push` of uncommitted SQL. No `supabase migration repair --status applied` without a corresponding committed file.
- **Lesson #9 (Session C apply phase, 2026-05-03):** Audit the temporal sequence of dashboard SQL applies, not just current state. Before re-running recovered SQL, enumerate every column / function / table it references and confirm shape against current `information_schema` / `pg_catalog`. Out-of-band drift gets logged in `audits/database-audit/out-of-band-post-2026-04-08.md`.
- **Lesson #10 (Session C apply phase, 2026-05-03):** Use programmatic enumeration for caller surfaces, not manual audit-doc reading. The verification SQL belongs in the verification doc verbatim, with row count.
- **Lesson #11 (Session C apply phase, 2026-05-03):** MCP `apply_migration` and CLI `supabase migration up` have different tracking-row semantics. CLI skips already-tracked versions silently; MCP always creates a new tracking row. Pick the right tool for the goal — alignment-without-state-change with a committed file warrants neither.
- **Lesson #12 (Session C + Phase D #1.5 pre-flight, 2026-05-03):** Test scaffolding must be persisted as durable executable code, not ephemeral interactive SQL. `_test_results` outcomes without committed source SQL are a regression-baseline anti-pattern. Add `source_file TEXT` to outcomes tables.
- **Lesson #13 (Doc reconciliation pass, 2026-05-04):** Source-of-truth documentation must be maintained in lockstep with the code and schema it describes. Half-maintained docs are worse than no docs. Every architecturally-significant change requires a corresponding doc update in the same commit (or a paired same-session commit). ARCHITECTURE / DECISIONS_LOG / PRODUCT_SPEC are tracked in git from day one.
- **Lesson #14 (Discipline cleanup, 2026-05-04 — amended 2026-05-07):** Per-app TypeScript path aliases use a per-app prefix (`@patient/*`, `@clinic/*`) and are declared at all three levels: root `tsconfig.json` (pre-push tsc gate), per-app `tsconfig.json` (Next.js dev/build), and per-app `next.config.js` `config.resolve.alias` (webpack at build time — Next 14.2.x's resolver doesn't always honor tsconfig paths for cross-segment imports inside an app, surfaced by CI run 25475031898; operational fix in commit `9774252`). Shared `@/*` across apps is BANNED. Codified by D-065 (with 2026-05-07 amendment subsection).
- **Lesson #15 (reserved):** Empty slot — preserved so ARCHITECTURE.md / DECISIONS_LOG.md forward references remain valid. Reassign or delete when the next lesson is authored.
- **Lesson #16 (Doc verification sweep, 2026-05-04):** Documentation claims about the system require verification against the system, not against project memory or prior session drafts. Every doc-touching cowork session ends with a verification sweep that produces a report-shaped artifact (see `doc-verification-sweep-2026-05-04.md`). Constants, counts, names, paths, security parameters, hashes, dates — all verified against ground truth.
- **Lesson #17 (CI fix-attribution reconciliation, 2026-05-07):** `tsc --noEmit` does not enforce Next.js route-handler type contracts; only `next build` does. Route handlers under `app/api/**/route.ts` and the handlers they re-export from `packages/shared/lib/api/handlers/**` must accept their first parameter non-optionally as `request: Request` or `request: NextRequest` — never `request?: Request` (the `?` makes the type `Request | undefined`, which Next's contract rejects at build time). Reviewers reject any `?` on a route handler's first param; body logic that conditionally uses `request` narrows inside the function. Empirical proof: commits `61f8752` → `80ee270` bracket six consecutive failed CI Build Patient App runs (115–120) where pre-push tsc + Lint-and-Type-Check both passed clean. Phase F follow-up flagged: consider `next build` in the pre-push gate or as a fast-fail CI step.

---

## Session protocol (load every session start)

1. Read this `STATE_OF_WORK.md` end-to-end before any work.
2. Pick up the active workstream's Next Action OR start the highest-priority pending workstream.
3. Update `STATE_OF_WORK.md` "Currently doing" before starting work.
4. At session end (whether work is done or paused):
   - Update active workstream "Status", "Currently doing", "Next action", "Last commit".
   - Update "Last updated" + "Last session" header.
   - Update the 3 core docs (`ARCHITECTURE.md`, `DECISIONS_LOG.md`, `PRODUCT_SPEC.md`) for any architectural / decision / product-scope changes shipped this session — even if a single sentence.
   - Commit `STATE_OF_WORK.md` + the 3 core docs together.
5. Surface session-end report referencing `STATE_OF_WORK.md`, not project memory.
