-- Migration 008: Fix frontdesk constraint and add patient self-entry features
-- Date: February 2026

-- ============================================================================
-- FIX USERS ROLE CONSTRAINT
-- ============================================================================

-- Drop the old constraint and add new one with frontdesk role
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('doctor', 'patient', 'frontdesk'));

-- ============================================================================
-- PATIENT MEDICAL RECORDS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patient_medical_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  
  record_type TEXT NOT NULL CHECK (record_type IN ('lab_result', 'diagnosis', 'procedure', 'imaging', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  
  provider_name TEXT,
  facility_name TEXT,
  
  has_attachment BOOLEAN DEFAULT FALSE,
  attachment_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_patient_medical_records_patient ON public.patient_medical_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_medical_records_date ON public.patient_medical_records(date DESC);
CREATE INDEX IF NOT EXISTS idx_patient_medical_records_type ON public.patient_medical_records(record_type);

COMMENT ON TABLE public.patient_medical_records IS 'Medical records manually entered by patients (external lab results, diagnoses, etc.)';

-- RLS Policies for patient_medical_records
ALTER TABLE public.patient_medical_records ENABLE ROW LEVEL SECURITY;

-- Patients can view their own records
CREATE POLICY "Patients can view own medical records"
ON public.patient_medical_records FOR SELECT
USING (patient_id = auth.uid());

-- Patients can insert their own records
CREATE POLICY "Patients can insert own medical records"
ON public.patient_medical_records FOR INSERT
WITH CHECK (patient_id = auth.uid());

-- Patients can update their own records
CREATE POLICY "Patients can update own medical records"
ON public.patient_medical_records FOR UPDATE
USING (patient_id = auth.uid());

-- Patients can delete their own records
CREATE POLICY "Patients can delete own medical records"
ON public.patient_medical_records FOR DELETE
USING (patient_id = auth.uid());

-- Doctors can view records of patients they've treated
CREATE POLICY "Doctors can view patient medical records"
ON public.patient_medical_records FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.clinical_notes cn
    WHERE cn.patient_id = patient_medical_records.patient_id
    AND cn.doctor_id = auth.uid()
  )
);

-- ============================================================================
-- PATIENT MEDICATIONS TABLE (Self-entered)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patient_medications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  
  medication_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  route TEXT DEFAULT 'oral',
  
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  
  prescriber_name TEXT,
  purpose TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_patient_medications_patient ON public.patient_medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_medications_active ON public.patient_medications(is_active);
CREATE INDEX IF NOT EXISTS idx_patient_medications_start ON public.patient_medications(start_date DESC);

COMMENT ON TABLE public.patient_medications IS 'Medications manually entered by patients (supplements, OTC, external prescriptions)';

-- RLS Policies for patient_medications
ALTER TABLE public.patient_medications ENABLE ROW LEVEL SECURITY;

-- Patients can view their own medications
CREATE POLICY "Patients can view own medications"
ON public.patient_medications FOR SELECT
USING (patient_id = auth.uid());

-- Patients can insert their own medications
CREATE POLICY "Patients can insert own medications"
ON public.patient_medications FOR INSERT
WITH CHECK (patient_id = auth.uid());

-- Patients can update their own medications
CREATE POLICY "Patients can update own medications"
ON public.patient_medications FOR UPDATE
USING (patient_id = auth.uid());

-- Patients can delete their own medications
CREATE POLICY "Patients can delete own medications"
ON public.patient_medications FOR DELETE
USING (patient_id = auth.uid());

-- Doctors can view medications of patients they've treated
CREATE POLICY "Doctors can view patient medications"
ON public.patient_medications FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.clinical_notes cn
    WHERE cn.patient_id = patient_medications.patient_id
    AND cn.doctor_id = auth.uid()
  )
);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================

-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for patient_medical_records
DROP TRIGGER IF EXISTS update_patient_medical_records_updated_at ON public.patient_medical_records;
CREATE TRIGGER update_patient_medical_records_updated_at
BEFORE UPDATE ON public.patient_medical_records
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for patient_medications
DROP TRIGGER IF EXISTS update_patient_medications_updated_at ON public.patient_medications;
CREATE TRIGGER update_patient_medications_updated_at
BEFORE UPDATE ON public.patient_medications
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify constraint
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'users_role_check';

-- Verify tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('patient_medical_records', 'patient_medications');
