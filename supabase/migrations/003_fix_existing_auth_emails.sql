-- Fix existing accounts that are missing email in auth.users
-- Run this in Supabase SQL Editor

-- Update the doctor account's email in auth.users
UPDATE auth.users 
SET 
  email = 'doctor@test.com',
  email_confirmed_at = NOW(),
  updated_at = NOW()
WHERE phone = '+201234567890';

-- Verify the update
SELECT id, email, phone, email_confirmed_at 
FROM auth.users 
WHERE phone = '+201234567890';

-- If you also created a patient account, update it too:
-- UPDATE auth.users 
-- SET 
--   email = 'patient@test.com',
--   email_confirmed_at = NOW(),
--   updated_at = NOW()
-- WHERE phone = '+209876543210';
