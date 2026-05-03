# Audit Session C — Forensic-Fix Summary

**Captured:** 2026-05-03
**Author:** Audit Session C
**Status:** AUTHORED (apply pending Mo's review)
**Companion docs:**
- `forensic-fix-plan.md` — design rationale and sequence plan
- `mig-022-archive-plan.md` — what to do with retired mig 022
- `AUDIT_FINAL.md` — top-level audit verdict

---

## What this document is

A per-migration what/why summary of every artifact authored by Audit Session C. One-stop reference for "what does each forensic file do, and why does it exist?"

## Apply order

```
100_forensic_backfill_2026_04_08_rls.sql
101_forensic_backfill_unclaimed_tables.sql
102_forensic_backfill_helper_functions.sql
103_forensic_backfill_pii_columns_keep_email.sql
104_forensic_drop_unused_pii_columns.sql
105_forensic_drop_patient_phone_verification_issues.sql
```

Plus the in-place file edits to `092_rls_helper_functions.sql` and `087_privacy_code_functions.sql` — these can apply at any time (they are no-ops against staging because staging already has the corrected definitions). Re-applying via the Supabase CLI is safe.

## Per-migration

### `100_forensic_backfill_2026_04_08_rls.sql`

**What:** RLS-enables `check_in_queue`, `payments`, `front_desk_staff`. Creates 8 policies on those 3 tables. Replaces the `Patients can view own otp` policy on `otp_codes` with the phone-based one used today.

**Why:** Two `schema_migrations` rows from 2026-04-08 have no committed file. The SQL was applied via the migrations CLI but never committed to git. Session B recovered the verbatim SQL. This migration backfills the file so a fresh DB reset would recreate today's policy state.

**Idempotency:** every `CREATE POLICY` is preceded by `DROP POLICY IF EXISTS`. RLS-enable is no-op when already enabled.

**Smoke probe:** asserts all 9 policies exist + RLS on the 3 tables.

**Audit reference:** `out-of-band-2026-04-08.md`.

---

### `101_forensic_backfill_unclaimed_tables.sql`

**What:** Backfills 5 tables — `account_recovery_requests`, `audit_log`, `phone_corrections`, `sms_reminders`, `patient_phone_verification_issues`. Includes columns, constraints, indexes, RLS-enable, and 5 policies (one per table). Adds an explicit `service_role_account_recovery` policy on `account_recovery_requests` (Session B finding: RLS on, 0 policies on staging).

**Why:** these 5 tables exist on staging via Supabase SQL editor applies, but no `CREATE TABLE` statement is in any migration file. App code reads/writes 4 of the 5 (per Session B classification). Without backfill, a fresh DB reset would not recreate them. Mig 105 drops the 5th (`patient_phone_verification_issues`) afterwards as the orphan it is.

**Idempotency:** `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, FKs in DO-block conditional blocks, `DROP POLICY IF EXISTS` + `CREATE POLICY`.

**Smoke probe:** 5 tables + 5 key indexes + 5 policies present.

**DDL source of truth:** `staging-schema-2026-05-03.sql` (specific lines cited in the migration file's comment block).

**Audit reference:** `unclaimed-tables-usage.md`.

---

### `102_forensic_backfill_helper_functions.sql`

**What:** Backfills 6 helper functions and 3 triggers. Functions: `cleanup_expired_verification_data`, `update_patient_activity` (trigger fn), `create_conversation_after_appointment` (trigger fn), `create_sharing_preferences_after_appointment` (trigger fn), `is_account_dormant`, `mark_dormant_accounts`. Triggers: `update_patient_activity_on_appointment` on `appointments` INSERT, `update_patient_activity_on_note` on `clinical_notes` INSERT, `update_patient_records_updated_at` on `patient_medical_records` UPDATE.

**Why:** these 6 functions and 3 triggers exist on staging via dashboard SQL applies, but no migration file declares them. Two of the trigger bindings have observable behavioral consequences (touch `patients.last_activity_at`); breaking that would corrupt the `mark_dormant_accounts` heuristic.

**Idempotency:** `CREATE OR REPLACE FUNCTION` is intrinsically idempotent. Triggers use `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`.

**Smoke probe:** 6 functions in `pg_proc`, 3 triggers in `information_schema.triggers`.

**Body source of truth:** live `pg_get_functiondef` queries against staging on 2026-05-03. Bodies reproduced verbatim modulo a final newline normalization.

**Excluded from this migration:** the 3 RLS test-harness functions (`rls_test_*`) — staging-only test tooling, not production schema.

---

### `103_forensic_backfill_pii_columns_keep_email.sql`

**What:** Adds `patients.email` with `IF NOT EXISTS` guard. No-op against staging (column already exists). Documents in comment why the OTHER 3 PII columns are excluded.

**Why:** Per Mo's R4 ruling, `patients.email` is preserved (currently exposed via `doctor/patients/[id]/handler.ts`); the other 3 PII columns drop in mig 104. This file makes the email column tracked by a forensic migration so a fresh DB reset recreates it.

**Idempotency:** `ADD COLUMN IF NOT EXISTS`.

**Smoke probe:** `patients.email` is present in `information_schema.columns`.

**Audit reference:** `patients-pii-columns-usage.md`.

---

### `104_forensic_drop_unused_pii_columns.sql`

**What:** Drops `patients.national_id_hash`, `patients.national_id_last4`, `patients.phone_verified_at`. Pre-drop assertion verifies all 3 columns are 100% NULL across all rows.

**Why:** Per Mo's R4 ruling. Zero app references; zero non-null rows on staging (verified in forensic-fix-plan.md § 1). Dead schema.

**Data safety:** if any column has a non-null row at apply time, the `DO $$` block fails LOUDLY with `RAISE EXCEPTION` and the COMMIT is rolled back.

**Idempotency:** `DROP COLUMN IF EXISTS` + the pre-drop check uses `EXECUTE` so missing columns don't throw `undefined_column`. Re-running on a column that's already absent is no-op.

**Smoke probe:** the 3 columns are absent in `information_schema.columns`.

---

### `105_forensic_drop_patient_phone_verification_issues.sql`

**What:** Drops the orphan `patient_phone_verification_issues` table and its policy. Pre-drop assertion verifies row count is 0.

**Why:** Per Mo's R3 ruling. Zero app references; zero rows; the only RLS policy ("Staff can view phone verification issues") points to a UI surface that was never built.

**Order:** runs AFTER mig 101 (which backfilled the table's DDL). The order is intentional — mig 101 brings the table into the file system briefly so that mig 105 drops a tracked-by-file table rather than dropping a phantom.

**Data safety:** if rows exist at apply time, fails LOUDLY.

**Smoke probe:** table absent in `information_schema.tables`.

---

### `087_privacy_code_functions.sql` (in-place edit)

**What:** Header annotation update + drop of unused dead variable `v_pc_revoked_at` in `verify_privacy_code`. No behavioral change.

**Why:** Per Mo's R6 ruling. The schema_migrations tracking table has 3 rows for 087 (original + 2 hot-patches). Only one file existed. Audit Session C verified the file's bodies, grants, and search_paths against the live staging definitions and found them aligned (the hot-patches had already been folded into the file). The one remaining drift was a dead local variable in `verify_privacy_code` — removed to match the byte-level live body.

**Tracking table impact:** none. No new tracking row inserted; the existing `087_privacy_code_functions` row continues to anchor this file.

**Smoke probe:** none added (no behavioral change). Pre-existing migrations elsewhere assert the 087 functions exist.

---

### `092_rls_helper_functions.sql` (in-place edit)

**What:** `can_patient_access_global_patient` declared `SECURITY DEFINER` (was `SECURITY INVOKER`). Header updated. Post-condition assertion at bottom of file flipped from `prosecdef = FALSE` to `prosecdef = TRUE`. Header explains the cycle-breaking reason.

**Why:** Per Mo's R2 ruling. Session B's structural drift spot-check (Function #4) found `can_patient_access_global_patient` declared INVOKER in this file but DEFINER on staging. R2 confirms DEFINER is the intended Prompt 6 hybrid model "1 DEFINER helper" — the file is the one that's wrong.

**Tracking table impact:** none. Re-applying via Supabase CLI is no-op against staging (function is already DEFINER).

**Smoke probe:** existing post-condition `DO $$` at bottom of the file now asserts `prosecdef = TRUE` (was `FALSE`).

---

### `audits/database-audit/mig-022-archive-plan.md` (companion doc)

**What:** Documents the file-move plan for `022_doctor_fees.sql` → `_archived/022_doctor_fees.sql.RETIRED` and lists the 7 callsites Phase F follow-up should delete.

**Why:** Per Mo's R1 ruling. Doctor pricing isn't on the launch roadmap; the migration file is retired and the callsites are dead UI.

**Action by Session C:** none beyond the documentation. Mo executes the file move; Phase F follow-up PR deletes the callsites.

---

## What is NOT covered by Session C's forensic migrations

* **Mig 022 deletion of code callsites** — Phase F follow-up.
* **`patient_code` column retirement code cleanup** — Phase F follow-up (per R7; column doesn't exist on staging, so no DB migration needed).
* **`patients.email` exposure scope decision** — Phase F follow-up (R4: keep for now; either drop or scope the doctor handler read in a later PR).
* **`audit_log` vs `audit_events` consolidation** — Year-2 tech debt (R5).
* **Other potential `front_desk_staff`-in-policy drift cases** beyond `invoice_requests::frontdesk_invoice_requests` — Phase F follow-up. Session B's recommendation #2 flagged the pattern is likely systematic; Session C's locked rulings did not include a targeted scan.
* **Mig 068 (cleanup_legacy_policies) and mig 099 (patient_code_rpcs)** — Phase F follow-up. Both are drafted-but-not-applied; their resolution is not in Session C scope.

## Files added/changed by Session C

| Path | New or Changed | Type |
|---|---|---|
| `audits/database-audit/session-c-intake-notes.md` | New | Doc |
| `audits/database-audit/forensic-fix-plan.md` | New | Doc |
| `audits/database-audit/forensic-fix-summary.md` | New | This doc |
| `audits/database-audit/mig-022-archive-plan.md` | New | Doc |
| `audits/database-audit/AUDIT_FINAL.md` | New | Doc (Task 6) |
| `audits/PROGRAM_STATE.md` | Changed | Doc |
| `audits/EXECUTION_PROMPTS.md` | Changed | Doc (Empirical Lessons #7 + #8) |
| `supabase/migrations/100_forensic_backfill_2026_04_08_rls.sql` | New | SQL |
| `supabase/migrations/100_forensic_backfill_2026_04_08_rls.rollback.sql` | New | SQL |
| `supabase/migrations/101_forensic_backfill_unclaimed_tables.sql` | New | SQL |
| `supabase/migrations/101_forensic_backfill_unclaimed_tables.rollback.sql` | New | SQL |
| `supabase/migrations/102_forensic_backfill_helper_functions.sql` | New | SQL |
| `supabase/migrations/102_forensic_backfill_helper_functions.rollback.sql` | New | SQL |
| `supabase/migrations/103_forensic_backfill_pii_columns_keep_email.sql` | New | SQL |
| `supabase/migrations/103_forensic_backfill_pii_columns_keep_email.rollback.sql` | New | SQL |
| `supabase/migrations/104_forensic_drop_unused_pii_columns.sql` | New | SQL |
| `supabase/migrations/104_forensic_drop_unused_pii_columns.rollback.sql` | New | SQL |
| `supabase/migrations/105_forensic_drop_patient_phone_verification_issues.sql` | New | SQL |
| `supabase/migrations/105_forensic_drop_patient_phone_verification_issues.rollback.sql` | New | SQL |
| `supabase/migrations/087_privacy_code_functions.sql` | Changed (in-place) | SQL |
| `supabase/migrations/092_rls_helper_functions.sql` | Changed (in-place) | SQL |

22 file artifacts. None applied to staging (Mo applies after review).
