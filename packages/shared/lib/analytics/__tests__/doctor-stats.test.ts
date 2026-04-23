/**
 * Regression tests for doctor analytics income + visits aggregation.
 *
 * Test framework note: the repo does not currently have jest/vitest
 * configured. This file follows the hand-rolled pattern of
 * packages/shared/lib/data/__tests__/drug-interactions.test.ts — run with
 * `npx tsx packages/shared/lib/analytics/__tests__/doctor-stats.test.ts`
 * or the equivalent ts-node command. See NOTES.md for the runner TODO.
 *
 * What this locks in:
 *  - payment_status filter: 'completed' counts, null counts (legacy
 *    rows), 'pending'/'refunded'/'cancelled'/'paid' do NOT count.
 *    ('paid' is a regression guard — the old bug filtered *for* 'paid',
 *    which is not in migration 006's CHECK constraint.)
 *  - Visits (visitsToday / visitsThisMonth / byDay.visits / byMonth.visits)
 *    come from clinical_notes, NOT from payments. This matches the
 *    profile page's "جلسة" count so the same doctor sees the same
 *    number on both screens (Mo's product decision, 2026-04-22).
 *  - Day and month boundaries are evaluated in Africa/Cairo so a
 *    payment at 23:30 Cairo on the last day of the month counts
 *    toward "this month" regardless of where the server runs.
 */

import {
  computeIncomeStats,
} from '../doctor-stats'
import {
  cairoDateKey,
  cairoMonthKey,
  cairoMonthStart,
  cairoTodayStart,
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

/**
 * Build a payment row timestamped "now" so it falls inside today and
 * this month. `now` must match what we pass into computeIncomeStats.
 */
function makePayment(
  payment_status: string | null,
  amount = 100,
  created_at: string = new Date().toISOString(),
) {
  return { amount, payment_status, created_at }
}

/**
 * Build a clinical-note row timestamped "now" so it falls inside today
 * and this month.
 */
function makeNote(created_at: string = new Date().toISOString()) {
  return { id: 'n-' + Math.random(), created_at }
}

console.log('\n=== Doctor analytics — payment_status filter ===\n')

test("includes 'completed' rows in income totals", () => {
  const r = computeIncomeStats([makePayment('completed', 200)])
  return (
    r.summary.thisMonth === 200 &&
    r.summary.today === 200 &&
    r.byDay.length === 1 &&
    r.byMonth.length === 1
  )
})

test("includes null-status rows in income totals (legacy/unset rows)", () => {
  const r = computeIncomeStats([makePayment(null, 150)])
  return (
    r.summary.thisMonth === 150 &&
    r.byDay.length === 1
  )
})

test("excludes 'pending' rows", () => {
  const r = computeIncomeStats([makePayment('pending', 999)])
  return r.summary.thisMonth === 0 && r.byDay.length === 0
})

test("excludes 'refunded' rows", () => {
  const r = computeIncomeStats([makePayment('refunded', 999)])
  return r.summary.thisMonth === 0
})

test("excludes 'cancelled' rows", () => {
  const r = computeIncomeStats([makePayment('cancelled', 999)])
  return r.summary.thisMonth === 0
})

test("excludes legacy 'paid' value — guards against revert of the fix", () => {
  // 'paid' is NOT a valid payment_status per migration 006's CHECK constraint.
  // The prior bug filtered *for* 'paid'; the new code must treat it as invalid.
  const r = computeIncomeStats([makePayment('paid', 999)])
  return r.summary.thisMonth === 0
})

test("mixed rows: income sums only completed + null, ignores other statuses", () => {
  const r = computeIncomeStats([
    makePayment('completed', 100),
    makePayment(null, 50),
    makePayment('pending', 777),
    makePayment('refunded', 777),
    makePayment('cancelled', 777),
    makePayment('paid', 777),
  ])
  return r.summary.thisMonth === 150 && r.summary.today === 150
})

test("empty input yields all-zero summary (no crash)", () => {
  const r = computeIncomeStats([])
  return (
    r.summary.today === 0 &&
    r.summary.thisMonth === 0 &&
    r.summary.visitsToday === 0 &&
    r.summary.visitsThisMonth === 0 &&
    r.byDay.length === 0 &&
    r.byMonth.length === 0
  )
})

console.log('\n=== Visits are sourced from clinical_notes, NOT payments ===\n')

test("payments alone → income > 0 but visits === 0", () => {
  const r = computeIncomeStats(
    [makePayment('completed', 300), makePayment('completed', 200)],
    [],
  )
  return (
    r.summary.thisMonth === 500 &&
    r.summary.today === 500 &&
    r.summary.visitsToday === 0 &&
    r.summary.visitsThisMonth === 0
  )
})

test("notes alone → visits > 0 but income === 0", () => {
  const r = computeIncomeStats([], [makeNote(), makeNote(), makeNote()])
  return (
    r.summary.visitsThisMonth === 3 &&
    r.summary.visitsToday === 3 &&
    r.summary.thisMonth === 0 &&
    r.summary.today === 0
  )
})

test("visits count all notes regardless of any payment status", () => {
  // If a doctor saw 5 patients but only collected money from 2,
  // analytics should still show 5 visits (matches "جلسة" on profile).
  const r = computeIncomeStats(
    [makePayment('completed', 100), makePayment('completed', 100)],
    [makeNote(), makeNote(), makeNote(), makeNote(), makeNote()],
  )
  return r.summary.visitsThisMonth === 5 && r.summary.thisMonth === 200
})

test("byDay point merges income (from payments) + visits (from notes) on same day", () => {
  const now = new Date()
  const r = computeIncomeStats(
    [makePayment('completed', 250, now.toISOString())],
    [makeNote(now.toISOString()), makeNote(now.toISOString())],
  )
  if (r.byDay.length !== 1) return false
  const pt = r.byDay[0]
  return pt.income === 250 && pt.visits === 2
})

test("byDay includes a day with visits but no income", () => {
  const now = new Date()
  const r = computeIncomeStats(
    [],
    [makeNote(now.toISOString())],
  )
  if (r.byDay.length !== 1) return false
  return r.byDay[0].income === 0 && r.byDay[0].visits === 1
})

console.log('\n=== Africa/Cairo date boundaries ===\n')

test("cairoTodayStart/monthStart are UTC instants matching Cairo wall-clock", () => {
  // Fixed reference: 2026-04-22 12:00:00 UTC == 14:00 Cairo (DST)
  // Actually — 2026-04-22 is 2 days BEFORE Egypt's DST starts
  // (last Friday of April = Apr 24, 2026), so Cairo is UTC+2 that day.
  // Then 12:00 UTC == 14:00 Cairo.
  const now = new Date('2026-04-22T12:00:00Z')
  const ts = cairoTodayStart(now)
  const ms = cairoMonthStart(now)
  return (
    // 00:00 Apr 22 Cairo == 22:00 Apr 21 UTC
    ts.toISOString() === '2026-04-21T22:00:00.000Z' &&
    // 00:00 Apr 1 Cairo == 22:00 Mar 31 UTC
    ms.toISOString() === '2026-03-31T22:00:00.000Z'
  )
})

test("a 23:30 Cairo payment on month-last-day counts as 'this month'", () => {
  // Apr 30 2026 is inside Egypt DST (started Apr 24), so UTC+3.
  // 23:30 Cairo Apr 30 == 20:30 UTC Apr 30.
  // "now" is some moment on Apr 30 Cairo so monthStart = Apr 1 Cairo.
  const payAtCairo2330 = '2026-04-30T20:30:00Z' // 23:30 Cairo on Apr 30
  const now           = new Date('2026-04-30T18:00:00Z') // 21:00 Cairo
  const r = computeIncomeStats(
    [makePayment('completed', 500, payAtCairo2330)],
    [],
    now,
  )
  return r.summary.thisMonth === 500 && r.summary.today === 500
})

test("a Cairo-next-day payment at 00:30 does NOT count as 'today'", () => {
  // "Now" = Apr 30 22:00 UTC = Apr 30 00:00 Cairo (May 1 Cairo edge case).
  // Wait — Apr 30 22:00 UTC Cairo-DST = May 1 01:00 Cairo.
  // Use a simpler case: now = Apr 29 18:00 UTC = Apr 29 21:00 Cairo.
  // Payment at Apr 29 22:30 UTC = Apr 30 01:30 Cairo → next Cairo day.
  const now = new Date('2026-04-29T18:00:00Z')
  const payTomorrowCairo = '2026-04-29T22:30:00Z' // 01:30 Apr 30 Cairo
  const r = computeIncomeStats(
    [makePayment('completed', 500, payTomorrowCairo)],
    [],
    now,
  )
  // "today" = Apr 29 Cairo; payment is on Apr 30 Cairo → not today.
  return r.summary.today === 0 && r.summary.thisMonth === 500
})

test("byDay / byMonth keys use Cairo calendar", () => {
  // Payment at 00:30 Apr 30 Cairo (== 22:30 Apr 29 UTC) should bucket
  // into Apr 30, not Apr 29. Before this fix the UTC slice would
  // have returned '2026-04-29'.
  const now = new Date('2026-04-30T12:00:00Z')
  const r = computeIncomeStats(
    [makePayment('completed', 100, '2026-04-29T22:30:00Z')],
    [],
    now,
  )
  return (
    r.byDay.length === 1 &&
    r.byDay[0].date === '2026-04-30' &&
    r.byMonth.length === 1 &&
    r.byMonth[0].month === '2026-04'
  )
})

console.log('\n=== Sanity checks on date-key helpers ===\n')

test('cairoDateKey respects Cairo calendar boundary', () => {
  // 22:30 UTC Apr 29 = 00:30 Apr 30 Cairo (DST hasn't started; UTC+2)
  // Wait — Apr 29 is BEFORE DST (Apr 24 Friday... hmm let me re-check).
  // Apr 24 2026 is a Friday. Apr 29 is Wed. So DST started, UTC+3.
  // 22:30 UTC Apr 29 = 01:30 Apr 30 Cairo.
  return cairoDateKey(new Date('2026-04-29T22:30:00Z')) === '2026-04-30'
})

test('cairoMonthKey flips on Cairo calendar', () => {
  // Apr 30 21:30 UTC = May 1 00:30 Cairo (DST)
  return cairoMonthKey(new Date('2026-04-30T21:30:00Z')) === '2026-05'
})

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`)

if (failed > 0) {
  process.exit(1)
}
