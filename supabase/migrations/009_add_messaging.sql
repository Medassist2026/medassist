-- Migration 009: Add messaging system
-- Date: February 2026

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('doctor', 'patient')),
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_doctor ON public.messages(doctor_id);
CREATE INDEX IF NOT EXISTS idx_messages_patient ON public.messages(patient_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON public.messages(is_read) WHERE is_read = FALSE;

COMMENT ON TABLE public.messages IS 'Doctor-patient messaging';

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Doctors can view messages with their patients
CREATE POLICY "Doctors can view their messages"
ON public.messages FOR SELECT
USING (doctor_id = auth.uid());

-- Doctors can send messages to their patients
CREATE POLICY "Doctors can send messages"
ON public.messages FOR INSERT
WITH CHECK (doctor_id = auth.uid() AND sender_type = 'doctor');

-- Doctors can mark messages as read
CREATE POLICY "Doctors can update message read status"
ON public.messages FOR UPDATE
USING (doctor_id = auth.uid());

-- Patients can view their messages
CREATE POLICY "Patients can view their messages"
ON public.messages FOR SELECT
USING (patient_id = auth.uid());

-- Patients can send messages
CREATE POLICY "Patients can send messages"
ON public.messages FOR INSERT
WITH CHECK (patient_id = auth.uid() AND sender_type = 'patient');

-- Patients can mark messages as read
CREATE POLICY "Patients can update message read status"
ON public.messages FOR UPDATE
USING (patient_id = auth.uid());

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 'messages table created' AS status;
