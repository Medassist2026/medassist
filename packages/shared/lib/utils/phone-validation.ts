/**
 * Egyptian Phone Number Validation & Formatting
 * 
 * Supports:
 * - Vodafone (010)
 * - Etisalat (011)
 * - Orange (012)
 * - WE (015)
 * 
 * Formats:
 * - Local: 01234567890 (11 digits)
 * - International: +201234567890 or 201234567890 (12 digits)
 */

export interface PhoneValidationResult {
  isValid: boolean
  normalized: string | null  // Always 12 digits: 201234567890
  formatted: string | null   // Display format: 012-3456-7890
  error: string | null
  errorAr: string | null     // Arabic error message
  carrier: string | null
}

// Egyptian mobile carrier prefixes
const EGYPT_MOBILE_PREFIXES: Record<string, string> = {
  '010': 'Vodafone',
  '011': 'Etisalat',
  '012': 'Orange',
  '015': 'WE'
}

// ============================================================================
// CLIENT-SIDE HELPERS — for forms and search inputs
// ----------------------------------------------------------------------------
// The `validateEgyptianPhone` above is the flexible server-boundary validator
// (accepts +20, 00, 12-digit, 10-digit, etc.) and returns a rich result.
//
// The helpers below are thin, UI-friendly wrappers around the same canonical
// regex so client forms stop reinventing it. Use:
//   - getEgyptianPhoneError       → strict, for forms (registration, profile)
//   - getEgyptianPhoneSearchError → lax, for search inputs (still-typing aware)
//   - normalizeEgyptianDigits     → onChange handler for tel inputs
// ============================================================================

/** Canonical regex for a local Egyptian mobile (11 digits, prefix 010/011/012/015). */
export const EGYPT_LOCAL_PHONE_RE = /^01[0125]\d{8}$/

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/**
 * Normalize a phone-input string for use in `onChange`:
 * Arabic-Indic numerals → Western, strip non-digits, cap at `maxDigits` (default 11).
 */
export function normalizeEgyptianDigits(raw: string, maxDigits = 11): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)))
    .replace(/\D/g, '')
    .slice(0, maxDigits)
}

/** True if `local` is exactly an 11-digit Egyptian mobile with a valid prefix. */
export function isValidEgyptianLocalPhone(local: string): boolean {
  return EGYPT_LOCAL_PHONE_RE.test(local)
}

/**
 * Strict form-field validator. Returns canonical Arabic error or null.
 *
 * - Empty input → null (caller decides whether the field is required).
 * - Length ≠ 11 → length error.
 * - Length 11 but wrong prefix → prefix error.
 * - Valid → null.
 */
export function getEgyptianPhoneError(local: string): string | null {
  if (!local) return null
  if (local.length !== 11) {
    return 'رقم الهاتف يجب أن يكون ١١ رقم (مثال: 01012345678)'
  }
  if (!EGYPT_LOCAL_PHONE_RE.test(local)) {
    return 'رقم هاتف مصري غير صحيح — يبدأ بـ 010 أو 011 أو 012 أو 015'
  }
  return null
}

/**
 * Lax search-input validator. Returns null while the user is still typing
 * (length < 10) so we don't yell at them mid-keystroke. Accepts 10-digit
 * input (missing leading zero) as a courtesy for paste-from-clipboard.
 */
export function getEgyptianPhoneSearchError(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 0) return null
  if (digits.length < 10) return null  // still typing — no error yet
  if (digits.length > 11) return 'رقم الهاتف طويل — يجب أن يكون ١١ رقماً'

  // Accept 11-digit local OR 10-digit (missing leading zero)
  if (digits.length === 11 && EGYPT_LOCAL_PHONE_RE.test(digits)) return null
  if (digits.length === 10 && /^(10|11|12|15)/.test(digits)) return null

  return 'رقم هاتف مصري غير صحيح — يبدأ بـ 010 أو 011 أو 012 أو 015'
}

/**
 * Validate and normalize an Egyptian phone number
 */
export function validateEgyptianPhone(phone: string): PhoneValidationResult {
  // Remove all non-digits and + sign
  let digits = phone.replace(/[^\d]/g, '')
  
  // Handle various input formats
  if (digits.startsWith('00')) {
    // International format with 00: 00201234567890
    digits = digits.substring(2)
  }
  
  // If starts with 20, it's already country code format
  if (digits.startsWith('20')) {
    // Expected: 20 + 10 digits = 12 digits
    if (digits.length !== 12) {
      return {
        isValid: false,
        normalized: null,
        formatted: null,
        error: `Invalid number: Expected 10 digits after country code, got ${digits.length - 2}`,
        errorAr: `رقم غير صحيح: يجب أن يكون 10 أرقام بعد كود الدولة`,
        carrier: null
      }
    }
  } else if (digits.startsWith('0')) {
    // Local format: 01234567890 (11 digits)
    if (digits.length !== 11) {
      return {
        isValid: false,
        normalized: null,
        formatted: null,
        error: `Invalid number: Expected 11 digits, got ${digits.length}. Example: 01234567890`,
        errorAr: `رقم غير صحيح: يجب أن يكون 11 رقم (مثال: 01234567890)`,
        carrier: null
      }
    }
    // Convert to international format
    digits = '20' + digits.substring(1)
  } else if (digits.length === 10 && ['10', '11', '12', '15'].includes(digits.substring(0, 2))) {
    // Missing leading 0: 1234567890 → 201234567890
    digits = '20' + digits
  } else {
    return {
      isValid: false,
      normalized: null,
      formatted: null,
      error: `Invalid format: Number must start with 01. Example: 01234567890`,
      errorAr: `رقم غير صحيح: يجب أن يبدأ بـ 01`,
      carrier: null
    }
  }
  
  // Now we should have 12 digits starting with 20
  if (digits.length !== 12 || !digits.startsWith('20')) {
    return {
      isValid: false,
      normalized: null,
      formatted: null,
      error: `Invalid number format`,
      errorAr: `صيغة الرقم غير صحيحة`,
      carrier: null
    }
  }
  
  // Validate prefix (get 01X format)
  const localNumber = digits.substring(2) // Remove '20'
  const prefix = '0' + localNumber.substring(0, 2) // Get 01X
  
  if (!EGYPT_MOBILE_PREFIXES[prefix]) {
    const validPrefixes = Object.keys(EGYPT_MOBILE_PREFIXES).join(', ')
    return {
      isValid: false,
      normalized: null,
      formatted: null,
      error: `Invalid prefix: ${prefix}. Valid prefixes: ${validPrefixes}`,
      errorAr: `بادئة غير صحيحة: ${prefix}. البوادئ المتاحة: ${validPrefixes}`,
      carrier: null
    }
  }
  
  // Success
  return {
    isValid: true,
    normalized: digits,
    formatted: formatPhoneForDisplay(digits),
    error: null,
    errorAr: null,
    carrier: EGYPT_MOBILE_PREFIXES[prefix]
  }
}

/**
 * Normalize phone number (simple version, returns normalized or null)
 */
export function normalizePhone(phone: string): string | null {
  const result = validateEgyptianPhone(phone)
  return result.normalized
}

/**
 * Format normalized phone for display: 201234567890 → 012-3456-7890
 */
export function formatPhoneForDisplay(normalized: string): string {
  if (!normalized || normalized.length !== 12) {
    return normalized || ''
  }
  
  // 201234567890 → 012-3456-7890
  const local = '0' + normalized.substring(2)
  return `${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`
}

/**
 * Format phone for read-back with spaces: 201234567890 → 012 3456 7890
 */
export function formatPhoneForReadBack(normalized: string): string {
  if (!normalized || normalized.length !== 12) {
    return normalized || ''
  }
  
  const local = '0' + normalized.substring(2)
  return `${local.slice(0, 3)} ${local.slice(3, 7)} ${local.slice(7)}`
}

/**
 * Arabic number words for read-back
 */
const ARABIC_NUMBERS: Record<string, string> = {
  '0': 'صفر',
  '1': 'واحد',
  '2': 'اتنين',
  '3': 'تلاتة',
  '4': 'اربعة',
  '5': 'خمسة',
  '6': 'ستة',
  '7': 'سبعة',
  '8': 'تمانية',
  '9': 'تسعة'
}

/**
 * Convert phone to Arabic read-back format
 * Returns array of groups for display
 */
export function phoneToArabicReadBack(normalized: string): string[] {
  if (!normalized || normalized.length !== 12) {
    return []
  }
  
  const local = '0' + normalized.substring(2)
  
  // Split into groups: 012 - 3456 - 7890
  const groups = [
    local.slice(0, 3),
    local.slice(3, 7),
    local.slice(7)
  ]
  
  return groups.map(group => 
    group.split('').map(d => ARABIC_NUMBERS[d] || d).join(' ')
  )
}

/**
 * Check if two phone numbers are the same (after normalization)
 */
export function phonesMatch(phone1: string, phone2: string): boolean {
  const norm1 = normalizePhone(phone1)
  const norm2 = normalizePhone(phone2)
  
  if (!norm1 || !norm2) {
    return false
  }
  
  return norm1 === norm2
}

/**
 * Mask phone for display: 201234567890 → 012-****-7890
 */
export function maskPhone(normalized: string): string {
  if (!normalized || normalized.length !== 12) {
    return '***-****-****'
  }
  
  const local = '0' + normalized.substring(2)
  return `${local.slice(0, 3)}-****-${local.slice(7)}`
}

/**
 * Get carrier name from normalized phone
 */
export function getCarrier(normalized: string): string | null {
  if (!normalized || normalized.length !== 12) {
    return null
  }
  
  const prefix = '0' + normalized.substring(2, 4)
  return EGYPT_MOBILE_PREFIXES[prefix] || null
}
