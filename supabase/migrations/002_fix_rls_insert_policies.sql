-- Fix for RLS policy blocking user registration
-- Run this in Supabase SQL Editor

-- Add INSERT policy for users table to allow self-registration
CREATE POLICY "Users can insert own record during registration"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Add INSERT policy for doctors table
CREATE POLICY "Doctors can insert own record during registration"
  ON public.doctors FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Add INSERT policy for patients table
CREATE POLICY "Patients can insert own record during registration"
  ON public.patients FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Verify policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('users', 'doctors', 'patients')
ORDER BY tablename, policyname;
