# Patient Identity — Build 02 Follow-up Results

> Applies the five fixes specified in `audits/build-02-followup-prompt.md`
> against the Build 02 deliverables (`audits/patient-identity-build-02-results.md`).
> Author: Claude (sandbox).
> Date: 2026-04-28.
>
> Build 02 shipped 12 files and 114 passing tests. Two of those files
> deviated from the migration plan (mig sequence compressed; dedup-plan
> table skipped). Three smaller correctness issues coexisted (audit
> action enum, account_status type, admin endpoint auth posture). This
> follow-up applies the locked corrections and amends the artifacts that
> need to change.

> **Referenced-file gap.** `audits/EXECUTION_PROMPTS.md` is named in the
> follow-up prompt but does not exist in the repository (verified via
> `ls audits/`). Treated as missing context, not a blocker. The five
> fixes are spelled out completely in the follow-up prompt body itself
> and were applied per its directives. If `EXECUTION_PROMPTS.md` exists
> elsewhere with locked numerics that contradict any decision below, Mo
> should flag and we re-resolve before staging apply.

---

## 1. Pre-fix state inventory

| Fix | Pre-fix state | File:line evidence |
|-----|---------------|--------------------|
| Fix 1 (3-mig sequence) | Steps 1+2 collapsed into a single mig 071 (296 lines covering normalization + duplicate-flag write); Step 3 + pointer column bundled into mig 072 (281 lines). The migration plan's `_patient_dedup_plan` review gate did not exist as a migration boundary. | `supabase/migrations/071_normalize_patient_phone.sql:32-296` (Build-02 monolith); `supabase/migrations/072_create_global_patients.sql:32-285` (combined create + pointer + assertion). |
| Fix 2 (`_patient_dedup_plan`) | Table absent from the codebase. Dedup decisions written directly to `patients.is_canonical` / `patients.duplicate_of_patient_id` by the old `071.9`. | Old `071_normalize_patient_phone.sql:187-219` (`UPDATE public.patients … SET is_canonical = …`). |
| Fix 3 (audit action enum) | `PATIENT_DEDUP_FLAGGED` and `GLOBAL_PATIENT_CREATED` strings were referenced from the old SQL migrations but NOT added to the TS `AuditAction` union. | `packages/shared/lib/data/audit.ts:5-35` — neither value present. |
| Fix 4 (`account_status` ENUM) | TEXT column with CHECK constraint instead of the spec-defined `patient_account_status` ENUM. Values list also wrongly included `'dormant'` (a `patient_clinic_status` concept per schema-spec § 1, not patient-account-level). | Old `072_create_global_patients.sql:56-57`. |
| Fix 5 (admin endpoint auth) | `requireApiRole('doctor')` — any authenticated doctor in any clinic could resolve any phone in the network to a global identity. Network-wide privacy regression. | `packages/shared/lib/api/handlers/admin/global-patients-lookup/handler.ts:35` (now removed); `packages/shared/lib/auth/session.ts` had no `requireServiceRole` helper. |

---

## 2. Fix-by-fix application

### Fix 1 — Restored 3-migration sequence

**What changed.** Build 02's compressed pair (071 = norm + flags, 072 = create + pointer) was split into the three migrations the plan specified:

- `071_normalize_patient_phone.sql` — phone normalization ONLY. Trimmed 296 → ~180 lines. Added `users.normalized_phone` (the migration plan calls for it; Build 02 had omitted it). Added quarantine INSERT for `users` rows. Removed the `is_canonical` / `duplicate_of_patient_id` columns, the duplicates view, the flag-backfill, and the `PATIENT_DEDUP_FLAGGED` audit insert.
- `072_dedup_detection.sql` — NEW. Creates `_patient_phone_duplicates` view, `_user_phone_duplicates` view, `_patient_dedup_plan` table, and auto-populates the plan from the patient detection view.
- `073_create_global_patients.sql` — renamed from old `072_create_global_patients.sql` and amended. Now begins with a pre-flight DO-block assertion that refuses to run while any `_patient_dedup_plan` row has `decided_at IS NULL`. Adds `is_canonical` / `duplicate_of_patient_id` columns and backfills them by CONSUMING `_patient_dedup_plan` (winner → `is_canonical = TRUE`, every loser → `is_canonical = FALSE` with `duplicate_of_patient_id` pointing at the winner). Singletons → `TRUE`. Quarantined → `FALSE`. Then writes `PATIENT_DEDUP_FLAGGED` audits for losers, creates the `global_patients` table, backfills it from canonical patients, writes `GLOBAL_PATIENT_CREATED` audits, adds `patients.global_patient_id`, backfills the pointer.

**Files affected.**
```
+ supabase/migrations/071_normalize_patient_phone.sql           (rewritten, trimmed)
+ supabase/migrations/071_normalize_patient_phone.rollback.sql  (rewritten to match)
+ supabase/migrations/072_dedup_detection.sql                   (new)
+ supabase/migrations/072_dedup_detection.rollback.sql          (new)
+ supabase/migrations/073_create_global_patients.sql            (renamed from 072_create_global_patients.sql + amended)
+ supabase/migrations/073_create_global_patients.rollback.sql   (renamed + amended)
- supabase/migrations/072_create_global_patients.sql            (deleted)
- supabase/migrations/072_create_global_patients.rollback.sql   (deleted)
+ scripts/validate-mig-071-072-073.sql                          (renamed from validate-mig-071-072.sql; expanded)
- scripts/validate-mig-071-072.sql                              (deleted)
+ audits/dedup-resolution.md                                    (override-SQL section + dedup-plan inventory query)
```

**Before/after — gate enforcement (the principle).**
```sql
-- Before (Build 02): mig 072 trusted that 071's flag write was correct.
-- No human review was named as a precondition.

-- After (mig 073, this fix): explicit pre-flight that fails closed.
DO $$
DECLARE v_unresolved INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_unresolved
    FROM public._patient_dedup_plan
   WHERE decided_at IS NULL;
  IF v_unresolved > 0 THEN
    RAISE EXCEPTION 'mig 073 blocked: % unresolved dedup clusters …', v_unresolved;
  END IF;
END $$;
```

**Deviations from the prompt's spec.** None. The rollback files were also extended to drop the new artifacts (`_user_phone_duplicates`, `_patient_dedup_plan`, the ENUM type) in dependency-correct order.

**Restored omission.** The migration plan's Step 1 specifies `users.normalized_phone`. Build 02 omitted it. The trimmed mig 071 now adds it (071.3 + 071.6 backfill + 071.8 quarantine). The follow-up prompt's Fix 1 forward-SQL list also calls for it explicitly.

### Fix 2 — `_patient_dedup_plan` table shape

**What changed.** Mig 072 (new) now creates `_patient_dedup_plan` with the exact shape from the follow-up prompt:

```sql
CREATE TABLE IF NOT EXISTS public._patient_dedup_plan (
  normalized_phone TEXT PRIMARY KEY,
  winner_patient_id UUID NOT NULL,
  loser_patient_ids UUID[] NOT NULL,
  resolution TEXT NOT NULL CHECK (resolution IN ('auto_oldest_wins','manual_review')),
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Auto-population (072.4):
- `dup_count = 2` → `resolution = 'auto_oldest_wins'`, `decided_at = NOW()`, `decided_by = NULL` (system).
- `dup_count >= 3` → `resolution = 'manual_review'`, `decided_at = NULL` (gate signal), winner is the oldest as a placeholder Mo can override.

RLS posture: leading-underscore `_internal` table; RLS NOT enabled (per Fix 2's locked decision and existing convention for `_phone_normalize_quarantine`). Only service-role / migration paths read it.

**Files affected.**
```
+ supabase/migrations/072_dedup_detection.sql                   (new — 072.3 creates the table, 072.4 populates)
+ supabase/migrations/072_dedup_detection.rollback.sql          (new — drops the table)
+ audits/dedup-resolution.md                                    (added "How to override an auto-resolution" section + inventory query)
```

**Before/after — Mo's override surface (new section in dedup-resolution.md).**
```sql
UPDATE public._patient_dedup_plan
   SET winner_patient_id = '<new-canonical-uuid>',
       loser_patient_ids = ARRAY[<former-canonical-uuid>, <other-loser-uuid>]::UUID[],
       resolution = 'manual_review',
       decided_by = '<your-auth-user-id>',
       decided_at = NOW(),
       notes = 'Reasoning: …'
 WHERE normalized_phone = '<phone>';
```

**Deviations from the prompt's spec.** None.

### Fix 3 — `AuditAction` enum entries

**What changed.** `audit.ts:5-37` — added `PATIENT_DEDUP_FLAGGED` and `GLOBAL_PATIENT_CREATED` to the discriminated union.

**Pre-fix verification.** Confirmed both values were ABSENT from the union before the patch by reading the file. (The Build 02 migrations referenced them by string in SQL only.)

**Before/after — diff.**
```diff
   | 'CHANGE_PHONE_FALLBACK_REJECTED'
   | 'CORRECT_PATIENT_PHONE'
+  // ── Patient identity v2 / global_patients (mig 071-073, Build prompt 02) ─────
+  //    PATIENT_DEDUP_FLAGGED — written by mig 073 for every loser row …
+  //    GLOBAL_PATIENT_CREATED — written by mig 073 for every backfilled
+  //    global_patients row …
+  //    Going-forward rule: every BUILD prompt that emits a new audit action
+  //    must update this enum in the same prompt …
+  | 'PATIENT_DEDUP_FLAGGED'
+  | 'GLOBAL_PATIENT_CREATED'

 export interface AuditEventParams {
```

**Files affected.** `packages/shared/lib/data/audit.ts`.

**Deviations from the prompt's spec.** The prompt sketched the change in `as const` object form. The existing file uses a discriminated TS union (`export type AuditAction = ...`), which is the established pattern in this codebase (see existing values lines 5-35). Followed the existing pattern instead of changing the enum shape — this is a documentation deviation in the prompt, not a substantive one.

### Fix 4 — `patient_account_status` ENUM type

**What changed.** Mig 073 (the renamed-and-amended version of old mig 072) now:
- Creates the ENUM type via an idempotent DO block at 073.2.
- Uses `account_status public.patient_account_status NOT NULL DEFAULT 'active'` in the table definition (073.6).
- Maps the legacy `patients.account_status` values during backfill: `active/suspended/locked/deceased` pass through; everything else (including the legacy `'dormant'` value, which is a per-clinic concept per schema-spec § 1, not a global one) maps to `'active'`. The previous `'merged' → 'active'` collapse is retained — `'merged'` requires `merged_into IS NOT NULL`, which a fresh backfill cannot satisfy.

**Reverse SQL.** `073_create_global_patients.rollback.sql` drops `global_patients` first (the table references the type), then `DROP TYPE IF EXISTS public.patient_account_status` second. Order matters; documented in the rollback file.

**Before/after — table definition.**
```diff
-  account_status TEXT NOT NULL DEFAULT 'active'
-    CHECK (account_status IN ('active','suspended','locked','deceased','merged','dormant')),
+  account_status public.patient_account_status NOT NULL DEFAULT 'active',
```

**Files affected.** `supabase/migrations/073_create_global_patients.sql`, `supabase/migrations/073_create_global_patients.rollback.sql`.

**Deviations from the prompt's spec.** None. TS layer left alone per prompt's "no TS change required" — note that the `GlobalPatient` interface at `packages/shared/lib/data/global-patients.ts:36` has a wider union (`… | 'dormant'`) than the runtime ENUM permits. The wider union is harmless (Postgres will only ever return one of the spec values), but is a soft documentation lie that a future prompt may want to narrow. Tracked as an aside, not a new orphan.

### Fix 5 — Admin endpoint locked to service-role

**What changed.**
1. New helper `requireServiceRole(request)` added to `packages/shared/lib/auth/session.ts`. Reads the `Authorization: Bearer <token>` header; compares timing-safely against `process.env.SUPABASE_SERVICE_ROLE_KEY`; throws `ApiAuthError(401)` on any mismatch (missing header, wrong scheme, wrong token, missing env var). Surfaced 401 (not 500) on missing env var to avoid leaking deployment misconfiguration through status codes.
2. Handler swapped from `requireApiRole('doctor')` to `requireServiceRole(request)`.
3. Tests updated: 9 cases retained, one swapped (was "403 when authenticated as wrong role" → now "401 when authenticated as a regular user (doctor token, not service-role)"). The "401 when auth fails" case became "401 when no service-role bearer present"; the success-path tests now build their `Request` with `Authorization: Bearer <test-service-role-key>` so the auth mock approves.

**Before/after — handler diff.**
```diff
-import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
+import { requireServiceRole, toApiErrorResponse } from '@shared/lib/auth/session'
 …
-    // Doctor-role gate. Same convention as /api/admin/patient-dedup.
-    await requireApiRole('doctor')
+    // Service-role gate. Doctor / patient / frontdesk tokens MUST NOT
+    // resolve here — see file header for rationale.
+    requireServiceRole(request)
```

**Files affected.**
- `packages/shared/lib/auth/session.ts` (added `requireServiceRole` + `import { timingSafeEqual } from 'node:crypto'`).
- `packages/shared/lib/api/handlers/admin/global-patients-lookup/handler.ts` (swapped guard + updated docstring).
- `packages/shared/lib/api/handlers/admin/global-patients-lookup/__tests__/handler.test.ts` (rewrote auth mock + reworked the two auth cases).

**Going-forward rule** (added to handler docstring): any future endpoint that resolves identity across clinics must default to service-role only; the doctor-token convention is reserved for per-clinic admin paths (see `patient-dedup` handler, which remains correctly scoped to clinic-OWNER review of their OWN clinic's dedup state).

**Deviations from the prompt's spec.** None. Test count remains 9 (1-for-1 swap).

---

## 3. Migration directory state after fixes

```
supabase/migrations/
├── 070_users_phone_verified_and_phone_change_for_staff.sql        (unchanged)
├── 071_normalize_patient_phone.sql            (TRIMMED — phone normalization for patients + users only)
├── 071_normalize_patient_phone.rollback.sql   (rewritten to match)
├── 072_dedup_detection.sql                    (NEW — views + _patient_dedup_plan + auto-populate)
├── 072_dedup_detection.rollback.sql           (NEW)
├── 073_create_global_patients.sql             (RENAMED + AMENDED from old 072 — pre-flight gate, ENUM, dedup-plan consumption, global_patients, pointer)
└── 073_create_global_patients.rollback.sql    (RENAMED + AMENDED)

scripts/
└── validate-mig-071-072-073.sql               (RENAMED from validate-mig-071-072.sql; expanded with dedup-plan + ENUM checks)
```

Old files deleted (verified via `ls`):
- `supabase/migrations/072_create_global_patients.sql`
- `supabase/migrations/072_create_global_patients.rollback.sql`
- `scripts/validate-mig-071-072.sql`

---

## 4. Test results

### C1 — Unit tests (phone-normalize.ts)

```
$ node_modules/.bin/tsx packages/shared/lib/utils/__tests__/phone-normalize.test.ts
…
=== Round-trip / determinism ===
  ✓ normalize is idempotent (E.164 → E.164)
  ✓ all four equivalent forms map to same canonical

=== Summary: 39 passed, 0 failed ===
```
**PASS** (39/39 — the function is byte-identical to Build 02's; tests unchanged).

### C2 — SQL ↔ TS parity test

```
$ node_modules/.bin/tsx packages/shared/lib/utils/__tests__/phone-normalize-sql-parity.test.ts
=== Phone normalizer SQL ↔ TS parity ===

=== Parity: 66 matched, 0 drift ===
```
**PASS** (66/66 — JS port of plpgsql function equals TS function for every input).

### C3 — Handler tests (auth contract changed)

```
$ node_modules/.bin/tsx packages/shared/lib/api/handlers/admin/global-patients-lookup/__tests__/handler.test.ts

=== admin/global-patients-lookup handler ===

  ✓ 400 when phone query param missing
  ✓ 400 when phone is empty
  ✓ 400 when phone cannot be normalized
  ✓ 401 when no service-role bearer present
  ✓ 401 when authenticated as a regular user (doctor token, not service-role)
  ✓ 404 when phone normalizes but no global_patients row exists
  ✓ 200 returns mapped shape on hit (with service-role bearer)
  ✓ 200 returns null claimed_by_user_id when unclaimed
  ✓ phone normalization happens server-side (raw 10-digit accepted)

=== Summary: 9 passed, 0 failed ===
```
**PASS** (9/9 — same count as Build 02; one case swapped per Fix 5 spec).

Test-by-test before/after for the auth-impacting cases:

| Test | Before (Build 02) | After (Fix 5) |
|------|-------------------|---------------|
| `401 when auth fails` | Mock `requireApiRole` throws `ApiAuthError(401)`. | Mock `requireServiceRole` reads no Authorization header → throws `ApiAuthError(401)`. Same status, real header path. |
| `403 when authenticated as wrong role` | Mock throws `ApiAuthError(403)`. | DELETED. Replaced with: `401 when authenticated as a regular user (doctor token, not service-role)` — sends `Authorization: Bearer doctor-jwt-token-not-service-role`; mock rejects → 401. Captures the privacy regression the fix resolves. |
| `200 returns mapped shape on hit` | Plain `Request` (no header); mock approves anyone. | `authedRequest(url)` builds a `Request` carrying `Authorization: Bearer <service-role>`. Mock accepts. Same JSON shape returned. |

### C4 — libpg-query parse on the new SQL set

```
$ node parse-pg.mjs
  ✓ supabase/migrations/071_normalize_patient_phone.sql — 13 statements parsed
  ✓ supabase/migrations/071_normalize_patient_phone.rollback.sql — 5 statements parsed
  ✓ supabase/migrations/072_dedup_detection.sql — 8 statements parsed
  ✓ supabase/migrations/072_dedup_detection.rollback.sql — 3 statements parsed
  ✓ supabase/migrations/073_create_global_patients.sql — 35 statements parsed
  ✓ supabase/migrations/073_create_global_patients.rollback.sql — 7 statements parsed
  ✓ scripts/validate-mig-071-072-073.sql — 25 statements parsed
```
**PASS** (all 7 SQL files parse cleanly).

### C5 — Audit enum check

No `audit.test.ts` exists in `packages/shared/lib/data/__tests__/`. Direct verification by `grep`:

```
$ grep -E "PATIENT_DEDUP_FLAGGED|GLOBAL_PATIENT_CREATED" packages/shared/lib/data/audit.ts
  | 'PATIENT_DEDUP_FLAGGED'
  | 'GLOBAL_PATIENT_CREATED'
```
**PASS** (both values present).

### C6 — Repo type-check

```
$ npm run type-check
> medassist@0.1.0 type-check
> tsc --noEmit
```
**PASS** (no errors).

### Aggregate

| Suite | Build 02 | Build 02 follow-up |
|-------|----------|---------------------|
| phone-normalize unit | 39 | 39 |
| phone-normalize SQL ↔ TS parity | 66 | 66 |
| handler | 9 | 9 |
| **Total TS tests** | **114** | **114** |
| SQL files parsed | 4 | 7 |
| `npm run type-check` | clean | clean |

---

## 5. Mo's staging-side checklist

The 3-migration apply sequence is now:

1. Apply mig 071: `psql "$STAGING_DATABASE_URL" -f supabase/migrations/071_normalize_patient_phone.sql`
2. Verify quarantine state on staging:
   ```sql
   SELECT table_name, COUNT(*) FROM public._phone_normalize_quarantine GROUP BY 1;
   ```
   - If 0 rows for both tables → continue.
   - If quarantine has rows → resolve per "Quarantine review" section of `audits/dedup-resolution.md` BEFORE applying mig 073 (mig 072 is safe to run regardless — it only reads).
3. Apply mig 072: `psql "$STAGING_DATABASE_URL" -f supabase/migrations/072_dedup_detection.sql`
4. Review `_patient_dedup_plan` rows. Paste output into `audits/dedup-resolution.md` "_patient_dedup_plan inventory" section. Confirm:
   - Every `auto_oldest_wins` row has `decided_at` populated (auto, no action needed).
   - Every `manual_review` row has `decided_at IS NULL` (Mo must update each).
5. **Manual override step** (only if any cluster is `manual_review`):
   ```sql
   UPDATE public._patient_dedup_plan
      SET decided_by = '<auth-user-id>',
          decided_at = NOW(),
          notes = '<reasoning>'
    WHERE normalized_phone = '<phone>';
   -- And, if the placeholder winner is wrong, also update winner_patient_id
   -- + loser_patient_ids per the override SQL in dedup-resolution.md.
   ```
6. Sign off in `audits/dedup-resolution.md`.
7. Apply mig 073: `psql "$STAGING_DATABASE_URL" -f supabase/migrations/073_create_global_patients.sql`
   - The pre-flight assertion (073.1) refuses to run if any `_patient_dedup_plan` row still has `decided_at IS NULL`. This is the gate working as intended; resolve and retry.
8. Run validation: `psql "$STAGING_DATABASE_URL" -f scripts/validate-mig-071-072-073.sql`. Every "Expect" must match.
9. End-to-end smoke test:
   ```sh
   curl -s -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     "$STAGING_HOST/api/admin/global-patients/lookup?phone=01012345678" | jq
   # Expect: 200 with { id, normalized_phone, claimed_by_user_id, … }
   curl -s -H "Authorization: Bearer doctor-jwt-not-service-role" \
     "$STAGING_HOST/api/admin/global-patients/lookup?phone=01012345678"
   # Expect: 401 — confirms Fix 5 contract.
   ```

---

## 6. DECISIONS_LOG.md candidate entries

Two new decisions Mo applies to `DECISIONS_LOG.md` (text only — Mo writes them in):

- **D-XXX (next available):** "Patient dedup uses `_patient_dedup_plan` table for human-review-and-override surface. Auto-rule (oldest wins) applies for cluster size 2; cluster size 3+ requires explicit human decision (decided_at + decided_by + notes). Migration 073 enforces resolution gate via pre-flight assertion that refuses to run while any plan row has decided_at IS NULL."
- **D-XXX+1:** "Migration sequencing: dedup detection (mig 072) and consumption (mig 073) are separate migrations to preserve the human-review gate. Compression into a single migration is forbidden; the gate is the value, not the migration count."

A potential third entry for Fix 5 (capture the precedent it sets):

- **D-XXX+2 (optional):** "Admin endpoints that resolve identity across clinics default to service-role only (`requireServiceRole`). The doctor-token convention (`requireApiRole('doctor')`) is reserved for per-clinic admin paths where the actor is reviewing their OWN clinic's data (see `/api/admin/patient-dedup`). New cross-clinic admin endpoints inherit the service-role default."

---

## 7. Hand-off notes for Prompt 3

The 3-migration structure changes Prompt 3's first task:

1. **Resolve `_phone_normalize_quarantine` BEFORE the `patients.global_patient_id` NOT NULL flip.** The quarantine table is now populated for both `patients` AND `users` (Fix 1 restored the migration plan's intent). ORPH-V2-07 is closed by Prompt 3 only after every quarantine row has either: (a) had its phone corrected via the `phone-correction` admin scope, or (b) been written to a sentinel `global_patients` row with the appropriate lifecycle state. Pick one approach and document.
2. **Read identity through `findGlobalPatientById` / `findGlobalPatientByPhone`** (already shipped). Callers in `packages/shared/lib/data/patients.ts`, `appointments.ts`, `clinical-notes.ts`, `frontdesk.ts`, and the search modules need migrating.
3. **Avoid changing RLS in this prompt.** ORPH-V2-06 is owed by Prompt 6.
4. **Wire identity into existing search.** `/api/patients/search` and `/api/patients/check-phone` already normalize server-side; their internal lookups should resolve to `global_patients` first, then dereference per-clinic context.
5. **Don't break `useOfflineMutation`.** Offline-write hook still writes patients without errors today (read on `patients.phone`).
6. **Tests to add in Prompt 3.** Round-trip integration tests proving "phone in" → `global_patients.id` → `patients` row by `global_patient_id`.

**New rule (going forward, captured in Fix 3 commentary):** every BUILD prompt that emits a new audit-action string MUST update `packages/shared/lib/data/audit.ts` in the same prompt. Future prompts that fail this rule will flag in code review.

**Optional follow-up.** `GlobalPatient.account_status` TS union (`packages/shared/lib/data/global-patients.ts:36`) is one value wider (`| 'dormant'`) than the runtime ENUM permits after Fix 4. Harmless — Postgres will not return that value — but a future prompt may want to narrow the type to match the ENUM exactly. Not a new orphan; not blocking.

---

## Summary

- 5 fixes applied, every fix has documented file:line evidence.
- 8 SQL files in the migration set replace 4. The dedup-plan gate (072 → 073) now exists as a real migration boundary.
- All 114 TS tests pass (39 + 66 + 9). Handler test count unchanged; one case swapped to capture the new auth contract.
- All 7 SQL files (3 forward + 3 rollback + 1 validation script) parse cleanly under libpg-query.
- `npm run type-check` is clean.
- Audit ENUM additions land in TS at `packages/shared/lib/data/audit.ts`.
- `patient_account_status` is a real ENUM type at the DB layer, matching schema-spec § 1.
- `/api/admin/global-patients/lookup` is service-role only.
- Orphan ledger updated: ORPH-V2-06/07/09 migration numbers shifted 072 → 073; ORPH-V2-10 restated to reference `_patient_dedup_plan`.
- No new orphans opened by this follow-up.

Migrations are review-ready. Mo applies + signs off on staging per § 5's checklist; mig 073's pre-flight assertion enforces the gate at apply time.
