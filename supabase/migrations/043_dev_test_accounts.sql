-- ============================================================================
-- Migration 043: Dev Test Accounts
--
-- Creates one account per role for local development and QA testing.
-- All accounts use password: Test1234!
--
-- Note: Migration 028 was already taken by 028_ensure_appointment_columns.sql,
-- so dev accounts are numbered 043.
--
-- Accounts created:
--   Doctor    dr.ahmed@medassist.dev   / 01000000001  (Clinic A owner + Clinic B member)
--   Frontdesk nour@medassist.dev       / 01000000002  (Clinic A + Clinic B)
--   Patient   khaled@medassist.dev     / 01000000003
--   Doctor 2  dr.sara@medassist.dev    / 01000000004  (Clinic B member)
--
-- Clinics:
--   Clinic A — dr.ahmed solo + nour as frontdesk
--   Clinic B — dr.ahmed + dr.sara + nour as frontdesk
--
-- IDEMPOTENT: skips everything if dr.ahmed@medassist.dev already exists.
-- ============================================================================

DO $$
DECLARE
  v_ahmed_id    UUID;
  v_nour_id     UUID;
  v_khaled_id   UUID;
  v_sara_id     UUID;
  v_clinic_a_id UUID;
  v_clinic_b_id UUID;
BEGIN

  -- ── Guard: skip entirely if already seeded ─────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.users WHERE email = 'dr.ahmed@medassist.dev'
  ) THEN
    RAISE NOTICE 'Dev test accounts already exist — skipping migration 043.';
    RETURN;
  END IF;

  -- ── 1. Auth users (Supabase auth.users) ────────────────────────────────────
  -- Generate stable UUIDs so re-runs stay idempotent
  v_ahmed_id  := '00000000-0000-0000-0000-000000000001'::UUID;
  v_nour_id   := '00000000-0000-0000-0000-000000000002'::UUID;
  v_khaled_id := '00000000-0000-0000-0000-000000000003'::UUID;
  v_sara_id   := '00000000-0000-0000-0000-000000000004'::UUID;

  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, role, aud
  ) VALUES
  -- Dr. Ahmed Badwy
  (
    v_ahmed_id,
    'dr.ahmed@medassist.dev',
    crypt('Test1234!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"doctor"}'::jsonb,
    NOW(), NOW(), 'authenticated', 'authenticated'
  ),
  -- Nour (frontdesk)
  (
    v_nour_id,
    'nour@medassist.dev',
    crypt('Test1234!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"frontdesk"}'::jsonb,
    NOW(), NOW(), 'authenticated', 'authenticated'
  ),
  -- Khaled (patient)
  (
    v_khaled_id,
    'khaled@medassist.dev',
    crypt('Test1234!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"patient"}'::jsonb,
    NOW(), NOW(), 'authenticated', 'authenticated'
  ),
  -- Dr. Sara Hassan
  (
    v_sara_id,
    'dr.sara@medassist.dev',
    crypt('Test1234!', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"doctor"}'::jsonb,
    NOW(), NOW(), 'authenticated', 'authenticated'
  )
  ON CONFLICT (id) DO NOTHING;

  -- ── 2. Public users table ───────────────────────────────────────────────────
  INSERT INTO public.users (id, email, phone, role, created_at)
  VALUES
    (v_ahmed_id,  'dr.ahmed@medassist.dev', '01000000001', 'doctor',    NOW()),
    (v_nour_id,   'nour@medassist.dev',     '01000000002', 'frontdesk', NOW()),
    (v_khaled_id, 'khaled@medassist.dev',   '01000000003', 'patient',   NOW()),
    (v_sara_id,   'dr.sara@medassist.dev',  '01000000004', 'doctor',    NOW())
  ON CONFLICT (id) DO NOTHING;

  -- ── 3. Doctor profiles ──────────────────────────────────────────────────────
  INSERT INTO public.doctors (id, full_name, specialty, created_at)
  VALUES
    (v_ahmed_id, 'أحمد بدوي',  'internal-medicine', NOW()),
    (v_sara_id,  'سارة حسن',   'pediatrics',         NOW())
  ON CONFLICT (id) DO NOTHING;

  -- ── 4. Patient profile ──────────────────────────────────────────────────────
  INSERT INTO public.patients (id, full_name, phone, age, sex, created_at)
  VALUES
    (v_khaled_id, 'خالد محمود', '01000000003', 32, 'male', NOW())
  ON CONFLICT (id) DO NOTHING;

  -- ── 5. Front desk staff profile ─────────────────────────────────────────────
  -- unique_id = 'FD-0001' for Nour
  INSERT INTO public.front_desk_staff (id, unique_id, full_name, created_at)
  VALUES
    (v_nour_id, 'FD-0001', 'نور محمد', NOW())
  ON CONFLICT (id) DO NOTHING;

  -- ── 6. Clinics ───────────────────────────────────────────────────────────────
  v_clinic_a_id := '00000000-0000-0000-0000-000000000010'::UUID;
  v_clinic_b_id := '00000000-0000-0000-0000-000000000020'::UUID;

  INSERT INTO public.clinics (id, name, created_at)
  VALUES
    (v_clinic_a_id, 'عيادة أ — د. أحمد', NOW()),
    (v_clinic_b_id, 'عيادة ب — مشتركة',  NOW())
  ON CONFLICT (id) DO NOTHING;

  -- ── 7. Clinic memberships (unified RBAC) ────────────────────────────────────
  -- Clinic A: dr.ahmed (OWNER) + nour (FRONT_DESK)
  INSERT INTO public.clinic_memberships (clinic_id, user_id, role, status, created_at)
  VALUES
    (v_clinic_a_id, v_ahmed_id, 'OWNER',      'ACTIVE', NOW()),
    (v_clinic_a_id, v_nour_id,  'FRONT_DESK', 'ACTIVE', NOW()),
    -- Clinic B: dr.ahmed (OWNER) + dr.sara (DOCTOR) + nour (FRONT_DESK)
    (v_clinic_b_id, v_ahmed_id, 'OWNER',      'ACTIVE', NOW()),
    (v_clinic_b_id, v_sara_id,  'DOCTOR',     'ACTIVE', NOW()),
    (v_clinic_b_id, v_nour_id,  'FRONT_DESK', 'ACTIVE', NOW())
  ON CONFLICT (clinic_id, user_id) DO NOTHING;

  -- ── 8. Legacy clinic_doctors links ──────────────────────────────────────────
  -- Some API routes still join via clinic_doctors, so keep both tables in sync.
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clinic_doctors'
  ) THEN
    INSERT INTO public.clinic_doctors (clinic_id, doctor_id, created_at)
    VALUES
      (v_clinic_a_id, v_ahmed_id, NOW()),
      (v_clinic_b_id, v_ahmed_id, NOW()),
      (v_clinic_b_id, v_sara_id,  NOW())
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── 9. Front desk staff ← clinic link ───────────────────────────────────────
  -- Update front_desk_staff.clinic_id to Clinic A (Nour's primary clinic)
  UPDATE public.front_desk_staff
  SET clinic_id = v_clinic_a_id
  WHERE id = v_nour_id AND clinic_id IS NULL;

  -- clinic_frontdesk join table (migration 042)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clinic_frontdesk'
  ) THEN
    INSERT INTO public.clinic_frontdesk (clinic_id, frontdesk_id, created_at)
    VALUES
      (v_clinic_a_id, v_nour_id, NOW()),
      (v_clinic_b_id, v_nour_id, NOW())
    ON CONFLICT (clinic_id, frontdesk_id) DO NOTHING;
  END IF;

  -- ── 10. Doctor–patient relationship (Khaled → Dr. Ahmed) ────────────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'doctor_patient_relationships'
  ) THEN
    INSERT INTO public.doctor_patient_relationships
      (doctor_id, patient_id, clinic_id, created_at)
    VALUES
      (v_ahmed_id, v_khaled_id, v_clinic_a_id, NOW())
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── 11. Doctor availability (Clinic A default schedule) ──────────────────────
  -- Sun–Thu 09:00–17:00, 15-min slots — skip if already seeded by migration 006
  INSERT INTO public.doctor_availability
    (doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, is_active)
  SELECT v_ahmed_id, d, '09:00'::TIME, '17:00'::TIME, 15, TRUE
  FROM generate_series(0, 4) AS d   -- 0=Sun … 4=Thu
  ON CONFLICT (doctor_id, day_of_week, start_time) DO NOTHING;

  INSERT INTO public.doctor_availability
    (doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, is_active)
  SELECT v_sara_id, d, '10:00'::TIME, '16:00'::TIME, 20, TRUE
  FROM generate_series(0, 4) AS d
  ON CONFLICT (doctor_id, day_of_week, start_time) DO NOTHING;

  RAISE NOTICE 'Dev test accounts created successfully.';
END;
$$;

-- ============================================================================
-- SUMMARY
-- ============================================================================
--
--  Role       | Email                    | Phone       | Password
--  -----------|--------------------------|-------------|----------
--  Doctor     | dr.ahmed@medassist.dev   | 01000000001 | Test1234!
--  Frontdesk  | nour@medassist.dev       | 01000000002 | Test1234!
--  Patient    | khaled@medassist.dev     | 01000000003 | Test1234!
--  Doctor 2   | dr.sara@medassist.dev    | 01000000004 | Test1234!
--
--  Clinic A: dr.ahmed (OWNER) + nour (FRONT_DESK)
--  Clinic B: dr.ahmed (OWNER) + dr.sara (DOCTOR) + nour (FRONT_DESK)
-- ============================================================================
