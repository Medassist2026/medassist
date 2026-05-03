# Audit Session B — Doctor Fees Usage Check

**Captured:** 2026-05-03
**Scope:** every reference in `apps/` and `packages/` to columns from migration 022 (`consultation_fee_egp`, `followup_fee_egp`, `followup_window_days`).
**Method:** `grep -rn` for the literal column names plus property-access patterns (`.consultation_fee`, `.fees.consultation`, `doctor.fees`, `doctor_fees`).

## Verdict

**USED — 7 callsites in 7 files. All read-or-write the missing columns. All will fail at runtime on staging today.**

Migration 022 is in the repo (`supabase/migrations/022_doctor_fees.sql`) but has never been applied to staging — none of the three columns exist on `public.doctors`. Staging's `doctors` table has 6 columns (id, unique_id, specialty, default_template_id, created_at, full_name); none of the fee columns are present.

The seven callsites below would respond with HTTP 500 (PostgreSQL error: "column doctors.consultation_fee_egp does not exist") on staging today if exercised.

Mo's launch plan does not include doctor pricing. Two paths forward (deferred to Session C / product call):

* **Path A — apply mig 022:** the columns become available; existing app code keeps working; the fees UI ships. This is the smaller change but contradicts the launch-plan ruling.
* **Path B — retire mig 022 + delete the seven callsites:** the file is removed; the seven app code paths are deleted. This is the cleaner long-term outcome but requires a follow-up cleanup PR.

Neither path is taken in this audit. Findings only.

## Reachability summary

The seven callsites are wired up to UI flows, so they're not dead code:

| Endpoint | Caller | UI surface |
|---|---|---|
| `GET /api/doctor/stats` | `apps/clinic/app/(doctor)/doctor/profile/page.tsx:165`<br>`packages/ui-clinic/components/doctor/SettingsDrawer.tsx:25` | Doctor profile/settings sidebar |
| `GET/PATCH /api/frontdesk/doctors/fees` | `apps/clinic/app/(frontdesk)/frontdesk/payments/page.tsx:142` | Frontdesk payments page (fee lookup before invoicing) |
| `GET /api/doctor/public-fee` | `packages/ui-clinic/components/frontdesk/PaymentForm.tsx:75` | Payment form auto-fill |
| `GET/POST /api/doctor/settings` | (referenced but no in-tree caller located in this scan) | Likely doctor "fees" settings drawer (see settings handler) |
| `GET /api/frontdesk/invoice/[paymentId]` | (invoice download) | Frontdesk invoice generation |

The `payments` page and `PaymentForm` are part of the active frontdesk flow (the wedge product), so any frontdesk user landing on `/frontdesk/payments` and selecting a doctor would trigger one of these failing queries.

## Per-callsite detail

### 1. `apps/clinic/app/api/doctor/stats/route.ts:151-152`

Operation: **READ** (after-fetch property access; doctor row is read separately).

```
150:        uniqueId: doctor.unique_id || '',
151:        consultationFee: (doctor as any).consultation_fee_egp || 0,
152:        followupFee: (doctor as any).followup_fee_egp || 0,
153:      },
```

The `(doctor as any)` cast is a TypeScript escape — it suggests the codebase's generated types do not include these columns either, so the author knew they were "extra" and bypassed the type check. On staging the Supabase row will not contain these keys; both expressions evaluate to `0` via `|| 0`, so this specific callsite is silently fine (no PostgreSQL error if `doctor` was selected with `*` or a column list that didn't name them).

**Status: silently degrades to 0 — does not throw on staging.** Only an issue if a different caller selects these columns by name.

### 2. `apps/clinic/app/api/frontdesk/doctors/fees/route.ts:32 (READ), :89/97/105 (WRITE)`

Operation: **READ + WRITE** (both GET and PATCH).

```
 31:      .from('doctors')
 32:      .select('id, full_name, consultation_fee_egp, followup_fee_egp, followup_window_days')
 33:      .in('id', doctorIds)
```

```
 84:    if (consultation_fee_egp !== undefined) {
...
 89:      updates.consultation_fee_egp = Math.round(fee)
 92:    if (followup_fee_egp !== undefined) {
...
 97:      updates.followup_fee_egp = Math.round(fee)
100:    if (followup_window_days !== undefined) {
...
105:      updates.followup_window_days = Math.round(days)
```

**Status: 500 on staging** — both the SELECT (named columns) and the UPDATE (named columns in the `updates` object passed to `.update()`) will fail.

### 3. `apps/clinic/app/api/frontdesk/invoice/[paymentId]/route.ts:60`

Operation: **READ**.

```
 58:    const { data: doctor } = await supabase
 59:      .from('doctors')
 60:      .select('id, specialty, consultation_fee_egp, followup_fee_egp')
 61:      .eq('id', payment.doctor_id)
```

**Status: 500 on staging** when invoice generation is requested.

### 4. `apps/clinic/app/(frontdesk)/frontdesk/payments/page.tsx:31-32, 230-231`

Operation: **READ** (TS type declaration + client-side property access).

```
 30:  full_name: string
 31:  consultation_fee_egp: number
 32:  followup_fee_egp: number
 33:}
...
229:      const fee = doctorFees.find(d => d.id === q.doctor_id)
230:      if (fee && fee.consultation_fee_egp > 0 && !amount) {
231:        setAmount(String(fee.consultation_fee_egp))
```

The page consumes `/api/frontdesk/doctors/fees` (callsite 2 above). If callsite 2 fails, `doctorFees` will be empty/undefined and the page will degrade — it will not throw client-side, but the auto-fill won't work.

**Status: client-side degrades silently; root cause is callsite 2.**

### 5. `packages/shared/lib/api/handlers/doctor/settings/handler.ts:18 (READ), :61-63 (WRITE)`

Operation: **READ + WRITE**. The handler appears to back the GET/POST `/api/doctor/settings` route.

```
 17:      .from('doctors')
 18:      .select('consultation_fee_egp, followup_fee_egp, followup_window_days')
 19:      .eq('id', user.id)
...
 60:    const updates: Record<string, any> = {}
 61:    if (consultation_fee_egp !== undefined) updates.consultation_fee_egp = Math.round(consultation_fee_egp)
 62:    if (followup_fee_egp !== undefined) updates.followup_fee_egp = Math.round(followup_fee_egp)
 63:    if (followup_window_days !== undefined) updates.followup_window_days = Math.round(followup_window_days)
```

**Status: 500 on staging.** Note: the in-tree fetch caller for this route was not located in the grep — it may be wired through a route file at `apps/clinic/app/api/doctor/settings/route.ts` (typical Next.js pattern) but no client `fetch('/api/doctor/settings')` was found in the scan. Possibly invoked by the Settings drawer.

### 6. `packages/shared/lib/api/handlers/doctor/public-fee/handler.ts:27`

Operation: **READ**.

```
 26:      .from('doctors')
 27:      .select('consultation_fee_egp, followup_fee_egp, followup_window_days')
 28:      .eq('id', doctorId)
...
 32:      return NextResponse.json({
 33:        consultation_fee_egp: 0,
 34:        followup_fee_egp: 0,
 35:        followup_window_days: 14,
 36:      })
```

The handler has a fallback to `(0, 0, 14)` when the row is null, but the SELECT itself names the columns and will return a Supabase error on staging.

**Status: 500 on staging** — caller `PaymentForm.tsx:75` will receive an error response.

### 7. `packages/ui-clinic/components/frontdesk/PaymentForm.tsx:79-84`

Operation: **READ** (client-side property access on the response).

```
 75:        const res = await fetch(`/api/doctor/public-fee?doctorId=${selectedDoctor}`)
...
 78:          setDoctorFee({
 79:            consultation: data.consultation_fee_egp || 0,
 80:            followup: data.followup_fee_egp || 0,
 81:          })
 82:          // Auto-fill amount with consultation fee if not already set
 83:          if (!amount && data.consultation_fee_egp > 0) {
 84:            setAmount(String(data.consultation_fee_egp))
```

Consumes callsite 6. Degrades silently if the API returns an error (`data` undefined → `data.consultation_fee_egp` throws on the access — actually this could surface as a client-side TypeError if not guarded; the surrounding code does check `res.ok` so the form will probably just skip auto-fill).

**Status: client-side degrades; root cause is callsite 6.**

## Migration file 022 — verbatim

```sql
-- ============================================================================
-- Migration 022: Doctor Fees & Consultation Settings
-- Adds consultation and follow-up fee fields for Egyptian clinic model
-- ============================================================================

ALTER TABLE doctors ADD COLUMN IF NOT EXISTS consultation_fee_egp integer DEFAULT 0;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS followup_fee_egp integer DEFAULT 0;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS followup_window_days integer DEFAULT 14;

COMMENT ON COLUMN doctors.consultation_fee_egp IS '...';
COMMENT ON COLUMN doctors.followup_fee_egp IS '...';
COMMENT ON COLUMN doctors.followup_window_days IS '...';
```

The migration is `IF NOT EXISTS` — applying it now would be a safe no-op if the columns were already present, and a clean add if they aren't.

## Recommendations (for Session C / Mo)

1. **Decide the product question first.** Mo's ruling for this audit was "doctor pricing not in launch plan." But the seven callsites are not just typedefs — they are exposed routes and active UI. Whichever path is chosen, it should land in one PR.
2. **If retiring (Path B): seven callsites + the migration file = atomic deletion target.** The seven callsites are not load-bearing for the wedge product (frontdesk creates receipts manually); the launch plan supports removal.
3. **If keeping (Path A): apply migration 022 unchanged.** Three columns, all `IF NOT EXISTS`, all with safe defaults. No data backfill required.
4. **Either way: surface this in Session C's reconciliation table.** Mig 022 is the single largest "claimed-by-file-but-not-on-staging" gap for active code paths.
