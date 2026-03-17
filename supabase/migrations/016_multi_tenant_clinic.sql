-- ============================================================================
-- Migration 016: Multi-Tenant Clinic Architecture
-- Adds clinic_id to clinical_notes for clinic-scoped data
-- ============================================================================

-- 1. Add clinic_id column to clinical_notes (nullable for backward compatibility)
ALTER TABLE public.clinical_notes
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

-- 2. Index for clinic-scoped queries
CREATE INDEX IF NOT EXISTS idx_clinical_notes_clinic
  ON public.clinical_notes(clinic_id);

-- 3. Composite index for doctor+clinic filtered queries
CREATE INDEX IF NOT EXISTS idx_clinical_notes_doctor_clinic
  ON public.clinical_notes(doctor_id, clinic_id);

-- 4. Backfill existing clinical_notes with the doctor's clinic
-- (For doctors with exactly one clinic, we can auto-assign)
UPDATE public.clinical_notes cn
SET clinic_id = (
  SELECT cd.clinic_id
  FROM public.clinic_doctors cd
  WHERE cd.doctor_id = cn.doctor_id
  LIMIT 1
)
WHERE cn.clinic_id IS NULL;
