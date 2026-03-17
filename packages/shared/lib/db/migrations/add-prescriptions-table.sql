-- Prescription Items Table (normalized from JSONB)
-- This provides relational access to prescription data for analytics and pharmacy integration
-- Phase C2: Layer 2 prep for multi-clinic analytics

CREATE TABLE IF NOT EXISTS prescription_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinical_note_id UUID NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),
  doctor_id UUID NOT NULL REFERENCES doctors(id),
  clinic_id UUID REFERENCES clinics(id),

  -- Drug info
  drug_name TEXT NOT NULL,
  drug_brand_name TEXT,
  drug_brand_name_ar TEXT,
  generic_name TEXT,
  drug_id TEXT, -- References egyptian-drugs.ts id

  -- Prescription details
  strength TEXT,
  form TEXT, -- tablet, capsule, syrup, etc.
  frequency TEXT NOT NULL,
  duration TEXT NOT NULL,
  quantity INTEGER,
  instructions TEXT,

  -- Status
  status TEXT DEFAULT 'prescribed' CHECK (status IN ('prescribed', 'dispensed', 'cancelled')),

  -- Timestamps
  prescribed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_prescription_items_patient ON prescription_items(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_doctor ON prescription_items(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_clinic ON prescription_items(clinic_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_note ON prescription_items(clinical_note_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_drug ON prescription_items(drug_name);
CREATE INDEX IF NOT EXISTS idx_prescription_items_status ON prescription_items(status);
CREATE INDEX IF NOT EXISTS idx_prescription_items_prescribed_at ON prescription_items(prescribed_at DESC);

-- RLS
ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;

-- Policy: Doctors can see prescription items they created
CREATE POLICY "doctors_own_prescriptions" ON prescription_items
  FOR SELECT USING (doctor_id = auth.uid());

-- Policy: Patients can see their own prescription items
CREATE POLICY "patients_own_prescriptions" ON prescription_items
  FOR SELECT USING (patient_id = auth.uid());
