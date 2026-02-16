-- Phase 7: Prescriptions & Clinical Enhancements
-- Migration: 007_prescriptions_vitals_labs.sql

-- ============================================================================
-- VITAL SIGNS TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vital_signs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  clinical_note_id UUID REFERENCES public.clinical_notes(id) ON DELETE SET NULL,
  
  -- Vital measurements
  systolic_bp INTEGER CHECK (systolic_bp > 0 AND systolic_bp < 300),
  diastolic_bp INTEGER CHECK (diastolic_bp > 0 AND diastolic_bp < 200),
  heart_rate INTEGER CHECK (heart_rate > 0 AND heart_rate < 300),
  temperature DECIMAL(4, 1) CHECK (temperature > 30 AND temperature < 45),
  respiratory_rate INTEGER CHECK (respiratory_rate > 0 AND respiratory_rate < 100),
  oxygen_saturation INTEGER CHECK (oxygen_saturation > 0 AND oxygen_saturation <= 100),
  weight DECIMAL(5, 2) CHECK (weight > 0 AND weight < 500),
  height INTEGER CHECK (height > 0 AND height < 300),
  bmi DECIMAL(4, 1),
  
  notes TEXT,
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vital_signs_patient ON public.vital_signs(patient_id);
CREATE INDEX idx_vital_signs_measured ON public.vital_signs(measured_at);
CREATE INDEX idx_vital_signs_clinical_note ON public.vital_signs(clinical_note_id);

COMMENT ON TABLE public.vital_signs IS 'Patient vital signs measurements with historical tracking';

-- ============================================================================
-- LAB TESTS CATALOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lab_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_code TEXT UNIQUE NOT NULL,
  test_name TEXT NOT NULL,
  category TEXT NOT NULL, -- e.g., 'Hematology', 'Chemistry', 'Microbiology'
  normal_range_min DECIMAL(10, 2),
  normal_range_max DECIMAL(10, 2),
  unit TEXT, -- e.g., 'mg/dL', 'mmol/L', 'cells/μL'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lab_tests_category ON public.lab_tests(category);
CREATE INDEX idx_lab_tests_active ON public.lab_tests(is_active);

COMMENT ON TABLE public.lab_tests IS 'Catalog of available laboratory tests';

-- ============================================================================
-- LAB ORDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lab_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  clinical_note_id UUID REFERENCES public.clinical_notes(id) ON DELETE SET NULL,
  
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'collected', 'processing', 'completed', 'cancelled')),
  priority TEXT DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'stat')),
  notes TEXT,
  
  ordered_at TIMESTAMPTZ DEFAULT NOW(),
  collected_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lab_orders_patient ON public.lab_orders(patient_id);
CREATE INDEX idx_lab_orders_status ON public.lab_orders(status);
CREATE INDEX idx_lab_orders_ordered ON public.lab_orders(ordered_at);

COMMENT ON TABLE public.lab_orders IS 'Laboratory test orders';

-- ============================================================================
-- LAB RESULTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lab_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lab_order_id UUID NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  lab_test_id UUID NOT NULL REFERENCES public.lab_tests(id) ON DELETE CASCADE,
  
  result_value DECIMAL(10, 2),
  result_text TEXT,
  is_abnormal BOOLEAN DEFAULT FALSE,
  abnormal_flag TEXT, -- 'H' (High), 'L' (Low), 'HH' (Critically High), 'LL' (Critically Low)
  
  result_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lab_results_order ON public.lab_results(lab_order_id);
CREATE INDEX idx_lab_results_test ON public.lab_results(lab_test_id);
CREATE INDEX idx_lab_results_abnormal ON public.lab_results(is_abnormal);

COMMENT ON TABLE public.lab_results IS 'Individual test results within lab orders';

-- ============================================================================
-- PRESCRIPTIONS (ENHANCED)
-- ============================================================================

-- Add prescription-specific fields to clinical_notes
ALTER TABLE public.clinical_notes 
  ADD COLUMN IF NOT EXISTS prescription_number TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS doctor_license_number TEXT,
  ADD COLUMN IF NOT EXISTS prescription_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS prescription_printed_at TIMESTAMPTZ;

CREATE INDEX idx_clinical_notes_prescription ON public.clinical_notes(prescription_number);

COMMENT ON COLUMN public.clinical_notes.prescription_number IS 'Unique prescription number (e.g., RX-2026-0001)';
COMMENT ON COLUMN public.clinical_notes.doctor_license_number IS 'Doctor medical license number for prescription';

-- ============================================================================
-- RLS POLICIES - VITAL SIGNS
-- ============================================================================

-- Doctors can view vitals for their patients
CREATE POLICY "Doctors can view their patients vitals"
ON public.vital_signs
FOR SELECT
USING (
  doctor_id = auth.uid()
  OR patient_id IN (
    SELECT patient_id FROM public.appointments WHERE doctor_id = auth.uid()
  )
);

-- Doctors can create vitals for their patients
CREATE POLICY "Doctors can create vitals"
ON public.vital_signs
FOR INSERT
WITH CHECK (doctor_id = auth.uid());

-- Patients can view their own vitals
CREATE POLICY "Patients can view own vitals"
ON public.vital_signs
FOR SELECT
USING (patient_id = auth.uid());

-- ============================================================================
-- RLS POLICIES - LAB ORDERS & RESULTS
-- ============================================================================

-- Doctors can view their lab orders
CREATE POLICY "Doctors can view their lab orders"
ON public.lab_orders
FOR SELECT
USING (doctor_id = auth.uid());

-- Doctors can create lab orders
CREATE POLICY "Doctors can create lab orders"
ON public.lab_orders
FOR INSERT
WITH CHECK (doctor_id = auth.uid());

-- Patients can view their own lab orders
CREATE POLICY "Patients can view own lab orders"
ON public.lab_orders
FOR SELECT
USING (patient_id = auth.uid());

-- Anyone can view lab test catalog
CREATE POLICY "Anyone can view lab test catalog"
ON public.lab_tests
FOR SELECT
USING (true);

-- Doctors and patients can view lab results for their orders
CREATE POLICY "View lab results"
ON public.lab_results
FOR SELECT
USING (
  lab_order_id IN (
    SELECT id FROM public.lab_orders 
    WHERE doctor_id = auth.uid() OR patient_id = auth.uid()
  )
);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to generate unique prescription number
CREATE OR REPLACE FUNCTION generate_prescription_number()
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  rx_number TEXT;
BEGIN
  year_part := TO_CHAR(CURRENT_DATE, 'YYYY');
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(prescription_number FROM 'RX-\d{4}-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO sequence_num
  FROM clinical_notes
  WHERE prescription_number LIKE 'RX-' || year_part || '-%';
  
  rx_number := 'RX-' || year_part || '-' || LPAD(sequence_num::TEXT, 4, '0');
  
  RETURN rx_number;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_prescription_number IS 'Generate unique prescription number in format RX-YYYY-NNNN';

-- Function to calculate BMI
CREATE OR REPLACE FUNCTION calculate_bmi(weight_kg DECIMAL, height_cm INTEGER)
RETURNS DECIMAL AS $$
BEGIN
  IF height_cm IS NULL OR height_cm = 0 OR weight_kg IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN ROUND((weight_kg / ((height_cm / 100.0) * (height_cm / 100.0)))::NUMERIC, 1);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_bmi IS 'Calculate BMI from weight (kg) and height (cm)';

-- Trigger to auto-calculate BMI
CREATE OR REPLACE FUNCTION update_bmi()
RETURNS TRIGGER AS $$
BEGIN
  NEW.bmi := calculate_bmi(NEW.weight, NEW.height);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_bmi
BEFORE INSERT OR UPDATE ON public.vital_signs
FOR EACH ROW
EXECUTE FUNCTION update_bmi();

-- ============================================================================
-- SEED DATA - LAB TESTS CATALOG
-- ============================================================================

INSERT INTO public.lab_tests (test_code, test_name, category, normal_range_min, normal_range_max, unit) VALUES
-- Hematology
('CBC-WBC', 'White Blood Cell Count', 'Hematology', 4.0, 11.0, '10³/μL'),
('CBC-RBC', 'Red Blood Cell Count', 'Hematology', 4.5, 6.0, '10⁶/μL'),
('CBC-HGB', 'Hemoglobin', 'Hematology', 12.0, 17.0, 'g/dL'),
('CBC-HCT', 'Hematocrit', 'Hematology', 36.0, 50.0, '%'),
('CBC-PLT', 'Platelet Count', 'Hematology', 150.0, 400.0, '10³/μL'),

-- Chemistry
('CHEM-GLU', 'Glucose (Fasting)', 'Chemistry', 70.0, 100.0, 'mg/dL'),
('CHEM-CREAT', 'Creatinine', 'Chemistry', 0.7, 1.3, 'mg/dL'),
('CHEM-BUN', 'Blood Urea Nitrogen', 'Chemistry', 7.0, 20.0, 'mg/dL'),
('CHEM-CHOL', 'Total Cholesterol', 'Chemistry', 0.0, 200.0, 'mg/dL'),
('CHEM-TRIG', 'Triglycerides', 'Chemistry', 0.0, 150.0, 'mg/dL'),
('CHEM-HDL', 'HDL Cholesterol', 'Chemistry', 40.0, 60.0, 'mg/dL'),
('CHEM-LDL', 'LDL Cholesterol', 'Chemistry', 0.0, 100.0, 'mg/dL'),

-- Liver Function
('LFT-ALT', 'Alanine Aminotransferase', 'Liver Function', 7.0, 56.0, 'U/L'),
('LFT-AST', 'Aspartate Aminotransferase', 'Liver Function', 10.0, 40.0, 'U/L'),
('LFT-ALP', 'Alkaline Phosphatase', 'Liver Function', 44.0, 147.0, 'U/L'),
('LFT-BIL', 'Total Bilirubin', 'Liver Function', 0.1, 1.2, 'mg/dL'),

-- Kidney Function
('KIDNEY-CREAT', 'Serum Creatinine', 'Kidney Function', 0.6, 1.2, 'mg/dL'),
('KIDNEY-BUN', 'Blood Urea Nitrogen', 'Kidney Function', 7.0, 20.0, 'mg/dL'),
('KIDNEY-GFR', 'eGFR', 'Kidney Function', 90.0, 120.0, 'mL/min'),

-- Thyroid
('THYROID-TSH', 'Thyroid Stimulating Hormone', 'Thyroid', 0.4, 4.0, 'mIU/L'),
('THYROID-T4', 'Free T4', 'Thyroid', 0.8, 1.8, 'ng/dL'),
('THYROID-T3', 'Free T3', 'Thyroid', 2.3, 4.2, 'pg/mL')

ON CONFLICT (test_code) DO NOTHING;

COMMENT ON TABLE public.lab_tests IS 'Seeded with common laboratory tests and normal ranges';
