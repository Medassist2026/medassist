# Migration Claims vs Staging Reality — Audit Session A

**Captured:** 2026-05-03  
**Method:** Each migration file in `supabase/migrations/` was parsed for schema-creating statements (CREATE TABLE / ADD COLUMN / CREATE FUNCTION / CREATE POLICY / CREATE INDEX / CREATE TRIGGER / ADD CONSTRAINT / CREATE TYPE / CREATE VIEW / ENABLE RLS). Each claim was checked against the live `medassist-egypt` schema snapshot.  
**Total claims parsed:** 831 across 77 forward migration files

**Caveats:**
- The parser is regex-based, not a full SQL parser. It matches the most common forms (e.g., `CREATE TABLE [IF NOT EXISTS] [public.]name`). DDL inside `DO $$ ... $$` PL/pgSQL blocks is not extracted.
- A `MATCH` means the named object exists on staging. It does NOT prove the staging object's structure matches the migration file's structure (a `DRIFT_PARTIAL` would require column-level / body-level diff). For this audit, name-level match is the bar.
- A `MISSING` means the migration claims to create object X but X is not on staging. Possible causes: the migration was never applied; the object was later dropped; the parser was wrong; the object was renamed.
- DROP_TABLE 'MATCH' means the table is correctly absent. DROP_TABLE 'MISSING' means the table the migration tried to drop still exists.

---

## Summary by status

| status | count |
|---|---:|
| MATCH | 755 |
| MISSING | 76 |
| DRIFT_PARTIAL | 0 |

**No DRIFT_PARTIAL classifications were emitted by this pass.** Confirming actual structural drift (e.g. column types, policy bodies) requires deep-diff between each migration's CREATE TABLE body and the live column list, plus comparing each policy's USING/WITH CHECK bodies against `pg_policies.qual` / `with_check`. That work is for Session C.

---

## EXTRA_ON_STAGING — objects on staging not claimed by any migration file

**This is the critical 'where did this come from?' category.**

### Tables on staging not created by any migration (6)

- `_rls_test_results` — Created by `audits/rls-test-matrix.sql` test harness — NOT a migration file. Benign.
- `account_recovery_requests` — **No CREATE TABLE in any migration file.** Mig 070 references it as 'already complete'. Provenance: Supabase SQL editor.
- `audit_log` — **No CREATE TABLE in any migration file.** Mig 042 mentions it as separate from `audit_events`. Provenance: Supabase SQL editor.
- `patient_phone_verification_issues` — **No CREATE TABLE in any migration file.** Mig 050 references it in CASCADE cleanup. Provenance: Supabase SQL editor.
- `phone_corrections` — **No CREATE TABLE in any migration file.** Mig 070 references it as 'already complete'. Provenance: Supabase SQL editor.
- `sms_reminders` — **No CREATE TABLE in any migration file.** Mig 032 explicitly says 'sms_reminders already exists'. Provenance: Supabase SQL editor.

**Verdict:** 5 tables (excluding the test harness table) were created directly on staging without migration files. This matches the gap in the tracking table for the 2026-04-08 era — `enable_rls_on_unprotected_tables` and `fix_otp_codes_rls_phone_based_records` are tracked but have no file. Likely several other SQL-editor applies happened that aren't even in tracking.

### Functions on staging not created by any migration (9)

- `cleanup_expired_verification_data` — **Not in any migration.** Likely paired with one of the unclaimed tables (phone verification cleanup).
- `create_conversation_after_appointment` — **Not in any migration.** Trigger function for `appointments.trigger_create_conversation`.
- `create_sharing_preferences_after_appointment` — **Not in any migration.** Trigger function for `appointments.trigger_create_sharing`.
- `is_account_dormant` — **Not in any migration.** Likely paired with `account_recovery_requests`.
- `mark_dormant_accounts` — **Not in any migration.** Likely paired with `account_recovery_requests`.
- `rls_test_record` — Created by `audits/rls-test-matrix.sql` — test harness. Benign.
- `rls_test_seed` — Created by `audits/rls-test-seed.sql` — test harness. Benign.
- `rls_test_teardown` — Created by `audits/rls-test-matrix.sql` — test harness. Benign.
- `update_patient_activity` — **Not in any migration.** Trigger function used by `update_patient_activity_on_appointment` / `update_patient_activity_on_note`.

### Triggers on staging not created by any migration (3)

- `update_patient_activity_on_appointment` — bound to one of the unclaimed functions; created in same SQL-editor session as the table.
- `update_patient_activity_on_note` — bound to one of the unclaimed functions; created in same SQL-editor session as the table.
- `update_patient_records_updated_at` — bound to one of the unclaimed functions; created in same SQL-editor session as the table.

### Columns on staging not claimed by any migration (111)

Sample (first 30 of 111):

```
  _patient_phone_duplicates.clinic_ids
  _patient_phone_duplicates.dup_count
  _patient_phone_duplicates.earliest_created
  _patient_phone_duplicates.full_names
  _patient_phone_duplicates.latest_created
  _patient_phone_duplicates.normalized_phone
  _patient_phone_duplicates.patient_ids
  _rls_test_results.actual_outcome
  _rls_test_results.actual_rows
  _rls_test_results.description
  _rls_test_results.expected_outcome
  _rls_test_results.notes
  _rls_test_results.ran_at
  _rls_test_results.run_no
  _rls_test_results.scenario
  _rls_test_results.table_name
  _user_phone_duplicates.dup_count
  _user_phone_duplicates.earliest_created
  _user_phone_duplicates.latest_created
  _user_phone_duplicates.normalized_phone
  _user_phone_duplicates.user_ids
  account_recovery_requests.claimed_patient_id
  account_recovery_requests.claimed_phone
  account_recovery_requests.completed_at
  account_recovery_requests.created_at
  account_recovery_requests.expires_at
  account_recovery_requests.id
  account_recovery_requests.new_phone
  account_recovery_requests.review_notes
  account_recovery_requests.reviewed_at
  ... and 81 more
```

These are mostly columns on the unclaimed tables above (phone_corrections.*, account_recovery_requests.*, sms_reminders.*, audit_log.*, patient_phone_verification_issues.*) — created in the same SQL-editor sessions as their parent tables. Full list: `audits/database-audit/extras.json` companion file.

### Indexes on staging not claimed by any migration (34)

Likely all indexes on the unclaimed tables. Sample:

```
  idx_anonymous_visits_date
  idx_anonymous_visits_status
  idx_audit_log_action
  idx_audit_log_created
  idx_audit_log_resource
  idx_audit_log_user
  idx_corrections_patient
  idx_corrections_pending
  idx_doctor_availability_doctor_id
  idx_opt_out_stats_date
  idx_opt_out_stats_doctor
  idx_otp_expires
  idx_otp_phone
  idx_patient_records_date
  idx_patient_records_patient
  idx_patient_records_type
  idx_patients_email
  idx_patients_national_id_hash
  idx_phone_change_patient
  idx_phone_change_pending
  idx_phone_change_status
  idx_phone_history_current
  idx_phone_history_phone
  idx_phone_issues_patient
  idx_phone_issues_unresolved
  idx_recovery_codes_patient
  idx_recovery_codes_unused
  idx_recovery_requests_phone
  idx_recovery_requests_status
  idx_sms_reminders_appointment
  ... and 4 more
```

### Policies on staging not claimed by any migration (136)

**This is the largest extras category and the most concerning for an RLS-rewrite-in-progress program.** 136 policies on staging are not produced by any `CREATE POLICY` statement in any migration file. Some are explained by:

- The five unclaimed tables have their own RLS policies — these account for some.
- Tracking entries `20260408145102 enable_rls_on_unprotected_tables` and `20260408145129 fix_otp_codes_rls_phone_based_records` applied policies that are not in any file.
- The version-suffix tracking entries (083_v2, 087_search_path_fix, 087_grants_hardening) likely modified policies whose final state doesn't match the file.
- **Important caveat:** the regex parser may also miss CREATE POLICY statements with unusual quoting or inside DO blocks. Manual spot-check of a few from this list will tell you which is which.

Sample of unclaimed policies (first 30):

```
  analytics_events::users can create analytics events
  anonymous_visits::doctors can manage anonymous visits
  anonymous_visits::doctors see own anonymous visits
  appointments::clinic-scoped appointment access
  appointments::doctors and front desk can create appointments
  appointments::doctors can read their appointments
  appointments::front desk can manage appointments
  appointments::front desk can read clinic appointments
  appointments::front desk can view all appointments
  audit_log::service_role_audit_log
  check_in_queue::clinic-scoped queue access
  check_in_queue::doctors can read their own queue
  check_in_queue::doctors can update their own queue
  check_in_queue::front desk can manage queue
  check_in_queue::frontdesk can manage queue for their clinic
  chronic_conditions::doctors view chronic conditions for treated patients
  chronic_conditions::patients manage own chronic conditions
  clinic_memberships::members can view clinic memberships
  clinic_memberships::owners can manage memberships
  clinic_memberships::owners can update memberships
  clinical_notes::clinic-scoped note access
  clinical_notes::doctors can create clinical notes
  clinical_notes::doctors can insert notes in their clinic
  clinical_notes::doctors can read own clinical notes
  clinical_notes::doctors can update own clinical notes
  clinical_notes::patients can read their clinical notes
  conversations::clinic-scoped conversation access
  conversations::create conversation after appointment
  conversations::create conversation after visit
  conversations::doctors can update conversation status
  ... and 106 more
```

---

## MISSING claims — migration says it creates X but X is not on staging

76 claims marked MISSING. Many fall into expected patterns (test data cleanup, idempotency mechanics, parser edge cases). Concentrations to investigate:

### `020_assignments_visibility_audit.sql` — 12 missing

- `CREATE_INDEX` `idx_assignments_clinic`
- `CREATE_INDEX` `idx_assignments_assistant`
- `CREATE_INDEX` `idx_assignments_doctor`
- `CREATE_INDEX` `idx_assignments_active`
- `CREATE_INDEX` `idx_visibility_clinic_patient`
- `CREATE_INDEX` `idx_visibility_grantee`
- `CREATE_INDEX` `idx_visibility_mode`
- `CREATE_INDEX` `idx_audit_clinic`
- `CREATE_INDEX` `idx_audit_actor`
- `CREATE_INDEX` `idx_audit_entity`
- `CREATE_INDEX` `idx_audit_action`
- `CREATE_INDEX` `idx_audit_created`

### `023_clinic_architecture_completion.sql` — 10 missing

- `ADD_COLUMN` `patients.patient_code`
- `CREATE_FUNCTION` `generate_patient_code`
- `CREATE_FUNCTION` `set_patient_code`
- `CREATE_INDEX` `idx_patients_patient_code`
- `CREATE_INDEX` `idx_clinical_notes_clinic_id`
- `CREATE_INDEX` `idx_patient_visibility_clinic_patient`
- `CREATE_INDEX` `idx_patient_visibility_grantee`
- `CREATE_INDEX` `idx_audit_events_clinic_created`
- `CREATE_INDEX` `idx_audit_events_entity`
- `CREATE_TRIGGER` `trg_set_patient_code`

### `027_rx_intelligence_phase0.sql` — 9 missing

- `CREATE_TABLE` `prescription_events`
- `CREATE_VIEW` `rx_doctor_patterns`
- `ENABLE_RLS` `prescription_events` (table not on staging)
- `CREATE_INDEX` `idx_rx_events_doctor_complaint`
- `CREATE_INDEX` `idx_rx_events_doctor_med`
- `CREATE_INDEX` `idx_rx_events_doctor_visit`
- `CREATE_INDEX` `idx_rx_events_doctor_time`
- `CREATE_INDEX` `idx_rx_events_patient`
- `CREATE_INDEX` `idx_rx_events_note`

### `001_initial_schema.sql` — 8 missing

- `CREATE_TABLE` `clinic_doctors`
- `ENABLE_RLS` `clinic_doctors` (table not on staging)
- `CREATE_INDEX` `idx_clinic_doctors_clinic`
- `CREATE_INDEX` `idx_clinic_doctors_doctor`
- `CREATE_INDEX` `idx_messages_doctor`
- `CREATE_INDEX` `idx_messages_patient`
- `CREATE_INDEX` `idx_messages_created`
- `CREATE_TRIGGER` `update_messages_modified_at`

### `008_fix_frontdesk_and_patient_features.sql` — 4 missing

- `CREATE_INDEX` `idx_patient_medical_records_patient`
- `CREATE_INDEX` `idx_patient_medical_records_date`
- `CREATE_INDEX` `idx_patient_medical_records_type`
- `CREATE_TRIGGER` `update_patient_medical_records_updated_at`

### `009_add_messaging.sql` — 4 missing

- `CREATE_INDEX` `idx_messages_doctor`
- `CREATE_INDEX` `idx_messages_patient`
- `CREATE_INDEX` `idx_messages_created`
- `CREATE_INDEX` `idx_messages_unread`

### `010_phase8_FIXED.sql` — 4 missing

- `DROP_TABLE` `medication_adherence_log` (table still exists despite DROP claim)
- `DROP_TABLE` `patient_health_metrics` (table still exists despite DROP claim)
- `DROP_TABLE` `patient_diary` (table still exists despite DROP claim)
- `DROP_TABLE` `doctor_patient_relationships` (table still exists despite DROP claim)

### `025_appointment_reason_and_notifications.sql` — 4 missing

- `CREATE_POLICY` `notifications::notifications_select_own`
- `CREATE_POLICY` `notifications::notifications_update_own`
- `CREATE_POLICY` `notifications::notifications_insert_service`
- `CREATE_INDEX` `idx_notifications_clinic`

### `090_patient_data_shares.sql` — 4 missing

- `CREATE_POLICY` `patient_data_shares::patient_data_shares_no_select`
- `CREATE_POLICY` `patient_data_shares::patient_data_shares_no_insert`
- `CREATE_POLICY` `patient_data_shares::patient_data_shares_no_update`
- `CREATE_POLICY` `patient_data_shares::patient_data_shares_no_delete`

### `022_doctor_fees.sql` — 3 missing

- `ADD_COLUMN` `doctors.consultation_fee_egp`
- `ADD_COLUMN` `doctors.followup_fee_egp`
- `ADD_COLUMN` `doctors.followup_window_days`

### `026_data_foundation_fixes.sql` — 3 missing

- `CREATE_INDEX` `idx_dpr_clinic_id`
- `CREATE_INDEX` `idx_appointments_clinic_doctor`
- `CREATE_INDEX` `idx_appointments_clinic_date`

### `099_patient_code_rpcs.sql` — 3 missing

- `CREATE_FUNCTION` `_base32_encode_5bytes`
- `CREATE_FUNCTION` `patient_get_my_code`
- `CREATE_FUNCTION` `patient_regenerate_my_code`

### `042_missing_tables_and_columns.sql` — 2 missing

- `CREATE_TABLE` `clinic_frontdesk`
- `CREATE_INDEX` `idx_clinic_frontdesk_clinic`

### `006_front_desk_module.sql` — 1 missing

- `CREATE_INDEX` `idx_front_desk_clinic`

### `019_clinic_id_everywhere.sql` — 1 missing

- `CREATE_INDEX` `idx_consent_grants_clinic`

### `073_create_global_patients.sql` — 1 missing

- `CREATE_POLICY` `global_patients::global_patients_deny_all`

### `075_create_patient_clinic_records.sql` — 1 missing

- `CREATE_POLICY` `patient_clinic_records::patient_clinic_records_deny_all`

### `076_quarantine_resolution.sql` — 1 missing

- `CREATE_FUNCTION` `_classify_quarantined_phone`

### `084_create_privacy_code_attempts.sql` — 1 missing

- `CREATE_POLICY` `privacy_code_attempts::privacy_code_attempts_no_select`

---

## Per-claim detail

Full per-claim verification table is in the companion JSON file `audits/database-audit/staging-schema-2026-05-03.json` (under no specific key — see `audits/database-audit/_extras_companion.md` for the structure). Below is a condensed view sorted by migration number.

| migration | type | target | status | notes |
|---|---|---|:---:|---|
| `001_initial_schema.sql` | CREATE_INDEX | `idx_clinic_doctors_clinic` | **MISSING** |  |
| `001_initial_schema.sql` | CREATE_INDEX | `idx_clinic_doctors_doctor` | **MISSING** |  |
| `001_initial_schema.sql` | CREATE_INDEX | `idx_messages_created` | **MISSING** |  |
| `001_initial_schema.sql` | CREATE_INDEX | `idx_messages_doctor` | **MISSING** |  |
| `001_initial_schema.sql` | CREATE_INDEX | `idx_messages_patient` | **MISSING** |  |
| `001_initial_schema.sql` | CREATE_TABLE | `clinic_doctors` | **MISSING** |  |
| `001_initial_schema.sql` | CREATE_TRIGGER | `update_messages_modified_at` | **MISSING** |  |
| `001_initial_schema.sql` | ENABLE_RLS | `clinic_doctors` | **MISSING** | table not on staging |
| `006_front_desk_module.sql` | CREATE_INDEX | `idx_front_desk_clinic` | **MISSING** |  |
| `008_fix_frontdesk_and_patient_features.sql` | CREATE_INDEX | `idx_patient_medical_records_date` | **MISSING** |  |
| `008_fix_frontdesk_and_patient_features.sql` | CREATE_INDEX | `idx_patient_medical_records_patient` | **MISSING** |  |
| `008_fix_frontdesk_and_patient_features.sql` | CREATE_INDEX | `idx_patient_medical_records_type` | **MISSING** |  |
| `008_fix_frontdesk_and_patient_features.sql` | CREATE_TRIGGER | `update_patient_medical_records_updated_at` | **MISSING** |  |
| `009_add_messaging.sql` | CREATE_INDEX | `idx_messages_created` | **MISSING** |  |
| `009_add_messaging.sql` | CREATE_INDEX | `idx_messages_doctor` | **MISSING** |  |
| `009_add_messaging.sql` | CREATE_INDEX | `idx_messages_patient` | **MISSING** |  |
| `009_add_messaging.sql` | CREATE_INDEX | `idx_messages_unread` | **MISSING** |  |
| `010_phase8_FIXED.sql` | DROP_TABLE | `doctor_patient_relationships` | **MISSING** | table still exists despite DROP claim |
| `010_phase8_FIXED.sql` | DROP_TABLE | `medication_adherence_log` | **MISSING** | table still exists despite DROP claim |
| `010_phase8_FIXED.sql` | DROP_TABLE | `patient_diary` | **MISSING** | table still exists despite DROP claim |
| `010_phase8_FIXED.sql` | DROP_TABLE | `patient_health_metrics` | **MISSING** | table still exists despite DROP claim |
| `019_clinic_id_everywhere.sql` | CREATE_INDEX | `idx_consent_grants_clinic` | **MISSING** |  |
| `020_assignments_visibility_audit.sql` | CREATE_INDEX | `idx_assignments_active` | **MISSING** |  |
| `020_assignments_visibility_audit.sql` | CREATE_INDEX | `idx_assignments_assistant` | **MISSING** |  |
| `020_assignments_visibility_audit.sql` | CREATE_INDEX | `idx_assignments_clinic` | **MISSING** |  |
| `020_assignments_visibility_audit.sql` | CREATE_INDEX | `idx_assignments_doctor` | **MISSING** |  |
| `020_assignments_visibility_audit.sql` | CREATE_INDEX | `idx_audit_action` | **MISSING** |  |
| `020_assignments_visibility_audit.sql` | CREATE_INDEX | `idx_audit_actor` | **MISSING** |  |
| `020_assignments_visibility_audit.sql` | CREATE_INDEX | `idx_audit_clinic` | **MISSING** |  |
| `020_assignments_visibility_audit.sql` | CREATE_INDEX | `idx_audit_created` | **MISSING** |  |
| `020_assignments_visibility_audit.sql` | CREATE_INDEX | `idx_audit_entity` | **MISSING** |  |
| `020_assignments_visibility_audit.sql` | CREATE_INDEX | `idx_visibility_clinic_patient` | **MISSING** |  |
| `020_assignments_visibility_audit.sql` | CREATE_INDEX | `idx_visibility_grantee` | **MISSING** |  |
| `020_assignments_visibility_audit.sql` | CREATE_INDEX | `idx_visibility_mode` | **MISSING** |  |
| `022_doctor_fees.sql` | ADD_COLUMN | `doctors.consultation_fee_egp` | **MISSING** |  |
| `022_doctor_fees.sql` | ADD_COLUMN | `doctors.followup_fee_egp` | **MISSING** |  |
| `022_doctor_fees.sql` | ADD_COLUMN | `doctors.followup_window_days` | **MISSING** |  |
| `023_clinic_architecture_completion.sql` | ADD_COLUMN | `patients.patient_code` | **MISSING** |  |
| `023_clinic_architecture_completion.sql` | CREATE_FUNCTION | `generate_patient_code` | **MISSING** |  |
| `023_clinic_architecture_completion.sql` | CREATE_FUNCTION | `set_patient_code` | **MISSING** |  |
| `023_clinic_architecture_completion.sql` | CREATE_INDEX | `idx_audit_events_clinic_created` | **MISSING** |  |
| `023_clinic_architecture_completion.sql` | CREATE_INDEX | `idx_audit_events_entity` | **MISSING** |  |
| `023_clinic_architecture_completion.sql` | CREATE_INDEX | `idx_clinical_notes_clinic_id` | **MISSING** |  |
| `023_clinic_architecture_completion.sql` | CREATE_INDEX | `idx_patient_visibility_clinic_patient` | **MISSING** |  |
| `023_clinic_architecture_completion.sql` | CREATE_INDEX | `idx_patient_visibility_grantee` | **MISSING** |  |
| `023_clinic_architecture_completion.sql` | CREATE_INDEX | `idx_patients_patient_code` | **MISSING** |  |
| `023_clinic_architecture_completion.sql` | CREATE_TRIGGER | `trg_set_patient_code` | **MISSING** |  |
| `025_appointment_reason_and_notifications.sql` | CREATE_INDEX | `idx_notifications_clinic` | **MISSING** |  |
| `025_appointment_reason_and_notifications.sql` | CREATE_POLICY | `notifications::notifications_insert_service` | **MISSING** |  |
| `025_appointment_reason_and_notifications.sql` | CREATE_POLICY | `notifications::notifications_select_own` | **MISSING** |  |
| `025_appointment_reason_and_notifications.sql` | CREATE_POLICY | `notifications::notifications_update_own` | **MISSING** |  |
| `026_data_foundation_fixes.sql` | CREATE_INDEX | `idx_appointments_clinic_date` | **MISSING** |  |
| `026_data_foundation_fixes.sql` | CREATE_INDEX | `idx_appointments_clinic_doctor` | **MISSING** |  |
| `026_data_foundation_fixes.sql` | CREATE_INDEX | `idx_dpr_clinic_id` | **MISSING** |  |
| `027_rx_intelligence_phase0.sql` | CREATE_INDEX | `idx_rx_events_doctor_complaint` | **MISSING** |  |
| `027_rx_intelligence_phase0.sql` | CREATE_INDEX | `idx_rx_events_doctor_med` | **MISSING** |  |
| `027_rx_intelligence_phase0.sql` | CREATE_INDEX | `idx_rx_events_doctor_time` | **MISSING** |  |
| `027_rx_intelligence_phase0.sql` | CREATE_INDEX | `idx_rx_events_doctor_visit` | **MISSING** |  |
| `027_rx_intelligence_phase0.sql` | CREATE_INDEX | `idx_rx_events_note` | **MISSING** |  |
| `027_rx_intelligence_phase0.sql` | CREATE_INDEX | `idx_rx_events_patient` | **MISSING** |  |
| `027_rx_intelligence_phase0.sql` | CREATE_TABLE | `prescription_events` | **MISSING** |  |
| `027_rx_intelligence_phase0.sql` | CREATE_VIEW | `rx_doctor_patterns` | **MISSING** |  |
| `027_rx_intelligence_phase0.sql` | ENABLE_RLS | `prescription_events` | **MISSING** | table not on staging |
| `042_missing_tables_and_columns.sql` | CREATE_INDEX | `idx_clinic_frontdesk_clinic` | **MISSING** |  |
| `042_missing_tables_and_columns.sql` | CREATE_TABLE | `clinic_frontdesk` | **MISSING** |  |
| `073_create_global_patients.sql` | CREATE_POLICY | `global_patients::global_patients_deny_all` | **MISSING** |  |
| `075_create_patient_clinic_records.sql` | CREATE_POLICY | `patient_clinic_records::patient_clinic_records_deny_all` | **MISSING** |  |
| `076_quarantine_resolution.sql` | CREATE_FUNCTION | `_classify_quarantined_phone` | **MISSING** |  |
| `084_create_privacy_code_attempts.sql` | CREATE_POLICY | `privacy_code_attempts::privacy_code_attempts_no_select` | **MISSING** |  |
| `090_patient_data_shares.sql` | CREATE_POLICY | `patient_data_shares::patient_data_shares_no_delete` | **MISSING** |  |
| `090_patient_data_shares.sql` | CREATE_POLICY | `patient_data_shares::patient_data_shares_no_insert` | **MISSING** |  |
| `090_patient_data_shares.sql` | CREATE_POLICY | `patient_data_shares::patient_data_shares_no_select` | **MISSING** |  |
| `090_patient_data_shares.sql` | CREATE_POLICY | `patient_data_shares::patient_data_shares_no_update` | **MISSING** |  |
| `099_patient_code_rpcs.sql` | CREATE_FUNCTION | `_base32_encode_5bytes` | **MISSING** |  |
| `099_patient_code_rpcs.sql` | CREATE_FUNCTION | `patient_get_my_code` | **MISSING** |  |
| `099_patient_code_rpcs.sql` | CREATE_FUNCTION | `patient_regenerate_my_code` | **MISSING** |  |

Total non-MATCH rows shown above. MATCH rows omitted for brevity — see `claim_results.json` for the full list.