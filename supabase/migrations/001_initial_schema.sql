-- MedAssist Phase 1 - Initial Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS & AUTHENTICATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('doctor', 'patient')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- DOCTOR PROFILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.doctors (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  unique_id TEXT UNIQUE NOT NULL, -- e.g., nanoid()
  specialty TEXT NOT NULL CHECK (specialty IN (
    'general-practitioner',
    'pediatrics',
    'cardiology',
    'endocrinology'
  )),
  default_template_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_doctors_unique_id ON public.doctors(unique_id);
CREATE INDEX idx_doctors_specialty ON public.doctors(specialty);

-- ============================================================================
-- PATIENT PROFILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  unique_id TEXT UNIQUE NOT NULL, -- e.g., nanoid()
  phone TEXT NOT NULL,
  registered BOOLEAN DEFAULT FALSE, -- Has installed app
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_patients_unique_id ON public.patients(unique_id);
CREATE INDEX idx_patients_phone ON public.patients(phone);

-- ============================================================================
-- CLINICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.clinics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unique_id TEXT UNIQUE NOT NULL, -- e.g., nanoid()
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clinics_unique_id ON public.clinics(unique_id);

-- ============================================================================
-- CLINIC-DOCTOR RELATIONSHIPS (Many-to-Many)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.clinic_doctors (
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('doctor', 'frontdesk')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (clinic_id, doctor_id)
);

CREATE INDEX idx_clinic_doctors_clinic ON public.clinic_doctors(clinic_id);
CREATE INDEX idx_clinic_doctors_doctor ON public.clinic_doctors(doctor_id);

-- ============================================================================
-- APPOINTMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 10 CHECK (duration_minutes > 0),
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_by_role TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_appointments_doctor ON public.appointments(doctor_id);
CREATE INDEX idx_appointments_patient ON public.appointments(patient_id);
CREATE INDEX idx_appointments_start_time ON public.appointments(start_time);
CREATE INDEX idx_appointments_status ON public.appointments(status);

-- ============================================================================
-- CLINICAL NOTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.clinical_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  chief_complaint TEXT[] NOT NULL DEFAULT '{}',
  diagnosis JSONB NOT NULL DEFAULT '[]', -- [{icd10_code: string, text: string}]
  medications JSONB NOT NULL DEFAULT '[]', -- [{drug: string, frequency: string, duration: string}]
  plan TEXT NOT NULL DEFAULT '',
  template_id UUID,
  keystroke_count INTEGER, -- Analytics
  duration_seconds INTEGER, -- Analytics
  synced_to_patient BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  modified_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clinical_notes_doctor ON public.clinical_notes(doctor_id);
CREATE INDEX idx_clinical_notes_patient ON public.clinical_notes(patient_id);
CREATE INDEX idx_clinical_notes_created ON public.clinical_notes(created_at DESC);
CREATE INDEX idx_clinical_notes_synced ON public.clinical_notes(synced_to_patient);

-- ============================================================================
-- MEDICATION REMINDERS (Patient Handshake)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.medication_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinical_note_id UUID NOT NULL REFERENCES public.clinical_notes(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  medication JSONB NOT NULL, -- {drug, frequency, duration, schedule}
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  expires_at TIMESTAMPTZ NOT NULL, -- 2 weeks from creation
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_medication_reminders_patient ON public.medication_reminders(patient_id);
CREATE INDEX idx_medication_reminders_status ON public.medication_reminders(status);
CREATE INDEX idx_medication_reminders_expires ON public.medication_reminders(expires_at);

-- ============================================================================
-- MESSAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('doctor', 'patient')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  modified_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_messages_doctor ON public.messages(doctor_id);
CREATE INDEX idx_messages_patient ON public.messages(patient_id);
CREATE INDEX idx_messages_created ON public.messages(created_at DESC);

-- ============================================================================
-- TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  specialty TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  sections JSONB NOT NULL, -- Template structure
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_templates_specialty ON public.templates(specialty);
CREATE INDEX idx_templates_default ON public.templates(is_default);

-- ============================================================================
-- DOCTOR SAVED TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.doctor_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  customizations JSONB, -- Section reordering, enable/disable
  last_used TIMESTAMPTZ,
  UNIQUE(doctor_id, template_id)
);

CREATE INDEX idx_doctor_templates_doctor ON public.doctor_templates(doctor_id);
CREATE INDEX idx_doctor_templates_last_used ON public.doctor_templates(last_used DESC);

-- ============================================================================
-- ANALYTICS EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_name TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  properties JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_events_name ON public.analytics_events(event_name);
CREATE INDEX idx_analytics_events_user ON public.analytics_events(user_id);
CREATE INDEX idx_analytics_events_created ON public.analytics_events(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- USERS --
CREATE POLICY "Users can read own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- DOCTORS --
CREATE POLICY "Doctors can read own profile"
  ON public.doctors FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Doctors can update own profile"
  ON public.doctors FOR UPDATE
  USING (auth.uid() = id);

-- PATIENTS --
CREATE POLICY "Patients can read own profile"
  ON public.patients FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Patients can update own profile"
  ON public.patients FOR UPDATE
  USING (auth.uid() = id);

-- APPOINTMENTS --
CREATE POLICY "Doctors can read their appointments"
  ON public.appointments FOR SELECT
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE id = auth.uid()));

CREATE POLICY "Front desk can read clinic appointments"
  ON public.appointments FOR SELECT
  USING (
    doctor_id IN (
      SELECT cd.doctor_id
      FROM public.clinic_doctors cd
      WHERE cd.clinic_id IN (
        SELECT clinic_id FROM public.clinic_doctors WHERE doctor_id = auth.uid()
      )
    )
  );

CREATE POLICY "Doctors and front desk can create appointments"
  ON public.appointments FOR INSERT
  WITH CHECK (
    doctor_id IN (SELECT id FROM public.doctors WHERE id = auth.uid())
    OR
    doctor_id IN (
      SELECT cd.doctor_id
      FROM public.clinic_doctors cd
      WHERE cd.clinic_id IN (
        SELECT clinic_id FROM public.clinic_doctors WHERE doctor_id = auth.uid() AND role = 'frontdesk'
      )
    )
  );

-- CLINICAL NOTES --
CREATE POLICY "Doctors can read own clinical notes"
  ON public.clinical_notes FOR SELECT
  USING (doctor_id = auth.uid());

CREATE POLICY "Patients can read their clinical notes"
  ON public.clinical_notes FOR SELECT
  USING (patient_id = auth.uid() AND synced_to_patient = TRUE);

CREATE POLICY "Doctors can create clinical notes"
  ON public.clinical_notes FOR INSERT
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Doctors can update own clinical notes"
  ON public.clinical_notes FOR UPDATE
  USING (doctor_id = auth.uid());

-- CRITICAL: Front desk CANNOT access clinical notes (implicit deny)

-- MEDICATION REMINDERS --
CREATE POLICY "Patients can read their medication reminders"
  ON public.medication_reminders FOR SELECT
  USING (patient_id = auth.uid());

CREATE POLICY "Patients can update their medication reminders"
  ON public.medication_reminders FOR UPDATE
  USING (patient_id = auth.uid());

-- MESSAGES --
CREATE POLICY "Doctors can read their messages"
  ON public.messages FOR SELECT
  USING (doctor_id = auth.uid());

CREATE POLICY "Patients can read their messages"
  ON public.messages FOR SELECT
  USING (patient_id = auth.uid());

CREATE POLICY "Doctors and patients can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    (sender_role = 'doctor' AND doctor_id = auth.uid())
    OR
    (sender_role = 'patient' AND patient_id = auth.uid())
  );

-- TEMPLATES --
CREATE POLICY "Everyone can read templates"
  ON public.templates FOR SELECT
  TO authenticated
  USING (true);

-- DOCTOR TEMPLATES --
CREATE POLICY "Doctors can manage their saved templates"
  ON public.doctor_templates FOR ALL
  USING (doctor_id = auth.uid());

-- ANALYTICS --
CREATE POLICY "Users can create analytics events"
  ON public.analytics_events FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-update modified_at timestamp
CREATE OR REPLACE FUNCTION update_modified_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.modified_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_clinical_notes_modified_at
  BEFORE UPDATE ON public.clinical_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_at();

CREATE TRIGGER update_messages_modified_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_at();

-- ============================================================================
-- INITIAL SETUP COMPLETE
-- ============================================================================

COMMENT ON TABLE public.users IS 'Unified user table for both doctors and patients';
COMMENT ON TABLE public.doctors IS 'Doctor-specific profile data';
COMMENT ON TABLE public.patients IS 'Patient-specific profile data';
COMMENT ON TABLE public.clinic_doctors IS 'Many-to-many: clinics and doctors/front desk';
COMMENT ON TABLE public.clinical_notes IS 'Structured clinical documentation';
COMMENT ON TABLE public.medication_reminders IS 'Patient medication acceptance workflow';
COMMENT ON COLUMN public.appointments.created_by_role IS 'Track if appointment was created by doctor, frontdesk, or patient';
COMMENT ON COLUMN public.clinical_notes.synced_to_patient IS 'Whether patient has access to this note';
COMMENT ON COLUMN public.medication_reminders.expires_at IS 'Auto-calculated as created_at + 2 weeks';
