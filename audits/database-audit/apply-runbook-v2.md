# Forensic-Fix Apply Runbook v2 (post-verification)

**Author:** Audit Session C continuation
**Date:** 2026-05-03
**Supersedes:** the unwritten v1 runbook (drafted as `apply-runbook.md`, never written; PROGRAM_STATE.md "V3 (apply runbook) — NOT WRITTEN" line)
**Driver:** All three pre-apply verifications now greenlit (V1 by Part 2, V2/Q1 by Mo's A1 ruling, VQ2 by `preapply-verif-q2.md` § 1.5 verdict CONFIRMED INVOKER)

---

## Pre-conditions (verify all before Step 0)

- V1 (mig 087 body alignment): GREENLIT. Mig 087 file edited 2026-05-03 to add the missing wrong-code-branch `PERFORM pg_sleep(...)` pad. File and live now both have count = 7. Detail: `audits/database-audit/mig-087-edit-confirmation.md`.
- V2 / Q1 (`can_patient_access_global_patient` security mode): RULED. Mo Q1 A1 — revert staging from DEFINER → INVOKER. Mig 092 file edit to undo R2 lands in **Step 0.5** (post-amendment-1, 2026-05-03 PART 2): R2 ruling reverted in the file so the file matches documented intent. Detail: `audits/database-audit/preapply-verif-r2.md`.
- VQ2 (`can_clinic_access_global_patient` security mode): RULED. Verdict CONFIRMED INVOKER per `audits/database-audit/preapply-verif-q2.md` § 1.5. Same staging revert via the new mig 106 (combined with Q1).
- Mig 087 file edit per Part 2: COMPLETE.
- Mig 092 file edit per **Step 0.5** (R2 reversal): performed 2026-05-03. Helper #3 declaration reverted DEFINER → INVOKER, post-condition flipped to assert `prosecdef = FALSE`, header updated with VERIFIED 2026-05-03 PART 2 subsection. After mig 106 applies, re-applying mig 092 in place produces no behavioral change. (Re-apply remains skipped in v2 — see § 5 — because the SET search_path strip from staging is benign-but-cosmetic and not worth a separate apply step in this round.)
- Mig 106 + rollback: AUTHORED. `supabase/migrations/106_forensic_revert_helper_definer_drift.sql` and its `.rollback.sql` companion are present in the working tree, uncommitted.
- `.git/index.lock` cleared if present (run `ls -la .git/index.lock`; remove if found, no other git process running).
- Supabase migrations CLI authenticated to project `mtmdotixlhwksyoordbl` (medassist-egypt staging).
- Working tree clean except for the planned forensic + audit deliverables (verify with `git status`).

If any pre-condition fails, **STOP** and resolve before proceeding.

---

## Step 0 — Sanity check

Confirm staging is on the expected baseline by running these read-only probes:

```sql
-- 0a. Helper security modes (the drift this runbook resolves)
SELECT p.proname,
       p.prosecdef AS is_definer,
       p.proconfig AS function_config
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_clinic_member',
                    'can_patient_access_global_patient',
                    'can_clinic_access_global_patient',
                    'can_view_patient_data_at_clinic',
                    'user_has_clinic_path_to_gp')
ORDER BY p.proname;
```

**Expected pre-apply result** (matches the state recorded in `staging-schema-2026-05-03.sql`):

| proname | is_definer | function_config |
|---|---|---|
| `can_clinic_access_global_patient` | TRUE | `{search_path=public, pg_temp}` |
| `can_patient_access_global_patient` | TRUE | `{search_path=public, pg_temp}` |
| `can_view_patient_data_at_clinic` | TRUE | `{search_path=public, pg_temp}` |
| `is_clinic_member` | TRUE | `{search_path=public, pg_temp}` |
| `user_has_clinic_path_to_gp` | TRUE | `{search_path=public, pg_temp}` |

```sql
-- 0b. verify_privacy_code body alignment
WITH live AS (
  SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='verify_privacy_code'
)
SELECT
  (length(def) - length(replace(def, 'PERFORM pg_sleep', ''))) / length('PERFORM pg_sleep') AS pg_sleep_count,
  (length(def) - length(replace(def, 'RETURN ', ''))) / length('RETURN ') AS return_count
FROM live;
```

**Expected:** `pg_sleep_count = 7, return_count = 7`. (Confirmed live in Part 2 re-verify.)

```sql
-- 0c. Migration tracking baseline — ensure 100-106 are NOT yet present
SELECT name FROM supabase_migrations.schema_migrations
WHERE name LIKE '10%_forensic%'
ORDER BY name;
```

**Expected:** zero rows. If any 10x_forensic row is present, the apply has been partially run; STOP and reconcile before continuing.

If 0a, 0b, or 0c diverges from expected, **STOP** and surface to Mo before any commit/apply step.

---

## Step 0.5 — Revert R2 in mig 092 file (pre-apply, working tree only)

**Purpose:** close the future-trap that exists while the working-tree mig 092 file diverges from documented intent for `can_patient_access_global_patient`. Without this step, after mig 106 flips staging to INVOKER, any subsequent re-apply of mig 092 (deliberate or accidental) would re-create helper #3 as DEFINER via the file's current R2 body, silently undoing mig 106. This step closes that trap before any DB applies.

**Performed 2026-05-03 (Mo amendment 1).** This step is documented here for traceability; the edits are already in the working tree as of the post-rulings continuation session.

**Edits performed on `supabase/migrations/092_rls_helper_functions.sql`:**

1. **Header table (helper #3 row)** — flipped:
   - From: `can_patient_access_global_patient — SECURITY DEFINER STABLE (was INVOKER in this file; staging has been DEFINER since the original deploy. ...)`
   - To: `can_patient_access_global_patient — SECURITY INVOKER STABLE (R2-reverted, see below)`

2. **Header subsection** — added a new "VERIFIED 2026-05-03 PART 2 (post-rulings continuation, R2 REVERTED)" block immediately after the helper-table list. The block:
   - References `audits/database-audit/preapply-verif-r2.md` § "Verdict: CONTRADICTED".
   - States: "R2 ruling reverted. Documented intent is INVOKER per EXECUTION_PROMPTS.md § B3 + the 2026-04-30 hybrid 3-INVOKER ruling. Staging's drift to DEFINER (introduced preemptively by mig 094a's 'uniform DEFINER' amendment, which mig 094a's own policy rewrites subsequently rendered unnecessary) is reverted by mig 106 (`106_forensic_revert_helper_definer_drift.sql`) via `ALTER FUNCTION ... SECURITY INVOKER`."
   - Notes the same shape applies to helper #2 per `preapply-verif-q2.md` § 1.5 verdict CONFIRMED INVOKER.
   - Records that post-conditions at the bottom were flipped accordingly.

3. **Helper #3 body comment block (lines 147–169 pre-edit)** — replaced the R2 narrative with the post-rulings rationale: "INVOKER per documented intent — EXECUTION_PROMPTS.md § B3 + 2026-04-30 hybrid 3-INVOKER ruling. The helper runs as the calling user; we're checking whether THEY are the claimed patient for this global_patient. No bypass needed. No SET search_path is needed under INVOKER (search-path injection protection is a DEFINER concern; INVOKER inherits the caller's path safely)." Plus a HISTORY paragraph recording the R2-then-revert chronology.

4. **Helper #3 declaration body** — flipped:
   - `SECURITY DEFINER` → `SECURITY INVOKER`
   - `SET search_path = public, pg_temp` line removed (not needed under INVOKER per documented intent in EXECUTION_PROMPTS § B3)

5. **Helper #3 `COMMENT ON FUNCTION`** — replaced:
   - From: `'... SECURITY DEFINER for cycle-breaking with the patient-branch policies ... Aligned with staging 2026-05-03 by Audit Session C R2.'`
   - To: `'... SECURITY INVOKER STABLE per documented intent (EXECUTION_PROMPTS § B3, 2026-04-30 hybrid ruling). R2 DEFINER edit reverted 2026-05-03 PART 2; staging realignment via mig 106 (ALTER FUNCTION ... SECURITY INVOKER).'`

6. **Post-condition assertion (helper #3, lines 328–336 pre-edit)** — flipped:
   - From: `AND p.prosecdef = TRUE ... 'mig 092 post-condition failed: can_patient_access_global_patient missing or not SECURITY DEFINER'`
   - To: `AND p.prosecdef = FALSE ... 'mig 092 post-condition failed: can_patient_access_global_patient missing or not SECURITY INVOKER'`

The other three post-condition assertions (helpers #1, #2, #4) are unchanged.

**Verification of internal consistency** (run after edits):

```bash
grep -nE "SECURITY DEFINER|SECURITY INVOKER|prosecdef" supabase/migrations/092_rls_helper_functions.sql
```

Expected outcome: helper #3 reads `SECURITY INVOKER` in the body (matches `prosecdef = FALSE` in the post-condition); helpers #1 and #4 read `SECURITY DEFINER` (match `prosecdef = TRUE`); helper #2 reads `SECURITY INVOKER` (matches `prosecdef = FALSE`). Confirmed in the post-rulings continuation session 2026-05-03.

**No commit yet** — Step 0.5's edits land in the Step 1 working-tree commit. **No DB applies in this step.**

After Step 0.5 + mig 106 apply (Step 3), the file declarations and staging both report `SECURITY INVOKER` for helpers #2 and #3, and the file is once again safely re-applicable in the future as a true no-op for the prosecdef attribute.

---

## Step 1 — Commit pre-apply state

Land all read-only audit deliverables, the edited mig 087, and the new mig 106 + rollback, plus the supporting docs. **Do not commit any code under `packages/` or `apps/` in this commit.**

Files in this commit (verify with `git status` first):

- `audits/database-audit/preapply-verif-q2.md` (NEW — Part 1 deliverable)
- `audits/database-audit/mig-087-edit-confirmation.md` (NEW — Part 2 deliverable)
- `supabase/migrations/087_privacy_code_functions.sql` (EDITED — Part 2: missing pg_sleep + header note)
- `supabase/migrations/092_rls_helper_functions.sql` (EDITED — Step 0.5 / amendment 1: R2 reversal — helper #3 declaration DEFINER → INVOKER, post-condition flipped, header VERIFIED 2026-05-03 PART 2 subsection added)
- `supabase/migrations/106_forensic_revert_helper_definer_drift.sql` (NEW — Part 3)
- `supabase/migrations/106_forensic_revert_helper_definer_drift.rollback.sql` (NEW — Part 3)
- `audits/database-audit/apply-runbook-v2.md` (NEW — this file)
- `audits/PROGRAM_STATE.md` (UPDATED — v2 runbook authored, verifications greenlit)

Suggested commit message body (deliver as a file, per zsh-paste lesson — never paste heredocs in zsh):

```
Forensic-fix v2 — pre-apply verifications green, runbook authored

V1 (mig 087 body alignment): missing pg_sleep added to wrong-code branch
  terminal RETURN; file/live counts both at 7. preapply-verif-087 + Part 2
  re-verification documented in mig-087-edit-confirmation.md.

V2/Q1 (can_patient_access_global_patient security mode): Mo ruling — revert
  staging DEFINER → INVOKER. Don't edit mig 092 file (R2 file edit stays
  as stale-by-design, deferred reconciliation).

VQ2 (can_clinic_access_global_patient security mode): verdict CONFIRMED
  INVOKER. Same Q1-style revert. Detail in preapply-verif-q2.md.

Sequence: 100-105 unchanged. New mig 106 reverts both helpers to INVOKER
  via ALTER FUNCTION ... SECURITY INVOKER (idempotent, single behavioral
  migration). Mig 087 in-place re-apply now a true no-op. Mig 092
  in-place re-apply SKIPPED (would re-flip can_patient back to DEFINER
  via R2 file body — undoes mig 106). PROGRAM_STATE updated.
```

Save as `/tmp/forensic-v2-commit.txt` and run:

```bash
git add audits/database-audit/preapply-verif-q2.md \
        audits/database-audit/mig-087-edit-confirmation.md \
        audits/database-audit/apply-runbook-v2.md \
        audits/PROGRAM_STATE.md \
        supabase/migrations/087_privacy_code_functions.sql \
        supabase/migrations/092_rls_helper_functions.sql \
        supabase/migrations/106_forensic_revert_helper_definer_drift.sql \
        supabase/migrations/106_forensic_revert_helper_definer_drift.rollback.sql
git commit -F /tmp/forensic-v2-commit.txt
```

**Do not push yet.** Push only after Step 8 (177/177 PASS).

---

## Step 2 — Apply forensic migrations 100-105 in order

For each migration, run:

```bash
supabase migration up --linked
```

…or apply individually via the CLI. After each migration's apply, capture the `RAISE NOTICE` output and confirm the per-migration smoke-probe `PASS` line:

| Migration | Smoke-probe NOTICE expected |
|---|---|
| `100_forensic_backfill_2026_04_08_rls.sql` | `forensic mig 100 smoke probe: PASS (...)` |
| `101_forensic_backfill_unclaimed_tables.sql` | `forensic mig 101 smoke probe: PASS (...)` |
| `102_forensic_backfill_helper_functions.sql` | `forensic mig 102 smoke probe: PASS (...)` |
| `103_forensic_backfill_pii_columns_keep_email.sql` | `forensic mig 103 smoke probe: PASS (...)` |
| `104_forensic_drop_unused_pii_columns.sql` | `forensic mig 104 smoke probe: PASS (...)` |
| `105_forensic_drop_patient_phone_verification_issues.sql` | `forensic mig 105 smoke probe: PASS (...)` |

Each is idempotent. Each has a corresponding `.rollback.sql`. If any smoke probe RAISE EXCEPTIONs or NOTICEs an unexpected line, **STOP**, do not advance, run that migration's rollback, and surface to Mo.

These six are documentation-aligning only — no behavioral change to runtime authorization.

---

## Step 3 — Apply mig 106 (helper-mode revert)

**This is the only behavioral migration in the sequence.** It runs `ALTER FUNCTION ... SECURITY INVOKER` on two helpers.

```bash
supabase migration up --linked
```

…executing only `106_forensic_revert_helper_definer_drift.sql`.

Expected `RAISE NOTICE` sequence:

```
NOTICE:  forensic mig 106 pre-check: can_patient_access_global_patient is currently DEFINER — will revert to INVOKER
NOTICE:  forensic mig 106 pre-check: can_clinic_access_global_patient is currently DEFINER — will revert to INVOKER
NOTICE:  forensic mig 106 smoke probe: PASS (2 helpers reverted to INVOKER, 2 helpers remain DEFINER)
```

Post-apply verification (independent of the smoke probe):

```sql
SELECT p.proname, p.prosecdef
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('can_patient_access_global_patient','can_clinic_access_global_patient',
                    'is_clinic_member','can_view_patient_data_at_clinic')
ORDER BY p.proname;
```

Expected:

| proname | prosecdef |
|---|---|
| `can_clinic_access_global_patient` | FALSE |
| `can_patient_access_global_patient` | FALSE |
| `can_view_patient_data_at_clinic` | TRUE |
| `is_clinic_member` | TRUE |

If either `can_*_access_global_patient` row shows TRUE, mig 106 did not apply correctly — run rollback (`106_..._.rollback.sql`) and surface.

---

## Step 4 — Apply mig 087 in-place edit (true no-op)

After Part 2's edit (added `PERFORM pg_sleep` in wrong-code branch), the file body now matches live byte-for-byte. Re-applying via `supabase migration repair` / `db push`-style in-place re-application of `087_privacy_code_functions.sql` should leave the live function bodies unchanged.

This step does NOT add a new tracking row. The intent is to ensure the file body that ships in the migration tree is the body that applies on a green-field deploy. Confirm by re-running the live-body probe:

```sql
WITH live AS (
  SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='verify_privacy_code'
)
SELECT
  (length(def) - length(replace(def, 'PERFORM pg_sleep', ''))) / length('PERFORM pg_sleep') AS pg_sleep_count
FROM live;
```

Expected: `7`. (Same as pre-apply.)

If the file is re-applied via `CREATE OR REPLACE` and live now reports a count other than 7, the file diverged again — STOP and surface.

---

## Step 4.5 — Verify mig 092 file matches staging post-apply

**Purpose:** confirm that mig 106 applied as expected and that the post-Step-0.5 (and post-Option-B for helper #3) mig 092 file declarations for helpers #2 and #3 match staging byte-for-byte (modulo non-semantic whitespace) before the push in Step 8.

**Probe** (read-only):

```sql
-- For each of helpers #2 and #3, dump the live function and compare to file declaration
SELECT pg_get_functiondef(p.oid) AS def,
       p.prosecdef,
       p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('can_clinic_access_global_patient', 'can_patient_access_global_patient')
ORDER BY p.proname;
```

Compare each row's `def` against the corresponding declaration block in `supabase/migrations/092_rls_helper_functions.sql`:

- Helper #2 (`can_clinic_access_global_patient`) — file body lines around 143–163.
- Helper #3 (`can_patient_access_global_patient`) — file body lines around 196–215 (after Option-B + Step 0.5).

### Greenlight criteria

**Both helpers #2 and #3 on staging must satisfy ALL of (per Mo Ask 4 confirmation 2026-05-03):**

- `prosecdef = FALSE` (SECURITY INVOKER).
- `proconfig = {search_path=public, pg_temp}` (SET search_path declared — Option B applied to BOTH helpers).
- Function body (`SELECT EXISTS ...`) matches the file declaration modulo whitespace.

**Any divergence on either helper → STOP.** No exceptions. The "benign cosmetic divergence" caveat that existed pre-Ask-4 is now closed; both helpers must align byte-for-byte (modulo whitespace) with their post-Ask-4 file declarations.

If all pass: proceed to Step 5 (which is intentionally a SKIP), then Step 6.

### Failure modes

**Mismatch on helper #3 (any attribute):** STOP. Surface to Mo. Mig 106 may not have applied as expected, or Step 0.5 / Option-B edits diverged from what was reasoned about. Investigate by re-reading the live `pg_get_functiondef` output and the file declaration side by side. Do not push.

**Mismatch on helper #2 (security mode):** STOP. Surface to Mo. Helper #2's prosecdef should flip to FALSE via mig 106 regardless of the SET search_path question. If it didn't, mig 106 partially failed.

**Unexpected `proconfig` content (e.g., `search_path=public, extensions, pg_temp`):** the SET clause may have been altered by an unknown mig. STOP. Capture the divergence. Surface to Mo before push.

**Body mismatch on either helper (the `SELECT EXISTS` part):** indicates an unexpected edit landed somewhere. STOP. Capture both bodies. Surface to Mo. Mig 106 only flips security mode; it does not touch the body.

This step adds no DDL and no commits. It is a read-only verification gate before Step 8 push.

---

## Step 5 — Mig 092 in-place re-apply: **SKIPPED (by choice, not by trap)**

**SKIPPED in v2 — but for a different reason than the v2-draft rationale.** Step 0.5 already aligned the file with documented intent for the prosecdef attribute (helper #3 declaration reverted to INVOKER, post-condition flipped, header note added). After mig 106 applies, staging will report `SECURITY INVOKER` for both helpers #2 and #3, matching the (post-Step-0.5) file declarations exactly for the prosecdef attribute. Re-applying mig 092 in place would therefore be a no-op for runtime authorization — the trap that justified the v2-draft skip is **closed**.

### SET search_path divergence: Option B applied 2026-05-03 (helpers #2 AND #3)

Per Mo's amendment-2 + Ask-4 rulings, **Option B has been applied to BOTH helper #2 and helper #3**:

- Both helpers' declarations in `092_rls_helper_functions.sql` now include `SET search_path = public, pg_temp` between `STABLE SECURITY INVOKER` and `PARALLEL SAFE` (matches the placement on helpers #1 and #4 — all four helpers in mig 092 now declare SET search_path uniformly).
- Both helpers' inline body comments updated with the defense-in-depth rationale: search-path injection is primarily a DEFINER concern, but pinning the path under INVOKER is consistent with the other helpers and forecloses any future search-path-rebinding attack vector irrespective of SECURITY mode.
- Both helpers' `COMMENT ON FUNCTION` strings extended with "SET search_path = public, pg_temp declared per Mo Option-B ruling 2026-05-03 (defense-in-depth alignment)."
- File header "VERIFIED 2026-05-03 PART 2" subsection extended with an "Option B applied" paragraph covering both helpers.

After mig 106 applies, staging's helpers #2 and #3 will both have:
- `prosecdef = FALSE` (INVOKER, set by mig 106)
- `proconfig = {search_path=public, pg_temp}` (preserved from mig 094a's DEFINER body across `ALTER FUNCTION ... SECURITY INVOKER`)

…which matches the file declarations **byte-for-byte** for both attributes. Step 4.5 verifies this empirically before commit/push, with greenlight criteria requiring both helpers to match (no exceptions, no caveats).

### Why mig 092 still SKIPS in-place re-apply

After Option-B for both helpers, the file declarations for helpers #2 and #3 fully match staging post-mig-106 byte-for-byte. Re-applying mig 092 in place would be a true no-op for both prosecdef and proconfig attributes. We still skip it in v2 to save one apply step with no behavioral upside. The file is reapply-safe; we just don't spend the step.

Future reconciliation items (now narrowed):

- Doc-only edit to mig 094a's prologue noting helpers #2 and #3 were reverted to INVOKER by mig 106, while preserving 094a's policy rewrites (which are the actual recursion fix).
- Reconciliation entry in `project_prompt_06_architecture_rulings.md` capturing that the "uniform DEFINER" amendment was overruled by Mo Q1/Q2 rulings on 2026-05-03.
- Phase F follow-up #8 (search_path audit on RLS helpers): cross-check migs 093-097 helpers, post-094a `user_has_clinic_path_to_gp`, and mig 087 privacy-code DEFINER functions for SET search_path coverage.

---

## Step 6 — Verify EXTRA_ON_STAGING shrinks

Re-run the EXTRA enumeration (the same query Session A used) and confirm the shrinkage targets recorded in PROGRAM_STATE.md "Resume Plan" § 4:

```sql
-- 6a. EXTRA tables (staging tables with no CREATE TABLE migration in repo)
SELECT t.table_name
FROM information_schema.tables t
WHERE t.table_schema='public'
  AND t.table_type='BASE TABLE'
  AND t.table_name NOT IN (
    /* enumerate from migration tree — see EXTRA-table snapshot script */
  );
```

Expected: 5 → 0 (the 5 unclaimed tables now have backfill DDL via mig 101; the orphan was dropped via mig 105).

```sql
-- 6b. EXTRA functions (staging functions with no CREATE FUNCTION migration)
-- Expect 9 → 3 (test-harness functions retained per design)
```

```sql
-- 6c. EXTRA policies (staging policies with no CREATE POLICY migration)
-- Expect 136 → ~122 (14 backfilled this round)
```

If any EXTRA enumeration fails to shrink as expected, that's a Phase F follow-up audit, not a STOP — note in the apply log and proceed.

---

## Step 7 — Re-run Phase D matrix as run #1.5

**This is the critical validation gate for the behavioral change introduced by mig 106.** Mig 106 is the only migration in the apply sequence that changes runtime authorization context. The Phase D scenario matrix exercises every patient-record path under realistic membership states — it is the regression net for INVOKER-mode RLS.

Run the same Phase D harness used for run #1, recording results to `audits/database-audit/phase-d-results-run-1.5.md`. Pass criterion: **177/177 PASS**, identical to run #1.

### Expected outcomes (per Mo amendment 2)

**Helper #2 (`can_clinic_access_global_patient`)** has zero current callers per `audits/database-audit/preapply-verif-q2.md` § 1.3 (queried staging: 202 total RLS policies, 0 reference this helper; queried staging functions: 0 reference this helper; grep'd repo: only definitions and rollback). Flipping it from DEFINER → INVOKER on staging should have **no observable test impact**. Any failure on a path that touches helper #2 is unexpected and warrants particular scrutiny — by definition the helper is not on the runtime call graph today, so a failure implies either (a) a Phase D scenario was added/changed in run #1.5 that wires the helper in, or (b) the caller-search missed something.

**Helper #3 (`can_patient_access_global_patient`)** is called from five RLS policies via mig 094a (`patient_clinic_records_select_v2`, `patient_data_shares_select_v2`, `patient_data_shares_revoke_update_v2`, `privacy_code_attempts_select_v2`, `patients_select_v2`). Verification 2 / Q1 concluded INVOKER is architecturally **OPTIONAL** (not REQUIRED) under the current `global_patients` RLS surface — the helper's internal `SELECT` against `global_patients` clears via the patient-self branch (`claimed_user_id = auth.uid()`, a column comparison with no further RLS) for the only context where the helper returns TRUE. That analysis is **theoretical**; empirical run #1.5 may surface 0–3 scenario shifts.

### Failure-class triage

**If 177/177 PASS:** clean. Proceed to Step 8 (push) and Step 10 (resume Phase F). Document the run as "no observable impact from helper-mode revert" in `phase-d-results-run-1.5.md`.

**If 1–3 failures appear:** STOP. Do not push. Investigate per failure. Possible causes:

1. **Genuine RLS bug INVOKER mode reveals.** The DEFINER mode was hiding a permission gap somewhere in a downstream policy's transitive call graph. INVOKER exposes it. → File the finding, fix the bug (likely a code-side fix in `packages/` or `apps/`, or a downstream policy adjustment in a new migration). Revert mig 106 only if Mo decides DEFINER is the right shape after all.
2. **Scenario incorrectly assumed DEFINER behavior.** The Phase D test was written against the (then-correct) DEFINER state and asserted on a result that depended on bypass-RLS semantics. → Update the test scenario, not the function. Re-run Phase D #1.5.
3. **Cross-clinic write asymmetry case I missed.** Helper #3 is called from `patient_data_shares_revoke_update_v2`'s USING clause (UPDATE policy). Under INVOKER, the helper's read of `global_patients` runs as the user — for a cross-clinic revoke initiated by the patient against another clinic's grantor, the user might not be able to SELECT the relevant `global_patients` row through their RLS context. → Architectural revisit needed; surface to Mo before any code change.

**If many failures (>3):** STOP. The architectural analysis was likely wrong and DEFINER was actually required for helper #3 (or both). Run `106_..._.rollback.sql` to restore DEFINER for both helpers, re-run Phase D #1.5, confirm green, then surface to Mo with the full failure list. Mo decides whether to re-author the runbook with helper #3 staying DEFINER (which would change the Q1 ruling) or to drop the revert entirely.

Do not advance to Step 8 unless Phase D #1.5 = 177/177 PASS.

---

## Step 8 — Push to remote

Only after Step 7 passes 177/177:

```bash
git push origin <branch>
```

If Phase D failed and rollback was used, do not push the post-rollback commit either — let Mo decide whether to push the partial-apply state or unwind.

---

## Step 9 — Update PROGRAM_STATE.md

Replace the "Pre-Apply Verification (2026-05-03) — BLOCKING" and "Next Action" sections with the post-apply state. Suggested replacement (commit as a follow-up doc-only commit):

- Status by Prompt: Prompt 6 Phase F Step 2 UNBLOCKED; resume from Step 2.
- "What is shipped": list of forensic migrations 100-106 now applied; helper security modes restored to documented intent (3 INVOKER + 1 DEFINER + the new `user_has_clinic_path_to_gp` DEFINER from 094a, total 2 INVOKER + 3 DEFINER counting the new helper).
- "Pre-Apply Verification" section: replace with "Apply Run 2026-MM-DD" section noting V1 GREEN, V2 GREEN, VQ2 GREEN (CONFIRMED INVOKER), all six 100-105 + 106 smoke probes PASS, mig 087 re-apply true no-op, mig 092 re-apply SKIPPED per § 5, Phase D #1.5 = 177/177 PASS.
- "Known stale state": mig 092 file declares `can_patient_access_global_patient` as DEFINER; staging is INVOKER; reconciliation deferred per Mo's Q1 directive. Mig 094a prologue narrative similarly stale; not load-bearing for runtime.

---

## Step 10 — Resume Phase F Step 2

Per the locked plan in Prompt 6 Phase F:

- Step 1 (audit corpus commit): DONE.
- Step 2 (atomic triage edit): START. Mo's plan for this step is in `audits/EXECUTION_PROMPTS.md` Prompt 6 Phase F § 2.
- Subsequent steps proceed per the locked plan.

---

## Failure modes and recovery

| Failure | At step | Recovery |
|---|---|---|
| Mig 100/101/102/103/104/105 smoke probe RAISE EXCEPTION | 2 | Run that migration's `.rollback.sql`. Surface to Mo with the NOTICE/EXCEPTION text. Do not advance. |
| Mig 106 pre-check ABORTs (helper not found) | 3 | Should not occur — Step 0 confirmed presence. If it does, the working tree and staging are out of sync; STOP and reconcile. |
| Mig 106 smoke probe RAISE EXCEPTION | 3 | Run `106_..._.rollback.sql` (re-flips both helpers to DEFINER). Surface to Mo with the EXCEPTION text and the post-rollback `prosecdef` query result. |
| Phase D #1.5 fails on a `can_patient_*` or `can_clinic_*` path | 7 | Run `106_..._.rollback.sql`. Re-run Phase D — confirm green. Surface to Mo: the INVOKER revert is incompatible with some path the audit did not anticipate; documented intent may need re-amendment. |
| Phase D #1.5 fails on an unrelated path | 7 | STOP. Capture failure detail. Surface to Mo. Do not push. Do not roll back (the failure is unrelated to mig 106's behavioral change). |
| Mig 087 re-apply changes the live body | 4 | Indicates the file diverged from staging since Part 2's verification. Capture `pg_get_functiondef` diff, surface, do not advance. |
| Mig 092 accidentally re-applied | 5 | Run the mig 092 rollback (`092_rls_helper_functions.rollback.sql`), then re-run mig 106 (idempotent), then re-verify Step 3 expected table. Surface to Mo. |

---

## Special note on mig 106 (helper security mode revert)

**This migration changes the SECURITY mode of two helper functions.** It is the **only** behavioral change in the forensic-fix sequence (100-106). Phase D run #1.5 (Step 7) is the **critical validation gate** — if any test scenarios fail after this migration, surface immediately. The two helpers' bodies are unchanged; only `prosecdef` flips. Specifically:

- `can_patient_access_global_patient(uuid, uuid)`: prosecdef TRUE → FALSE
- `can_clinic_access_global_patient(uuid, uuid)`: prosecdef TRUE → FALSE
- All other functions on staging are unchanged by mig 106.
- The `SET search_path = public, pg_temp` clause is preserved across the security-mode flip (ALTER FUNCTION ... SECURITY INVOKER does not modify SET clauses). This is benign-but-cosmetic divergence from the canonical INVOKER body in mig 092 (which has no SET search_path) and from EXECUTION_PROMPTS.md § B2 (which also has no SET search_path). Reconciliation queued for the same doc-only follow-up as the mig 092 declaration revert.

Empirical-Lesson reminder (per Empirical Lesson #8 in EXECUTION_PROMPTS.md): apply via Supabase migrations CLI, NOT dashboard SQL editor. Dashboard apply does not produce a tracking row.
