# Mig 022 — Archive Plan

**Captured:** 2026-05-03
**Author:** Audit Session C
**Locked ruling:** Mo R1 — `022_doctor_fees.sql` retires; columns are NOT being added to staging.

---

## Decision

`supabase/migrations/022_doctor_fees.sql` is retired. The migration file moves to `supabase/migrations/_archived/022_doctor_fees.sql.RETIRED`. The 7 application code callsites that reference its columns are deleted in a Phase F follow-up PR (NOT by Audit Session C).

Audit Session C does NOT perform the file move or the code deletion in this session — Session C only documents the plan. Mo executes the moves and deletions.

## What is being retired

Migration 022 adds three columns to `public.doctors`:

| Column | Type | Default |
|---|---|---|
| `consultation_fee_egp` | integer | 0 |
| `followup_fee_egp` | integer | 0 |
| `followup_window_days` | integer | 14 |

None of these columns exist on staging. The migration was authored but never applied.

## Why retire

Per Mo's launch plan, doctor pricing is not part of the wedge product. The 7 callsites that read or write these columns are dead UI for a feature not on the roadmap. Retiring the migration and deleting the callsites removes 500-error-prone code paths from the active surface.

## Phase F follow-up callsites to delete

From `audits/database-audit/doctor-fees-usage.md` (Session B verdict). All 7 paths return 500 on staging today when exercised.

| # | File | Operation | Notes |
|---|---|---|---|
| 1 | `apps/clinic/app/api/doctor/stats/route.ts:151-152` | READ | `(doctor as any).consultation_fee_egp` — degrades silently to 0 today. Delete the two lines. |
| 2 | `apps/clinic/app/api/frontdesk/doctors/fees/route.ts:32, 89, 97, 105` | READ + WRITE | Whole route can be deleted. Frontdesk payments page (callsite 4) needs a corresponding update to remove the fetch. |
| 3 | `apps/clinic/app/api/frontdesk/invoice/[paymentId]/route.ts:60` | READ | Drop the columns from the SELECT. |
| 4 | `apps/clinic/app/(frontdesk)/frontdesk/payments/page.tsx:31, 230` | READ (TS type + property access) | Delete the two TS interface fields and the auto-fill block (`if (fee && fee.consultation_fee_egp > 0 && !amount)`). |
| 5 | `packages/shared/lib/api/handlers/doctor/settings/handler.ts:18, 61-63` | READ + WRITE | Delete the column references; the handler may be deletable entirely if no other settings remain. |
| 6 | `packages/shared/lib/api/handlers/doctor/public-fee/handler.ts:27` | READ | Delete the handler entirely; the route at `apps/clinic/app/api/doctor/public-fee/route.ts` should also be deleted. |
| 7 | `packages/ui-clinic/components/frontdesk/PaymentForm.tsx:79-84` | READ (client-side) | Delete the `fetch('/api/doctor/public-fee')` block and the auto-fill side-effects. |

## File move plan

```bash
mkdir -p supabase/migrations/_archived
git mv supabase/migrations/022_doctor_fees.sql \
       supabase/migrations/_archived/022_doctor_fees.sql.RETIRED
```

After the move, prepend the following header to the archived file (or include as a sibling `.MD` if Mo prefers not to mutate the SQL):

```
-- ============================================================
-- RETIRED 2026-05-03 by Audit Session C (ruling R1)
-- ============================================================
-- This migration adds three columns to public.doctors for a
-- doctor-pricing UI that is not on the launch roadmap. The
-- columns were never applied to staging; the seven app code
-- callsites that referenced them are deleted in a Phase F
-- follow-up PR (see audits/database-audit/mig-022-archive-plan.md
-- for the callsite list).
--
-- This file is preserved (not deleted) so a future "actually
-- ship doctor pricing" effort has a starting template.
-- ============================================================
```

## Verification after move + code deletion

After Phase F follow-up lands the code deletions:

```bash
grep -rn "consultation_fee_egp\|followup_fee_egp\|followup_window_days" apps packages
```

Expected: zero matches.

```bash
ls supabase/migrations/022_doctor_fees.sql 2>&1
```

Expected: "No such file or directory" (file moved to `_archived/`).

## Risk

* The `_archived/` folder MUST NOT be picked up by the Supabase migrations CLI. Verify by running `supabase migration list` after the move; the entry for `022_doctor_fees` should not appear in pending state. If it does, the CLI is reading `_archived/` — rename to a different prefix (e.g., `_attic_`).
* Phase F follow-up PR is small (1 route delete + 1 handler delete + 5 file edits) but spans both `apps/` and `packages/`. CI for both packages should run.

## Status

* Migration file move: NOT DONE (Mo executes)
* Code deletion: NOT DONE (Phase F follow-up)
* PROGRAM_STATE.md updated to track this in "Phase F follow-up tasks": YES (Audit Session C, Task 4)
