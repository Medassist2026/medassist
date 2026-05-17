/**
 * E.164 phone normalization for Egyptian mobiles — global identity layer.
 *
 * This file is the canonical source of truth for the E.164-form normalizer
 * used by `global_patients.normalized_phone`. It exists alongside the
 * older `phone-validation.ts::normalizePhone` (which returns the
 * 12-digit `201XXXXXXXXX` form, no leading `+`) — that older function is
 * still used widely across the app and is NOT changed by this rollout.
 *
 * The two helpers are deliberately separated:
 *   - phone-validation.ts::normalizePhone  → "201234567890"     (legacy app code)
 *   - phone-normalize.ts::normalizeEgyptianPhone → "+201234567890" (E.164,
 *     used by global_patients.normalized_phone column and the matching
 *     plpgsql function `public.normalize_phone_e164` in mig 071).
 *
 * K-2d (2026-05-15, Finding I-17) — phone storage convention is now
 * explicit and uniform across the codebase:
 *
 *   APPLICATION SCHEMA (public.*):
 *     - users.phone                          → "+201XXXXXXXXX" (+E.164)
 *     - global_patients.normalized_phone     → "+201XXXXXXXXX" (+E.164)
 *     - patients.phone                       → "+201XXXXXXXXX" (+E.164)
 *     - all other public.* phone columns     → "+201XXXXXXXXX" (+E.164)
 *
 *   AUTH SCHEMA (Supabase Auth, immutable convention):
 *     - auth.users.phone                     → "201XXXXXXXXX" (NO leading '+')
 *       Supabase strips the '+' before storing; reads return the bare
 *       12-digit form. Mig 089 (Build 04 D7) normalized 29 pre-existing
 *       auth.users.phone rows to match this convention.
 *
 *   CROSS-SCHEMA BRIDGE:
 *     - Writing to auth.users.phone: pass +E.164; Supabase strips '+'.
 *     - Reading auth.users.phone and comparing with public.*: use
 *       `stripPlusForAuthUsers()` on the public side OR prepend '+' to
 *       the auth side. The former is preferred (single direction of
 *       conversion, matches the auth.* convention's stripped form).
 *
 * Keep this function and the SQL `public.normalize_phone_e164` in
 * supabase/migrations/071_normalize_patient_phone.sql byte-for-byte
 * equivalent on the inputs they accept and the outputs they produce.
 *
 * Accepts:
 *   - "01012345678"          (11-digit local form)
 *   - "0101 234 5678"        (with spaces)
 *   - "010-1234-5678"        (with dashes)
 *   - "+201012345678"        (already E.164)
 *   - "201012345678"         (digit-only, with country code)
 *   - "00201012345678"       (international 00-prefix form)
 *   - "+20 101 234 5678"     (E.164 with separators)
 *   - Arabic-Indic numerals (٠-٩) are converted before parsing.
 *
 * Rejects (returns null):
 *   - empty / null / undefined / non-string
 *   - non-Egyptian country code
 *   - wrong length after normalization
 *   - invalid Egyptian mobile prefix (must be 010, 011, 012, or 015)
 *   - any non-numeric remnant after stripping whitespace, dashes, dots,
 *     parens, plus sign, and Arabic-Indic numerals
 */

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/** Egyptian mobile carrier prefixes (after the country code). */
const VALID_EGYPT_MOBILE_PREFIXES = new Set(['10', '11', '12', '15'])

/**
 * Normalize an Egyptian phone number to canonical E.164 form.
 *
 * @returns "+201XXXXXXXXX" on success, or `null` if the input cannot be
 *          mapped to a valid Egyptian mobile.
 */
export function normalizeEgyptianPhone(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null
  if (typeof input !== 'string') return null

  // Convert Arabic-Indic numerals to Western.
  const western = input.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)))

  // Strip permitted formatting characters: spaces, dashes, dots, parens.
  // Keep digits and a single optional leading '+'.
  const cleaned = western.replace(/[\s\-.()]/g, '')

  if (cleaned.length === 0) return null

  // Reject anything that contains a non-digit character other than a
  // single leading '+'.
  const hasLeadingPlus = cleaned.startsWith('+')
  const digitsPart = hasLeadingPlus ? cleaned.slice(1) : cleaned

  if (!/^\d+$/.test(digitsPart)) return null

  // Now we have only digits in `digitsPart`. Reduce to the
  // 12-digit "201XXXXXXXXX" form.
  let twelveDigit: string

  if (digitsPart.startsWith('00')) {
    // International 00-prefix form: strip the 00 and treat the rest as
    // a country-code-prefixed number. We require 20 to follow.
    const afterZeros = digitsPart.slice(2)
    if (!afterZeros.startsWith('20')) return null
    if (afterZeros.length !== 12) return null
    twelveDigit = afterZeros
  } else if (digitsPart.startsWith('20')) {
    // Already country-code-prefixed.
    if (digitsPart.length !== 12) return null
    twelveDigit = digitsPart
  } else if (digitsPart.startsWith('0')) {
    // Local form: 01XXXXXXXXX (11 digits).
    if (digitsPart.length !== 11) return null
    // Must start with 01.
    if (!digitsPart.startsWith('01')) return null
    twelveDigit = '20' + digitsPart.slice(1)
  } else if (digitsPart.length === 10) {
    // Missing leading zero: "1012345678" → assume Egyptian mobile if
    // prefix is one of 10/11/12/15.
    const prefix2 = digitsPart.slice(0, 2)
    if (!VALID_EGYPT_MOBILE_PREFIXES.has(prefix2)) return null
    twelveDigit = '20' + digitsPart
  } else {
    return null
  }

  // Sanity: must be exactly 12 digits starting with 20.
  if (twelveDigit.length !== 12) return null
  if (!twelveDigit.startsWith('20')) return null

  // Validate Egyptian mobile prefix.
  const mobilePrefix = twelveDigit.slice(2, 4)
  if (!VALID_EGYPT_MOBILE_PREFIXES.has(mobilePrefix)) return null

  return '+' + twelveDigit
}

/**
 * Test whether a string is a valid E.164 Egyptian mobile.
 * Convenience wrapper around `normalizeEgyptianPhone`.
 */
export function isValidEgyptianE164(input: string | null | undefined): boolean {
  return normalizeEgyptianPhone(input) !== null
}

/**
 * Cross-schema bridge: convert a public-schema phone (+E.164) into the
 * `auth.users.phone` storage format (no leading '+'). Use when a caller
 * needs to look up an auth row by phone given a public-schema value.
 *
 * Example:
 *   const publicPhone = '+201500099999'                    // public.users.phone shape
 *   const authPhone = stripPlusForAuthUsers(publicPhone)   // '201500099999'
 *   const { data } = await admin.auth.admin.listUsers({ ... })  // filter by phone === authPhone
 *
 * For writes to `auth.users.phone` (via `auth.admin.createUser` or
 * `auth.admin.updateUserById`), Supabase strips the '+' on insert, so
 * passing the +E.164 form directly works fine and does NOT need this
 * helper. The helper exists only for the read-side comparison case.
 *
 * Returns the input unchanged if it does not start with '+' — defensive
 * against double-stripping.
 *
 * K-2d (2026-05-15, Finding I-17).
 */
export function stripPlusForAuthUsers(publicPhone: string): string {
  return publicPhone.startsWith('+') ? publicPhone.slice(1) : publicPhone
}
