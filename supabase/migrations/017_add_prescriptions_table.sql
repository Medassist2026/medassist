-- ============================================================================
-- Migration 017: Prescription Items Normalization
-- Creates relational prescription_items table for analytics and pharmacy integration
-- ============================================================================

-- Prescription Items Table (normalized from JSONB medications in clinical_notes)
-- This provides relational access to prescription data for analytics and pharmacy integration
CREATE TABLE IF NOT EXISTS prescription_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinical_note_id UUID NOT NULL REFERENCES public.clinical_notes(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id),
  clinic_id UUID REFERENCES public.clinics(id),

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
CREATE INDEX IF NOT EXISTS idx_prescription_items_patient ON public.prescription_items(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_doctor ON public.prescription_items(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_clinic ON public.prescription_items(clinic_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_note ON public.prescription_items(clinical_note_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_drug ON public.prescription_items(drug_name);
CREATE INDEX IF NOT EXISTS idx_prescription_items_status ON public.prescription_items(status);
CREATE INDEX IF NOT EXISTS idx_prescription_items_prescribed_at ON public.prescription_items(prescribed_at);

-- RLS
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Doctors can view their own prescriptions
CREATE POLICY "Doctors view own prescriptions"
  ON public.prescription_items
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM public.doctors WHERE id = prescription_items.doctor_id
    )
  );

-- Patients can view their own prescriptions
CREATE POLICY "Patients view own prescriptions"
  ON public.prescription_items
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT patient_id FROM public.patients WHERE id = prescription_items.patient_id
    )
  );

-- Doctors can insert their own prescriptions
CREATE POLICY "Doctors create prescriptions"
  ON public.prescription_items
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.doctors WHERE id = prescription_items.doctor_id
    )
  );

-- Doctors can update their own prescriptions
CREATE POLICY "Doctors update own prescriptions"
  ON public.prescription_items
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM public.doctors WHERE id = prescription_items.doctor_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.doctors WHERE id = prescription_items.doctor_id
    )
  );
