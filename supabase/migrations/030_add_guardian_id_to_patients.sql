-- Migration 030: Add guardian_id FK to patients table
--
-- Problem: parent_phone is stored as a plain text string.
-- If the guardian's phone changes, the link breaks.
-- This migration adds a proper UUID FK so dependent-guardian
-- relationships have referential integrity while parent_phone
-- is kept as a human-readable fallback.
--
-- guardian_id is nullable and ON DELETE SET NULL so existing
-- records and dependents whose guardian has no patient record
-- are unaffected.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS guardian_id UUID REFERENCES public.patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_guardian_id
  ON public.patients(guardian_id)
  WHERE guardian_id IS NOT NULL;

COMMENT ON COLUMN public.patients.guardian_id IS
  'UUID FK to the guardian/parent patient record. Set when the caregiver phone '
  'matches an existing patients row at the time of dependent creation. '
  'Takes precedence over parent_phone for relational integrity; '
  'parent_phone is kept as a human-readable fallback.';
