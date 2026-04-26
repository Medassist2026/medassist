import { createAdminClient } from '@shared/lib/supabase/admin'
import crypto from 'crypto'

/**
 * Generate a 4-digit OTP code
 */
export function generateOTPCode(): string {
  return crypto.randomInt(1000, 10000).toString()
}

/**
 * Hash an OTP code for secure storage
 */
export function hashOTP(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

/**
 * Store OTP in database.
 * Handles both old schema (patient_id required) and new schema (phone-based).
 */
export async function createOTP(
  phone: string,
  purpose: 'registration' | 'login' | 'password_reset' | 'phone_change_old' | 'phone_change_new' | 'phone_correction'
): Promise<string> {
  const admin = createAdminClient('otp-create')
  const code = generateOTPCode()
  const codeHash = hashOTP(code)
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  // Invalidate existing unused OTPs for this phone + purpose
  // Use .match() to only filter on columns that exist
  try {
    await admin
      .from('otp_codes')
      .update({ used: true, consumed_at: now })
      .eq('phone', phone)
      .eq('purpose', purpose)
      .eq('used', false)
  } catch (invalidateErr) {
    // If 'phone' or 'used' columns don't exist, this will fail silently
    console.warn('[OTP] Could not invalidate old OTPs (columns may not exist):', invalidateErr)
  }

  // Try inserting with full schema (migration 024 applied)
  const { error: insertError } = await admin
    .from('otp_codes')
    .insert({
      phone,
      code_hash: codeHash,
      otp_hash: codeHash,
      purpose,
      expires_at: expiresAt,
      used: false,
      attempts: 0,
      max_attempts: 5,
      created_at: now,
    })

  if (insertError) {
    console.error('[OTP] Insert failed with full schema:', insertError.message)

    // Fallback: try minimal insert (old schema — needs patient_id)
    // This won't work for registration (no patient yet), but log it clearly
    console.error('[OTP] This likely means migration 024_fix_otp_codes_for_registration.sql has not been applied.')
    console.error('[OTP] Please run the migration in Supabase SQL Editor.')
    throw new Error(`فشل في إنشاء رمز التحقق: ${insertError.message}`)
  }

  console.log(`[OTP] Created OTP for ${phone} (purpose: ${purpose})`)
  return code
}

/**
 * Verify an OTP code
 */
export async function verifyOTP(
  phone: string,
  code: string,
  purpose: 'registration' | 'login' | 'password_reset' | 'phone_change_old' | 'phone_change_new' | 'phone_correction'
): Promise<{ valid: boolean; error?: string }> {
  // Bypass OTP verification when Twilio is not configured
  // This allows registration to work before SMS provider is set up
  if (process.env.DEV_BYPASS_OTP === 'true') {
    console.log(`[OTP] BYPASS — accepting any code for ${phone} (purpose: ${purpose})`)
    return { valid: true }
  }

  const admin = createAdminClient('otp-verify')
  const codeHash = hashOTP(code)

  // Find matching OTP
  const { data: otpRecord, error: fetchError } = await admin
    .from('otp_codes')
    .select('*')
    .eq('phone', phone)
    .eq('purpose', purpose)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fetchError) {
    console.error('[OTP] Verify fetch error:', fetchError.message)
    return { valid: false, error: 'خطأ في التحقق من الرمز' }
  }

  if (!otpRecord) {
    return { valid: false, error: 'رمز التحقق غير صحيح' }
  }

  // Check expiry
  if (new Date(otpRecord.expires_at!) < new Date()) {
    return { valid: false, error: 'انتهت صلاحية رمز التحقق' }
  }

  // Check max attempts
  if ((otpRecord.attempts || 0) >= (otpRecord.max_attempts || 5)) {
    return { valid: false, error: 'تم تجاوز عدد المحاولات المسموحة' }
  }

  // Increment attempts
  await admin
    .from('otp_codes')
    .update({ attempts: (otpRecord.attempts || 0) + 1 })
    .eq('id', otpRecord.id)

  // Verify hash — check both code_hash and otp_hash for compatibility
  const hashMatch =
    otpRecord.code_hash === codeHash || otpRecord.otp_hash === codeHash

  if (!hashMatch) {
    return { valid: false, error: 'رمز التحقق غير صحيح' }
  }

  // Mark as used
  await admin
    .from('otp_codes')
    .update({
      used: true,
      consumed_at: new Date().toISOString(),
      used_at: new Date().toISOString(),
    })
    .eq('id', otpRecord.id)

  return { valid: true }
}
