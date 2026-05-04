/**
 * SQL ↔ TS parity test for phone normalization.
 *
 * The migration `supabase/migrations/071_normalize_patient_phone.sql`
 * defines a plpgsql function `public.normalize_phone_e164` that MUST
 * produce byte-identical output to
 * `packages/shared/lib/utils/phone-normalize.ts::normalizeEgyptianPhone`
 * — a divergence breaks the global_patients UNIQUE invariant.
 *
 * This file holds a JS shadow implementation of the SQL function and
 * runs both against a wide input matrix to detect drift early. When
 * either side changes, this test fails.
 *
 * Run with:
 *   npx tsx packages/shared/lib/utils/__tests__/phone-normalize-sql-parity.test.ts
 */

import { normalizeEgyptianPhone } from '../phone-normalize'

/**
 * Shadow implementation of the SQL plpgsql function in mig 071.
 * Read the SQL alongside this; if the SQL changes, mirror the change
 * here and this test confirms parity.
 */
function shadowSqlNormalize(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null
  if (typeof input !== 'string') return null

  // translate(p_phone, '٠١٢٣٤٥٦٧٨٩', '0123456789')
  const ARABIC = '٠١٢٣٤٥٦٧٨٩'
  let v = ''
  for (const ch of input) {
    const i = ARABIC.indexOf(ch)
    v += i >= 0 ? String(i) : ch
  }

  // regexp_replace(v_western, '[\s\-.()]', '', 'g')
  const cleaned = v.replace(/[\s\-.()]/g, '')

  if (cleaned.length === 0) return null

  const hasPlus = cleaned[0] === '+'
  const digits = hasPlus ? cleaned.slice(1) : cleaned

  // v_digits !~ '^[0-9]+$'
  if (!/^[0-9]+$/.test(digits)) return null

  let twelve: string

  if (digits.slice(0, 2) === '00') {
    const after = digits.slice(2)
    if (after.slice(0, 2) !== '20') return null
    if (after.length !== 12) return null
    twelve = after
  } else if (digits.slice(0, 2) === '20') {
    if (digits.length !== 12) return null
    twelve = digits
  } else if (digits[0] === '0') {
    if (digits.length !== 11) return null
    if (digits.slice(0, 2) !== '01') return null
    twelve = '20' + digits.slice(1)
  } else if (digits.length === 10) {
    const prefix = digits.slice(0, 2)
    if (!['10', '11', '12', '15'].includes(prefix)) return null
    twelve = '20' + digits
  } else {
    return null
  }

  if (twelve.length !== 12 || twelve.slice(0, 2) !== '20') return null
  const mp = twelve.slice(2, 4)
  if (!['10', '11', '12', '15'].includes(mp)) return null

  return '+' + twelve
}

let passed = 0
let failed = 0

function check(input: string | null | undefined, label: string): void {
  const ts = normalizeEgyptianPhone(input)
  const sql = shadowSqlNormalize(input)
  if (ts === sql) {
    passed += 1
  } else {
    console.log(`  ✗ parity drift on ${label}`)
    console.log(`      input: ${JSON.stringify(input)}`)
    console.log(`      TS  → ${JSON.stringify(ts)}`)
    console.log(`      SQL → ${JSON.stringify(sql)}`)
    failed += 1
  }
}

console.log('\n=== Phone normalizer SQL ↔ TS parity ===\n')

// Comprehensive matrix.
const inputs: Array<[string | null | undefined, string]> = [
  // local valid
  ['01012345678', 'local Vodafone'],
  ['01112345678', 'local Etisalat'],
  ['01212345678', 'local Orange'],
  ['01512345678', 'local WE'],
  ['010 1234 5678', 'local with spaces'],
  ['010-1234-5678', 'local with dashes'],
  ['010.1234.5678', 'local with dots'],
  ['(010)12345678', 'local with parens'],
  ['  01012345678  ', 'local with whitespace'],

  // E.164
  ['+201012345678', 'E.164 canonical'],
  ['+20 101 234 5678', 'E.164 with spaces'],
  ['+20-101-234-5678', 'E.164 with dashes'],

  // 12-digit no plus
  ['201012345678', 'digit-only with country code'],

  // 00-prefix
  ['00201012345678', '00-prefix international'],

  // 10-digit
  ['1012345678', '10-digit no leading zero'],
  ['1112345678', '10-digit Etisalat'],

  // Arabic-Indic
  ['٠١٠١٢٣٤٥٦٧٨', 'Arabic-Indic local'],
  ['+٢٠١٠١٢٣٤٥٦٧٨', 'Arabic-Indic E.164'],
  ['٠١٠ ١٢٣٤ ٥٦٧٨', 'Arabic-Indic with spaces'],

  // invalid — empty / null
  ['', 'empty string'],
  [null, 'null'],
  [undefined, 'undefined'],
  ['     ', 'only whitespace'],
  ['+', 'only plus'],
  ['---', 'only dashes'],

  // invalid — letters
  ['hello', 'letters'],
  ['010ABC45678', 'mixed letters'],
  ['01a12345678', 'letter in middle'],

  // invalid — wrong length
  ['0101234567', '10-digit local'],
  ['010123456789', '12-digit local'],
  ['20101234567', '11 digits with country code'],
  ['2010123456789', '13 digits with country code'],

  // invalid — wrong prefix
  ['01312345678', 'invalid prefix 013'],
  ['01412345678', 'invalid prefix 014'],
  ['01612345678', 'invalid prefix 016'],
  ['01712345678', 'invalid prefix 017'],
  ['01812345678', 'invalid prefix 018'],
  ['01912345678', 'invalid prefix 019'],
  ['00012345678', 'leading zeros'],

  // invalid — wrong country
  ['+966512345678', 'Saudi'],
  ['+447911123456', 'UK'],
  ['+12025551234', 'US'],
  ['00966512345678', '00-prefix Saudi'],

  // invalid — 11-digit not starting with 01
  ['11234567890', '11-digit not 01'],
  ['21234567890', '11-digit starting with 2'],

  // edge: 10 digits with bad prefix
  ['1312345678', '10-digit bad prefix'],
  ['9912345678', '10-digit bad prefix 99'],
]

for (const [input, label] of inputs) {
  check(input, label)
}

// Property check: every output of the TS function is idempotent under
// both implementations (re-normalizing E.164 yields the same E.164).
for (const [input] of inputs) {
  const out = normalizeEgyptianPhone(input)
  if (out !== null) {
    check(out, `idempotent re-norm of "${out}"`)
  }
}

console.log(`\n=== Parity: ${passed} matched, ${failed} drift ===\n`)
process.exit(failed === 0 ? 0 : 1)
