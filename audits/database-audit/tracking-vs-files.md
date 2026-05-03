# Tracking Table vs Migration Files — Audit Session A

**Captured:** 2026-05-03  
**Tracking table:** `supabase_migrations.schema_migrations` on `medassist-egypt`
**Tracking rows:** 62  
**Forward migration files:** 103  

---

## Tracking table contents (full)

Versions are the value Supabase records when a migration is applied via the migrations CLI. Versions starting with `0` are short numeric (early period); versions starting with `2026...` are timestamp-based (current period).

| version | name | matched file(s) |
|---|---|---|
| `013` | privacy_reconciliation | `013_privacy_reconciliation.sql` |
| `014` | shared_rate_limits | `014_shared_rate_limits.sql` |
| `20260408145102` | enable_rls_on_unprotected_tables | **no file** |
| `20260408145129` | fix_otp_codes_rls_phone_based_records | **no file** |
| `20260425031343` | backfill_clinical_notes_clinic | `045_backfill_clinical_notes_clinic.sql` |
| `20260425032442` | clinical_notes_clinic_not_null | `046_clinical_notes_clinic_not_null.sql` |
| `20260425033603` | payments_clinic_not_null | `047_payments_clinic_not_null.sql` |
| `20260425034437` | clinic_id_everywhere_redo | `019_clinic_id_everywhere.sql`, `048_clinic_id_everywhere_redo.sql` |
| `20260425044809` | backfill_self_registered_patients | `049_backfill_self_registered_patients.sql` |
| `20260425045359` | test_data_cleanup | `050_test_data_cleanup.sql` |
| `20260425045507` | clinic_id_not_null_19_tables | `051_clinic_id_not_null_19_tables.sql` |
| `20260425173944` | drop_legacy_membership_tables | `052_drop_legacy_membership_tables.sql` |
| `20260425185040` | 052_seed_patient_visibility | `052_seed_patient_visibility.sql` |
| `20260425190854` | 053_enums_and_clinic_extras | `053_enums_and_clinic_extras.sql` |
| `20260425192503` | 054_access_control_functions | `054_access_control_functions.sql` |
| `20260425194703` | 055_vital_signs_clinic_policy | `055_vital_signs_clinic_policy.sql` |
| `20260425232003` | 056_fix_clinic_memberships_recursion | `056_fix_clinic_memberships_recursion.sql` |
| `20260425232953` | 057_enable_rls_on_dormant_tables | `057_enable_rls_on_dormant_tables.sql` |
| `20260425233443` | 058_imaging_orders_clinic_policy | `058_imaging_orders_clinic_policy.sql` |
| `20260425234049` | 059_lab_orders_clinic_policy | `059_lab_orders_clinic_policy.sql` |
| `20260426000222` | 060_lab_results_clinic_policy | `060_lab_results_clinic_policy.sql` |
| `20260426001748` | 061_check_in_queue_clinic_policy | `061_check_in_queue_clinic_policy.sql` |
| `20260426011757` | 062_conversations_clinic_policy | `062_conversations_clinic_policy.sql` |
| `20260426012617` | 063_messages_clinic_policy | `063_messages_clinic_policy.sql` |
| `20260426013225` | 064_payments_clinic_policy | `064_payments_clinic_policy.sql` |
| `20260426013630` | 065_appointments_clinic_policy | `065_appointments_clinic_policy.sql` |
| `20260426014010` | 066_clinical_notes_clinic_policy | `066_clinical_notes_clinic_policy.sql` |
| `20260426014336` | 067_patients_clinic_policy | `067_patients_clinic_policy.sql` |
| `20260426051529` | 069_add_idempotency_keys | `069_add_idempotency_keys.sql` |
| `20260426062710` | 070_users_phone_verified_and_phone_change_for_staff | `070_users_phone_verified_and_phone_change_for_staff.sql` |
| `20260429031435` | 071_normalize_patient_phone | `071_normalize_patient_phone.sql` |
| `20260429031911` | 072_dedup_detection | `072_dedup_detection.sql` |
| `20260429032416` | 073_create_global_patients | `073_create_global_patients.sql` |
| `20260429150427` | 074_relax_audit_actor_user_id | `074_relax_audit_actor_user_id.sql` |
| `20260429150529` | 075_create_patient_clinic_records | `075_create_patient_clinic_records.sql` |
| `20260429150809` | 076_quarantine_resolution_v3 | `076_quarantine_resolution.sql` |
| `20260429150835` | 077_patients_global_patient_id_not_null | `077_patients_global_patient_id_not_null.sql` |
| `20260429150906` | 078_user_dedup_detection | `072_dedup_detection.sql`, `078_user_dedup_detection.sql` |
| `20260429150944` | 079_user_dedup_consumption | `079_user_dedup_consumption.sql` |
| `20260429151245` | 080_add_global_refs_to_clinical_tables_v2 | `080_add_global_refs_to_clinical_tables.sql` |
| `20260429151341` | 081_compatibility_triggers | `081_compatibility_triggers.sql` |
| `20260430003910` | 082_recover_leading_zero_phones | `082_recover_leading_zero_phones.sql` |
| `20260430003949` | 083_effective_messaging_consent_view | `083_effective_messaging_consent_view.sql` |
| `20260430004044` | 083_effective_messaging_consent_view_v2 | **no file** |
| `20260430004114` | 084_create_privacy_code_attempts | `084_create_privacy_code_attempts.sql` |
| `20260430004127` | 085_create_patient_privacy_codes | `085_create_patient_privacy_codes.sql` |
| `20260430004139` | 086_create_privacy_code_sms_tokens | `086_create_privacy_code_sms_tokens.sql` |
| `20260430004306` | 087_privacy_code_functions | `087_privacy_code_functions.sql` |
| `20260430004355` | 087_privacy_code_functions_search_path_fix | **no file** |
| `20260430010517` | 087_privacy_code_function_grants_hardening | **no file** |
| `20260430053209` | 088_pcr_insert_audit_trigger | `088_pcr_insert_audit_trigger.sql` |
| `20260430060016` | 089_normalize_auth_phone | `089_normalize_auth_phone.sql` |
| `20260430063050` | 090_patient_data_shares | `090_patient_data_shares.sql` |
| `20260501022233` | 091_atomic_share_creation | `091_atomic_share_creation.sql` |
| `20260501055037` | 092_rls_helper_functions | `092_rls_helper_functions.sql` |
| `20260501061001` | 093_rls_patient_identity | `093_rls_patient_identity.sql` |
| `20260501132504` | 094_rls_clinical_data | `094_rls_clinical_data.sql` |
| `20260501151201` | 094a_rls_helper_fixes | `094a_rls_helper_fixes.sql` |
| `20260502031410` | 095_rls_operations | `095_rls_operations.sql` |
| `20260502032425` | 096_rls_communication | `096_rls_communication.sql` |
| `20260502053114` | 097_rls_non_patient | `097_rls_non_patient.sql` |
| `20260503022806` | 098_patient_code_schema | `098_patient_code_schema.sql` |

---

## Files in directory with NO tracking row (45 of 103)

These migration files exist in the working tree but have no corresponding row in `supabase_migrations.schema_migrations`. Possible reasons:

1. Applied via the Supabase SQL editor (which doesn't write a tracking row).
2. Drafted but never applied to staging.
3. Applied under a different name (renamed file or `_v2` suffix in tracking).

Cross-reference each file against the migration-claims-vs-reality table to determine which case applies.

| filename | line count | rollback? |
|---|---:|:---:|
| `001_initial_schema.sql` | 386 |  |
| `002_fix_rls_insert_policies.sql` | 23 |  |
| `003_fix_existing_auth_emails.sql` | 23 |  |
| `004_add_patient_demographics.sql` | 23 |  |
| `005_fix_doctor_patient_rls.sql` | 18 |  |
| `006_front_desk_module.sql` | 228 |  |
| `007_prescriptions_vitals_labs.sql` | 285 |  |
| `008_fix_frontdesk_and_patient_features.sql` | 182 |  |
| `009_add_messaging.sql` | 66 |  |
| `010_phase8_FIXED.sql` | 265 |  |
| `010_phase8_patient_empowerment.sql` | 254 |  |
| `010_phase8_patient_empowerment_STEP_BY_STEP.sql` | 259 |  |
| `011_phase11_messaging_sharing.sql` | 293 |  |
| `012_phase10_imaging_and_record_domains.sql` | 201 |  |
| `015_patient_medication_intake.sql` | 75 |  |
| `016_multi_tenant_clinic.sql` | 27 |  |
| `017_add_prescriptions_table.sql` | 95 |  |
| `018_clinic_memberships.sql` | 124 |  |
| `020_assignments_visibility_audit.sql` | 209 |  |
| `021_centralized_access_control.sql` | 345 |  |
| `022_doctor_fees.sql` | 14 |  |
| `023_clinic_architecture_completion.sql` | 152 |  |
| `024_fix_otp_codes_for_registration.sql` | 48 |  |
| `025_appointment_reason_and_notifications.sql` | 86 |  |
| `026_data_foundation_fixes.sql` | 175 |  |
| `027_rx_intelligence_phase0.sql` | 126 |  |
| `028_ensure_appointment_columns.sql` | 38 |  |
| `029_add_note_data_column.sql` | 53 |  |
| `030_add_guardian_id_to_patients.sql` | 24 |  |
| `031_prescription_templates.sql` | 30 |  |
| `032_features_5_6_sms_analytics.sql` | 22 |  |
| `033_add_clinic_address.sql` | 23 |  |
| `034_add_invite_code_to_clinics.sql` | 9 |  |
| `035_storage_attachments_bucket.sql` | 50 |  |
| `036_doctor_availability_rls.sql` | 77 |  |
| `037_appointment_window_state.sql` | 81 |  |
| `038_queue_priority_and_urgent.sql` | 112 |  |
| `039_gap_aware_scheduling.sql` | 203 |  |
| `040_invoice_fields.sql` | 48 |  |
| `041_fix_otp_purpose_constraint.sql` | 30 |  |
| `042_missing_tables_and_columns.sql` | 226 |  |
| `043_dev_test_accounts.sql` | 221 |  |
| `044_payment_method_transfer.sql` | 30 |  |
| `068_cleanup_legacy_policies.sql` | 229 |  |
| `099_patient_code_rpcs.sql` | 399 | ✓ |

## Files with a tracking row (58 of 103)

| filename | tracking version | tracking name |
|---|---|---|
| `013_privacy_reconciliation.sql` | `013` | privacy_reconciliation |
| `014_shared_rate_limits.sql` | `014` | shared_rate_limits |
| `019_clinic_id_everywhere.sql` | `20260425034437` | clinic_id_everywhere_redo (fuzzy) |
| `045_backfill_clinical_notes_clinic.sql` | `20260425031343` | backfill_clinical_notes_clinic |
| `046_clinical_notes_clinic_not_null.sql` | `20260425032442` | clinical_notes_clinic_not_null |
| `047_payments_clinic_not_null.sql` | `20260425033603` | payments_clinic_not_null |
| `048_clinic_id_everywhere_redo.sql` | `20260425034437` | clinic_id_everywhere_redo |
| `049_backfill_self_registered_patients.sql` | `20260425044809` | backfill_self_registered_patients |
| `050_test_data_cleanup.sql` | `20260425045359` | test_data_cleanup |
| `051_clinic_id_not_null_19_tables.sql` | `20260425045507` | clinic_id_not_null_19_tables |
| `052_drop_legacy_membership_tables.sql` | `20260425173944` | drop_legacy_membership_tables |
| `052_seed_patient_visibility.sql` | `20260425185040` | 052_seed_patient_visibility |
| `053_enums_and_clinic_extras.sql` | `20260425190854` | 053_enums_and_clinic_extras |
| `054_access_control_functions.sql` | `20260425192503` | 054_access_control_functions |
| `055_vital_signs_clinic_policy.sql` | `20260425194703` | 055_vital_signs_clinic_policy |
| `056_fix_clinic_memberships_recursion.sql` | `20260425232003` | 056_fix_clinic_memberships_recursion |
| `057_enable_rls_on_dormant_tables.sql` | `20260425232953` | 057_enable_rls_on_dormant_tables |
| `058_imaging_orders_clinic_policy.sql` | `20260425233443` | 058_imaging_orders_clinic_policy |
| `059_lab_orders_clinic_policy.sql` | `20260425234049` | 059_lab_orders_clinic_policy |
| `060_lab_results_clinic_policy.sql` | `20260426000222` | 060_lab_results_clinic_policy |
| `061_check_in_queue_clinic_policy.sql` | `20260426001748` | 061_check_in_queue_clinic_policy |
| `062_conversations_clinic_policy.sql` | `20260426011757` | 062_conversations_clinic_policy |
| `063_messages_clinic_policy.sql` | `20260426012617` | 063_messages_clinic_policy |
| `064_payments_clinic_policy.sql` | `20260426013225` | 064_payments_clinic_policy |
| `065_appointments_clinic_policy.sql` | `20260426013630` | 065_appointments_clinic_policy |
| `066_clinical_notes_clinic_policy.sql` | `20260426014010` | 066_clinical_notes_clinic_policy |
| `067_patients_clinic_policy.sql` | `20260426014336` | 067_patients_clinic_policy |
| `069_add_idempotency_keys.sql` | `20260426051529` | 069_add_idempotency_keys |
| `070_users_phone_verified_and_phone_change_for_staff.sql` | `20260426062710` | 070_users_phone_verified_and_phone_change_for_staff |
| `071_normalize_patient_phone.sql` | `20260429031435` | 071_normalize_patient_phone |
| `072_dedup_detection.sql` | `20260429031911` | 072_dedup_detection |
| `072_dedup_detection.sql` | `20260429150906` | 078_user_dedup_detection |
| `073_create_global_patients.sql` | `20260429032416` | 073_create_global_patients |
| `074_relax_audit_actor_user_id.sql` | `20260429150427` | 074_relax_audit_actor_user_id |
| `075_create_patient_clinic_records.sql` | `20260429150529` | 075_create_patient_clinic_records |
| `076_quarantine_resolution.sql` | `20260429150809` | 076_quarantine_resolution_v3 (fuzzy) |
| `077_patients_global_patient_id_not_null.sql` | `20260429150835` | 077_patients_global_patient_id_not_null |
| `078_user_dedup_detection.sql` | `20260429150906` | 078_user_dedup_detection |
| `079_user_dedup_consumption.sql` | `20260429150944` | 079_user_dedup_consumption |
| `080_add_global_refs_to_clinical_tables.sql` | `20260429151245` | 080_add_global_refs_to_clinical_tables_v2 (fuzzy) |
| `081_compatibility_triggers.sql` | `20260429151341` | 081_compatibility_triggers |
| `082_recover_leading_zero_phones.sql` | `20260430003910` | 082_recover_leading_zero_phones |
| `083_effective_messaging_consent_view.sql` | `20260430003949` | 083_effective_messaging_consent_view |
| `084_create_privacy_code_attempts.sql` | `20260430004114` | 084_create_privacy_code_attempts |
| `085_create_patient_privacy_codes.sql` | `20260430004127` | 085_create_patient_privacy_codes |
| `086_create_privacy_code_sms_tokens.sql` | `20260430004139` | 086_create_privacy_code_sms_tokens |
| `087_privacy_code_functions.sql` | `20260430004306` | 087_privacy_code_functions |
| `088_pcr_insert_audit_trigger.sql` | `20260430053209` | 088_pcr_insert_audit_trigger |
| `089_normalize_auth_phone.sql` | `20260430060016` | 089_normalize_auth_phone |
| `090_patient_data_shares.sql` | `20260430063050` | 090_patient_data_shares |
| `091_atomic_share_creation.sql` | `20260501022233` | 091_atomic_share_creation |
| `092_rls_helper_functions.sql` | `20260501055037` | 092_rls_helper_functions |
| `093_rls_patient_identity.sql` | `20260501061001` | 093_rls_patient_identity |
| `094_rls_clinical_data.sql` | `20260501132504` | 094_rls_clinical_data |
| `094a_rls_helper_fixes.sql` | `20260501151201` | 094a_rls_helper_fixes |
| `095_rls_operations.sql` | `20260502031410` | 095_rls_operations |
| `096_rls_communication.sql` | `20260502032425` | 096_rls_communication |
| `097_rls_non_patient.sql` | `20260502053114` | 097_rls_non_patient |
| `098_patient_code_schema.sql` | `20260503022806` | 098_patient_code_schema |

## Tracking rows with NO matching file (5)

These rows confirm SQL was applied to staging that does not exist as a file in the repo. The actual SQL was recorded in `schema_migrations.statements` but is not extracted into the audit (large blob; out of scope for Session A).

| version | name | likely meaning |
|---|---|---|
| `20260408145102` | enable_rls_on_unprotected_tables | Out-of-band fix applied 2026-04-08 14:51 UTC. Enabled RLS on tables that hadn't had it. **No file.** |
| `20260408145129` | fix_otp_codes_rls_phone_based_records | Out-of-band fix applied 2026-04-08 14:51 UTC (27 sec after the previous). Fixed an OTP-codes RLS policy. **No file.** |
| `20260430004044` | 083_effective_messaging_consent_view_v2 | Re-application of file `083_effective_messaging_consent_view.sql` after edits. The file in repo may not match this final state. |
| `20260430004355` | 087_privacy_code_functions_search_path_fix | Hot-patch to file `087_privacy_code_functions.sql` adding `SET search_path` hardening. **Patch SQL is not in any file.** |
| `20260430010517` | 087_privacy_code_function_grants_hardening | Hot-patch to file `087_privacy_code_functions.sql` adjusting GRANTs. **Patch SQL is not in any file.** |

---

## Sequencing observations

- The tracking table starts with two short numeric versions (`013` and `014`), then jumps directly to timestamp-based versions starting `20260408145102`. Files `001`-`012` are not in tracking, even though their schema is on staging.
- The first three timestamp-based rows (Apr 8) are NOT for files 015-040 — they're for the two out-of-band RLS fixes mentioned above. Files 015-040 were already applied (via SQL editor) before the migrations CLI was adopted.
- Tracking rows for files 045-051 use timestamps 20260425031343 - 20260425045507 (Apr 25, all within ~1.5 hours). This is consistent with the TD-005 'clinic_id rollout' apply mentioned in project memory.
- Files 015-044 have no tracking rows at all. Their schema effects ARE on staging (verified by the claims-vs-reality audit), so they were applied via SQL editor.
- File `068_cleanup_legacy_policies.sql` has no tracking row. Project memory marks mig 068 'apply ABORTED' — its claims should be MISSING, but they may have been superseded by 092-097.
- File `099_patient_code_rpcs.sql` has no tracking row. Memory says 'mig 098 is the new cleanup, not yet written' — 099 may be a follow-up that hasn't been applied yet.