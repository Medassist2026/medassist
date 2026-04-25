-- ============================================================================
-- Migration 051: Enforce clinic_id NOT NULL on 19 tables
-- ============================================================================
--
-- Background
-- ----------
-- This is the final step of the multi-tenant clinic_id rollout. Sequence:
--   - mig 045: backfill clinical_notes
--   - mig 046: clinical_notes NOT NULL (delete 23 unresolvable test rows)
--   - mig 047: payments NOT NULL (delete 9 unresolvable test rows)
--   - mig 048: add clinic_id + index + backfill across 19 tables
--   - mig 049: backfill 6 self-registered patients via DPR/appointment
--   - mig 050: delete 73 orphan patients + class-B test-doctor data + 2
--              real-doctor orphan availability slots
--   - mig 051: this — enforce NOT NULL on the 19 tables
--
-- Pre-flight (run 2026-04-24 after mig 050): 0 NULL clinic_id rows across
-- all 19 target tables. NOT NULL is safe to apply.
--
-- Tables NOT in scope (still have nulls — separate cleanup needed):
--   - appointments: 3 nulls of 17 (pre-existing data, not from mig 048)
--   - patient_consent_grants: 2 nulls of 2 (pre-existing)
-- These should be addressed in their own migration after triage.
-- ============================================================================

ALTER TABLE public.patients                     ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.vital_signs                  ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.lab_orders                   ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.lab_results                  ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.imaging_orders               ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.check_in_queue               ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.conversations                ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.messages                     ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.doctor_patient_relationships ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.medication_reminders         ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.doctor_availability          ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.patient_medical_records      ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.patient_medications          ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.patient_allergies            ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.chronic_conditions           ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.immunizations                ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.patient_diary                ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.patient_health_metrics       ALTER COLUMN clinic_id SET NOT NULL;
ALTER TABLE public.record_sharing_preferences   ALTER COLUMN clinic_id SET NOT NULL;

-- Update column comments to declare the architectural invariant
COMMENT ON COLUMN public.patients.clinic_id IS
  'Owning clinic. NOT NULL since mig 051. Resolved at registration time via '
  'created_by_doctor_id''s clinic_membership; self-registered patients must '
  'be associated with a clinic via DPR or appointment before they appear here.';

COMMENT ON COLUMN public.doctor_patient_relationships.clinic_id IS
  'Owning clinic. NOT NULL since mig 051. Set at relationship-creation time '
  'from the doctor''s active clinic_membership.';

COMMENT ON COLUMN public.doctor_availability.clinic_id IS
  'Owning clinic. NOT NULL since mig 051. A doctor without a clinic membership '
  'cannot publish availability — use the join-clinic flow first.';
