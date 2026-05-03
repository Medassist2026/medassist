-- ============================================================
-- Phase D — RLS test matrix seed + teardown
-- Date: 2026-04-30 (cowork sessions 5 + 7 + 10)
--
-- Two SECURITY DEFINER functions that idempotently install (or
-- remove) the seed data the Phase D test matrix needs:
--
--   public.rls_test_seed()      → install / refresh seed
--   public.rls_test_teardown()  → remove all seed data
--
-- Stable UUIDs (00000099-…) so the script is fully deterministic
-- and re-runs are no-ops.
--
-- USAGE
-- -----
--   SELECT public.rls_test_seed();      -- install
--   ... run scenarios ...
--   SELECT public.rls_test_teardown();  -- cleanup
--
-- The seed function calls teardown internally first.
--
-- SEED CONTENTS (sessions 5 + 7 + 10 combined)
-- --------------------------------------------
-- Identity / membership:
--   * 2 clinics: clinic_a, clinic_b
--   * 4 staff users: doctor_a (DOCTOR clinic_a), doctor_b (DOCTOR
--     clinic_b), frontdesk_a (FRONT_DESK clinic_a), owner_a (OWNER
--     clinic_a — added session 7 for privacy_code_attempts OWNER scenarios)
--   * 3 patient users: patient_y_user (claimed), patient_x_user,
--     patient_z_user. The latter two are added ONLY to satisfy the
--     `public.patients.id` FK to `public.users.id` for legacy patients
--     rows; they don't have global_patients claims of their own.
--
-- Patient identity:
--   * 3 global_patients: patient_x (unclaimed, PCRs A+B), patient_y
--     (claimed by patient_y_user, PCR A only), patient_z (unclaimed, PCR A only)
--   * 4 patient_clinic_records as listed above
--
-- Sharing primitives:
--   * 3 patient_data_shares (all clinic_a→clinic_b):
--       active   — patient_x, no expiry
--       revoked  — patient_z, revoked yesterday
--       expired  — patient_y, expired yesterday
--
-- Privacy code surface (added session 7):
--   * 1 patient_privacy_codes row (active code for patient_x)
--   * 1 privacy_code_attempts row (success result by doctor_a at
--     clinic_a for patient_y)
--   * 1 privacy_code_sms_tokens row (by doctor_b at clinic_b for patient_z)
--
-- Legacy patients + clinical-data rows (added session 10 for
-- Path-2 trigger-bypass scenarios per Empirical Lesson #5):
--   * 3 legacy patients rows (one per global_patient, all at clinic_a):
--       legacy_patient_y (id = patient_y_user)
--       legacy_patient_x (id = patient_x_user)
--       legacy_patient_z (id = patient_z_user)
--   * 3 clinical_notes (one per patient at clinic_a, all created by
--     doctor_a). These enable the cross-clinic READ scenarios (S3/S4/S5)
--     and the trigger-bypass S9 INSERT-blocked scenario.
--
-- AUTH.USERS
-- ----------
-- All 7 seed users get an auth.users row so RLS predicates that
-- resolve auth.uid() against real auth identities still see them
-- as valid. Inserts go via service_role (this MCP context) which has
-- INSERT privilege on auth.users.
-- ============================================================


-- ────────────────────────────────────────────────────────────────────
-- 1. Teardown
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rls_test_teardown()
RETURNS TABLE(entity TEXT, removed INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  k_clinic_a UUID := '00000099-0000-0000-0000-000000000001';
  k_clinic_b UUID := '00000099-0000-0000-0000-000000000002';
  k_doctor_a UUID := '00000099-0000-0000-0000-000000000010';
  k_doctor_b UUID := '00000099-0000-0000-0000-000000000011';
  k_frontdesk_a UUID := '00000099-0000-0000-0000-000000000012';
  k_owner_a UUID := '00000099-0000-0000-0000-000000000013';
  k_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  k_patient_x_user UUID := '00000099-0000-0000-0000-000000000021';  -- session 10
  k_patient_z_user UUID := '00000099-0000-0000-0000-000000000022';  -- session 10
  k_patient_x_gp UUID := '00000099-0000-0000-0000-000000000031';
  k_patient_y_gp UUID := '00000099-0000-0000-0000-000000000032';
  k_patient_z_gp UUID := '00000099-0000-0000-0000-000000000033';
  k_share_active UUID := '00000099-0000-0000-0000-000000000050';
  k_share_revoked UUID := '00000099-0000-0000-0000-000000000051';
  k_share_expired UUID := '00000099-0000-0000-0000-000000000052';
  k_priv_code UUID := '00000099-0000-0000-0000-000000000070';
  k_attempt UUID := '00000099-0000-0000-0000-000000000071';
  k_sms_token UUID := '00000099-0000-0000-0000-000000000072';
  k_clinical_note_y UUID := '00000099-0000-0000-0000-000000000080';  -- session 10
  k_clinical_note_x UUID := '00000099-0000-0000-0000-000000000081';  -- session 10
  k_clinical_note_z UUID := '00000099-0000-0000-0000-000000000082';  -- session 10

  v_user_uuids UUID[] := ARRAY[
    k_doctor_a, k_doctor_b, k_frontdesk_a, k_owner_a,
    k_patient_y_user, k_patient_x_user, k_patient_z_user
  ];
  v_clinic_uuids UUID[] := ARRAY[k_clinic_a, k_clinic_b];
  v_gp_uuids UUID[] := ARRAY[k_patient_x_gp, k_patient_y_gp, k_patient_z_gp];
  v_share_uuids UUID[] := ARRAY[k_share_active, k_share_revoked, k_share_expired];
  v_clinical_note_uuids UUID[] := ARRAY[k_clinical_note_y, k_clinical_note_x, k_clinical_note_z];
  v_n INT;
BEGIN
  -- Clinical-data rows must drop before legacy patients (FK)
  DELETE FROM public.clinical_notes WHERE id = ANY(v_clinical_note_uuids) OR clinic_id = ANY(v_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'clinical_notes'; removed := v_n; RETURN NEXT;

  -- Privacy-code surface
  DELETE FROM public.privacy_code_attempts WHERE id = k_attempt OR global_patient_id = ANY(v_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'privacy_code_attempts'; removed := v_n; RETURN NEXT;

  DELETE FROM public.privacy_code_sms_tokens WHERE id = k_sms_token OR global_patient_id = ANY(v_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'privacy_code_sms_tokens'; removed := v_n; RETURN NEXT;

  DELETE FROM public.patient_privacy_codes WHERE id = k_priv_code OR global_patient_id = ANY(v_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'patient_privacy_codes'; removed := v_n; RETURN NEXT;

  DELETE FROM public.audit_events
    WHERE (entity_type = 'global_patients' AND entity_id = ANY(v_gp_uuids))
       OR (entity_type = 'patient_data_share' AND entity_id = ANY(v_share_uuids))
       OR metadata->>'rls_test_v1' = 'true';

  DELETE FROM public.patient_data_shares WHERE id = ANY(v_share_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'patient_data_shares'; removed := v_n; RETURN NEXT;

  DELETE FROM public.patient_clinic_records WHERE global_patient_id = ANY(v_gp_uuids) OR clinic_id = ANY(v_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'patient_clinic_records'; removed := v_n; RETURN NEXT;

  -- Legacy patients (must be after clinical_notes, before users)
  DELETE FROM public.patients WHERE id = ANY(v_user_uuids) OR clinic_id = ANY(v_clinic_uuids) OR global_patient_id = ANY(v_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'patients'; removed := v_n; RETURN NEXT;

  DELETE FROM public.global_patients WHERE id = ANY(v_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'global_patients'; removed := v_n; RETURN NEXT;

  DELETE FROM public.clinic_memberships WHERE clinic_id = ANY(v_clinic_uuids) OR user_id = ANY(v_user_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'clinic_memberships'; removed := v_n; RETURN NEXT;

  DELETE FROM public.doctors WHERE id = ANY(v_user_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'doctors'; removed := v_n; RETURN NEXT;

  DELETE FROM public.users WHERE id = ANY(v_user_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'users'; removed := v_n; RETURN NEXT;

  DELETE FROM auth.users WHERE id = ANY(v_user_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'auth.users'; removed := v_n; RETURN NEXT;

  DELETE FROM public.clinics WHERE id = ANY(v_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'clinics'; removed := v_n; RETURN NEXT;

  RETURN;
END $$;

COMMENT ON FUNCTION public.rls_test_teardown() IS
  'Phase D RLS test matrix: removes all seed data installed by rls_test_seed(). Updated session 10 to include clinical_notes + 2 additional legacy users for trigger-bypass scenarios.';


-- ────────────────────────────────────────────────────────────────────
-- 2. Seed
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rls_test_seed()
RETURNS TABLE(entity TEXT, id UUID, note TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  k_clinic_a UUID := '00000099-0000-0000-0000-000000000001';
  k_clinic_b UUID := '00000099-0000-0000-0000-000000000002';
  k_doctor_a UUID := '00000099-0000-0000-0000-000000000010';
  k_doctor_b UUID := '00000099-0000-0000-0000-000000000011';
  k_frontdesk_a UUID := '00000099-0000-0000-0000-000000000012';
  k_owner_a UUID := '00000099-0000-0000-0000-000000000013';
  k_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  k_patient_x_user UUID := '00000099-0000-0000-0000-000000000021';
  k_patient_z_user UUID := '00000099-0000-0000-0000-000000000022';
  k_patient_x_gp UUID := '00000099-0000-0000-0000-000000000031';
  k_patient_y_gp UUID := '00000099-0000-0000-0000-000000000032';
  k_patient_z_gp UUID := '00000099-0000-0000-0000-000000000033';
  k_share_active UUID := '00000099-0000-0000-0000-000000000050';
  k_share_revoked UUID := '00000099-0000-0000-0000-000000000051';
  k_share_expired UUID := '00000099-0000-0000-0000-000000000052';
  k_priv_code UUID := '00000099-0000-0000-0000-000000000070';
  k_attempt UUID := '00000099-0000-0000-0000-000000000071';
  k_sms_token UUID := '00000099-0000-0000-0000-000000000072';
  k_clinical_note_y UUID := '00000099-0000-0000-0000-000000000080';
  k_clinical_note_x UUID := '00000099-0000-0000-0000-000000000081';
  k_clinical_note_z UUID := '00000099-0000-0000-0000-000000000082';
  k_lab_order_x       UUID := '00000099-0000-0000-0000-000000000090';  -- session 11
  k_lab_result_x      UUID := '00000099-0000-0000-0000-000000000091';  -- session 11
  k_imaging_order_x   UUID := '00000099-0000-0000-0000-000000000092';  -- session 11
  k_vital_signs_x     UUID := '00000099-0000-0000-0000-000000000093';  -- session 11
  k_prescription_item_x UUID := '00000099-0000-0000-0000-000000000094';-- session 11
  k_appointment_x     UUID := '00000099-0000-0000-0000-0000000000a0';  -- session 14a
  k_checkin_x         UUID := '00000099-0000-0000-0000-0000000000a1';  -- session 14a
  k_payment_x         UUID := '00000099-0000-0000-0000-0000000000a2';  -- session 14a
  k_doctor_avail_a    UUID := '00000099-0000-0000-0000-0000000000a3';  -- session 14a
  k_conversation_yx   UUID := '00000099-0000-0000-0000-0000000000a4';  -- session 14a
  k_message_yx        UUID := '00000099-0000-0000-0000-0000000000a5';  -- session 14a
  k_notification_y    UUID := '00000099-0000-0000-0000-0000000000a6';  -- session 14a

  v_pcr_y_at_a UUID;
  v_pcr_x_at_a UUID;
  v_pcr_z_at_a UUID;
  v_lab_test_id UUID;
BEGIN
  PERFORM public.rls_test_teardown();

  INSERT INTO public.clinics (id, unique_id, name) VALUES
    (k_clinic_a, 'rls-test-clinic-a', 'RLS Test Clinic A'),
    (k_clinic_b, 'rls-test-clinic-b', 'RLS Test Clinic B');

  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous, email_confirmed_at) VALUES
    (k_doctor_a,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-doctor-a@test.invalid',    '{"provider":"email"}', '{}', NOW(), NOW(), false, NOW()),
    (k_doctor_b,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-doctor-b@test.invalid',    '{"provider":"email"}', '{}', NOW(), NOW(), false, NOW()),
    (k_frontdesk_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-frontdesk-a@test.invalid', '{"provider":"email"}', '{}', NOW(), NOW(), false, NOW()),
    (k_owner_a,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-owner-a@test.invalid',     '{"provider":"email"}', '{}', NOW(), NOW(), false, NOW()),
    (k_patient_y_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-patient-y@test.invalid', '{"provider":"email"}', '{}', NOW(), NOW(), false, NOW()),
    (k_patient_x_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-patient-x@test.invalid', '{"provider":"email"}', '{}', NOW(), NOW(), false, NOW()),
    (k_patient_z_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-patient-z@test.invalid', '{"provider":"email"}', '{}', NOW(), NOW(), false, NOW());

  INSERT INTO public.users (id, phone, role, is_canonical, normalized_phone) VALUES
    (k_doctor_a,       '+10000000010', 'doctor',    TRUE, '+10000000010'),
    (k_doctor_b,       '+10000000011', 'doctor',    TRUE, '+10000000011'),
    (k_frontdesk_a,    '+10000000012', 'frontdesk', TRUE, '+10000000012'),
    (k_owner_a,        '+10000000013', 'doctor',    TRUE, '+10000000013'),
    (k_patient_y_user, '+10000000020', 'patient',   TRUE, '+10000000020'),
    (k_patient_x_user, '+10000000021', 'patient',   TRUE, '+10000000021'),
    (k_patient_z_user, '+10000000022', 'patient',   TRUE, '+10000000022');

  INSERT INTO public.doctors (id, unique_id, specialty) VALUES
    (k_doctor_a, 'rls-doctor-a', 'general-practitioner'),
    (k_doctor_b, 'rls-doctor-b', 'general-practitioner'),
    (k_owner_a,  'rls-owner-a',  'general-practitioner');

  INSERT INTO public.clinic_memberships (clinic_id, user_id, role, status) VALUES
    (k_clinic_a, k_doctor_a,    'DOCTOR',     'ACTIVE'),
    (k_clinic_b, k_doctor_b,    'DOCTOR',     'ACTIVE'),
    (k_clinic_a, k_frontdesk_a, 'FRONT_DESK', 'ACTIVE'),
    (k_clinic_a, k_owner_a,     'OWNER',      'ACTIVE');

  INSERT INTO public.global_patients (id, normalized_phone, claimed, claimed_user_id, claimed_at) VALUES
    (k_patient_x_gp, '+10000000031', FALSE, NULL, NULL),
    (k_patient_y_gp, '+10000000032', TRUE,  k_patient_y_user, NOW()),
    (k_patient_z_gp, '+10000000033', FALSE, NULL, NULL);

  INSERT INTO public.patient_clinic_records (global_patient_id, clinic_id) VALUES
    (k_patient_x_gp, k_clinic_a),
    (k_patient_x_gp, k_clinic_b),
    (k_patient_y_gp, k_clinic_a),
    (k_patient_z_gp, k_clinic_a);

  INSERT INTO public.patient_data_shares (id, global_patient_id, grantor_clinic_id, grantee_clinic_id, granted_via, granted_at, expires_at, revoked_at) VALUES
    (k_share_active,  k_patient_x_gp, k_clinic_a, k_clinic_b, 'PRIVACY_CODE', NOW() - INTERVAL '7 days',  NULL, NULL),
    (k_share_revoked, k_patient_z_gp, k_clinic_a, k_clinic_b, 'PRIVACY_CODE', NOW() - INTERVAL '14 days', NULL, NOW() - INTERVAL '1 day'),
    (k_share_expired, k_patient_y_gp, k_clinic_a, k_clinic_b, 'PRIVACY_CODE', NOW() - INTERVAL '30 days', NOW() - INTERVAL '1 day', NULL);

  INSERT INTO public.patient_privacy_codes (id, global_patient_id, code_hash) VALUES
    (k_priv_code, k_patient_x_gp, 'bcrypt$placeholder$rls_test');

  INSERT INTO public.privacy_code_attempts (id, global_patient_id, attempted_by_user_id, attempted_by_clinic_id, result) VALUES
    (k_attempt, k_patient_y_gp, k_doctor_a, k_clinic_a, 'success');

  INSERT INTO public.privacy_code_sms_tokens (id, global_patient_id, requesting_clinic_id, requesting_doctor_id, sms_code_hash, expires_at) VALUES
    (k_sms_token, k_patient_z_gp, k_clinic_b, k_doctor_b, 'bcrypt$placeholder$sms_rls_test', NOW() + INTERVAL '5 minutes');

  -- ── Session 10: legacy patients + clinical_notes for trigger-bypass tests ──
  -- patients.id = the corresponding user_id (FK chain: clinical_notes → patients → users)
  INSERT INTO public.patients (id, unique_id, phone, clinic_id, normalized_phone, global_patient_id) VALUES
    (k_patient_y_user, 'rls-legacy-py', '+10000000020', k_clinic_a, '+10000000020', k_patient_y_gp),
    (k_patient_x_user, 'rls-legacy-px', '+10000000021', k_clinic_a, '+10000000021', k_patient_x_gp),
    (k_patient_z_user, 'rls-legacy-pz', '+10000000022', k_clinic_a, '+10000000022', k_patient_z_gp);

  -- Look up PCR ids at clinic_a (auto-generated UUIDs from above PCR insert).
  -- Note: column alias required because the RETURNS TABLE OUT param `id`
  -- shadows the patient_clinic_records.id column otherwise.
  SELECT pcr.id INTO v_pcr_y_at_a FROM public.patient_clinic_records pcr WHERE pcr.global_patient_id = k_patient_y_gp AND pcr.clinic_id = k_clinic_a;
  SELECT pcr.id INTO v_pcr_x_at_a FROM public.patient_clinic_records pcr WHERE pcr.global_patient_id = k_patient_x_gp AND pcr.clinic_id = k_clinic_a;
  SELECT pcr.id INTO v_pcr_z_at_a FROM public.patient_clinic_records pcr WHERE pcr.global_patient_id = k_patient_z_gp AND pcr.clinic_id = k_clinic_a;

  -- 3 clinical_notes (1 per global_patient at clinic_a, all created by doctor_a)
  INSERT INTO public.clinical_notes (id, doctor_id, patient_id, clinic_id, global_patient_id, patient_clinic_record_id) VALUES
    (k_clinical_note_y, k_doctor_a, k_patient_y_user, k_clinic_a, k_patient_y_gp, v_pcr_y_at_a),
    (k_clinical_note_x, k_doctor_a, k_patient_x_user, k_clinic_a, k_patient_x_gp, v_pcr_x_at_a),
    (k_clinical_note_z, k_doctor_a, k_patient_z_user, k_clinic_a, k_patient_z_gp, v_pcr_z_at_a);

  -- ── Session 11: 1 row per remaining clinical-data table for patient_x at clinic_a ──
  -- Enables 7-scenario coverage on lab_orders/vital_signs/imaging_orders/prescription_items/lab_results.
  -- patient_x is the canonical Path 2 candidate (visible to doctor_b under v2 RLS via PCR at clinic_b).
  INSERT INTO public.lab_orders (id, doctor_id, patient_id, clinic_id, global_patient_id, patient_clinic_record_id) VALUES
    (k_lab_order_x, k_doctor_a, k_patient_x_user, k_clinic_a, k_patient_x_gp, v_pcr_x_at_a);

  INSERT INTO public.imaging_orders (id, doctor_id, patient_id, modality, study_name, clinic_id, global_patient_id, patient_clinic_record_id) VALUES
    (k_imaging_order_x, k_doctor_a, k_patient_x_user, 'ct', 'rls-test-study', k_clinic_a, k_patient_x_gp, v_pcr_x_at_a);
  -- Note: imaging_orders.modality CHECK accepts only lowercase: xray, ct, mri, ultrasound, other.

  INSERT INTO public.vital_signs (id, doctor_id, patient_id, clinic_id, global_patient_id, patient_clinic_record_id) VALUES
    (k_vital_signs_x, k_doctor_a, k_patient_x_user, k_clinic_a, k_patient_x_gp, v_pcr_x_at_a);

  INSERT INTO public.prescription_items (id, clinical_note_id, patient_id, doctor_id, drug_name, frequency, duration, clinic_id, global_patient_id, patient_clinic_record_id) VALUES
    (k_prescription_item_x, k_clinical_note_x, k_patient_x_user, k_doctor_a, 'rls-test-drug', 'daily', '7d', k_clinic_a, k_patient_x_gp, v_pcr_x_at_a);

  -- lab_results requires lab_test_id (FK to lab_tests). lab_tests has 22 seeded rows
  -- on staging at session-11 time; pick any existing one.
  SELECT lt.id INTO v_lab_test_id FROM public.lab_tests lt LIMIT 1;
  INSERT INTO public.lab_results (id, lab_order_id, lab_test_id, clinic_id, global_patient_id, patient_clinic_record_id) VALUES
    (k_lab_result_x, k_lab_order_x, v_lab_test_id, k_clinic_a, k_patient_x_gp, v_pcr_x_at_a);

  -- ── Session 14a: 7 ops/comm rows for matrix scenarios ──
  -- All clinic-internal (no cross-clinic semantics). Single row per table at clinic_a.
  -- Footguns to remember (logged session 14a):
  --   * appointments.created_by_role: 'doctor' | 'frontdesk' | 'patient' (try 'doctor')
  --   * payments.payment_method: 'cash' | 'card' | 'insurance' (try 'cash')
  --   * messages.sender_type: 'doctor' | 'patient' (try 'doctor')
  --   * notifications has no clinic_id — user-scoped via recipient_id
  INSERT INTO public.appointments (id, doctor_id, clinic_id, start_time, created_by_role, global_patient_id, patient_clinic_record_id, patient_id) VALUES
    (k_appointment_x, k_doctor_a, k_clinic_a, NOW() + INTERVAL '1 day', 'doctor', k_patient_x_gp, v_pcr_x_at_a, k_patient_x_user);

  INSERT INTO public.check_in_queue (id, patient_id, doctor_id, queue_number, clinic_id) VALUES
    (k_checkin_x, k_patient_x_user, k_doctor_a, 1, k_clinic_a);

  INSERT INTO public.payments (id, patient_id, doctor_id, amount, payment_method, clinic_id) VALUES
    (k_payment_x, k_patient_x_user, k_doctor_a, 100.00, 'cash', k_clinic_a);

  INSERT INTO public.doctor_availability (id, doctor_id, day_of_week, start_time, end_time, clinic_id) VALUES
    (k_doctor_avail_a, k_doctor_a, 1, '09:00', '17:00', k_clinic_a);

  INSERT INTO public.conversations (id, patient_id, doctor_id, clinic_id) VALUES
    (k_conversation_yx, k_patient_y_user, k_doctor_a, k_clinic_a);

  INSERT INTO public.messages (id, conversation_id, sender_id, sender_type, content, clinic_id) VALUES
    (k_message_yx, k_conversation_yx, k_doctor_a, 'doctor', 'rls-test-message', k_clinic_a);

  INSERT INTO public.notifications (id, recipient_id, type, title) VALUES
    (k_notification_y, k_patient_y_user, 'system', 'rls-test-notification');

  RETURN QUERY VALUES
    ('clinic_a',         k_clinic_a,         'Test clinic A'),
    ('clinic_b',         k_clinic_b,         'Test clinic B'),
    ('doctor_a',         k_doctor_a,         'DOCTOR member of clinic A'),
    ('doctor_b',         k_doctor_b,         'DOCTOR member of clinic B'),
    ('frontdesk_a',      k_frontdesk_a,      'FRONT_DESK member of clinic A'),
    ('owner_a',          k_owner_a,          'OWNER of clinic A'),
    ('patient_y_user',   k_patient_y_user,   'auth.users for claimed patient_y'),
    ('patient_x_user',   k_patient_x_user,   'auth.users — backs legacy patient_x'),
    ('patient_z_user',   k_patient_z_user,   'auth.users — backs legacy patient_z'),
    ('patient_x_gp',     k_patient_x_gp,     'Unclaimed; PCRs at A and B; ACTIVE share A->B'),
    ('patient_y_gp',     k_patient_y_gp,     'Claimed by patient_y_user; PCR at A; EXPIRED share A->B'),
    ('patient_z_gp',     k_patient_z_gp,     'Unclaimed; PCR at A; REVOKED share A->B'),
    ('share_active',     k_share_active,     'A->B for patient_x, no expiry'),
    ('share_revoked',    k_share_revoked,    'A->B for patient_z, revoked yesterday'),
    ('share_expired',    k_share_expired,    'A->B for patient_y, expired yesterday'),
    ('priv_code',        k_priv_code,        'Active privacy code for patient_x'),
    ('attempt',          k_attempt,          'Successful privacy-code attempt for patient_y by doctor_a at clinic_a'),
    ('sms_token',        k_sms_token,        'SMS token for patient_z by doctor_b at clinic_b'),
    ('clinical_note_y',  k_clinical_note_y,  'patient_y note at clinic_a, by doctor_a'),
    ('clinical_note_x',  k_clinical_note_x,  'patient_x note at clinic_a, by doctor_a — for cross-clinic READ via active share'),
    ('clinical_note_z',  k_clinical_note_z,  'patient_z note at clinic_a, by doctor_a — for cross-clinic READ via revoked share');
END $$;

COMMENT ON FUNCTION public.rls_test_seed() IS
  'Phase D RLS test matrix: idempotently installs seed data. 21 entities post-session-10. Calls rls_test_teardown() first.';
