-- Phase 10: Imaging + Advanced Clinical Record Domains
-- Adds first-class tables for imaging orders, allergies, chronic conditions,
-- and immunizations. APIs already support fallback mode when these are absent.

-- ============================================================================
-- IMAGING ORDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.imaging_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,

  modality TEXT NOT NULL CHECK (modality IN ('xray', 'ct', 'mri', 'ultrasound', 'other')),
  study_name TEXT NOT NULL,
  clinical_indication TEXT,
  priority TEXT NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'stat')),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'scheduled', 'completed', 'cancelled')),

  facility_name TEXT,
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_imaging_orders_doctor ON public.imaging_orders(doctor_id);
CREATE INDEX IF NOT EXISTS idx_imaging_orders_patient ON public.imaging_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_imaging_orders_status ON public.imaging_orders(status);
CREATE INDEX IF NOT EXISTS idx_imaging_orders_ordered_at ON public.imaging_orders(ordered_at DESC);

ALTER TABLE public.imaging_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors manage their imaging orders" ON public.imaging_orders;
CREATE POLICY "Doctors manage their imaging orders"
ON public.imaging_orders
FOR ALL
USING (doctor_id = auth.uid())
WITH CHECK (doctor_id = auth.uid());

DROP POLICY IF EXISTS "Patients view own imaging orders" ON public.imaging_orders;
CREATE POLICY "Patients view own imaging orders"
ON public.imaging_orders
FOR SELECT
USING (patient_id = auth.uid());

DROP TRIGGER IF EXISTS update_imaging_orders_updated_at ON public.imaging_orders;
CREATE TRIGGER update_imaging_orders_updated_at
BEFORE UPDATE ON public.imaging_orders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PATIENT ALLERGIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patient_allergies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,

  allergen TEXT NOT NULL,
  reaction TEXT,
  severity TEXT NOT NULL DEFAULT 'moderate' CHECK (severity IN ('mild', 'moderate', 'severe')),
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient ON public.patient_allergies(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_allergies_recorded_date ON public.patient_allergies(recorded_date DESC);

ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients manage own allergies" ON public.patient_allergies;
CREATE POLICY "Patients manage own allergies"
ON public.patient_allergies
FOR ALL
USING (patient_id = auth.uid())
WITH CHECK (patient_id = auth.uid());

DROP POLICY IF EXISTS "Doctors view allergies for treated patients" ON public.patient_allergies;
CREATE POLICY "Doctors view allergies for treated patients"
ON public.patient_allergies
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.clinical_notes cn
    WHERE cn.patient_id = patient_allergies.patient_id
      AND cn.doctor_id = auth.uid()
  )
);

DROP TRIGGER IF EXISTS update_patient_allergies_updated_at ON public.patient_allergies;
CREATE TRIGGER update_patient_allergies_updated_at
BEFORE UPDATE ON public.patient_allergies
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- CHRONIC CONDITIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chronic_conditions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,

  condition_name TEXT NOT NULL,
  diagnosed_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chronic_conditions_patient ON public.chronic_conditions(patient_id);
CREATE INDEX IF NOT EXISTS idx_chronic_conditions_status ON public.chronic_conditions(status);

ALTER TABLE public.chronic_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients manage own chronic conditions" ON public.chronic_conditions;
CREATE POLICY "Patients manage own chronic conditions"
ON public.chronic_conditions
FOR ALL
USING (patient_id = auth.uid())
WITH CHECK (patient_id = auth.uid());

DROP POLICY IF EXISTS "Doctors view chronic conditions for treated patients" ON public.chronic_conditions;
CREATE POLICY "Doctors view chronic conditions for treated patients"
ON public.chronic_conditions
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.clinical_notes cn
    WHERE cn.patient_id = chronic_conditions.patient_id
      AND cn.doctor_id = auth.uid()
  )
);

DROP TRIGGER IF EXISTS update_chronic_conditions_updated_at ON public.chronic_conditions;
CREATE TRIGGER update_chronic_conditions_updated_at
BEFORE UPDATE ON public.chronic_conditions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- IMMUNIZATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.immunizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,

  vaccine_name TEXT NOT NULL,
  administered_date DATE NOT NULL DEFAULT CURRENT_DATE,
  provider_name TEXT,
  facility_name TEXT,
  dose TEXT,
  lot_number TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_immunizations_patient ON public.immunizations(patient_id);
CREATE INDEX IF NOT EXISTS idx_immunizations_administered_date ON public.immunizations(administered_date DESC);

ALTER TABLE public.immunizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients manage own immunizations" ON public.immunizations;
CREATE POLICY "Patients manage own immunizations"
ON public.immunizations
FOR ALL
USING (patient_id = auth.uid())
WITH CHECK (patient_id = auth.uid());

DROP POLICY IF EXISTS "Doctors view immunizations for treated patients" ON public.immunizations;
CREATE POLICY "Doctors view immunizations for treated patients"
ON public.immunizations
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.clinical_notes cn
    WHERE cn.patient_id = immunizations.patient_id
      AND cn.doctor_id = auth.uid()
  )
);

DROP TRIGGER IF EXISTS update_immunizations_updated_at ON public.immunizations;
CREATE TRIGGER update_immunizations_updated_at
BEFORE UPDATE ON public.immunizations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
