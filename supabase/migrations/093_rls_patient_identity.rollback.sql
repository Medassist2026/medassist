-- ============================================================
-- mig 093 rollback — restore Prompt 5 / Build 04 placeholder state
-- Date: 2026-04-30
--
-- Drops all 16 v2 policies introduced by mig 093 and restores the
-- DENY-ALL placeholders that mig 093 dropped (V2-06 / V3-01 /
-- V5-01 / V4-01). After this rollback the policy state matches
-- pre-Prompt-6, except `patients` retains its 8 existing legacy
-- policies (we added v2 alongside, didn't drop legacy).
--
-- Run AFTER rolling back any later migrations (094-101) that
-- reference mig 093's v2 policies. Order: 101 → 100 → 099 → 098 →
-- 097 → ... → 093. (Slot 098 is patient_code_schema in Phase F;
-- legacy-drop is at slot 101 — see session-16 renumbering ruling.)
-- ============================================================

BEGIN;

-- 1. Drop all v2 policies
DROP POLICY IF EXISTS global_patients_select_v2 ON public.global_patients;
DROP POLICY IF EXISTS global_patients_no_direct_insert_v2 ON public.global_patients;
DROP POLICY IF EXISTS global_patients_self_update_v2 ON public.global_patients;
DROP POLICY IF EXISTS global_patients_no_delete_v2 ON public.global_patients;

DROP POLICY IF EXISTS patient_clinic_records_select_v2 ON public.patient_clinic_records;
DROP POLICY IF EXISTS patient_clinic_records_insert_v2 ON public.patient_clinic_records;
DROP POLICY IF EXISTS patient_clinic_records_update_v2 ON public.patient_clinic_records;
DROP POLICY IF EXISTS patient_clinic_records_no_delete_v2 ON public.patient_clinic_records;

DROP POLICY IF EXISTS patient_data_shares_select_v2 ON public.patient_data_shares;
DROP POLICY IF EXISTS patient_data_shares_no_direct_insert_v2 ON public.patient_data_shares;
DROP POLICY IF EXISTS patient_data_shares_revoke_update_v2 ON public.patient_data_shares;
DROP POLICY IF EXISTS patient_data_shares_no_delete_v2 ON public.patient_data_shares;

DROP POLICY IF EXISTS privacy_code_attempts_select_v2 ON public.privacy_code_attempts;

DROP POLICY IF EXISTS patients_select_v2 ON public.patients;
DROP POLICY IF EXISTS patients_insert_v2 ON public.patients;
DROP POLICY IF EXISTS patients_update_v2 ON public.patients;

-- 2. Restore DENY-ALL placeholders
CREATE POLICY global_patients_deny_all ON public.global_patients
  AS PERMISSIVE FOR ALL TO public
  USING (FALSE) WITH CHECK (FALSE);

CREATE POLICY patient_clinic_records_deny_all ON public.patient_clinic_records
  AS PERMISSIVE FOR ALL TO public
  USING (FALSE) WITH CHECK (FALSE);

CREATE POLICY patient_data_shares_no_select ON public.patient_data_shares
  AS PERMISSIVE FOR SELECT TO public USING (FALSE);
CREATE POLICY patient_data_shares_no_insert ON public.patient_data_shares
  AS PERMISSIVE FOR INSERT TO public WITH CHECK (FALSE);
CREATE POLICY patient_data_shares_no_update ON public.patient_data_shares
  AS PERMISSIVE FOR UPDATE TO public USING (FALSE);
CREATE POLICY patient_data_shares_no_delete ON public.patient_data_shares
  AS PERMISSIVE FOR DELETE TO public USING (FALSE);

CREATE POLICY privacy_code_attempts_no_select ON public.privacy_code_attempts
  AS PERMISSIVE FOR SELECT TO public USING (FALSE);

COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname='global_patients_deny_all') THEN
    RAISE EXCEPTION 'mig 093 rollback failed: global_patients_deny_all not restored';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname LIKE '%_v2') THEN
    RAISE EXCEPTION 'mig 093 rollback failed: at least one v2 policy still present';
  END IF;
  RAISE NOTICE 'mig 093 rollback: 16 v2 policies dropped, 6 placeholders restored';
END $$;
