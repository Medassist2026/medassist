# Migration Directory Inventory — Audit Session A

**Captured:** 2026-05-03  
**Source dir:** `supabase/migrations/`  
**Files inventoried:** 103 forward + 30 rollback = 133 total .sql files  
**Tracking table:** `supabase_migrations.schema_migrations` on `medassist-egypt` — 62 rows

---

## Critical Ambiguities

### 1. The 010 Triplet — three files at 010_phase8_*

**Files:**
- `010_phase8_FIXED.sql` — 265 lines
- `010_phase8_patient_empowerment.sql` — 254 lines
- `010_phase8_patient_empowerment_STEP_BY_STEP.sql` — 259 lines

**Common scope across all three:** All three create the same four Phase 8 tables and same four sets of policies + one trigger function. The schema produced is identical:

- `CREATE TABLE doctor_patient_relationships` (with status, relationship_type, started_at, ended_at, notes, UNIQUE(doctor_id, patient_id))
- `CREATE TABLE patient_diary`
- `CREATE TABLE patient_health_metrics`
- `CREATE TABLE medication_adherence_log`
- 3 indexes per table (12 total)
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all four
- 10 RLS policies (Doctors/Patients × the four tables)
- `CREATE OR REPLACE FUNCTION update_patient_diary_timestamp()`
- `CREATE TRIGGER update_patient_diary_updated_at`

**Differences (idempotency style only — schema effect is the same):**

| Aspect | FIXED | patient_empowerment | STEP_BY_STEP |
|---|---|---|---|
| `DROP TABLE IF EXISTS` first | Yes (4 tables) | No | No |
| `CREATE TABLE IF NOT EXISTS` | No | Yes | Yes |
| `CREATE INDEX IF NOT EXISTS` | No | No | Yes |
| `DROP POLICY IF EXISTS` before CREATE | No | Yes | Yes |

**Tracking table:** No row matches any of the three filenames. Closest is the file numbering 010 — the gap means none was formally tracked.

**Staging reality:** All four tables exist. Existing structure is consistent with any of the three (they produce the same schema).

**Verdict:** One of these three was applied via the Supabase SQL editor (not the migrations CLI), so no tracking row was written. Schema-wise it doesn't matter which — they all yield the same end state. Concretely:
- `STEP_BY_STEP` is the most-idempotent variant (every CREATE has IF NOT EXISTS, every CREATE POLICY is preceded by DROP IF EXISTS).
- `patient_empowerment` is the same minus `IF NOT EXISTS` on indexes.
- `FIXED` is the destructive variant — drops and recreates. If FIXED were applied a second time on populated tables it would lose data, but on staging the affected tables show test rows so this didn't happen recently.

**Recommendation for Session B/C:** Treat any of the three as authoritative for schema purposes. For canonicalization, keep `STEP_BY_STEP` and delete the other two — this is a doc decision, no DB action needed.

### 2. The 052 Collision — two different files numbered 052

**Files:**
- `052_drop_legacy_membership_tables.sql` — 162 lines
- `052_seed_patient_visibility.sql` — 107 lines

**`052_drop_legacy_membership_tables.sql` does:**
- `DROP TABLE IF EXISTS public.clinic_doctors` (legacy)
- `DROP TABLE IF EXISTS public.clinic_frontdesk` (legacy)
- `ALTER TABLE public.front_desk_staff` (column add or drop — verify in file body)
- 5 DROP POLICY IF EXISTS + 5 CREATE POLICY pairs (Doctors_, Front_, doctor_invoice_requests_read, frontdesk_invoice_requests, Clinic_)

**`052_seed_patient_visibility.sql` does:**
- `INSERT INTO public.patient_visibility ...` — backfill seed for the new `patient_visibility` table created by mig 020.

**Tracking table:**
- `20260425173944  drop_legacy_membership_tables` — applied 2026-04-25 17:39 UTC
- `20260425185040  052_seed_patient_visibility` — applied 2026-04-25 18:50 UTC (1h11m later)

**Staging reality:**
- `clinic_doctors` and `clinic_frontdesk` do NOT exist on staging — drop succeeded.
- `patient_visibility` exists with 32 rows — seed succeeded.

**Verdict:** Both files were applied. The collision is a numbering-discipline issue, not a 'which one ran' issue. Tracking versions are timestamps so the duplicate `052_` prefix doesn't actually conflict at apply time. Recommend renaming one to `052a` or `052b` and committing.

### 3. Other version/suffix discrepancies

Tracking has rows whose names contain `_v2` / `_v3` / `_search_path_fix` / `_grants_hardening` suffixes that don't appear in any local file. These indicate the SQL applied to staging diverged from the file in the working tree:

| File in repo | Tracking rows referencing this number |
|---|---|
| `076_quarantine_resolution.sql` | `076_quarantine_resolution_v3` (v1, v2 may have been hot-patched) |
| `080_add_global_refs_to_clinical_tables.sql` | `080_add_global_refs_to_clinical_tables_v2` |
| `083_effective_messaging_consent_view.sql` | `083_effective_messaging_consent_view` AND `083_effective_messaging_consent_view_v2` (both applied — view replaced) |
| `087_privacy_code_functions.sql` | `087_privacy_code_functions` AND `087_privacy_code_functions_search_path_fix` AND `087_privacy_code_function_grants_hardening` (3 successive applies; only the original file exists locally) |

**Verdict:** For 076, 080, 083, 087 the file in the working tree may NOT be the SQL that produced the current staging state. Session B should treat these files as untrustworthy when reasoning about runtime behaviour and instead diff staging objects (functions / view definitions) against the file's claims.

### 4. Tracking rows with no file at all

Two tracking rows reference SQL that was applied directly to staging with no file ever committed to the repo:

- `20260408145102  enable_rls_on_unprotected_tables`
- `20260408145129  fix_otp_codes_rls_phone_based_records`

Both applied 2026-04-08 within 27 seconds of each other. The names suggest they enabled RLS and fixed an OTP-codes policy. Without the file, the only record of what they did is in the tracking table's `statements` column (not extracted in this audit due to size — Session B should fetch them via `SELECT statements FROM supabase_migrations.schema_migrations WHERE version IN ('20260408145102','20260408145129')`).

---

## Per-File Inventory

| filename | lines | rollback? | tracking row(s) | first comment |
|---|---:|:---:|---|---|
| `001_initial_schema.sql` | 386 |  | **none** | MedAssist Phase 1 - Initial Database Schema |
| `002_fix_rls_insert_policies.sql` | 23 |  | **none** | Fix for RLS policy blocking user registration |
| `003_fix_existing_auth_emails.sql` | 23 |  | **none** | Fix existing accounts that are missing email in auth.users |
| `004_add_patient_demographics.sql` | 23 |  | **none** | Add demographic fields to patients table |
| `005_fix_doctor_patient_rls.sql` | 18 |  | **none** | Fix: Allow doctors to view patients from their appointments |
| `006_front_desk_module.sql` | 228 |  | **none** | Phase 6: Front Desk Module Database Schema |
| `007_prescriptions_vitals_labs.sql` | 285 |  | **none** | Phase 7: Prescriptions & Clinical Enhancements |
| `008_fix_frontdesk_and_patient_features.sql` | 182 |  | **none** | Migration 008: Fix frontdesk constraint and add patient self-entry features |
| `009_add_messaging.sql` | 66 |  | **none** | Migration 009: Add messaging system |
| `010_phase8_FIXED.sql` | 265 |  | **none** | (no header comment) |
| `010_phase8_patient_empowerment.sql` | 254 |  | **none** | (no header comment) |
| `010_phase8_patient_empowerment_STEP_BY_STEP.sql` | 259 |  | **none** | (no header comment) |
| `011_phase11_messaging_sharing.sql` | 293 |  | **none** | (no header comment) |
| `012_phase10_imaging_and_record_domains.sql` | 201 |  | **none** | Phase 10: Imaging + Advanced Clinical Record Domains |
| `013_privacy_reconciliation.sql` | 480 |  | `013` privacy_reconciliation | (no header comment) |
| `014_shared_rate_limits.sql` | 74 |  | `014` shared_rate_limits | (no header comment) |
| `015_patient_medication_intake.sql` | 75 |  | **none** | (no header comment) |
| `016_multi_tenant_clinic.sql` | 27 |  | **none** | (no header comment) |
| `017_add_prescriptions_table.sql` | 95 |  | **none** | (no header comment) |
| `018_clinic_memberships.sql` | 124 |  | **none** | (no header comment) |
| `019_clinic_id_everywhere.sql` | 433 |  | `20260425034437` clinic_id_everywhere_redo (fuzzy) | (no header comment) |
| `020_assignments_visibility_audit.sql` | 209 |  | **none** | (no header comment) |
| `021_centralized_access_control.sql` | 345 |  | **none** | (no header comment) |
| `022_doctor_fees.sql` | 14 |  | **none** | (no header comment) |
| `023_clinic_architecture_completion.sql` | 152 |  | **none** | (no header comment) |
| `024_fix_otp_codes_for_registration.sql` | 48 |  | **none** | (no header comment) |
| `025_appointment_reason_and_notifications.sql` | 86 |  | **none** | (no header comment) |
| `026_data_foundation_fixes.sql` | 175 |  | **none** | (no header comment) |
| `027_rx_intelligence_phase0.sql` | 126 |  | **none** | (no header comment) |
| `028_ensure_appointment_columns.sql` | 38 |  | **none** | (no header comment) |
| `029_add_note_data_column.sql` | 53 |  | **none** | (no header comment) |
| `030_add_guardian_id_to_patients.sql` | 24 |  | **none** | Migration 030: Add guardian_id FK to patients table |
| `031_prescription_templates.sql` | 30 |  | **none** | Migration 031: Prescription templates table |
| `032_features_5_6_sms_analytics.sql` | 22 |  | **none** | Migration 032: Template usage tracking |
| `033_add_clinic_address.sql` | 23 |  | **none** | Migration 033: Add address column to clinics table |
| `034_add_invite_code_to_clinics.sql` | 9 |  | **none** | Migration 034: Add invite_code column to clinics table |
| `035_storage_attachments_bucket.sql` | 50 |  | **none** | (no header comment) |
| `036_doctor_availability_rls.sql` | 77 |  | **none** | (no header comment) |
| `037_appointment_window_state.sql` | 81 |  | **none** | (no header comment) |
| `038_queue_priority_and_urgent.sql` | 112 |  | **none** | (no header comment) |
| `039_gap_aware_scheduling.sql` | 203 |  | **none** | (no header comment) |
| `040_invoice_fields.sql` | 48 |  | **none** | Migration 040: Invoice fields on payments + invoice_requests table |
| `041_fix_otp_purpose_constraint.sql` | 30 |  | **none** | (no header comment) |
| `042_missing_tables_and_columns.sql` | 226 |  | **none** | (no header comment) |
| `043_dev_test_accounts.sql` | 221 |  | **none** | (no header comment) |
| `044_payment_method_transfer.sql` | 30 |  | **none** | (no header comment) |
| `045_backfill_clinical_notes_clinic.sql` | 60 |  | `20260425031343` backfill_clinical_notes_clinic | (no header comment) |
| `046_clinical_notes_clinic_not_null.sql` | 52 |  | `20260425032442` clinical_notes_clinic_not_null | (no header comment) |
| `047_payments_clinic_not_null.sql` | 49 |  | `20260425033603` payments_clinic_not_null | (no header comment) |
| `048_clinic_id_everywhere_redo.sql` | 315 |  | `20260425034437` clinic_id_everywhere_redo | (no header comment) |
| `049_backfill_self_registered_patients.sql` | 88 |  | `20260425044809` backfill_self_registered_patients | (no header comment) |
| `050_test_data_cleanup.sql` | 127 |  | `20260425045359` test_data_cleanup | (no header comment) |
| `051_clinic_id_not_null_19_tables.sql` | 58 |  | `20260425045507` clinic_id_not_null_19_tables | (no header comment) |
| `052_drop_legacy_membership_tables.sql` | 162 |  | `20260425173944` drop_legacy_membership_tables | (no header comment) |
| `052_seed_patient_visibility.sql` | 107 |  | `20260425185040` 052_seed_patient_visibility | (no header comment) |
| `053_enums_and_clinic_extras.sql` | 215 |  | `20260425190854` 053_enums_and_clinic_extras | (no header comment) |
| `054_access_control_functions.sql` | 203 |  | `20260425192503` 054_access_control_functions | (no header comment) |
| `055_vital_signs_clinic_policy.sql` | 120 |  | `20260425194703` 055_vital_signs_clinic_policy | (no header comment) |
| `056_fix_clinic_memberships_recursion.sql` | 100 |  | `20260425232003` 056_fix_clinic_memberships_recursion | (no header comment) |
| `057_enable_rls_on_dormant_tables.sql` | 129 |  | `20260425232953` 057_enable_rls_on_dormant_tables | (no header comment) |
| `058_imaging_orders_clinic_policy.sql` | 104 |  | `20260425233443` 058_imaging_orders_clinic_policy | (no header comment) |
| `059_lab_orders_clinic_policy.sql` | 107 |  | `20260425234049` 059_lab_orders_clinic_policy | (no header comment) |
| `060_lab_results_clinic_policy.sql` | 111 |  | `20260426000222` 060_lab_results_clinic_policy | (no header comment) |
| `061_check_in_queue_clinic_policy.sql` | 94 |  | `20260426001748` 061_check_in_queue_clinic_policy | (no header comment) |
| `062_conversations_clinic_policy.sql` | 80 |  | `20260426011757` 062_conversations_clinic_policy | (no header comment) |
| `063_messages_clinic_policy.sql` | 89 |  | `20260426012617` 063_messages_clinic_policy | (no header comment) |
| `064_payments_clinic_policy.sql` | 94 |  | `20260426013225` 064_payments_clinic_policy | (no header comment) |
| `065_appointments_clinic_policy.sql` | 83 |  | `20260426013630` 065_appointments_clinic_policy | (no header comment) |
| `066_clinical_notes_clinic_policy.sql` | 121 |  | `20260426014010` 066_clinical_notes_clinic_policy | (no header comment) |
| `067_patients_clinic_policy.sql` | 105 |  | `20260426014336` 067_patients_clinic_policy | (no header comment) |
| `068_cleanup_legacy_policies.sql` | 229 |  | **none** | (no header comment) |
| `069_add_idempotency_keys.sql` | 52 |  | `20260426051529` 069_add_idempotency_keys | 069_add_idempotency_keys.sql |
| `070_users_phone_verified_and_phone_change_for_staff.sql` | 510 |  | `20260426062710` 070_users_phone_verified_and_phone_change_for_staff | (no header comment) |
| `071_normalize_patient_phone.sql` | 217 | ✓ | `20260429031435` 071_normalize_patient_phone | (no header comment) |
| `072_dedup_detection.sql` | 169 | ✓ | `20260429031911` 072_dedup_detection<br>`20260429150906` 078_user_dedup_detection | (no header comment) |
| `073_create_global_patients.sql` | 468 | ✓ | `20260429032416` 073_create_global_patients | (no header comment) |
| `074_relax_audit_actor_user_id.sql` | 226 | ✓ | `20260429150427` 074_relax_audit_actor_user_id | (no header comment) |
| `075_create_patient_clinic_records.sql` | 263 | ✓ | `20260429150529` 075_create_patient_clinic_records | (no header comment) |
| `076_quarantine_resolution.sql` | 288 | ✓ | `20260429150809` 076_quarantine_resolution_v3 (fuzzy) | (no header comment) |
| `077_patients_global_patient_id_not_null.sql` | 75 | ✓ | `20260429150835` 077_patients_global_patient_id_not_null | (no header comment) |
| `078_user_dedup_detection.sql` | 229 | ✓ | `20260429150906` 078_user_dedup_detection | (no header comment) |
| `079_user_dedup_consumption.sql` | 193 | ✓ | `20260429150944` 079_user_dedup_consumption | (no header comment) |
| `080_add_global_refs_to_clinical_tables.sql` | 430 | ✓ | `20260429151245` 080_add_global_refs_to_clinical_tables_v2 (fuzzy) | (no header comment) |
| `081_compatibility_triggers.sql` | 305 | ✓ | `20260429151341` 081_compatibility_triggers | (no header comment) |
| `082_recover_leading_zero_phones.sql` | 265 | ✓ | `20260430003910` 082_recover_leading_zero_phones | (no header comment) |
| `083_effective_messaging_consent_view.sql` | 139 | ✓ | `20260430003949` 083_effective_messaging_consent_view | (no header comment) |
| `084_create_privacy_code_attempts.sql` | 123 | ✓ | `20260430004114` 084_create_privacy_code_attempts | (no header comment) |
| `085_create_patient_privacy_codes.sql` | 121 | ✓ | `20260430004127` 085_create_patient_privacy_codes | (no header comment) |
| `086_create_privacy_code_sms_tokens.sql` | 112 | ✓ | `20260430004139` 086_create_privacy_code_sms_tokens | (no header comment) |
| `087_privacy_code_functions.sql` | 776 | ✓ | `20260430004306` 087_privacy_code_functions | (no header comment) |
| `088_pcr_insert_audit_trigger.sql` | 141 | ✓ | `20260430053209` 088_pcr_insert_audit_trigger | (no header comment) |
| `089_normalize_auth_phone.sql` | 309 | ✓ | `20260430060016` 089_normalize_auth_phone | (no header comment) |
| `090_patient_data_shares.sql` | 703 | ✓ | `20260430063050` 090_patient_data_shares | (no header comment) |
| `091_atomic_share_creation.sql` | 120 | ✓ | `20260501022233` 091_atomic_share_creation | (no header comment) |
| `092_rls_helper_functions.sql` | 292 | ✓ | `20260501055037` 092_rls_helper_functions | (no header comment) |
| `093_rls_patient_identity.sql` | 321 | ✓ | `20260501061001` 093_rls_patient_identity | (no header comment) |
| `094_rls_clinical_data.sql` | 303 | ✓ | `20260501132504` 094_rls_clinical_data | (no header comment) |
| `094a_rls_helper_fixes.sql` | 267 | ✓ | `20260501151201` 094a_rls_helper_fixes | (no header comment) |
| `095_rls_operations.sql` | 103 | ✓ | `20260502031410` 095_rls_operations | (no header comment) |
| `096_rls_communication.sql` | 141 | ✓ | `20260502032425` 096_rls_communication | (no header comment) |
| `097_rls_non_patient.sql` | 106 | ✓ | `20260502053114` 097_rls_non_patient | (no header comment) |
| `098_patient_code_schema.sql` | 182 | ✓ | `20260503022806` 098_patient_code_schema | (no header comment) |
| `099_patient_code_rpcs.sql` | 399 | ✓ | **none** | (no header comment) |

---

## Rollback Companions

Forward files with `.rollback.sql` companion: 30 / 103.

Rollbacks first appear at file 071 — the patient-identity build series. Files 001-070 have no rollback companions. This matches the pattern: rollbacks were a discipline introduced for the patient-identity rewrite, not retroactively applied to earlier work.