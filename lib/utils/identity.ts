/**
 * Patient Identity Utilities
 * 
 * Handles:
 * - National ID hashing (privacy-safe storage)
 * - Recovery code generation
 * - OTP generation
 */

import crypto from 'crypto'
import { nanoid } from 'nanoid'

// ============================================================================
// NATIONAL ID HANDLING
// ============================================================================

/**
 * Egyptian National ID format:
 * - 14 digits
 * - Format: CYYYMMDDGGSSSC
 *   - C: Century (2 = 1900s, 3 = 2000s)
 *   - YYMMDD: Birth date
 *   - GG: Governorate code
 *   - SSS: Sequence number
 *   - C: Check digit
 */

export interface NationalIdValidationResult {
  isValid: boolean
  error: string | null
  errorAr: string | null
  birthDate: Date | null
  governorate: string | null
}

// Egyptian governorate codes
const GOVERNORATE_CODES: Record<string, string> = {
  '01': 'Cairo',
  '02': 'Alexandria',
  '03': 'Port Said',
  '04': 'Suez',
  '11': 'Damietta',
  '12': 'Dakahlia',
  '13': 'Sharqia',
  '14': 'Qalyubia',
  '15': 'Kafr El Sheikh',
  '16': 'Gharbia',
  '17': 'Monufia',
  '18': 'Beheira',
  '19': 'Ismailia',
  '21': 'Giza',
  '22': 'Beni Suef',
  '23': 'Fayoum',
  '24': 'Minya',
  '25': 'Asyut',
  '26': 'Sohag',
  '27': 'Qena',
  '28': 'Aswan',
  '29': 'Luxor',
  '31': 'Red Sea',
  '32': 'New Valley',
  '33': 'Matrouh',
  '34': 'North Sinai',
  '35': 'South Sinai',
  '88': 'Foreign'
}

/**
 * Validate Egyptian National ID format
 */
export function validateNationalId(nationalId: string): NationalIdValidationResult {
  // Remove any spaces or dashes
  const cleaned = nationalId.replace(/[\s-]/g, '')
  
  // Check length
  if (cleaned.length !== 14) {
    return {
      isValid: false,
      error: `National ID must be 14 digits, got ${cleaned.length}`,
      errorAr: `الرقم القومي يجب أن يكون 14 رقم`,
      birthDate: null,
      governorate: null
    }
  }
  
  // Check all digits
  if (!/^\d{14}$/.test(cleaned)) {
    return {
      isValid: false,
      error: 'National ID must contain only digits',
      errorAr: 'الرقم القومي يجب أن يحتوي على أرقام فقط',
      birthDate: null,
      governorate: null
    }
  }
  
  // Extract components
  const century = cleaned[0]
  const year = cleaned.substring(1, 3)
  const month = cleaned.substring(3, 5)
  const day = cleaned.substring(5, 7)
  const governorateCode = cleaned.substring(7, 9)
  
  // Validate century
  if (!['2', '3'].includes(century)) {
    return {
      isValid: false,
      error: 'Invalid century digit (must be 2 or 3)',
      errorAr: 'رقم القرن غير صحيح',
      birthDate: null,
      governorate: null
    }
  }
  
  // Calculate full year
  const fullYear = (century === '2' ? 1900 : 2000) + parseInt(year)
  
  // Validate date
  const monthNum = parseInt(month)
  const dayNum = parseInt(day)
  
  if (monthNum < 1 || monthNum > 12) {
    return {
      isValid: false,
      error: 'Invalid month in birth date',
      errorAr: 'شهر الميلاد غير صحيح',
      birthDate: null,
      governorate: null
    }
  }
  
  if (dayNum < 1 || dayNum > 31) {
    return {
      isValid: false,
      error: 'Invalid day in birth date',
      errorAr: 'يوم الميلاد غير صحيح',
      birthDate: null,
      governorate: null
    }
  }
  
  const birthDate = new Date(fullYear, monthNum - 1, dayNum)
  
  // Check if date is valid (handles invalid dates like Feb 30)
  if (birthDate.getMonth() !== monthNum - 1 || birthDate.getDate() !== dayNum) {
    return {
      isValid: false,
      error: 'Invalid birth date',
      errorAr: 'تاريخ الميلاد غير صحيح',
      birthDate: null,
      governorate: null
    }
  }
  
  // Check if birth date is not in the future
  if (birthDate > new Date()) {
    return {
      isValid: false,
      error: 'Birth date cannot be in the future',
      errorAr: 'تاريخ الميلاد لا يمكن أن يكون في المستقبل',
      birthDate: null,
      governorate: null
    }
  }
  
  // Validate governorate
  const governorate = GOVERNORATE_CODES[governorateCode]
  if (!governorate) {
    return {
      isValid: false,
      error: `Invalid governorate code: ${governorateCode}`,
      errorAr: `كود المحافظة غير صحيح: ${governorateCode}`,
      birthDate: null,
      governorate: null
    }
  }
  
  return {
    isValid: true,
    error: null,
    errorAr: null,
    birthDate,
    governorate
  }
}

/**
 * Hash National ID for secure storage
 * Uses SHA-256 with a salt
 */
export function hashNationalId(nationalId: string): string {
  const salt = process.env.NATIONAL_ID_SALT || 'medassist-default-salt-change-in-production'
  const cleaned = nationalId.replace(/[\s-]/g, '')
  
  return crypto
    .createHash('sha256')
    .update(cleaned + salt)
    .digest('hex')
}

/**
 * Verify National ID against stored hash
 */
export function verifyNationalId(input: string, storedHash: string): boolean {
  const inputHash = hashNationalId(input)
  return crypto.timingSafeEqual(
    Buffer.from(inputHash, 'hex'),
    Buffer.from(storedHash, 'hex')
  )
}

/**
 * Extract last 4 digits of National ID (for display during verification)
 */
export function getNationalIdLast4(nationalId: string): string {
  const cleaned = nationalId.replace(/[\s-]/g, '')
  return cleaned.slice(-4)
}


// ============================================================================
// RECOVERY CODES
// ============================================================================

/**
 * Generate recovery codes for account access
 * Returns array of 8 codes in format: XXXX-XXXX-XXXX
 */
export function generateRecoveryCodes(count: number = 8): string[] {
  const codes: string[] = []
  
  for (let i = 0; i < count; i++) {
    // Generate 3 groups of 4 characters
    const part1 = nanoid(4).toUpperCase()
    const part2 = nanoid(4).toUpperCase()
    const part3 = nanoid(4).toUpperCase()
    
    codes.push(`${part1}-${part2}-${part3}`)
  }
  
  return codes
}

/**
 * Hash recovery code for storage
 */
export function hashRecoveryCode(code: string): string {
  // Normalize: remove dashes and convert to uppercase
  const normalized = code.replace(/-/g, '').toUpperCase()
  
  return crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex')
}

/**
 * Verify recovery code against stored hash
 */
export function verifyRecoveryCode(input: string, storedHash: string): boolean {
  const inputHash = hashRecoveryCode(input)
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(inputHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    )
  } catch {
    return false
  }
}


// ============================================================================
// OTP GENERATION
// ============================================================================

/**
 * Generate a 6-digit OTP code
 */
export function generateOTP(): string {
  // Generate cryptographically secure random number
  const randomBytes = crypto.randomBytes(3)
  const num = randomBytes.readUIntBE(0, 3) % 1000000
  
  // Pad with leading zeros to ensure 6 digits
  return num.toString().padStart(6, '0')
}

/**
 * Hash OTP for storage
 */
export function hashOTP(otp: string): string {
  return crypto
    .createHash('sha256')
    .update(otp)
    .digest('hex')
}

/**
 * Verify OTP against stored hash
 */
export function verifyOTP(input: string, storedHash: string): boolean {
  const inputHash = hashOTP(input)
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(inputHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    )
  } catch {
    return false
  }
}


// ============================================================================
// DORMANCY DETECTION
// ============================================================================

/**
 * Check if an account is dormant (6+ months inactive)
 */
export function isAccountDormant(lastActivity: Date | string): boolean {
  const lastActivityDate = typeof lastActivity === 'string' 
    ? new Date(lastActivity) 
    : lastActivity
  
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  
  return lastActivityDate < sixMonthsAgo
}

/**
 * Calculate dormancy period in human-readable format
 */
export function getDormancyPeriod(lastActivity: Date | string): string {
  const lastActivityDate = typeof lastActivity === 'string' 
    ? new Date(lastActivity) 
    : lastActivity
  
  const now = new Date()
  const diffMs = now.getTime() - lastActivityDate.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays < 30) {
    return `${diffDays} days`
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `${months} month${months > 1 ? 's' : ''}`
  } else {
    const years = Math.floor(diffDays / 365)
    return `${years} year${years > 1 ? 's' : ''}`
  }
}
