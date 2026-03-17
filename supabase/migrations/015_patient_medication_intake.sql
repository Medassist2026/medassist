-- ============================================================================
-- Migration 015: Patient Medication Intake (First Visit Baseline)
-- Creates the patient_medication_intake table for tracking medications
-- patients were taking before their first visit.
-- ============================================================================

-- Create the intake table
CREATE TABLE IF NOT EXISTS patient_medication_intake (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drug_name TEXT NOT NULL,
  generic_name TEXT,
  dosage TEXT,
  frequency TEXT,
  prescriber TEXT,
  condition TEXT,
  duration_taking TEXT,
  still_taking BOOLEAN DEFAULT true,
  intake_completed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick patient lookup
CREATE INDEX IF NOT EXISTS idx_medication_intake_patient
  ON patient_medication_intake(patient_id);

-- Index for still_taking filter (doctor-side query)
CREATE INDEX IF NOT EXISTS idx_medication_intake_active
  ON patient_medication_intake(patient_id, still_taking)
  WHERE still_taking = true;

-- RLS Policies
ALTER TABLE patient_medication_intake ENABLE ROW LEVEL SECURITY;

-- Patients can read/write their own intake
CREATE POLICY "patients_own_intake_select"
  ON patient_medication_intake FOR SELECT
  USING (auth.uid() = patient_id);

CREATE POLICY "patients_own_intake_insert"
  ON patient_medication_intake FOR INSERT
  WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "patients_own_intake_update"
  ON patient_medication_intake FOR UPDATE
  USING (auth.uid() = patient_id);

CREATE POLICY "patients_own_intake_delete"
  ON patient_medication_intake FOR DELETE
  USING (auth.uid() = patient_id);

-- Doctors can read intake data for patients they have treated
CREATE POLICY "doctors_read_intake"
  ON patient_medication_intake FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.doctors
      WHERE doctors.id = auth.uid()
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_medication_intake_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER medication_intake_updated
  BEFORE UPDATE ON patient_medication_intake
  FOR EACH ROW
  EXECUTE FUNCTION update_medication_intake_timestamp();
