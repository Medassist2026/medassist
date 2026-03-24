-- ============================================================================
-- Migration 028: Ensure appointment columns exist
--
-- Migration 025 added reason/notes/appointment_type but may not have been
-- applied to all environments. This migration is fully idempotent.
-- ============================================================================

-- reason: appointment description shown on queue cards
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reason TEXT;

COMMENT ON COLUMN public.appointments.reason IS
  'Visit reason / chief complaint shown on patient queue cards';

-- notes: doctor-side notes on the appointment
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN public.appointments.notes IS
  'Internal notes on the appointment (not shown to patient)';

-- appointment_type: was added in migration 006 but guard here for safety
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS appointment_type TEXT DEFAULT 'regular';

-- Ensure the check constraint is up to date (drop old, add new)
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_appointment_type_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_appointment_type_check
  CHECK (appointment_type IN ('regular', 'followup', 'emergency', 'consultation', 'walkin'));

-- Ensure status constraint includes all required values
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show', 'in_progress'));
