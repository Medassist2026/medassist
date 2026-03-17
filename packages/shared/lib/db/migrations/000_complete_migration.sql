-- ============================================================
-- MedAssist Complete Migration Script
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================
-- NOTE: lab_results, lab_orders, lab_tests tables already exist.
-- This migration only creates NEW tables that don't exist yet.
-- ============================================================

-- ============================================================
-- 1. PRESCRIPTION ITEMS TABLE (Phase C2)
-- ============================================================
CREATE TABLE IF NOT EXISTS prescription_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinical_note_id UUID NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),
  doctor_id UUID NOT NULL REFERENCES doctors(id),
  clinic_id UUID REFERENCES clinics(id),
  drug_name TEXT NOT NULL,
  drug_brand_name TEXT,
  drug_brand_name_ar TEXT,
  generic_name TEXT,
  drug_id TEXT,
  strength TEXT,
  form TEXT,
  frequency TEXT NOT NULL,
  duration TEXT NOT NULL,
  quantity INTEGER,
  instructions TEXT,
  status TEXT DEFAULT 'prescribed' CHECK (status IN ('prescribed', 'dispensed', 'cancelled')),
  prescribed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescription_items_patient ON prescription_items(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_doctor ON prescription_items(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_clinic ON prescription_items(clinic_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_note ON prescription_items(clinical_note_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_drug ON prescription_items(drug_name);
CREATE INDEX IF NOT EXISTS idx_prescription_items_status ON prescription_items(status);
CREATE INDEX IF NOT EXISTS idx_prescription_items_prescribed_at ON prescription_items(prescribed_at DESC);

ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doctors_own_prescriptions" ON prescription_items;
CREATE POLICY "doctors_own_prescriptions" ON prescription_items
  FOR SELECT USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS "doctors_insert_prescriptions" ON prescription_items;
CREATE POLICY "doctors_insert_prescriptions" ON prescription_items
  FOR INSERT WITH CHECK (doctor_id = auth.uid());

DROP POLICY IF EXISTS "patients_own_prescriptions" ON prescription_items;
CREATE POLICY "patients_own_prescriptions" ON prescription_items
  FOR SELECT USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "service_role_full_access_prescriptions" ON prescription_items;
CREATE POLICY "service_role_full_access_prescriptions" ON prescription_items
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 2. AUDIT LOG TABLE (Phase D2)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  user_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_audit_log" ON audit_log;
CREATE POLICY "service_role_audit_log" ON audit_log
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 3. SMS REMINDERS TABLE (New)
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id),
  appointment_id UUID REFERENCES appointments(id),
  clinic_id UUID REFERENCES clinics(id),
  phone_number TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('appointment_reminder', 'followup', 'lab_ready', 'custom')),
  message_body TEXT NOT NULL,
  message_body_ar TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  twilio_sid TEXT,
  error_message TEXT,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_reminders_patient ON sms_reminders(patient_id);
CREATE INDEX IF NOT EXISTS idx_sms_reminders_status ON sms_reminders(status);
CREATE INDEX IF NOT EXISTS idx_sms_reminders_scheduled ON sms_reminders(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_sms_reminders_appointment ON sms_reminders(appointment_id);
CREATE INDEX IF NOT EXISTS idx_sms_reminders_type ON sms_reminders(message_type);

ALTER TABLE sms_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_sms" ON sms_reminders;
CREATE POLICY "service_role_sms" ON sms_reminders
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 4. REALTIME SUBSCRIPTIONS (for queue updates)
-- ============================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- DONE! 3 new tables created:
--   - prescription_items (normalized Rx data)
--   - audit_log (compliance logging)
--   - sms_reminders (Twilio integration)
-- Plus realtime enabled on appointments.
-- ============================================================
