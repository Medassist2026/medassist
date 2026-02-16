-- Add demographic fields to patients table
-- Migration: 004_add_patient_demographics.sql

-- Add new columns to patients table
ALTER TABLE public.patients 
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS age INTEGER CHECK (age >= 0 AND age <= 120),
  ADD COLUMN IF NOT EXISTS sex TEXT CHECK (sex IN ('Male', 'Female', 'Other')),
  ADD COLUMN IF NOT EXISTS parent_phone TEXT,
  ADD COLUMN IF NOT EXISTS is_dependent BOOLEAN DEFAULT FALSE;

-- Add comment explaining parent_phone usage
COMMENT ON COLUMN public.patients.parent_phone IS 'Phone number of parent for dependent patients (children)';
COMMENT ON COLUMN public.patients.is_dependent IS 'True if this is a child using parent phone number';

-- Create index for parent_phone lookups
CREATE INDEX IF NOT EXISTS idx_patients_parent_phone ON public.patients(parent_phone) WHERE parent_phone IS NOT NULL;

-- Add full_name to doctors table as well
ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS full_name TEXT;

COMMENT ON COLUMN public.doctors.full_name IS 'Doctor full name for display purposes';
