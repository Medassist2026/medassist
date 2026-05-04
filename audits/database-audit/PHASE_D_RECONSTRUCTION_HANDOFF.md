# Phase D #1.5 Matrix Reconstruction — Handoff for Fresh Session

**Captured:** 2026-05-03 (end of audit detour day 1)
**Author:** Audit Session C continuation + apply phase + verification
**Read first:** this doc, then the four reference docs listed under "What needs to happen."

---

## What's done

All 7 forensic migrations applied to staging in this session:
- mig 100 (RLS hardening backfill, with PART 3 body fix per `preapply-scan-mig100-101-102.md`)
- mig 101 (5 unclaimed tables backfill)
- mig 102 (6 helpers + 3 triggers)
- mig 103 (`patients.email` keep)
- mig 104 (3 PII columns drop, destructive)
- mig 105 (orphan table drop, destructive)
- mig 106 (helper INVOKER revert, behavioral)
- mig 087 in-place reapply: SKIPPED per Option A (file aligned at edit time, no behavioral change needed)

Step 4.5 verification (file-vs-staging body match for helpers #2 and #3) PASSED — both helpers report `prosecdef = false` (INVOKER) and `proconfig = {search_path=public, pg_temp}`, matching the post-Step-0.5 + Option B mig 092 file declarations byte-for-byte.

Documentation complete:
- `audits/database-audit/preapply-scan-mig100-101-102.md` (NEW — pre-apply scan)
- `audits/database-audit/out-of-band-post-2026-04-08.md` (NEW — running drift record)
- `audits/database-audit/apply-runbook-v2.md` (UPDATED — Step 0.5, Step 1.5, Step 4 SKIPPED, Step 4.5)
- `audits/EXECUTION_PROMPTS.md` (UPDATED — Empirical Lessons #9, #10, #11, #12)
- `audits/PROGRAM_STATE.md` (UPDATED — verification status, Phase F task #9)
- `audits/database-audit/preapply-verif-q2.md` (NEW)
- `audits/database-audit/mig-087-edit-confirmation.md` (NEW)
- `audits/database-audit/apply-runbook-v2.md` (NEW)
- `supabase/migrations/087_privacy_code_functions.sql` (EDITED — Part 2 pg_sleep + header)
- `supabase/migrations/092_rls_helper_functions.sql` (EDITED — Step 0.5 R2 reversal + Option B for helpers #2 and #3)
- `supabase/migrations/106_forensic_revert_helper_definer_drift.sql` (NEW)
- `supabase/migrations/106_forensic_revert_helper_definer_drift.rollback.sql` (NEW)

Foundation aligned with documented intent. Helper security modes match the locked hybrid 2 INVOKER + 2 DEFINER architecture. PII columns dropped, orphan table dropped, unclaimed tables backfilled. All 7 forensic migs tracked in `supabase_migrations.schema_migrations`.

---

## What's blocked

**Phase D matrix run #1.5 cannot run because `audits/rls-test-matrix.sql` is a scaffold without executable scenario SQL.**

The run #1 matrix was authored interactively across cowork sessions 5/7/10/11/13 with outcomes recorded in `_rls_test_results` but the SQL itself never persisted (Empirical Lesson #12 captures this as a process-level finding). The 177 PASS rows in `_rls_test_results WHERE run_no = 1` are valid as a snapshot of pre-mig-106 RLS behavior; they cannot be re-executed mechanically.

---

## What needs to happen

Reconstruct an executable Phase D matrix (~177 scenarios) from:

1. **`audits/rls-test-matrix.sql` (the scaffold)** — for scenario semantics:
   - Lines 41–49: CORRECT PATTERN template (`SET LOCAL ROLE 'authenticated'` + `SET LOCAL "request.jwt.claims"` + parameterized SELECT/INSERT/UPDATE).
   - Lines 97–130: S1–S10 spec (positive/negative reads, cross-clinic share variants, patient self/other, frontdesk, RESTRICTIVE write tests for clinical-data tables).
   - Lines 144–162: INSERT INTO `_rls_test_results` template.
   - Lines 165–204: TABLES TO COVER checklist with per-table scope hints (e.g., mig 095 tables only need S1/S2/S6/S7/S8 — no cross-clinic; mig 094 clinical-data tables get full S1–S10).

2. **`audits/rls-test-seed.sql`** — for stable persona UUIDs:
   - All personas use `00000099-…` constants (clinic_a `…001`, clinic_b `…002`, doctor_a, doctor_b, frontdesk_a, owner_a, patient_x, patient_y_user, patient_z, etc.).
   - The seed file's SECURITY DEFINER functions (`rls_test_seed`, `rls_test_teardown`) are already on staging; Phase D #1.5 starts with `SELECT public.rls_test_teardown(); SELECT public.rls_test_seed();` to refresh the seed before the matrix runs.

3. **`_rls_test_results WHERE run_no = 1`** on staging — for the per-scenario description trail:
   - 177 rows with columns `(scenario, table_name, description, expected_outcome, actual_outcome, actual_rows, notes, ran_at)`.
   - `description` text preserves persona-and-target shorthand (e.g., "doctor_a clinic_b", "patient_y_user filter excludes self") that maps to per-table FILTER predicates given the schema dump.

4. **`audits/database-audit/staging-schema-2026-05-03.sql`** — for per-table column shapes (which column is the clinic-id discriminator on `payments`, which join column on `audit_events`, etc.). Note: this snapshot is from before today's apply phase; columns dropped by mig 104 (`patients.national_id_hash`, etc.) and the orphan table dropped by mig 105 are no longer on staging. For matrix reconstruction this doesn't matter (those columns/tables were never test targets), but if a future scenario references them, query live staging directly.

**Estimated effort:** 2–4 hours of focused work. The hardest part is inferring the per-table FILTER from the description text — answered by the live schema, but requires per-table investigation.

**Output:** `audits/rls-test-matrix-reconstructed.sql` (executable). Optionally rename to `rls-test-matrix.sql` after reconstruction supersedes the scaffold (preserve the scaffold contents as a header-comment block for the spec semantics it captures).

**Recommended structure:** a single parameterized `.sql` file with one DO-block per table that loops over a `(persona_uuid, scenario_code, filter, expected_outcome)` tuple list. This makes future re-runs a single-file execution and future audits a single-file diff.

**Optional addition (recommended):** add a `source_file TEXT` column to `_rls_test_results` and populate it with the file path + line number that produced each row. Future reconstruction problems become a `git checkout` away. (Schema change requires a forward migration; out of this session's scope.)

---

## Run #1.5 procedure (after reconstruction)

1. Verify test infrastructure intact (already verified at end of 2026-05-03):
   - `_rls_test_results` table exists ✓
   - `rls_test_record`, `rls_test_seed`, `rls_test_teardown` functions exist ✓
2. Refresh seed: `SELECT public.rls_test_teardown(); SELECT public.rls_test_seed();`
3. Clear any prior run_no = 1.5 records: `DELETE FROM _rls_test_results WHERE run_no = 1.5;`
4. Execute the reconstructed matrix against staging — each scenario records `run_no = 1.5`.
5. Verify post-run:
   ```sql
   SELECT
     sum(CASE WHEN actual_outcome = expected_outcome THEN 1 ELSE 0 END) AS pass,
     sum(CASE WHEN actual_outcome != expected_outcome THEN 1 ELSE 0 END) AS fail,
     count(*) AS total
   FROM _rls_test_results
   WHERE run_no = 1.5;
   ```
   Expected: `pass = 177, fail = 0, total = 177`.

**Failure-class triage (per `apply-runbook-v2.md` Step 7):**
- 1–3 failures: STOP. Surface failed scenarios verbatim. Do NOT push. Do NOT roll back mig 106 yet — investigate first. Possible causes: (a) genuine RLS bug INVOKER mode reveals; (b) scenario incorrectly assumed DEFINER behavior; (c) cross-clinic write asymmetry case.
- Many failures (>3): STOP immediately. Surface verbatim. Mig 106 rollback candidate. Architectural reasoning may have been wrong.

**Comparison query against run #1:**
```sql
SELECT r1.table_name, r1.scenario, r1.description,
       r1.actual_outcome AS run1_outcome,
       r1.actual_rows AS run1_rows,
       r15.actual_outcome AS run15_outcome,
       r15.actual_rows AS run15_rows
FROM _rls_test_results r1
LEFT JOIN _rls_test_results r15
  ON r15.run_no = 1.5
  AND r15.table_name = r1.table_name
  AND r15.scenario = r1.scenario
WHERE r1.run_no = 1
  AND (r1.actual_outcome <> r15.actual_outcome
    OR r1.actual_rows <> r15.actual_rows
    OR r15.actual_outcome IS NULL);
```
Expected: zero rows (both runs identical).

---

## Push gate

Push to `origin/main` is held until Phase D #1.5 = 177/177 PASS. Not before.

If reconstruction surfaces that the matrix can't be faithfully reproduced (e.g., some scenarios used staging state that no longer exists), surface to Mo before authoring a workaround. The matrix's job is to validate behavior; if we can't reproduce the matrix, we need a substitute validation step before pushing — not a "close enough" matrix that papers over the gap.

---

## What's NOT changing

- Forensic migrations 100-106 stay applied; do NOT roll them back.
- Mig 087 file stays at the Part 2 edited state (committed in 797a5c3).
- Mig 092 file stays at the Step 0.5 + Option B state (committed in 797a5c3).
- Holding pattern: no code changes in `apps/` or `packages/`, no Phase F resumption, no Phase 6.5 / 7 work.
- The runbook v2 stays as the source of truth for the apply sequence — Step 7 will reference the reconstructed matrix file once reconstruction completes.

---

## Open questions for the fresh session

These are non-blocking but worth a moment of attention before reconstruction starts:

1. **Re-name plan.** Should the reconstructed file replace `rls-test-matrix.sql` (overwriting the scaffold) or live alongside as `rls-test-matrix-reconstructed.sql`? Trade-off: replace = single file, simpler future ops; alongside = preserves the scaffold's spec semantics doc. Recommendation: replace, but keep the scaffold's spec-semantics comments at the top of the new file as a header block.

2. **Add `source_file` column to `_rls_test_results`.** A small forward migration that adds the column (non-breaking, nullable) plus a follow-up where reconstruction populates it. Recommendation: yes — but as part of Phase D reconstruction itself, not as a separate item that gets queued and forgotten.

3. **Tooling: per-table loop vs explicit per-scenario INSERTs.** A DO-block-per-table loop is more compact and easier to extend; explicit INSERTs are easier to read and debug. Recommendation: hybrid — a top-level loop generates the scenarios, but each scenario's expected behavior is documented as a comment alongside the tuple. Whichever you pick, commit it.

4. **Run #1 outcomes as the regression baseline.** The reconstructed matrix's PASS criterion is "matches run #1" (177/177 outcome agreement), not "all SUCCESS" — because some scenarios are FAIL by design (e.g., S2 negative reads). Make sure the reconstruction's expected_outcome column is read from the run #1 records, not re-derived from the spec.

---

## Dependencies for the fresh session

- Latest commit on `main` (today's commit chain through `[hash to be filled in by close-out commit]`).
- Live staging at the post-mig-106 state (verified by re-querying `proname, prosecdef, proconfig` for the 4 helpers — should match Step 4.5 verdict).
- `audits/rls-test-seed.sql` SECURITY DEFINER functions on staging (already there).
- Stable seed UUIDs (see `audits/rls-test-seed.sql` lines 79+).

If anything diverges between today and tomorrow (e.g., staging gets touched by a different session), surface the divergence before reconstruction starts.

---

## Last word

The forensic apply itself is complete and structurally verified. Phase D #1.5 reconstruction is the gate for resuming Phase F, but it is **not** a precondition for the apply work being correct — the apply work is correct, validated by Steps 0–6 of the runbook v2 and Step 4.5's byte-for-byte file/staging match. The gate exists because we made a behavioral change (mig 106) and want empirical regression coverage before pushing. Reconstruction is the path to that coverage.

Take the break. Restart fresh tomorrow with this doc as the entry point.
