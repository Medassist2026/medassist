-- Migration 040: Invoice fields on payments + invoice_requests table
-- Adds insurance tracking and enables frontdesk to issue formal invoices

-- 1. Add insurance fields to payments
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS insurance_company       TEXT,
  ADD COLUMN IF NOT EXISTS insurance_policy_number TEXT;

-- 2. Invoice requests table — one per payment, tracks issue + SMS status
CREATE TABLE IF NOT EXISTS invoice_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id      UUID        NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  clinic_id       UUID        NOT NULL REFERENCES clinics(id)  ON DELETE CASCADE,
  invoice_number  TEXT        NOT NULL,   -- e.g. INV-2026-000042
  issued_by       UUID        REFERENCES users(id),
  sms_sent        BOOLEAN     DEFAULT FALSE,
  sms_sent_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (payment_id)  -- one invoice per payment
);

CREATE INDEX IF NOT EXISTS invoice_requests_clinic_id_idx    ON invoice_requests(clinic_id);
CREATE INDEX IF NOT EXISTS invoice_requests_payment_id_idx   ON invoice_requests(payment_id);

-- 3. Per-clinic invoice counter (ensures sequential invoice numbers)
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;

-- 4. RLS on invoice_requests
ALTER TABLE invoice_requests ENABLE ROW LEVEL SECURITY;

-- Frontdesk: full access within their clinic
CREATE POLICY "frontdesk_invoice_requests" ON invoice_requests
  FOR ALL USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_staff
      WHERE user_id = auth.uid() AND role = 'frontdesk'
    )
  );

-- Doctor: read-only for their clinic invoices
CREATE POLICY "doctor_invoice_requests_read" ON invoice_requests
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM clinic_doctors
      WHERE doctor_id = auth.uid()
    )
  );
