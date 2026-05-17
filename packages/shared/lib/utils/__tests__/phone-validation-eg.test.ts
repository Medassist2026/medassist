/**
 * Unit tests for `EG_PHONE_RE` and `E164_RE` (server-boundary phone regexes
 * for auth/login + auth/register handlers). Hand-rolled assertion harness —
 * same pattern as `phone-normalize.test.ts`.
 *
 * Run with:
 *   npx tsx packages/shared/lib/utils/__tests__/phone-validation-eg.test.ts
 *
 * Exit code is 0 on full pass, 1 on any failure.
 *
 * Background: prior to L-3 (Finding I-19 / TD-009, fixed 2026-05-16) the
 * auth handlers inlined a malformed regex `/^\+2001[0125][0-9]{8}$/` that
 * had an extra leading 0 — no real Egyptian +E.164 number could match. The
 * canonical pattern is `/^\+20(10|11|12|15)[0-9]{8}$/` per Egyptian NTRA
 * carrier-prefix assignments (10 = Vodafone, 11 = Etisalat, 12 = Orange,
 * 15 = WE).
 */

import { EG_PHONE_RE, E164_RE } from '../phone-validation'

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

console.log('\n=== EG_PHONE_RE — VALID Egyptian +E.164 mobile numbers ===\n')

test('Vodafone (10) prefix matches', () => EG_PHONE_RE.test('+201012345678'))
test('Etisalat (11) prefix matches', () => EG_PHONE_RE.test('+201112345678'))
test('Orange (12) prefix matches', () => EG_PHONE_RE.test('+201212345678'))
test('WE (15) prefix matches', () => EG_PHONE_RE.test('+201512345678'))
test('Vodafone real-world example +201500099999', () =>
  EG_PHONE_RE.test('+201500099999'))
test('mother-of-Aya staging fixture +201500099999', () =>
  EG_PHONE_RE.test('+201500099999'))

console.log('\n=== EG_PHONE_RE — REJECT historical malformed shapes ===\n')

test('reject pre-L-3 malformed shape (extra leading 0)', () =>
  !EG_PHONE_RE.test('+2001500099999'))
test('reject pre-L-3 malformed shape (Vodafone-flavored)', () =>
  !EG_PHONE_RE.test('+2001012345678'))
test('reject non-Egyptian country code (+1)', () =>
  !EG_PHONE_RE.test('+1234567890'))
test('reject non-Egyptian country code (+44)', () =>
  !EG_PHONE_RE.test('+441234567890'))

console.log('\n=== EG_PHONE_RE — REJECT shape edge cases ===\n')

test('reject too short (11 digits after +20)', () =>
  !EG_PHONE_RE.test('+20101234567'))
test('reject too long (extra trailing digit)', () =>
  !EG_PHONE_RE.test('+2010123456789'))
test('reject local 11-digit format (no + or country code)', () =>
  !EG_PHONE_RE.test('01012345678'))
test('reject without + prefix (digit-only with country code)', () =>
  !EG_PHONE_RE.test('201012345678'))
test('reject embedded letters', () =>
  !EG_PHONE_RE.test('+201abc234567'))
test('reject unsupported carrier prefix 13 (not assigned by NTRA)', () =>
  !EG_PHONE_RE.test('+201312345678'))
test('reject unsupported carrier prefix 14 (not assigned by NTRA)', () =>
  !EG_PHONE_RE.test('+201412345678'))
test('reject unsupported carrier prefix 16 (not assigned by NTRA)', () =>
  !EG_PHONE_RE.test('+201612345678'))
test('reject empty string', () =>
  !EG_PHONE_RE.test(''))
test('reject double-plus', () =>
  !EG_PHONE_RE.test('++201012345678'))

console.log('\n=== E164_RE — DEV_BYPASS_OTP-mode lenient validator ===\n')

test('accepts canonical Egyptian +E.164', () =>
  E164_RE.test('+201012345678'))
test('accepts UK number for testing', () =>
  E164_RE.test('+441234567890'))
test('accepts US number for testing', () =>
  E164_RE.test('+15555550100'))
test('accepts minimum-length 7-digit international form', () =>
  E164_RE.test('+1234567'))
test('rejects leading-zero country code', () =>
  !E164_RE.test('+0123456789'))
test('rejects too-short (6 digits)', () =>
  !E164_RE.test('+123456'))
test('rejects too-long (>15 digits after +)', () =>
  !E164_RE.test('+1234567890123456'))
test('rejects no + prefix', () =>
  !E164_RE.test('201012345678'))

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`)
process.exit(failed === 0 ? 0 : 1)
