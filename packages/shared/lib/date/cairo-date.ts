/**
 * Africa/Cairo timezone helpers.
 *
 * WHY THIS EXISTS: doctor analytics and the profile API both opened
 * day/month windows with `new Date()` + `.setHours(0,0,0,0)` — which
 * operates in the *server's* local TZ. Vercel nodes run in UTC, so
 * "today" and "this month" drifted vs. what a clinic in Cairo sees on
 * the wall clock. A 2026-04-22 23:30 Cairo payment landed on "today"
 * for a user but not for the server.
 *
 * This module returns the UTC `Date` instances that correspond to
 * day/month boundaries *in Africa/Cairo* (GMT+2, no DST since 2014).
 * It uses `Intl.DateTimeFormat` so it's DST-safe if that ever changes.
 *
 * All helpers accept an optional `now: Date` for testability.
 */

export const CAIRO_TZ = 'Africa/Cairo'

/**
 * Return { year, month, day, hour, minute, second } as integers in
 * Africa/Cairo TZ for the given instant.
 */
export function cairoParts(now: Date = new Date()): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} {
  // 'en-CA' gives YYYY-MM-DD format in the date part
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10)

  return {
    year:   get('year'),
    month:  get('month'),
    day:    get('day'),
    // Intl sometimes emits "24" for midnight under hour12:false — normalize.
    hour:   get('hour') === 24 ? 0 : get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/**
 * Return the YYYY-MM-DD string for the given instant, in Cairo TZ.
 * Useful for grouping payments/notes into daily buckets.
 */
export function cairoDateKey(d: Date): string {
  const { year, month, day } = cairoParts(d)
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/**
 * Return the YYYY-MM string for the given instant, in Cairo TZ.
 */
export function cairoMonthKey(d: Date): string {
  const { year, month } = cairoParts(d)
  return `${year}-${pad2(month)}`
}

/**
 * Return the UTC `Date` corresponding to 00:00:00.000 Cairo on the
 * same calendar day as `now` (Cairo).
 */
export function cairoTodayStart(now: Date = new Date()): Date {
  const { year, month, day } = cairoParts(now)
  return cairoWallClockToUtc(year, month, day, 0, 0, 0, 0)
}

/**
 * Return the UTC `Date` corresponding to 23:59:59.999 Cairo on the
 * same calendar day as `now` (Cairo).
 */
export function cairoTodayEnd(now: Date = new Date()): Date {
  const { year, month, day } = cairoParts(now)
  return cairoWallClockToUtc(year, month, day, 23, 59, 59, 999)
}

/**
 * Return the UTC `Date` corresponding to the 1st of the current Cairo
 * month at 00:00:00.000 Cairo.
 */
export function cairoMonthStart(now: Date = new Date()): Date {
  const { year, month } = cairoParts(now)
  return cairoWallClockToUtc(year, month, 1, 0, 0, 0, 0)
}

/**
 * Return the UTC `Date` corresponding to the last day of the current
 * Cairo month at 23:59:59.999 Cairo.
 */
export function cairoMonthEnd(now: Date = new Date()): Date {
  const { year, month } = cairoParts(now)
  // Day 0 of the *next* month = last day of this month (in Cairo).
  // We construct via the UTC projection so DST can't surprise us.
  const nextMonthFirst = cairoWallClockToUtc(year, month + 1, 1, 0, 0, 0, 0)
  return new Date(nextMonthFirst.getTime() - 1)
}

/**
 * Return the UTC `Date` corresponding to 00:00:00.000 Cairo on a day
 * N calendar months before today (Cairo). `cairoNMonthsAgoStart(12)`
 * is used for the 12-month income chart.
 */
export function cairoNMonthsAgoStart(months: number, now: Date = new Date()): Date {
  const { year, month } = cairoParts(now)
  return cairoWallClockToUtc(year, month - months, 1, 0, 0, 0, 0)
}

// ============================================================================
// INTERNALS
// ============================================================================

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/**
 * Convert a wall-clock moment in Africa/Cairo to the equivalent UTC
 * `Date`. Works by (1) asking JS to build the nominal UTC instant
 * with the same calendar components, (2) measuring the TZ offset for
 * that instant in Cairo, (3) subtracting it. Handles hypothetical DST
 * correctly because the offset is sampled at the nominal moment.
 */
function cairoWallClockToUtc(
  year:   number,
  month:  number,  // 1–12 (or out-of-range, Date normalizes)
  day:    number,
  hour:   number,
  minute: number,
  second: number,
  ms:     number,
): Date {
  // Nominal UTC instant — interprets the components as if they were UTC.
  const nominal = Date.UTC(year, month - 1, day, hour, minute, second, ms)
  // Measure Cairo's offset at that instant.
  const offsetMinutes = cairoOffsetMinutes(new Date(nominal))
  // If Cairo is UTC+2, the wall-clock moment "2026-04-22T00:00:00 Cairo"
  // == "2026-04-21T22:00:00 UTC". Subtract the offset to get the real UTC.
  return new Date(nominal - offsetMinutes * 60_000)
}

/**
 * Return Cairo's offset from UTC in minutes at the given instant.
 * Positive means "ahead of UTC" (Cairo is +120 minutes year-round).
 */
function cairoOffsetMinutes(at: Date): number {
  // Format the instant once as UTC and once as Cairo wall-clock, then
  // diff them to recover the offset. Using 'sv-SE' for 24h sortable
  // format so the diff math is straightforward.
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: tz,
      year:   'numeric',
      month:  '2-digit',
      day:    '2-digit',
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(at)

  const utcStr   = fmt('UTC')
  const cairoStr = fmt(CAIRO_TZ)

  // Parse "YYYY-MM-DD HH:mm:ss" back into ms-since-epoch for both.
  const toMs = (s: string): number => {
    const [date, time] = s.split(' ')
    const [y, m, d]    = date.split('-').map(Number)
    const [hh, mm, ss] = time.split(':').map(Number)
    return Date.UTC(y, m - 1, d, hh, mm, ss)
  }

  return Math.round((toMs(cairoStr) - toMs(utcStr)) / 60_000)
}
