-- ============================================================================
-- Migration 025: Add appointment reason + notifications table
-- ============================================================================

-- 1. Add reason/description field to appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT NULL;

COMMENT ON COLUMN public.appointments.reason IS 'Visit reason / description shown on patient queue cards (e.g. متابعة ضغط)';

-- 2. Add notes field to appointments (was being sent by API but column didn't exist)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- 3. Expand appointment_type CHECK to include 'procedure'
-- Drop old check and add new one
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_appointment_type_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_appointment_type_check
  CHECK (appointment_type IN ('regular', 'followup', 'emergency', 'consultation', 'procedure'));

-- 4. Expand status CHECK to include all statuses used by API
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'in_progress'));

-- ============================================================================
-- NOTIFICATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Who receives this notification
  recipient_id UUID NOT NULL,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('doctor', 'frontdesk', 'patient')),

  -- Notification content
  type TEXT NOT NULL CHECK (type IN (
    'patient_arrived',       -- Front desk checked in patient → doctor
    'appointment_booked',    -- New appointment created → doctor
    'appointment_cancelled', -- Patient/frontdesk cancelled → doctor
    'emergency_added',       -- Emergency patient added to queue → doctor
    'session_completed',     -- Doctor completed session → frontdesk
    'queue_update',          -- Queue position changed → patient
    'appointment_reminder',  -- Upcoming appointment (30min before) → doctor, patient
    'daily_summary',         -- Morning briefing → doctor
    'message_received',      -- New message → doctor, patient
    'invite_accepted'        -- Front desk accepted invite → doctor
  )),

  title TEXT NOT NULL,
  body TEXT,

  -- Optional references
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,

  -- State
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON public.notifications(recipient_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_clinic
  ON public.notifications(clinic_id, created_at DESC);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

-- Users can update (mark read) their own notifications
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid());

-- Service role can insert (from API routes)
CREATE POLICY notifications_insert_service ON public.notifications
  FOR INSERT WITH CHECK (true);
