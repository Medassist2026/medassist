-- Migration 033: Add address column to clinics table
--
-- The clinic address is displayed on prescriptions and was always collected
-- during setup, but the column was never added to the schema.
--
-- This migration is safe to run multiple times (IF NOT EXISTS guard).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'clinics'
      AND column_name  = 'address'
  ) THEN
    ALTER TABLE public.clinics
      ADD COLUMN address TEXT NOT NULL DEFAULT '';

    COMMENT ON COLUMN public.clinics.address IS
      'Street address of the clinic — printed on prescriptions';
  END IF;
END $$;
