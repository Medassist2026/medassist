-- ============================================================================
-- Migration 027: Smart Rx Intelligence — Phase 0 (Silent Data Collection)
-- ============================================================================
-- Purpose: Create the prescription_events table to silently log every
--          medication prescribed by a doctor, along with clinical context.
--          This forms the data foundation for the AI prescription learning
--          system that will eventually predict and reorder medications.
-- ============================================================================

-- 1. prescription_events — one row per medication per clinical note
CREATE TABLE IF NOT EXISTS public.prescription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who prescribed
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  clinical_note_id UUID NOT NULL REFERENCES public.clinical_notes(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,

  -- What was prescribed (denormalized for fast pattern queries)
  medication_name TEXT NOT NULL,
  generic_name TEXT,
  strength TEXT,
  form TEXT,                    -- قرص، كبسولة، شراب، حقن
  dosage_count TEXT,            -- "½", "1", "2"
  frequency TEXT,               -- "1×", "2×", "3×", "4×"
  timings TEXT[] DEFAULT '{}',  -- {"صباح", "مساء"}
  instructions TEXT,            -- "قبل الأكل", "بعد الأكل"
  duration TEXT,                -- "3 أيام", "7 أيام", "مستمر"

  -- Clinical context (what complaint triggered this prescription)
  chief_complaint TEXT[] DEFAULT '{}',
  visit_type TEXT CHECK (visit_type IN ('new', 'followup', 'emergency')),

  -- Patient demographics snapshot (for age/gender pattern analysis)
  patient_age_at_visit INTEGER,
  patient_gender TEXT,

  -- Ordering context (which position in the prescription list)
  medication_order INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes for pattern queries
-- "What does Dr. X prescribe for complaint Y?"
CREATE INDEX idx_rx_events_doctor_complaint
  ON public.prescription_events (doctor_id, chief_complaint)
  USING GIN;

-- "What does Dr. X prescribe most often?"
CREATE INDEX idx_rx_events_doctor_med
  ON public.prescription_events (doctor_id, medication_name);

-- "Patterns by visit type"
CREATE INDEX idx_rx_events_doctor_visit
  ON public.prescription_events (doctor_id, visit_type);

-- "Time-based pattern analysis"
CREATE INDEX idx_rx_events_doctor_time
  ON public.prescription_events (doctor_id, created_at DESC);

-- "Patient-specific history"
CREATE INDEX idx_rx_events_patient
  ON public.prescription_events (patient_id, created_at DESC);

-- "Link back to clinical note"
CREATE INDEX idx_rx_events_note
  ON public.prescription_events (clinical_note_id);

-- 3. Row Level Security
ALTER TABLE public.prescription_events ENABLE ROW LEVEL SECURITY;

-- Doctors can only see their own prescription events
CREATE POLICY "Doctors can view own prescription events"
  ON public.prescription_events
  FOR SELECT
  USING (
    doctor_id = (
      SELECT id FROM public.doctors WHERE user_id = auth.uid()
    )
  );

-- Insert is done server-side via the API route (service role),
-- but we also allow doctor inserts for safety
CREATE POLICY "Doctors can insert own prescription events"
  ON public.prescription_events
  FOR INSERT
  WITH CHECK (
    doctor_id = (
      SELECT id FROM public.doctors WHERE user_id = auth.uid()
    )
  );

-- No UPDATE or DELETE policies — prescription events are append-only
-- This is intentional: we never modify historical prescription data

-- 4. Aggregation helper view: Doctor's top medications per complaint
CREATE OR REPLACE VIEW public.rx_doctor_patterns AS
SELECT
  doctor_id,
  medication_name,
  generic_name,
  strength,
  form,
  dosage_count,
  frequency,
  unnest(chief_complaint) AS complaint,
  COUNT(*) AS prescription_count,
  -- Most common timings (mode)
  MODE() WITHIN GROUP (ORDER BY timings::text) AS common_timings,
  MODE() WITHIN GROUP (ORDER BY instructions) AS common_instructions,
  MODE() WITHIN GROUP (ORDER BY duration) AS common_duration,
  MAX(created_at) AS last_prescribed
FROM public.prescription_events
GROUP BY
  doctor_id, medication_name, generic_name, strength, form,
  dosage_count, frequency, complaint;

-- Grant access to the view
GRANT SELECT ON public.rx_doctor_patterns TO authenticated;

-- ============================================================================
-- Phase 0 Complete: Silent logging infrastructure ready.
-- No UI changes. Data collection begins on next clinical note save.
-- ============================================================================
