# MedAssist — State of Work
> Living document. Updated at the START and END of every cowork session.
> Source of truth for "what are we working on, what's done, what's next, what's blocked."

**Last updated:** 2026-05-07T04:11Z (cowork session — STATE_OF_WORK setup)
**Last session:** Setup of this living state-of-work document; no Phase D / Phase F / build work in this session.

---

## Active workstreams

(One section per workstream currently in flight. Workstream = bounded body of work
with a defined end state. When a workstream is fully done, MOVE its section to
"Completed workstreams" below; do not delete.)

### Workstream: Phase D #1.5 matrix reconstruction
- **Status:** Not started (this session is setup-only — reconstruction begins next session)
- **Owner session:** TBD (next cowork session)
- **Started:** Queued 2026-05-03 at end of forensic apply window; reconstruction not yet begun
- **Goal:** Produce an executable RLS test matrix at `audits/rls-test-matrix-reconstructed.sql` that reproduces Phase D run #1's 177 PASS scenarios, then execute against staging as `run_no = 1.5` and confirm 177/177 outcome agreement before pushing the audit-detour commit chain.
- **Done when:**
  - Reconstructed `.sql` file is committed to repo with header documenting scenario semantics inherited from the scaffold.
  - `_rls_test_results WHERE run_no = 1.5` contains 177 rows.
  - Comparison query against `run_no = 1` returns zero divergent rows (per `PHASE_D_RECONSTRUCTION_HANDOFF.md` § "Comparison query").
  - Push gate to `origin/main` released; Phase F Step 2 cleared to resume.
- **Currently doing:** Nothing — pending session pickup. Entry point is `audits/database-audit/PHASE_D_RECONSTRUCTION_HANDOFF.md` per the handoff doc's "Last word" instruction.
- **Last commit:** `23229f8` (2026-05-03) feat(audit): forensic apply complete on staging + Phase D matrix reconstruction queued
- **Next action:** Open fresh cowork session. Read `audits/database-audit/PHASE_D_RECONSTRUCTION_HANDOFF.md` end-to-end. Reconstruct matrix per the templating theory (per-table DO-block loop over `(persona, scenario, filter, expected_outcome)` tuples). Refresh seed via `SELECT public.rls_test_teardown(); SELECT public.rls_test_seed();` then execute as `run_no = 1.5`.
- **Blockers:** None — reconstruction inputs (scaffold, seed file, run #1 results, schema snapshot) are all on disk / on staging.
- **Cross-refs:**
  - `audits/database-audit/PHASE_D_RECONSTRUCTION_HANDOFF.md` (entry point)
  - `audits/rls-test-matrix.sql` (scaffold — scenario semantics S1–S10 at lines 97–130; tables-to-cover at lines 165–204)
  - `audits/rls-test-seed.sql` (stable persona UUIDs starting at line 79)
  - `audits/database-audit/staging-schema-2026-05-03.sql` (per-table column shapes — note: pre-mig-104/105 snapshot)
  - `audits/database-audit/apply-runbook-v2.md` § Step 7 (failure-class triage)
  - `audits/PROGRAM_STATE.md` § "Current Blocker"
  - Empirical Lesson #12 (test scaffolding must be persisted as durable executable code) — root cause of the reconstruction need
  - D-064 (hybrid 3 DEFINER + 2 INVOKER RLS architecture) — the behavioral change mig 106 introduced that requires regression coverage

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

---

## Phase F follow-up tasks (operational backlog)

(Mirror of `audits/PROGRAM_STATE.md` Phase F task list — SUMMARY only; PROGRAM_STATE is the canonical record. Rebuild this section from PROGRAM_STATE at every session start. Currently 9 canonical items + 2 planned-not-yet-canonical items; see "Pending workstreams" above for one-liners + triggers.)

1. Doctor-fees callsite cleanup + mig 022 archive (R1) — **s**
2. patient_code retirement code deletion (R7) — **s**
3. `patients.email` exposure decision (R4) — **s decision / m impl**
4. `audit_log` vs `audit_events` consolidation (R5) — **l**, Year-2 tech debt
5. `front_desk_staff`-in-policy targeted re-scan (Session B rec #2) — **m**
6. Resolve mig 068 status — **s**
7. Resolve mig 099 status — **s** (likely already done in commit `6adeffa`; verify)
8. `SET search_path` audit on RLS helpers — **s**, pre-launch hardening
9. EXTRA_ON_STAGING reconciliation tooling — **m**, post-Phase-F
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
- **Lesson #14 (Discipline cleanup, 2026-05-04):** Per-app TypeScript path aliases use a per-app prefix (`@patient/*`, `@clinic/*`) and are declared at BOTH root tsconfig.json AND per-app tsconfig.json. Shared `@/*` across apps is BANNED. Codified by D-065.
- **Lesson #15 (reserved):** Empty slot — preserved so ARCHITECTURE.md / DECISIONS_LOG.md forward references remain valid. Reassign or delete when the next lesson is authored.
- **Lesson #16 (Doc verification sweep, 2026-05-04):** Documentation claims about the system require verification against the system, not against project memory or prior session drafts. Every doc-touching cowork session ends with a verification sweep that produces a report-shaped artifact (see `doc-verification-sweep-2026-05-04.md`). Constants, counts, names, paths, security parameters, hashes, dates — all verified against ground truth.

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
