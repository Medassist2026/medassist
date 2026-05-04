# Doctor Analytics Bug — Diagnostic Report

Author: Claude (diagnostic run)
Date: 2026-04-22
Scope: READ-ONLY. No files modified, no migrations, no schema changes.

---

## 1. TL;DR

The analytics page shows zeros because `packages/shared/lib/analytics/doctor-stats.ts:411` filters payments with `p.payment_status !== 'paid'`, but the `payments` table only ever stores `'completed'` (per migration `006_front_desk_module.sql:71` and the frontdesk insert at `packages/shared/lib/data/frontdesk.ts:1032`) — so 100% of legitimate payments are skipped. The "." glyphs on the summary cards are not a separate bug: `(0).toLocaleString('ar-EG')` returns `٠` (Arabic-Indic digit zero, U+0660), which renders as a small circle visually indistinguishable from a period in most Cairo-family fonts; the real issue is still that the underlying values are 0. A third, separate bug surfaces the "two clinic names on one screen" symptom — the profile API picks `clinic_memberships[0]` with no filter while the top-right badge uses `getClinicContext()` with cookie + OWNER-first sort — these two paths can legitimately resolve to different clinics for a multi-clinic doctor like Dr. Naser.

## 2. Bug A — the "." rendering

**What Mo is seeing is not a literal period.** It is the Arabic-Indic digit zero `٠` (U+0660).

- `apps/clinic/app/(doctor)/doctor/analytics/page.tsx:43–45` defines `formatEGP(n) = n.toLocaleString('ar-EG')`.
- Called at `:250` → `${formatEGP(income.summary.today)} ج.م`.
- Called at `:257` → `income.summary.visitsToday.toLocaleString('ar-EG')`.
- Called at `:264` → `${formatEGP(income.summary.thisMonth)} ج.م`.
- Called at `:271` → `income.summary.visitsThisMonth.toLocaleString('ar-EG')`.

When the analytics API returns `today: 0, thisMonth: 0, visitsToday: 0, visitsThisMonth: 0`, all four cards render `٠`. In the Cairo font used by the app, `٠` is a tiny filled circle that sits on the baseline, visually near-identical to a Latin period `.`. Mo is reading the glyph as `.`.

**Cause:** not a code bug in the formatter — the input values are legitimately 0, and Arabic-Indic zero happens to look like a dot. There is *no* `${value}.` template and *no* `?? '.'` fallback — the supposed Bug A disappears once Bug B is fixed, because the numbers stop being 0.

**Secondary observation (same cluster):** the "no data" chart message at `apps/clinic/app/(doctor)/doctor/analytics/page.tsx:69` (`لا توجد بيانات`) is also a direct consequence of Bug B — `byDay` and `byMonth` come back empty from the same broken payments filter.

## 3. Bug B — analytics returns empty for a doctor with 35 sessions

**Root cause: the payment-status filter value is wrong.**

`packages/shared/lib/analytics/doctor-stats.ts:411`:
```ts
if (p.payment_status !== 'paid' && p.payment_status !== null) continue
```

The `payments` table's `payment_status` column is constrained to `('pending', 'completed', 'refunded', 'cancelled')` — there is no `'paid'` value. Evidence:

- Schema: `supabase/migrations/006_front_desk_module.sql:71`
  `payment_status TEXT DEFAULT 'completed' CHECK (payment_status IN ('pending', 'completed', 'refunded', 'cancelled'))`
- Insert site: `packages/shared/lib/data/frontdesk.ts:1032` — always writes `payment_status: 'completed'`.
- Correct query idiom used elsewhere: `packages/shared/lib/data/frontdesk.ts:1072`
  `.eq('payment_status', 'completed')`.
- Frontdesk UI distinguishes voided rows using `'cancelled' | 'refunded'` at `apps/clinic/app/(frontdesk)/frontdesk/payments/page.tsx:561`.
- No subsequent migration introduces a `'paid'` value or renames the column (verified by grepping all `ALTER TABLE ... payments` statements across migrations 019/040/042/044).

**Consequence:** For every row `payments.payment_status === 'completed'`, the check `'completed' !== 'paid' && 'completed' !== null` → `true && true` → `continue`. The analytics loop skips every real payment. `incomeToday`, `visitsToday`, `incomeThisMonth`, `visitsThisMonth` all stay at 0. `byDayMap` and `byMonthMap` are never populated. The page shows four zeros and "لا توجد بيانات".

**Second, related cause (why even fixing Bug B alone may not yield 35 visits):** the analytics page's "visits" counter counts **payments rows**, not clinical sessions. The profile page counts **clinical_notes rows**. These are different tables, populated by different user actions:

- Profile "35 جلسة مكتملة" → `clinical_notes.doctor_id = user.id` count (`apps/clinic/app/api/doctor/stats/route.ts:84–87`).
- Analytics "visits this month" → `payments` rows filtered by `doctor_id` + `payment_status = 'paid'` (currently broken) (`packages/shared/lib/analytics/doctor-stats.ts:404–421`).

If Dr. Naser's clinic records clinical notes but not payments for every session (likely — Egyptian clinics often only record a payment when cash is taken, and development accounts may have notes but no payments at all), fixing the `'paid' → 'completed'` typo will still under-report compared to profile. A proper fix should reconcile what "visit" means on each screen; at minimum the two pages need to use the same source or label differently.

## 4. Diff table — profile stats path vs analytics stats path

| Dimension | Profile path (`/api/doctor/stats`) | Analytics path (`/api/analytics/doctor-stats`) | Differ? |
| --- | --- | --- | --- |
| Supabase client | `createAdminClient('doctor-stats')` + server `createClient` for auth | `createAdminClient('doctor-stats-*')` (three scoped admin clients) | same pattern |
| Doctor ID source | `user.id` from `requireApiRole('doctor')` → `supabase.auth.getUser()` | identical: `requireApiRole('doctor')` | same |
| Clinic scoping | Lists all `clinic_memberships` for `user_id`, picks `[0]` into `clinic.name`. No filter on role/status. No cookie awareness. | **None.** Queries `clinical_notes`, `analytics_events`, `payments` filtered only by `doctor_id` / `user_id`. | **DIFFER** — analytics ignores clinic; profile picks an arbitrary clinic |
| Source table — "sessions/visits" | `clinical_notes` (count only) | `clinical_notes` (for `summary.totalSessions` and `uniquePatients`) **AND** `payments` (for `summary.visitsToday/Month`, `byDay`, `byMonth`) | **DIFFER** — the user-facing "visits" cards come from payments |
| Source table — "revenue" | `payments` with filter `.eq('status','paid')` — **broken** (column is `payment_status`; value doesn't exist) | `payments` with `payment_status !== 'paid'` skip — **broken** | Both broken, different wrong forms |
| Date/TZ handling — "today" | Not used directly; only "this month" via JS `new Date(); setDate(1); setHours(0,0,0,0)` (server-local TZ) | JS `new Date(); setHours(0,0,0,0)` / `new Date(year,month,1)` (server-local TZ). `'this month'` uses server-local TZ, not Africa/Cairo. | Both use server-local; both would drift from Cairo date near midnight |
| Date/TZ handling — "this month" | server-local `startOfMonth.toISOString()` sent to DB | computed client-side in JS after fetching last 12 months from DB | Different mechanics, same TZ assumption |
| Null/error handling at API | No error checks on payments query; `(payments ?? []).reduce(...)` silently yields 0 | `throw new Error(...)` if query fails; but the filter-bug case returns successfully with empty/zeroed data | Profile silently hides the broken revenue; analytics surfaces it as zeros |
| Null/error handling at client | Profile only renders the revenue card `if (data.stats.totalFees > 0)` — broken value is hidden | Analytics always renders the four summary cards, even when 0 | **DIFFER** — broken behavior is invisible on profile, visible on analytics |

Every DIFFER row in this table is a contributor to the bug or to why the same broken code path doesn't look broken on the profile page.

## 5. SQL queries to confirm on the dev DB

I don't have Supabase credentials wired in this session — I did not execute SQL against the live DB. Please run these in the Supabase SQL editor. Each one's expected answer is stated below, based on the code evidence alone.

```sql
-- 3a — find Dr. Naser
SELECT u.id AS user_id, u.email, u.role, d.id AS doctor_id, d.specialty
FROM public.users u
LEFT JOIN public.doctors d ON d.id = u.id
WHERE u.phone = '01099999902' OR u.email ILIKE '%naser%';
```
Expected: one row. `doctors.id = users.id` is the convention (see `apps/clinic/app/api/doctor/stats/route.ts:22` — `.eq('id', user.id)`).

```sql
-- 3b — all memberships for Dr. Naser
SELECT cm.clinic_id, c.name AS clinic_name, cm.role, cm.status, cm.created_at
FROM public.clinic_memberships cm
JOIN public.clinics c ON c.id = cm.clinic_id
WHERE cm.user_id = '<user_id from 3a>'
ORDER BY cm.created_at;
```
Expected: **≥2 rows** — one for each of "عيادة د. أحمد" and "عيادة د. ناصر حسن" (this would explain the two-clinic-names symptom).

```sql
-- 3c — clinical notes by Dr. Naser, grouped by clinic
SELECT clinic_id, COUNT(*) AS note_count,
       MIN(created_at) AS first, MAX(created_at) AS last
FROM public.clinical_notes
WHERE doctor_id = '<user_id from 3a>'
GROUP BY clinic_id;
```
Expected: total ≈ 35 (matches profile). May split across multiple clinic_ids.

```sql
-- 3d — distinct patients this month (Cairo TZ), grouped by clinic
SELECT clinic_id, COUNT(DISTINCT patient_id) AS distinct_patients
FROM public.clinical_notes
WHERE doctor_id = '<user_id from 3a>'
  AND created_at >= date_trunc('month', now() AT TIME ZONE 'Africa/Cairo')
GROUP BY clinic_id;
```
Expected: 20 total to match profile. (Profile query at `route.ts:77–81` uses `doctor_patient_relationships.status='active'` — a *different* source than this query; results may differ. See Q4 below.)

```sql
-- 3e — payments for this doctor this month, grouped by clinic + status
SELECT clinic_id, payment_status, COUNT(*) AS n, SUM(amount) AS total
FROM public.payments
WHERE doctor_id = '<user_id from 3a>'
  AND created_at >= date_trunc('month', now() AT TIME ZONE 'Africa/Cairo')
GROUP BY clinic_id, payment_status;
```
Expected (critical): rows with `payment_status = 'completed'` (or none at all if no payments were ever entered). **No rows with `payment_status = 'paid'`.** If this query returns `'completed'` rows, Bug B is confirmed end-to-end. If it returns zero rows, there's an additional upstream issue: no payments are being written for Dr. Naser.

```sql
-- 3f — total payments ever for this doctor
SELECT payment_status, COUNT(*) FROM public.payments
WHERE doctor_id = '<user_id from 3a>'
GROUP BY payment_status;
```
Expected: either zero rows, or rows with `'completed'` and possibly `'cancelled'` — never `'paid'`.

```sql
-- 3g — sanity: verify column names on payments
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'payments'
ORDER BY ordinal_position;
```
Expected: a `payment_status` column but **no** column named `status`. Confirms that `apps/clinic/app/api/doctor/stats/route.ts:105` `.eq('status', 'paid')` is targeting a non-existent column.

## 6. Answers to Q1–Q6

**Q1 — What does the profile "35 جلسة" actually count?**
`clinical_notes` rows with `doctor_id = user.id` (no date filter for the "totalSessions" field). The "ملخص هذا الشهر" header on the profile card is misleading: `totalSessions` is all-time, and `totalPatients` is all-time `doctor_patient_relationships` with `status='active'`. Only `sessionsThisMonth` (computed but *not actually rendered* on the page) is month-scoped. See `apps/clinic/app/api/doctor/stats/route.ts:84–97` and `apps/clinic/app/(doctor)/doctor/profile/page.tsx:331–345`. This is itself a minor bug — the header lies — but orthogonal to the main issue.

**Q2 — What do the analytics "visits today / this month" count?**
Rows in `payments` for this doctor, filtered by the broken `payment_status !== 'paid'` check, then bucketed by day/month. It does **not** read `clinical_notes`, `check_in_queue`, or `appointments`. See `packages/shared/lib/analytics/doctor-stats.ts:368–453`. Even after Bug B is fixed, this will not match the profile's session count unless every clinical note has a corresponding payment row.

**Q3 — Does analytics scope by clinic_id? How?**
**No.** The analytics API scopes only by `doctor_id` (or `user_id` for events). It never reads the active-clinic cookie, never calls `getClinicContext()`, and never joins against `payments.clinic_id`. See `packages/shared/lib/analytics/doctor-stats.ts:142, 161, 373`. For a single-clinic doctor this is fine; for a multi-clinic doctor it will sum data across all their clinics silently — which contradicts the app's multi-tenant model.

**Q4 — Does profile scope by clinic_id?**
No for data, yes for display. The profile API scopes its data queries by `doctor_id` only (same as analytics). It queries `clinic_memberships` to pick ONE clinic name to display, but without filtering by `status='ACTIVE'` or role, and without consulting the `active_clinic_id` cookie — it simply takes `allClinics[0]`. See `apps/clinic/app/api/doctor/stats/route.ts:40–74`. Meanwhile the top-right clinic badge is rendered by `DoctorShell` using `getClinicContext()` (`apps/clinic/app/(doctor)/layout.tsx:47–59`), which *does* respect the cookie and sorts OWNER first (`packages/shared/lib/data/clinic-context.ts:232–250`). **This inconsistency is the cause of the "عيادة د. أحمد" vs "عيادة د. ناصر حسن" two-names-on-one-screen symptom.** It is *not* a cause of the zero analytics — the data queries on both pages use `doctor_id` only.

**Q5 — What timezone does "today" / "this month" use?**
Server-local TZ (i.e. Vercel container TZ, typically UTC). Both APIs use raw `new Date()` + `setHours(0,0,0,0)` with no `Africa/Cairo` conversion. See `packages/shared/lib/analytics/doctor-stats.ts:386–394` and `apps/clinic/app/api/doctor/stats/route.ts:89–91`. For a clinic operating in GMT+2/+3, this means sessions completed between Cairo midnight and UTC midnight will be filed to the wrong day — a real bug that would show as stats "jumping" around 02:00–03:00 Cairo time. Contrast with the comment on `IncomeSummary.today` at `packages/shared/lib/analytics/doctor-stats.ts:68` which explicitly claims "Egyptian date, clinic timezone" — the comment is aspirational; the code does not implement it.

**Q6 — What does the analytics API return for a zero/null stat, and what does the client render?**
The API returns `number` (always — the shape is `IncomeSummary { today: number; thisMonth: number; visitsToday: number; visitsThisMonth: number }`). When payments are filtered out, the numbers are all `0`, not null or undefined. On the client:
- `(0).toLocaleString('ar-EG')` → `'٠'` (U+0660, Arabic-Indic digit zero)
- template → `` `${'٠'} ج.م` `` → `'٠ ج.م'`

In the app's Cairo font the glyph `٠` is rendered as a small circle on the baseline, visually similar to a Latin period. Mo's report of `. ج.م` is the rendered Arabic-Indic zero, not a stringified null or a missing value. The only source line that could produce a literal `.` would be something like `${value}.` or `?? '.'`, and neither pattern exists in the file (confirmed by reading `apps/clinic/app/(doctor)/doctor/analytics/page.tsx` end to end).

## 7. Blast radius

Every place that reads the `payments` table with a `'paid'` filter is affected. Grep (`'paid'` case-sensitive across `apps` and `packages/shared`):

| File | Line | Scope |
| --- | --- | --- |
| `packages/shared/lib/analytics/doctor-stats.ts` | 411 | **Bug B** — breaks doctor analytics income + visit stats + charts |
| `apps/clinic/app/api/doctor/stats/route.ts` | 105 | Breaks `totalFees` on profile + SettingsDrawer; hidden by `totalFees > 0` UI gates |

Places that read `/api/doctor/stats` (and therefore show zero revenue, hidden or not):

- `apps/clinic/app/(doctor)/doctor/profile/page.tsx:163` — profile page.
- `packages/ui-clinic/components/doctor/SettingsDrawer.tsx:25` — settings drawer stats block.

Places that read `/api/analytics/doctor-stats` (and therefore render the four "." cards + empty chart):

- `apps/clinic/app/(doctor)/doctor/analytics/page.tsx:192` — analytics page.
- No other callers (grep confirms). This endpoint was introduced as "Feature 6" backend-only and the analytics page is currently its sole consumer.

Other routes checked and cleared:

- `apps/clinic/app/api/frontdesk/payments/route.ts:80` — uses `payment_status` column correctly.
- `apps/clinic/app/api/frontdesk/payments/update/route.ts:51/85/98/140` — correct.
- `apps/clinic/app/api/frontdesk/invoice/[paymentId]/route.ts:36/136` — correct.
- `apps/clinic/app/(frontdesk)/frontdesk/payments/page.tsx:561` — correct.
- `packages/shared/lib/data/frontdesk.ts:1032/1072` — correct (authoritative pattern).

Cron jobs / scheduled tasks that use "today" windows: I grepped for `date_trunc|Africa/Cairo|startOfDay` across cron/task files — none found at the repo root. If any exist outside the read-only scope (e.g. Supabase Edge Functions), they would inherit the same server-local TZ bug as Q5.

Dashboard stats: the doctor dashboard (`apps/clinic/app/(doctor)/doctor/dashboard`) does not hit either endpoint directly (grep confirms). It is not in the blast radius for Bug B, but would need its own audit if Mo introduces "today revenue" there later.

## 8. Proposed fix outline — DO NOT IMPLEMENT

Three independent fixes, in order of urgency:

**Fix 1 — Correct the payment-status filter value (Bug B).**
- Files to change:
  - `packages/shared/lib/analytics/doctor-stats.ts:411` — change the string `'paid'` to `'completed'` (or better: invert the check to `if (p.payment_status === 'cancelled' || p.payment_status === 'refunded') continue`, which is semantically clearer and survives future status additions).
  - `apps/clinic/app/api/doctor/stats/route.ts:105` — change `.eq('status','paid')` to `.eq('payment_status','completed')`. Note this touches *both* the column name and the value.
- Architecture impact: none. Both sites should have been using the canonical pattern in `packages/shared/lib/data/frontdesk.ts:1072` from the start.
- Consider extracting a shared helper: `packages/shared/lib/data/payments.ts` exporting something like `PAYMENT_STATUS_COMPLETED = 'completed'` and a `isCollectedPayment(p)` predicate, to prevent future drift. This would be a small additional PR, not bundled with the hotfix.

**Fix 2 — Reconcile "visits" semantics (root cause of the mental-model mismatch).**
- Decide whether analytics "visits" means (a) clinical sessions (matches profile "35 جلسة", reads `clinical_notes`) or (b) paid transactions (current behavior, reads `payments`). If (a), the fix is to compute `visitsToday/Month` from `clinical_notes` and keep `payments` only for the revenue numbers. If (b), the profile and analytics copy need to stop using the same Arabic word ("جلسة" vs "زيارة") to describe two different things.
- Files potentially affected: `packages/shared/lib/analytics/doctor-stats.ts` (`computeIncomeStats` would need a separate clinical-notes fetch for the visits counts) and the analytics page labels.
- Architecture call: this is a product decision. Recommend (a) because it matches what Mo expected to see.

**Fix 3 — Stop the profile API from lying about which clinic is active (bonus finding).**
- `apps/clinic/app/api/doctor/stats/route.ts:40–74` should use `getClinicContext(user.id, 'doctor')` (the same helper `DoctorShell` uses) instead of re-implementing membership resolution with `allClinics[0]`.
- Architecture call: this is the existing convention — see the CLAUDE.md note about global patient identity and RLS patterns, and note that `getClinicContext` was built specifically to unify this. The profile API predates that unification and should be migrated.
- Files changed: `apps/clinic/app/api/doctor/stats/route.ts` only. No schema changes.

**Shared helpers already available — use them:**
- `getClinicContext(userId, role)` in `packages/shared/lib/data/clinic-context.ts:208` for clinic resolution.
- `createAdminClient(scope)` for admin queries — already used in both routes.
- Consider: a `clinicTimezoneBoundaries(clinicId)` helper returning `{ todayStart, todayEnd, monthStart, monthEnd }` in Africa/Cairo, to replace the server-local `new Date()` boundaries in Q5. This would be a new module under `packages/shared/lib/date/` — not required for the immediate hotfix but needed before Mo can trust "today" numbers.

**Test plan for the hotfix (Fix 1 only):**
- Unit: add a test to `packages/shared/lib/analytics/__tests__` (folder already exists for data/) covering `computeIncomeStats` with `payment_status: 'completed'` rows and asserting they are included.
- Integration: log in as Dr. Naser (01099999902 / Naser1234), open `/doctor/analytics`, confirm the four summary cards show non-zero Arabic numerals when real payments exist, and that the chart renders bars. If they don't, run query 3e/3f to distinguish "Bug B fixed but no payments exist" from "Bug B not fixed".
- Regression: log in as a frontdesk user, confirm the payments page still lists the same rows (it should — that path was not touched).
- RLS: confirm that the admin-client queries in the analytics route remain scoped to a single `doctor_id`. No cross-doctor leak is possible because every query chains `.eq('doctor_id', doctorId)` before the filter.

## 9. Bonus finding — two clinic names on one profile screen

Already covered in Q4 and Fix 3 above. Evidence trail:
- Shell badge path: `apps/clinic/app/(doctor)/layout.tsx:47` → `getClinicContext` → `packages/shared/lib/data/clinic-context.ts:232–250` (cookie-aware, OWNER-first sorted).
- Profile card path: `apps/clinic/app/api/doctor/stats/route.ts:40–74` (no status filter, no role filter, no cookie, picks `[0]`).
- Symptom: for a doctor with memberships in multiple clinics whose insertion order in the DB doesn't match the cookie-selected clinic, the two components show different clinic names.

This is a real clinic-scoping bug, but **it does not contribute to the zero analytics**. The analytics data queries use `doctor_id` only and don't care which clinic is "active". Listing it here so it shows up in the fix queue and isn't mistaken for collateral from Bug B.

## 10. Second bonus finding — the profile header is month-scoped but the stats are all-time

Orthogonal to the reported issue, but visible on the same screen. The card at `apps/clinic/app/(doctor)/doctor/profile/page.tsx:328` is titled "ملخص هذا الشهر" (This Month's Summary) but renders `data.stats.totalPatients` and `data.stats.totalSessions` — both of which the API computes as all-time values (`apps/clinic/app/api/doctor/stats/route.ts:77–87`, no date filter). The month-scoped `sessionsThisMonth` field is computed (`:93–97`) but never displayed. Worth a follow-up — either the header copy is wrong or the card is rendering the wrong field. Again, not a cause of the reported bug, just sharing while I'm in the neighborhood.

---

**End of report.**

No files were modified, no migrations run, no schema changes.
