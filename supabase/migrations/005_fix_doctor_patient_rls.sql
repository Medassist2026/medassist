-- Fix: Allow doctors to view patients from their appointments
-- Migration: 005_fix_doctor_patient_rls.sql
-- Issue: Doctors couldn't read patient data in appointments due to missing RLS policy

-- Add RLS policy to allow doctors to view patients from their appointments
CREATE POLICY "Doctors can view their appointment patients"
ON public.patients
FOR SELECT
USING (
  id IN (
    SELECT patient_id FROM public.appointments 
    WHERE doctor_id = auth.uid()
  )
);

-- Add comment explaining the policy
COMMENT ON POLICY "Doctors can view their appointment patients" ON public.patients 
IS 'Allows doctors to read patient information for patients they have appointments with';
