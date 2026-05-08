# MedAssist — Patient Identity Network: Cowork Prompt Set

> **Canonical execution document for the patient identity network refactor.**
> Save this file to the project (recommended path: `audits/EXECUTION_PROMPTS.md`).
> Each prompt is a self-contained cowork session. Run them in sequence.
> Mo reviews each output before the next runs. No auto-chaining.

---

## Operating principles

1. **One prompt per cowork session.** No parallelism.
2. **Sequential, not chained.** Mo reviews every audit/build output in the war-room thread before the next prompt runs.
3. **No-Orphan Rule.** No code commits without a complete vertical slice (DB schema + RLS + data layer function + API endpoint + UI surface + i18n strings + tests). Any layer intentionally deferred must be tracked in `audits/orphan-ledger.md` with a Closing Prompt.
4. **Page Inventory required for any UI change.** Format: Feature | Page Path | URL Route | Component File | Tested On.
5. **Final E2E test (Prompt 11) FAILS if Orphan Ledger has unjustified open items.**

---

## Locked design decisions (memory snapshot, 2026-04-26)

- Two-layer access: `global_patients` (keyed by phone, UNIQUE E.164) + `patient_clinic_records` (per-clinic scoped data).
- Directional consent: Clinic X with code sees Clinic Y's data; Y without code does NOT see X's. Permission is property of (data row, requesting clinic).
- Auto-share with self: clinic always sees its own writes without consent row.
- Privacy code: 6-char alphanumeric, regeneratable, rate-limit 5 attempts/hr/clinic, 24h lockout, SMS notify on lockout.
- 90-day default share, auto-renew on next visit (extending to NOW+90d, never shortening), patient-extendable to 1y or permanent, hard-revocable any time.
- Revoke prevents future views; past views immutable; clinic's own notes stay.
- Uniform "enter code" UI regardless of patient existence (no privacy leak via search). Uniform timing too.
- SMS code share with explicit Egyptian Arabic consent language naming clinic + doctor; 5-min code expiry.
- Phone-only identity (no national ID — sensitive in Egypt). Dependent accounts via caregiver linkage.
- Ghost Mode DELETED. Anonymous visits repurposed for AI training pipeline.
- AI training data: de-identified, k-anonymous (k≥5), patient consent toggle default ON, no patient identity fields.
- Patient app moves to Phase 1: records read-only + consent UI + Rx PDFs + basic messaging.
- Pharmacy/lab schema in v1 (UI deferred to Phase 2/3).

## Locked decisions from Prompt 0 audit review (2026-04-28)

- **Patient app architecture confirmed.** `apps/patient/` stays a separate Next.js app (NOT a route group inside `apps/clinic/`). Common interactions (auth helpers, data layer modules, types, design tokens, RTL utilities) stay in `packages/shared/` and a shared UI package. Patient-app-only components live in `apps/patient/`. Doctor/frontdesk components stay in `packages/ui-clinic/`. This decision becomes D-XXX in DECISIONS_LOG.md.
- **Audit logging hardened to synchronous + transactional** for every privacy-sensitive event (CODE_ATTEMPT, SHARE_PATIENT, REVOKE_SHARE, VIEW_PATIENT, SMS_CONSENT_SENT). `logAuditEvent` must be `await`ed at the call site, must throw on failure, and the parent transaction must roll back if the audit write fails. Fire-and-forget is BANNED for these events. Implemented in Prompt 5; backported to existing call sites flagged by audit (`share-patient/handler.ts:41`, `patient/sharing/handler.ts:87`).
- **`patients.clinic_id` retention plan.** Keep `patients.clinic_id` populated through Prompt 6. New Prompt 6.5 (Legacy Cleanup) drops it after RLS rewrite is verified safe. This avoids forcing a data-layer rewrite during the riskiest phase.

## Audit-driven scope refinements

- `patient_visibility` (mig 020) is the right philosophical structure (mode + consent type + expiry) but wrong scope (intra-clinic doctor↔doctor, not inter-clinic clinic↔clinic). Migration in Prompt 5 EXTENDS this table or migrates its rows; does NOT throw it away.
- `patients.unique_id` (`MED-${nanoid(6).toUpperCase()}`) is already a privacy-code-shaped artifact with timing-safe compare. Prompt 4 ENHANCES it (rate limit, lockout, regeneration, audit, global-scope) rather than building from scratch.
- `patient_consent_grants` (existing — messaging + history-sharing consent) needs explicit decision in Prompt 1: collapse into `patient_data_shares` or coexist. Default: coexist initially, evaluate collapse after Prompt 6.
- `apps/patient/` route paths corrected throughout: `apps/patient/app/(patient)/patient/<page>/page.tsx` is the canonical pattern.

## Locked numerics (2026-04-28, post-Prompt-1-v2)

These are the canonical values for any prompt that touches privacy code, SMS share, or share expiry behavior. No further open questions — these are decided.

| Parameter | Value | Reasoning |
|---|---|---|
| Privacy code length | 6 chars | ~30 bits of entropy; with rate limits, brute-force infeasible |
| Privacy code alphabet | base32 `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` | 32 chars, ambiguous 0/1/I/O removed |
| Privacy code RNG | `gen_random_bytes()` from pgcrypto | NEVER `random()` — that's a deterministic PRNG |
| Bcrypt cost factor | 12 | ~400ms verify, 13y offline brute-force, OWASP standard |
| Per-clinic rate limit | 5 attempts/hour/(patient, clinic) | 1h lockout, NO SMS notification |
| Per-code lockout | 5 failures across all clinics → 24h lockout | SMS notification fires |
| SMS-consent token TTL | 5 minutes | Accommodates Egyptian SMS delays + older patients |
| Default share expiry | 90 days | Auto-renews on next visit; patient can extend to 1y or permanent |
| Referral share expiry | 90 days | Same default as privacy-code-initiated shares |
| `check_phone_uniform` min response time | 50ms | Pad-to-uniform timing prevents existence detection via timing |
| Code distribution test threshold | ±5% of uniform per position | Catches biased generators in 10,000-code sample |
| Latency parity test threshold | <5ms p95 difference | Verifies uniform timing for `check_phone_uniform` |

---

## Empirical lessons (Prompt 6 onward)

Standing rules promoted from cowork sessions. Each was learned the hard way and applies to every prompt that follows.

Lessons 1–5 are documented in full in `audits/patient-identity-build-06-results.md` § 3.1 with the recursion proof and harness debugging trace that produced them. Summary:

1. **All helpers in RLS predicates are SECURITY DEFINER, no exceptions.** SECURITY INVOKER helpers that join across RLS-protected tables can deadlock on cross-table EXISTS recursion (Postgres 42P17). DEFINER bypasses RLS during the helper's internal joins, breaking the cycle.

   > **Amendment 2026-04-30 → 2026-05-03**: The original "all DEFINER" rule is amended to **3 DEFINER + 2 INVOKER** based on the Prompt 6 RLS rewrite (mig 092-097 + 094a) and forensic mig 106. INVOKER is allowed for helpers whose internal queries provably do NOT trigger RLS recursion through the helper itself; DEFINER remains the default; burden of proof is on the engineer proposing INVOKER. Current helper set: `is_clinic_member` (DEFINER), `can_view_patient_data_at_clinic` (DEFINER), `user_has_clinic_path_to_gp` (DEFINER post-094a), `can_clinic_access_global_patient` (INVOKER post-mig-106), `can_patient_access_global_patient` (INVOKER post-mig-106). Helpers #2 and #3 drifted to DEFINER on staging between mig 092 authoring and 2026-05-03; mig 106 restored them to INVOKER per the original architectural intent. The drift detection itself is what justifies the amendment — uniform rules don't account for cases where the rule is over-conservative. See D-064.
2. **Smoke-probe assertion in every RLS migration.** Post-condition runs `SET LOCAL ROLE 'authenticated'` + a real SELECT/INSERT against each affected table inside the migration's transaction. Structure-only assertions (policy exists, permissive flag set) cannot catch query-time recursion.
3. **Test harness pattern: `SET LOCAL ROLE 'authenticated'` as a separate statement.** Inline `set_config('role', 'authenticated', TRUE)` inside a WITH clause leaves the query plan built under the session_user's BYPASSRLS attribute — the role switch becomes cosmetic and RLS never engages.
4. **Prototype-before-author for any RLS work touching cross-table predicates.** A 10-minute harness probe is cheaper than authoring scenarios against a recursion-broken policy.
5. **Cross-clinic write-asymmetry probe technique.** A patient with cross-clinic PCR visibility can be used to bypass write triggers and prove RESTRICTIVE INSERT policies hold in isolation. Documented in `audits/rls-test-seed.sql` and Phase D session 11 results.

### Lesson 6 (Phase F, session 16, 2026-05-02)

**Per-callsite re-reading at Phase F start.** Triage tags assigned at Phase A may conflate string-similar operations with semantically-different callsites — and may obscure pre-locked-decision security debt that wasn't visible at triage time. Before designing any architectural surface (RPC, MIGRATE-TO-USER conversion), re-read the callsite to confirm what operation it performs AND whether it predates relevant locked decisions. Triage tags are a sorting hint, not the decision.

**Empirical proof (session 16):** of 8 callsites tagged `SECURITY-DEFINER` in `audits/rls-admin-client-triage.md`, per-callsite re-reading found:
- 1 mis-labeled (the `'patient-dedup'` scope arg at `clinical/notes/handler.ts:28` is the TD-008 offline-replay idempotency lookup, not patient deduplication — actually MIGRATE-TO-USER).
- 4 admin-endpoint-only (KEEP-ADMIN; wrapping in SECURITY DEFINER would smooth over deeper architectural problems the global-identity model is supposed to dissolve).
- 1 transitional (dies in Prompt 6.5).
- 2 patient-self ops on `my-code/handler.ts` that surfaced a P1 security issue: `patient_code` was built before the 2026-04-26 locked decisions and contradicts them on RNG (`Math.random` vs `gen_random_bytes`), TTL (indefinite vs 5-min), rate limit (none vs 5/hr), audit (none vs audit-everything-sensitive), and storage (plaintext vs bcrypt). The triage tag had pointed at this callsite as a candidate, but the *reason* it needed RPC treatment wasn't visible until the callsite was read against the locked numerics table.

The cost of the re-read pass was ~60 minutes. The cost of *not* doing it would have been 7 wrong commitments AND a P1 security issue shipping unfixed under a "we knew but didn't fix" sign.

**Apply to every Phase F session.** Before any RPC design, MIGRATE-TO-USER conversion, or KEEP-ADMIN confirmation: read the callsite, identify what it actually does, and check whether any locked decision in this document or in the per-build results docs constrains it.

**Amendment (session 17, 2026-05-02):** This rule extends to verifying assumed file/migration state matches actual repo state before executing on rename/restructure plans. Spec-level shorthands (e.g., "mig 098 = drop legacy") can be misread as file-level facts; verify before rename. Empirical proof (session 17): the session-16 ruling described `098_drop_legacy_policies.sql` as a "designed-but-not-applied artifact" and locked a rename plan around it. Pre-execution `Glob` showed the file had never been written — slot 098 was always empty, "mig 098" was a Prompt 6 spec convention used as planning shorthand. The phantom-mv was caught before any commit because Step 1 began with a state check rather than a state-changing action.

### Lesson 7 (Foundation Audit Session A, 2026-05-03)

**Verify schema state independently of the migration tree. Schema is ground truth, not migration files.**

When the migration tree and the deployed schema diverge — and they will, the moment any DDL is applied outside the migrations CLI — the migration files become a partial description of intent, not an authoritative record of state. A claim in a migration file that table X exists is a hypothesis about staging; it must be verified before being relied on. The same is true for column shapes, function bodies, security_definer flags, RLS policy USING/WITH CHECK clauses, and trigger bindings.

**Empirical proof (Audit Session A + B + C):** Session A's claims-vs-reality audit ran every `CREATE`/`ALTER` statement in `supabase/migrations/` against `information_schema` and `pg_catalog` on staging. Of 831 claims across files 001-098, 76 were MISSING (object absent) and the audit independently surfaced 6 EXTRA tables, 111 EXTRA columns, 136 EXTRA policies, and 9 EXTRA functions on staging — none of which appeared in any committed file. Session B's structural drift spot-check on 15 random MATCH-category claims found 2 of them (13%) had subtle shape divergences not visible at the name level: a `front_desk_staff`-table-based policy USING clause rewritten on staging to use `clinic_memberships`, and a function declared `SECURITY INVOKER` in the file but `SECURITY DEFINER` on the live database. Session C verified the 087 trio's live function bodies via `pg_get_functiondef` against staging and found the file already incorporated 2 hot-patches that had been applied via separate tracking rows — but the only way to know that was to dump the live bodies and diff.

**Apply to every audit, every Phase F session, every restructure plan:**

1. Before claiming "X exists" / "X has shape Y" / "X behaves Z" based on a migration file, query staging via `information_schema`, `pg_catalog.pg_proc`, `pg_policies`, or `pg_get_functiondef` and confirm.
2. When a migration file and staging disagree, **staging wins by default.** Either patch the file forward (the divergence happened on purpose and the file needs to catch up) or patch staging forward (the divergence was a hot-fix that needs to be undone). Never resolve by assuming the file is right.
3. Architectural decisions about staging schema must be backed by a recent schema snapshot, not by reading migration files. The snapshot lives in `audits/database-audit/staging-schema-2026-05-03.sql` (or its successor); refresh whenever the divergence question matters.

The cost of not doing this: Phase F was within one PR of locking RLS policy rewrites against an INVOKER function that was actually DEFINER on staging, which would have made every reference to the helper in the new policies fail differently than the test harness would predict.

### Lesson 8 (Foundation Audit Session A + C, 2026-05-03)

**All schema changes go through committed migration files. No dashboard SQL editor applies. No `supabase db push` of uncommitted SQL.**

Every operational rule that produced the foundation-audit drift surface — 5 unclaimed tables, 9 unclaimed functions, 136 unclaimed policies, 2 tracking rows with no committed file — traces to one root cause: SQL was applied to staging without first being committed as a `.sql` file in `supabase/migrations/`. Sometimes via the dashboard's SQL editor (no tracking row created at all), sometimes via the migrations CLI but with the local file deleted before commit (tracking row created, file lost). Either path leaves staging with state that the repo cannot reproduce.

**Empirical proof:** the entire reason Audit Session C exists is to backfill schema that was applied to staging out-of-band. The two 2026-04-08 RLS hardening fixes were applied via the migrations CLI but never committed; the 5 unclaimed tables were applied via the dashboard SQL editor with no tracking row. Each of these was justifiable in isolation — security pass under time pressure; quick fix during a dev session — but the cumulative effect was a migration tree that no longer described production schema. Audit Session C had to author 6 forensic backfill migrations + 2 in-place file edits to reconcile, which took ~6 hours of work that would not have been needed if every schema change had gone through a committed file from the start.

**Operational rule, codified:**

1. **Every schema change must originate as a `.sql` file in `supabase/migrations/` BEFORE it is applied anywhere.** Author the file, commit it (or at minimum stage it locally with a clear name), then apply via `supabase db push` or `supabase migration up`.
2. **The dashboard SQL editor is read-only for schema operations.** It is acceptable for ad-hoc SELECT, COUNT, and read-only debugging. It is NOT acceptable for `CREATE`, `ALTER`, `DROP`, `INSERT`/`UPDATE`/`DELETE` against schema metadata, `CREATE POLICY`, `CREATE FUNCTION`, `CREATE TRIGGER`, or any operation that mutates the catalog.
3. **No `supabase migration repair --status applied <version>`** without a corresponding committed file at the matching version. If the file is missing, write the file first; only then mark applied.
4. **If an emergency hotfix has to be applied via dashboard** (the rare case where committing-then-deploying is genuinely too slow), the SQL is committed as a forensic backfill migration in the SAME PR as the hotfix, with a header comment recording the dashboard-apply timestamp. No "I'll commit it later." Later doesn't happen.
5. **Audit pre-flight before any release-pace work** — a 30-minute schema-vs-migration-tree comparison surfaces drift before it accumulates. Catching divergence at 1 row is cheap; catching it at 5 tables + 9 functions + 136 policies is what produced this 6-hour reconciliation session.

The cost of not doing this is what Audit Session C just spent its budget undoing. Don't do it again.

### Lesson 9 (Audit Session C apply phase, 2026-05-03)

**Audit the temporal sequence of dashboard SQL applies, not just current state.**

A schema dump captures what's there NOW. It doesn't capture what was there last month and got changed. When backfilling untracked SQL applies (like the 2026-04-08 RLS hardening fixes), verify each referenced object STILL EXISTS in the form the SQL expects. Between the original apply and today, columns can be dropped, policies can be rewritten, and tables can be modified — all silently if the dashboard SQL editor is the apply path. Backfilling original SQL verbatim against drifted state will fail at apply time. Verify schema state at backfill time matches the SQL's expectations BEFORE applying.

**Empirical proof (Audit Session C apply phase, 2026-05-03):** mig 100 application failed with `ERROR: 42703: column "clinic_id" does not exist` on the `front_desk_staff` table. Investigation found:
- The 2026-04-08 SQL (recovered verbatim from `schema_migrations.statements` row 20260408145102 by Session B) referenced `front_desk_staff.clinic_id`, which existed at that time.
- Between 2026-04-08 and 2026-05-03, the column was dropped via untracked dashboard SQL and the dependent policy `Clinic members can view frontdesk staff in same clinic` was simultaneously rewritten to a `clinic_memberships`-mediated form.
- Session B had already flagged the same systematic-rewrite pattern for `invoice_requests::frontdesk_invoice_requests` but hadn't applied that observation to mig 100's inputs pre-apply.

**Fix taken:** edit mig 100 to capture the post-rewrite policy body, document the temporal drift in `audits/database-audit/out-of-band-post-2026-04-08.md`. Re-applied cleanly as a no-op against current state.

**Apply to every backfill of dashboard-applied SQL:**

1. Before re-running any recovered SQL against current staging, enumerate every column / function / table the SQL references and confirm it still exists with the expected shape.
2. The check is mechanical: parse the recovered SQL for object references, compare against `information_schema.columns`, `pg_proc`, `pg_policies`. A mismatch is a STOP signal until the divergence is understood.
3. Capture mismatches in an audit doc (today: `audits/database-audit/preapply-scan-mig100-101-102.md` was the discovery vehicle; `audits/database-audit/out-of-band-post-2026-04-08.md` is the running drift record).

The cost of not doing this: mig 100 failed loudly at apply, which is the good outcome. The bad outcome would have been mig 100 succeeding with a silent semantic divergence (e.g., the policy ran but referenced a column that was logically renamed) — that flavor of bug is much harder to catch.

### Lesson 10 (Audit Session C apply phase, 2026-05-03)

**When verifying caller surface for any RLS helper or shared function, use programmatic enumeration, not manual audit-doc reading.**

Manual enumeration is incomplete by default. SQL enumeration is exhaustive by definition. The two approaches produce the same answer when the manual reviewer happens to look at every relevant migration; the SQL approach produces the same answer regardless. For a helper function used by N policies across M migrations, manual reading scales as O(M × policy density per migration); SQL enumeration scales as O(1 query). Same correctness, different reliability.

**Empirical proof (mig 106 post-apply caller verification, 2026-05-03):** Verifications 2 and Q2 manually enumerated 5 callers of `can_patient_access_global_patient` from mig 094a's body. The post-mig-106 programmatic `pg_policies` query found 6 callers — the 6th one (`audit_events::audit_events_patient_self_select_v2`) was created by mig 096 (a different Phase C migration that the verifications didn't cross-reference). The architectural conclusion (INVOKER is safe) held for the new caller too — same recursion-free chain — but the docs underspecified the impact surface.

**Apply to every helper/shared-function review:**

1. **Always run** `SELECT schemaname, tablename, policyname FROM pg_policies WHERE qual::text ILIKE '%<helper_name>%' OR with_check::text ILIKE '%<helper_name>%'` against current staging.
2. **Always run** `grep -rn "<helper_name>" supabase/migrations/` against the repo (catches callers that exist in committed migrations but haven't been applied yet).
3. The enumeration belongs in the verification doc verbatim, with row count. Future reviewers can re-run and verify the count matches.

A future-proofed verification doc has the SQL query in it. A verification doc that says "I read mig 094a and found these callers" is a snapshot of one reviewer's reading at one moment.

### Lesson 11 (Audit Session C apply phase, 2026-05-03)

**MCP `apply_migration` and CLI `supabase migration up` have different tracking-row semantics. Pick the right tool for the goal.**

CLI's `supabase migration up` checks `schema_migrations` first and skips already-tracked migration versions silently — no new tracking row added. MCP's `apply_migration` always creates a new tracking row regardless of whether the version was previously tracked. Both produce the same live state when the SQL is identical; they produce different tracking-history state.

**Empirical proof (mig 087 in-place re-apply decision, 2026-05-03):** the apply-runbook-v2 Step 4 prescribed an "in-place re-apply" of mig 087 to re-emit the function bodies after the Part 2 pg_sleep edit. Via CLI this would have been a true no-op (already-tracked version, no new row). Via MCP it would have added a 4th 087-related tracking row commemorating an edit timestamp without behavioral change. Step 0b had already verified file/live alignment (`pg_sleep_count = 7` both sides). The re-apply was SKIPPED — alignment-without-state-change doesn't warrant a tracking record, and the file was already committed to git via commit 797a5c3 so future fresh-DB resets via CLI will use the corrected file.

**Decision matrix for tracking-history hygiene:**

| Goal | Live state matches file? | Tool | Action |
|---|---|---|---|
| Apply a state change (file's intent is new) | No | MCP `apply_migration` OR CLI `migration up` | Apply via either; tracking row records the state change |
| Re-emit bodies for an existing migration after a file edit | Yes (verified) | — | SKIP both. File commit + future fresh-DB reset will pick up the corrected file. |
| Re-emit bodies for an existing migration after a file edit | No (drift suspected) | CLI `migration up` if version-tracked already, OR MCP with distinguished tracking name | Apply; verify alignment post-apply; document in doc |
| Apply a migration not yet on staging | No (file is new) | MCP `apply_migration` (this session's pattern) OR CLI | Apply; tracking row gets created either way |

**Apply to every apply-phase decision:**

1. Before invoking `apply_migration` or `migration up`, ask: is the goal a state change, or alignment-without-state-change? If the latter, and live already matches file, and file is committed — skip both.
2. When mixing CLI and MCP in the same sequence, expect the tracking-history shapes to differ. The CLI's "already tracked, skipped" log line and the MCP's "added tracking row" telemetry are both expected; they're not symptoms of an error.
3. When a runbook prescribes "in-place re-apply" to commemorate alignment, evaluate via the matrix above. The "in-place" framing usually maps to "alignment-without-state-change" — which, if file/live match and file is committed, doesn't need a tool invocation at all.

### Lesson 12 (Audit Session C apply phase + Phase D #1.5 pre-flight, 2026-05-03)

**Test scaffolding must be persisted as durable executable code, not ephemeral SQL.**

If a test matrix is authored interactively (cowork sessions, MCP-driven, REPL-style) and only the outcomes are persisted (e.g., to a `_test_results` table), the matrix becomes irreproducible the moment the session ends. Future re-runs require re-authoring from scratch — and re-authoring without the original SQL produces a *different* matrix that may have different coverage or different bugs. The persisted outcomes are then a snapshot of one matrix's truth, not a regression baseline against which future runs can be diffed apples-to-apples.

**Empirical proof (Phase D #1.5 pre-flight, 2026-05-03):** Phase D run #1 (2026-05-02) recorded 177 PASS rows in `public._rls_test_results` across 23 patient-joined tables. The actual SELECT/INSERT/UPDATE statements that produced those rows were authored interactively across cowork sessions 5, 7, 10, 11, 13 — sent to the database via MCP `execute_sql`, generated the result rows, and then dissipated. The repo file `audits/rls-test-matrix.sql` (247 lines) is a scaffold doc with the scenario semantics (S1–S10 spec) and a CORRECT PATTERN template, but every per-table block is marked `⏳ scenarios to author next session`. There are zero `INSERT INTO public._rls_test_results` statements anywhere in the committed repo (grep-confirmed). When mig 106's behavioral change required a Phase D re-run as #1.5 to validate, the matrix could not be re-executed mechanically — only its outcomes survived.

**Recovery cost:** ~2–4 hours of templating-based reconstruction, recovering executable SQL from the scaffold structure + run #1 description trail + persona UUIDs + per-table column shape. Recoverable because the scaffold is highly templated; would have been unrecoverable if the scenarios had been more bespoke.

**Operational rule:**

1. **Persist the SQL alongside the outcomes.** Any test scenario that ends with an `INSERT INTO _<test_table>_results` should be authored as a committed `.sql` file (or DO-block-per-table loop) BEFORE it runs. The MCP execution then executes the committed file, not improvised SQL.
2. **Outcomes-only persistence is a regression-baseline anti-pattern.** A `_test_results` row says "the test passed" but doesn't say "here is the SQL that passed." Future runs need the SQL to confirm they're testing the same thing.
3. **Templated matrices warrant authored DO-blocks-per-table loops.** If the test surface is N tables × M scenarios = N×M cells with shared CORRECT PATTERN, the matrix should be a single parameterized `.sql` file that loops over a `(persona, table, scenario, filter, expected_outcome)` tuple list — not 177 hand-typed copies of the template.
4. **Outcomes table additionally records the source-of-truth file ref.** If `_rls_test_results` had a column `source_file TEXT` referencing the committed file path + line number that produced each row, today's reconstruction problem would have been a `git checkout` away. Add this column going forward.

The cost of not doing this: today's pre-flight would have been a 5-minute "run the matrix script" → instead it's a queued 2–4 hour reconstruction in a fresh session, with the apply-phase push held until reconstruction completes.

---

### Lesson 13 (Doc reconciliation pass, 2026-05-04)

**Source-of-truth documentation must be maintained in lockstep with the code and schema it describes — half-maintaining is the failure mode.**

When ARCHITECTURE.md / DECISIONS_LOG.md / PRODUCT_SPEC.md drift from shipped reality, downstream debugging and architecture decisions get made against documentation that no longer matches the system. The drift is invisible until a future engineer (or future-Claude) reads the doc, makes a recommendation against it, and lands a fix that contradicts an architectural commitment the doc didn't capture. "Half-maintained" docs (some sections current, others months stale) are worse than no docs — readers can't tell which sections are reliable.

**Empirical proof (this session, 2026-05-04):** the session opened with three core docs months out of step with shipped reality. D-061 (two-layer global patient identity, shipped Builds 02-03), D-064 (hybrid 3 DEFINER + 2 INVOKER RLS, shipped 2026-04-30 + finalized 2026-05-03 by mig 106), D-068 (directional consent + `patient_data_shares`, shipped Build 05), and the entire `apps/patient/` Next.js app (D-060, shipped Build 05) had no representation in any of the three docs. PRODUCT_SPEC.md wasn't even tracked in git — it lived only in the working tree. The drift accumulated because doc updates were "nice to have" while code shipped under deadline pressure across Builds 02 → 03 → 04 → 05.

**Recovery cost:** ~3 cowork sessions to bring the docs current (Phase 5a content authoring + Phase 5b verification sweep + Phase 5c fix pass), with one session purely on factual verification because the prior author drafted from project memory rather than ground truth. See Lesson #16.

**Operational rule:**

1. **Every architecturally-significant change requires a corresponding doc update in the same commit (or a paired commit landing same-session).** No "I'll update the doc next week." Next week becomes next quarter, becomes never.
2. **Doc audits run at session boundaries, not "when there's time."** If a session is too rushed for a doc audit, the work is too rushed to be done correctly. Schedule the audit; do not skip it.
3. **ARCHITECTURE / DECISIONS_LOG / PRODUCT_SPEC are tracked in git from day one.** Untracked source-of-truth docs are anti-patterns — they have no version history, no review trail, no diff-driven maintenance. Tracking forces the doc to be a first-class artifact.

**Standing rule:** at every cowork session boundary, the assistant runs a 5-minute "doc currency" check on the three core docs against the work shipped in the session. Anything stale gets queued for the next session as an explicit task — not deferred indefinitely.

The cost of not doing this: the next time someone reads ARCHITECTURE.md to understand "where does the privacy code live?", they get a column list that doesn't match the schema and recommend a fix against names that no longer exist. The fix lands, breaks something subtle, and the post-mortem traces the root cause back to the stale doc nobody updated. Lesson #13 closes that class.

---

### Lesson 14 (Discipline cleanup, 2026-05-04 — amended 2026-05-07)

**Per-app TypeScript path aliases must be declared at THREE levels — the root `tsconfig.json`, the per-app `tsconfig.json`, AND each app's `next.config.js` `config.resolve.alias` block — with a per-app prefix that is unique across apps.**

Two app-level `tsconfig.json` files cannot share the same alias name (e.g. `@/*`) because the alias would then resolve to two different per-app directories simultaneously. Root `tsc --noEmit` (the pre-push gate from D-045) reads the root `paths` block; Next.js dev/build reads the per-app `paths` block; if a shared alias name exists at the per-app level only, root tsc cannot resolve it and the gate fails the moment a second app introduces an import via that alias. Beyond TypeScript resolution, Next 14.2.x's webpack resolver does not always honor tsconfig path aliases for cross-segment imports inside an app, so the same alias must also be registered in `next.config.js` `config.resolve.alias` to survive the production build.

**Empirical proof (commit `bb50305`, 2026-05-04 audit detour Day 2):** both `apps/patient/tsconfig.json` and `apps/clinic/tsconfig.json` declared `"@/*": ["./*"]`. Root `tsconfig.json` had no `@/*` entry. The first time a file in `apps/patient/` imported via `@/components/...` (the new Build 05 sharing page introduced in commit `61f8752`), root tsc could not resolve the alias and the pre-push gate failed. Adding a single root `@/*` entry would have forced the alias to resolve to one app's directory only — silently disagreeing with the other app's tsconfig the moment the second app introduced its first `@/` import.

**Empirical proof addendum (CI run 25475031898, 2026-05-07):** the two-tsconfig-level declaration alone is insufficient. CI failed with an opaque `Process completed with exit code 1` and no diagnostic output until the build logs were captured to artifacts. Root cause: Next 14.2.x's webpack resolver does not always honor tsconfig path aliases for cross-segment imports inside an app, so the build broke at webpack-resolution time even though both tsconfig levels declared the alias correctly. Operationalized in commit `9774252`, which adds the same aliases to each app's `next.config.js` `config.resolve.alias` block — the third level the original lesson missed.

**Operational rule:**

1. **Per-app aliases use a per-app prefix.** Use `@patient/*` for `apps/patient/` files and `@clinic/*` for `apps/clinic/` files. Never share an alias name across apps.
2. **Declare each alias at all three levels.** Root `tsconfig.json` paths block: `"@patient/*": ["./apps/patient/*"]` and `"@clinic/*": ["./apps/clinic/*"]`. Per-app `tsconfig.json` paths block: `"@patient/*": ["./*"]` (in the patient app), `"@clinic/*": ["./*"]` (in the clinic app). Per-app `next.config.js` `config.resolve.alias` block: register the same alias-to-directory mapping inside the `webpack(config, options)` hook (e.g. `config.resolve.alias['@patient'] = path.resolve(__dirname, '.')` in the patient app, and the equivalent for `@clinic`). Root tsc reads root tsconfig, Next.js dev/build reads per-app tsconfig, webpack reads `next.config.js` at build time — all three must agree on the alias name and target.
3. **Cross-package shared aliases stay shared.** `@shared/*` and `@ui-clinic/*` point at packages, not apps, and remain declared once at root + once per-app pointing at the same package directory. The rule applies only to aliases that resolve to per-app directories.
4. **Reviewers reject any new `@/*` import.** The shared `@/*` convention is retired. Any PR introducing `@/foo` must be rewritten to `@patient/foo` or `@clinic/foo` before merge.

The cost of not doing this: a latent collision waiting for the second app's first `@/` import — exactly the trap that produced the `bb50305` cleanup, plus an opaque webpack-resolution failure when the tsconfig-only declaration fails to reach Next.js's bundler. The per-app-prefixed three-level pattern eliminates both collision classes entirely. Codified by D-065 in DECISIONS_LOG.md and §2 "Path alias mechanics" in ARCHITECTURE.md.

---

### Lesson 15 (reserved)

Reserved slot — kept open so subsequent lesson numbering matches forward references already written into ARCHITECTURE.md and DECISIONS_LOG.md. Reassign or delete when the next lesson is authored.

---

### Lesson 16 (Doc verification sweep, 2026-05-04)

**Documentation claims about the system require verification against the system, not against project memory or prior session drafts.**

Constants, counts, table names, column names, function names, file paths, security parameters, commit hashes, and dates — anything with a single correct value in code or schema — must be verified against ground truth before being committed to ARCHITECTURE / DECISIONS_LOG / PRODUCT_SPEC. Project memory is a starting hypothesis, not a source of truth. Prior session drafts inherit whatever errors the prior session committed; transitively trusting them propagates errors silently across sessions.

**Empirical proof (2026-05-04 doc verification sweep, `audits/doc-verification-sweep-2026-05-04.md`):** 95 factual claims checked across the three core docs. **14 hard errors + 7 partial mismatches** surfaced after a multi-session deep audit had landed the docs. Errors clustered in three buckets:
- **(a) project-memory-driven values that "sounded right":** `account_status='sentinel'` (the enum has no such value — `'locked'` is the actual value used for sentinels), `visibility_mode='DOCTOR_SCOPED'` (actual is `DOCTOR_SCOPED_OWNER`), "Phase F Task 16" (the task list has 9 entries, not 16).
- **(b) cowork-session-draft errors:** `regenerated_at` instead of `regenerated_count` (the privacy-code column was renamed during build), `commitPhoneChange` instead of `getPendingPhoneChangeRequests` (function never existed under the claimed name), `sms_code (4-digit)` instead of `sms_code_hash` (storage was bcrypt-hashed, not plaintext).
- **(c) internal contradictions between the docs themselves:** PRODUCT_SPEC.md still claimed Phase 2 patient app while DECISIONS_LOG.md D-072 had explicitly promoted it to Phase 1 and shipped it. The two docs were incompatible truths in the same repo.

**Recovery cost:** ~90 minutes for the verification sweep + ~45 minutes for the fix pass. Cheap compared to the cost of someone making an architecture decision against `regenerated_at` and recommending a fix against a column that doesn't exist.

**Operational rule:**

1. **Before any chunk surfaces for review, the cowork session lists every factual claim in the chunk that requires verification, and surfaces verification output for each.** Constants, counts, table/column/function names, file paths, security parameters, commit hashes, dates. The verification can be `grep`, `view`, schema query, or other direct read.
2. **Claims that can't be verified get flagged as `UNVERIFIABLE`.** Reviewer can then decide whether the claim is load-bearing enough to chase, or acceptable to commit with a flag.
3. **Reviewer doesn't accept unverified claims.** A doc commit without a verification pass against ground truth is rejected the same way an untested code commit is rejected.

**Standing rule:** every doc-touching cowork session ends with a verification sweep over the new claims. The sweep produces a report-shaped artifact (see `doc-verification-sweep-2026-05-04.md`) that lists each claim, the verification command, and the OK / WRONG / PARTIAL / UNVERIFIABLE outcome. The artifact is the audit trail; the fix pass closes it.

**Empirical evidence:** 14 wrong claims in the 2026-05-04 sweep — 74% baseline accuracy when verification is not enforced. Goal is 100% accuracy when verification is enforced. Pairs with **Lesson #7** (schema vs migrations drift — same failure mode at the schema layer) and **Lesson #9** (applies-via-dashboard drift — same failure mode at the apply layer). All three are instances of "the canonical record has diverged from the underlying truth and nobody noticed because nobody compared them."

```
0    State-of-Code Audit                      (READ ONLY)
0.5  Initialize Orphan Ledger                 (Mechanical)
1    Migration Plan & Schema Spec             (PLAN ONLY)
2    Build: Global Patient Identity Layer     (BUILD)
3    Build: Patient-Clinic Records Layer      (BUILD)
4    Build: Privacy Code & Consent Mechanism  (BUILD — first UI prompt)
5    Build: Patient Data Shares & Lifecycle   (BUILD — incl. audit hardening)
6    Build: RLS Policy Rewrite                (BUILD — highest risk)
6.5  Build: Legacy Cleanup                    (BUILD — drop legacy columns/tables)
7    Audit + Build: Dependent Account Flow    (AUDIT then BUILD)
8    Build: Anonymous Clinical Observations   (BUILD — AI pipeline)
9    Build: Pharmacy/Lab Schema Infrastructure (BUILD — schema only)
10   Build: Patient App v1                    (BUILD — largest UI)
11   End-to-End Network Flow Verification     (VERIFY)
```

---

## Status tracker

| # | Prompt | Status | Result file |
|---|---|---|---|
| 0 | State-of-Code Audit | ✅ COMPLETE | audits/patient-identity-state-audit.md |
| 0.5 | Initialize Orphan Ledger | ✅ COMPLETE | audits/orphan-ledger.md, audits/orphan-ledger-sop.md |
| 1 | Migration Plan & Schema Spec | ✅ COMPLETE (v2) | audits/patient-identity-schema-spec.md, audits/patient-identity-migration-plan.md, audits/patient-identity-spec-v2-changelog.md |
| 2 | Global Patient Identity | ✅ COMPLETE (with follow-up + staging apply, 2026-04-28) | audits/patient-identity-build-02-results.md, audits/patient-identity-build-02-followup-results.md, audits/patient-identity-build-02-staging-apply.md |
| 3 | Patient-Clinic Records | ✅ COMPLETE (2026-04-29; D6 cutover + R1 sweep moved into Prompt 4) | audits/patient-identity-build-03-results.md |
| 4 | Privacy Code & Consent | ⬜ Ready to launch | audits/patient-identity-build-04-results.md |
| 5 | Patient Data Shares | ⬜ Pending | audits/patient-identity-build-05-results.md |
| 6 | RLS Policy Rewrite | ⬜ Pending | audits/patient-identity-build-06-results.md |
| 6.5 | Legacy Cleanup | ⬜ Pending | audits/patient-identity-build-06-5-results.md |
| 7 | Dependent Account Flow | ⬜ Pending | audits/patient-identity-build-07-results.md |
| 8 | AI Training Pipeline | ⬜ Pending | audits/patient-identity-build-08-results.md |
| 9 | Pharmacy/Lab Schema | ⬜ Pending | audits/patient-identity-build-09-results.md |
| 10 | Patient App v1 | ⬜ Pending | audits/patient-identity-build-10-results.md |
| 11 | E2E Network Flow Test | ⬜ Pending | audits/patient-identity-e2e-network-test.md |

---

# PROMPT 0 — State-of-Code Audit (READ ONLY)

```
You are a senior backend engineer auditing an existing Next.js 14 + Supabase
healthcare codebase. Your job is to produce a precise, file-cited report of
what is currently built versus what a new patient identity network model
requires. You are READ ONLY for this prompt. Do not modify any code.

CONTEXT TO READ FIRST (in this order):
1. PRODUCT_SPEC.md
2. ARCHITECTURE.md sections 5, 6, 8
3. supabase/migrations/ — every migration in chronological order
4. packages/shared/lib/data/patients.ts
5. packages/shared/lib/data/visibility.ts
6. packages/shared/lib/data/clinic-context.ts
7. packages/shared/lib/data/messaging-consent.ts (if exists)
8. packages/shared/lib/data/patient-dedup.ts
9. apps/clinic/app/api/patients/ — every route
10. The previous "Privacy-First Patient Identity Model" sprint summary
    (Sprint 2, Feb 2026) — listed in DECISIONS_LOG or check git log for
    migration 009 or similar

THE MODEL TO AUDIT AGAINST:
The team has decided on a network-first patient identity model with these
properties:

(a) Global patient identity: every patient has a SINGLE row keyed by phone
    number (UNIQUE, normalized E.164). Phone is the global identifier. No
    national ID. Dependent accounts exist via a caregiver linkage
    (audited separately).

(b) Clinic-scoped relationship: every (global_patient, clinic) pair has
    its own scoped record holding clinic-specific notes. A clinic always
    sees its own data about a patient. A clinic sees data from OTHER
    clinics only if the patient has explicitly granted consent.

(c) Directional consent: patient grants access to a specific clinic. The
    grant is one-way — clinic X with consent sees data from clinic Y, but
    clinic Y without consent does NOT see data from clinic X. Permission
    is a property of the (data row, requesting clinic) pair, not of the
    data row alone.

(d) Privacy code: 6-character alphanumeric code, regeneratable by patient,
    rate-limited at 5 attempts/hour/clinic, audit-logged for every attempt
    success or failure, 24h lockout after 5 fails, SMS notification to
    patient on lockout.

(e) Search privacy: searching a phone returns identical UI ("enter privacy
    code") whether or not the patient exists. No information leaks via
    search results. Response timing must also be uniform (no timing
    attacks).

(f) Default share duration: 90 days, auto-renewing on next visit (extending
    to NOW+90d, never shortening), patient-extendable to 1 year or
    permanent, patient-revocable any time. Revoke prevents future views;
    past views are immutable; clinic's own notes stay as their own data.

(g) SMS-based code share: when patient doesn't have the app, front desk
    can trigger a 5-minute-expiry SMS with explicit consent language in
    Egyptian Arabic naming the clinic and doctor. Patient reads code back
    to front desk.

(h) Patient app: patient sees their full network history regardless of
    which clinic created which row. Governed by different RLS than clinic
    queries — patient queries by user_id ownership of global_patients.

(i) Auto-share with self: a clinic always sees its own data without any
    consent row. Encoded as a default rule in RLS.

YOUR DELIVERABLE:
Produce a written audit at audits/patient-identity-state-audit.md.

SECTION A — Current schema state
For each table involved in patient identity, show:
- Current columns, types, constraints, indices (from migrations)
- Current RLS policies on that table (verbatim SQL)
- Number of rows in production-like data (if access available)
- Whether patient identity is currently global, clinic-scoped, or hybrid

Tables to inspect minimum:
  patients, doctor_patient_relationships, anonymous_visits,
  opt_out_statistics, patient_phone_history, patient_recovery_codes,
  phone_change_requests, otp_codes, encounters, prescriptions,
  clinical_notes, clinic_memberships, patient_visibility (if exists),
  patient_shares (if exists), audit_log, consent_log

For EACH table, classify as one of:
  - ALIGNED (matches new model, keep as is)
  - PARTIAL (right idea, needs schema changes — list them)
  - WRONG (model contradicts new direction, needs migration)
  - MISSING (required by new model, doesn't exist yet)
  - DEAD (table exists but unused — recommend delete)

SECTION B — Phone normalization
- Where is phone stored across the codebase? List every column.
- Is it normalized to E.164 anywhere?
- Is there a UNIQUE constraint on phone in any patient-like table?
- What's the current state of duplicates? Run:
    SELECT phone, COUNT(*) FROM patients GROUP BY phone HAVING COUNT(*) > 1;
  Report the count.

SECTION C — Existing consent / share mechanisms
- Does a privacy code mechanism already exist? Where?
- Does a share/consent table exist? What's its shape?
- Are there any code-based share flows in the API? List them.
- Is there ANY mechanism currently in place for cross-clinic data
  visibility? If yes, how does it work?

SECTION D — Search privacy
- Find the patient search endpoint(s).
- What does it return today when phone matches an existing patient at
  another clinic? At the same clinic? Not found at all?
- Is the response shape DIFFERENT in those three cases? (Privacy leak.)
- Measure response time of each case — uniform timing or not.

SECTION E — Dependent account flow
- Search the codebase for: dependent, caregiver, guardian,
  child_account, linked_account, parent_user_id, managed_by,
  family_member.
- Document every finding with file:line.
- Determine current state: FULLY BUILT / PARTIAL / SPEC-ONLY / NOT EXIST
- If state is anything other than NOT EXIST, document the existing
  flow.

SECTION F — Audit logging coverage
- Does audit_log capture privacy-related events today?
- Specifically: VIEW_PATIENT, SHARE_PATIENT, REVOKE_SHARE,
  CODE_ATTEMPT?
- Where in the code are audit writes happening?
- Are they reliable (synchronous, can fail the parent transaction) or
  fire-and-forget?

SECTION G — Patient app surface
- Is there ANY patient-facing UI in the codebase?
- Is there a (patient) route group? If so, what's in it?
- Patient login flow — does it work? OTP only, or password too?

SECTION H — Migration risk inventory
For every required schema change identified above, document:
- Current row count of affected tables
- Whether the change is destructive (drops data) or additive
- Whether existing application code will break before migration completes
- Whether RLS policies need to be temporarily disabled during migration
- Estimated downtime if any

SECTION I — Cross-impact summary
List every code module, API route, RLS policy, and UI component that
will need to change. Group by:
  - Schema layer (migrations)
  - Data access layer (packages/shared/lib/data/)
  - API routes
  - UI components
  - Tests
This becomes the change-budget for the build prompts that follow.

CONSTRAINTS:
- Cite file:line for every claim. No claim survives without evidence.
- Where you find dead code, list it for deletion in the next pass.
- If you cannot determine something from code alone, write "NEED RUNTIME
  ACCESS TO VERIFY" and explain what would resolve it.
- Do not recommend a fix in this audit — the next prompt does that.

SUCCESS CRITERIA:
- Every table in section A classified with file:line evidence
- Phone duplicate count reported (from running the SQL)
- Search privacy leak documented with reproducer (SQL or HTTP request)
- Dependent account state documented (built / partial / unbuilt)
- Migration risk inventory complete
- Cross-impact summary lists at least 30 affected items
- Document at audits/patient-identity-state-audit.md
- Length: 2000–3500 words
```

---

# PROMPT 0.5 — Initialize Orphan Ledger

```
You are a project hygiene engineer. Initialize the Orphan Ledger that
all subsequent build prompts will maintain. This is a small, mechanical
prompt — should take under 30 minutes.

PREREQUISITES:
- Prompt 0 complete and reviewed

YOUR DELIVERABLE:
Create audits/orphan-ledger.md with this exact structure:

---
# Orphan Ledger — Patient Identity Network Build

This document tracks every artifact (database column, table, RLS policy,
API endpoint, data layer function, UI component) that is created but
not yet fully connected end-to-end. Every BUILD prompt updates this.

A complete vertical slice requires: DB schema + RLS + data layer
function + API endpoint + UI component + i18n strings + tests.

An item is OPEN if its complete vertical slice has not yet shipped.
An item is CLOSED when every layer is in place and tested.

The final E2E test prompt FAILS if any item is OPEN.

## Open Items

| ID | Item | Type | Created in Prompt | Closing Prompt | Owner | Notes |
|----|------|------|-------------------|----------------|-------|-------|

(empty — populated by build prompts)

## Closed Items

| ID | Item | Type | Created in | Closed in | Verified by Test |
|----|------|------|------------|-----------|------------------|

(empty — populated as items close)

## Rules

1. Every BUILD prompt that creates an artifact without a complete
   vertical slice MUST add a row to "Open Items" with:
   - A unique ID (e.g., ORPH-001)
   - A clear description of the artifact
   - Type: DB_TABLE | DB_COLUMN | RLS_POLICY | DATA_LAYER | API | UI | I18N
   - Which prompt created it
   - Which prompt is responsible for closing it
   - Owner role responsible
   - Brief notes

2. Every BUILD prompt closes orphans by:
   - Implementing the missing layer
   - Moving the row from Open to Closed
   - Adding which test verifies the closure

3. No items may exist in Open status by the end of Prompt 11.

4. Items can only be removed from Open via being moved to Closed.
   Never delete an open item without closing it.
---

Then write a one-paragraph SOP at audits/orphan-ledger-sop.md explaining
how cowork sessions should update the ledger:
- Read at start of every BUILD prompt
- Update at end of every BUILD prompt's deliverable
- Validation step: re-read the ledger and confirm every Open item
  added by this prompt has a sensible Closing Prompt assignment

SUCCESS CRITERIA:
- Both files written
- Ledger is empty (initial state)
- SOP is clear enough that the next cowork session can follow it
  without re-explaining
```

---

# PROMPT 1 — Migration Plan & Schema Spec (PLAN ONLY)

```
You are a senior database architect. The state-of-code audit (Prompt 0) is
complete and reviewed. The Orphan Ledger is initialized. Now produce the
migration plan and schema specification for the new patient identity
network model. You are PLAN ONLY — no code is written or applied.

PREREQUISITES:
- audits/patient-identity-state-audit.md exists and is reviewed
- audits/orphan-ledger.md exists (will not be updated by this prompt —
  this prompt creates no orphans because no code is written)
- Read both carefully. The plan you produce must not contradict the
  audit findings.

YOUR DELIVERABLE:
Produce two files:
1. audits/patient-identity-schema-spec.md — the target schema
2. audits/patient-identity-migration-plan.md — the migration sequence

==============================================================
SCHEMA SPEC (file 1)
==============================================================

Define every table that the new model requires. For each:
- Full DDL (CREATE TABLE with columns, types, constraints, defaults,
  indices) — production-ready, not pseudocode
- RLS policy SQL (verbatim, with the directional-consent logic encoded)
- Comments explaining each column's purpose
- Foreign keys with ON DELETE and ON UPDATE behavior specified

Tables to specify:
  - global_patients
  - patient_clinic_records
  - patient_data_shares
  - patient_privacy_codes (or column on global_patients — your call,
    justify it)
  - privacy_code_attempts (rate limit + audit)
  - patient_phone_history
  - dependent_account_links (caregiver ↔ dependent)
  - anonymous_clinical_observations (AI training pipeline)
  - prescriptions (revised — global_patient_id reference, fulfillment
    status fields for future pharmacy integration)
  - lab_orders (revised — global_patient_id reference, fulfillment
    status fields for future lab integration)
  - encounters (revised)
  - audit_events (revised — privacy-specific event types)

For RLS policies, write them as Supabase SQL with explicit comments
explaining the directional consent rule. Example structure:

  -- A clinic's user can SELECT prescription rows when:
  --   (a) the prescription was written at their clinic (auto-share with
  --       self), OR
  --   (b) the patient has granted active consent to their clinic
  CREATE POLICY prescriptions_clinic_select ON prescriptions
  FOR SELECT TO authenticated
  USING ( ... );

==============================================================
MIGRATION PLAN (file 2)
==============================================================

Sequence the migrations such that each step is:
- Reversible where possible (or explicitly flagged irreversible)
- Non-breaking to running application code (or with explicit
  compatibility shim)
- Testable in isolation

Required steps minimum:

Step 1 — Backfill phone normalization
  - Add normalized_phone column to patients (nullable initially)
  - Backfill from phone column using E.164 normalization
  - Verify all rows have normalized_phone before next step

Step 2 — Identify and resolve duplicate phones
  - Run dedup detection
  - For each duplicate cluster, define merge rule (oldest record wins;
    or manual review queue if >N duplicates)
  - Document resolution in audits/dedup-resolution.md (will be created
    in Prompt 2)

Step 3 — Create global_patients table; INSERT one row per unique phone
Step 4 — Create patient_clinic_records; INSERT one per (patient, clinic)
Step 5 — Add global_patient_id columns to encounters/prescriptions/notes
Step 6 — Privacy code generation for claimed patients
Step 7 — Create patient_data_shares (empty)
Step 8 — Create privacy_code_attempts (empty)
Step 9 — Create dependent_account_links (empty, spec only)
Step 10 — Create anonymous_clinical_observations
Step 11 — RLS policy migration (highest-risk; deploy in PERMISSIVE mode
  alongside old, measure 24h, switch to RESTRICTIVE)
Step 12 — Drop legacy patient_id usage (after code refactor)

For each step, document:
- SQL to apply (forward migration)
- SQL to rollback (reverse migration, where possible)
- Pre-conditions (what must be true before this step)
- Post-conditions (what must be true after, validated by SQL queries)
- Estimated wall-clock time
- Estimated downtime (if any)
- Risk level: LOW / MEDIUM / HIGH
- What to test after applying
- Which subsequent prompt implements the step

==============================================================
FORWARD COMPATIBILITY
==============================================================

The schema must support these future features without further migrations:
- Pharmacy fulfilling prescriptions (write-back to prescriptions)
- Labs delivering results (write to lab_orders)
- Cross-clinic referrals
- Patient-initiated clinic switching

Confirm each is supported by the schema. If not, explain.

CONSTRAINTS:
- Every CREATE TABLE statement must be production-ready, not pseudocode.
- Every RLS policy must compile in Supabase Postgres.
- The migration plan must work on a database with existing rows.
- If an irreversible step is required, mark it explicitly and require
  manual approval before applying.

SUCCESS CRITERIA:
- Every table has full DDL + RLS policy + comments
- Every migration step has forward SQL, reverse SQL (or "irreversible"
  flag), pre/post conditions, risk level
- Forward compatibility section addresses pharmacy, lab, referral,
  switch
- Two files written: schema-spec.md (~3000 words) and
  migration-plan.md (~2000 words)
```

---

# PROMPT 2 — Build: Global Patient Identity Layer

```
You are a senior fullstack engineer implementing the global patient
identity layer. This is the first BUILD prompt — actual code changes
happen here. Be surgical. Test before marking complete.

PREREQUISITES:
- audits/patient-identity-state-audit.md (Prompt 0)
- audits/orphan-ledger.md (Prompt 0.5)
- audits/patient-identity-schema-spec.md (Prompt 1)
- audits/patient-identity-migration-plan.md (Prompt 1)
- All reviewed and approved

NO-ORPHAN RULE:
Code committed in this prompt must have a complete vertical slice:
database schema + RLS + data layer function + API endpoint + UI surface
(if user-facing) + i18n + tests. If any layer is intentionally deferred
to a later prompt, you MUST add it to audits/orphan-ledger.md as an
Open item with a Closing Prompt assigned.

THE ORPHAN LEDGER:
Read audits/orphan-ledger.md at the start of this session. At the end
of the session, update it with any items this prompt opens or closes.

YOUR SCOPE (and ONLY this scope):
Implement Steps 1, 2, and 3 of the migration plan:
- Phone normalization utility + DB column
- Duplicate resolution
- global_patients table creation and backfill
- Plus: minimum viable user-visible surface to confirm the new identity
  layer works (otherwise this is pure orphan work)

DO NOT in this prompt:
- Modify RLS policies on existing tables
- Refactor application data layer to use global_patients (that's Prompt 3)
- Build privacy codes, shares, or consent mechanism (Prompts 4–5)

==============================================================
PHASE A — Pre-build verification
==============================================================

A1. Read audits/patient-identity-migration-plan.md Steps 1-3 carefully.
A2. Open the relevant migration files mentioned in the plan and verify
    they don't already contain conflicting changes.
A3. Check current production-like duplicate count:
      SELECT COUNT(*) FROM (
        SELECT phone FROM patients GROUP BY phone HAVING COUNT(*) > 1
      ) dup;
    Document the count. If >100, stop and ask Mo for guidance.
A4. Confirm migration directory layout (path, naming convention) by
    listing supabase/migrations/. Use the next sequential number.
A5. Read the Orphan Ledger. List any open items relevant to this prompt.

==============================================================
PHASE B — Implementation (vertical slice)
==============================================================

DATABASE LAYER

B1. Phone normalization utility
    - File: packages/shared/lib/utils/phone-normalize.ts
    - Function: normalizeEgyptianPhone(input: string): string | null
    - Accepts: "01012345678", "+201012345678", "201012345678", with/
      without spaces or dashes, with/without leading +
    - Returns: "+201012345678" (canonical E.164) or null if invalid
    - Reject: non-Egyptian, fewer than 10 digits after country code,
      non-numeric after normalization
    - Unit tests: at least 20 cases covering valid + invalid inputs

B2. Migration file 1 — add normalized_phone column
    - Path: supabase/migrations/NNN_normalize_patient_phone.sql
    - ALTER TABLE patients ADD COLUMN normalized_phone TEXT
    - Populate via UPDATE using a temporary plpgsql function that
      mirrors the TS utility (keep them in sync)
    - Verify zero NULLs allowed only after backfill
    - Validation: SELECT COUNT(*) FROM patients WHERE normalized_phone
      IS NULL — must be zero before next step

B3. Duplicate resolution
    - Generate audits/dedup-resolution.md listing every duplicate
      cluster with: normalized_phone, count, oldest_id, all ids,
      names of duplicates
    - Apply resolution rule: oldest patient_id wins
    - DO NOT delete duplicate rows yet
    - Mark winning row in patients with is_canonical = TRUE
    - Mark losing rows with is_canonical = FALSE and
      duplicate_of_patient_id = winning row's id

B4. Migration file 2 — create global_patients
    - Path: supabase/migrations/NNN_create_global_patients.sql
    - Per the schema-spec from Prompt 1
    - INSERT one row per unique normalized_phone (only is_canonical=TRUE)
    - UNIQUE constraint on normalized_phone
    - Enable RLS with placeholder DENY-ALL policy (real policies =
      Prompt 6 — add to Orphan Ledger)
    - Validation: COUNT(global_patients) must equal
      COUNT(DISTINCT normalized_phone WHERE is_canonical) FROM patients

B5. Add global_patient_id pointer to patients table
    - ALTER TABLE patients ADD COLUMN global_patient_id UUID
      REFERENCES global_patients(id)
    - Backfill: every patients row gets the global_patients.id of its
      normalized_phone match
    - Validate: zero NULLs after backfill
    - Add NOT NULL constraint

DATA LAYER

B6. Add minimal data access function
    - File: packages/shared/lib/data/global-patients.ts
    - Function: findGlobalPatientByPhone(phone: string):
      Promise<GlobalPatient | null>
    - Normalizes the input phone, queries global_patients
    - Used by API endpoint in B7

API LAYER

B7. Internal admin endpoint to verify identity layer works
    - Route: GET /api/admin/global-patients/lookup?phone=...
    - Auth: admin only (use existing requireApiRole or equivalent)
    - Returns: { id, normalized_phone, claimed_by_user_id } or 404
    - This is an internal verification endpoint, not user-facing

UI LAYER

B8. Decision point: does this prompt need user-facing UI?
    - The new identity layer is invisible to end users. The patient
      table still works the same way for them.
    - VERDICT: no user-facing UI in this prompt. The "vertical slice"
      is complete because the layer is not user-visible at this stage.
    - Document this decision in the deliverable's "UI Layer" section:
      "N/A — global identity layer is invisible to users; surface
      arrives in Prompt 4 (privacy code) and Prompt 10 (patient app)."

I18N LAYER

B9. No new user-facing strings in this prompt. Document in deliverable:
    "N/A — no user-facing UI."

TESTS

B10. Unit tests
     - phone-normalize.ts: 20+ cases, all passing

B11. Migration tests
     - Apply migrations to fresh database with seed data
     - Run validation queries (per migration plan's post-conditions)
     - Document each query result

B12. Idempotency test
     - Run migrations twice
     - Confirm second run is no-op or fails cleanly with informative
       error
     - If neither, fix the migration

B13. Rollback test
     - Apply migrations
     - Apply rollback SQL
     - Confirm database state matches pre-migration state
     - Document any state that cannot be recovered (audit log entries
       are acceptable; user data loss is not)

B14. Production-data simulation
     - Take a copy of prod data (or representative dump)
     - Apply migrations
     - Sample 50 random patients before/after — verify data integrity
     - Run COUNT queries on every affected table

B15. End-to-end verification
     - Hit /api/admin/global-patients/lookup with 5 known phones
     - Verify correct global_patients rows returned
     - Verify response shape matches spec

==============================================================
PHASE C — Orphan Ledger Update
==============================================================

C1. Open new orphans in audits/orphan-ledger.md:
    - global_patients RLS placeholder DENY-ALL (real policy in Prompt 6)
    - Any other layer intentionally deferred

C2. Confirm no orphans remain that should have been closed by this
    prompt.

==============================================================
PHASE D — Deliverables
==============================================================

Write audits/patient-identity-build-02-results.md with:

1. PHASE A FINDINGS
   - Duplicate count
   - Migration directory state
   - Orphan ledger relevance

2. PHASE B FILE INVENTORY
   For each layer (DB, RLS, Data Layer, API, UI, i18n):
   - Files modified or created
   - Line counts
   - Brief description
   For UI layer specifically, even if N/A, document the decision.

3. PAGE INVENTORY (UI changes)
   | Feature | Page Path | URL Route | Component File | Tested On |
   |---|---|---|---|---|
   (For this prompt: "N/A — no user-facing UI in this prompt" —
   acceptable because the layer is invisible at this stage)

4. PHASE C TEST RESULTS
   For each test, document:
   - Test name
   - Command run
   - Output
   - PASS/FAIL

5. ORPHAN LEDGER DELTA
   - Items opened: list with IDs and assigned closing prompts
   - Items closed: none expected for this prompt

6. DEVIATIONS FROM PLAN
   - Any deviation and why

7. KNOWN RISKS NOT YET ADDRESSED
   - Items deferred to future prompts

8. HAND-OFF NOTES FOR PROMPT 3

CONSTRAINTS:
- Every code file modified or created must be listed in the deliverable
- Every test result must include the actual command run and its output
- If any test fails, STOP. Do not mark complete. Fix and re-run.
- If duplicate count exceeds 100, STOP and request guidance.
- Migrations must be reviewed by Mo before being applied to staging.
- Orphan Ledger must be updated. Failure to update = prompt incomplete.

SUCCESS CRITERIA:
- normalizeEgyptianPhone utility built with passing tests
- Two migrations written, applied, rolled back, re-applied successfully
- global_patients table populated, verified
- patients.global_patient_id populated, verified
- audits/dedup-resolution.md written with full duplicate inventory
- audits/patient-identity-build-02-results.md written with all sections
- Orphan Ledger updated with new open items
- /api/admin/global-patients/lookup endpoint working
- Zero application-code changes (still all reading from patients table)
```

---

# PROMPT 3 — Build: Patient-Clinic Records Layer

```
You are a senior fullstack engineer continuing the patient identity
refactor. Layer 1 (global_patients) is in place after Build 02 +
follow-up. Now build Layer 2 (patient_clinic_records) — the per-clinic
scoped relationship that holds clinic-specific data on a global patient.

This prompt also closes Orphan Ledger items ORPH-V2-07 (quarantine
resolution) and ORPH-V2-08 (data-layer cutover). The migration spec
calls these "Step 4" and "Step 5" of the migration plan.

PRINCIPLE: production-shape, not minimum-viable. Every shortcut taken
now becomes technical debt at scale. Build for 50,000 patients today.

PREREQUISITES:
- Migrations 071, 072, 073 applied to staging and validated by Mo.
- audits/patient-identity-build-02-followup-results.md confirmed.
- audits/dedup-resolution.md signed off.
- audits/EXECUTION_PROMPTS.md (this file) read for locked decisions
  and locked numerics.
- audits/patient-identity-schema-spec.md (v2) and
  audits/patient-identity-migration-plan.md (v2) read.
- audits/orphan-ledger.md and audits/orphan-ledger-sop.md read.

NO-ORPHAN RULE: enforced. Every artifact in this prompt must have a
complete vertical slice (DB + RLS placeholder + data layer + API +
tests + i18n) OR be tracked in the Orphan Ledger with a closing prompt.

ORPHAN LEDGER: read at start, update at end.

==============================================================
YOUR SCOPE (and ONLY this scope)
==============================================================

Implement Steps 4 and 5 of the migration plan, plus close ORPH-V2-07,
ORPH-V2-08, and ORPH-V2-11:

0. **Phase 0 — close ORPH-V2-11** (audit_events.actor_user_id
   nullability + backfill missing mig 073 audit rows). Ships as
   mig 073.5 BEFORE any other Prompt 3 migration runs. This makes
   sure every audit row this prompt writes will land successfully —
   without this, Prompt 3 repeats the silent-fail pattern from
   Build 02.
1. Create patient_clinic_records table (mig 074)
2. Backfill patient_clinic_records from existing patients × clinics
   relationships
3. Resolve _phone_normalize_quarantine table contents — patches OR
   sentinel rows in global_patients (closes ORPH-V2-07 part 1, mig 075)
4. Flip patients.global_patient_id to NOT NULL after quarantine
   resolved (closes ORPH-V2-07 part 2, mig 075.2)
5. User-side dedup detection: create _user_dedup_plan and auto-populate
   from _user_phone_duplicates view (mig 075.5). Build 02 staging
   surfaced 4 user clusters that mig 073 deliberately did NOT touch.
   Same separate-detection-from-consumption pattern as the
   patient-side, with a real human-review gate.
6. User-side dedup consumption: pre-flight assertion + flag writes on
   users.is_canonical / duplicate_of_user_id (mig 075.7). Cross-side
   parity check surfaces any phone where patient-side winner and
   user-side winner disagree — Mo reviews divergence.
7. Add global_patient_id and patient_clinic_record_id columns to all
   patient-joined clinical tables (mig 076)
8. Backfill those columns
9. Compatibility shim (database triggers) so existing code paths
   continue to work (mig 077)
10. Data layer cutover: identity reads route through
    findGlobalPatientById / findGlobalPatientByPhone (closes ORPH-V2-08)

DO NOT in this prompt:
- Touch RLS policies on existing tables (Prompt 6)
- Drop legacy patient_id columns (Prompt 6.5)
- Build privacy codes, shares, or consent mechanism (Prompts 4–5)
- Delete the compatibility triggers (Prompt 6.5)
- Auto-resolve cross-side dedup mismatches — surface them to Mo

==============================================================
PHASE A — Pre-build verification
==============================================================

A1. Verify migrations 071, 072, 073 are present and applied state is
    healthy. Run:
      SELECT 'global_patients_count' AS check_name, COUNT(*)::text AS value
        FROM public.global_patients
      UNION ALL
      SELECT 'patients_with_global_patient_id',
             COUNT(*) FILTER (WHERE global_patient_id IS NOT NULL)::text
        FROM public.patients
      UNION ALL
      SELECT 'patients_quarantined',
             COUNT(*) FILTER (WHERE normalized_phone IS NULL)::text
        FROM public.patients
      UNION ALL
      SELECT 'user_phone_duplicate_clusters',
             COUNT(*)::text
        FROM public._user_phone_duplicates
      UNION ALL
      SELECT 'users_quarantined',
             COUNT(*) FILTER (WHERE normalized_phone IS NULL)::text
        FROM public.users;
    Document the five counts.

    Build 02 staging baseline (2026-04-28) for reference — at apply
    time on `medassist-egypt`:
      global_patients_count          = 31
      patients_with_global_patient_id = 32 (31 canonical + 1 loser)
      patients_quarantined           = 3
      user_phone_duplicate_clusters  = 4
      users_quarantined              = 71

    If the staging counts diverge significantly from this baseline,
    something happened between Build 02 staging apply and this
    prompt's execution. STOP and ask Mo whether to proceed.

A2. List every table that has a patient_id column referencing
    public.patients(id). Use:
      SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND kcu.column_name LIKE '%patient_id%'
         AND tc.table_schema = 'public';
    Confirm the list matches the migration plan's Step 5 target list.
    Per migration plan Step 5, the target list is at minimum:
      encounters, prescriptions, clinical_notes, appointments,
      payments, lab_orders, imaging_orders
    Cross-reference against the actual list. If new tables joined to
    patients have been added since the schema spec was written, flag
    them and STOP for Mo's input. Don't auto-include.

A3. Read _phone_normalize_quarantine. For each row, document:
    - source table (patients vs users)
    - source row id
    - raw_phone value
    - reason
    - whether the raw phone is recoverable via human inspection
      (e.g., "missed leading 0" → recoverable; "letters mixed in" →
      may not be)

A4. Read Orphan Ledger. List every open item and identify:
    - Which orphans this prompt closes (expect: V2-07, V2-08)
    - Which orphans this prompt opens (expect: patient_clinic_records
      RLS DENY-ALL placeholder; compatibility shim triggers)
    - Which orphans remain unchanged

A5. Read DECISIONS_LOG.md candidate entries from Build 02 follow-up
    results § 6. Confirm Mo has applied them, or flag if not (this is
    documentation, not a blocker).

==============================================================
PHASE B — Implementation (vertical slice)
==============================================================

DATABASE LAYER — mig 073.5 (Phase 0 — close ORPH-V2-11)

B0. Mig 073.5_relax_audit_actor_user_id.sql
    Closes ORPH-V2-11. Without this migration, every audit row this
    prompt writes will silently fail the same way mig 073's
    PATIENT_DEDUP_FLAGGED + GLOBAL_PATIENT_CREATED inserts did. The
    audit gap from Build 02 was small (1 + 31 rows). The audit gap
    from Prompt 3 would be much larger:
    - PATIENT_CLINIC_RECORD_CREATED for every patient-clinic pair
    - QUARANTINE_RESOLVED_PATH_A / PATH_B for every quarantine row
    - USER_DEDUP_FLAGGED for every cluster loser
    - DATA_LAYER_CUTOVER_COMPLETE telemetry marker
    Letting this slide would set the wrong precedent. Production-
    shape: every action this prompt takes generates a real audit row.

    Forward SQL:
    - Drop the existing FK constraint on audit_events.actor_user_id
      (find via pg_constraint; constraint name varies by environment)
    - ALTER COLUMN actor_user_id DROP NOT NULL
    - Add column actor_kind to audit_events:
        ALTER TABLE public.audit_events
          ADD COLUMN IF NOT EXISTS actor_kind TEXT
            NOT NULL DEFAULT 'user'
            CHECK (actor_kind IN ('user','system','migration'));
    - Add invariant CHECK constraint:
        ALTER TABLE public.audit_events
          ADD CONSTRAINT audit_events_actor_consistency
            CHECK (
              (actor_kind = 'user' AND actor_user_id IS NOT NULL)
              OR
              (actor_kind IN ('system','migration') AND actor_user_id IS NULL)
            );
    - Re-add a softer FK that allows NULL:
        ALTER TABLE public.audit_events
          ADD CONSTRAINT audit_events_actor_user_id_fkey
            FOREIGN KEY (actor_user_id)
            REFERENCES public.users(id)
            ON DELETE SET NULL;
    - Backfill existing audit_events rows: set actor_kind='user' for
      every existing row (they all have NOT NULL actor_user_id from
      before this migration).
    - Idempotent backfill of mig 073's missing audit rows:
        -- Insert one PATIENT_DEDUP_FLAGGED per non-canonical patient
        -- with actor_kind='migration', actor_user_id=NULL. Use
        -- ON CONFLICT DO NOTHING with a unique key so re-running
        -- this migration is a no-op.
        INSERT INTO public.audit_events (
          action, actor_kind, actor_user_id,
          target_kind, target_id, metadata, created_at
        )
        SELECT
          'PATIENT_DEDUP_FLAGGED',
          'migration',
          NULL,
          'patient',
          p.id,
          jsonb_build_object(
            'source', 'migration_073_backfill_via_073.5',
            'duplicate_of_patient_id', p.duplicate_of_patient_id,
            'normalized_phone', p.normalized_phone
          ),
          NOW()
        FROM public.patients p
        WHERE p.duplicate_of_patient_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.audit_events ae
            WHERE ae.action = 'PATIENT_DEDUP_FLAGGED'
              AND ae.target_id = p.id
          );

        -- Insert one GLOBAL_PATIENT_CREATED per global_patients row
        INSERT INTO public.audit_events (
          action, actor_kind, actor_user_id,
          target_kind, target_id, metadata, created_at
        )
        SELECT
          'GLOBAL_PATIENT_CREATED',
          'migration',
          NULL,
          'global_patient',
          gp.id,
          jsonb_build_object(
            'source', 'migration_073_backfill_via_073.5',
            'normalized_phone', gp.normalized_phone,
            'created_at_original', gp.created_at
          ),
          NOW()
        FROM public.global_patients gp
        WHERE NOT EXISTS (
          SELECT 1 FROM public.audit_events ae
          WHERE ae.action = 'GLOBAL_PATIENT_CREATED'
            AND ae.target_id = gp.id
        );

    Reverse SQL: this is the messy part. Audit rows already inserted
    cannot be rolled back without losing data. Document this
    explicitly:
    - DELETE FROM audit_events WHERE metadata->>'source' = 'migration_073_backfill_via_073.5'
      (the only safe deletion — these rows were inserted BY this
      migration, so removing them on rollback is correct)
    - Drop the actor_kind column (or leave it if other rollbacks
      become messy — document either way)
    - Drop the audit_events_actor_consistency CHECK
    - Re-add the original NOT NULL on actor_user_id IF AND ONLY IF
      every remaining audit_events row has actor_user_id NOT NULL.
      If any rows have NULL actor_user_id from non-mig-073 sources,
      the rollback FAILS — that's intentional, signals real audit
      writes happened that the rollback can't safely revert.

    Pre-conditions: none beyond standard migration health.

    Post-conditions:
      -- actor_user_id is now nullable
      SELECT is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='audit_events'
         AND column_name='actor_user_id';
      -- Expect: 'YES'

      -- mig 073's missing rows are present
      SELECT
        (SELECT COUNT(*) FROM public.patients
          WHERE duplicate_of_patient_id IS NOT NULL) AS expected_dedup_audits,
        (SELECT COUNT(*) FROM public.audit_events
          WHERE action = 'PATIENT_DEDUP_FLAGGED'
            AND metadata->>'source' = 'migration_073_backfill_via_073.5') AS actual_dedup_audits,
        (SELECT COUNT(*) FROM public.global_patients) AS expected_create_audits,
        (SELECT COUNT(*) FROM public.audit_events
          WHERE action = 'GLOBAL_PATIENT_CREATED'
            AND metadata->>'source' = 'migration_073_backfill_via_073.5') AS actual_create_audits;
      -- Expect:
      --   expected_dedup_audits = actual_dedup_audits (1 = 1 on staging)
      --   expected_create_audits = actual_create_audits (31 = 31 on staging)

    Add audit-action enum values to packages/shared/lib/data/audit.ts
    in this same prompt's first commit, BEFORE the migration runs:
    - PATIENT_DEDUP_FLAGGED (already in code per Build 02 follow-up
      Fix 3, but verify it's there)
    - GLOBAL_PATIENT_CREATED (same)
    - The new actor_kind values aren't enum values — they're a
      separate column with its own CHECK constraint; no TS update
      needed for actor_kind unless code paths read it.

    Verifying test:
    - C0 (new test in Phase C): apply mig 073.5, run validation
      script's check 22 + check 23 (the two FAILs from Build 02
      staging apply). Expected: both PASS now.

DATABASE LAYER — mig 074

B1. Mig 074_create_patient_clinic_records.sql
    Per schema spec § 3 — production-shape. Required columns:
    - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
    - global_patient_id UUID NOT NULL REFERENCES global_patients(id)
      ON DELETE RESTRICT (never cascade — clinic data must survive
      the patient's identity row being merged or deleted)
    - clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT
    - is_anonymous_to_global BOOLEAN NOT NULL DEFAULT FALSE
    - consent_to_messaging BOOLEAN NOT NULL DEFAULT FALSE
      (per schema spec; lazy default per Prompt 1 v2 Change 5)
    - consent_to_messaging_granted_at TIMESTAMPTZ
    - first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    - last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    - created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    - updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    - UNIQUE(global_patient_id, clinic_id)
    - Index on (clinic_id, last_seen_at DESC) for clinic-side queries
    - Index on (global_patient_id) for patient-side queries

B2. RLS placeholder DENY-ALL on patient_clinic_records
    Per schema spec § 3. Real policies ship in Prompt 6.
    Add to Orphan Ledger as ORPH-V3-01.

B3. Mig 074 backfill patient_clinic_records
    For every (patients.global_patient_id, patients.clinic_id) pair
    that exists, INSERT one row. Set:
    - is_anonymous_to_global = FALSE (existing data is implicit
      history, not anonymized)
    - consent_to_messaging = FALSE per Prompt 1 v2 Change 5 (Option 3
      re-consent flow handles legacy consent migration)
    - first_seen_at = MIN(patients.created_at) for that pair
    - last_seen_at = COALESCE(MAX(encounters.created_at), patients.created_at)
      for that pair (to seed the recency index correctly)

    Validation post-condition:
      SELECT COUNT(*) AS expected FROM (
        SELECT DISTINCT global_patient_id, clinic_id FROM public.patients
         WHERE global_patient_id IS NOT NULL AND clinic_id IS NOT NULL
      ) p;
      SELECT COUNT(*) AS actual FROM public.patient_clinic_records;
      -- Expect: equal.

DATABASE LAYER — mig 075

B4. Mig 075_quarantine_resolution.sql
    Closes ORPH-V2-07 part 1.
    Resolves _phone_normalize_quarantine rows. Two paths per row:

    PATH A — recoverable. The raw_phone has a fixable issue (e.g.,
      missed leading zero, transposed digits). Mo updates the source
      table (patients.phone or users.phone) with the corrected value
      BEFORE this migration runs. The migration then re-runs
      normalize_phone_e164 for those rows and removes them from
      quarantine.

    PATH B — unrecoverable. The phone is genuinely garbage (letters,
      foreign country code we don't support, etc.). The migration
      creates a sentinel global_patients row with:
      - normalized_phone = NULL (UNIQUE constraint allows multiple
        NULLs in Postgres)
      - account_status = 'locked'
      - claimed = FALSE
      - legacy_phone = the original raw_phone (preserved for forensics)
      Then sets the source patients/users row's global_patient_id to
      this sentinel, and removes the quarantine row.

    Implementation note:
      The schema spec's UNIQUE(normalized_phone) currently DOES allow
      multiple NULLs (Postgres standard). VERIFY this on staging
      before applying — if the constraint was hardened during Build
      02 to forbid NULLs, this migration must drop and recreate the
      constraint as a partial unique index:
        CREATE UNIQUE INDEX global_patients_normalized_phone_uniq
          ON global_patients(normalized_phone)
          WHERE normalized_phone IS NOT NULL;

    Mo provides quarantine resolutions in audits/quarantine-resolution.md
    as a manual step BEFORE this migration runs. The cowork session
    creates the migration template; Mo populates the resolution data.

    Validation post-condition:
      SELECT COUNT(*) FROM public._phone_normalize_quarantine;
      -- Expect: 0

B5. Mig 075.2 — flip patients.global_patient_id NOT NULL
    Closes ORPH-V2-07 part 2.
    After quarantine is resolved, every patients row has a
    global_patient_id (real or sentinel). Add NOT NULL.
    Pre-flight assertion: refuses to run if any quarantine rows remain.

      DO $$
      DECLARE v_unresolved INTEGER;
      BEGIN
        SELECT COUNT(*) INTO v_unresolved
          FROM public._phone_normalize_quarantine;
        IF v_unresolved > 0 THEN
          RAISE EXCEPTION 'mig 075.2 blocked: % unresolved quarantine rows. Resolve via mig 075 first.', v_unresolved;
        END IF;
      END $$;

      ALTER TABLE public.patients
        ALTER COLUMN global_patient_id SET NOT NULL;

DATABASE LAYER — mig 075.5 + 075.7 (user-side dedup, same pattern as patient-side)

B5a. Mig 075.5_user_dedup_detection.sql
     Closes the user-side counterpart of the patient-side dedup work
     done by Build 02's mig 072. The Build 02 staging apply surfaced
     4 user clusters that mig 073 deliberately did NOT touch:
       +201034737110 (2 users)
       +201098765432 (2 users — mirrors Sara/Mohamed patient cluster)
       +201215335374 (2 users)
       +201222101833 (2 users)
     The pattern from Build 02's mig 072 applies symmetrically:
     separate DETECTION from CONSUMPTION with a real human-review gate
     in between. Production-shape, not minimum-viable.

     Forward SQL:
     - Create _user_dedup_plan table (same shape as
       _patient_dedup_plan, but keyed on user IDs):
         normalized_phone TEXT PRIMARY KEY,
         winner_user_id UUID NOT NULL,
         loser_user_ids UUID[] NOT NULL,
         resolution TEXT NOT NULL CHECK (resolution IN (
           'auto_oldest_wins', 'manual_review'
         )),
         decided_by UUID,
         decided_at TIMESTAMPTZ,
         notes TEXT,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     - Auto-populate _user_dedup_plan from _user_phone_duplicates view
       (already exists from Build 02 mig 072):
       - Cluster size 2: insert with resolution='auto_oldest_wins',
         winner_user_id = oldest by created_at,
         decided_at = NOW()
       - Cluster size 3+: insert with resolution='manual_review',
         winner_user_id = oldest as placeholder,
         decided_at = NULL (signals Mo must review)
     - Same RLS treatment as _patient_dedup_plan: leading-underscore
       convention, no RLS enabled (service-role only)

     This migration does NOT touch users.is_canonical or
     users.duplicate_of_user_id. Those flags are written by mig 075.7
     based on the resolved _user_dedup_plan. This separation IS the
     gate.

     Cross-reference to patient-side. The +201098765432 cluster
     appears on BOTH sides (Sara/Mohamed in patients, mirrored in
     users). The user-side decision MUST be consistent with the
     patient-side decision recorded in _patient_dedup_plan. The
     migration includes a sanity-check query and a comment naming
     the cross-reference. If the auto-rule picks a different winner
     on each side (because users.created_at is not necessarily equal
     to patients.created_at for the same logical person), STOP and
     flag — Mo manually reviews the cross-side mismatch before
     mig 075.7 runs.

     Reverse SQL: DROP TABLE _user_dedup_plan.

     Post-conditions:
       SELECT COUNT(*) FROM public._user_phone_duplicates d
       LEFT JOIN public._user_dedup_plan p
         ON p.normalized_phone = d.normalized_phone
        WHERE p.normalized_phone IS NULL;
       -- Expect: 0

       SELECT COUNT(*) FROM public._user_dedup_plan
        WHERE resolution = 'auto_oldest_wins' AND decided_at IS NULL;
       -- Expect: 0

B5b. Mig 075.7_user_dedup_consumption.sql
     Consumes _user_dedup_plan to write canonical flags on users.
     Same pre-flight assertion pattern as mig 073:

       DO $$
       DECLARE v_unresolved INTEGER;
       BEGIN
         SELECT COUNT(*) INTO v_unresolved
           FROM public._user_dedup_plan
          WHERE decided_at IS NULL;
         IF v_unresolved > 0 THEN
           RAISE EXCEPTION 'mig 075.7 blocked: % unresolved user dedup clusters in _user_dedup_plan. Mo must SET decided_at + decided_by on every manual_review row before this migration runs.', v_unresolved;
         END IF;
       END $$;

     Forward SQL:
     - ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_canonical BOOLEAN
     - ALTER TABLE public.users ADD COLUMN IF NOT EXISTS duplicate_of_user_id UUID
     - Backfill is_canonical and duplicate_of_user_id from
       _user_dedup_plan (winner → TRUE, every loser → FALSE +
       duplicate_of_user_id pointing to winner). For users not in
       _user_dedup_plan (no duplicates), set is_canonical = TRUE
       and duplicate_of_user_id = NULL.
     - Audit logging: insert USER_DEDUP_FLAGGED rows for every user
       marked non-canonical. (Add audit action to TS enum BEFORE
       this migration runs — per Build 02's going-forward rule.)
     - Index on (is_canonical) for canonical-set queries

     Forward-compat: do NOT drop legacy columns. Cleanup is Prompt 6.5.

     Reverse SQL: drop the two columns + the index.

     Post-conditions: same shape as mig 073's plan-consumption
     checks but for users:

       -- Every winner has is_canonical = TRUE
       SELECT COUNT(*) FROM public._user_dedup_plan p
         LEFT JOIN public.users u ON u.id = p.winner_user_id
        WHERE u.is_canonical IS DISTINCT FROM TRUE;
       -- Expect: 0

       -- Every loser has is_canonical = FALSE + correct pointer
       SELECT COUNT(*) FROM public._user_dedup_plan p
         JOIN unnest(p.loser_user_ids) WITH ORDINALITY l(loser_id, n) ON TRUE
         LEFT JOIN public.users u ON u.id = l.loser_id
        WHERE u.is_canonical IS DISTINCT FROM FALSE
           OR u.duplicate_of_user_id IS DISTINCT FROM p.winner_user_id;
       -- Expect: 0

     Cross-side parity check: for every cluster that exists on BOTH
     sides (same normalized_phone in _patient_dedup_plan AND
     _user_dedup_plan), the chosen winners should ideally point to
     the same logical person. Run a SELECT that surfaces any
     cross-side mismatch — the migration does NOT auto-fix
     mismatches, but logs them for Mo's review:

       SELECT
         pp.normalized_phone,
         pp.winner_patient_id,
         up.winner_user_id,
         CASE
           WHEN pp.winner_patient_id = up.winner_user_id THEN 'aligned'
           ELSE 'cross_side_mismatch'
         END AS status
       FROM public._patient_dedup_plan pp
       JOIN public._user_dedup_plan up
         ON up.normalized_phone = pp.normalized_phone;

     If any row returns 'cross_side_mismatch', Prompt 3 staging
     follow-up must include Mo's review of the divergence (this is
     where the Sara/Mohamed phone-correction-vs-shared-phone
     question gets answered for users too).

DATABASE LAYER — mig 076

B6. Mig 076_add_global_refs_to_clinical_tables.sql
    For each table in A2's confirmed list (default: encounters,
    prescriptions, clinical_notes, appointments, payments, lab_orders,
    imaging_orders):
    - ADD COLUMN global_patient_id UUID REFERENCES global_patients(id)
      ON DELETE RESTRICT
    - ADD COLUMN patient_clinic_record_id UUID
      REFERENCES patient_clinic_records(id) ON DELETE RESTRICT
    - Backfill: for each row, derive these from the existing
      patient_id by joining through patients → patient_clinic_records
    - After backfill: ALTER COLUMN ... SET NOT NULL on both new
      columns
    - CREATE INDEX on each new global_patient_id column
    - CREATE INDEX on each new patient_clinic_record_id column
    - CREATE INDEX on (global_patient_id, clinic_id) where the table
      already has clinic_id (encounters, appointments, etc.)

    Pre-flight assertion: refuses to run if any patient_id row in
    these tables fails to derive (orphaned reference). Show the
    offending row IDs in the exception message.

B7. Mig 076 audit logging
    Insert one PATIENT_CLINIC_RECORD_CREATED audit_events row per
    backfilled patient_clinic_records row. Add this action to the TS
    AuditAction enum at packages/shared/lib/data/audit.ts BEFORE the
    migration runs (per the going-forward rule from Build 02
    follow-up Fix 3).

DATABASE LAYER — mig 077

B8. Mig 077_compatibility_triggers.sql
    Compatibility shim. Two trigger functions per affected table:
    - tg_<table>_derive_global_refs: BEFORE INSERT OR UPDATE,
      if patient_id IS NOT NULL but global_patient_id IS NULL,
      derive both new columns from patient_id
    - tg_<table>_derive_legacy_ref: BEFORE INSERT OR UPDATE,
      if global_patient_id IS NOT NULL but patient_id IS NULL,
      derive patient_id from the canonical patients row for
      (global_patient_id, clinic_id)

    Each trigger function MUST:
    - Be commented with the prompt that removes it (Prompt 6.5)
    - Skip its work if the derived value would conflict with an
      already-set value (raise EXCEPTION instead of silently
      overwriting — silent overwrite is the worst possible behavior
      for a compatibility shim)

    Add to Orphan Ledger as ORPH-V3-02 (closing prompt: 6.5).

DATA LAYER

B9. Create or update packages/shared/lib/data/patient-clinic-records.ts
    Functions to ship:
    - getOrCreatePatientClinicRecord(globalPatientId, clinicId,
      options?): Promise<PatientClinicRecord>
      - If a row exists for (globalPatientId, clinicId), return it
      - Else INSERT and return the new row
      - Bumps last_seen_at if existing
    - findPatientClinicRecord(globalPatientId, clinicId):
      Promise<PatientClinicRecord | null>
    - listPatientClinicRecordsForGlobal(globalPatientId):
      Promise<PatientClinicRecord[]>
    - listPatientClinicRecordsForClinic(clinicId, options?):
      Promise<PatientClinicRecord[]> with pagination

    Type definitions match the schema-spec § 3 column list. Do NOT
    invent fields; if a needed field isn't in the schema spec, STOP
    and document the gap.

B10. Update packages/shared/lib/data/global-patients.ts
     The functions findGlobalPatientById / findGlobalPatientByPhone
     already exist from Build 02. They do NOT change in this prompt.
     If you find a reason to change them, STOP and flag.

B11. Data layer cutover (closes ORPH-V2-08).
     Identify every call site in packages/shared/lib/data/ that
     resolves identity from a phone number, name, or patient row.
     Target list at minimum:
     - patients.ts: findPatientByPhone, searchPatients,
       createWalkInPatient, updatePatient
     - frontdesk.ts: any patient lookup during check-in
     - appointments.ts: patient lookup during scheduling
     - clinical-notes.ts: patient lookup during clinical session save
     - clinical.ts: patient summary lookups

     For each call site:
     - If the call site needs identity (phone, name, DOB), route
       through findGlobalPatientByPhone first, then dereference to
       per-clinic context via getOrCreatePatientClinicRecord
     - If the call site needs per-clinic data only, query through
       patient_clinic_records joined to global_patients (not the
       legacy patients table — but legacy still works via the
       compatibility shim)

     Backwards compatibility: legacy patients reads MUST still
     return correct data via the trigger shim. Do not break callers
     that haven't migrated yet.

API LAYER

B12. Internal admin endpoint
     - GET /api/admin/patient-clinic-records?global_patient_id=...
       Returns all per-clinic records for a global patient.
     - GET /api/admin/patient-clinic-records?clinic_id=...
       Returns all patients for a clinic (paginated, max 100/page).
     - Auth: requireServiceRole only (per Build 02 Fix 5 going-forward
       rule for admin endpoints that resolve identity across clinics).

B13. Audit-action enum additions
     Add the following actions to packages/shared/lib/data/audit.ts
     AS PART OF THIS PROMPT, before the migrations run:
     - PATIENT_CLINIC_RECORD_CREATED
     - QUARANTINE_RESOLVED_PATH_A (phone correction landed)
     - QUARANTINE_RESOLVED_PATH_B (sentinel global_patients row created)
     - USER_DEDUP_FLAGGED (mig 075.7 — non-canonical user marked)
     - USER_DEDUP_CROSS_SIDE_MISMATCH (mig 075.7 — patient/user winner divergence)
     - DATA_LAYER_CUTOVER_COMPLETE (telemetry marker for ORPH-V2-08)

UI LAYER

B14. Verdict: no user-facing UI in this prompt.
     The patient_clinic_records layer is invisible to end users at
     this stage. Patient app surfaces (claim flow, sharing UI, etc.)
     ship in Prompts 4–5 and 10.

     Document explicitly in deliverable's Page Inventory section:
     "N/A — patient_clinic_records is invisible to users until Prompt
     4 (privacy code) and Prompt 10 (patient app)."

I18N LAYER

B15. No new user-facing strings.
     Document N/A in deliverable.

==============================================================
PHASE C — Tests
==============================================================

C0. ORPH-V2-11 closure verification (mig 073.5)
    Apply mig 073.5 first. Then re-run validation script's checks
    22 and 23 (the two FAILs from Build 02 staging apply):

      -- Check 22 — PATIENT_DEDUP_FLAGGED audit count = losers
      SELECT
        (SELECT COUNT(*) FROM public.patients
          WHERE duplicate_of_patient_id IS NOT NULL) AS losers_count,
        (SELECT COUNT(*) FROM public.audit_events
          WHERE action = 'PATIENT_DEDUP_FLAGGED') AS audit_count;
      -- Expect: losers_count = audit_count

      -- Check 23 — GLOBAL_PATIENT_CREATED audit count = gp_count
      SELECT
        (SELECT COUNT(*) FROM public.global_patients) AS gp_count,
        (SELECT COUNT(*) FROM public.audit_events
          WHERE action = 'GLOBAL_PATIENT_CREATED') AS audit_count;
      -- Expect: gp_count = audit_count

    Both checks must now PASS. Document the actual counts. Mark
    ORPH-V2-11 as Closed in the orphan ledger with this verifying
    test.

    Also verify the actor_kind invariant works:
      -- Inserting a 'user' row with NULL actor_user_id must FAIL
      INSERT INTO public.audit_events (action, actor_kind, actor_user_id, target_kind, target_id, metadata)
      VALUES ('TEST', 'user', NULL, 'test', gen_random_uuid(), '{}'::jsonb);
      -- Expect: error from audit_events_actor_consistency CHECK

      -- Inserting a 'system' row with non-NULL actor_user_id must FAIL
      INSERT INTO public.audit_events (action, actor_kind, actor_user_id, target_kind, target_id, metadata)
      VALUES ('TEST', 'system', '<some-uuid>', 'test', gen_random_uuid(), '{}'::jsonb);
      -- Expect: error from audit_events_actor_consistency CHECK

C1. Migration apply test
    Run on a fresh staging clone (or, since Build 02 has already
    applied to medassist-egypt, run on the live state):
    - Apply 073.5, 074, 075 (with quarantine pre-resolved by Mo OR
      sentinel path), 075.2, 075.5, 075.7, 076, 077 in order
    - Capture wall-clock time for each
    - Document any warnings or notices
    - Each migration with a pre-flight assertion (075.2, 075.7) must
      be verified to RAISE EXCEPTION when its precondition is
      violated — test this explicitly by setting one row's
      decided_at IS NULL temporarily, attempting apply, observing
      the failure, then restoring and re-applying

C2. Migration rollback test
    From a fresh state with all 8 migrations applied:
    - Run all 8 rollback files in reverse order:
      077 (triggers) → 076 (clinical refs) → 075.7 (user flags) →
      075.5 (user dedup plan) → 075.2 (NOT NULL flip) →
      075 (quarantine resolution) → 074 (patient_clinic_records) →
      073.5 (audit_events relaxation)
    - Confirm: no compatibility shim triggers, no new columns on
      clinical tables, no patient_clinic_records, no _user_dedup_plan,
      users.is_canonical and duplicate_of_user_id columns gone,
      quarantine table restored, patients.global_patient_id is
      NULL-able again, audit_events.actor_user_id back to NOT NULL
      IF AND ONLY IF no NULL rows remain
    - Document what state CANNOT be recovered (audit_events rows
      written between mig 073.5 apply and rollback are deletable
      via the source='migration_073_backfill_via_073.5' filter; any
      other audit rows written after 073.5 with NULL actor_user_id
      block the NOT NULL re-add — that's intentional, surfaces real
      audit activity that the rollback can't safely revert)

C3. Migration idempotency test
    Run all 8 migrations twice. Second run must either be a no-op or
    fail cleanly with informative error (NOT silently corrupt data).
    Pay extra attention to the dedup-plan tables — a second apply
    must NOT duplicate rows in _user_dedup_plan or _patient_dedup_plan.

C3a. Cross-side dedup parity check
     Specifically verify the expected behavior for the cluster
     +201098765432 (Sara/Mohamed): does the user-side auto-rule
     pick a winner consistent with patient-side? If not, the
     migration logs USER_DEDUP_CROSS_SIDE_MISMATCH and the cluster
     should appear in the manual-review surface for Mo. Document
     the actual outcome.

C4. Cross-reference integrity test (the most important check)
    For every row in encounters, prescriptions, clinical_notes,
    appointments, payments, lab_orders, imaging_orders:
    - encounter.patient_id resolves via patients → global_patient_id
      that EQUALS encounter.global_patient_id
    - encounter.patient_clinic_record_id resolves via
      patient_clinic_records → (global_patient_id, clinic_id) that
      MATCHES encounter.global_patient_id and the clinic context
    Run as SQL test query. Document each table's result. Expect: 0
    inconsistencies per table.

C5. Compatibility shim correctness tests
    Three scenarios per affected table:
    - INSERT with patient_id only → derives both new columns
    - INSERT with global_patient_id + patient_clinic_record_id only
      → derives patient_id
    - INSERT with all three columns mismatched → trigger raises
      EXCEPTION (does NOT silently overwrite)

C6. Existing test suite regression
    Run the full TS test suite. Every test must pass. If any test
    fails because of the new schema, that's a bug in the
    compatibility shim — fix it.

C7. Existing E2E suite (if applicable)
    Run any existing E2E tests on staging post-migration. 100% pass
    required.

C8. Type-check
    npm run type-check — must be clean.

C9. Data layer cutover smoke test
    Pick 5 call sites that were updated in B11. Hit each one
    end-to-end (programmatically, not via UI):
    - Confirm: identical return shape to pre-cutover behavior
    - Confirm: queries hit global_patients first, then dereference
    - Confirm: legacy callers (those not yet cutover) still work via
      the compatibility shim

C10. Quarantine resolution audit
     For every row that was in _phone_normalize_quarantine before
     mig 075:
     - PATH A rows: confirm phone is now valid and normalized
     - PATH B rows: confirm sentinel global_patients row exists with
       account_status='locked' and legacy_phone preserved
     Document the count for each path.

==============================================================
PHASE D — Orphan Ledger Update
==============================================================

D0. CLOSE: ORPH-V2-11 (audit_events.actor_user_id nullability +
    backfill of mig 073's missing audit rows)
    - Verifying test: C0 (validation checks 22 + 23 now PASS,
      actor_kind invariant tests pass)
D1. CLOSE: ORPH-V2-07 (patients.global_patient_id NOT NULL flip)
    - Verifying test: B5 / mig 075.2 + C1 + C2
D2. CLOSE: ORPH-V2-08 (data layer cutover)
    - Verifying test: B11 + C9
D3. RESTATE: ORPH-V2-10 closes when Mo signs off (already restated by
    Build 02 follow-up; confirm no further changes needed)
D4. OPEN: ORPH-V3-01 — patient_clinic_records RLS DENY-ALL placeholder
    - Type: RLS_POLICY
    - Closing prompt: 6
    - Owner: Backend
    - Notes: real policies (clinic-self via membership +
      patient_clinic_records, plus directional cross-clinic access via
      patient_data_shares from Prompt 5) ship in Prompt 6
D5. OPEN: ORPH-V3-02 — compatibility shim triggers (mig 077)
    - Type: DB_TABLE (functional surface)
    - Closing prompt: 6.5 (Legacy Cleanup)
    - Owner: Backend
    - Notes: triggers maintain patient_id ↔ global_patient_id
      consistency until data layer cutover is complete and patient_id
      can be dropped
D6. OPEN: ORPH-V3-03 — _user_dedup_plan review surface beyond Build 02
    - Type: AUDIT
    - Closing prompt: 6.5 (Legacy Cleanup) or earlier if Mo decides
    - Owner: Mo
    - Notes: If mig 075.7 surfaces any USER_DEDUP_CROSS_SIDE_MISMATCH
      audit rows, they need review. The Sara/Mohamed cluster
      (+201098765432) is the known case from Build 02 staging.
      Decision options: (a) accept the mismatch — patient and user
      sides have different canonical winners by design;
      (b) phone-correction follow-up via existing admin scope to
      align both sides; (c) escalate to "two distinct people share a
      phone" handling in Prompt 4+. Default: (a) accept.
D7. OPEN: ORPH-V3-04 — _user_dedup_plan retention beyond Prompt 3
    - Type: DB_TABLE
    - Closing prompt: 6.5 (Legacy Cleanup)
    - Owner: Backend
    - Notes: same lifecycle as _patient_dedup_plan — retain through
      Prompts 4-6 for audit trail, drop in cleanup if needed

==============================================================
PHASE E — Deliverables
==============================================================

Write audits/patient-identity-build-03-results.md with this structure:

1. PHASE A FINDINGS
   - Pre-flight check counts (global_patients, patients, quarantined)
   - patient_id table inventory with row counts
   - Quarantine row inventory with PATH A vs PATH B classification
   - Orphan ledger relevance

2. PHASE B FILE INVENTORY
   For each layer (DB, RLS, Data Layer, API, UI, i18n):
   - Files modified or created with line counts
   - Brief description
   - For UI and i18n: document N/A explicitly with reasoning

3. PAGE INVENTORY
   N/A — patient_clinic_records is invisible to users until Prompt 4
   and Prompt 10. Document this explicitly.

4. PHASE C TEST RESULTS
   Every test command, output, PASS/FAIL. Match Build 02's format.

5. ORPHAN LEDGER DELTA
   - Items closed: V2-07, V2-08 with verifying tests
   - Items opened: V3-01, V3-02 with closing prompts assigned

6. DEVIATIONS FROM PLAN
   Any deviation and why. Apply the principle: production-shape, not
   minimum-viable. If a deviation is "this is simpler at current
   scale," that's not a valid reason — restate the original plan.

7. KNOWN RISKS NOT YET ADDRESSED
   - Items deferred to future prompts
   - Any new orphans created beyond V3-01 and V3-02

8. HAND-OFF NOTES FOR PROMPT 4
   What the next prompt's cowork session needs to know:
   - Which audit-action enum entries are ready
   - Which data layer functions are ready
   - Which orphans Prompt 4 will close

9. STAGING CHECKLIST
   Per the "automate or be detailed" principle: every command Mo runs
   must be copy-pasteable, with expected output noted inline. Match
   Build 02 follow-up's § 5 format.

==============================================================
CONSTRAINTS
==============================================================

- Production-shape, not minimum-viable. Every shortcut must be
  justified beyond "current scale doesn't need it."
- Every code file modified or created must be listed in the deliverable.
- Every test result must include the actual command run and its output.
- If any test fails, STOP. Do not mark complete. Fix and re-run.
- If quarantine resolution requires Mo's manual intervention,
  document exactly what Mo must do BEFORE the migration runs.
- Migrations must be reviewed by Mo before being applied to staging.
- The cowork session creates the migration TEMPLATES; Mo populates
  any data-resolution tables (quarantine resolution) before applying.
- Audit actions added in this prompt MUST update the TS enum in the
  same prompt (per Build 02 follow-up going-forward rule).

==============================================================
SUCCESS CRITERIA
==============================================================

- patient_clinic_records table exists, populated, verified
- _phone_normalize_quarantine fully resolved (count = 0)
- patients.global_patient_id is NOT NULL
- _user_dedup_plan exists, populated, every row has decided_at IS NOT NULL
- users.is_canonical and duplicate_of_user_id columns populated; loser
  count matches the count of cluster losers in _user_dedup_plan
- Cross-side parity check run; any mismatches surfaced to Mo with
  USER_DEDUP_CROSS_SIDE_MISMATCH audit rows; not auto-resolved
- All clinical tables have global_patient_id and
  patient_clinic_record_id columns, populated, indexed
- Compatibility shim triggers in place; both directions tested
- Data layer cutover complete: identity reads route through
  global_patients
- All existing tests still passing (zero regression)
- Build results document written with all 9 sections
- Orphan Ledger updated: V2-07 and V2-08 closed; V3-01 and V3-02
  opened with closing prompts assigned
- All 8 migrations (073.5, 074, 075, 075.2, 075.5, 075.7, 076, 077)
  idempotent (apply twice → no-op or clean failure)
- All 8 migrations rollback-proven (apply, rollback, restore pre-state)
- ORPH-V2-11 closed: audit_events.actor_user_id is nullable with
  actor_kind invariant; mig 073's missing audit rows backfilled;
  validation checks 22 + 23 now PASS
- Pre-flight assertions on 075.2 and 075.7 explicitly tested
  (verified to RAISE EXCEPTION on missing precondition)
- Staging checklist in § 9 of deliverable
```

---

# PROMPT 4 — Build: Privacy Code & Consent Mechanism

```
You are a senior fullstack engineer building the privacy code subsystem
end-to-end. This is the first prompt where user-facing UI is delivered.
Privacy code = the 6-character secret a patient gives to a new clinic
to unlock cross-clinic record visibility. Without it, no clinic sees
another clinic's data.

This prompt also closes two follow-ups owed by Build 03:
- D6 — application data layer cutover for the call sites that touch
  patient identity (patients.ts, frontdesk.ts, appointments.ts,
  clinical-notes.ts, clinical.ts). Build 03 shipped the helpers
  (`identity-resolution.ts`); Prompt 4 actually rewires the callers.
- R1 — sweep the 37 `+200…` recoverable user phones. Quick remediation
  migration that drops the leading zero from each, re-runs the
  normalizer, and creates the global_patients rows that should have
  existed all along.

PRINCIPLE: production-shape, not minimum-viable. Every shortcut taken
now becomes technical debt at scale.

PREREQUISITES:
- Build 03 complete and signed off; staging at the post-mig-081 state.
- audits/EXECUTION_PROMPTS.md (this file) read for locked decisions
  and locked numerics. CRITICAL — do not guess at bcrypt cost,
  privacy code length, alphabet, rate limits, or TTLs. They're in
  this file's "Locked numerics" section.
- audits/patient-identity-schema-spec.md (v2) §§ 5, 5.5 (privacy code
  table + attempts table)
- audits/patient-identity-migration-plan.md (v2) Steps 6, 8 (privacy
  code generation + privacy code attempts)
- audits/patient-identity-build-03-results.md (especially § 6
  deviations D6 + § 7 risks R1; this prompt closes both)
- audits/orphan-ledger.md and audits/orphan-ledger-sop.md
- The actual codebase, particularly:
  - packages/shared/lib/data/audit.ts (use the new actions added in
    Build 03)
  - packages/shared/lib/data/identity-resolution.ts (the helpers
    Build 03 shipped — call sites cut over to these)
  - packages/shared/lib/data/patient-clinic-records.ts
  - packages/shared/lib/sms/ (existing SMS infrastructure for share
    flow)
  - packages/shared/lib/security/ (existing rate-limiting primitives)
  - packages/shared/lib/auth/ (requireServiceRole helper from
    Build 02 follow-up)
  - apps/clinic/app/(frontdesk)/check-in/ (where the privacy code
    entry modal integrates)
  - apps/patient/app/(patient)/patient/ (where the patient app
    privacy code surface lives)

NO-ORPHAN RULE: enforced. Every artifact in this prompt must have a
complete vertical slice (DB + RLS + data layer + API + UI + i18n +
tests) OR be tracked in the Orphan Ledger with a closing prompt.

ORPHAN LEDGER: read at start, update at end.

==============================================================
YOUR SCOPE (and ONLY this scope)
==============================================================

Phase 0 (carryover from Build 03):
0a. R1 sweep — remediation migration for the 37 `+200…` user phones
0b. D6 cutover — rewrite identity-resolving call sites in
    patients.ts / frontdesk.ts / appointments.ts / clinical-notes.ts /
    clinical.ts to use identity-resolution.ts helpers. Closes the
    incomplete part of ORPH-V2-08.

Main scope:
1. patient_privacy_codes table (mig 082) — bcrypt-hashed code per
   global_patient
2. privacy_code_attempts table (mig 083) — append-only audit + rate
   limit substrate
3. SECURITY DEFINER functions:
   - regenerate_privacy_code (system + patient-initiated paths)
   - verify_privacy_code (clinic-initiated, with per-clinic rate
     limit + per-code lockout + uniform timing + atomic audit)
   - check_phone_uniform (returns identical shape AND timing
     regardless of patient existence — closes timing leak)
4. Lazy code minting on first claim — when patient first claims via
   patient app OTP flow, generate code if absent
5. SMS share flow (alternative when patient doesn't have app yet):
   - Egyptian Arabic consent SMS template (verified by native speaker)
   - 5-minute one-time code with single-use enforcement
   - Per-patient send rate limit (no clinic can spam-send)
6. Front desk UI: privacy code entry modal in check-in flow
7. Patient app UI: privacy code display + regenerate
8. Messaging consent re-consent flow (closes ORPH-V2-04 partial)
9. effective_messaging_consent grace view consumed by messaging code

DO NOT in this prompt:
- Touch RLS policies on patient-joined tables (Prompt 6)
- Build patient_data_shares table (Prompt 5)
- Build patient app first-login claim flow beyond what's needed for
  privacy code minting (full claim flow lives in Prompt 10)
- Build the AI consent screen (Prompt 8/10)
- Auto-resolve cross-side dedup mismatches (still ORPH-V3-03 territory)
- Drop any of Build 03's compatibility shim triggers (Prompt 6.5)

==============================================================
PHASE A — Pre-build verification
==============================================================

A1. Verify Build 03 baseline state on staging:
      SELECT
        (SELECT COUNT(*) FROM public.global_patients) AS gp_total,
        (SELECT COUNT(*) FROM public.global_patients WHERE normalized_phone IS NULL) AS sentinels,
        (SELECT COUNT(*) FROM public.patients WHERE global_patient_id IS NULL) AS unlinked,
        (SELECT COUNT(*) FROM public.patient_clinic_records) AS pcr_total,
        (SELECT COUNT(*) FROM public._user_dedup_plan WHERE decided_at IS NULL) AS undecided,
        (SELECT COUNT(*) FROM public.users WHERE is_canonical = FALSE) AS user_losers,
        (SELECT COUNT(*) FROM public._phone_normalize_quarantine) AS quarantine_left,
        (SELECT COUNT(*) FROM public.audit_events WHERE action='DATA_LAYER_CUTOVER_COMPLETE') AS marker;
    Build 03 baseline (2026-04-29):
      gp_total=34, sentinels=3, unlinked=0, pcr_total=35,
      undecided=0, user_losers=4, quarantine_left=0, marker=1
    If counts diverge significantly, STOP and ask Mo.

A2. Confirm pgcrypto is installed (we need it for bcrypt + secure
    random byte generation):
      SELECT extname FROM pg_extension WHERE extname = 'pgcrypto';
    Expect: 1 row.

A3. Inventory R1 sweep candidates:
      SELECT row_id, raw_phone, classification
        FROM public._phone_normalize_quarantine_resolved_history
       WHERE classification = 'potentially_recoverable_leading_zero';
    Expect: 37 rows. Document the count. If different, STOP and ask Mo.
    (Note: if Build 03 didn't preserve quarantine history, fall back
    to grepping the audit_events PATH_B rows where
    metadata->>'classification' = 'potentially_recoverable_leading_zero'.)

A4. Inventory D6 cutover targets — every call site in
    packages/shared/lib/data/ that resolves identity from a phone
    number, name, or patient_id-style lookup. Use grep across the
    listed files. Document each call site with:
    - File:line
    - Current behavior (which legacy table/column it queries)
    - Target rewrite (which identity-resolution.ts helper to call)
    - Risk assessment (are there subtle behaviors to preserve?)

A5. Confirm SMS infrastructure exists. Read packages/shared/lib/sms/.
    Document: which provider (Twilio per architecture doc), what
    interface, whether send-rate-limit primitive exists. If missing
    pieces, flag and STOP.

A6. Read existing rate-limiting primitives in
    packages/shared/lib/security/. Document the interface. The
    privacy code rate limits (per-clinic 5/hr, per-code 5/hr → 24h
    lockout) MUST use the existing primitives or extend them
    consistently — do not invent a new pattern.

A7. Read existing front-desk check-in flow at
    apps/clinic/app/(frontdesk)/check-in/. Identify the integration
    point for the privacy code modal — where the search-by-phone
    happens, what the current "patient not found" UX is. The new
    modal replaces or extends that.

A8. Read existing patient app shell at apps/patient/app/(patient)/.
    Identify where the privacy page lives or should live. Path per
    locked decisions: apps/patient/app/(patient)/patient/privacy/page.tsx.

A9. Read EXECUTION_PROMPTS.md "Locked numerics" section. Confirm the
    values you'll use:
    - Privacy code: 6 chars, base32 alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`
    - RNG: gen_random_bytes (pgcrypto), NEVER random()
    - Bcrypt cost: 12
    - Per-clinic rate limit: 5 attempts/hr/(patient, clinic), 1h lockout, no SMS
    - Per-code lockout: 5 failures across all clinics, 24h lockout, SMS to patient
    - SMS-share TTL: 5 minutes
    - check_phone_uniform min response: 50ms
    Note ANY divergence from these values as a deviation needing Mo's input.

A10. Read Orphan Ledger. List every open item and identify which
     ones this prompt closes (V2-04 partial via messaging-consent
     view consumption; V2-08 fully via D6 cutover; possibly others)
     and which ones it opens.

==============================================================
PHASE B — Implementation (vertical slice)
==============================================================

DATABASE LAYER — mig 082 (R1 sweep)

B0a. Mig 082_recover_leading_zero_phones.sql
     Closes Build 03 R1. The 37 `+200xxxxxxxxxxx` user rows are
     recoverable: drop one leading zero after the country code,
     re-run the normalizer, create global_patients rows that should
     have existed in Build 02 if these phones had normalized
     correctly.

     Forward SQL:
     - Pre-flight: SELECT count of candidate rows. If != 37, RAISE
       NOTICE and proceed (some may have been manually fixed; the
       sweep is idempotent on remaining ones).
     - For each candidate row in users (where the audit_events
       history has classification='potentially_recoverable_leading_zero'):
       1. Compute corrected_phone = '+20' || substring(raw_phone from 5)
          (drops the surplus '0' between country code and operator
          prefix).
       2. Verify normalize_phone_e164(corrected_phone) IS NOT NULL.
          If still NULL, log RECOVERY_FAILED audit and skip — leave
          in the historical record but don't break the sweep.
       3. UPDATE users SET phone = corrected_phone, normalized_phone =
          normalize_phone_e164(corrected_phone) WHERE id = candidate_id.
       4. INSERT INTO global_patients (normalized_phone, ...) VALUES (...)
          ON CONFLICT (normalized_phone) DO NOTHING. (If the corrected
          phone collides with an existing canonical patient, the
          user becomes a non-canonical link — flag in audit log.)
       5. Write QUARANTINE_RECOVERED audit row per success.
     - Each user row gets exactly one outcome:
       - QUARANTINE_RECOVERED (success path)
       - RECOVERY_FAILED (still un-normalizable after fix)
       - RECOVERY_COLLIDED (corrected phone matches existing
         global_patients; user attached to existing identity)

     Reverse SQL:
     - Reverse the UPDATE: restore raw_phone from audit metadata
     - Delete the new global_patients rows (only the ones created by
       this migration, identifiable via metadata.source)
     - Delete the audit rows

     Post-conditions:
       SELECT COUNT(*) FROM public.users
        WHERE normalized_phone IS NULL
          AND phone LIKE '+200%';
       -- Expect: 0 (or document any survivors as RECOVERY_FAILED)

       SELECT
         (SELECT COUNT(*) FROM public.audit_events
           WHERE action='QUARANTINE_RECOVERED') AS recovered,
         (SELECT COUNT(*) FROM public.audit_events
           WHERE action='RECOVERY_FAILED') AS failed,
         (SELECT COUNT(*) FROM public.audit_events
           WHERE action='RECOVERY_COLLIDED') AS collided;
       -- Total should sum to 37.

     Add three audit actions to TS enum BEFORE the migration runs
     (per Build 02 follow-up going-forward rule):
     - QUARANTINE_RECOVERED
     - RECOVERY_FAILED
     - RECOVERY_COLLIDED

DATABASE LAYER — mig 083 (privacy_code_attempts)

B1. Mig 083_create_privacy_code_attempts.sql
    Per schema spec § 5.5. Append-only table. Backs both the per-clinic
    rate limit and the audit trail.

    Required columns (schema-spec § 5.5 is canonical; reproduce here):
    - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
    - global_patient_id UUID NOT NULL REFERENCES global_patients(id)
      ON DELETE RESTRICT
    - attempted_by_clinic_id UUID NOT NULL REFERENCES clinics(id)
      ON DELETE RESTRICT
    - attempted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
    - attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    - result TEXT NOT NULL CHECK (result IN (
        'success', 'failure', 'rate_limited', 'locked_out'
      ))
    - ip_address INET
    - user_agent TEXT
    - request_id UUID

    Indices:
    - (global_patient_id, attempted_by_clinic_id, attempted_at DESC) —
      backs the per-clinic rate limit query
    - (global_patient_id, attempted_at DESC) WHERE result IN
      ('failure','locked_out') — backs the per-code lockout query
    - (attempted_at DESC) — backs ops queries

    RLS placeholder DENY-ALL (real policies in Prompt 6).
    Add to Orphan Ledger as ORPH-V4-01.

DATABASE LAYER — mig 084 (patient_privacy_codes)

B2. Mig 084_create_patient_privacy_codes.sql
    Per schema spec § 5. One row per global_patient.

    Required columns (schema-spec § 5 is canonical):
    - global_patient_id UUID PRIMARY KEY REFERENCES global_patients(id)
      ON DELETE CASCADE (when GP is deleted/merged, code goes too)
    - code_hash TEXT NOT NULL  -- bcrypt cost 12
    - generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    - regenerated_count INTEGER NOT NULL DEFAULT 0
    - last_regenerated_at TIMESTAMPTZ
    - attempts_count INTEGER NOT NULL DEFAULT 0  -- per-code, lifetime
    - locked_until TIMESTAMPTZ  -- per-code 24h lockout
    - revoked_at TIMESTAMPTZ  -- soft revoke

    NO PLAINTEXT IS EVER STORED. The function returns the plaintext
    once on generation; thereafter only the hash exists.

    Comment on code_hash:
      'Bcrypt-hashed 6-character privacy code from base32 alphabet
       (excl. 0,1,I,O). Generated via gen_random_bytes
       (cryptographically secure). Cost factor 12.'

    RLS placeholder DENY-ALL — only SECURITY DEFINER paths read.
    Add to Orphan Ledger as ORPH-V4-02.

DATABASE LAYER — mig 085 (privacy_code_sms_tokens)

B3. Mig 085_create_privacy_code_sms_tokens.sql
    Schema spec didn't pre-define this table; design it now,
    production-shape:

    - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
    - global_patient_id UUID NOT NULL REFERENCES global_patients(id)
      ON DELETE CASCADE
    - requesting_clinic_id UUID NOT NULL REFERENCES clinics(id)
      ON DELETE RESTRICT
    - requesting_doctor_id UUID NOT NULL REFERENCES users(id)
      ON DELETE RESTRICT  -- the doctor named in the SMS consent text
    - sms_code_hash TEXT NOT NULL  -- bcrypt cost 12 (same as privacy)
    - created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    - expires_at TIMESTAMPTZ NOT NULL  -- created_at + 5 minutes
    - used_at TIMESTAMPTZ  -- single-use enforcement
    - attempts_count INTEGER NOT NULL DEFAULT 0

    Single-use: verify_sms_code sets used_at on first SUCCESSFUL match;
    subsequent attempts return result='already_used' from
    privacy_code_attempts.

    Per-patient send rate limit: lookup before INSERT — no more than
    3 unused tokens per (global_patient_id, last hour). Prevents
    clinic-spam-send.

    RLS placeholder DENY-ALL.
    Add to Orphan Ledger as ORPH-V4-03.

DATABASE LAYER — mig 086 (SECURITY DEFINER functions)

B4. Mig 086_privacy_code_functions.sql

    Function 1 — generate_privacy_code() RETURNS TEXT
    - Internal helper (not exposed outside)
    - Generates a 6-char string from gen_random_bytes(6) reduced
      against the 32-char alphabet (modulo 32, no bias since 256/32=8)
    - Returns plaintext to caller; caller bcrypt-hashes before storage

    Function 2 — regenerate_privacy_code(p_global_patient_id UUID)
                 RETURNS TEXT
    - SECURITY DEFINER. Caller must be authenticated as the patient
      (auth.uid() = global_patients.claimed_user_id) OR service-role.
    - Generates new plaintext via Function 1
    - bcrypts with cost 12: crypt(plaintext, gen_salt('bf', 12))
    - Atomic transaction:
      - DELETE old patient_privacy_codes row (if any)
      - INSERT new row with code_hash, regenerated_count = old + 1,
        attempts_count = 0, locked_until = NULL, revoked_at = NULL
      - INSERT audit_events row PRIVACY_CODE_GENERATED with
        actor_kind = 'user' OR 'system', actor_user_id = auth.uid()
        OR NULL
    - Returns plaintext (caller gets it, never logs it)
    - Code comment: "RETURN value is the plaintext code, callers
      must NOT log it, store it, or pass through any caching layer."

    Function 3 — verify_privacy_code(
      p_phone TEXT,
      p_code TEXT,
      p_attempted_by_clinic_id UUID,
      p_attempted_by_user_id UUID,
      p_request_id UUID DEFAULT gen_random_uuid()
    ) RETURNS JSONB
    - SECURITY DEFINER. Per Prompt 1 v2 Change 2, three-step ordering:

      Step 0 — per-clinic rate limit
        v_recent := COUNT(*) FROM privacy_code_attempts
                    WHERE global_patient_id = (resolved from p_phone)
                      AND attempted_by_clinic_id = p_attempted_by_clinic_id
                      AND attempted_at > NOW() - INTERVAL '1 hour'
                      AND result IN ('failure','locked_out','rate_limited');
        IF v_recent >= 5 THEN
          INSERT privacy_code_attempts (... result='rate_limited');
          (no SMS — per locked decision; clinic spam isn't worth alerting)
          RETURN { success: false, requires_code: true };

      Step 1 — per-code lockout
        IF patient_privacy_codes.locked_until > NOW() THEN
          INSERT privacy_code_attempts (... result='locked_out');
          RETURN { success: false, requires_code: true };

      Step 2 — hash compare (bcrypt is constant-time per OpenBSD spec)
        v_match := crypt(p_code, code_hash) = code_hash;
        IF v_match THEN
          INSERT privacy_code_attempts (... result='success');
          UPDATE patient_privacy_codes SET attempts_count = 0;
          (NOTE: this function does NOT create patient_data_shares;
          that's Prompt 5's responsibility. This function returns
          the global_patient_id on success and lets the caller
          create the share.)
          RETURN { success: true, global_patient_id: <uuid> };
        ELSE
          INSERT privacy_code_attempts (... result='failure');
          UPDATE patient_privacy_codes SET attempts_count = attempts_count + 1;
          IF new attempts_count >= 5 THEN
            UPDATE patient_privacy_codes SET locked_until = NOW() + INTERVAL '24 hours';
            -- TRIGGER SMS to patient (per locked decision)
            -- Implementation: write a notification row that the
            -- existing SMS sender picks up; do NOT inline-send from
            -- a SECURITY DEFINER function.
          RETURN { success: false, requires_code: true };

    UNIFORM RESPONSE: every failure returns the SAME shape
    `{ success: false, requires_code: true }`. NO error codes that
    distinguish "rate_limited" from "locked_out" from "code_invalid"
    from "no such patient." Clients see exactly one of two outcomes.

    UNIFORM TIMING: Per Prompt 1 v2 Change 3. The function must take
    ≥ 50ms wall-clock regardless of which branch fires. Use
    clock_timestamp() + pg_sleep to pad. The bcrypt verify alone
    takes ~400ms at cost 12; the timing pad matters most for the
    Step 0 rate-limited path (which currently returns fast). Pad
    that branch.

    ATOMIC: every branch's INSERT to privacy_code_attempts MUST be
    in the same transaction as the patient_privacy_codes UPDATE
    (where applicable). Per § 16.1 transactional invariants.

    Function 4 — check_phone_uniform(p_phone TEXT) RETURNS JSONB
    - SECURITY DEFINER. Per Prompt 1 v2 Change 3.
    - Always returns `{ exists: false, requires_code: true }`.
    - TIMING INVARIANT: ≥ 50ms wall-clock. Implementation:
      v_start := clock_timestamp();
      v_dummy := EXISTS (SELECT 1 FROM global_patients
                          WHERE normalized_phone = normalize_phone_e164(p_phone));
      v_actual_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;
      IF v_actual_ms < 50 THEN
        PERFORM pg_sleep((50 - v_actual_ms) / 1000.0);
      END IF;
      RETURN jsonb_build_object('exists', false, 'requires_code', true);
    - STABLE not VOLATILE (deterministic shape; lookup discarded)
    - Used by frontdesk's phone-search input. Replaces any current
      direct-search endpoint that returns "patient not found"
      vs "patient found at another clinic" differently.

    Function 5 — initiate_sms_share(
      p_phone TEXT,
      p_requesting_clinic_id UUID,
      p_requesting_doctor_id UUID,
      p_request_id UUID DEFAULT gen_random_uuid()
    ) RETURNS JSONB
    - SECURITY DEFINER.
    - Per-patient send rate limit: counts recent unused/active
      tokens for the global_patient. > 3 → reject with uniform shape.
    - Generates 4-digit numeric SMS code (different from the 6-char
      privacy code; SMS codes are short for read-aloud over phone)
    - bcrypts with cost 12
    - INSERT into privacy_code_sms_tokens with expires_at = NOW + 5min
    - Triggers SMS via existing sms infrastructure with Egyptian
      Arabic consent text:
        "عيادة [clinic_name] طلبت إذنك لرؤية سجلاتك الطبية.
         الكود: [4-digit]. صالح لمدة 5 دقائق فقط.
         لو ما طلبتش الإذن ده، تجاهل الرسالة."
      VERIFY: native Egyptian Arabic speaker reviews this text
      before merge. Document the speaker's name in the deliverable.
    - Returns uniform `{ requires_code: true }` regardless of
      whether the phone matched a global_patient. (Privacy: don't
      leak existence via "we sent SMS" vs "no SMS sent.")

    Function 6 — verify_sms_code(...) — same shape as
    verify_privacy_code, but checks privacy_code_sms_tokens with
    single-use enforcement (sets used_at on success).

    All 6 functions:
    - SECURITY DEFINER
    - Documented atomic transaction boundaries per § 16.1
    - Permissions: GRANT EXECUTE TO authenticated, anon (the
      check_phone_uniform path is callable pre-auth from front desk)
    - Tests: forced-failure cases for transaction rollback (per
      audit hardening rule)

DATA LAYER — D6 cutover (Build 03 follow-up)

B5. Rewrite identity-resolving call sites in
    packages/shared/lib/data/. Use identity-resolution.ts helpers.

    Target call sites (from Build 03 § 7 R2 + this prompt's A4):
    - patients.ts:findPatientByPhone — replace direct
      patients.normalized_phone query with
      resolveOrCreateGlobalIdentity + dereference via
      patient_clinic_records for the calling clinic
    - patients.ts:searchPatients — same pattern
    - patients.ts:createWalkInPatient — uses
      resolveIdentityForClinic which handles the
      "is this patient already at another clinic?" case
      uniformly — returns the matching global identity if
      found, or creates a new one
    - patients.ts:updatePatient — preserves clinic_id scoping;
      writes to per-clinic record fields; identity-level changes
      (name correction, DOB) update the canonical patients row
    - frontdesk.ts:searchByPhone — replaces direct
      patients.phone query with check_phone_uniform via the
      new SECURITY DEFINER function
    - frontdesk.ts:checkInPatient — uses resolveIdentityForClinic
    - appointments.ts:findOrCreateAppointmentPatient — same
    - clinical-notes.ts:resolvePatientForSession — same
    - clinical.ts:lookupPatientByPhone — same

    For each call site:
    - Old behavior preserved (same return shape, same error cases)
    - New helper invoked
    - Audit row written if the call mutated identity (e.g., new
      patient created → audit_events.GLOBAL_PATIENT_CREATED via
      the helper)
    - Tests: every call site has at least one passing test
      pre-cutover; rerun after cutover; must still pass

    Build 03's compatibility shim triggers (mig 081) keep the DB
    consistent regardless of which side a caller writes to. After
    this cutover, every Prompt 4-touched call site writes through
    the global side; legacy callers (in apps/clinic that haven't
    been migrated) still work via the shim.

    THIS CLOSES ORPH-V2-08 fully (Build 03 deferred per-call-site
    rewrite; Prompt 4 finishes it).

B6. Wire identity-resolution into the new privacy code paths
    - regenerate_privacy_code is called via a TS wrapper at
      packages/shared/lib/data/privacy-codes.ts
    - verify_privacy_code is called via TS wrapper that handles
      the audit-side concerns (uniform timing on the TS layer too,
      since network latency varies)
    - check_phone_uniform is called via TS wrapper that matches the
      SQL function's contract

DATA LAYER — messaging consent (closes ORPH-V2-04 partial)

B7. Update messaging code paths to read effective_messaging_consent
    view, not patient_clinic_records.consent_to_messaging directly.

    Find the existing call sites that check messaging consent. The
    state-of-code audit (Prompt 0) flagged the messaging-consent
    module location. Update each:

    - OLD:
        SELECT consent_to_messaging
          FROM patient_clinic_records
         WHERE global_patient_id = $1 AND clinic_id = $2;

    - NEW:
        SELECT effective_consent
          FROM effective_messaging_consent
         WHERE global_patient_id = $1 AND clinic_id = $2;

    The view is the bridge: it returns TRUE if the new column is
    TRUE OR (legacy per-doctor consent is present AND within 90-day
    grace window). After 90 days post-mig 074 (the new mig 074 from
    Build 03, NOT mig 074 from migration plan v2 — name collision,
    document carefully), legacy fallback drops out and only the
    new column counts.

    THIS CLOSES the partial of ORPH-V2-04. The full close (drop the
    view) is still ORPH-V2-05's territory.

API LAYER

B8. POST /api/clinic/patients/check-phone
    - Body: { phone: string }
    - Auth: requireApiRole('frontdesk') OR requireApiRole('doctor')
    - Calls check_phone_uniform via Supabase RPC
    - Returns the uniform JSONB shape (forwards SECURITY DEFINER
      function output unchanged)

B9. POST /api/clinic/patients/verify-privacy-code
    - Body: { phone: string, code: string }
    - Auth: requireApiRole('frontdesk') OR requireApiRole('doctor')
    - Calls verify_privacy_code via Supabase RPC
    - On success, returns { success: true, global_patient_id }
    - On failure, returns { success: false, requires_code: true }
      uniformly
    - The CALLER (frontdesk app) is responsible for then creating
      a patient_data_shares row. Build 5 will provide the helper;
      for now, document this as an inline TODO referenced to
      Prompt 5.

B10. POST /api/clinic/patients/initiate-sms-share
     - Body: { phone, doctor_id }
     - Auth: requireApiRole('frontdesk')
     - Calls initiate_sms_share
     - Returns uniform `{ requires_code: true }`
     - Triggers SMS via existing infrastructure

B11. POST /api/clinic/patients/verify-sms-code
     - Same shape as verify-privacy-code but for the 4-digit SMS
       code

B12. GET /api/patient/me/privacy-code
     - Auth: requireApiAuth (patient) — the patient must own this
       global_patients row (auth.uid() = claimed_user_id)
     - Returns the patient's current privacy code IF the patient
       has minted one; otherwise returns 404 (patient hits
       /regenerate to mint)
     - This endpoint NEVER returns the plaintext directly from
       storage (it isn't stored). Plaintext is only returned by
       /regenerate at mint time.

B13. POST /api/patient/me/privacy-code/regenerate
     - Auth: requireApiAuth (patient)
     - Calls regenerate_privacy_code via Supabase RPC
     - Returns { code: string } — the plaintext, ONE TIME
     - The patient app shows it once, with a copy button + a
       "regenerate" warning ("if you regenerate, the old code
       won't work").

UI LAYER — Front desk

B14. Privacy code entry modal
     - File: apps/clinic/components/frontdesk/PrivacyCodeEntryModal.tsx
     - Triggered when frontdesk searches by phone and the patient
       might be at another clinic (via check_phone_uniform).
       Modal title: "إدخال كود الخصوصية"
       Body: "المريض ده عنده سجلات في عيادة تانية. اطلبي منه كود
              الخصوصية ال 6 حروف، أو ابعتي كود عبر SMS لو مش معاه
              الكود."
     - Two paths:
       1. Manual entry — input field for 6 chars (uppercase only,
          base32 alphabet), submit button → calls verify-privacy-code
       2. SMS — button "إرسال كود عبر SMS" → calls
          initiate-sms-share, modal shifts to SMS code entry
          (4-digit input)
     - Error handling: uniform error text — "الكود غير صحيح أو لا
        يوجد سجل" — never reveals whether the phone existed
     - Successful unlock → modal closes, frontdesk continues with
       cross-clinic data visibility

B15. Integrate modal into check-in flow
     - File to modify: apps/clinic/app/(frontdesk)/check-in/page.tsx
     - When phone search returns the uniform "requires_code"
       result (via check_phone_uniform), show the modal
     - When privacy code verifies successfully, frontdesk gets
       global_patient_id and proceeds to the regular check-in flow
       (now with cross-clinic record access via the directional
       consent that Prompt 5 will create)

UI LAYER — Patient app

B16. Privacy code display
     - File: apps/patient/app/(patient)/patient/privacy/page.tsx
     - Shows current privacy code (large, copyable)
     - "Regenerate" button with confirmation modal
     - Egyptian Arabic explainer:
       "ده الكود اللي بتديه للسكرتيرة لما تروح عيادة جديدة وعايز
        الدكتور يشوف سجلك"
     - When regenerated, plaintext shown once with explicit warning
     - All strings in apps/patient/i18n/ar.ts (or shared with
       packages/shared/lib/i18n/ar.ts depending on i18n architecture)

UI LAYER — Re-consent flow (closes ORPH-V2-02)

B17. Re-consent prompt blocking patient home
     - File: apps/patient/components/patient/MessagingReConsentPrompt.tsx
     - Triggers on first patient app open post-mig 074 IF the
       patient has any clinic in patient_clinic_records with legacy
       consent_to_messaging behavior
     - One screen per clinic with active legacy consent:
       "عيادة [clinic_name] كانت بتقدر تبعتلك رسائل قبل تحديث النظام.
        تحب تكمل كده، ولا تختار يبعتلك رسائل في الحالات دي بس؟"
       - Yes, keep messaging on (writes consent_to_messaging = TRUE,
         consent_to_messaging_granted_at = NOW(),
         audit MESSAGING_CONSENT_RECONFIRMED)
       - No, turn off messaging (writes consent_to_messaging = FALSE
         and audits MESSAGING_CONSENT_REVOKED)
     - Block patient home (shell route) until every clinic with
       active legacy consent has been answered
     - On completion, route to home

I18N LAYER

B18. Add all new strings to packages/shared/lib/i18n/ar.ts
     (or the patient app's i18n location). At minimum:
     - Privacy code modal labels (frontdesk + patient)
     - SMS share consent prompt
     - Re-consent prompt (per-clinic)
     - Error messages (uniform — same string for code failures
       regardless of cause)
     - Confirmation modal text for regenerate
     - Egyptian Arabic, NOT MSA. Document the speaker who reviewed.

==============================================================
PHASE C — Tests
==============================================================

C1. Migration apply + rollback (all 5 new migrations: 082-086)
    - Apply each in order
    - Capture timing
    - Rollback in reverse order
    - Idempotency: apply twice → no-op

C2. R1 sweep verification
    - Pre-sweep: 37 candidate users
    - Post-sweep: 37 should be classified into RECOVERED / FAILED /
      COLLIDED categories. Sum = 37.
    - For RECOVERED rows: confirm normalized_phone IS NOT NULL,
      global_patient_id IS NOT NULL.
    - For COLLIDED rows: confirm user is now linked to existing
      canonical patient (the existing global_patient already had a
      canonical user; the recovered phone joins as non-canonical).
    - For FAILED rows: confirm the user.normalized_phone is still
      NULL (the recovery didn't unstick it for unknown reasons —
      flag for manual follow-up via ORPH-V4-04).

C3. Privacy code generation distribution test
    - Generate 10,000 codes
    - For each character position (1-6), assert frequency of each
      symbol in the 32-char alphabet is within ±5% of uniform
      (10000 / 32 ≈ 312.5; tolerance: 297-328)
    - Catches biased generators

C4. Bcrypt cost verification
    - Hash 10 codes; confirm each takes ~400ms (cost 12 expected
      latency)
    - Document mean + p95

C5. verify_privacy_code three-step ordering test
    - Set up: patient with code "ABC123" (mock value), no prior
      attempts
    - Test 1: 5 valid attempts from clinic A → all succeed,
      no rate limit triggered
    - Test 2: 5 invalid attempts from clinic A → 5th attempt
      returns rate_limited; subsequent attempts also rate_limited
      for 1 hour
    - Test 3: simultaneously, clinic B can still attempt (per-clinic
      isolation works)
    - Test 4: 5 invalid attempts from clinic B → 24-hour per-code
      lockout fires (since attempts_count = 10 across two clinics);
      assert SMS notification triggered (mock)
    - Test 5: 1-hour lockout decay — clinic A can attempt again
      after 1 hour, but per-code lockout prevents success for
      24 hours total

C6. check_phone_uniform timing parity test
    - 100 calls with existing phones, 100 with non-existing
    - Assert: p95 latency difference < 5ms between sets
    - Documents the actual measurements

C7. SMS share single-use enforcement
    - Send share request (issues token)
    - Verify with correct code → success, used_at set
    - Verify with same code again → returns already-used (mapped to
      uniform failure shape externally)

C8. SMS share TTL expiry
    - Send share request
    - Wait 5 minutes (or set expires_at to past via test helper)
    - Verify → returns expired (mapped to uniform failure)

C9. SMS share per-patient send rate limit
    - Send 3 share requests for same global_patient → all OK
    - Send 4th → rejected with uniform shape

C10. Audit transactional rollback test
     - Force audit_events INSERT to fail (insert a row with bad
       FK temporarily)
     - Run regenerate_privacy_code
     - Confirm patient_privacy_codes row was NOT created (atomic
       rollback worked)
     - Confirm verify_privacy_code likewise (privacy_code_attempts
       row writes are part of same transaction as the
       patient_privacy_codes UPDATE)

C11. D6 cutover regression test
     - Run the existing TS test suite for packages/shared/lib/data/
     - All tests must pass post-cutover
     - Pay extra attention to patients.ts and frontdesk.ts test
       suites (the highest-traffic call sites)
     - Type-check clean

C12. Messaging consent migration
     - Pre-mig: legacy patient_consent_grants row exists for a
       patient
     - Post-mig: patient_clinic_records.consent_to_messaging is FALSE
     - effective_messaging_consent view returns TRUE during 90-day
       grace
     - After re-consent flow runs (B17): consent_to_messaging is
       TRUE, audit_events.MESSAGING_CONSENT_RECONFIRMED row exists
     - effective_messaging_consent view still returns TRUE
       (regardless of whether the legacy row is within grace)

C13. Privacy leak black-box test
     - Time and shape responses for:
       - check_phone_uniform with valid phone of existing global_patient
       - check_phone_uniform with invalid phone of nonexistent
       - verify_privacy_code with right code
       - verify_privacy_code with wrong code, valid phone
       - verify_privacy_code with anything, nonexistent phone
     - All shapes IDENTICAL
     - All timings within ±5ms p95

C14. SMS Egyptian Arabic verification
     - Native Egyptian Arabic speaker reviews the consent SMS
       template, the modal text, and the re-consent prompt
     - Document the speaker's name in the deliverable
     - Capture any text changes; revise

C15. Front desk E2E flow
     - Frontdesk searches phone → modal appears
     - Frontdesk asks for code, types it → success
     - global_patient_id flows through to check-in
     - patient_data_shares row creation deferred to Prompt 5
       (verify the call site is wired, returning a "share creation
       pending Prompt 5" stub)

C16. Patient app E2E flow
     - Patient logs in (assumes claim flow exists; lazy mint on
       first claim)
     - Patient navigates to /patient/privacy
     - Sees code (large, copyable)
     - Taps regenerate, confirms → new code shown
     - Reload → new code matches DB

C17. Re-consent flow E2E
     - Test patient with legacy consent in clinic_consent_grants
     - First patient app open → re-consent modal blocks home
     - Each clinic gets a Yes/No
     - Counts of Yes/No write correct rows
     - Subsequent patient app open → no modal (sentinel set)

==============================================================
PHASE D — Orphan Ledger Update
==============================================================

D1. CLOSE: ORPH-V2-02 (re-consent prompt)
    - Verifying test: B17 + C17 + presence of MESSAGING_CONSENT_RECONFIRMED
      audit rows from real test patients

D2. CLOSE: ORPH-V2-04 partial → fully (messaging code reads view)
    - Verifying test: C12 confirms effective_messaging_consent view
      is the read source for messaging dispatch

D3. CLOSE: ORPH-V2-08 fully (per-call-site cutover complete)
    - Verifying test: C11 + grep audit confirming every identified
      call site reads through identity-resolution.ts

D4. RESTATE: ORPH-V2-05 (drop view 90 days post-cutover) — unchanged,
    now visible date is 90 days from mig 074 apply

D5. RESTATE: ORPH-V2-09 (drop legacy_phone) — unchanged, still
    blocked on sentinel patient reconciliation

D6. OPEN: ORPH-V4-01 — privacy_code_attempts RLS DENY-ALL placeholder
    - Type: RLS_POLICY, Closing prompt: 6, Owner: Backend

D7. OPEN: ORPH-V4-02 — patient_privacy_codes RLS DENY-ALL placeholder
    - Type: RLS_POLICY, Closing prompt: 6, Owner: Backend

D8. OPEN: ORPH-V4-03 — privacy_code_sms_tokens RLS DENY-ALL placeholder
    - Type: RLS_POLICY, Closing prompt: 6, Owner: Backend

D9. OPEN: ORPH-V4-04 — RECOVERY_FAILED row review
    - Type: AUDIT, Closing prompt: 6.5, Owner: Mo
    - Notes: any user row that failed sweep recovery (still
      normalized_phone IS NULL after the leading-zero fix) needs
      manual investigation. Likely a data-shape edge case the
      heuristic didn't anticipate. Review during Prompt 6.5 cleanup.

D10. OPEN: ORPH-V4-05 — patient_data_shares row creation on verify
     - Type: DATA_LAYER, Closing prompt: 5, Owner: Backend
     - Notes: verify_privacy_code returns global_patient_id on
       success but does NOT create the patient_data_shares row.
       Prompt 5 ships the shares table + the wire-through. This
       orphan tracks the gap.

D11. OPEN: ORPH-V4-06 — full patient app surface beyond privacy
     - Type: UI, Closing prompt: 10, Owner: Patient App
     - Notes: privacy page exists; full app (records, history,
       sharing list, dependents, etc.) lands in Prompt 10

==============================================================
PHASE E — Deliverables
==============================================================

Write audits/patient-identity-build-04-results.md with all 9 sections
(matching Build 03's format). Page Inventory must include:

| Feature | Page Path | URL Route | Component File | Tested On |
|---|---|---|---|---|
| Privacy code entry (front desk) | apps/clinic/app/(frontdesk)/check-in/page.tsx | /frontdesk/check-in | PrivacyCodeEntryModal.tsx | Pixel 6 + iPhone SE |
| SMS code request (front desk) | (same) | (same) | (within modal) | (same) |
| Privacy code display (patient app) | apps/patient/app/(patient)/patient/privacy/page.tsx | /patient/privacy | PrivacyCodeCard.tsx | Pixel 6 + iPhone SE |
| Re-consent prompt | apps/patient/app/(patient)/patient/(post-claim)/messaging-consent/ | /patient/messaging-consent (modal route) | MessagingReConsentPrompt.tsx | Pixel 6 + iPhone SE |

PRIVACY LEAK TEST RESULTS (mandatory — paste C13 output)
- Document timing measurements for all 5 response cases
- Document response body shapes
- Confirm uniform output

SMS TEMPLATE VERIFICATION (mandatory — paste C14 output)
- Native Egyptian Arabic speaker name
- Final approved text
- Any revisions made

i18n KEYS ADDED (list every new key with English equivalent)

DEVIATIONS FROM PLAN (this prompt)
Apply the production-shape principle: any deviation must be justified
beyond "current scale doesn't need it."

==============================================================
CONSTRAINTS
==============================================================

- Production-shape, not minimum-viable. Every shortcut must be
  justified beyond "current scale doesn't need it."
- Privacy leak test (C13) must PASS — uniform shape AND timing.
  Failure = launch-blocker.
- SMS template MUST be reviewed by named native Egyptian Arabic
  speaker. Document name in deliverable.
- Audit transactional invariants enforced (per § 16.1). Force-failure
  tests required (C10).
- No new architectural decisions without flagging to Mo first.
- Every new audit action MUST be in TS enum BEFORE its migration runs.
- D6 cutover must include per-call-site grep confirmation in deliverable.
- R1 sweep is a deviation in spirit (we said "leave for next phase"
  earlier; Mo reversed on 2026-04-29). Document the reversal.

==============================================================
SUCCESS CRITERIA
==============================================================

- All 5 new migrations (082-086) applied, idempotent, rollback-proven
- R1 sweep complete: 37 candidates classified into RECOVERED / FAILED
  / COLLIDED with audit trail
- Privacy code system functional: regenerate, verify, lockout, SMS
  share, single-use enforcement, all working end-to-end
- Per-clinic rate limit + per-code lockout work as locked decisions
- check_phone_uniform timing parity verified (p95 difference < 5ms)
- D6 cutover complete: every identified call site reads through
  identity-resolution.ts; ORPH-V2-08 fully closed
- Messaging consent flow ships re-consent UI + view consumption;
  ORPH-V2-02 closed; V2-04 partial fully closed
- All tests green (regression + new)
- SMS template approved by named Egyptian Arabic speaker
- Privacy leak black-box test PASSES (C13)
- Build results document written with all 9 sections + Page Inventory
- Orphan Ledger updated: V2-02, V2-04 partial, V2-08 closed; V4-01
  through V4-06 opened with closing prompts
- Egyptian Arabic strings in i18n; no MSA leaks
```

---

# PROMPT 5 — Build: Patient Data Shares & Lifecycle (incl. Audit Hardening)

```
You are a senior fullstack engineer building the data shares table and
the consent lifecycle (grant, expire, auto-renew, revoke) end-to-end.
This prompt also hardens the audit logging discipline that the Prompt 0
audit revealed is broken.

PREREQUISITES:
- Prompt 4 complete (privacy code system in place)
- audits/orphan-ledger.md has open item for share-creation logic from
  Prompt 4 — this prompt closes it.

NO-ORPHAN RULE: enforced.
ORPHAN LEDGER: read at start, update at end.

YOUR SCOPE:
- patient_data_shares table (extending or migrating patient_visibility per
  Prompt 1's schema spec — NOT throwing it away; the prior engineer got
  the philosophical structure right, just at the wrong scope)
- Share creation on privacy code / SMS code verify (closes Prompt 4 orphan)
- Auto-renewal trigger on encounter creation
- Revocation + extend APIs (patient app)
- Cron expiry job with patient notification
- Patient app UI: active shares list, revoke modal, extend modal
- AUDIT HARDENING: convert all privacy-event audit writes from
  fire-and-forget to synchronous + transactional
- DO NOT yet rewrite RLS policies (Prompt 6)

==============================================================
PHASE A — Pre-build verification
==============================================================

A1. Confirm Prompt 4 endpoints exist with TODO placeholders for share
    creation.
A2. Read existing cron infrastructure in apps/clinic/app/api/cron/.
A3. Read existing audit log writer at packages/shared/lib/data/audit.ts.
A4. Identify EVERY current call site of logAuditEvent in the codebase
    and document whether each is awaited or fire-and-forget. Per the
    Prompt 0 audit, at minimum these are fire-and-forget today and
    must be fixed:
    - packages/shared/lib/api/handlers/clinic/share-patient/handler.ts:41
    - packages/shared/lib/api/handlers/patient/sharing/handler.ts:87
A5. Read Orphan Ledger.

==============================================================
PHASE B — Implementation (full vertical slice + audit hardening)
==============================================================

DATABASE LAYER

B1. Migration: patient_data_shares
    - Per Prompt 1 schema spec
    - Columns: id, global_patient_id, grantor_clinic_id (the clinic
      whose data is being shared FROM), grantee_clinic_id (the clinic
      receiving access TO that data), granted_at, expires_at (NULL =
      permanent), revoked_at, granted_via (PRIVACY_CODE | SMS_CODE |
      PATIENT_APP), grant_reason, audit_event_id (FK to audit_events
      for traceability)
    - No UNIQUE constraint — patient may grant/revoke/re-grant; each
      grant is a row. Active = WHERE revoked_at IS NULL AND
      (expires_at IS NULL OR expires_at > NOW())
    - Indices: (global_patient_id, grantee_clinic_id), (expires_at)
    - RLS: deny-all placeholder until Prompt 6

B2. Migration: extend audit_events action enum
    - Per Prompt 0 audit, AuditAction is TS-only at audit.ts:5-35
      (no schema enum). Add new actions to TS:
      • CODE_ATTEMPT_SUCCESS
      • CODE_ATTEMPT_FAILURE
      • CODE_ATTEMPT_LOCKED
      • SMS_CONSENT_SENT
      • SHARE_GRANTED (new — distinct from existing SHARE_PATIENT)
      • SHARE_EXTENDED
      • SHARE_REVOKED (new — distinct from existing REVOKE_SHARE,
        which was for the old patient_visibility table)
      • SHARE_AUTO_RENEWED

B3. Migration: data migration for patient_visibility (if applicable)
    - If schema spec from Prompt 1 says merge patient_visibility rows
      into patient_data_shares: write the migration, mark
      patient_visibility as deprecated, do not drop yet (Prompt 6.5
      drops it after RLS rewrite verifies safety)
    - Document the row mapping in
      audits/patient-visibility-migration-mapping.md

DATA LAYER

B4. patient-shares.ts module
    - File: packages/shared/lib/data/patient-shares.ts
    - createShare(globalPatientId, grantorClinicId, granteeClinicId,
      grantedVia, txn): Promise<PatientDataShare>
      • Default expiry: NOW + 90 days
      • Writes audit event in same transaction
    - getActiveShare(globalPatientId, grantorClinicId,
      granteeClinicId): Promise<PatientDataShare | null>
    - extendShare(globalPatientId, granteeClinicId, duration): patient
      action; durations '90_DAYS' | '1_YEAR' | 'PERMANENT'; never
      shortens expiry
    - revokeShare(globalPatientId, granteeClinicId): sets revoked_at;
      audit logged synchronously
    - autoRenewOnVisit(globalPatientId, granteeClinicId): if active
      share exists for ANY grantor clinic, extend each to MAX(current
      expires_at, NOW + 90d). Never shortens.
    - listSharesForPatient(globalPatientId): for patient app

B5. AUDIT HARDENING — make logAuditEvent synchronous + transactional
    - File: packages/shared/lib/data/audit.ts
    - Change: remove try/catch swallowing of errors at audit.ts:46-63.
      The function must throw on failure.
    - Add: logAuditEventOrThrow(action, metadata, txn) variant that
      participates in the caller's transaction
    - Update every call site to either:
      (a) await the call and let errors propagate (default)
      (b) explicitly catch IF AND ONLY IF the audit failure should
          NOT roll back the parent operation (rare; document why)
    - Specifically rewrite these call sites to await + propagate:
      • clinic/share-patient/handler.ts:41
      • patient/sharing/handler.ts:87
      • verify-privacy-code endpoint (Prompt 4)
      • verify-sms-share endpoint (Prompt 4)
      • all share lifecycle calls in this prompt

B6. Wire share creation
    - Modify packages/shared/lib/data/privacy-codes.ts and
      sms-share-codes.ts (from Prompt 4) so verify success calls
      createShare in the same transaction
    - On verify success, return both verify result AND share record
    - This closes the Prompt 4 orphan

B7. Auto-renewal trigger
    - Hook into encounter creation in
      packages/shared/lib/data/encounters.ts
    - Call autoRenewOnVisit
    - This is one of the few places fire-and-forget IS acceptable —
      auto-renewal failure should NOT fail the encounter save. Wrap
      with logged error handler. Document the exception in code
      comment.

API LAYER

B8. Patient revoke endpoint
    - POST /api/patient/sharing/[clinicId]/revoke (in apps/patient/)
    - Re-target the existing endpoint (per Prompt 0 audit, current
      patient/sharing/handler.ts works on patient_visibility — point
      it at patient_data_shares)
    - Audit log SYNCHRONOUSLY (await + transactional)

B9. Patient extend endpoint
    - POST /api/patient/sharing/[clinicId]/extend
    - Body: { duration: '90_DAYS' | '1_YEAR' | 'PERMANENT' }

B10. Patient list shares endpoint
     - GET /api/patient/sharing
     - Re-target from patient_visibility to patient_data_shares
     - Returns active shares: clinic name, granted, expires

B11. Cron: expiry notifications
     - GET /api/cron/expire-stale-shares
     - Logic: find shares that expired in last 24h with no
       auto-renewal, send patient notification:
       "تم انتهاء مشاركة سجلك مع [اسم العيادة]"

UI LAYER

B12. Patient app: active shares list
     - File: apps/patient/app/(patient)/patient/sharing/page.tsx
     - URL: /patient/sharing
     - Re-target the existing page to new endpoints
     - Per share: Revoke button + Extend button
     - Empty state: "ما فيش عيادة عندها صلاحية تشوف سجلك دلوقتي"

B13. Patient app: revoke confirmation modal
     - Component: apps/patient/components/sharing/RevokeShareModal.tsx
     - Egyptian Arabic warning text exactly as locked:
       "د. حسن مش هيقدر يشوف سجلاتك بعد كده، لكن أي ملاحظات هو كتبها
       قبل النهاردة هتفضل في سجل عيادته"
     - Confirm with explicit button: "إلغاء الوصول"

B14. Patient app: extend modal
     - Component: apps/patient/components/sharing/ExtendShareModal.tsx
     - Three options: 90 more days | 1 year | Permanent
     - Egyptian Arabic explainer per option

I18N LAYER

B15. Add all new strings to packages/shared/lib/i18n/ar.ts.
     List in deliverable.

TESTS

B16. Unit tests for patient-shares.ts: 12+ cases
     - Default expiry correctly 90 days
     - Auto-renew extends when active
     - Auto-renew is no-op on revoked
     - Auto-renew never shortens
     - Revoke sets revoked_at
     - Extend with PERMANENT sets expires_at = NULL

B17. Audit hardening tests
     - Force audit_events INSERT to fail (e.g., via mock)
     - Verify createShare ROLLS BACK
     - Verify revokeShare ROLLS BACK
     - Verify the share row does NOT exist after rollback

B18. Integration tests
     - Privacy code verify → share row created in same transaction
       as audit event
     - SMS code verify → share row created
     - Patient visits clinic → share auto-renewed (with audit row)
     - Patient revokes → share revoked, audit logged, both committed
       atomically
     - Expired share doesn't appear in active queries

B19. Concurrency test
     - Two simultaneous extends — last write wins, no duplication

B20. E2E test: patient revokes share, immediately tries action that
     should be blocked → confirms blocked

B21. E2E test: patient extends to permanent → expires_at NULL → still
     active 1 year later (simulated time)

B22. Backport test: every existing call site that previously was
     fire-and-forget is now awaited and synchronous. Pick 5 random
     existing flows and confirm.

==============================================================
PHASE C — Orphan Ledger Update
==============================================================

C1. Close: share-creation orphan from Prompt 4
C2. Close: audit hardening orphan (if previously opened)
C3. Open: patient_data_shares RLS DENY-ALL placeholder (closed by
    Prompt 6)
C4. Open: patient_visibility table deprecation (closed by Prompt 6.5)
C5. Open: full patient app surface beyond sharing page (closed by
    Prompt 10)

==============================================================
PHASE D — Deliverables
==============================================================

Write audits/patient-identity-build-05-results.md with all 8 sections.

PAGE INVENTORY
| Feature | Page Path | URL Route | Component File | Tested On |
|---|---|---|---|---|
| Active shares list | apps/patient/app/(patient)/patient/sharing/page.tsx | /patient/sharing | SharesList.tsx | Pixel 6 + iPhone SE |
| Revoke modal | (same) | (same) | RevokeShareModal.tsx | (same) |
| Extend modal | (same) | (same) | ExtendShareModal.tsx | (same) |

AUDIT HARDENING REPORT
- List every call site that was fire-and-forget before this prompt
- List every call site after this prompt with await/throw discipline
- Document the 1-2 explicit exceptions (e.g., autoRenewOnVisit) with
  reasoning

SUCCESS CRITERIA:
- patient_data_shares functional
- Privacy code & SMS code verify create shares atomically with audit
- Auto-renew on visit works
- Patient revoke + extend APIs work end-to-end
- Cron set up for expiry notifications
- Patient app sharing UI working at apps/patient/.../sharing
- AUDIT WRITES ARE SYNCHRONOUS + TRANSACTIONAL — verified by
  rollback tests
- All tests green
- Page Inventory complete
- Orphan Ledger: share-creation orphan closed, audit-hardening
  orphan closed; new orphans tracked
```

---

# PROMPT 6 — Build: RLS Policy Rewrite (HIGHEST RISK PROMPT)

> **Mission:** Rewrite Row Level Security policies across every
> patient-joined table to enforce the layered identity model:
> doctors/frontdesk see their own clinic's patients, patients see their
> own data, and cross-clinic access is gated by `patient_data_shares`.
> Remove all DENY-ALL placeholders. Remove `createAdminClient` bypasses
> wherever they exist for RLS-defense reasons (not for legitimate
> migration/admin use cases).
>
> **Why this is the highest-risk prompt:** Until now, the application
> layer has been the trust boundary. Today, every API handler
> implicitly trusts itself to enforce "user X can see patient Y."
> After this prompt, the **database** enforces it, and the application
> layer becomes a thin pass-through. This is the right architecture —
> but the cutover is where catastrophic data leaks happen.
>
> **Three failure modes worth losing sleep over:**
> 1. **Cross-clinic data leak** — a doctor at clinic B reads clinic A's
>    notes because a policy WHERE clause is wrong
> 2. **Self-lockout** — a doctor can't read their own clinic's records
>    because a policy UNION condition was off
> 3. **Performance cliff** — every SELECT now runs a subquery that joins
>    3 tables, latency goes from 50ms to 5s, every page in the app
>    hangs
>
> **Estimated cowork time:** 8-12 hours. This is the longest single
> prompt in the program. Do NOT compress.
>
> **Prerequisites:**
> - Prompt 5 complete (patient_data_shares table operational)
> - Build 05 follow-up complete (atomic share creation, cron scheduled)
> - All previous orphans up to ORPH-V5-04 properly tracked
> - Mig 088 (PCR audit trigger) live
> - Mig 089 (auth phone fix) live
> - Staging is at known-clean state with documented seed data

---

## Cowork session brief

You are a senior database security engineer. The job is not to write
clever RLS — it's to write **correct** RLS that's also fast enough to
ship. Cleverness in security policy is how breaches happen.

**Read first (this is non-negotiable):**
- `audits/EXECUTION_PROMPTS.md` (this file, full context)
- `audits/patient-identity-schema-spec.md` § 5 (RLS contract spec)
- `audits/patient-identity-state-audit.md` (what existed before this
  whole program — including any RLS that was already there)
- `audits/patient-identity-build-02-results.md` § 5 (RLS placeholders
  on global_patients)
- `audits/patient-identity-build-03-results.md` § 4 (RLS placeholders
  on patient_clinic_records)
- `audits/patient-identity-build-04-results.md` § 4 (RLS placeholders
  on privacy code tables)
- `audits/patient-identity-build-05-results.md` § 2 (RLS placeholder
  on patient_data_shares)
- `audits/orphan-ledger.md` (every ORPH-V*-RLS entry — they all close
  in this prompt)
- The actual existing RLS policies on every public table:
  ```sql
  SELECT schemaname, tablename, policyname, permissive, roles, cmd,
         qual, with_check
    FROM pg_policies
   WHERE schemaname = 'public'
   ORDER BY tablename, policyname;
  ```
- `packages/shared/lib/supabase/admin.ts` (the createAdminClient surface)
- All call sites of `createAdminClient` — every one is a potential
  RLS bypass that needs to be reviewed

**You will NOT:**
- Drop any table (Prompt 6.5)
- Remove `createAdminClient` itself (it's still needed for
  migrations, cron, audit triggers, server-side admin tasks). You'll
  audit its CALLERS and remove the bypass where the caller should be
  using user-context client instead
- Change application code unless the change is necessary to coexist
  with the new RLS (e.g., a query that worked under DENY-ALL by
  going through admin client but should now go through user client)
- Touch `auth.users` / `auth.identities` (Supabase-managed)
- Add new application features beyond what's required to make tests
  pass

---

## Output contract

You produce:
1. **Pre-migration snapshot** — `audits/rls-pre-migration-snapshot.sql`
   capturing every existing policy verbatim
2. **Helper functions migration** — `supabase/migrations/092_rls_helper_functions.sql`
3. **Per-table RLS migration(s)** — one file per logical group of tables
   (e.g., `093_rls_patient_identity.sql`,
   `094_rls_clinical_data.sql`,
   `095_rls_operations.sql`,
   `096_rls_communication.sql`)
4. **Application code updates** — every callsite of `createAdminClient`
   that should switch to user-context client
5. **Test matrix** — `audits/rls-test-matrix.sql` with 8+ scenarios per
   patient-related table
6. **Performance benchmark** — `audits/rls-performance-benchmark.md`
   comparing pre/post latency on the 10 hottest queries
7. **Rollback rehearsal log** — `audits/rls-rollback-rehearsal.md`
   showing rollback was tested on a fresh clone
8. **Results doc** — `audits/patient-identity-build-06-results.md` with
   all 10 sections (per Phase F below)
9. **Sign-off line** at the end of the results doc — exactly:
   > "I have personally verified that no cross-tenant data leakage
   > is possible under any tested scenario in the matrix."

---

## Phase A — Pre-flight inventory

### A1. Snapshot every existing policy

Save the full `pg_policies` query output to
`audits/rls-pre-migration-snapshot.sql` as a CREATE POLICY ... rebuild
script. This is your rollback artifact. If anything goes wrong, this
file deterministically restores the old state.

For each policy, also capture:
- The table's RLS-enabled state (`SELECT relrowsecurity FROM pg_class`)
- The table's force-RLS state (`SELECT relforcerowsecurity FROM pg_class`)
- Whether the table has any policies at all (a table with RLS enabled
  but no policies is a DENY-ALL — common in our placeholders)

### A2. Inventory every `createAdminClient` callsite

```bash
grep -rn "createAdminClient" packages/ apps/ --include='*.ts' --include='*.tsx'
```

Document each callsite. For each:
- File path + line
- Why was admin client used? (required scope name in the call)
- Is the caller running under a user session (could use createClient
  instead) or in a system context (cron, migration, trigger)?
- Tag each: `KEEP-ADMIN` (legitimate system context), `MIGRATE-TO-USER`
  (was a workaround for missing RLS, now should use user client),
  or `INVESTIGATE` (unclear)

### A3. Inventory every patient-joined table

For Prompt 6 purposes, "patient-joined" means: the table has a column
referencing `global_patients.id`, `patient_clinic_records.id`,
`patients.id`, or any clinic_id column scoped to a patient.

Tables in scope (verify via schema query):
```sql
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_type = 'BASE TABLE'
 ORDER BY table_name;
```

Patient-joined tables (verify each is present, document if missing):
- `global_patients`
- `patients` (legacy, still present until 6.5)
- `patient_clinic_records`
- `patient_data_shares`
- `patient_privacy_codes`
- `privacy_code_attempts`
- `privacy_code_sms_tokens`
- `clinical_notes`
- `prescriptions`
- `prescription_templates`
- `medications`
- `medication_intake_log`
- `lab_results`
- `imaging_orders`
- `appointments`
- `check_in_queue`
- `payments`
- `messages`
- `notifications`
- `audit_events` (special case — see A5 below)
- `doctor_patient_relationships`
- `messaging_consent` (if it exists post-Build-05)

Non-patient tables (also need RLS but simpler):
- `clinics`, `clinic_memberships`, `users`, `doctors`, `templates`,
  `clinic_invites`, `doctor_availability`, `assistant_doctor_assignments`

### A4. Inventory existing tests that touch RLS

```bash
grep -rn "createAdminClient\|RLS\|policy" packages/shared/lib/data --include='*.test.ts'
grep -rn "createClient" apps/ --include='*.test.ts'
```

Document every test file that exercises queries. These need to be
re-run AFTER the RLS rewrite to confirm no test silently passes by
relying on RLS being off.

### A5. Document the audit_events visibility model

`audit_events` is special. The data is sensitive (privacy code attempts,
share grants, etc.) but needs to be:
- Read by clinic owners reviewing their clinic's audit trail
- Read by patients reviewing what's been done to their records
- Written by triggers, migrations, and SECURITY DEFINER functions
  (already does this transparently — no caller needs to change)

The policy must allow:
- A clinic member to read audit rows where `audit_events.clinic_id`
  matches their clinic membership
- A patient to read audit rows where the entity_id in metadata
  resolves to their global_patient_id (more complex — needs a
  helper function)
- All writes go through SECURITY DEFINER functions — INSERT policy
  can be DENY-ALL for non-service roles since callers don't write
  directly

Document the chosen model. This is one of the harder policy designs;
get it right.

---

## Phase B — Helper functions

### B1. `is_clinic_member(p_clinic_id UUID, p_user_id UUID)`

```sql
CREATE OR REPLACE FUNCTION public.is_clinic_member(
  p_clinic_id UUID,
  p_user_id UUID DEFAULT auth.uid()
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER
PARALLEL SAFE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_memberships
     WHERE clinic_id = p_clinic_id
       AND user_id = p_user_id
       AND status = 'ACTIVE'
  );
$$;
```

**Why STABLE (not VOLATILE):** within a single query, the membership
check returns the same result. Postgres caches it. Without STABLE,
the function runs once per row in WHERE clauses — the performance
cliff scenario.

**Why SECURITY INVOKER (not DEFINER):** the helper runs as the
calling user. We're just checking THEIR membership, not bypassing
anything.

### B2. `can_clinic_access_global_patient(p_global_patient_id UUID, p_clinic_id UUID)`

The clinic can access the patient if:
- The clinic has a `patient_clinic_records` row for this patient
  (the patient has been seen at this clinic), OR
- The clinic is a grantee on an active `patient_data_shares` for this
  patient (cross-clinic share)

```sql
CREATE OR REPLACE FUNCTION public.can_clinic_access_global_patient(
  p_global_patient_id UUID,
  p_clinic_id UUID
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER
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
```

### B3. `can_patient_access_global_patient(p_global_patient_id UUID, p_user_id UUID)`

The user can access patient data if:
- They are the claimed user for this global_patient

```sql
CREATE OR REPLACE FUNCTION public.can_patient_access_global_patient(
  p_global_patient_id UUID,
  p_user_id UUID DEFAULT auth.uid()
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER
PARALLEL SAFE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.global_patients
     WHERE id = p_global_patient_id
       AND claimed_user_id = p_user_id
  );
$$;
```

### B4. Performance audit on helpers

Run EXPLAIN ANALYZE on each helper function with a realistic argument:
```sql
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT public.is_clinic_member(
  '<some_clinic_id>',
  '<some_user_id>'
);
```

Document execution time. Each helper should run in <1ms with
proper indexes:
- `clinic_memberships(clinic_id, user_id, status)` — verify index exists
- `patient_clinic_records(global_patient_id, clinic_id)` — verify
- `patient_data_shares(global_patient_id, grantee_clinic_id)` partial
  index `WHERE revoked_at IS NULL` — verify (this exists from
  Build 05 mig 090 as `idx_pds_grantee_clinic_active`)
- `global_patients(id, claimed_user_id)` — verify

If any helper exceeds 1ms, STOP and add the missing index BEFORE
proceeding. Slow helpers = slow RLS.

---

## Phase C — Per-table policy rewrite

### C1. Strategy: PERMISSIVE old + new in parallel, kill switch via flag

For each table, deploy new policies WITHOUT removing old policies:
- Old policy stays as `PERMISSIVE` (default)
- New policy added as `PERMISSIVE`
- Postgres OR-combines all PERMISSIVE policies — access granted if
  EITHER passes

This means: deploying the new policy first NEVER restricts existing
access. We watch for issues, then in a follow-up migration drop the
old policy. **Zero risk of immediate lockout.**

In the LAST migration (`097_rls_drop_legacy_policies.sql`), drop the
old policies. By then, every test in the matrix has passed under the
new policy alone (we explicitly run tests with old policy disabled —
see Phase D).

Caveat: if a table has DENY-ALL placeholders (Prompts 2-5), those
placeholders BLOCK all access until removed. For those tables, we
DROP the placeholder in the same migration that adds the new policy.
This is fine — the placeholder isn't protecting anything; it's
preventing access entirely.

### C2. Patient identity tables

**`global_patients`:**
- SELECT: clinic member who can access this patient (via helper B2)
  OR the claimed patient (via helper B3) OR system role
- INSERT: nobody directly (only mig 074 backfill + verify-handler RPC)
  — DENY for non-service roles
- UPDATE: claimed patient updating their own row (e.g., name change)
  — limited columns. System for everything else.
- DELETE: nobody. Tombstones via `claimed_user_id = NULL` and a
  separate disabled_at flag (out of scope for now).

**`patients` (legacy):**
- Mirror clinical_notes-style policies temporarily (still legacy until
  6.5 drops it). SELECT: clinic member of `patients.clinic_id`. WRITE:
  same.

**`patient_clinic_records`:**
- SELECT: clinic member of `clinic_id` OR claimed patient of the
  global_patient
- INSERT: clinic member (creating a new PCR for their clinic; the
  trigger from mig 088 writes the audit row)
- UPDATE: clinic member updating columns like `consent_to_messaging`,
  `last_seen_at`. Restricted to columns appropriate for clinic UX.
- DELETE: nobody. Tombstones via `is_anonymous_to_global = TRUE`.

**`patient_data_shares`:**
- SELECT: claimed patient (their shares) OR clinic member of grantor
  (shares originating from their clinic) OR clinic member of grantee
  (shares granting their clinic)
- INSERT/UPDATE/DELETE: nobody directly — all writes go through
  SECURITY DEFINER functions from mig 090/091

**Privacy code tables (`patient_privacy_codes`,
`privacy_code_attempts`, `privacy_code_sms_tokens`):**
- SELECT: nobody for the codes themselves (server-only). Patient can
  read their own metadata (via API endpoints, not direct SELECT).
- All writes through SECURITY DEFINER functions
- Effective policy: DENY-ALL for non-service roles. The application
  layer goes through RPCs.

### C3. Clinical data tables

**`clinical_notes`, `prescriptions`, `medications`,
`medication_intake_log`, `lab_results`, `imaging_orders`:**

Each has a clinic_id column (legacy; will go through patient_clinic_records
in 6.5). Until 6.5, the policy is:

- SELECT: clinic member of `clinical_notes.clinic_id`. **Plus, if
  the patient has a cross-clinic share to another clinic and that
  clinic asks, that clinic should ALSO see** — this is the heart of
  the cross-clinic visibility feature.

The cross-clinic SELECT is the most subtle policy in the program.
Consider clinical_notes:
```sql
CREATE POLICY "clinical_notes_select" ON public.clinical_notes
FOR SELECT TO authenticated
USING (
  -- Direct clinic member access
  public.is_clinic_member(clinic_id)
  OR
  -- Cross-clinic share access: the requesting user is a member of
  -- a clinic that has been granted access to this patient's records
  EXISTS (
    SELECT 1 FROM public.patient_clinic_records pcr
    JOIN public.patient_data_shares pds
      ON pds.global_patient_id = pcr.global_patient_id
     AND pds.grantor_clinic_id = clinical_notes.clinic_id
    WHERE pcr.clinic_id = clinical_notes.clinic_id
      AND pcr.global_patient_id = clinical_notes.patient_id  -- or however join works
      AND pds.revoked_at IS NULL
      AND (pds.expires_at IS NULL OR pds.expires_at > NOW())
      AND public.is_clinic_member(pds.grantee_clinic_id)
  )
  OR
  -- Patient can read their own clinical notes
  EXISTS (
    SELECT 1 FROM public.global_patients gp
    WHERE gp.claimed_user_id = auth.uid()
      AND gp.id = clinical_notes.patient_id  -- if patient_id is gpid
  )
);
```

**Critical:** the join shape depends on whether `clinical_notes.patient_id`
is a global_patient_id, a patients.id (legacy), or a patient_clinic_records.id.
Audit the schema and pick the right join. **If the cowork session can't
determine this conclusively from schema, STOP and ask Mo.**

INSERT/UPDATE: clinic member of clinic_id. No cross-clinic write.
DELETE: nobody. (Soft-delete via a status column if needed.)

### C4. Operations tables

**`appointments`, `check_in_queue`, `payments`, `doctor_availability`:**
- SELECT/INSERT/UPDATE/DELETE: clinic member of clinic_id
- No cross-clinic visibility (these are clinic-internal operations)

### C5. Communication tables

**`messages`:**
- SELECT: clinic member of clinic_id OR claimed patient (sender or
  recipient)
- INSERT: same
- UPDATE: limited (e.g., mark-as-read flag); claimed patient or
  clinic member
- DELETE: nobody

**`notifications`:**
- SELECT: user_id matches auth.uid()
- INSERT: anyone with permission to notify the user (system role, or
  a clinic member for clinic-scoped notifications)
- UPDATE: user_id matches auth.uid() (mark as read)
- DELETE: user_id matches auth.uid() (clear notification)

**`audit_events`:**

(Per A5 above, this is special.)
- SELECT: clinic member of `audit_events.clinic_id` OR claimed patient
  whose entity_id resolves to their gpid
- INSERT/UPDATE/DELETE: nobody for non-service roles. All writes go
  through triggers and SECURITY DEFINER functions.

Patient-side audit access is hard. The audit_events table doesn't have
a `global_patient_id` column directly; the gpid is in `metadata`.
Implementation choices:
- (A) Add a generated column `metadata_global_patient_id` that extracts
  `metadata->>'global_patient_id'`, index it, use in policy
- (B) Use `entity_id` when entity_type is patient-related, joined to
  resolve gpid
- (C) Live with patient-side audit visibility being out of scope for
  Prompt 6 and add it later

Pick (A) — clean, performant, doesn't require backfill (existing rows
already have the metadata field). Implementation:
```sql
ALTER TABLE public.audit_events
  ADD COLUMN metadata_global_patient_id UUID
  GENERATED ALWAYS AS (
    NULLIF(metadata->>'global_patient_id', '')::UUID
  ) STORED;

CREATE INDEX idx_audit_events_metadata_gpid
  ON public.audit_events(metadata_global_patient_id)
 WHERE metadata_global_patient_id IS NOT NULL;
```

Then the patient-side policy can use this column directly.

### C6. Non-patient tables

**`clinics`:** SELECT: anyone who is a member of this clinic. INSERT:
authenticated (anyone can create a clinic). UPDATE/DELETE: clinic OWNER only.

**`clinic_memberships`:** SELECT: user is the member OR another member
of the same clinic (so clinic owners can see who's in their clinic).
INSERT/UPDATE: OWNER only. DELETE: OWNER only.

**`users`:** SELECT: row's user OR clinic member of any clinic the row's
user is in. INSERT: through Supabase Auth signup only. UPDATE: row's
user (limited columns). DELETE: nobody (soft-delete).

**`doctors`:** SELECT: any authenticated (public-ish — doctor profiles
are visible to patients booking). UPDATE: row's user. DELETE: nobody.

**`templates`:** SELECT: clinic member of `templates.clinic_id` OR
templates owned by the user. INSERT/UPDATE/DELETE: owner.

### C7. Migration file structure

Split into logical files for clarity:

- `092_rls_helper_functions.sql` — B1, B2, B3 helpers + indexes
- `093_rls_patient_identity.sql` — global_patients, patients,
  patient_clinic_records, patient_data_shares, privacy code tables
- `094_rls_clinical_data.sql` — clinical_notes through imaging_orders
- `095_rls_operations.sql` — appointments, check_in_queue, payments,
  doctor_availability
- `096_rls_communication.sql` — messages, notifications, audit_events
  (including the metadata_global_patient_id generated column)
- `097_rls_non_patient.sql` — clinics, memberships, users, doctors,
  templates
- `101_rls_drop_legacy_policies.sql` — final cutover, drops old
  policies after Phase D matrix passes 100%. (Originally listed as
  `098_*` in the Prompt 6 spec; renumbered to 101 per session-16
  ruling 2026-05-02 to make room for Phase F migs 098/099/100 —
  patient_code schema + RPCs + clinic-resolve RPC. Slot 098 was
  never occupied under the original plan.)

Each file: idempotent (CREATE OR REPLACE for functions, DROP IF EXISTS
+ CREATE for policies), with explicit COMMENT ON POLICY noting which
prompt/build introduced it.

Each file applies cleanly in isolation but the suite is sequential
(092 → ... → 097 → [Phase F: 098, 099, 100] → 101).

---

## Phase D — RLS test matrix

### D1. Matrix design

Build `audits/rls-test-matrix.sql`. Every patient-joined table gets at
least 8 scenarios, executed via SET ROLE / SET LOCAL or via a stored
test harness using `auth.jwt()` simulation.

Per-table scenarios (minimum 8):

1. **Self-clinic SELECT positive:** doctor in clinic A reads patient
   record at clinic A → MUST succeed
2. **Self-clinic SELECT negative:** doctor in clinic A tries to read
   patient record at clinic B (no share) → MUST fail
3. **Cross-clinic SELECT with share:** doctor in clinic B reads
   patient's clinic A record where active share A→B exists → MUST succeed
4. **Cross-clinic SELECT with revoked share:** doctor in clinic B
   reads patient's clinic A record where share A→B was revoked → MUST fail
5. **Cross-clinic SELECT with expired share:** same but share's
   expires_at is in the past → MUST fail
6. **Patient SELF SELECT:** claimed patient reads their own
   clinical_notes (across clinics) → MUST succeed for every clinic
   the patient has been to
7. **Patient OTHER SELECT:** claimed patient X tries to read patient
   Y's records → MUST fail
8. **Frontdesk SELECT same clinic:** frontdesk staff at clinic A
   reads clinic A's records → MUST succeed (same as scenario 1 but
   different role)

Additional per-table scenarios where applicable:

9. **INSERT positive:** clinic member writes to their own clinic
10. **INSERT cross-clinic NEGATIVE:** clinic member tries to write
    to another clinic → MUST fail
11. **UPDATE positive/negative:** same shape
12. **DELETE attempted:** MUST fail for everyone (we don't allow it)
13. **Anonymous SELECT:** unauthenticated request → MUST fail
14. **Wrong-role SELECT:** patient role trying to read clinic-internal
    operations data (e.g., payments) → MUST fail

For the cross-clinic share tests (scenarios 3-5), specifically test:
- The `expires_at IS NULL` case (PERMANENT share) → succeed
- `expires_at > NOW()` → succeed
- `expires_at < NOW()` (just expired) → fail
- `revoked_at IS NOT NULL` → fail regardless of expires_at

### D2. Test harness mechanics

You can't actually log in as different users in the test harness —
you need to simulate JWT context. Two options:

**Option A: SET LOCAL role + JWT claims**
```sql
SET LOCAL role = 'authenticated';
SET LOCAL "request.jwt.claims" = '{"sub":"<user_id>"}';
SELECT * FROM public.clinical_notes WHERE id = '<test_id>';
```

**Option B: SECURITY INVOKER test wrapper functions**
```sql
CREATE OR REPLACE FUNCTION public.test_as_user(
  p_user_id UUID,
  p_query TEXT
) RETURNS SETOF JSONB LANGUAGE plpgsql SECURITY DEFINER
AS $$ ... $$; -- impersonate user, run query
```

Option A is more honest (it actually exercises the RLS path used in
production). Option B is more controllable. **Use Option A.** Document
how to construct the JWT claims that Postgres recognizes.

### D3. Matrix execution

Run the matrix at THREE points:

1. **Before any new policies deployed** — confirm baseline behavior
2. **After new policies deployed but old policies still active** —
   confirm new policies don't break existing access (PERMISSIVE OR)
3. **After old policies dropped (mig 101)** — confirm new policies
   alone are sufficient

The third run is the real test. Anything that fails the third run
must fail loudly and stop the migration.

### D4. Mandatory PASS criteria

- Every cell in the matrix is GREEN at run #3
- A single FAIL is a P0 launch-blocker — DO NOT proceed to drop
  legacy policies, DO NOT mark this prompt as complete
- The deliverable explicitly lists each cell with PASS/FAIL

If any test fails at run #3, STOP. Document. Do NOT attempt to "fix
forward" by tweaking the policy until the test passes — that's how
you ship a broken policy that happens to pass that one test.

Instead: roll back to before mig 101 (where new + old coexist), debug
the policy, re-run the matrix, only proceed when 100% green.

---

## Phase E — Performance benchmarking

### E1. Identify the 10 hottest queries

Read query patterns from the codebase. The hottest are likely:
- Patient queue read (`/api/frontdesk/queue`)
- Patient search by phone (`/api/patients/search`)
- Clinical session load (`/api/clinical/notes/[id]`)
- Doctor dashboard stats (`/api/doctor/stats`)
- Appointment list (`/api/frontdesk/appointments`)
- Notifications fetch (`/api/notifications`)
- Patient sharing list (`/api/patient/sharing`)
- Privacy code verify (already optimized — not RLS-relevant)
- Clinic member lookup (used in every is_clinic_member call)
- Audit events for a clinic (`/api/clinic/audit`)

For each: capture the actual SQL via Postgres `pg_stat_statements`
or by reading the data layer code.

### E2. Benchmark before/after

Run EXPLAIN ANALYZE on each query 5 times before applying RLS rewrite
(record median latency). Apply RLS rewrite. Run same query 5 times,
record median.

Acceptable performance regression: **<30% increase in p50 latency**.

If any query regresses by more than 30%:
- Identify which RLS predicate is the bottleneck (EXPLAIN ANALYZE
  output will show it)
- Add an index to make the predicate fast
- Re-benchmark

If even with indexes a query regresses >30%, document and consult Mo
before proceeding. There may be a structural change needed
(e.g., denormalize a join into a column) that's out of Prompt 6's
scope.

### E3. Benchmark deliverable

`audits/rls-performance-benchmark.md` with table:

| Query | Pre-p50 | Post-p50 | Δ% | Verdict |
|---|---|---|---|---|
| ... | 47ms | 52ms | +10.6% | PASS |

---

## Phase F — Application code updates

### F1. Audit `createAdminClient` callsites against A2 inventory

For every callsite tagged `MIGRATE-TO-USER` in A2:
- Replace `createAdminClient(scope)` with `createClient()` (user
  context)
- Verify the operation now succeeds with the new RLS in place
- If it fails, the new RLS is too restrictive — go back to Phase C
  and adjust the policy
- Document the migration in the deliverable

For every callsite tagged `KEEP-ADMIN`:
- Verify the scope name documents WHY admin is needed
- Common legitimate scopes: `'audit-trigger'`, `'cron'`,
  `'migration-helper'`, `'service-role-intent'`
- Reject scopes that look like RLS bypasses (`'temporary-fix'`,
  `'TODO'`, `'workaround'`)

For every callsite tagged `INVESTIGATE`:
- Read the calling code carefully
- Determine the right answer (KEEP-ADMIN or MIGRATE-TO-USER)
- Document reasoning in the deliverable

### F2. Re-run existing tests

Run the full existing test suite from A4. Every test that previously
passed must still pass. New failures = the test was implicitly
relying on RLS being off. Investigate each.

### F3. Add minimum new application tests

Beyond the SQL matrix in Phase D, add at least 5 application-level
integration tests (TS):
- Doctor at clinic A successfully reads patient at clinic A
- Doctor at clinic A gets 0 rows when querying patient at clinic B
  with no share
- Doctor at clinic A gets rows when querying patient at clinic B with
  active share
- Patient logged in to patient app reads their own records across
  multiple clinics
- Patient gets 0 rows when querying another patient's records

These exercise the same paths as the SQL matrix but through the actual
application code paths, which is what catches regressions in
day-to-day development.

---

## Phase G — Rollback rehearsal

### G1. Why rehearsal matters

If something breaks in production, you need to know rollback works
without testing it for the first time on production. Rehearsal on
staging proves the rollback path.

### G2. Rehearsal procedure

On a fresh clone of staging (NOT staging itself):
1. Apply migs 092-101 (Phase C 092-097 + Phase F 098/099/100 + legacy-drop 101)
2. Verify cross-clinic visibility works (run abbreviated matrix)
3. Run rollback: drop helper functions, drop new policies, restore
   policies from `audits/rls-pre-migration-snapshot.sql`
4. Verify the system returns to pre-Prompt-6 state
5. Re-apply migs 092-101 to confirm idempotency

Document all 5 steps in `audits/rls-rollback-rehearsal.md`. Include
exact commands run + exact output.

If staging cannot be cloned (no infra for it), document this as a
risk and proceed with caution. The deliverable should explicitly note
that rollback is documented but not tested in this case.

---

## Phase H — Sign-off and deliverable

### H1. Final verification before sign-off

- Phase A inventory documented
- Phase B helpers deployed and benchmarked
- Phase C migrations applied 092-097, Phase F migrations 098/099/100, legacy-drop 101
- Phase D matrix run 3× — all PASS at run #3
- Phase E benchmark — all queries within 30% regression
- Phase F app code updated, all tests pass
- Phase G rollback rehearsed (or documented as untested)

### H2. Results doc structure

Write `audits/patient-identity-build-06-results.md` with 10 sections:

1. **Pre-flight inventory** (Phase A outputs)
2. **Helper functions** (Phase B with benchmark numbers)
3. **Per-table policies** (Phase C — document every policy added)
4. **Test matrix results** (Phase D — full matrix output, every cell)
5. **Performance benchmark** (Phase E table)
6. **Application code updates** (Phase F — every callsite changed,
   reasoning per change)
7. **Rollback rehearsal** (Phase G)
8. **Honest gaps** — anything deferred, including but not limited to:
   - Legacy `patients` table policies (will become irrelevant in 6.5)
   - Performance regressions accepted with documented reasoning
   - Scenarios excluded from the matrix with reasoning
9. **Orphan ledger updates** — close every ORPH-V*-RLS entry,
   open new ones if any (e.g., post-RLS performance optimization
   work)
10. **Sign-off line:**
    > "I have personally verified that no cross-tenant data leakage
    > is possible under any tested scenario in the matrix."

---

## Constraints

- Migration files applied in sequence 092 → ... → 097 → [Phase F: 098, 099, 100] → 101
  (original spec said "7 migration files, 092-098"; the Phase F security
  rebuild for patient_code added 3 migs at 098/099/100, and the legacy
  drop moved to slot 101 per session-16 renumbering ruling 2026-05-02)
- All helpers `STABLE SECURITY INVOKER`, indexed appropriately
- All policies `PERMISSIVE` (default)
- Old policies coexist with new during runs #1 and #2; only dropped
  in mig 101 after run #3 passes
- DO NOT drop legacy `patient_visibility` (Prompt 6.5)
- DO NOT remove `createAdminClient` itself
- DO NOT change `auth.users` policies (Supabase-managed)
- DO NOT proceed to mig 101 if any matrix cell fails
- Idempotent migrations (re-applying = no-op)
- Rollback rehearsed on a clone, NOT on staging

## Success criteria

- All 7 migrations applied to staging
- Test matrix 100% PASS at run #3
- All 10 hottest queries within 30% performance regression
- Every `createAdminClient` callsite is reviewed and either kept with
  documented justification or migrated to user-context client
- Application test suite is fully green
- Rollback procedure rehearsed and documented
- Deliverable written with all 10 sections
- Sign-off line included

## What this prompt is NOT

- Not legacy cleanup (Prompt 6.5)
- Not the dependent account flow (Prompt 7)
- Not patient app v1 (Prompt 10)
- Not E2E network flow verification (Prompt 11)

When this prompt's deliverable lands, the database itself enforces
the privacy model. The application layer becomes a thin pass-through
for what RLS already determines. This is the architectural goal of
the entire patient identity network program.

---

## Special note for the cowork session

This prompt is the longest and most complex in the program. If at any
point during execution you encounter genuine ambiguity that the
specification doesn't resolve, **STOP and surface the question to Mo
before guessing.** The cost of asking is 1 hour. The cost of guessing
wrong on an RLS policy is a privacy breach.

Specific places where ambiguity is most likely:
- The shape of patient_id foreign keys in clinical_data tables (is it
  global_patient_id, patients.id, or something else?)
- Whether `audit_events.metadata_global_patient_id` generated column
  works with all existing rows (some rows may not have the field in
  metadata)
- Whether to use Option A or Option B for test harness if Option A
  fails to set JWT context properly
- The right scope for `KEEP-ADMIN` callsites — when in doubt, treat
  as `INVESTIGATE` and ask

There's no shame in asking. There's a lot of shame in shipping a
breach.


---

# PROMPT 6.5 — Build: Legacy Cleanup

```
You are a senior backend engineer cleaning up legacy schema artifacts
that the new model has obsoleted. RLS rewrite (Prompt 6) verified the
new policies work without dropping legacy columns/tables. Now we
remove what's safe to remove.

PREREQUISITES:
- Prompt 6 complete with sign-off line confirming no cross-tenant leakage
- Staging has been running new RLS policies for at least 24 hours with
  the existing application code (which still reads patients.clinic_id
  via compatibility shim)
- Mo has explicitly approved this cleanup prompt running

NO-ORPHAN RULE: This prompt closes the legacy-shim orphans from
Prompts 2, 3, 5.
ORPHAN LEDGER: read at start, update at end.

YOUR SCOPE:
- Refactor data layer to read from global_patients +
  patient_clinic_records instead of patients
- Drop patients.clinic_id (the column the auditor flagged as the
  most-touching dependency)
- Drop patient_visibility (rows already migrated to patient_data_shares
  in Prompt 5)
- Drop dead tables flagged by Prompt 0 audit:
  • anonymous_visits (Ghost Mode killed)
  • opt_out_statistics (Ghost Mode counter)
  • patient_recovery_codes (zero readers/writers)
  • audit_log (legacy; callers migrated to audit_events)
- Drop or rename patients.unique_id (now superseded by privacy code)
- Remove the compatibility-shim triggers added in Prompt 3
- Move PrivacyCodeEntryModal from apps/clinic/components/frontdesk/
  to packages/ui-clinic/components/frontdesk/ (architectural alignment
  per ARCHITECTURE.md § 2; introduced as a relative-import drift in
  Build 04 D7 cleanup, 2026-04-29 — `'../../../../components/frontdesk/
  PrivacyCodeEntryModal'` is the only deep-relative path in the clinic
  app and should match how every other frontdesk component is imported)
- PHONE HARDENING (defense in depth — added 2026-04-30 after the Build
  04 mig 089 auth/public phone divergence taught us this whole class of
  bug exists). Specifically:
  • Resolve ORPH-V4-04 (bf98c1a5) — manually correct the user's phone
    to a valid E.164 form on both `public.users` and `auth.users`,
    or accept the row as permanently locked and flag for deletion.
    This unblocks Layer 1 below from being added without `NOT VALID`.
  • LAYER 1: Add CHECK constraint on public.users.phone enforcing
    Egyptian E.164 format `^\+201[0125]\d{8}$`. Once V4-04 is
    resolved, the constraint can be added without `NOT VALID` and
    enforce on every existing row.
  • LAYER 2: Add AFTER UPDATE trigger on public.users.phone that
    syncs the normalized form to auth.users.phone (one direction
    only — public is canonical). SECURITY DEFINER function. Idempotent.
  • LAYER 3: Audit every code path that writes to public.users.phone.
    Grep for `INSERT INTO public.users` / `UPDATE public.users` /
    seed scripts touching the phone column. Every write must go
    through `normalizeEgyptianPhone()` (TS) or `normalize_phone_e164()`
    (SQL) before the value lands. Fix any leak point.
  • LAYER 5b: Seed-script post-insert assertion. Add a DO block at
    the end of every seed script (or a shared helper) that runs the
    auth/public phone mismatch query and RAISES if count > 0.
    Catches future seed-data regressions in CI before they ship.
  • Skip LAYER 4 (BEFORE INSERT normalize trigger) — overlaps with
    LAYER 1, redundant.
  • Skip LAYER 6 (monitoring query) — runs as ad-hoc, doesn't need
    a code change.

==============================================================
PHASE A — Pre-build verification
==============================================================

A1. Confirm Prompt 6 sign-off in audits/patient-identity-build-06-results.md.
A2. Run a 24-hour grep across staging logs for any reads from
    patients.clinic_id, patient_visibility, anonymous_visits,
    opt_out_statistics, patient_recovery_codes, audit_log,
    patients.unique_id. Document any read activity.
A3. If any of the dropped surfaces have been read in the last 24h,
    STOP and identify the caller.
A4. Read Orphan Ledger; confirm legacy-shim orphans exist as expected.

==============================================================
PHASE B — Implementation
==============================================================

DATA LAYER REFACTOR

B1. Inventory every read of patients.clinic_id in the codebase
    (target list per Prompt 0 audit Section I includes
    patients.ts:240-252, patients.ts:660-666, mig 052:50-52).
B2. For each, refactor to read clinic_id via patient_clinic_records
    instead. Where multiple clinic associations exist for one global
    patient, the call site must specify which clinic context it's
    operating in (this is always available via the calling user's
    clinic membership).
B3. Same for patients.unique_id readers — switch to
    global_patients.privacy_code (or equivalent per Prompt 4 spec).
B4. Audit all callers of audit_log (legacy module) and migrate to
    audit_events.

DATABASE LAYER

B5. Migration: drop compatibility-shim triggers (added Prompt 3)
B6. Migration: drop patients.clinic_id
    - Drop FK constraint
    - Drop column
    - Drop any indices that reference it
B7. Migration: drop patient_visibility (rows migrated in Prompt 5)
    - Drop RLS policies
    - Drop table
B8. Migration: drop anonymous_visits, opt_out_statistics,
    patient_recovery_codes
B9. Migration: drop audit_log (legacy)
B10. Migration: drop patients.unique_id (or rename to
     legacy_unique_id with deprecation comment if any external
     dependency exists)

API LAYER

B11. Audit API routes for any references to dropped surfaces; remove
     dead endpoints.
B12. /api/patients/anonymous (handler at handlers/patients/anonymous/
     handler.ts:12-38) — DELETE entirely (Ghost Mode killed per
     locked decisions)

UI LAYER

B13. Confirm no UI references the dropped surfaces. Search apps/clinic/
     and apps/patient/ for: anonymous_visits, opt_out, ghost.
B14. Page Inventory: verify no removed UI is still linked from nav.
B14a. Move PrivacyCodeEntryModal to packages/ui-clinic/.
     - Source: apps/clinic/components/frontdesk/PrivacyCodeEntryModal.tsx
     - Destination: packages/ui-clinic/components/frontdesk/PrivacyCodeEntryModal.tsx
     - Reason: Build 04 D7 cleanup parked the file in apps/clinic/
       with a deep-relative import (`'../../../../components/frontdesk/
       PrivacyCodeEntryModal'`) because the root tsconfig has no
       `@/components/*` alias and the cleanup brief forbade adding one.
       Per ARCHITECTURE.md § 2, all frontdesk components belong in
       packages/ui-clinic/components/frontdesk/.
     - Update the import in apps/clinic/app/(frontdesk)/frontdesk/
       checkin/page.tsx from the relative path to
       `import { PrivacyCodeEntryModal } from '@ui-clinic/components/
       frontdesk/PrivacyCodeEntryModal'`.
     - Verify no other callers exist (grep `PrivacyCodeEntryModal`
       across the repo).
     - Run `npm run type-check` after the move; expect 0 errors.

PHONE HARDENING (ORPH-V4-04 closure + defense-in-depth)

B14b. Resolve ORPH-V4-04 first (gates B14c-e).
     - User: bf98c1a5-eba6-4f60-9af3-34e5237b2177 (frontdesk)
     - Current state: public.phone='+2001000001' (malformed),
       normalized_phone=NULL, auth.phone='2001000000001'
     - Decision Mo must make:
       (a) Determine the user's actual phone, manually correct
           BOTH `public.users.phone` (re-running through
           normalize_phone_e164) AND `auth.users.phone` in a
           single transaction.
       (b) Accept the row as permanently locked. Soft-delete
           by setting `public.users.disabled_at = NOW()` (if such
           a column exists; otherwise add one in a tiny prep
           migration). Document permanent lockout in the user row.
     - After resolution, V4-04 row in audit_log captures
       AUTH_PHONE_MANUALLY_CORRECTED with metadata.before/after.

B14c. Add CHECK constraint on public.users.phone.
     ```sql
     ALTER TABLE public.users
       ADD CONSTRAINT users_phone_e164_egyptian_check
       CHECK (
         phone IS NULL OR
         phone ~ '^\+201[0125]\d{8}$'
       );
     ```
     - Pre-flight: SELECT COUNT(*) FROM public.users WHERE phone IS
       NOT NULL AND phone !~ '^\+201[0125]\d{8}$'. Must return 0
       (with V4-04 resolved). If non-zero, STOP and identify rows.
     - The constraint enforces E.164 Egyptian shape on every future
       INSERT/UPDATE. Closes the data shape question once and for all.

B14d. Add public→auth phone sync trigger.
     ```sql
     CREATE OR REPLACE FUNCTION public.tg_sync_auth_phone()
     RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
     SET search_path = public, pg_temp AS $$
     BEGIN
       IF NEW.phone IS DISTINCT FROM OLD.phone THEN
         UPDATE auth.users
            SET phone = REPLACE(NEW.phone, '+', '')
          WHERE id = NEW.id;
       END IF;
       RETURN NEW;
     END;
     $$;

     CREATE TRIGGER tg_sync_auth_phone_trg
       AFTER UPDATE OF phone ON public.users
       FOR EACH ROW EXECUTE FUNCTION public.tg_sync_auth_phone();
     ```
     - Verify trigger fires by updating one user's phone via SQL,
       checking auth.users.phone matched the new value within the
       transaction.
     - Test rollback: a failed UPDATE on auth.users (impossible row,
       e.g., FK violation) must roll back the public.users UPDATE
       too. AFTER UPDATE triggers run inside the txn — verified.

B14e. Application-layer phone-write audit.
     - Run grep across the codebase:
       ```bash
       grep -rn "INSERT.*INTO.*users.*phone\|UPDATE.*users.*phone\|users.*VALUES.*phone" \
         packages/ apps/ supabase/migrations/
       grep -rn "normalizeEgyptianPhone\|normalize_phone_e164" packages/ apps/
       ```
     - Compare the lists. Every write to users.phone MUST go through
       normalizeEgyptianPhone (TS) or normalize_phone_e164 (SQL).
     - Document any leak point found. Fix in same PR as B14c-d.
     - Note: B14c CHECK constraint is the safety net — the audit is
       about UX (clear errors at app layer beats raw Postgres CHECK
       violations propagating as 500s).

B14f. Seed-script post-insert assertion.
     - Add to every seed script that writes to users.phone (and
       to a shared helper if one exists):
       ```sql
       DO $$
       DECLARE v_count INT;
       BEGIN
         SELECT COUNT(*) INTO v_count FROM public.users u
         JOIN auth.users au ON au.id = u.id
         WHERE u.phone IS NOT NULL AND au.phone IS NOT NULL
           AND replace(u.phone, '+', '') != au.phone;
         IF v_count > 0 THEN
           RAISE EXCEPTION
             'Seed produced % auth/public phone mismatches', v_count;
         END IF;
       END $$;
       ```
     - Catches the bug class that produced mig 089 within the seed
       script itself, before it gets committed.

I18N LAYER

B15. Remove obsolete strings (e.g., Ghost Mode labels) from ar.ts.

TESTS

B16. Full E2E suite — must be 100% green on the cleaned-up codebase
B17. RLS test matrix from Prompt 6 — re-run, must still pass without
     legacy fallback paths
B18. Migration apply + rollback test (rollback restores compatibility
     shim, NOT the dropped data — document that user data isn't
     recoverable from rollback alone; full restore requires backup
     + re-migrate)
B19. Code coverage check: confirm no test references the dropped
     surfaces (would indicate missed callers)

==============================================================
PHASE C — Orphan Ledger Update
==============================================================

C1. CLOSE: compatibility-shim trigger orphans from Prompt 3
C2. CLOSE: patient_visibility deprecation orphan from Prompt 5
C3. CLOSE: any audit_log migration orphans
C4. Confirm no legacy-cleanup orphans remain.

==============================================================
PHASE D — Deliverables
==============================================================

Write audits/patient-identity-build-06-5-results.md.

DROPPED INVENTORY
| Surface | Type | Drop reason | Caller refactor count |
|---|---|---|---|
| patients.clinic_id | Column | Replaced by patient_clinic_records | (count) |
| patient_visibility | Table | Migrated to patient_data_shares | (count) |
| anonymous_visits | Table | Ghost Mode killed | (count) |
| opt_out_statistics | Table | Ghost Mode killed | (count) |
| patient_recovery_codes | Table | Zero usage | 0 |
| audit_log | Table | Legacy, callers migrated | (count) |
| patients.unique_id | Column | Replaced by privacy code | (count) |

PAGE INVENTORY: any UI removed (likely none beyond /api/patients/
anonymous handler removal)

CONSTRAINTS:
- This is the most destructive prompt in the program. Mo must approve
  the full migration plan before any DROP statement runs.
- Production data is unrecoverable from rollback after this prompt.
  Backup verification before applying is mandatory.
- E2E suite must be 100% green before AND after this prompt.

SUCCESS CRITERIA:
- All listed surfaces dropped
- Data layer reads no longer reference patients.clinic_id
- Compatibility-shim triggers removed
- E2E suite 100% green post-cleanup
- Orphan Ledger: legacy-cleanup orphans closed; remaining orphans
  are only Phase 2/3 deferred or patient-app-completion items
```

---

# PROMPT 7 — Audit + Build: Dependent Account Flow

[Full prompt text covers: AUDIT phase to determine current state of
caregiver/dependent code with file:line evidence; STOP for Mo review;
then BUILD phase to add dependent_account_links table, RLS extension to
include caregiver path, API endpoints for add/remove/list/act-as,
patient app UI with dependents list page, add dependent flow,
acting-as banner, dependent's records visible to caregiver but not
to other caregivers.]

KEY DELIVERABLES:
- audits/dependent-account-state.md (Phase A — STOP for review)
- audits/patient-identity-build-07-results.md (Phase B)
- Page Inventory must include:
  | Dependents list | apps/patient/app/(patient)/patient/dependents/page.tsx | /patient/dependents | DependentsList.tsx |
  | Add dependent | apps/patient/app/(patient)/patient/dependents/add/page.tsx | /patient/dependents/add | AddDependentForm.tsx |
  | Acting-as banner | (global patient layout) | (all /patient/* routes) | ActingAsBanner.tsx |
- Caregiver scenarios in global RLS test matrix all PASS
```

---

# PROMPT 8 — Build: Anonymous Clinical Observations (AI Pipeline)

[Full prompt text covers: anonymous_clinical_observations table with
coarse age band/governorate/season/specialty (no patient identity
fields), patient consent toggle default ON, nightly batch pipeline,
hashing utility for source_encounter_id (one-way), k-anonymity gate
(k≥5), patient settings UI for AI consent toggle, re-identification
test that produces "cannot identify" verdict.]

KEY DELIVERABLES:
- audits/patient-identity-build-08-results.md
- Page Inventory must include:
  | AI consent toggle | apps/patient/app/(patient)/patient/settings/page.tsx | /patient/settings | AiConsentToggle.tsx |
- K-anonymity gate works (rejects under-threshold rows)
- Re-identification test result documented
- Consent opt-out deletes prior rows
```

---

# PROMPT 9 — Build: Pharmacy/Lab Schema Infrastructure

[Full prompt text covers: fulfillment_status fields on prescriptions
and lab_orders, reserved schema (commented in spec, NOT applied) for
future pharmacies/labs/prescription_dispensings/lab_order_fulfillments,
internal helpers prescriptions.markDispensed and
lab_orders.deliverResults, forward-compat simulation tests.]

KEY DELIVERABLES:
- audits/patient-identity-build-09-results.md
- audits/reserved-schema.md (future-only DDL)
- Page Inventory: N/A (no UI in this prompt)
- Opens (expected at v1): pharmacy and lab UIs deferred to Phase 2/3
```

---

# PROMPT 10 — Build: Patient App v1 (Records + Consent + Messaging)

[Full prompt text covers: patient login (phone + OTP), patient claim
flow when records exist before account, patient home with all visits
across all clinics (the network view), records page with detail view,
real PDF generation for prescriptions with embedded Egyptian Arabic
font (closes prescription_pdf orphan from feature audit), inbox and
conversation pages for basic doctor messaging, patient bottom nav,
RTL+i18n verification for every screen, mobile viewport testing,
performance check (Slow 3G + 4x CPU).]

KEY DELIVERABLES:
- audits/patient-identity-build-10-results.md
- Page Inventory (LARGEST in program — minimum 12 entries):
  | Patient login | apps/patient/app/(auth)/patient-login/page.tsx | /patient-login | PatientLoginForm.tsx |
  | Patient home | apps/patient/app/(patient)/patient/dashboard/page.tsx | /patient/dashboard | PatientHomePage.tsx |
  | Records list | apps/patient/app/(patient)/patient/health/page.tsx | /patient/health | RecordsList.tsx |
  | Record detail | apps/patient/app/(patient)/patient/health/[id]/page.tsx | /patient/health/[id] | RecordDetail.tsx |
  | Privacy hub | apps/patient/app/(patient)/patient/privacy/page.tsx | /patient/privacy | (from Prompt 4) |
  | Active shares | apps/patient/app/(patient)/patient/sharing/page.tsx | /patient/sharing | (from Prompt 5) |
  | Settings | apps/patient/app/(patient)/patient/more/page.tsx | /patient/more | SettingsPage.tsx |
  | AI consent | (settings page) | /patient/more | (from Prompt 8) |
  | Dependents | apps/patient/app/(patient)/patient/dependents/page.tsx | /patient/dependents | (from Prompt 7) |
  | Inbox | apps/patient/app/(patient)/patient/messages/page.tsx | /patient/messages | InboxList.tsx |
  | Conversation | apps/patient/app/(patient)/patient/messages/[clinicId]/page.tsx | /patient/messages/[clinicId] | ConversationView.tsx |
  | Doctor message inbox (clinic side) | apps/clinic/app/(doctor)/messages/page.tsx | /doctor/messages | DoctorInbox.tsx |
- Closes: prescription_pdf HTML→real-PDF orphan
- Closes: all patient app orphans from prior prompts
- Remaining open items must be Phase 2/3 deferred only
```

---

# PROMPT 11 — End-to-End Network Flow Verification

[Full prompt text covers: 13 canonical tests covering Ahmed-visits-two-
clinics flow, drug interaction firing on cross-clinic data (THE NETWORK
MOMENT documented with screenshot), auto-renewal, revocation with
immutable past, privacy leak negative test with lockout + SMS
notification, SMS code share, patient app coverage, dependent caregiver
flow, PDF download with Arabic verification, AUDIT INTEGRITY (forced
audit failure rolls back the parent transaction), LEGACY CLEANUP
verification (dropped surfaces stay dropped — patients.clinic_id,
patient_visibility, anonymous_visits, opt_out_statistics,
patient_recovery_codes, audit_log all return errors when queried),
Orphan Ledger final check.]

KEY DELIVERABLES:
- audits/patient-identity-e2e-network-test.md
- Screenshots of hero moment (Test 4 step 23)
- Final Orphan Ledger snapshot — all items must be Closed or
  "Phase 2/3 deferred"
- Sign-off line: "I have personally verified the patient identity
  network flow works end-to-end as specified."

CONSTRAINTS:
- This prompt FAILS if Orphan Ledger has unjustified open items
- This prompt FAILS if any test 1-13 fails
- This prompt FAILS if SMS consent language not verified by named
  Egyptian Arabic native speaker
- This prompt FAILS if audit-integrity test shows fire-and-forget
  pattern still present at any privacy-sensitive call site
- This prompt FAILS if any dropped surface is still queryable

If ANY test fails, no advance to closed beta. Period.
```

---

## Notes on usage

- Each cowork session reads this file at start to understand context
- Each cowork session updates the Status Tracker table at the top when complete
- Each cowork session writes the named result file in `audits/`
- War room thread (Mo + Claude) gates between every prompt — no auto-chaining
- If a build prompt fails or partially completes, document state in the result file and pause
- Never skip the No-Orphan check; never skip the Page Inventory
- The full text of Prompts 4, 5, 6, 7, 8, 9, 10, 11 lives in war-room messages — abbreviated here for file size; refer to those for canonical text

