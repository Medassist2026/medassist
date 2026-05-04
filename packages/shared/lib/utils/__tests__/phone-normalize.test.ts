/**
 * Unit tests for `normalizeEgyptianPhone` (E.164 normalizer for global
 * patient identity). Hand-rolled assertion harness — same pattern as
 * packages/shared/lib/data/__tests__/drug-interactions.test.ts.
 *
 * Run with:
 *   npx tsx packages/shared/lib/utils/__tests__/phone-normalize.test.ts
 *
 * Exit code is 0 on full pass, 1 on any failure.
 */

import { normalizeEgyptianPhone, isValidEgyptianE164 } from '../phone-normalize'

let passed = 0
let failed = 0

function test(name: string, fn: () => boolean): void {
  let ok = false
  let threw: unknown = null
  try {
    ok = fn()
  } catch (err) {
    threw = err
  }
  if (threw !== null) {
    console.log(`  ✗ ${name} (threw: ${(threw as Error)?.message ?? threw})`)
    failed += 1
    return
  }
  if (ok) {
    console.log(`  ✓ ${name}`)
    passed += 1
  } else {
    console.log(`  ✗ ${name}`)
    failed += 1
  }
}

function eq<T>(actual: T, expected: T): boolean {
  if (actual === expected) return true
  console.log(`      expected: ${JSON.stringify(expected)}`)
  console.log(`      actual:   ${JSON.stringify(actual)}`)
  return false
}

console.log('\n=== normalizeEgyptianPhone — VALID inputs (return E.164) ===\n')

test('11-digit local Vodafone prefix', () =>
  eq(normalizeEgyptianPhone('01012345678'), '+201012345678'))

test('11-digit local Etisalat prefix', () =>
  eq(normalizeEgyptianPhone('01112345678'), '+201112345678'))

test('11-digit local Orange prefix', () =>
  eq(normalizeEgyptianPhone('01212345678'), '+201212345678'))

test('11-digit local WE prefix', () =>
  eq(normalizeEgyptianPhone('01512345678'), '+201512345678'))

test('already E.164 with leading +', () =>
  eq(normalizeEgyptianPhone('+201012345678'), '+201012345678'))

test('digit-only with country code (no +)', () =>
  eq(normalizeEgyptianPhone('201012345678'), '+201012345678'))

test('international 00-prefix form', () =>
  eq(normalizeEgyptianPhone('00201012345678'), '+201012345678'))

test('local form with single space separators', () =>
  eq(normalizeEgyptianPhone('010 1234 5678'), '+201012345678'))

test('local form with dashes', () =>
  eq(normalizeEgyptianPhone('010-1234-5678'), '+201012345678'))

test('local form with dots', () =>
  eq(normalizeEgyptianPhone('010.1234.5678'), '+201012345678'))

test('local form with parens', () =>
  eq(normalizeEgyptianPhone('(010)12345678'), '+201012345678'))

test('E.164 with internal spaces', () =>
  eq(normalizeEgyptianPhone('+20 101 234 5678'), '+201012345678'))

test('Arabic-Indic numerals (local)', () =>
  eq(normalizeEgyptianPhone('٠١٠١٢٣٤٥٦٧٨'), '+201012345678'))

test('Arabic-Indic numerals (E.164)', () =>
  eq(normalizeEgyptianPhone('+٢٠١٠١٢٣٤٥٦٧٨'), '+201012345678'))

test('10-digit form (missing leading zero)', () =>
  eq(normalizeEgyptianPhone('1012345678'), '+201012345678'))

test('mixed leading/trailing whitespace', () =>
  eq(normalizeEgyptianPhone('   01012345678   '), '+201012345678'))

console.log('\n=== normalizeEgyptianPhone — INVALID inputs (return null) ===\n')

test('empty string', () =>
  eq(normalizeEgyptianPhone(''), null))

test('null input', () =>
  eq(normalizeEgyptianPhone(null), null))

test('undefined input', () =>
  eq(normalizeEgyptianPhone(undefined), null))

test('non-string input (number)', () =>
  eq(normalizeEgyptianPhone(1012345678 as unknown as string), null))

test('letters in input', () =>
  eq(normalizeEgyptianPhone('010ABC45678'), null))

test('too short (10-digit local)', () =>
  eq(normalizeEgyptianPhone('0101234567'), null))

test('too long (12-digit local)', () =>
  eq(normalizeEgyptianPhone('010123456789'), null))

test('invalid Egyptian prefix (013)', () =>
  eq(normalizeEgyptianPhone('01312345678'), null))

test('invalid Egyptian prefix (014)', () =>
  eq(normalizeEgyptianPhone('01412345678'), null))

test('non-Egyptian country code (Saudi +966)', () =>
  eq(normalizeEgyptianPhone('+966512345678'), null))

test('non-Egyptian country code (UK +44)', () =>
  eq(normalizeEgyptianPhone('+447911123456'), null))

test('country code 20 but wrong length', () =>
  eq(normalizeEgyptianPhone('20101234567'), null)) // 11 digits, expects 12

test('00-prefix with non-Egyptian country', () =>
  eq(normalizeEgyptianPhone('00966512345678'), null))

test('only +', () =>
  eq(normalizeEgyptianPhone('+'), null))

test('only spaces', () =>
  eq(normalizeEgyptianPhone('     '), null))

test('mixed alphanumeric garbage', () =>
  eq(normalizeEgyptianPhone('hello'), null))

test('11-digit not starting with 01', () =>
  eq(normalizeEgyptianPhone('11234567890'), null))

console.log('\n=== isValidEgyptianE164 sanity ===\n')

test('isValidEgyptianE164 returns true for canonical', () =>
  eq(isValidEgyptianE164('+201012345678'), true))

test('isValidEgyptianE164 returns false for null', () =>
  eq(isValidEgyptianE164(null), false))

test('isValidEgyptianE164 returns true for local', () =>
  eq(isValidEgyptianE164('01012345678'), true))

test('isValidEgyptianE164 returns false for invalid prefix', () =>
  eq(isValidEgyptianE164('01312345678'), false))

console.log('\n=== Round-trip / determinism ===\n')

test('normalize is idempotent (E.164 → E.164)', () => {
  const a = normalizeEgyptianPhone('01012345678')!
  const b = normalizeEgyptianPhone(a)
  return eq(b, a)
})

test('all four equivalent forms map to same canonical', () => {
  const canonical = '+201012345678'
  const forms = [
    '01012345678',
    '+201012345678',
    '201012345678',
    '00201012345678',
    '010 1234 5678',
    '010-1234-5678',
  ]
  return forms.every((f) => normalizeEgyptianPhone(f) === canonical)
})

console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===\n`)
process.exit(failed === 0 ? 0 : 1)
