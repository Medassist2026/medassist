/**
 * Regression tests for doctor analytics income + visits aggregation.
 *
 * Test framework note: the repo does not currently have jest/vitest
 * configured. This file follows the hand-rolled pattern of
 * packages/shared/lib/data/__tests__/drug-interactions.test.ts — run with
 * `npx tsx packages/shared/lib/analytics/__tests__/doctor-stats.test.ts`
 * or the equivalent ts-node command. See NOTES.md for the runner TODO.
 *
 * What this file locks in:
 *
 *  Payment status filter:
 *   - 'completed' counts, null counts (legacy rows),
 *     'pending'/'refunded'/'cancelled' excluded.
 *   - 'paid' is excluded (regression guard — the old bug filtered FOR
 *     'paid', which is not in migration 006's CHECK constraint).
 *
 *  Source separation (Mo's product decision 2026-04-22):
 *   - Visits come from clinical_notes (one note = one visit).
 *   - Income comes from payments. The two are decoupled so a doctor
 *     who saw 5 patients but collected money from 2 still shows 5 visits.
 *
 *  Cairo timezone:
 *   - Day/month boundaries flip at Cairo 00:00, not server-local.
 *
 *  Fix 1 — current-month upper bound (2026-04-25):
 *   - A future-dated note (or payment) does NOT inflate
 *     summary.visitsThisMonth / summary.thisMonth.
 *
 *  Fix 2 + 3 — calendar-scoped chart windows (2026-04-25):
 *   - `byDay`   = every Cairo day from the 1st of the current month
 *                  through TODAY (Cairo), zero-filled.
 *   - `byMonth` = exactly 12 Cairo calendar months ending in the
 *                  current month, zero-filled.
 *   - Sum of byDay.visits === summary.visitsThisMonth.
 *   - Sum of byDay.income === summary.thisMonth.
 */

import { computeIncomeStats } from '../doctor-stats'
import {
  cairoDateKey,
  cairoMonthKey,
  cairoMonthStart,
  cairoTodayStart,
  cairoEachDay,
  cairoEachMonth,
  cairoNDaysAgoStart,
  cairoNMonthsAgoStart,
} from '../../date/cairo-date'

let passed = 0
let failed = 0

function test(name: string, fn: () => boolean) {
  try {
    if (fn()) {
      console.log(`  ✓ ${name}`)
      passed++
    } else {
      console.log(`  ✗ ${name}`)
      failed++
    }
  } catch (e: any) {
    console.log(`  ✗ ${name} (threw: ${e?.message || e})`)
    failed++
  }
}

// Default `now` for deterministic tests: Apr 15 2026 14:00 Cairo
// (= 12:00 UTC, pre-DST, UTC+2, mid-month, mid-day — no edge cases).
const NOW = new Date('2026-04-15T12:00:00Z')

function makePayment(
  payment_status: string | null,
  amount = 100,
  created_at: string = NOW.toISOString(),
) {
  return { amount, payment_status, created_at }
}

function makeNote(created_at: string = NOW.toISOString()) {
  return { id: 'n-' + Math.random(), created_at }
}

console.log('\n=== Doctor analytics — payment_status filter ===\n')

test("includes 'completed' rows in income totals", () => {
  const r = computeIncomeStats([makePayment('completed', 200)], [], NOW)
  return r.summary.thisMonth === 200 && r.summary.today === 200
})

test("includes null-status rows in income totals (legacy/unset rows)", () => {
  const r = computeIncomeStats([makePayment(null, 150)], [], NOW)
  return r.summary.thisMonth === 150
})

test("excludes 'pending' rows", () => {
  const r = computeIncomeStats([makePayment('pending', 999)], [], NOW)
  return r.summary.thisMonth === 0
})

test("excludes 'refunded' rows", () => {
  const r = computeIncomeStats([makePayment('refunded', 999)], [], NOW)
  return r.summary.thisMonth === 0
})

test("excludes 'cancelled' rows", () => {
  const r = computeIncomeStats([makePayment('cancelled', 999)], [], NOW)
  return r.summary.thisMonth === 0
})

test("excludes legacy 'paid' value — guards against revert of the fix", () => {
  // 'paid' is NOT a valid payment_status per migration 006's CHECK constraint.
  const r = computeIncomeStats([makePayment('paid', 999)], [], NOW)
  return r.summary.thisMonth === 0
})

test("mixed rows: income sums only completed + null", () => {
  const r = computeIncomeStats(
    [
      makePayment('completed', 100),
      makePayment(null, 50),
      makePayment('pending', 777),
      makePayment('refunded', 777),
      makePayment('cancelled', 777),
      makePayment('paid', 777),
    ],
    [],
    NOW,
  )
  return r.summary.thisMonth === 150 && r.summary.today === 150
})

console.log('\n=== Visits are sourced from clinical_notes, NOT payments ===\n')

test('payments alone → income > 0 but visits === 0', () => {
  const r = computeIncomeStats(
    [makePayment('completed', 300), makePayment('completed', 200)],
    [],
    NOW,
  )
  return (
    r.summary.thisMonth === 500 &&
    r.summary.visitsToday === 0 &&
    r.summary.visitsThisMonth === 0
  )
})

test('notes alone → visits > 0 but income === 0', () => {
  const r = computeIncomeStats([], [makeNote(), makeNote(), makeNote()], NOW)
  return (
    r.summary.visitsThisMonth === 3 &&
    r.summary.visitsToday === 3 &&
    r.summary.thisMonth === 0
  )
})

test('visits count all notes regardless of any payment status', () => {
  const r = computeIncomeStats(
    [makePayment('completed', 100), makePayment('completed', 100)],
    [makeNote(), makeNote(), makeNote(), makeNote(), makeNote()],
    NOW,
  )
  return r.summary.visitsThisMonth === 5 && r.summary.thisMonth === 200
})

console.log('\n=== Fix 1 — current-month upper bound ===\n')

test('future-dated note does NOT inflate visitsThisMonth', () => {
  // NOW = Apr 15 2026; a note dated May 15 must not count toward April.
  const futureNote = makeNote('2026-05-15T10:00:00Z')
  const r = computeIncomeStats([], [futureNote], NOW)
  return r.summary.visitsThisMonth === 0
})

test('future-dated payment does NOT inflate thisMonth', () => {
  const futurePayment = makePayment('completed', 999, '2026-05-15T10:00:00Z')
  const r = computeIncomeStats([futurePayment], [], NOW)
  return r.summary.thisMonth === 0
})

test('future-dated row STILL contributes to its own month bucket if within chart window', () => {
  // A May 2026 row falls inside the 12-month chart window (May 2025-
  // Apr 2026 + the May "future" bar would NOT actually be in the
  // window for NOW=Apr 15) — so this test confirms it does NOT show
  // in byMonth either. That's deliberate: the window is bounded.
  const futureNote = makeNote('2026-05-15T10:00:00Z')
  const r = computeIncomeStats([], [futureNote], NOW)
  const mayEntry = r.byMonth.find((m) => m.month === '2026-05')
  return mayEntry === undefined
})

test('past-month note within the chart window appears in byMonth', () => {
  // NOW = Apr 15 2026; a Mar 1 2026 note is in the 12-month window
  // and should show up in byMonth['2026-03'] but NOT in
  // visitsThisMonth (which is April-only).
  const marchNote = makeNote('2026-03-01T08:00:00Z')
  const r = computeIncomeStats([], [marchNote], NOW)
  const march = r.byMonth.find((m) => m.month === '2026-03')
  return r.summary.visitsThisMonth === 0 && march?.visits === 1
})

console.log('\n=== Fix 2/3 — calendar-scoped chart windows + zero pre-fill ===\n')

test('empty input → byDay is zero-filled for current month up to today', () => {
  const r = computeIncomeStats([], [], NOW)
  // NOW = Apr 15 → byDay should have 15 entries (Apr 1 through Apr 15)
  return (
    r.byDay.length === 15 &&
    r.byDay[0].date === '2026-04-01' &&
    r.byDay[r.byDay.length - 1].date === '2026-04-15' &&
    r.byDay.every((p) => p.visits === 0 && p.income === 0)
  )
})

test('empty input → byMonth has exactly 12 entries ending at current month', () => {
  const r = computeIncomeStats([], [], NOW)
  return (
    r.byMonth.length === 12 &&
    r.byMonth[0].month === '2025-05' &&
    r.byMonth[r.byMonth.length - 1].month === '2026-04' &&
    r.byMonth.every((m) => m.visits === 0 && m.income === 0)
  )
})

test('byDay contains today + every prior day of the current Cairo month', () => {
  const r = computeIncomeStats([], [], NOW)
  const expected = cairoEachDay(cairoMonthStart(NOW), cairoTodayStart(NOW))
  return (
    r.byDay.map((p) => p.date).join(',') === expected.join(',')
  )
})

test('byMonth contains exactly the 12 Cairo months ending in current', () => {
  const r = computeIncomeStats([], [], NOW)
  const expected = cairoEachMonth(cairoNMonthsAgoStart(11, NOW), cairoMonthStart(NOW))
  return r.byMonth.map((m) => m.month).join(',') === expected.join(',')
})

test('sum of byDay.visits equals summary.visitsThisMonth', () => {
  // 3 notes spread across April (Apr 2, Apr 5, Apr 14)
  const r = computeIncomeStats(
    [],
    [
      makeNote('2026-04-02T10:00:00Z'),
      makeNote('2026-04-05T11:00:00Z'),
      makeNote('2026-04-14T09:00:00Z'),
    ],
    NOW,
  )
  const dailySum = r.byDay.reduce((s, p) => s + p.visits, 0)
  return dailySum === r.summary.visitsThisMonth && dailySum === 3
})

test('sum of byDay.income equals summary.thisMonth', () => {
  const r = computeIncomeStats(
    [
      makePayment('completed', 100, '2026-04-02T10:00:00Z'),
      makePayment('completed', 50,  '2026-04-10T11:00:00Z'),
    ],
    [],
    NOW,
  )
  const dailySum = r.byDay.reduce((s, p) => s + p.income, 0)
  return dailySum === r.summary.thisMonth && dailySum === 150
})

test('byMonth includes a previous month with activity at non-zero visits', () => {
  const r = computeIncomeStats(
    [],
    [
      makeNote('2026-03-01T08:00:00Z'),
      makeNote('2026-03-15T08:00:00Z'),
    ],
    NOW,
  )
  const march = r.byMonth.find((m) => m.month === '2026-03')
  return march?.visits === 2
})

test('byDay/byMonth zero-fill is preserved when activity exists in some buckets', () => {
  const r = computeIncomeStats(
    [],
    [makeNote('2026-04-05T08:00:00Z'), makeNote('2026-04-14T09:00:00Z')],
    NOW,
  )
  // Still 15 entries (Apr 1-15); 2 have visits=1, the rest 0.
  const visitDays = r.byDay.filter((p) => p.visits > 0).map((p) => p.date)
  return (
    r.byDay.length === 15 &&
    visitDays.length === 2 &&
    visitDays.includes('2026-04-05') &&
    visitDays.includes('2026-04-14')
  )
})

console.log('\n=== Africa/Cairo date boundaries ===\n')

test('cairoTodayStart/monthStart are UTC instants matching Cairo wall-clock', () => {
  const ts = cairoTodayStart(NOW)
  const ms = cairoMonthStart(NOW)
  return (
    ts.toISOString() === '2026-04-14T22:00:00.000Z' && // Apr 15 00:00 Cairo (UTC+2)
    ms.toISOString() === '2026-03-31T22:00:00.000Z'    // Apr 1 00:00 Cairo (UTC+2)
  )
})

test("a 23:30 Cairo payment on month-last-day counts as 'this month'", () => {
  // Apr 30 2026 is post-DST (UTC+3); 23:30 Cairo = 20:30 UTC.
  const lateApril = makePayment('completed', 500, '2026-04-30T20:30:00Z')
  const apr30Now  = new Date('2026-04-30T18:00:00Z')  // 21:00 Cairo
  const r = computeIncomeStats([lateApril], [], apr30Now)
  return r.summary.thisMonth === 500 && r.summary.today === 500
})

test('a Cairo-next-day note at 00:30 does NOT count as today', () => {
  // Now = Apr 29 18:00 UTC = Apr 29 21:00 Cairo (DST).
  // Note at Apr 29 22:30 UTC = Apr 30 01:30 Cairo → next Cairo day.
  const apr29Now = new Date('2026-04-29T18:00:00Z')
  const tomorrowCairo = makeNote('2026-04-29T22:30:00Z')
  const r = computeIncomeStats([], [tomorrowCairo], apr29Now)
  return r.summary.visitsToday === 0 && r.summary.visitsThisMonth === 1
})

test('cairoDateKey buckets late-night UTC into the correct Cairo day', () => {
  // 22:30 UTC Apr 29 = 01:30 Apr 30 Cairo (DST UTC+3)
  return cairoDateKey(new Date('2026-04-29T22:30:00Z')) === '2026-04-30'
})

test('cairoMonthKey flips on Cairo calendar', () => {
  return cairoMonthKey(new Date('2026-04-30T21:30:00Z')) === '2026-05'
})

console.log('\n=== Cairo iterator helpers (Fix 2 dependency) ===\n')

test('cairoEachDay returns inclusive range for current month up to mid-month', () => {
  const days = cairoEachDay(cairoMonthStart(NOW), cairoTodayStart(NOW))
  return (
    days.length === 15 &&
    days[0] === '2026-04-01' &&
    days[14] === '2026-04-15'
  )
})

test('cairoEachMonth returns 12 months when given 11-month span', () => {
  const months = cairoEachMonth(cairoNMonthsAgoStart(11, NOW), cairoMonthStart(NOW))
  return months.length === 12 && months[0] === '2025-05' && months[11] === '2026-04'
})

test('cairoEachDay returns [] for inverted range', () => {
  return cairoEachDay(new Date('2026-04-25T00:00Z'), new Date('2026-04-20T00:00Z')).length === 0
})

test('cairoNDaysAgoStart(7) yields a Cairo midnight 7 days back', () => {
  const start = cairoNDaysAgoStart(7, NOW)
  // NOW = Apr 15 14:00 Cairo. 7 days ago = Apr 8 00:00 Cairo = Apr 7 22:00 UTC (UTC+2).
  return start.toISOString() === '2026-04-07T22:00:00.000Z'
})

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`)

if (failed > 0) {
  process.exit(1)
}
