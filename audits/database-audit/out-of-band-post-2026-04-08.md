# Out-of-Band Schema Changes Post-2026-04-08

**Captured:** 2026-05-03
**Author:** Audit Session C continuation + apply phase
**Status:** Living record (append new findings as they surface)
**Companion docs:**
- `audits/database-audit/out-of-band-2026-04-08.md` (Session A finding — the 2026-04-08 RLS hardening fixes themselves)
- `audits/database-audit/preapply-scan-mig100-101-102.md` (the discovery vehicle for finding #1)

---

## Purpose

Document untracked schema changes that occurred between the 2026-04-08 RLS hardening fixes (Session A's enumeration baseline) and the 2026-05-03 foundation-audit + apply phase. Each finding represents drift that the original audit (Sessions A, B, C) did not capture but was caught during apply-phase verification.

The intent is twofold:
1. **Accountability trail.** Every drift finding has a recorded provenance. Future contributors can see "this column / policy / function was touched out-of-band on this date with this rationale" rather than encountering unexplained schema state.
2. **Pattern surfacing.** Multiple findings of the same shape (e.g., manual enumeration missed a thing programmatic enumeration caught) are a process-level signal worth codifying as Empirical Lessons.

---

## Finding 1: `front_desk_staff.clinic_id` column drop + policy rewrite

**Discovered:** 2026-05-03 during mig 100 application failure (`column "clinic_id" does not exist`).

**Discovery vehicle:** Pre-apply scan of policy bodies and column shapes for tables migs 100-102 reference. Documented in `audits/database-audit/preapply-scan-mig100-101-102.md` § "Mig 100 — front_desk_staff".

**What changed (best-effort temporal reconstruction):**

| Date | State | Source |
|---|---|---|
| 2026-04-08 (apply of `enable_rls_on_unprotected_tables`) | `front_desk_staff.clinic_id` column existed; the SQL `CREATE POLICY ... USING (clinic_id IN (SELECT cm.clinic_id FROM clinic_memberships cm WHERE cm.user_id = auth.uid() AND cm.status = 'ACTIVE'))` succeeded. | `supabase_migrations.schema_migrations.statements` row 20260408145102 |
| Some date in 2026-04-08 → 2026-05-03 (untracked, dashboard-applied) | `front_desk_staff.clinic_id` column dropped; the dependent policy `Clinic members can view frontdesk staff in same clinic` was simultaneously rewritten to a `clinic_memberships`-mediated form using `cm_target.role = ANY (ARRAY['FRONT_DESK', 'ASSISTANT'])`. | Live state inspection 2026-05-03 |
| 2026-05-03 (today) | Live `front_desk_staff` has 4 columns: `id, unique_id, full_name, created_at`. The rewritten policy is in force. | `information_schema.columns` and `pg_policies` queries 2026-05-03 |

**Captured by:** mig 100 file edit (PART 3 header subsection + body replacement). The migration file now declares the live, post-rewrite policy body — the `clinic_id`-direct USING form is preserved in `schema_migrations.statements` row 20260408145102 for forensic reference but no longer in the migration tree.

**Why was it missed by the original audit:**
- Session A enumerated `schema_migrations` rows that had no corresponding `.sql` file.
- Session B recovered the SQL bodies from `schema_migrations.statements`.
- **Neither session verified that the recovered SQL still applied cleanly against current schema.** The 2026-04-08 SQL referenced a column (`front_desk_staff.clinic_id`) that was valid then but had been dropped since.
- The mig 094a `frontdesk_invoice_requests` finding (Session B's structural-drift spot-check) was a related but not identical signal — Session B suggested that pattern was "likely systematic," but the systematic check was deferred to Phase F task #5 rather than applied to mig 100 inputs pre-apply.

**Pattern:** *audit captured what existed, but didn't verify temporal validity of recovered SQL against current state.* Codified as **Empirical Lesson #9**.

**Phase F follow-up implication:** Phase F task #5 (`front_desk_staff`-in-policy targeted re-scan) is now upgraded from "should do" to "must complete before Phase 7+ migrations that reference `front_desk_staff`." Recommended workflow: enumerate every `pg_policies.qual` and `pg_policies.with_check` text containing `front_desk_staff`, cross-reference against `front_desk_staff` actual column list, surface any policy referencing a column the table no longer has.

---

## Finding 2: `can_patient_access_global_patient` — undocumented 6th caller

**Discovered:** 2026-05-03 during mig 106 post-apply caller verification (mig 106 is the helper SECURITY mode revert).

**Discovery vehicle:** Programmatic `pg_policies` query for any policy whose `qual` or `with_check` text references `can_patient_access_global_patient`. Returned 6 rows — one more than the audit-documentation enumeration expected.

**What was missed:**

| # | Caller | Source mig | In audit doc? |
|---|---|---|---|
| 1 | `patient_clinic_records::patient_clinic_records_select_v2` | mig 094a § 2b | Yes (`preapply-verif-r2.md § b.4`) |
| 2 | `patient_data_shares::patient_data_shares_select_v2` | mig 094a § 2c | Yes |
| 3 | `patient_data_shares::patient_data_shares_revoke_update_v2` | mig 094a § 2d | Yes |
| 4 | `privacy_code_attempts::privacy_code_attempts_select_v2` | mig 094a § 2e | Yes |
| 5 | `patients::patients_select_v2` | mig 094a § 2f | Yes |
| 6 | **`audit_events::audit_events_patient_self_select_v2`** | **mig 096 § 2** | **NO — undercounted by both `preapply-verif-r2.md` and `preapply-verif-q2.md`** |

The 6th caller — created by mig 096 (`rls_communication`), applied to staging during the Phase C RLS rewrite — was not enumerated in either Verification 2 doc. Both verification docs walked through mig 094a's policies (the obvious recursion-risk surface) but did not check the `patient_data_shares`, `patients`, etc. neighbour migrations for additional callers introduced after 094a.

**Architectural impact: NONE.** The 6th caller's USING clause uses the same pattern as the 5 mig 094a callers:

```sql
USING (
  audit_events.resolved_global_patient_id IS NOT NULL
  AND public.can_patient_access_global_patient(
        audit_events.resolved_global_patient_id, auth.uid())
)
```

Under INVOKER, the helper's internal `SELECT` against `global_patients` clears via the patient-self branch (`claimed_user_id = auth.uid()`, no recursion) or the DEFINER `user_has_clinic_path_to_gp` helper. Same recursion-free chain as the other 5 callers. **INVOKER is architecturally safe for the new caller too.**

**Documentation impact:** `preapply-verif-r2.md § b.4` and `preapply-verif-q2.md § 1.3` are both incomplete. Their architectural conclusions stand (INVOKER is safe), but their caller enumerations were short by one. This is a doc-only gap.

**Why was it missed by the original verification:**
- Both verification docs were written by reading mig 094a top-to-bottom and listing the policies that file creates. Mig 094a was the obvious source — it explicitly named the helper as DEFINER per the (then-applicable) "uniform DEFINER" rule.
- Mig 096 (`rls_communication`) was a separate Phase C migration applied at a different cowork session. It introduced a new caller that referenced the helper, but the verification authors did not re-grep the migration tree for all `can_patient_access_global_patient` call sites.
- A `grep -r "can_patient_access_global_patient" supabase/migrations/` would have surfaced this immediately. A `pg_policies` query against live staging (the same query mig 106's post-apply protocol ran) would have surfaced it just as immediately.

**Pattern:** *manual audit-doc enumeration was incomplete in ways that programmatic SQL enumeration caught.* Codified as **Empirical Lesson #10**.

**Phase D #1.5 implication:** the run-#1.5 matrix will exercise all 6 caller paths — including the previously-undocumented audit_events path. Any failure specific to `audit_events_patient_self_select_v2` would be diagnostic signal that this caller's INVOKER analysis was wrong (not a surprise — by definition this caller was unexpected, so empirical validation is the safety net).

---

## Finding 3: Phase D run #1 matrix is non-reproducible

**Discovered:** 2026-05-03 during Phase D #1.5 pre-flight.

**Discovery vehicle:** Pre-flight check for the runbook v2 Step 7 ("Run all 177 scenarios from `audits/rls-test-matrix.sql`"). The file referenced is a scaffold doc, not an executable script.

**What's missing:**

- `audits/rls-test-matrix.sql` is 247 lines of scenario semantics + a CORRECT PATTERN template + a checklist of TABLES TO COVER. Every per-table entry is marked `⏳ scenarios to author next session`.
- Repo-wide `grep` for `INSERT INTO public._rls_test_results` finds matches only in the scaffold file (in template comments) and in the 2026-05-03 schema dump. The build-06 results doc has zero such inserts.
- The 177 PASS rows that exist in `public._rls_test_results` (run_no = 1, ran 2026-05-02 00:46–14:59 UTC) were produced by SQL authored interactively across cowork sessions 5, 7, 10, 11, 13. The SQL was sent to the database via MCP `execute_sql`, recorded outcomes in `_rls_test_results`, and dissipated.

**Impact on this apply-phase work:**

- Phase D matrix run #1.5 (the validation gate for mig 106's behavioral change) cannot be executed mechanically. The matrix script does not exist in runnable form.
- Push to `origin/main` is held until reconstruction + run #1.5 completes with 177/177 PASS.
- The forensic apply itself is unaffected — migs 100-106 are correctly applied to staging. Only the empirical regression validation gate is unresolved.

**Architectural impact: NONE for staging.** The 177 run #1 outcomes recorded on 2026-05-02 are still valid as a snapshot of pre-mig-106 RLS behavior. The validation gap is comparing post-mig-106 staging against that snapshot — which requires re-running scenarios that produce the same row counts under the spoofed personas.

**Reconstruction viability (from `preapply-scan-mig100-101-102.md` Phase D pre-flight analysis):** the scaffold is highly templated, persona UUIDs are stable in `audits/rls-test-seed.sql`, and run #1's `_rls_test_results.description` rows preserve persona-and-target shorthand (e.g., "doctor_a clinic_b") that maps mechanically to per-table FILTER predicates given the schema dump. Estimated reconstruction effort: 2–4 hours of focused work in a fresh session.

**Why was it missed by Sessions A/B/C:**
- Sessions A/B/C focused on schema state vs migration files (the right scope for those audits). They did not audit the test corpus separately.
- The cowork narrative around Phase D ("we ran the matrix and got 177/177") implicitly relied on the persisted `_rls_test_results` rows as the authoritative record. That record is sufficient for "did the test pass?" but not for "can we re-run it?"
- The runbook v2 prescribed "Run all 177 scenarios from `audits/rls-test-matrix.sql`" without verifying that the file was an executable script. The verification cost (open the file, count INSERT statements) was 30 seconds; we paid the higher cost of catching it at pre-flight time.

**Pattern:** *test scaffolding was authored as ephemeral SQL with only outcomes persisted, not the SQL itself.* Codified as **Empirical Lesson #12**.

**Phase F follow-up implication:** the matrix reconstruction should produce a committed `audits/rls-test-matrix-reconstructed.sql` (or rename to `rls-test-matrix.sql` after reconstruction supersedes the scaffold). Future test work persists the SQL alongside the outcomes; consider adding a `source_file TEXT` column to `_rls_test_results` referencing the committed file + line that produced each row, so future reconstruction problems are a `git checkout` away.

---

## Pattern observation across all three findings

All three findings share a meta-pattern: **the audit captured what existed at a point in time, but the verification did not stress-test the captured artifacts against current state via programmatic enumeration or re-execution.**

- Finding 1: audit captured the 2026-04-08 SQL verbatim → didn't verify the schema it referenced was still valid → mig 100 failed at apply.
- Finding 2: audit listed callers from a single migration → didn't grep the full migration tree → undercounted.
- Finding 3: cowork sessions captured test outcomes → didn't persist the SQL that produced those outcomes → matrix is non-reproducible.

Common remediation:
- For Findings 1 + 2: substitute SQL / grep enumeration for manual reading wherever possible. SQL enumeration is **exhaustive by definition** for the scope it queries; manual enumeration is **incomplete by default** because reviewers naturally focus on the most-relevant migration and may skip neighbouring ones.
- For Finding 3: persist the SQL alongside the outcomes. `_test_results` rows say "the test passed" but don't say "here is the SQL that passed"; future runs need the SQL. Persisted SQL is **re-executable by definition**; ephemeral SQL is **non-reproducible by default**.

This pattern is codified as **Empirical Lesson #9** (temporal-validity dimension), **Empirical Lesson #10** (programmatic > manual enumeration), and **Empirical Lesson #12** (durable test code over ephemeral SQL).

---

## Pattern observation: tracking semantics divergence

A third process-level observation surfaced during the apply phase, distinct from finding 1 and 2 but worth recording here for the running "what we learned today" log:

**MCP `apply_migration` and CLI `supabase migration up` have different tracking-row semantics.** The CLI checks `schema_migrations` first and skips already-tracked versions silently (no new row). The MCP always creates a new tracking row regardless. This means:

- Mig 087's "in-place re-apply" via the runbook v2 description ("CREATE OR REPLACE FUNCTION; should be true no-op") is a no-op via CLI but adds a 4th 087 tracking row via MCP.
- This isn't a correctness issue — both paths produce the same live state — but it's a tracking-history hygiene issue.
- Resolution: when the goal is alignment-without-state-change AND the file is already committed AND live already matches, neither CLI nor MCP apply is needed; skip and document. Today: mig 087 in-place re-apply was SKIPPED per Mo's Option A ruling.

Codified as **Empirical Lesson #11** (MCP `apply_migration` vs CLI `migration up` tracking semantics).

---

## Running findings count

- Finding 1: `front_desk_staff.clinic_id` drop + policy rewrite — **CAPTURED** in mig 100 file (PART 3 header + body fix), applied to staging.
- Finding 2: `audit_events_patient_self_select_v2` 6th caller — **DOCUMENTED HERE**, no corrective DB action needed (INVOKER-safe), Phase D #1.5 exercises it empirically once the matrix is reconstructed.
- Finding 3: Phase D run #1 matrix non-reproducible — **DOCUMENTED HERE**, queued as the gating reconstruction work for Phase D #1.5 (handoff doc: `PHASE_D_RECONSTRUCTION_HANDOFF.md`).

All three findings led to Empirical Lessons #9, #10, #11, and #12 in `audits/EXECUTION_PROMPTS.md`. Future apply-phase work should treat these lessons as standing rules.

---

## Verification queries for re-discovery

If a future reviewer wants to reproduce these findings or check for new ones in the same shape:

```sql
-- Pattern 1: backfill SQL referencing now-missing columns
-- Run before applying any backfill of dashboard-applied SQL: enumerate every column
-- the backfill SQL references and confirm it exists on live staging.
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = '<TABLE THE BACKFILL TOUCHES>';
-- Compare against the columns the backfill SQL references.

-- Pattern 2: undercounted helper callers
-- Run when reviewing any RLS helper or shared function for behavior change.
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE qual::text ILIKE '%<HELPER_NAME>%'
   OR with_check::text ILIKE '%<HELPER_NAME>%';

-- Plus repo-side cross-check:
-- $ grep -rn "<HELPER_NAME>" supabase/migrations/

-- Pattern 3: tracking-semantic clarity
-- Before applying any migration via MCP, decide whether a tracking row is desired.
-- If the goal is alignment-without-state-change and the file is already committed
-- and live already matches: skip apply, document the skip rationale.
```
