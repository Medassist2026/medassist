-- ============================================================================
-- Migration 029: Add note_data JSONB column to clinical_notes
--
-- The clinical-notes.ts data layer stores extended session fields (allergies,
-- chronic diseases, radiology, labs, follow-up, visit type) in a JSONB column
-- called note_data. This migration adds that column if it doesn't already exist.
-- Fully idempotent.
-- ============================================================================

-- Add note_data JSONB column to clinical_notes if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'clinical_notes'
      AND column_name  = 'note_data'
  ) THEN
    ALTER TABLE public.clinical_notes
      ADD COLUMN note_data JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Also ensure prescription_number and prescription_date columns exist
-- (referenced in clinical/prescription/route.ts GET handler)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'clinical_notes'
      AND column_name  = 'prescription_number'
  ) THEN
    ALTER TABLE public.clinical_notes
      ADD COLUMN prescription_number TEXT DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'clinical_notes'
      AND column_name  = 'prescription_date'
  ) THEN
    ALTER TABLE public.clinical_notes
      ADD COLUMN prescription_date DATE DEFAULT NULL;
  END IF;
END $$;
