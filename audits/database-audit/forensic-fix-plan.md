# Audit Session C — Forensic-Fix Migration Plan

**Captured:** 2026-05-03
**Author:** Audit Session C
**Status:** PROPOSAL (Mo reviews before Task 3 authors the migrations)
**Apply target:** medassist-egypt staging (mtmdotixlhwksyoordbl); apply NOT done by Session C

---

## 1. Empirical pre-flight verification (read-only, performed in Task 2)

Before authoring migrations I confirmed the following against staging via read-only `execute_sql`:

| Object | Confirmation | Source |
|---|---|---|
| 087 trio function bodies | All 8 function bodies retrieved via `pg_get_functiondef`. Bodies match the existing file modulo (a) live versions strip `VOLATILE` keyword (Postgres default), (b) live `verify_privacy_code` does not declare/select the unused `v_pc_revoked_at` variable, (c) live versions strip in-body comments. **Functional behavior is identical.** | `pg_proc` query |
| 087 trio grants | EXECUTE grants exactly match the file's REVOKE/GRANT statements (anon+auth on `check_phone_uniform`; auth on `regenerate_*`/`verify_*`/`initiate_*`; revoked from anon+auth on `_generate_*`+`record_*`). | `routine_privileges` query |
| 6 dashboard helper functions | All 6 retrieved via `pg_get_functiondef`. Bodies are short and self-contained (cleanup, conversation/sharing-prefs auto-creation, dormancy mark, activity-touch trigger). | `pg_proc` query |
| 3 dashboard triggers | `update_patient_activity_on_appointment` AFTER INSERT on appointments; `update_patient_activity_on_note` AFTER INSERT on clinical_notes; `update_patient_records_updated_at` BEFORE UPDATE on patient_medical_records (uses `update_updated_at_column()` already declared in older migs). | `information_schema.triggers` query |
| PII column null counts | `patients.national_id_hash` 0/38 non-null, `patients.national_id_last4` 0/38 non-null, `patients.phone_verified_at` 0/38 non-null, `patients.email` 1/38 non-null. | `COUNT(*) FILTER` |
| Orphan table row count | `patient_phone_verification_issues` has 0 rows. | `COUNT(*)` |
| Active unclaimed table row counts | `account_recovery_requests` 0, `audit_log` 19, `phone_corrections` 0, `sms_reminders` 4. | `COUNT(*)` |

These reads inform the assertion content in mig 104, mig 105, and the post-condition smoke probes. No writes.

---

## 2. Sequence plan

Apply order (lowest first). Each forensic migration is independently apply-safe and idempotent.

| # | Filename | Purpose | Depends on | Notes |
|---|---|---|---|---|
| 100 | `100_forensic_backfill_2026_04_08_rls.sql` | Backfill the two out-of-band 2026-04-08 RLS fixes (RLS-enable on 3 tables + 8 policies + the OTP phone-based policy fix) | (none — re-asserts existing state) | All `CREATE POLICY` statements wrapped in `DROP POLICY IF EXISTS` first to enable idempotency |
| 101 | `101_forensic_backfill_unclaimed_tables.sql` | Backfill the 4 ACTIVE unclaimed tables: `account_recovery_requests`, `audit_log`, `phone_corrections`, `sms_reminders`. CREATE TABLE IF NOT EXISTS with full DDL transcribed from `staging-schema-2026-05-03.sql`. Includes constraints, indexes, RLS-enable, and 4 policies (one per table) | (none — uses CREATE TABLE IF NOT EXISTS) | Adds the explicit `service_role only` policy on `account_recovery_requests` (Session B finding: RLS on, 0 policies). Includes `patient_phone_verification_issues`'s policy backfill so mig 105's drop is clean |
| 102 | `102_forensic_backfill_helper_functions.sql` | Backfill 6 dashboard-applied helpers + 3 triggers | mig 101 (functions reference unclaimed tables) | `CREATE OR REPLACE FUNCTION` is idempotent; trigger creation uses `DROP TRIGGER IF EXISTS` first |
| 103 | `103_forensic_backfill_pii_columns_keep_email.sql` | Add `patients.email` with `IF NOT EXISTS` guard. No-op on staging (already there) but makes the column tracked by a forensic migration | mig 101 | Documents (in comment) why the other 3 PII columns are excluded (per R4) and why `email` is preserved (per R4 — exposed via doctor handler, drop deferred to Phase F follow-up) |
| 104 | `104_forensic_drop_unused_pii_columns.sql` | Drop `patients.national_id_hash`, `patients.national_id_last4`, `patients.phone_verified_at` | mig 103 (defensive ordering — preserves invariant that `email` survives whichever PII migration ordering happens) | Pre-drop assertion: each column must be 100% NULL across all rows. RAISE EXCEPTION if any non-null. `IF EXISTS` on the DROP itself for re-runnability |
| 105 | `105_forensic_drop_patient_phone_verification_issues.sql` | Drop `patient_phone_verification_issues` table | mig 101 (mig 101 backfills the policy as side-effect documenting "this table existed") | Pre-drop assertion: row count must be 0. Drops the policy first, then the table. `IF EXISTS` on the DROP |

Plus three in-place edits to existing files (NOT new migrations, NOT in the 100-105 sequence):

| File | Change | R-ruling | Notes |
|---|---|---|---|
| `087_privacy_code_functions.sql` | Header annotation update only ("VERIFIED 2026-05-03 against staging — bodies match"); remove dead `v_pc_revoked_at` variable in `verify_privacy_code` to align with live; otherwise the file already matches staging | R6 | Function bodies, grants, and search_path settings already align — verification done in Task 2 |
| `092_rls_helper_functions.sql` | `can_patient_access_global_patient` declared `SECURITY DEFINER` (was `SECURITY INVOKER`); update header comment + post-condition assertion to expect DEFINER | R2 | Aligns file with staging reality (verified by Session B structural drift spot-check) |
| `audits/database-audit/forensic-fix-summary.md` | New per-migration summary doc | (output checklist) | Companion to this plan |
| `audits/database-audit/mig-022-archive-plan.md` | Archive instructions | R1 | Documents file move `022_doctor_fees.sql` → `_archived/022_doctor_fees.sql.RETIRED` and the 7 callsites for Phase F follow-up |

---

## 3. Idempotency strategy per file

Every forensic migration uses one or more of:

* `CREATE TABLE IF NOT EXISTS` for tables
* `CREATE INDEX IF NOT EXISTS` for indexes
* `CREATE OR REPLACE FUNCTION` for functions (built-in idempotent)
* `DROP POLICY IF EXISTS ... ; CREATE POLICY ...` for policies (pattern: drop then create, all inside a single transaction)
* `DROP TRIGGER IF EXISTS ... ; CREATE TRIGGER ...` for triggers
* `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for columns
* `ALTER TABLE ... DROP COLUMN IF EXISTS` for the destructive migs (104) — but with a pre-drop `DO $$ ... RAISE EXCEPTION` guard
* `DROP TABLE IF EXISTS` for mig 105 — also with pre-drop row-count guard

Each file ends with a `DO $$ BEGIN ... RAISE NOTICE / RAISE EXCEPTION` smoke probe asserting the operation's effect.

## 4. Rollback strategy per file

Each forensic migration has a `.rollback.sql` companion that undoes the migration:

* mig 100 rollback drops the 9 policies + RLS-disables on 3 tables (returns staging to pre-2026-04-08 RLS surface)
* mig 101 rollback DROPs the 4 backfilled tables (with `CASCADE` to drop dependent indexes/policies; documents that this is destructive)
* mig 102 rollback DROPs the 3 triggers + 6 functions
* mig 103 rollback drops `patients.email` (warns: data loss; the 1 non-null row will be lost)
* mig 104 rollback adds the 3 PII columns back as nullable text/timestamptz with no DEFAULT — does NOT re-populate any data
* mig 105 rollback recreates the `patient_phone_verification_issues` table from the staging DDL — but with NO data (orphan table had 0 rows on apply)

Rollback files are designed for emergency use, not routine reversal. They warn loudly in their headers.

## 5. Smoke probe pattern

Standard form (via `DO $$ BEGIN ... END $$;` block at end of each migration):

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'account_recovery_requests'
  ) THEN
    RAISE EXCEPTION 'forensic mig 101 failed: account_recovery_requests not present after apply';
  END IF;
  RAISE NOTICE 'forensic mig 101 smoke probe: PASS';
END $$;
```

Each smoke probe asserts the most concrete observable effect of the migration. For mig 100 (policy backfill), probes check `pg_policies`. For mig 101 (table backfill), probes check `information_schema.tables` AND a single key index per table. For mig 102 (functions+triggers), probes check `pg_proc` and `information_schema.triggers`. For migs 103/104/105, probes check the column or table presence/absence.

## 6. What this plan does NOT do

* Does not apply migrations. Mo applies after reviewing.
* Does not modify any data. Mig 104 and mig 105 will FAIL LOUDLY if data is present in places we expect it not to be.
* Does not modify app code. The 7 doctor-fees callsites and the 3 patient_code retirement files stay untouched (Phase F follow-up scope).
* Does not address the pattern Session B flagged in recommendation #2 (other potential `front_desk_staff`-in-policy drifts beyond `invoice_requests::frontdesk_invoice_requests`). That requires a targeted re-scan beyond the locked rulings; flagged as Phase F follow-up.
* Does not consolidate `audit_log` and `audit_events` (R5: Year-2 tech debt).
* Does not delete mig 022 from disk; only archives it (R1).
* Does not touch mig 068 or mig 099 (drafted but not applied; their resolution is Phase F follow-up).

## 7. Sequencing relative to Phase F

* Mig 100 lands BEFORE Phase F's policy rewrites. The 8 policies it backfills (check_in_queue, payments, front_desk_staff x 3) overlap with policies Phase F's `_v2` migs will replace; Phase F uses `DROP POLICY IF EXISTS` so the conflict is benign.
* Migs 101-105 are independent of Phase F (touch tables/columns Phase F doesn't policy-rewrite).
* mig 092 in-place edit lands BEFORE Phase F resumes. Phase F's mig 094a/094b/094c policies call `can_patient_access_global_patient`; the file edit is documentation-only (staging is already DEFINER) but keeps the file consistent with the deployed function.
* mig 087 in-place edit lands at any time; doesn't affect Phase F.

After all forensic migrations apply cleanly, the Phase F resume action is unchanged: Step 2 atomic triage edit (per `audits/PROGRAM_STATE.md`).

## 8. Risk assessment

| Risk | Mitigation |
|---|---|
| Mig 104 silently drops a column with data | Pre-drop assertion that all 3 columns are 100% NULL; RAISE EXCEPTION on any non-null |
| Mig 105 silently drops a table with data | Pre-drop assertion that row count is 0; RAISE EXCEPTION on > 0 |
| Mig 101 conflicts with a future identical-named table | `CREATE TABLE IF NOT EXISTS` makes the create itself a no-op; constraints/indexes/policies use the same idempotency guards |
| Mig 100 collides with Phase F's `_v2` policies | Phase F uses `DROP POLICY IF EXISTS`; mig 100 uses `DROP POLICY IF EXISTS` too. Last apply wins; behaviorally identical |
| 087 file edit accidentally changes function behavior | Only one body change (drop unused dead variable `v_pc_revoked_at`); all grants/search_path/COMMENT preserved verbatim. Re-applying via `CREATE OR REPLACE FUNCTION` is a no-op against staging since live also doesn't declare that variable |
| 092 file edit accidentally changes function behavior | Body unchanged; only `SECURITY INVOKER` → `SECURITY DEFINER`. Re-applying is no-op against staging (already DEFINER). Post-condition assertion at bottom of file flips from `prosecdef = FALSE` to `prosecdef = TRUE` |

## 9. Quality bar

Each forensic migration must:

* Compile clean against staging schema as of 2026-05-03
* Be re-runnable as no-op
* Have a rollback companion that runs clean
* Have a smoke probe that fires after the migration body
* Have a header block citing the audit finding it captures
* Use only DDL operations covered by Mo's allowed scope (no INSERT/UPDATE/DELETE on user data)

Each in-place file edit must:

* Preserve filename (already in tracking table)
* Preserve all existing logic except the documented narrow change
* Update header comments to record the rewrite/reasoning
* Update post-condition assertions if the security model changed

## 10. Open questions surfaced during planning

None. All R-rulings are unambiguous and the empirical pre-flight (§ 1) confirmed every required input. If Mo identifies a deviation between this plan and his intent, surface it before Task 3 begins.
