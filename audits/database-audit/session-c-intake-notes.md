# Audit Session C — Intake Notes

**Captured:** 2026-05-03
**Author:** Audit Session C (post-Sessions A + B reconciliation)
**Purpose:** prove I read the inputs and converted the findings into a coherent forensic surface in my own words. Mo skims this to confirm I understood Sessions A + B before authoring migrations.

---

## Forensic surface — what is the actual drift?

The medassist-egypt staging database is internally consistent. The migration tree in git is incomplete. That is the entire forensic surface restated as one sentence.

Concretely, three categories of divergence exist between what staging holds and what the migration files describe:

**Category 1 — staging has objects with no committed file.** Five tables, six "real" helper functions (plus three test-harness ones), three triggers, the two 2026-04-08 RLS policy fixes, and ~136 RLS policies fall into this category. Provenance is the Supabase SQL editor. Of the 5 unclaimed tables, 4 are wired into real product flows (`account_recovery_requests`, `audit_log`, `phone_corrections`, `sms_reminders`); 1 is orphaned (`patient_phone_verification_issues`). Of the 6 functions, all 3 trigger-bound ones (`update_patient_activity`, `create_conversation_after_appointment`, `create_sharing_preferences_after_appointment`) plus 3 dormancy/cleanup helpers (`is_account_dormant`, `mark_dormant_accounts`, `cleanup_expired_verification_data`) need backfilling. Of the policies, 11 trace to the two 2026-04-08 tracking rows; the rest accompany the unclaimed tables and the 087 hot-patches.

**Category 2 — staging has a different shape than the file claims.** Two confirmed at the structural-drift spot-check: `invoice_requests::frontdesk_invoice_requests` policy was rewritten on staging from a `front_desk_staff` lookup to a `clinic_memberships`/`clinic_role` lookup, but `040_invoice_fields.sql` was not updated. And `can_patient_access_global_patient` declares `SECURITY INVOKER` in `092_rls_helper_functions.sql` but is `SECURITY DEFINER` on staging. The 087 trio has 3 successive tracking rows (original + search_path_fix + grants_hardening) but only one file in the repo — file body needs verifying against the live function definitions.

**Category 3 — file claims an object that staging never received.** Mig 022 (`doctor_fees`) is the loudest case: 3 columns claimed in the file, 7 active code paths read or write them, none of the columns exist on staging. Mo's locked ruling R1 retires the file (archive, delete the 7 callsites in Phase F follow-up). Other category-3 entries are mig 068 (cleanup_legacy_policies, aborted; superseded by 092-097), mig 099 (patient_code_rpcs, drafted not applied), and mig 023's `patient_code` column (drafted but never applied).

PII columns on `patients` (`national_id_hash`, `national_id_last4`, `phone_verified_at`) are a sub-flavor of Category 1: they exist on staging via dashboard SQL, but app code references are zero. Mo's R4 ruling drops them. `patients.email` stays for now (exposed via doctor handler); Phase F follow-up scopes or drops it.

---

## Mo's locked rulings, restated for self-grounding

R1 — mig 022 retires. Move file to `_archived/`. 7 callsites get deleted in Phase F follow-up, not by Session C.
R2 — `can_patient_access_global_patient` is the 1 DEFINER helper from the Prompt 6 hybrid. Edit `092_rls_helper_functions.sql` in place to declare DEFINER. Update the post-condition assertion at the bottom of the file (currently expects INVOKER).
R3 — `patient_phone_verification_issues` drops, AFTER backfill migration so we don't drop a coincidentally-just-created table.
R4 — drop `patients.national_id_hash`, `patients.national_id_last4`, `patients.phone_verified_at`. Pre-drop assertion that all three are 100% NULL across all rows. Keep `patients.email`.
R5 — `audit_log` and `audit_events` stay parallel, document the boundary, capture `audit_log` as a proper migration. Consolidation = Year-2 tech debt.
R6 — 087 trio rewrite: dump current bodies from staging, rewrite file in place, preserve the filename (already in tracking table).
R7 — `patient_code` retirement is code-only. No migration. Document Phase F follow-up.

---

## Ordering observations for the forensic-fix sequence

1. **Tables before functions/triggers.** The 6 helper functions and 3 triggers in mig 102 reference the unclaimed tables backfilled in mig 101. Order is mig 101 → mig 102.
2. **Backfill before drop.** Mig 105 (drop `patient_phone_verification_issues`) must come AFTER mig 101 (which would otherwise fail trying to recreate the table that was about to be dropped — but actually 101 only backfills the 4 ACTIVE tables, so 101 does NOT touch `patient_phone_verification_issues`; the ordering matters only for narrative consistency, but I'll preserve it for safety).
3. **Add-back before drop.** Mig 103 (re-add `patients.email` with IF NOT EXISTS) before mig 104 (drop the other 3 PII columns). The add-back is no-op since `email` is already on staging — but the migration file needs to declare it for the `_archived` future where someone replays migrations against an empty DB.
4. **Helper rewrite (092 edit) is independent of forensic 100-105.** It can land in any order. Sequenced last for review clarity.
5. **087 rewrite is an in-place file edit, not a new migration.** Tracking table already has 3 rows for 087's hot-patches. The point of R6 is to make the file match staging so anyone reading the file sees the actual deployed function body. Re-applying the file against staging via `CREATE OR REPLACE FUNCTION` is a no-op if bodies match.
6. **mig 100 (RLS backfill) must use `DROP POLICY IF EXISTS` first.** The 2026-04-08 verbatim SQL uses bare `CREATE POLICY` — re-running would conflict.

---

## Open uncertainties going into Task 2

* **087 trio body verification.** Session B's structural spot-check verified 2 of the 8 functions match staging verbatim (`_generate_sms_code_plaintext`, `initiate_sms_share`). Per R6 I should pull live bodies via Supabase MCP `execute_sql` (read-only `pg_get_functiondef` query) and confirm the other 6 also match before claiming the file is correct. If they all match, the "rewrite" is a header annotation only. If any diverge, the rewrite is a real body rewrite.
* **"front_desk_staff in policy" pattern beyond the one drift case.** Session B's recommendation #2 flagged that the `invoice_requests::frontdesk_invoice_requests` rewrite is likely systematic — other policies in mig 040/042 may have been similarly rewritten. Session C's brief does NOT include a targeted scan for that pattern in the locked rulings (R1-R7). I will note it as a Phase F follow-up rather than expand scope.
* **`audit_log` schema authority.** Session B's verdict says use staging's DDL for the backfill; the staging shape is documented in `staging-schema-2026-05-03.sql:181-191`. No ambiguity, but I'll cite the line numbers in the migration's header.
* **Smoke-probe style.** The brief's example uses `DO $$ BEGIN IF NOT EXISTS ... THEN RAISE EXCEPTION ... END IF; END $$;`. I'll use that pattern. For pre-drop assertions in mig 104/105, the same pattern flips: `IF EXISTS (... non-null ...) THEN RAISE EXCEPTION 'data present, refusing to drop'`.

These uncertainties shape the migration plan (Task 2). They do not block it.
