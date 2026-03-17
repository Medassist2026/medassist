-- ============================================================================
-- Migration 022: Doctor Fees & Consultation Settings
-- Adds consultation and follow-up fee fields for Egyptian clinic model
-- ============================================================================

-- Add fee columns to doctors table
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS consultation_fee_egp integer DEFAULT 0;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS followup_fee_egp integer DEFAULT 0;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS followup_window_days integer DEFAULT 14;

-- Add comment for clarity
COMMENT ON COLUMN doctors.consultation_fee_egp IS 'Consultation fee (kashf) in Egyptian Pounds';
COMMENT ON COLUMN doctors.followup_fee_egp IS 'Follow-up fee in Egyptian Pounds (0 = free follow-up)';
COMMENT ON COLUMN doctors.followup_window_days IS 'Days within which a visit counts as follow-up (default 14)';
