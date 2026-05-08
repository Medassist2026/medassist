-- ============================================================================
-- Rollback for migration 108 — restore rls_test_teardown() to its pre-mig-108
-- audit_events DELETE clause (entity_type IN ('global_patients',
-- 'patient_data_share') + metadata->>'rls_test_v1'='true' only).
--
-- USE CASE
-- --------
-- Only if mig 108's audit_events extension surfaces an unintended
-- consequence (e.g. accidentally cleans non-test audit rows because a
-- production gp uuid collides with a test uuid — extremely unlikely
-- given the 00000099-... namespace, but documented for completeness).
-- Rollback re-introduces the audit_events.S6 row-count drift surfaced
-- by D-074; the matrix's audit_events.S6 expected_rows would need to
-- be returned to dynamic-baseline mode.
--
-- WARNING
-- -------
-- Rollback does NOT re-create previously-cleaned PCR audit rows. The
-- accumulated rows that mig 108 cleaned are gone permanently — they
-- were forensically uninteresting test scaffolding artifacts, not
-- production audit history. Rollback only restores the FUNCTION body.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Restore rls_test_teardown() to its pre-mig-108 body (live staging body
--    captured 2026-05-07 via pg_get_functiondef before mig 108 apply).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_test_teardown()
RETURNS TABLE(entity TEXT, removed INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  k_clinic_uuids UUID[] := ARRAY[
    '00000099-0000-0000-0000-000000000001'::UUID,
    '00000099-0000-0000-0000-000000000002'::UUID
  ];
  k_user_uuids UUID[] := ARRAY[
    '00000099-0000-0000-0000-000000000010'::UUID,
    '00000099-0000-0000-0000-000000000011'::UUID,
    '00000099-0000-0000-0000-000000000012'::UUID,
    '00000099-0000-0000-0000-000000000013'::UUID,
    '00000099-0000-0000-0000-000000000020'::UUID,
    '00000099-0000-0000-0000-000000000021'::UUID,
    '00000099-0000-0000-0000-000000000022'::UUID
  ];
  k_gp_uuids UUID[] := ARRAY[
    '00000099-0000-0000-0000-000000000031'::UUID,
    '00000099-0000-0000-0000-000000000032'::UUID,
    '00000099-0000-0000-0000-000000000033'::UUID
  ];
  k_share_uuids UUID[] := ARRAY[
    '00000099-0000-0000-0000-000000000050'::UUID,
    '00000099-0000-0000-0000-000000000051'::UUID,
    '00000099-0000-0000-0000-000000000052'::UUID
  ];
  v_n INT;
BEGIN
  -- New ops/comm rows first (children of clinic_id / conversation)
  DELETE FROM public.notifications WHERE id::text LIKE '00000099%';
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'notifications'; removed := v_n; RETURN NEXT;
  DELETE FROM public.messages WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'messages'; removed := v_n; RETURN NEXT;
  DELETE FROM public.conversations WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'conversations'; removed := v_n; RETURN NEXT;
  DELETE FROM public.payments WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'payments'; removed := v_n; RETURN NEXT;
  DELETE FROM public.check_in_queue WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'check_in_queue'; removed := v_n; RETURN NEXT;
  DELETE FROM public.appointments WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'appointments'; removed := v_n; RETURN NEXT;
  DELETE FROM public.doctor_availability WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'doctor_availability'; removed := v_n; RETURN NEXT;

  -- Clinical-data
  DELETE FROM public.lab_results WHERE id::text LIKE '00000099%';
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'lab_results'; removed := v_n; RETURN NEXT;
  DELETE FROM public.prescription_items WHERE id::text LIKE '00000099%';
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'prescription_items'; removed := v_n; RETURN NEXT;
  DELETE FROM public.lab_orders WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'lab_orders'; removed := v_n; RETURN NEXT;
  DELETE FROM public.imaging_orders WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'imaging_orders'; removed := v_n; RETURN NEXT;
  DELETE FROM public.vital_signs WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'vital_signs'; removed := v_n; RETURN NEXT;
  DELETE FROM public.clinical_notes WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'clinical_notes'; removed := v_n; RETURN NEXT;

  -- Privacy + audit (PRE-MIG-108 audit_events DELETE: only catches
  -- entity_type IN ('global_patients','patient_data_share') + the
  -- metadata sentinel; PCR audit rows accumulate +4/cycle. This is the
  -- pre-fix state we are intentionally restoring on rollback.)
  DELETE FROM public.privacy_code_attempts WHERE id::text LIKE '00000099%' OR global_patient_id = ANY(k_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'privacy_code_attempts'; removed := v_n; RETURN NEXT;
  DELETE FROM public.privacy_code_sms_tokens WHERE id::text LIKE '00000099%' OR global_patient_id = ANY(k_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'privacy_code_sms_tokens'; removed := v_n; RETURN NEXT;
  DELETE FROM public.patient_privacy_codes WHERE id::text LIKE '00000099%' OR global_patient_id = ANY(k_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'patient_privacy_codes'; removed := v_n; RETURN NEXT;
  DELETE FROM public.audit_events
    WHERE (entity_type='global_patients'    AND entity_id = ANY(k_gp_uuids))
       OR (entity_type='patient_data_share' AND entity_id = ANY(k_share_uuids))
       OR metadata->>'rls_test_v1'='true';
  -- (No RETURN NEXT for audit_events on pre-mig-108 path — restoring
  -- the live body verbatim; mig 108 added the RETURN NEXT for the
  -- audit_events row.)

  DELETE FROM public.patient_data_shares WHERE id = ANY(k_share_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'patient_data_shares'; removed := v_n; RETURN NEXT;
  DELETE FROM public.patient_clinic_records WHERE global_patient_id = ANY(k_gp_uuids) OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'patient_clinic_records'; removed := v_n; RETURN NEXT;
  DELETE FROM public.patients WHERE id = ANY(k_user_uuids) OR clinic_id = ANY(k_clinic_uuids) OR global_patient_id = ANY(k_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'patients'; removed := v_n; RETURN NEXT;
  DELETE FROM public.global_patients WHERE id = ANY(k_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'global_patients'; removed := v_n; RETURN NEXT;
  DELETE FROM public.clinic_memberships WHERE clinic_id = ANY(k_clinic_uuids) OR user_id = ANY(k_user_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'clinic_memberships'; removed := v_n; RETURN NEXT;
  DELETE FROM public.doctors WHERE id = ANY(k_user_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'doctors'; removed := v_n; RETURN NEXT;
  DELETE FROM public.users WHERE id = ANY(k_user_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'users'; removed := v_n; RETURN NEXT;
  DELETE FROM auth.users WHERE id = ANY(k_user_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'auth.users'; removed := v_n; RETURN NEXT;
  DELETE FROM public.clinics WHERE id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'clinics'; removed := v_n; RETURN NEXT;
  RETURN;
END $$;

COMMENT ON FUNCTION public.rls_test_teardown() IS
  'Phase D RLS test matrix: removes all seed data installed by rls_test_seed(). '
  'ROLLED BACK to pre-mig-108 state — audit_events DELETE only catches '
  'entity_type IN (''global_patients'', ''patient_data_share'') + '
  'metadata->>''rls_test_v1''=''true''. PCR audit rows will accumulate +4 per '
  'seed cycle (D-074 drift restored).';

COMMIT;
