-- ============================================================================
-- Migration 044: Add 'transfer' to payment_method constraint
--
-- Problem: The TypeScript PaymentMethod type in packages/shared/lib/data/frontdesk.ts
-- includes 'transfer' as a valid value, but the DB CHECK constraint on
-- payments.payment_method was defined in migration 006 as:
--   CHECK (payment_method IN ('cash', 'card', 'insurance', 'other'))
--
-- This mismatch causes INSERT failures when frontdesk selects 'transfer'
-- as a payment method (bank transfer — common in Egyptian clinics).
--
-- Fix: Drop the old constraint and add a new one that includes 'transfer'.
-- ============================================================================

-- Drop the old constraint (name may vary, try both forms)
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_payment_method_check;

-- Add updated constraint with 'transfer' included
ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('cash', 'card', 'insurance', 'transfer', 'other'));

-- ============================================================================
-- Also align the invoice_requests / payment log display:
-- Add a comment documenting the payment methods for future reference.
-- ============================================================================

COMMENT ON COLUMN public.payments.payment_method IS
  'Payment method: cash (نقد) | card (بطاقة) | insurance (تأمين) | transfer (تحويل) | other (أخرى)';
