-- ============================================================
-- mig 094 rollback — drop the 18 clinical-data v2 policies
-- Date: 2026-04-30
--
-- Pure additive rollback: mig 094 added 18 policies and did NOT
-- drop any existing legacy policies.  Rollback drops only the 18.
-- Pre-mig-094 state is fully restored.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS clinical_notes_select_v2 ON public.clinical_notes;
DROP POLICY IF EXISTS clinical_notes_write_clinic_member_only ON public.clinical_notes;
DROP POLICY IF EXISTS clinical_notes_update_clinic_member_only ON public.clinical_notes;

DROP POLICY IF EXISTS prescription_items_select_v2 ON public.prescription_items;
DROP POLICY IF EXISTS prescription_items_write_clinic_member_only ON public.prescription_items;
DROP POLICY IF EXISTS prescription_items_update_clinic_member_only ON public.prescription_items;

DROP POLICY IF EXISTS lab_results_select_v2 ON public.lab_results;
DROP POLICY IF EXISTS lab_results_write_clinic_member_only ON public.lab_results;
DROP POLICY IF EXISTS lab_results_update_clinic_member_only ON public.lab_results;

DROP POLICY IF EXISTS lab_orders_select_v2 ON public.lab_orders;
DROP POLICY IF EXISTS lab_orders_write_clinic_member_only ON public.lab_orders;
DROP POLICY IF EXISTS lab_orders_update_clinic_member_only ON public.lab_orders;

DROP POLICY IF EXISTS imaging_orders_select_v2 ON public.imaging_orders;
DROP POLICY IF EXISTS imaging_orders_write_clinic_member_only ON public.imaging_orders;
DROP POLICY IF EXISTS imaging_orders_update_clinic_member_only ON public.imaging_orders;

DROP POLICY IF EXISTS vital_signs_select_v2 ON public.vital_signs;
DROP POLICY IF EXISTS vital_signs_write_clinic_member_only ON public.vital_signs;
DROP POLICY IF EXISTS vital_signs_update_clinic_member_only ON public.vital_signs;

COMMIT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND (policyname LIKE '%_select_v2'
        OR policyname LIKE '%_write_clinic_member_only'
        OR policyname LIKE '%_update_clinic_member_only')
      AND tablename IN ('clinical_notes','prescription_items','lab_results','lab_orders','imaging_orders','vital_signs')
  ) THEN
    RAISE EXCEPTION 'mig 094 rollback failed: at least one v2/restrictive policy still present';
  END IF;
  RAISE NOTICE 'mig 094 rollback: 18 policies dropped';
END $$;
