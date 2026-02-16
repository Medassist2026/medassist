-- Test Data Seed Script for MedAssist
-- Purpose: Create test appointments for testing appointment → session workflow
-- Run this in Supabase SQL Editor after creating your doctor account

-- ============================================================================
-- INSTRUCTIONS
-- ============================================================================
-- 1. Register a doctor account first (use the app)
-- 2. Find your doctor ID by running: SELECT id, unique_id FROM doctors;
-- 3. Replace 'YOUR_DOCTOR_ID_HERE' below with your actual doctor UUID
-- 4. Run this script
-- 5. Refresh your dashboard to see today's appointments

-- ============================================================================
-- CONFIGURATION - REPLACE THIS!
-- ============================================================================
DO $$
DECLARE
  v_doctor_id UUID := 'YOUR_DOCTOR_ID_HERE'; -- CHANGE THIS!
  v_patient_1_id UUID;
  v_patient_2_id UUID;
  v_patient_3_id UUID;
  v_patient_4_id UUID;
BEGIN

-- ============================================================================
-- CREATE TEST PATIENTS
-- ============================================================================

-- Patient 1: Ahmed Hassan (30, Male)
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data
) VALUES (
  gen_random_uuid(),
  'test_patient_1_' || floor(random() * 1000000) || '@medassist.test',
  crypt('password123', gen_salt('bf')),
  NOW(),
  jsonb_build_object('role', 'patient', 'is_walkin', true)
) RETURNING id INTO v_patient_1_id;

INSERT INTO public.users (id, phone, role) 
VALUES (v_patient_1_id, '01012345678', 'patient');

INSERT INTO public.patients (id, unique_id, phone, full_name, age, sex, registered)
VALUES (v_patient_1_id, 'PT' || upper(substring(md5(random()::text), 1, 8)), '01012345678', 'Ahmed Hassan', 30, 'Male', false);

-- Patient 2: Fatima Ali (25, Female)
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data
) VALUES (
  gen_random_uuid(),
  'test_patient_2_' || floor(random() * 1000000) || '@medassist.test',
  crypt('password123', gen_salt('bf')),
  NOW(),
  jsonb_build_object('role', 'patient', 'is_walkin', true)
) RETURNING id INTO v_patient_2_id;

INSERT INTO public.users (id, phone, role) 
VALUES (v_patient_2_id, '01098765432', 'patient');

INSERT INTO public.patients (id, unique_id, phone, full_name, age, sex, registered)
VALUES (v_patient_2_id, 'PT' || upper(substring(md5(random()::text), 1, 8)), '01098765432', 'Fatima Ali', 25, 'Female', false);

-- Patient 3: Mohamed Ibrahim (45, Male)
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data
) VALUES (
  gen_random_uuid(),
  'test_patient_3_' || floor(random() * 1000000) || '@medassist.test',
  crypt('password123', gen_salt('bf')),
  NOW(),
  jsonb_build_object('role', 'patient', 'is_walkin', true)
) RETURNING id INTO v_patient_3_id;

INSERT INTO public.users (id, phone, role) 
VALUES (v_patient_3_id, '01123456789', 'patient');

INSERT INTO public.patients (id, unique_id, phone, full_name, age, sex, registered)
VALUES (v_patient_3_id, 'PT' || upper(substring(md5(random()::text), 1, 8)), '01123456789', 'Mohamed Ibrahim', 45, 'Male', false);

-- Patient 4: Sara Mahmoud (8, Female, Child)
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data
) VALUES (
  gen_random_uuid(),
  'test_patient_4_' || floor(random() * 1000000) || '@medassist.test',
  crypt('password123', gen_salt('bf')),
  NOW(),
  jsonb_build_object('role', 'patient', 'is_walkin', true)
) RETURNING id INTO v_patient_4_id;

INSERT INTO public.users (id, phone, role) 
VALUES (v_patient_4_id, '01234567890', 'patient');

INSERT INTO public.patients (id, unique_id, phone, full_name, age, sex, is_dependent, parent_phone, registered)
VALUES (v_patient_4_id, 'PT' || upper(substring(md5(random()::text), 1, 8)), '01234567890', 'Sara Mahmoud', 8, 'Female', true, '01234567890', false);

-- ============================================================================
-- CREATE TODAY'S APPOINTMENTS
-- ============================================================================

-- Appointment 1: Ahmed Hassan - 30 minutes ago (current)
INSERT INTO public.appointments (
  doctor_id,
  patient_id,
  start_time,
  duration_minutes,
  status,
  created_by_role
) VALUES (
  v_doctor_id,
  v_patient_1_id,
  NOW() - interval '30 minutes',
  15,
  'scheduled',
  'doctor'
);

-- Appointment 2: Fatima Ali - in 5 minutes (upcoming/current)
INSERT INTO public.appointments (
  doctor_id,
  patient_id,
  start_time,
  duration_minutes,
  status,
  created_by_role
) VALUES (
  v_doctor_id,
  v_patient_2_id,
  NOW() + interval '5 minutes',
  15,
  'scheduled',
  'doctor'
);

-- Appointment 3: Mohamed Ibrahim - in 45 minutes (upcoming)
INSERT INTO public.appointments (
  doctor_id,
  patient_id,
  start_time,
  duration_minutes,
  status,
  created_by_role
) VALUES (
  v_doctor_id,
  v_patient_3_id,
  NOW() + interval '45 minutes',
  20,
  'scheduled',
  'doctor'
);

-- Appointment 4: Sara Mahmoud (child) - in 2 hours (future)
INSERT INTO public.appointments (
  doctor_id,
  patient_id,
  start_time,
  duration_minutes,
  status,
  created_by_role
) VALUES (
  v_doctor_id,
  v_patient_4_id,
  NOW() + interval '2 hours',
  10,
  'scheduled',
  'doctor'
);

-- Appointment 5: Ahmed Hassan - in 4 hours (afternoon)
INSERT INTO public.appointments (
  doctor_id,
  patient_id,
  start_time,
  duration_minutes,
  status,
  created_by_role
) VALUES (
  v_doctor_id,
  v_patient_1_id,
  NOW() + interval '4 hours',
  15,
  'scheduled',
  'doctor'
);

RAISE NOTICE '✅ Successfully created 4 test patients and 5 appointments!';
RAISE NOTICE 'Appointments range from 30 minutes ago to 4 hours from now.';
RAISE NOTICE 'Current/upcoming appointments (within 10 min) should be highlighted.';

END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- View created appointments
SELECT 
  a.start_time,
  p.full_name as patient_name,
  p.age,
  p.sex,
  a.duration_minutes,
  a.status,
  CASE 
    WHEN a.start_time BETWEEN NOW() - interval '10 minutes' AND NOW() + interval '10 minutes'
    THEN '⭐ CURRENT/UPCOMING'
    WHEN a.start_time < NOW()
    THEN '⏰ PAST'
    ELSE '📅 FUTURE'
  END as timing
FROM appointments a
JOIN patients p ON a.patient_id = p.id
WHERE a.doctor_id = 'YOUR_DOCTOR_ID_HERE' -- CHANGE THIS!
  AND DATE(a.start_time) = CURRENT_DATE
ORDER BY a.start_time;
