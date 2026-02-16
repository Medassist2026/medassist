-- Phase 6: Front Desk Module Database Schema
-- Migration: 006_front_desk_module.sql

-- ============================================================================
-- FRONT DESK STAFF PROFILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.front_desk_staff (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  unique_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_front_desk_unique_id ON public.front_desk_staff(unique_id);
CREATE INDEX idx_front_desk_clinic ON public.front_desk_staff(clinic_id);

COMMENT ON TABLE public.front_desk_staff IS 'Front desk staff members who manage check-ins, appointments, and payments';

-- ============================================================================
-- DOCTOR AVAILABILITY SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.doctor_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday, 6 = Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration_minutes INTEGER DEFAULT 15 CHECK (slot_duration_minutes > 0),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(doctor_id, day_of_week, start_time)
);

CREATE INDEX idx_doctor_availability_doctor ON public.doctor_availability(doctor_id);
CREATE INDEX idx_doctor_availability_day ON public.doctor_availability(day_of_week);

COMMENT ON TABLE public.doctor_availability IS 'Doctor working hours and availability settings';

-- ============================================================================
-- APPOINTMENT ENHANCEMENTS
-- ============================================================================

-- Add new columns to appointments table
ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS appointment_type TEXT DEFAULT 'regular' CHECK (appointment_type IN ('regular', 'followup', 'emergency', 'consultation'));

CREATE INDEX idx_appointments_checked_in ON public.appointments(checked_in_at);
CREATE INDEX idx_appointments_type ON public.appointments(appointment_type);

COMMENT ON COLUMN public.appointments.checked_in_at IS 'Timestamp when patient checked in at front desk';
COMMENT ON COLUMN public.appointments.checked_in_by IS 'Front desk staff who checked in the patient';

-- ============================================================================
-- PAYMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  clinical_note_id UUID REFERENCES public.clinical_notes(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'insurance', 'other')),
  payment_status TEXT DEFAULT 'completed' CHECK (payment_status IN ('pending', 'completed', 'refunded', 'cancelled')),
  notes TEXT,
  collected_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_patient ON public.payments(patient_id);
CREATE INDEX idx_payments_doctor ON public.payments(doctor_id);
CREATE INDEX idx_payments_appointment ON public.payments(appointment_id);
CREATE INDEX idx_payments_created ON public.payments(created_at);
CREATE INDEX idx_payments_status ON public.payments(payment_status);

COMMENT ON TABLE public.payments IS 'Payment transactions for consultations and services';

-- ============================================================================
-- CHECK-IN QUEUE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.check_in_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  queue_number INTEGER NOT NULL,
  queue_type TEXT DEFAULT 'appointment' CHECK (queue_type IN ('appointment', 'walkin', 'emergency')),
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled')),
  checked_in_at TIMESTAMPTZ DEFAULT NOW(),
  called_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_queue_doctor ON public.check_in_queue(doctor_id);
CREATE INDEX idx_queue_status ON public.check_in_queue(status);
CREATE INDEX idx_queue_created ON public.check_in_queue(created_at);

COMMENT ON TABLE public.check_in_queue IS 'Real-time queue of patients waiting to see doctors';

-- ============================================================================
-- RLS POLICIES - FRONT DESK ACCESS
-- ============================================================================

-- Front desk staff can view all patients
CREATE POLICY "Front desk can view all patients"
ON public.patients
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'frontdesk'
  )
);

-- Front desk staff can create patients
CREATE POLICY "Front desk can create patients"
ON public.patients
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'frontdesk'
  )
);

-- Front desk can view all appointments
CREATE POLICY "Front desk can view all appointments"
ON public.appointments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'frontdesk'
  )
);

-- Front desk can create/update appointments
CREATE POLICY "Front desk can manage appointments"
ON public.appointments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'frontdesk'
  )
);

-- Front desk can view payments
CREATE POLICY "Front desk can view payments"
ON public.payments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'frontdesk'
  )
);

-- Front desk can create payments
CREATE POLICY "Front desk can create payments"
ON public.payments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'frontdesk'
  )
);

-- Front desk can manage check-in queue
CREATE POLICY "Front desk can manage queue"
ON public.check_in_queue
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'frontdesk'
  )
);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to get next queue number for the day
CREATE OR REPLACE FUNCTION get_next_queue_number(p_doctor_id UUID)
RETURNS INTEGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(queue_number), 0) + 1
  INTO next_num
  FROM check_in_queue
  WHERE doctor_id = p_doctor_id
    AND DATE(created_at) = CURRENT_DATE;
  
  RETURN next_num;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_next_queue_number IS 'Generate next queue number for a doctor for the current day';

-- ============================================================================
-- SEED DATA - DEFAULT AVAILABILITY
-- ============================================================================

-- Add default 9 AM - 5 PM availability for existing doctors (Sunday to Thursday)
INSERT INTO public.doctor_availability (doctor_id, day_of_week, start_time, end_time, slot_duration_minutes)
SELECT 
  id as doctor_id,
  day_of_week,
  '09:00:00'::TIME as start_time,
  '17:00:00'::TIME as end_time,
  15 as slot_duration_minutes
FROM public.doctors
CROSS JOIN generate_series(0, 4) as day_of_week -- Sunday to Thursday
ON CONFLICT (doctor_id, day_of_week, start_time) DO NOTHING;

COMMENT ON TABLE public.doctor_availability IS 'Seeded with default 9 AM - 5 PM schedule for existing doctors';
