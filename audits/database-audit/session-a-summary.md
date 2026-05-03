# Audit Session A — Summary

**Captured:** 2026-05-03  
**Database:** medassist-egypt (mtmdotixlhwksyoordbl), PostgreSQL 17.6, eu-central-1, ACTIVE_HEALTHY  
**Method:** Read-only `information_schema` / `pg_catalog` queries + regex parsing of `supabase/migrations/`

---

## Top 5 most concerning findings

### 1. Five tables exist on staging with no `CREATE TABLE` in any migration file
`account_recovery_requests`, `audit_log`, `patient_phone_verification_issues`, `phone_corrections`, `sms_reminders`. They are referenced in later migrations as "already exists" or as DELETE/CASCADE targets, confirming they were created earlier — but the originating SQL is in nobody's git history. This is the largest single source of drift surfaced by the audit. Provenance: applied directly via the Supabase SQL editor.

### 2. Two tracking rows have no corresponding file at all
`20260408145102 enable_rls_on_unprotected_tables` and `20260408145129 fix_otp_codes_rls_phone_based_records` — applied 2026-04-08 within 27 seconds of each other. The SQL is recorded in `supabase_migrations.schema_migrations.statements` (a large column not extracted in this session) but no `.sql` file in the repo corresponds. These two rows tell us the migrations CLI WAS used in April but for SQL that wasn't first committed to a file.

### 3. Files whose working-tree content does NOT match what was applied
At least four migrations were re-applied via timestamped tracking rows that suggest in-place edits or hot-patches: `076_quarantine_resolution_v3` (file is unsuffixed), `080_add_global_refs_to_clinical_tables_v2` (file is unsuffixed), `083_effective_messaging_consent_view_v2` (both v1 and v2 tracked, only original file in repo), and the **087 privacy code functions trio** (`087_privacy_code_functions`, `087_privacy_code_functions_search_path_fix`, `087_privacy_code_function_grants_hardening`) where only one file exists. Reading the migration file is no longer reliable for these objects — the live function/view bodies are authoritative.

### 4. 48 forward migration files have no tracking row
Files 001-014, 015-044, 068, 099 plus the 010 triplet. Schema effects of files 015-044 ARE visible on staging (verified by claims-vs-reality), so they were applied via SQL editor. Files 068 and 099 are the exceptions — 068 was aborted (memory says so; cleanup_legacy_policies effects not on staging), 099 (patient_code_rpcs) is drafted but not applied. The lack of tracking rows for the early 015-044 era explains the per-claim MISSING noise but does not indicate missing schema.

### 5. 136 RLS policies on staging are not produced by any `CREATE POLICY` statement in any migration file
Some are explained by the unclaimed tables and the two out-of-band fixes from 2026-04-08, and some by the 087 hot-patches. Some may be parser misses (regex-based extraction has edge cases). For an RLS-rewrite-in-progress program, this is the number that most needs Session B's confirmation: how many of these policies are part of the legacy (pre-Phase-F) coexistence set, and how many should already have been replaced.

---

## Resolution of the 010 triplet and the 052 collision

**010 triplet** — All three files (`010_phase8_FIXED.sql`, `010_phase8_patient_empowerment.sql`, `010_phase8_patient_empowerment_STEP_BY_STEP.sql`) produce the same schema: 4 tables (doctor_patient_relationships, patient_diary, patient_health_metrics, medication_adherence_log), 12 indexes, RLS-enabled on all four, 10 policies, 1 trigger function. Differences are only in idempotency style (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` vs. `DROP TABLE` first). All four tables are on staging with the expected structure. **Verdict: benign.** One was applied (likely `STEP_BY_STEP` since it's the most idempotent, but unverifiable). Recommendation: keep `STEP_BY_STEP`, delete the other two from the repo.

**052 collision** — Both `052_drop_legacy_membership_tables.sql` and `052_seed_patient_visibility.sql` are real, distinct migrations that were both applied at different timestamps (2026-04-25 17:39 UTC and 18:50 UTC). The numbering collision is a discipline issue, not an apply-order issue. Effects of both are visible on staging: `clinic_doctors`/`clinic_frontdesk` are gone (drop succeeded), `patient_visibility` has 32 rows (seed succeeded). **Verdict: benign.** Recommendation: rename one to `052a` for clarity.

---

## Drift category counts (per claim from migrations)

| status | count | meaning |
|---|---:|---|
| MATCH | 755 | claim's named object exists on staging |
| MISSING | 76 | claim's named object is absent (or was renamed/dropped) |
| DRIFT_PARTIAL | 0 | not yet computed — name-level match was the bar for Session A |

**EXTRA_ON_STAGING** (objects on staging that NO migration file claims):
- 6 tables (5 + the test-harness `_rls_test_results`)
- 0 views (3 views all have file CREATE statements)
- 111 columns (mostly on the unclaimed tables)
- 136 policies (largest category — see #5 above)
- 34 indexes
- 9 functions (3 are test-harness; 6 are real "create_* / cleanup_* / mark_*" functions whose origin is SQL-editor applies)
- 3 triggers (all bound to the unclaimed `update_patient_activity` and friends)
- 0 enum types (all 7 declared in files)

These EXTRA counts form the bounded scope of what Session C will need to either (a) backfill into a forensic migration, or (b) document as accepted "drift baseline."

---

## What Session B needs to look at

Session B audits the application code (`packages/`, `apps/`, `src/`) against this verified ground truth. Specific surfaces where the drift identified above could matter:

1. **The 5 unclaimed tables** — if app code reads/writes any of `account_recovery_requests`, `audit_log`, `patient_phone_verification_issues`, `phone_corrections`, `sms_reminders`, Session B should confirm the column shape app code assumes matches the staging shape (since there's no file to anchor it).
2. **`update_patient_activity()` trigger function** — runs on every appointment INSERT and clinical_note INSERT. Session B should locate where this is invoked or relied on, and what column it touches on `patients` (the trigger name suggests an `last_activity` column).
3. **`create_conversation_after_appointment()` and `create_sharing_preferences_after_appointment()`** — bound to `appointments` UPDATE triggers. App code that updates appointment status may be implicitly relying on these side effects.
4. **The 087 privacy code function trio** — the function bodies live in DB only. If Session B finds calling code, it should compare the function signature in code to the live function signature.
5. **The 083 view rev** — `effective_messaging_consent` has been re-applied. Its definition references `'2026-04-29'::timestamptz + interval '90 days'` (legacy_grace cutoff is 2026-07-28 UTC). App code that reads `source = 'legacy_grace'` is bound to that hard-coded cutoff.
6. **Mig 099 (`patient_code_rpcs.sql`)** — claims RPCs that are not on staging. Any app code already calling `rpc('patient_code_*')` will fail at runtime.
7. **The two out-of-band 2026-04-08 SQL fixes** — Session B should fetch the actual statements: `SELECT version, statements FROM supabase_migrations.schema_migrations WHERE version IN ('20260408145102','20260408145129')` to see what RLS state they imposed, since those policies are part of the live coexistence layer.

---

## Open questions for Mo

1. **The 5 unclaimed tables** — are these intentional or unintentional? If you remember applying them via SQL editor, a quick note on what each was meant to do would speed Session C. If you don't remember, that's the real finding: undocumented schema.

2. **The 087 privacy code trio** — is the discrepancy between `087_privacy_code_functions.sql` (single file in repo) and the three tracking rows expected? If you hot-patched search_path and grants in the dashboard, Session C will need to know whether to backport those into the file, or treat the dashboard-applied state as canon.

3. **Mig 068 (`068_cleanup_legacy_policies.sql`)** — memory says apply was aborted and superseded by 092-097. Is the file safe to delete from the repo, or does it still represent intended cleanup that should run after Phase F completes?

4. **Mig 099 (`patient_code_rpcs.sql`)** — has it been authored in anticipation of post-Phase-F apply, or was it intended to be applied with mig 098? (Mig 098 has a tracking row dated 2026-05-03 02:28 UTC — about 90 minutes before this audit started.)

5. **Backups** — the operational gap flagged in PROGRAM_STATE.md (no Supabase backups configured). Should Session C produce a manual `pg_dump` script as part of its output? The schema snapshot here covers DDL but not data.

6. **101 tables shown in `list_tables` count vs 71 in public** — the public schema has 71. The other ~30 are in `auth`, `storage`, `realtime`, `vault`, `supabase_migrations`. Session A only audited `public`. If Session B/C discovers app code reading from another schema (e.g., `auth.users` is referenced in a couple FKs), Mo should confirm whether that's expected or a separation-of-concerns gap.

---

## Deliverables produced

In `audits/database-audit/`:
- `staging-schema-2026-05-03.json` (697 KB) — full structured schema state
- `staging-schema-2026-05-03.sql` (291 KB) — readable DDL form (1740 lines)
- `migration-inventory.md` (17 KB) — file-by-file inventory with 010/052 ambiguity resolution
- `migration-claims-vs-reality.md` (23 KB) — per-claim verification table
- `tracking-vs-files.md` (16 KB) — bidirectional file/tracking cross-reference
- `claim-results.json` — companion data for migration-claims-vs-reality
- `extras.json` — companion data for EXTRA_ON_STAGING category
- `session-a-summary.md` — this file

At `audits/PROGRAM_STATE.md`:
- Updated program state document.

**No data was modified.** No INSERT, UPDATE, DELETE, ALTER, CREATE, DROP issued against the database. Everything done in this session is read-only and producible from the snapshot files alone.
