# Privacy Schema Canonical Chain

This document defines the canonical migration order for production environments.

## Canonical Order
1. `001_initial_schema.sql`
2. `002_fix_rls_insert_policies.sql`
3. `003_fix_existing_auth_emails.sql`
4. `004_add_patient_demographics.sql`
5. `005_fix_doctor_patient_rls.sql`
6. `006_front_desk_module.sql`
7. `007_prescriptions_vitals_labs.sql`
8. `008_fix_frontdesk_and_patient_features.sql`
9. `009_add_messaging.sql`
10. `010_phase8_FIXED.sql`
11. `011_phase11_messaging_sharing.sql`
12. `012_phase10_imaging_and_record_domains.sql`
13. `013_privacy_reconciliation.sql`
14. `014_shared_rate_limits.sql`

## Deprecated / Non-Canonical Files
- `010_phase8_patient_empowerment.sql`
- `010_phase8_patient_empowerment_STEP_BY_STEP.sql`

Do not apply deprecated files in new environments. Existing environments that previously applied them must still apply `013_privacy_reconciliation.sql` to normalize schema and privacy controls.

## Required Post-Migration Check
Run startup with schema health check enabled (default). The app now fails fast if required privacy tables/columns are missing.
