-- Migration 031: Prescription templates table
--
-- Doctors can save their frequently-used medication combinations as named
-- templates and re-apply them in future sessions with one tap.

CREATE TABLE IF NOT EXISTS public.prescription_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  medications JSONB       NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast per-doctor template lookups
CREATE INDEX IF NOT EXISTS idx_prescription_templates_doctor_id
  ON public.prescription_templates(doctor_id);

-- RLS: doctors can only see and manage their own templates
ALTER TABLE public.prescription_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage their own templates"
  ON public.prescription_templates
  FOR ALL
  USING  (auth.uid() = doctor_id)
  WITH CHECK (auth.uid() = doctor_id);

COMMENT ON TABLE public.prescription_templates IS
  'Named prescription templates saved by each doctor. '
  'Medications stored as JSONB matching the MedicationEntry type.';
