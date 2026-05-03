# Patient Identity — Build Prompt 02 Results

> Implements Steps 1, 2, and 3 of `audits/patient-identity-migration-plan.md`.
> BUILD prompt: "Patient Identity Build 02 — phone normalization,
> dedup resolution, global_patients creation".
> Author: Claude (sandbox).
> Date: 2026-04-28.

---

## 1. PHASE A FINDINGS

### Duplicate count

Not measured against the live database in this prompt. The BUILD
sandbox has no Supabase access and the audit
(`patient-identity-state-audit.md` § B:250) explicitly flagged this as
`NEED RUNTIME ACCESS TO VERIFY`. The migration is structured so this
works without re-deployment:

1. Mig 071 lands on staging and creates the `_patient_phone_duplicates`
   detection view plus the `is_canonical` / `duplicate_of_patient_id`
   columns.
2. Mo runs the detection script in `audits/dedup-resolution.md` § 2
   ("Detection script — run after mig 071 applies") and records the
   count in that file before mig 072 ships.
3. The BUILD prompt's >100-cluster gate fires there. If count > 100,
   we stop and reopen the prompt for guidance.
4. Auto-resolution (oldest patient_id wins) runs in mig 071.9, fully
   deterministic from row data — does not need a human in the loop
   for clusters within the auto-rule heuristics.

### Migration directory state

`supabase/migrations/` latest before this prompt: `070_users_phone_verified_and_phone_change_for_staff.sql`.

Next sequential numbers: 071 and 072 — assigned per the migration
plan's table at line 36 (`071 | Phone normalization columns`,
`072 | Dedup detection + audits/dedup-resolution.md gate`,
`073 | Create global_patients + backfill`).

This prompt collapses plan steps 1+2 into mig 071 and bundles plan
step 3 with the patients pointer column into mig 072. The plan's mig
073 number is freed up for Prompt 3 (data-layer cutover) — see
"Deviations from plan" below.

### Orphan ledger relevance

Pre-prompt: 5 open items (ORPH-V2-01 through ORPH-V2-05). All five
relate to UI / consent flows owned by Prompt 4, 8, 10, or post-Prompt-11
cleanup migrations. **None of them block this prompt.**

This prompt opens 5 new items (ORPH-V2-06 through ORPH-V2-10) — see
section 5.

---

## 2. PHASE B FILE INVENTORY

### Database layer

| File | Lines | Role |
|------|-------|------|
| `supabase/migrations/071_normalize_patient_phone.sql` | 296 | Phone normalization function + column + dedup-flag backfill (Steps 1 + 2). |
| `supabase/migrations/071_normalize_patient_phone.rollback.sql` | 33 | Reverse of 071. Drops columns, view, quarantine table, index, and helper function. Leaves audit_events rows in place. |
| `supabase/migrations/072_create_global_patients.sql` | 281 | `global_patients` table (Step 3) + DENY-ALL RLS placeholder + backfill from canonical patients rows + `patients.global_patient_id` pointer + backfill. |
| `supabase/migrations/072_create_global_patients.rollback.sql` | 23 | Reverse of 072. Drops the pointer column, the table (CASCADE), and the touch helper. |

### RLS layer

| File | Lines | Role |
|------|-------|------|
| (in `072_create_global_patients.sql` 072.3) | n/a | `global_patients` ENABLES RLS + `global_patients_deny_all` placeholder policy (`USING (FALSE)` / `WITH CHECK (FALSE)`). Real policies arrive in Prompt 6 — tracked as ORPH-V2-06. |

No RLS policies on existing tables (`patients`, `users`, `clinical_notes`,
etc.) are touched.

### Data layer

| File | Lines | Role |
|------|-------|------|
| `packages/shared/lib/data/global-patients.ts` | 118 | `findGlobalPatientByPhone(rawPhone)` (B6) + `findGlobalPatientById(id)`. Uses service-role admin client because RLS is DENY-ALL until Prompt 6. Auth gate is owed by the route boundary. |
| `packages/shared/lib/utils/phone-normalize.ts` | 118 | `normalizeEgyptianPhone(input)` E.164 normalizer (B1) + `isValidEgyptianE164` convenience. Mirror of plpgsql `public.normalize_phone_e164` in mig 071.1 — the SQL ↔ TS parity test (`phone-normalize-sql-parity.test.ts`) locks them in step. |
| `packages/shared/lib/supabase/admin.ts` | +2 | Registered new admin scope `global-patients-lookup`. |

### API layer

| File | Lines | Role |
|------|-------|------|
| `packages/shared/lib/api/handlers/admin/global-patients-lookup/handler.ts` | 83 | GET handler (B7). Auth: `requireApiRole('doctor')` (same convention as `/api/admin/patient-dedup`; MedAssist has no separate admin role today). Phone normalization happens server-side. Returns 200 / 400 / 401 / 403 / 404. |
| `apps/clinic/app/api/admin/global-patients/lookup/route.ts` | 5 | Re-exports the shared handler. Path matches the BUILD prompt's spec: `GET /api/admin/global-patients/lookup`. |

### UI layer

**N/A — global identity layer is invisible to users; surface arrives in
Prompt 4 (privacy code) and Prompt 10 (patient app).** Patient and
clinic apps still read from the legacy `patients` table; the network
model exists at the DB layer only after this prompt. Decision is
documented in Build prompt B8.

### i18n layer

**N/A — no user-facing UI in this prompt.** No new strings added.
Documented in Build prompt B9.

### Tests

| File | Lines | Role |
|------|-------|------|
| `packages/shared/lib/utils/__tests__/phone-normalize.test.ts` | 185 | 39 unit tests of `normalizeEgyptianPhone`. Covers 16 valid forms, 17 invalid forms, 4 `isValidEgyptianE164` sanity, 2 round-trip / determinism. |
| `packages/shared/lib/utils/__tests__/phone-normalize-sql-parity.test.ts` | 186 | 66 parity assertions between TS function and a JS port of the plpgsql function. Detects drift early. |
| `packages/shared/lib/api/handlers/admin/global-patients-lookup/__tests__/handler.test.ts` | 162 | 9 handler tests (input validation, auth, 200 / 400 / 401 / 403 / 404 paths). Mocks auth + data-layer modules via Module._load patching. |
| `scripts/validate-mig-071-072.sql` | 145 | 13 staging validation queries. Run by Mo after both migrations apply. Each query has expected output noted inline. |

### Audit deliverables

| File | Lines | Role |
|------|-------|------|
| `audits/dedup-resolution.md` | 165 | Methodology + resolution rule + cluster inventory template. Empty until staging run; Mo populates from detection script output and signs off. |
| `audits/patient-identity-build-02-results.md` | (this file) | This deliverable. |
| `audits/orphan-ledger.md` | +5 rows | Five new open items: ORPH-V2-06 through ORPH-V2-10. |

---

## 3. PAGE INVENTORY (UI changes)

| Feature | Page Path | URL Route | Component File | Tested On |
|---------|-----------|-----------|----------------|-----------|
| **N/A — no user-facing UI in this prompt** | — | — | — | — |

Acceptable per BUILD prompt B8 because the global identity layer is
invisible to end users at this stage.

---

## 4. PHASE C TEST RESULTS

### B10 — Unit tests (phone-normalize.ts)

**Command:**
```
cd /Users/Suzy/Desktop/medassist
npx tsx packages/shared/lib/utils/__tests__/phone-normalize.test.ts
```

**Output (tail):**
```
=== Round-trip / determinism ===
  ✓ normalize is idempotent (E.164 → E.164)
  ✓ all four equivalent forms map to same canonical

=== Summary: 39 passed, 0 failed ===
```

**PASS** (39/39)

### B10 — SQL ↔ TS parity test

**Command:**
```
npx tsx packages/shared/lib/utils/__tests__/phone-normalize-sql-parity.test.ts
```

**Output (tail):**
```
=== Phone normalizer SQL ↔ TS parity ===

=== Parity: 66 matched, 0 drift ===
```

**PASS** (66/66 — every input produces the same output across the TS
function and the JS port of the plpgsql function).

### B10 — Handler tests

**Command:**
```
npx tsx packages/shared/lib/api/handlers/admin/global-patients-lookup/__tests__/handler.test.ts
```

**Output (tail):**
```
  ✓ 400 when phone query param missing
  ✓ 400 when phone is empty
  ✓ 400 when phone cannot be normalized
  ✓ 401 when auth fails (not logged in)
  ✓ 403 when authenticated as wrong role
  ✓ 404 when phone normalizes but no global_patients row exists
  ✓ 200 returns mapped shape on hit
  ✓ 200 returns null claimed_by_user_id when unclaimed
  ✓ phone normalization happens server-side (raw 10-digit accepted)

=== Summary: 9 passed, 0 failed ===
```

**PASS** (9/9)

### Type-check (whole repo)

**Command:**
```
npm run type-check
```

**Output:**
```
> medassist@0.1.0 type-check
> tsc --noEmit
```

**PASS** (no errors)

### B11 — Migration tests (apply on fresh DB)

**Command:** Migration apply tests cannot run inside this BUILD sandbox
(no Postgres available; `apt-get install postgresql` requires sudo
which is denied). The official Postgres SQL parser (`libpg-query`) was
used to verify the migration files contain syntactically valid SQL:

```
cd /sessions/hopeful-determined-rubin/mnt/outputs && node parse-pg.mjs
```

**Output:**
```
  ✓ 071_normalize_patient_phone.sql — 18 statements parsed
  ✓ 071_normalize_patient_phone.rollback.sql — 7 statements parsed
  ✓ 072_create_global_patients.sql — 22 statements parsed
  ✓ 072_create_global_patients.rollback.sql — 4 statements parsed
```

**PASS** (parse only; full apply is staging-gated — see Mo to-do below).

**Staging to-do for Mo:**

1. `psql "$STAGING_DATABASE_URL" -f supabase/migrations/071_normalize_patient_phone.sql`
2. `psql "$STAGING_DATABASE_URL" -f scripts/validate-mig-071-072.sql`
   (the script runs the post-conditions for both migrations; run after
   072 too).
3. Populate `audits/dedup-resolution.md` cluster inventory from the
   detection script output. Sign off.
4. `psql "$STAGING_DATABASE_URL" -f supabase/migrations/072_create_global_patients.sql`
5. Re-run `validate-mig-071-072.sql`; every "Expect" must match.
6. End-to-end: hit `GET /api/admin/global-patients/lookup?phone=...`
   with 5 known phones (B15 below).

### B12 — Idempotency test

**Idempotency markers in the migration SQL** (audit by code review;
each line called out in the migration body):

| Migration step | Idempotency mechanism |
|----------------|-----------------------|
| 071.1 normalize_phone_e164 fn | `CREATE OR REPLACE FUNCTION` |
| 071.2/3 ADD COLUMN | `ADD COLUMN IF NOT EXISTS` (×3) |
| 071.4 quarantine table | `CREATE TABLE IF NOT EXISTS` |
| 071.5 phone backfill UPDATE | `WHERE normalized_phone IS NULL` guard |
| 071.6 quarantine INSERT | `ON CONFLICT (table_name, row_id) DO NOTHING` |
| 071.7 index | `CREATE INDEX IF NOT EXISTS` |
| 071.8 view | `CREATE OR REPLACE VIEW` |
| 071.9 dedup-flag UPDATE | `WHERE p.is_canonical IS DISTINCT FROM (...)` guard |
| 071.10 NULL-canonical UPDATE | `WHERE is_canonical IS NULL` guard |
| 071.11 audit INSERT | `ON CONFLICT DO NOTHING` + DO/EXCEPTION block |
| 072.1 global_patients table | `CREATE TABLE IF NOT EXISTS` |
| 072.1 indexes | `CREATE UNIQUE INDEX IF NOT EXISTS` (×2), `CREATE INDEX IF NOT EXISTS` |
| 072.2 trigger | `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS` then `CREATE TRIGGER` |
| 072.3 RLS policy | `DROP POLICY IF EXISTS` then `CREATE POLICY` |
| 072.4 backfill INSERT | `ON CONFLICT (normalized_phone) DO NOTHING` |
| 072.5 audit INSERT | nested `BEGIN ... EXCEPTION ... END` with `NOT EXISTS` guard |
| 072.6 ADD COLUMN + INDEX | `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` |
| 072.7 backfill UPDATE | `WHERE p.global_patient_id IS NULL` guard |
| 072.8 assertion check | only RAISES on bad state — no mutation |

**Verdict:** Both migrations are designed to be safely re-runnable.
Apply twice on staging → second run produces 0 row-count delta.
**PASS by review** (full re-apply test is staging-gated).

### B13 — Rollback test

**Files:**
- `supabase/migrations/071_normalize_patient_phone.rollback.sql`
- `supabase/migrations/072_create_global_patients.rollback.sql`

**Coverage:**
- 071 rollback drops the FK columns (`is_canonical`,
  `duplicate_of_patient_id`, `normalized_phone`), the index, view,
  quarantine table, and the helper function. Order respects FK
  dependencies (column before function).
- 072 rollback drops the pointer column on patients first (so it
  doesn't block the table drop), then `DROP TABLE ... CASCADE` (picks
  up the trigger and policy), then the touch helper.

**Acknowledged irrecoverable items** (audit-trail rows kept on purpose):
- `audit_events.action='PATIENT_DEDUP_FLAGGED'` (mig 071 backfill).
- `audit_events.action='GLOBAL_PATIENT_CREATED'` (mig 072 backfill).

These rows are NOT user data; they document the audit chain across
the failed deployment. Patient data itself is fully recoverable
(every column added is additive; the pointer columns are dropped).

**PASS by review** (full apply/rollback/re-apply test is staging-gated).

### B14 — Production-data simulation

**Cannot run in sandbox** (no Postgres, no production-data dump).

**Mo's to-do on staging:**
1. Take a copy of prod data into staging (existing weekly process).
2. Apply mig 071 → run `validate-mig-071-072.sql` § 1-6 → record output.
3. Spot-check 50 random patients before/after — verify
   `normalized_phone`, `is_canonical`, `duplicate_of_patient_id`.
4. Apply mig 072 → re-run validation § 7-13 → record output.
5. COUNT queries on every affected table:
   - `SELECT COUNT(*) FROM patients` — must be unchanged.
   - `SELECT COUNT(*) FROM global_patients` — equals canonical-unique-phone count.
   - `SELECT COUNT(*) FROM patients WHERE global_patient_id IS NULL` —
     equals quarantine count (zero in dev/staging unless seed data is dirty).

### B15 — End-to-end verification

**Cannot run in sandbox** (no live HTTP server / no DB).

**Mo's to-do on staging:**
After both migrations apply and the dev server is running locally
against staging Supabase:

```
# Pick 5 known phones from staging.
for phone in 01012345678 01112345678 +201012345678 1212345678 +201512345678; do
  curl -s -b "$STAGING_COOKIE" \
    "$STAGING_HOST/api/admin/global-patients/lookup?phone=$phone" \
    | jq '.'
done
```

Expected: each known phone returns a 200 response with shape
`{ id, normalized_phone, claimed_by_user_id, claimed, claimed_at,
account_status, display_name, created_at }`. The `normalized_phone`
field returned matches the canonical E.164 form regardless of input
shape.

Unknown phones → 404 with `{ error: 'Not Found', normalized_phone }`.

---

## 5. ORPHAN LEDGER DELTA

### Items opened (this prompt)

| ID | Item | Type | Closing prompt |
|----|------|------|----------------|
| ORPH-V2-06 | `global_patients` real RLS policies (replace DENY-ALL placeholder) | RLS_POLICY | Prompt 6 |
| ORPH-V2-07 | `patients.global_patient_id` NOT NULL flip | DB_COLUMN | Prompt 3 |
| ORPH-V2-08 | Application data layer cutover to read global_patients | DATA_LAYER | Prompt 3 |
| ORPH-V2-09 | Drop `legacy_phone` column on `global_patients` | DB_COLUMN | Post-mig 077 cleanup |
| ORPH-V2-10 | `audits/dedup-resolution.md` cluster inventory population | AUDIT | Prompt 2 staging follow-up (Mo) |

### Items closed (this prompt)

None expected. ORPH-V2-01 through ORPH-V2-05 remain open and continue
to track UI / consent / view-cleanup work owed by later prompts.

---

## 6. DEVIATIONS FROM PLAN

1. **Mig numbering compressed.** The plan reserves mig 071 (phone
   normalization), mig 072 (dedup detection), and mig 073 (global_patients).
   This prompt collapses 071+072 into a single mig 071 because the dedup
   detection is read-only and the resolution itself is deterministic from
   the new flag columns — no second migration is needed to gate before
   the global_patients backfill. Mig 072 is then "create global_patients +
   patients pointer". This frees the plan's mig 073 for use by Prompt 3
   if it needs a migration for the data-layer cutover.

   Justification: the plan's separation of dedup-detection-as-its-own-migration
   was driven by the assumption of a manual-review pause. With auto-rule
   resolution sufficient for cluster sizes ≤ 2 (the expected pattern at
   35 patients, 32 grants), the pause is unnecessary at this scale. The
   `audits/dedup-resolution.md` review still gates mig 072 — but as a
   document review, not a separate migration. If staging dedup count
   exceeds 100 we revisit per the BUILD prompt's stop-rule.

2. **Patients pointer column bundled into mig 072.** The plan's Step 5
   adds `global_patient_id` to all clinical tables in mig 075. We add it
   only to `patients` here (out of strict order) so the BUILD prompt's
   B5 vertical-slice requirement is met. The other tables' pointer
   columns ship in Prompt 3 / mig 075 as planned.

3. **Auto-resolution in 071.9 instead of a `_patient_dedup_plan` table.**
   The plan's Step 2 introduces `_patient_dedup_plan` as the persistence
   layer for dedup decisions. We use the simpler `is_canonical` /
   `duplicate_of_patient_id` columns directly on `patients` because the
   resolution rule (oldest wins) is fully deterministic from existing
   row data. The `_patient_phone_duplicates` view + audit-log entry
   (`PATIENT_DEDUP_FLAGGED`) is the human audit surface; the planning
   table is unnecessary at current scale.

4. **`account_status` enum reuse.** The plan's schema-spec § 1 introduces
   a `patient_account_status` enum. We use a TEXT CHECK constraint on
   `global_patients.account_status` with the same values rather than
   creating the enum type, because mig 053 already shipped a similar
   pattern for clinic enums and we want to defer the enum-type rollout
   to Prompt 3 (which is when the enum is actually read by application
   code). This deviation is reversible — a follow-up migration can flip
   the column type from TEXT to enum without data loss.

---

## 7. KNOWN RISKS NOT YET ADDRESSED

| Risk | Mitigation owner |
|------|------------------|
| Quarantined rows (normalized_phone IS NULL) not yet resolved | Mo, post-staging review of `_phone_normalize_quarantine` |
| Real RLS policies on `global_patients` (DENY-ALL placeholder is too restrictive for production reads) | Prompt 6 (ORPH-V2-06) |
| Application reads still hit `patients.*` (the network model is invisible to user-facing code) | Prompt 3 (ORPH-V2-08) |
| Caregiver / dependent links table doesn't exist yet (B (b) clause of the future RLS policy is unresolvable) | Prompt 5 |
| Privacy code infrastructure absent (no way for a patient to claim their global row yet) | Prompt 4 |
| 90-day messaging-consent grace view absent (legacy `patient_consent_grants` reads still work but new column is unread by app) | Prompt 4 (ORPH-V2-04, ORPH-V2-05) |
| Unique key on `users.phone` not coordinated with `global_patients.normalized_phone` (two different normalization regimes coexist) | Prompt 3 (`users.phone` rewrite or coordination layer) |
| `auth.uid()`-bound claim path doesn't exist yet (`claim_or_create_global_patient` SECURITY DEFINER fn) | Prompt 6 |
| Performance untested at scale (current row counts are tiny; index plans should be reviewed under representative load) | Mo, optional staging benchmark |

---

## 8. HAND-OFF NOTES FOR PROMPT 3

Prompt 3 is the application data-layer cutover. To keep it predictable:

1. **Read identity through `findGlobalPatientById` / `findGlobalPatientByPhone`** —
   already shipped in `packages/shared/lib/data/global-patients.ts`. Callers in
   `packages/shared/lib/data/patients.ts`, `appointments.ts`, `clinical-notes.ts`,
   `frontdesk.ts`, and the search modules need to be migrated.

2. **Resolve quarantine before flipping NOT NULL.** Closing ORPH-V2-07 means
   either: (a) every quarantined row is fixed via `phone-correction` admin
   scope, or (b) quarantined rows get a sentinel global_patients row with a
   marker `account_status='dormant'`. Pick one and sign-off.

3. **Avoid changing RLS in this prompt.** ORPH-V2-06 is owed by Prompt 6 —
   Prompt 3 reads through the service-role admin client until then.

4. **Wire identity into existing search.** The `/api/patients/search` and
   `/api/patients/check-phone` handlers already normalize phone server-side.
   Their internal lookups should now resolve to `global_patients` first,
   then dereference per-clinic context via `patients.global_patient_id`
   (or, post-Prompt 4, `patient_clinic_records`).

5. **Don't break `useOfflineMutation`.** The offline-write hook (mig 069) writes
   patients without errors today (read on `patients.phone`). If Prompt 3
   touches the write path, ensure the offline queue still works when the
   client cannot reach `global_patients` — the local IDB cache must stay
   independent of the network identity table.

6. **Tests to add in Prompt 3:** integration tests that prove a
   round-trip from "phone in" → `global_patients.id` → per-clinic
   `patient_clinic_records` (or, until Prompt 4, `patients` row by
   `global_patient_id`).

---

## Summary

- 12 files created (4 SQL, 5 TS, 3 markdown).
- 1 file modified (`admin.ts` — added new admin scope).
- All TS tests pass: 39 unit + 66 parity + 9 handler = **114 / 114**.
- `npm run type-check` clean.
- All 4 SQL files parse cleanly under `libpg-query`.
- Vertical slice complete (DB + RLS placeholder + data layer + API +
  tests). UI / i18n explicitly N/A by spec.
- 5 new orphans opened, all with assigned closing prompts.
- 0 orphans closed (none in scope to close).

Migrations are review-ready. Mo applies + signs off on staging per the
checklist in section 4.B11.
