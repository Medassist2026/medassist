-- Migration 034: Add invite_code column to clinics table
-- This column was referenced in code but never created via migration,
-- causing invite codes to regenerate on every page load.

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

-- Index for fast lookup when validating join requests
CREATE INDEX IF NOT EXISTS idx_clinics_invite_code ON public.clinics(invite_code);
