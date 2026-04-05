-- ============================================================================
-- Migration 036: Enable RLS on doctor_availability + add policies
--
-- Root cause: doctor_availability was created in migration 006 but RLS was
-- never enabled on it, causing inconsistent access behavior and blocking
-- the POST /api/doctor/availability endpoint for the authenticated role.
--
-- Fix:
--   1. Enable RLS on doctor_availability
--   2. Doctor: full control over their own rows
--   3. Frontdesk: read-only (for appointment slot display)
--   4. Patient app: read-only (for booking interface)
-- ============================================================================

-- Step 1: Enable RLS
ALTER TABLE public.doctor_availability ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop any existing policies (idempotent re-run safety)
DROP POLICY IF EXISTS "Doctors can view their own availability" ON public.doctor_availability;
DROP POLICY IF EXISTS "Doctors can insert their own availability" ON public.doctor_availability;
DROP POLICY IF EXISTS "Doctors can update their own availability" ON public.doctor_availability;
DROP POLICY IF EXISTS "Doctors can delete their own availability" ON public.doctor_availability;
DROP POLICY IF EXISTS "Frontdesk can view doctor availability" ON public.doctor_availability;
DROP POLICY IF EXISTS "Patients can view doctor availability" ON public.doctor_availability;

-- Step 3: Doctor — full CRUD on their own rows
CREATE POLICY "Doctors can view their own availability"
  ON public.doctor_availability
  FOR SELECT
  TO authenticated
  USING (doctor_id = auth.uid());

CREATE POLICY "Doctors can insert their own availability"
  ON public.doctor_availability
  FOR INSERT
  TO authenticated
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Doctors can update their own availability"
  ON public.doctor_availability
  FOR UPDATE
  TO authenticated
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Doctors can delete their own availability"
  ON public.doctor_availability
  FOR DELETE
  TO authenticated
  USING (doctor_id = auth.uid());

-- Step 4: Frontdesk — read-only (needed for appointment slot display)
-- Frontdesk users are identified by their role in the users table
CREATE POLICY "Frontdesk can view doctor availability"
  ON public.doctor_availability
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'frontdesk'
    )
  );

-- Step 5: Patient app anon/authenticated — read-only (for booking interface)
CREATE POLICY "Patients can view doctor availability"
  ON public.doctor_availability
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'patient'
    )
  );
