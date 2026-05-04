# Doctor Analytics — Three Numbers That Should Agree, Don't
## Diagnostic Report (READ-ONLY)

Author: Claude (diagnostic run)
Date: 2026-04-23
Base commit: `ed5aa2a` (on `origin/main`, matches local `HEAD`)
Scope: READ-ONLY. No files were modified.

---

## 1. TL;DR

Two real, currently-checked-in code bugs explain (2) and (3) of the three reported numbers:

(a) **The 30-day and 12-month charts are sparse** — the server only emits `byDay` / `byMonth` entries for days and months that had ≥1 note or ≥1 payment. The client then does `byDay.slice(-30)` / `byMonth.slice(-12)`, which is **count-based slicing, not date-based** (`apps/clinic/app/(doctor)/doctor/analytics/page.tsx:205-206`). Consequence: if the current month is entirely empty in the fetched dataset, no April bar renders on the 12-month chart — there is no "empty April" zero-bar to fall back to. (H2, reframed.)

(b) **`visitsThisMonth` has no upper bound on `d`** in the notes loop: `if (d >= monthStart) visitsThisMonth++` (`packages/shared/lib/analytics/doctor-stats.ts:489`). Any note with `d ≥ April 1 Cairo` counts — including notes whose `cairoMonthKey(d)` is `2026-05` or later (e.g. test data with future timestamps, or notes created on rolled-forward clocks). Those notes would inflate `visitsThisMonth` without appearing in `byMonth['2026-04']` at all.

The **third observed symptom — 30-day chart's March day-sum (7) ≠ 12-month chart's March bar (5) on the same response** — is **not reproducible from the code** (they are emitted by the same loop over the same notes array within one `computeIncomeStats` call, so they must agree). This means: either (i) the two screenshots were taken at different moments (with notes added between them), or (ii) the deployed build is not `ed5aa2a` (Vercel still on previous build, local dev-server not restarted, or the browser has a cached `/api/analytics/doctor-stats` response from pre-fix code). SQL Q-B and Q-C below will distinguish "deployed code is new but data is weird" from "deployed code is old".

H1 (timezone bucketing) is **already fixed** by `ed5aa2a` — `computeIncomeStats` uses `cairoTodayStart/End/cairoMonthStart/cairoDateKey/cairoMonthKey` throughout (`doctor-stats.ts:449-451,465-466,485-486`). H1 is still a real risk for other surfaces that were not migrated (see §7 — profile/api/doctor/stats is partly migrated, several other surfaces still use server-local date math).

Blast radius of the sparse-chart issue: limited to the analytics page (one caller, one endpoint). Not user-data-corrupting; only display/aggregation.

## 2. Code findings — the three window computations

### (A) Card `visitsThisMonth` — `packages/shared/lib/analytics/doctor-stats.ts:449-492`

Window construction:
```ts
const monthStart = cairoMonthStart(now)  // :451 — first of current Cairo month, inclusive
// NOTE: no monthEnd variable; see §5 Q1 answer
```

Loop:
```ts
for (const n of notes) {                 // :481 — notes = notesForChart = last-12-months fetch
  if (!n?.created_at) continue
  const d = new Date(n.created_at)
  ...
  if (d >= monthStart) visitsThisMonth++ // :489 — lower bound only, no upper bound
  ...
}
```

Source: `notesForChart` (the 12-month fetch at `:565`), not the period-scoped `notes`. The period param (`30d` default from the analytics page, `:192`) does not affect this count.

### (B) `byDay` — 30-day chart feeder — `doctor-stats.ts:485-503`

Bucket assignment (`:485-486, :491`):
```ts
const dayKey = cairoDateKey(d)  // YYYY-MM-DD in Africa/Cairo
...
visitsByDayMap.set(dayKey, (visitsByDayMap.get(dayKey) || 0) + 1)
```

Array emission (`:496-503`):
```ts
const allDayKeys = new Set<string>([...incomeByDayMap.keys(), ...visitsByDayMap.keys()])
const byDay = [...allDayKeys].sort().map((date) => ({
  date,
  income: Math.round(incomeByDayMap.get(date) || 0),
  visits: visitsByDayMap.get(date) || 0,
}))
```

**Sparse**: only dates present as a key in *either* map are emitted. A day with zero notes AND zero payments does not appear.

Window: the full 12-month fetch window — `incomeStartDate = cairoNMonthsAgoStart(12).toISOString()` at `:555`.

Client slice: `apps/clinic/app/(doctor)/doctor/analytics/page.tsx:205` — `const dayData = income?.byDay.slice(-30) ?? []`. This keeps the **last 30 entries** of the sparse array, NOT "the last 30 calendar days". For a low-volume doctor with fewer than 30 populated days across the whole 12-month fetch window, the result is *all populated days* in that window — the "٣٠ يوم" tab label is a lie in that case.

### (C) `byMonth` — 12-month chart feeder — `doctor-stats.ts:486, :505-512`

Bucket assignment (`:486, :492`):
```ts
const monthKey = cairoMonthKey(d)  // YYYY-MM in Cairo
...
visitsByMonthMap.set(monthKey, (visitsByMonthMap.get(monthKey) || 0) + 1)
```

Array emission (`:505-512`):
```ts
const allMonthKeys = new Set<string>([...incomeByMonthMap.keys(), ...visitsByMonthMap.keys()])
const byMonth = [...allMonthKeys].sort().map((month) => ({
  month,
  income: Math.round(incomeByMonthMap.get(month) || 0),
  visits: visitsByMonthMap.get(month) || 0,
}))
```

**Sparse**: same story as `byDay`. A month with zero notes AND zero payments gets no entry. If the current month has no notes/payments, there is no April bar.

Client slice: `page.tsx:206` — `const monthData = income?.byMonth.slice(-12) ?? []`. Last 12 entries of the sparse array.

### (D) Footer "الإجمالي" / "المتوسط" — `page.tsx:338-353`

The footer is computed **client-side** from `chartData` (= `dayData` or `monthData` — the post-slice array):

```ts
`الإجمالي: ${chartData.reduce((s, d) => s + (d.visits || 0), 0)} زيارة`
```

This means:
- On the 30-day view, "الإجمالي: 9" = sum of visits over `byDay.slice(-30)` — NOT sum over last 30 calendar days.
- On the 12-month view, "الإجمالي: 9" = sum of visits over `byMonth.slice(-12)` — NOT sum over last 12 calendar months.

In both cases, the footer matches what you see on the bars because it sums the same array the bars were rendered from. The label is misleading (it suggests "total for the selected window") — the actual meaning is "total across all populated entries that survived the slice".

## 3. Diff table — the three windows

| Dimension                   | Card `visitsThisMonth`                          | `byDay` (30-day chart)                                  | `byMonth` (12-month chart)                              |
| --- | --- | --- | --- |
| Window start                | `cairoMonthStart(now)` — 1st of current Cairo month, 00:00 Cairo | Fetch: `cairoNMonthsAgoStart(12)` — 1st of month 12 ahead, Cairo, 00:00 | Fetch: `cairoNMonthsAgoStart(12)` — same |
| Window end                  | **NONE — unbounded**, future notes count (see §5 Q1) | now (implicitly — `order('created_at', ascending)` + no end filter) | now (same) |
| Start inclusive/exclusive   | Inclusive (`>=`)                                | Inclusive (`>=`)                                       | Inclusive (`>=`)                                       |
| End inclusive/exclusive     | N/A (no end)                                    | Open (no upper bound)                                   | Open (no upper bound)                                   |
| TZ for bucket assignment    | N/A (not bucketed — scalar)                    | **Africa/Cairo** via `cairoDateKey(d)` (`:485`)         | **Africa/Cairo** via `cairoMonthKey(d)` (`:486`)        |
| TZ for window boundary      | **Africa/Cairo** via `cairoMonthStart(now)`    | Africa/Cairo (fetch-only boundary); bucket math also Cairo | Africa/Cairo (fetch-only boundary); bucket math also Cairo |
| Empty-day/month handling    | N/A                                             | **SPARSE — zero-activity days not emitted** (§2-B)      | **SPARSE — zero-activity months not emitted** (§2-C)    |
| Client-side slice           | N/A                                             | `byDay.slice(-30)` — last 30 **entries**, not calendar days | `byMonth.slice(-12)` — last 12 **entries**, not calendar months |
| Date field used from row    | `new Date(n.created_at)` — whole `clinical_notes.created_at` | same                                         | same                                         |
| Source table                | `clinical_notes` (via `notesForChart`, `:565`) | `clinical_notes` ∪ `payments` (UNION of populated keys) | `clinical_notes` ∪ `payments` (UNION of populated keys) |

Asymmetries that matter:
- **Window definition**: the card counts notes in a calendar month (no upper bound). The chart slices "the last N populated entries", which is not a time window at all. These measure *different things*.
- **Sparsity**: card is a scalar count so sparsity doesn't apply, but the chart's sparsity is what makes the current month invisible when no data landed in it.
- **Upper bound on card**: none — future-dated notes inflate `visitsThisMonth` without appearing in `byMonth` under the current month.

## 4. SQL evidence — PENDING

I do not have Supabase credentials in this session. Queries below are to be run verbatim by Mo in the Supabase SQL editor. Each query's decision rule is stated alongside.

> Throughout these queries, `<user_id>` is the result of Q-setup below.

### Q-setup: resolve Dr. Naser's `user_id`
```sql
SELECT u.id AS user_id, u.email, d.id AS doctor_id
FROM public.users u
LEFT JOIN public.doctors d ON d.id = u.id
WHERE u.phone = '01099999902' OR u.email ILIKE '%naser%';
```
Expected: one row. `doctors.id = users.id`.

### Q-A: Cairo vs UTC bucket drift for his payments
```sql
SELECT id, amount, payment_status, clinic_id,
       created_at                                               AS created_utc,
       created_at AT TIME ZONE 'Africa/Cairo'                   AS created_cairo,
       TO_CHAR(created_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') AS cairo_date,
       TO_CHAR(created_at,                              'YYYY-MM-DD') AS utc_date,
       TO_CHAR(created_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM')    AS cairo_month,
       TO_CHAR(created_at,                              'YYYY-MM')    AS utc_month
FROM public.payments
WHERE doctor_id = '<user_id>'
ORDER BY created_at DESC;
```
**Decision rule**: if *any* row has `cairo_date != utc_date` or `cairo_month != utc_month`, H1 would still be a contributor in any path that uses UTC bucketing. In `computeIncomeStats` this is *not* the case (it uses Cairo), but the profile API, frontdesk queries, and a few other surfaces still use server-local math — see §7. Report which rows drift.

### Q-B: same query for notes — is there a note Mo doesn't know about?
```sql
SELECT id, clinic_id,
       TO_CHAR(created_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') AS cairo_date,
       TO_CHAR(created_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM')    AS cairo_month,
       created_at                                                     AS raw_ts
FROM public.clinical_notes
WHERE doctor_id = '<user_id>'
ORDER BY created_at DESC;
```
**Decision rule**: compare the returned rows to what Mo sees on the chart.
- Count rows where `cairo_month = '2026-04'` → this should equal **both** the card's "زيارات الشهر" AND the 12-month chart's April bar (if the fix is deployed). If they differ, the deployed code is not `ed5aa2a` OR the browser has a cached response.
- Look for rows where `raw_ts > now()` (future-dated) — those would inflate `visitsThisMonth` without appearing in `byMonth['2026-04']`. Flag any such rows.

### Q-C: calendar-April vs rolling-30 vs all-time, Cairo-aware
```sql
SELECT
  -- notes
  (SELECT COUNT(*) FROM public.clinical_notes
    WHERE doctor_id = '<user_id>'
      AND (created_at AT TIME ZONE 'Africa/Cairo') >= date_trunc('month', (now() AT TIME ZONE 'Africa/Cairo'))
  ) AS notes_calendar_april_cairo,
  (SELECT COUNT(*) FROM public.clinical_notes
    WHERE doctor_id = '<user_id>'
      AND created_at >= (now() - INTERVAL '30 days')
  ) AS notes_last_30_days_rolling,
  (SELECT COUNT(*) FROM public.clinical_notes
    WHERE doctor_id = '<user_id>'
  ) AS notes_all_time,
  -- payments (completed)
  (SELECT COUNT(*) FROM public.payments
    WHERE doctor_id = '<user_id>' AND payment_status = 'completed'
      AND (created_at AT TIME ZONE 'Africa/Cairo') >= date_trunc('month', (now() AT TIME ZONE 'Africa/Cairo'))
  ) AS pmts_calendar_april_cairo,
  (SELECT COUNT(*) FROM public.payments
    WHERE doctor_id = '<user_id>' AND payment_status = 'completed'
      AND created_at >= (now() - INTERVAL '30 days')
  ) AS pmts_last_30_days_rolling,
  (SELECT COUNT(*) FROM public.payments
    WHERE doctor_id = '<user_id>' AND payment_status = 'completed'
  ) AS pmts_all_time;
```
**Decision rules**, matching UI claims:
- `notes_calendar_april_cairo` should equal the card's "زيارات الشهر" (= 5).
- `notes_last_30_days_rolling` SHOULD equal the 30-day chart's "الإجمالي" (= 9) — **but it won't**, because the chart is `byDay.slice(-30 entries)`, not rolling 30 days. If it doesn't match, that's the sparse-slice bug, not a data bug.
- `notes_all_time` is the upper bound on everything.
- `pmts_calendar_april_cairo` should equal `summary.today + tail` (i.e. the income-side contribution; less interesting here since visits are now from notes).

### Q-D: today (Cairo) — is there a note on April 23 that the 30-day chart is missing?
```sql
SELECT id, clinic_id,
       (created_at AT TIME ZONE 'Africa/Cairo') AS cairo_ts
FROM public.clinical_notes
WHERE doctor_id = '<user_id>'
  AND (created_at AT TIME ZONE 'Africa/Cairo')::date
      = (now()      AT TIME ZONE 'Africa/Cairo')::date;
```
**Decision rule**: if this returns rows, the 30-day chart *should* have a bar labeled `٢٣ أبريل`. If there is no such bar, the fix is not deployed OR the client is cached. The `byDay` map in the current code bucketizes on `cairoDateKey(d)` — a today-note would produce an entry with key `2026-04-23`.

### Q-E: clinic_id scoping — does every April note have clinic_id populated?
```sql
SELECT clinic_id IS NULL AS is_null_clinic, COUNT(*) AS n
FROM public.clinical_notes
WHERE doctor_id = '<user_id>'
  AND (created_at AT TIME ZONE 'Africa/Cairo') >= date_trunc('month', (now() AT TIME ZONE 'Africa/Cairo'))
GROUP BY is_null_clinic;
```
**Decision rule**: if `is_null_clinic = true` has `n > 0`, those notes will be filtered out by the new clinic-scoped fetch at `doctor-stats.ts:198` (`.eq('clinic_id', clinicId)`). Clinic-id-null rows silently vanish — explaining a plausible path to "card shows 5 but byMonth has no April bar" **only if the card's count comes from a different code path**. (It doesn't, in `ed5aa2a` — both card and byMonth read the same post-filter `notes` array. See Q1 answer in §5 for why I'm keeping this query anyway.)

### Q-F: confirm the deploy — does the API actually return data from `ed5aa2a`?
Run from Mo's browser, signed in as Dr. Naser:
```
Open DevTools → Network → reload /doctor/analytics →
  inspect the /api/analytics/doctor-stats?period=30d response.
Look for:
  - income.summary.visitsThisMonth          (value we want to match to Q-C line 1)
  - income.byMonth                           (should contain '2026-04' IF Q-B shows April notes)
  - income.byDay                             (should contain '2026-04-23' IF Q-D returns rows)
```
**Decision rule**: if `byMonth['2026-04']` is absent from the JSON response but Q-B shows April notes (and Q-E shows `clinic_id` is populated), the deployed build is not computing what `ed5aa2a` would compute — the build is stale. If it *is* present in the JSON but not on screen, the client is showing stale state (localStorage / useEffect race / etc.).

## 5. Answers to Q1–Q4

### Q1 — For the 12-month view, why is April missing?

**Not (a) exclusive end-date.** The `byMonth` loop has no date-range filtering at all — every note and every collected payment with `created_at >= incomeStartDate` (12 months ago, Cairo) contributes a bucket keyed by its own Cairo month (`doctor-stats.ts:486, :492`). There is no upper bound and no exclusion of the "current" month.

**Not (b) timezone bucketing (anymore).** `ed5aa2a` replaced UTC date math with Cairo math in `computeIncomeStats` — `cairoMonthKey(d)` at `:486` means a note timestamped 22:30 UTC on March 31 (which is 00:30 Cairo on April 1, post-DST, or 00:30 Cairo on April 1 pre-DST) gets monthKey `2026-04`, not `2026-03`. (The regression tests at `packages/shared/lib/analytics/__tests__/doctor-stats.test.ts:224-239` lock this in.)

**The real cause is (c): sparse aggregation.** The April bar is missing **iff** there are no notes and no completed payments with `cairoMonthKey(d) = '2026-04'` — because the output array only contains months that have an entry in at least one of the two maps (`:505`, union of keys). The chart cannot render a zero bar for a month the server didn't emit. This is intentional in the server code but a UX foot-gun on the client.

The corollary — why this contradicts the card's "5" — has two plausible resolutions per §1 TL;DR:

1. **`visitsThisMonth`-inflating future-dated notes.** `if (d >= monthStart) visitsThisMonth++` (`:489`) has **no `d <= monthEnd`**. A note dated May 1 2026 (or any future month) with `d >= April 1 Cairo` would increment the card while its `monthKey` = `2026-05` — a month that either shows up as a separate bar (if it did, Mo would have mentioned it) or is absent because... wait, it wouldn't be absent if the note has a valid monthKey. So this alone cannot explain "no April bar AND card = 5" unless there's ALSO a May/June bar that got sliced off by `.slice(-12)`. Which is possible if `byMonth.length > 12`.

2. **The build showing the card value is not the build emitting `byMonth`.** Concretely: the HTTP response is from the old code (visits counted from payments, UTC-bucketed) served by a pre-`ed5aa2a` Vercel cache layer or an old client bundle, OR the two screenshots were taken at different times / across a deploy. The internal inconsistency (card = 5 but April absent from byMonth AND no other future-month bars mentioned) can only be produced by *two different code paths serving the same response*, which is what "deployed build != ed5aa2a" looks like.

Run Q-F to distinguish (1) and (2). If Q-F shows `byMonth` does include `2026-04` in the raw JSON, then (2) is wrong and the issue is in the client render (harder — but I didn't find that bug in the page either).

**Exact lines that produce `byMonth`**: `doctor-stats.ts:505-512` (shown in §2-C). **Exact line for `visitsThisMonth`**: `:489`. These are in the same function over the same `notes` array, so the only sources of inconsistency are the unbounded upper comparison (line 489) or a delivery issue (stale build / cache).

### Q2 — For the 30-day view, why is there no bar for today (April 23)?

Same root cause as Q1: sparse aggregation + count-based slicing. `byDay` only contains a `2026-04-23` entry if *some* note or completed payment has `cairoDateKey(d) = '2026-04-23'`. If no note was authored on April 23 Cairo and no payment was collected on April 23 Cairo, there is no key and therefore no bar.

This is NOT "the card says 5 visits this month so there should be something on April 23" — "this month" spans April 1 to now. A doctor can have 5 visits this month that all landed on April 2 and April 3 (2) plus three older days that were sliced off the 30-day chart OR days the chart is correctly showing:
- If there are 5 April notes total, and the chart shows Apr 2 = 1, Apr 3 = 1 (total 2), then 3 April notes are missing from the chart bars. Those 3 must either be (a) in the JSON but not rendered (client bug), or (b) not in the JSON (server bug, most likely the future-dated notes from Q1 or a fetch-truncation issue).

Exact lines producing `byDay`: `doctor-stats.ts:496-503`. Key assignment: `:485`.

Run Q-D to see the ground truth for today. Run Q-F to confirm whether today's entry is in the JSON.

### Q3 — Are the card and the 30-day chart measuring different things on purpose, or is one implemented incorrectly?

**Different things on purpose, and both have real implementation bugs.**

- Card `visitsThisMonth` = **calendar month, Cairo, start-inclusive, end-UNBOUNDED** (`:489`). Correct intent: notes authored during the current Cairo calendar month. Current bug: no end bound → future-dated notes count.
- 30-day chart = **last 30 populated entries of `byDay`, which spans up to the last 12 months** (`:205`, `:555`). Despite the tab label "٣٠ يوم" (30 days), this is **not a 30-day window** — it's a count of populated buckets. For a doctor with only 5 populated days in 12 months, the chart shows all 5 days. For a doctor with 40+ populated days, the chart shows the 30 most recent. The tab label is misleading in both cases.
- 12-month chart = **last 12 populated entries of `byMonth`** — same issue, same misleading label.

These two are measuring *fundamentally different things*: the card is calendar-month bounded; the chart is entry-count bounded. The label on the chart tab is a UX bug, not a data bug — the correct label would be something like "آخر النشاط" ("recent activity") or the chart should pre-fill zero-day buckets to truly represent last-30-calendar-days.

**Valid UX answer**: pick one. Either (a) the card shows a calendar month and the chart shows the same calendar month (two scales agree), or (b) both are rolling windows of identical length. Mixing them is a product UX decision (§7 Fix 3).

### Q4 — If H1 is confirmed, what is the minimum set of files to change to fix TZ consistently?

H1 is **already fixed in `computeIncomeStats`** by `ed5aa2a`, so the analytics page's income numbers are Cairo-correct today. What remains is the rest of the codebase, where server-local date math still leaks:

Files that still use server-local `new Date()` + `.setHours(0,0,0,0)` (or `.slice(0,10)` on UTC ISO strings) for user-facing windows (§6 for line numbers):
- `packages/shared/lib/analytics/doctor-stats.ts:353-392` — `computeWeeklyComparison` builds `weekStart/prevStart` with `new Date(now); setDate(now.getDate() - 7)`. Server-local day boundary → drifts vs Cairo. Feeds `weeklyComparison` in the response (used by sections of the analytics page and any future dashboard).
- `packages/shared/lib/analytics/doctor-stats.ts:265, :286, :292` — `computeTrends`/`computeTrendsWithEvents` bucket by `note.created_at.slice(0, 10)` — this is the **UTC** date string, not Cairo. Feeds `trends` in the response.
- `packages/shared/lib/api/handlers/frontdesk/queue/today/handler.ts:45, :54, :60` — frontdesk "today" queue windows, server-local.
- `packages/shared/lib/api/handlers/frontdesk/checkin/handler.ts:37` — frontdesk check-in "today", server-local.
- `apps/clinic/app/api/frontdesk/payments/route.ts:53, :63, :69` — payments "today" endpoint, server-local.
- `apps/clinic/app/api/frontdesk/payments/update/route.ts:73` — same.
- `packages/shared/lib/data/frontdesk.ts:1050` — same.
- `packages/shared/lib/api/handlers/doctor/appointments/handler.ts:198` — doctor appointments "today", server-local.

Of these, only `doctor-stats.ts` feeds the analytics page. The rest feed other surfaces (frontdesk, appointments) and are out of scope for *this* bug but should be considered when the shared helper migration lands.

**Minimum set to fix the current analytics-page TZ gaps**: `packages/shared/lib/analytics/doctor-stats.ts` (switch `computeTrends`/`computeTrendsWithEvents`/`computeWeeklyComparison` from server-local to `cairo-date.ts` helpers). That's **one file** for the analytics page's remaining TZ leaks.

**Minimum set to fix the sparse-chart bug (the real issue per §1)**: either
- `packages/shared/lib/analytics/doctor-stats.ts` (pre-fill zero-day/zero-month buckets server-side over a true time window), OR
- `apps/clinic/app/(doctor)/doctor/analytics/page.tsx` (do the pre-fill on the client, replacing `.slice(-30)` with a date-range materialization).

Recommendation (for the future fix PR, not this run): server-side. The server already knows the fetch window via `cairoNMonthsAgoStart(12)`; adding a day-loop from `cairoNDaysAgo(30)` to `cairoTodayEnd` and filling zeros is straightforward. Keeps the client thin.

## 6. Blast radius inventory (as requested in Step 5)

### 6.1 `setHours(0, 0, 0, 0)` — server-local midnight
| File | Line | What window | User-facing? |
| --- | --- | --- | --- |
| `packages/shared/lib/data/frontdesk.ts` | 1050 | "today" for frontdesk metrics | Yes (frontdesk stats) |
| `packages/shared/lib/api/handlers/frontdesk/checkin/handler.ts` | 37 | "today" check-in eligibility | Yes (frontdesk flow) |
| `packages/shared/lib/api/handlers/frontdesk/queue/today/handler.ts` | 45, 54, 60 | Today queue windows | Yes (frontdesk dashboard) |
| `apps/clinic/app/api/frontdesk/payments/route.ts` | 53, 63, 69 | Payments "today" / date range | Yes (frontdesk payments page) |
| `apps/clinic/app/api/frontdesk/payments/update/route.ts` | 73 | Today boundary on update | Yes |
| `packages/shared/lib/api/handlers/doctor/appointments/handler.ts` | 198 | "Today's appointments" | Yes (doctor appointments) |

None of these feed the analytics page directly. They are all TZ-latent for Cairo users the same way the analytics page was before `ed5aa2a`.

### 6.2 `.slice(0, 10)` / `.slice(0, 7)` on `created_at` — UTC date extraction
| File | Line | What it does |
| --- | --- | --- |
| `packages/shared/lib/analytics/doctor-stats.ts` | 265 | `computeTrends` bucket key (UTC, not Cairo) |
| `packages/shared/lib/analytics/doctor-stats.ts` | 286 | `computeTrendsWithEvents` session bucket key |
| `packages/shared/lib/analytics/doctor-stats.ts` | 292 | `computeTrendsWithEvents` duration bucket key |

Feed the `DoctorStatsResult.trends` field. The analytics page does not currently render `trends`, but any caller that does gets a UTC view, not a Cairo view.

### 6.3 `new Date(y, m, 1)` manual month-start
No matches. The few remaining server-local month-starts use `setDate(1) + setHours(0,0,0,0)` chained off `new Date()` — grep pattern `setDate(1)` also returned no matches, which means the profile API was migrated (uses `cairoMonthStart()` at `route.ts:62`) and no other surface uses this idiom anymore.

### 6.4 Raw `date_trunc` in `.ts` strings
No matches. All date-trunc work happens in JS or is pushed to Postgres via parameterized ranges, not raw-text SQL.

### 6.5 Imports of `date-fns-tz`
No matches. The repo does not have `date-fns-tz` installed — a good sign (one fewer thing to migrate from). The in-house `packages/shared/lib/date/cairo-date.ts` is the canonical Cairo-aware utility.

### 6.6 `Africa/Cairo` usage
Only in `packages/shared/lib/date/cairo-date.ts` (the helpers) and `packages/shared/lib/analytics/doctor-stats.ts` (the caller). No other file has been migrated yet.

## 7. Proposed fix outline — DO NOT IMPLEMENT

Four independent fixes. None of them need to be bundled into a single PR.

### Fix 1 — Close the `visitsThisMonth` upper-bound hole (one-line, localized)

- Change `doctor-stats.ts:489` from:
  ```ts
  if (d >= monthStart) visitsThisMonth++
  ```
  to:
  ```ts
  if (d >= monthStart && d <= monthEnd) visitsThisMonth++
  ```
  and add `const monthEnd = cairoMonthEnd(now)` at `:451`. Same change mirrored for `incomeThisMonth` at `:469`.
- Architectural impact: none. A helper `cairoMonthEnd` already exists at `packages/shared/lib/date/cairo-date.ts:76`.
- **No product decision needed** — "visits this month" always meant "in this calendar month", and counting future-dated notes is unambiguously a bug.
- Add a regression test: a future-dated note must not increment `visitsThisMonth`.

### Fix 2 — Stop the chart being sparse (medium, server-side)

Pre-fill zero buckets server-side for the chart window(s) so the current day/month always shows a bar (possibly zero-height) instead of vanishing.

- File: `packages/shared/lib/analytics/doctor-stats.ts` (only).
- Approach: after the `for (const n of notes)` loop, synthesize a list of all Cairo dates from `cairoNDaysAgoStart(30)` through `cairoTodayEnd()` and all Cairo months from `cairoNMonthsAgoStart(11)` through `cairoMonthEnd()`, and emit entries with `visits: 0, income: 0` for any not already present. Adds two helper calls (`cairoNDaysAgoStart`, already in the module spirit; add if not present — currently `cairoNMonthsAgoStart` exists but there is no "N days" counterpart, so one tiny helper may need to be added to `cairo-date.ts`).
- **Product decision needed?** Mild. Pre-filling zeros changes the chart's visual density (a doctor with sparse activity will see many empty bars). If Mo prefers the current "only populated days" UX, this fix becomes a **client-side relabel + bound-clip** instead: rename the tab from "٣٠ يوم" to something like "آخر النشاط" (recent activity) and/or clip `byDay.slice(-30)` to only entries within `cairoNDaysAgoStart(30)`. My recommendation is the server pre-fill — it's what users expect from a "last 30 days" chart and makes the visual window honest.
- Client change: none if server pre-fills. If client-side approach, change `page.tsx:205-206` to filter by Cairo date comparison.

### Fix 3 — Align the card and the chart on ONE window (product call)

Right now the card is calendar-month and the chart is last-N-populated-entries. These don't agree by construction. Mo needs to pick:
- **(a) Both calendar-scoped** — card = current month, chart tabs = this calendar week / this calendar month / last calendar 12 months. Labels are intuitive, totals match naturally. Requires re-spec'ing the three tabs.
- **(b) Both rolling** — card = last 30 days rolling, chart = last 30 days / last 12 months rolling. Same. Labels are honest if implemented.
- **(c) Keep as-is and fix the labels** — rename the 30-day and 12-month tabs to something that doesn't imply a time window (e.g. "آخر النشاط اليومي" / "آخر النشاط الشهري") and accept that card and chart disagree.

This is a product decision. Recommend (a) because it matches the word "شهر" (month) that already appears on the card and is the mental model Egyptian clinic users expect from a bookkeeping view.

### Fix 4 — Finish the TZ migration for the rest of the app (tracking, not hotfix)

Migrate the six frontdesk/appointment files listed in §6.1 from `setHours(0,0,0,0)` to the `cairo-date.ts` helpers. And migrate `doctor-stats.ts` `computeTrends` / `computeTrendsWithEvents` / `computeWeeklyComparison` (lines 265, 286, 292, 353-392) from UTC-slicing to Cairo bucketing.

- Not user-visible for the analytics page today (trends aren't rendered; weeklyComparison isn't rendered). **But** if any of those fields are promoted to UI later, they will quietly regress to server-local TZ. Worth doing proactively.
- Architecturally: completes the policy that *all* date boundaries go through `cairo-date.ts`. Grep ban: after this migration, there should be zero hits for `setHours(0,0,0,0)` in `packages/shared` or `apps/clinic` outside `cairo-date.ts`. A CI lint could enforce that.

### What MUST be confirmed before any fix

- **Q-F**: is `byMonth['2026-04']` actually present in the live JSON response? If yes, the bug is client-side and Fix 2 alone won't solve Mo's symptom — we need a separate client-side investigation. If no, Fix 2 is the correct primary intervention.
- **Q-B + Q-E**: are Dr. Naser's April notes real, and do they have `clinic_id` populated? If some have `clinic_id = NULL`, there is a latent bug around note creation that also needs a separate fix (not in scope here — flagged for the next ticket).

## 8. Bonus findings — not the reported bug, log-don't-fix

1. **"المتوسط" divides by `filter(d.visits > 0).length`, not `chartData.length`** — `page.tsx:347-349`. For a chart with lots of zero-visit days in the slice (once Fix 2 pre-fills zeros), the average will jump because the denominator shrinks. Fine *today* because the chart is sparse and all entries have `visits > 0`, but will behave oddly after Fix 2. Should be `chartData.length` to reflect the full window average, or the label should change to "متوسط الأيام النشطة" (average of active days).

2. **Chart tab switch does not re-fetch** — `page.tsx:191-200` fetches once on mount with `period=30d` and never varies. If Mo adds additional period tabs (7d / 90d) they will not change the fetch — the period only affects `summary/totalSessions/trends/weeklyComparison` server-side, not income. The chart's "٣٠ يوم / ١٢ شهر" tabs only re-slice the same response. Mentioning for symmetry — may or may not be desired.

3. **`fetchClinicalNotes` is called twice** — `doctor-stats.ts:564, :565` — once with the period window and once with the 12-month window. If the period is `'30d'`, the two fetches overlap and the first one is basically a subset of the second. Could be consolidated to one 12-month fetch + in-memory period filter, saving one DB round-trip.

4. **`created_at` ordering is `ascending` in the fetch** (`:196, :414`) but there is no `LIMIT` and no pagination. With Supabase's implicit 1000-row limit, a doctor who generates > 1000 notes in 12 months would see the OLDEST 1000 notes returned and the NEWEST notes truncated. This is not a near-term risk for Dr. Naser (~35 notes) but is a real correctness issue for high-volume doctors. Worth flagging.

5. **`byDay.slice(-30)` on the client, `byMonth.slice(-12)` on the client** — consistent label-vs-actual-behavior mismatch (already covered in §2 and §5). Mentioned here again as the "bonus finding" you'd otherwise look for if you only read §5.

6. **`computeSummary` counts `uniquePatients` as `new Set(notes.map(n => n.patient_id))`** — `doctor-stats.ts:217-218` — the `notes` it receives is the `period` window, not the 12-month window. So `summary.uniquePatients` is "unique patients in last 30 days" by default, not "unique patients ever". Intentional but easy to misread when debugging.

7. **`monthEnd` is never computed in `computeIncomeStats`.** Only `monthStart`. Fix 1 calls for adding it; cheap and worth doing at the same time as Fix 1.

---

**Report path**: `/tmp/analytics-windows-bug-report.md`

**End of report. No files were modified in this session.**
