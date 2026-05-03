# Patient identity v2 — Build 05 follow-up results

**Prompt:** Build 05 Follow-up — Atomic Share Creation + Vercel Cron + Sharing API Smoke
**Date applied to staging:** 2026-04-30
**Project:** `mtmdotixlhwksyoordbl` (medassist-egypt staging)
**Closes:** Build 05 § 3 atomicity caveat; Build 05 § 9 honest gap #6 (cron not scheduled)
**No new orphans opened.**

---

## 1. Phase 1 — Atomic share creation (mig 091)

### P1.1 Pre-flight verification

```
proname             prosecdef  prokind  return_type
create_data_share   true       f        jsonb
```

`create_data_share` exists with the expected SECURITY DEFINER + JSONB-return signature. `create_shares_for_grantors` does NOT exist pre-build. Safe to add.

**Departure from prompt's draft:** the prompt's example assumed `create_data_share` returned a record/table type and used `SELECT * INTO v_result FROM create_data_share(...)`. The actual function returns scalar JSONB (per mig 090), so the wrapper assigns directly (`v_result := public.create_data_share(...)`) and extracts fields via `v_result->>'key'`. The migration code in this build reflects that correction; the prompt's draft would have failed to apply.

### P1.2 Migration content (mig 091)

Key body:

```sql
CREATE OR REPLACE FUNCTION public.create_shares_for_grantors(
  p_global_patient_id  UUID,
  p_grantor_clinic_ids UUID[],
  p_grantee_clinic_id  UUID,
  p_granted_via        TEXT,
  p_actor_user_id      UUID,
  p_actor_kind         TEXT DEFAULT 'user',
  p_grant_reason       TEXT DEFAULT NULL
)
RETURNS TABLE (
  share_id          UUID,
  audit_event_id    UUID,
  grantor_clinic_id UUID,
  expires_at        TIMESTAMPTZ,
  idempotent_hit    BOOLEAN
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_grantor_id UUID; v_result JSONB;
BEGIN
  IF p_grantor_clinic_ids IS NULL OR array_length(p_grantor_clinic_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'create_shares_for_grantors: empty grantor list';
  END IF;
  IF p_grantee_clinic_id = ANY(p_grantor_clinic_ids) THEN
    RAISE EXCEPTION 'create_shares_for_grantors: grantee % is in grantor list', p_grantee_clinic_id;
  END IF;
  FOREACH v_grantor_id IN ARRAY p_grantor_clinic_ids LOOP
    v_result := public.create_data_share(
      p_global_patient_id := p_global_patient_id,
      p_grantor_clinic_id := v_grantor_id,
      p_grantee_clinic_id := p_grantee_clinic_id,
      p_granted_via       := p_granted_via,
      p_grant_reason      := p_grant_reason,
      p_actor_user_id     := p_actor_user_id,
      p_actor_kind        := p_actor_kind,
      p_default_expiry_days := 90
    );
    share_id          := NULLIF(v_result->>'share_id', '')::UUID;
    audit_event_id    := NULLIF(v_result->>'audit_event_id', '')::UUID;
    grantor_clinic_id := v_grantor_id;
    expires_at        := NULLIF(v_result->>'expires_at', '')::TIMESTAMPTZ;
    idempotent_hit    := COALESCE((v_result->>'idempotent_hit')::BOOLEAN, FALSE);
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;
```

The whole body executes as one PL/pgSQL transaction. Any RAISE inside any `create_data_share` call propagates up and rolls back every prior INSERT/UPDATE in this batch.

### P1.3 TS diff

`packages/shared/lib/data/patient-shares.ts` — `createSharesForGrantors`.

**Before (Build 05):** sequential per-grantor `for` loop, each `createShare` is its own DB transaction. Errors caught per-grantor and accumulated; partial success possible.

**After (mig 091 wired):** one RPC call. Either the whole batch commits or the whole batch rolls back. Errors shape widened to `{ grantorClinicId?: string; scope?: 'all'; message: string }` to express atomic-batch failures alongside the legacy per-grantor shape (the wrapper currently only emits `scope: 'all'` since failures are batch-wide; the per-grantor field is reserved for a future mode where the wrapper degrades to per-grantor on demand).

Self-grant filter retained on the TS side (filters before the RPC) — the RPC defensively rejects `grantor==grantee` with a clear error, but pre-filtering treats the no-op case (patient's only PCR is at the verifying clinic) as silent success rather than surfacing it as an error to the caller.

### P1.4 Test results

| Test | Description | Result |
|------|-------------|--------|
| Test 1 | Happy path: 3 distinct grantors, all succeed in one txn | ✅ PASS — 3 share rows, 3 audit rows, all `idempotent_hit=false`, all sharing the same `expires_at` (proves single transaction) |
| Test 2 | Atomic rollback: middle grantor doesn't exist (FK violation) | ✅ PASS — error raised, 0 share rows leaked, 0 audit rows leaked |
| Test 3 | Cleanup of Test 1 rows | ✅ PASS — 3 shares + 3 audits deleted with matching counts |
| Test 4 | Idempotency: re-call with same args | ✅ PASS — same `share_id` + `audit_event_id` returned, `idempotent_hit=true` for all |

Final post-test cleanliness: `shares_residue=0, audits_residue=0`.

---

## 2. Phase 2 — Vercel cron entry

**File:** `apps/clinic/vercel.json`

**Diff:**
```diff
   "crons": [
     {
       "path": "/api/cron/appointment-reminders",
       "schedule": "0 7 * * *"
-    }
+    },
+    {
+      "path": "/api/cron/expire-stale-shares",
+      "schedule": "0 2 * * *"
+    }
   ]
```

**Schedule reasoning:** `0 2 * * *` = 02:00 UTC daily = 04:00 Cairo (UTC+2 standard) / 05:00 Cairo (UTC+3 DST). Picked early-morning so notifications arrive during quiet hours, and ~5 hours before the existing `appointment-reminders` cron (07:00 UTC = 09:00 Cairo) so the two crons don't overlap. Vercel cron is UTC; the existing cron uses the same convention and accepts the seasonal 1-hour shift.

**Operator step required before next deploy:** none. The entry is in `vercel.json`; the cron will start firing automatically on the next Vercel deploy. No manual configuration in the Vercel dashboard.

**Cron will not fire until next deploy** — the route handler at `/api/cron/expire-stale-shares` already exists (Build 05) and is callable on-demand with the `CRON_SECRET` header today.

---

## 3. Phase 3 — Sharing API smoke

### P3.1 Test patient inventory

Top patients by combined sharing-row count:

| gpid | normalized_phone | user_id | role | legacy_grants | new_shares |
|------|-----------------|---------|------|---------------|------------|
| f59caf44-3151-449c-a32f-a074f8666198 | +201198765432 | NULL | NULL | 1 | 0 |
| ab9e83e7-9ce9-4330-a6f5-9c6c0a8b72c3 | +201111111104 | NULL | NULL | 1 | 0 |
| 784de785-4557-4581-9d02-10770c64cfcc | NULL | NULL | NULL | 1 | 0 |
| (5 more, all `user_id=NULL`) | | | | 1 | 0 |

**Critical finding:** ZERO patients on staging have a claimed `user_id`. Every `global_patients.claimed_user_id` is NULL. This is consistent with ORPH-V2-01 (patient claim flow lands in Prompt 10) — no patient can authenticate against the patient app yet, so the GET `/api/patient/sharing` endpoint can't be exercised end-to-end on staging today.

Additionally, ZERO patients have rows in BOTH tables. Today's distribution is "legacy only" — Build 05 didn't backfill `patient_visibility` rows into `patient_data_shares` (intentionally — see `audits/patient-visibility-migration-mapping.md`). Future cross-clinic verifies (when patients claim and front desks start using the privacy-code flow with multiple clinics) will populate `patient_data_shares`.

### P3.2 GET handler response shape

`packages/shared/lib/api/handlers/patient/sharing/handler.ts` returns:

```jsonc
{
  "success": true,
  "grants": [...],   // legacy patient_visibility rows (per-doctor intra-clinic)
  "shares": [...]    // Build 05 patient_data_shares rows (cross-clinic directional)
}
```

Both arrays always present. `?include_expired=true` query param adds revoked/expired shares to the `shares` array (legacy `grants` is unaffected; the legacy table doesn't track expiry the same way).

### P3.3 / P3.4 Page-level rendering — Outcome A with caveat

**Build 05 page** (`apps/patient/app/(patient)/patient/sharing/page.tsx`):

```ts
setShares(Array.isArray(data?.shares) ? data.shares : [])
```

The new `/patient/sharing` page reads ONLY `data.shares`. The `grants` field is discarded. **Outcome A confirmed for this page.**

**But there's a second consumer.** Grepping the codebase for `data.grants` surfaces:

`apps/patient/app/(patient)/patient/more/page.tsx`:
```ts
const loadGrants = useCallback(async () => {
  const res = await fetch('/api/patient/sharing')
  const data = await res.json()
  if (data.success) setGrants(data.grants || [])
})
// ...later, revoke uses the legacy DELETE-by-visibilityId path:
const res = await fetch('/api/patient/sharing', {
  method: 'DELETE',
  body: JSON.stringify({ visibilityId }),
})
```

The legacy `/patient/more` settings page still consumes `data.grants` and uses the legacy DELETE endpoint. This is NOT redundant rendering on a single page — `/patient/sharing` and `/patient/more` are two different patient-app surfaces serving two different concerns:

- `/patient/sharing` → cross-clinic data shares (`patient_data_shares`)
- `/patient/more` → legacy per-doctor messaging-consent + visibility preferences (`patient_visibility`)

Both pages will surface to the same patient when nav lands in Prompt 10.

### P3.5 Recommendation

**No action required for the single-page redundancy concern** — the prompt's primary diagnostic question ("does ONE page render BOTH arrays?") is answered: no. The Build 05 page is clean.

**Pre-existing follow-up flagged for Prompt 6.5:** `/patient/more`'s `loadGrants` + DELETE-by-visibilityId path is load-bearing on the legacy `data.grants` field. When Prompt 6.5 deprecates `patient_visibility` and removes `data.grants` from the GET response, the more page's "shared with" section will need to either (a) be cut over to `patient_data_shares` (different semantics — would only show cross-clinic) or (b) be removed entirely. This is a Prompt 6.5 concern, not a Build 05 follow-up concern.

Constructing the full GET response for the most-active legacy-only patient (gpid `f59caf44-3151-449c-a32f-a074f8666198`):

```jsonc
{
  "success": true,
  "grants": [/* one patient_visibility row, DOCTOR_SCOPED_OWNER + IMPLICIT_CLINIC_POLICY */],
  "shares": []
}
```

The `/patient/sharing` page would render an empty-state ("ما فيش عيادة عندها صلاحية..."). The `/patient/more` page would render one legacy grant in its "shared with" section. Both consistent.

---

## 4. Files touched

| File | Action |
|------|--------|
| `supabase/migrations/091_atomic_share_creation.sql` | Created |
| `supabase/migrations/091_atomic_share_creation.rollback.sql` | Created |
| `packages/shared/lib/data/patient-shares.ts` | `createSharesForGrantors` body replaced — single RPC call instead of per-grantor loop |
| `apps/clinic/vercel.json` | Added `expire-stale-shares` cron entry |
| `audits/patient-identity-build-05-followup-results.md` | Created (this file) |

No verify-handler changes needed — the handlers already call `createSharesForGrantors`. Atomicity tightens transparently.

---

## 5. Tests run + results

| Test | Phase | Status |
|------|-------|--------|
| P1.1 — function existence pre-flight | Phase 1 | ✅ PASS |
| P1.4 Test 1 — happy path 3 grantors atomic | Phase 1 | ✅ PASS (3 shares, 3 audits, single transaction) |
| P1.4 Test 2 — atomic rollback on bad grantor | Phase 1 | ✅ PASS (0 leaked) |
| P1.4 Test 3 — cleanup deletion counts | Phase 1 | ✅ PASS (3-3) |
| P1.4 Test 4 — idempotent re-batch | Phase 1 | ✅ PASS (all `idempotent_hit=true`, same ids) |
| Regression R1 — multi-grantor 2-share atomic via wrapper | Phase 4 | ✅ PASS |
| Regression R2 — idempotent re-batch via wrapper | Phase 4 | ✅ PASS |
| Regression R3 — extend on wrapper-created share | Phase 4 | ✅ PASS |
| Regression R4 — auto-renew on visit (renewed_count=1) | Phase 4 | ✅ PASS |
| Regression R5 — revoke + idempotent re-revoke | Phase 4 | ✅ PASS |
| Regression R6 — empty grantor list rejected with clear message | Phase 4 | ✅ PASS |

**Total: 11/11 PASS.** Final staging state: `shares_residue=0, orphan_audits=0, total_shares=0`.

R5 had a first-pass false-failure during test development (the original assertion expected 2 rows after a revoke + re-batch, but a re-batch over a revoked share correctly creates a fresh row, so the count goes to 3). The test was restructured to put idempotency check (R2) BEFORE the revoke (R5). Both passes documented in this build's commit history.

---

## 6. Orphan ledger updates

**No new orphans opened.** All three Phase 1/2/3 tasks were resolved in-build (atomic creation, cron entry, smoke diagnostic).

**Pre-existing orphan implicitly extended:** ORPH-V5-02 (`patient_visibility` deprecation, closes Prompt 6.5) now carries an additional sub-task: cutover or removal of the `/patient/more` page's `loadGrants` + DELETE-by-visibilityId code path. Not a new orphan — same root cause (legacy table still in use). The Build 05 results doc already noted this dependency in the GET-handler augmentation; this follow-up makes the page-level dependency explicit.

**Build 05 honest gaps closed by this follow-up:**
- § 3 atomicity caveat — closed by mig 091.
- § 9 gap #6 (cron not scheduled) — closed by `vercel.json` entry; will fire on next deploy.

**Build 05 honest gaps still open (unchanged by this follow-up):**
- § 9 gap #1 — RLS placeholder still DENY-ALL (ORPH-V5-01, Prompt 6).
- § 9 gap #2 — `patient_visibility` still exists with 32 stale rows (ORPH-V5-02, Prompt 6.5).
- § 9 gap #3 — Egyptian Arabic review pending (ORPH-V5-04, Mo).
- § 9 gap #4 — Patient app navigation chrome (ORPH-V5-03, Prompt 10).
- § 9 gap #5 — autoRenewOnVisit fire-and-forget at call site (intentional documented exception).
- § 9 gap #7 — Multi-grantor partial-failure logging — **architecturally obsoleted.** With mig 091, partial failures cannot occur — either the whole batch commits or the whole batch rolls back. The "log to console.error per grantor" pattern in the verify handlers is now dead code; it would only fire if `createSharesForGrantors` returned `errors` with the new `scope: 'all'` shape, which signals atomic-batch failure (the entire batch was rolled back). The handlers already log this, so behaviorally there's no regression; ergonomically the handler comment about "partial share creation failure" is slightly misleading post-091. Out of scope for this prompt.
- § 9 gap #8 — No two-session true-concurrency test (Postgres semantics, not separately exercised).
