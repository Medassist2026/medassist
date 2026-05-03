# Patient Identity — Build 02 staging apply

> Operational record of applying migrations 071, 072, 073 to the
> staging Supabase project, plus post-condition validation and the
> admin endpoint smoke test. Author: Claude (Cowork). Date:
> 2026-04-28. Driver: `audits/staging-apply-prompt.md` (Build 02 —
> Staging Apply via Supabase MCP).
>
> This document is the deliverable; Mo signs off in § 7 before
> Prompt 3 launches.

---

## 1. Pre-flight checks

### P1 — Project identity (staging vs production)

`mcp__supabase__list_projects` returned two projects in org
`ucgfmegcikjmnqrwkoat`:

| name | ref / project_id | created_at | DB host |
|------|------------------|------------|---------|
| medassist-egypt | `mtmdotixlhwksyoordbl` | 2026-01-19 | `db.mtmdotixlhwksyoordbl.supabase.co` |
| Sa7             | `nslnqybhbnnlocqghzna` | 2026-02-28 | `db.nslnqybhbnnlocqghzna.supabase.co` |

Neither name carries a standard `staging`/`stg`/`prod` token. Stopped
and asked Mo. **Mo selected `medassist-egypt` (`mtmdotixlhwksyoordbl`)
as staging on 2026-04-28**, via explicit choice in
`AskUserQuestion`. All MCP calls in this document target that
project ID.

### P2 — Pre-state schema check

```sql
SELECT
  (SELECT COUNT(*) FROM public.patients) AS patients_count,
  (SELECT COUNT(*) FROM public.users) AS users_count,
  (SELECT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='global_patients')) AS global_patients_exists,
  (SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='patients' AND column_name='normalized_phone')) AS patients_normalized_phone_exists,
  (SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='users' AND column_name='normalized_phone')) AS users_normalized_phone_exists,
  (SELECT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='_patient_dedup_plan')) AS dedup_plan_exists,
  (SELECT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='_phone_normalize_quarantine')) AS quarantine_exists;
```

Result:

```
patients_count                    = 35
users_count                       = 288
global_patients_exists            = false
patients_normalized_phone_exists  = false
users_normalized_phone_exists     = false
dedup_plan_exists                 = false
quarantine_exists                 = false
```

All four "exists" flags FALSE → **fresh state, proceed to Phase 2**
per the prompt's decision tree.

**Triple-check via `list_migrations`.** The most recent applied
migration is `20260426062710_070_users_phone_verified_and_phone_change_for_staff`.
No 071 / 072 / 073 entries are present. Consistent with the fresh
state above. Numbering note: migration `068` is absent from the
tracked list (069, 070 follow 067 directly) — this is a numbering
hop from earlier work, not a hole in this apply.

### P3 — Migration file headers (first 30 lines each)

Confirmed each file is the post-Fix-1 split version per the Build 02
follow-up doc § 3:

- **071_normalize_patient_phone.sql** — header reads "Phone
  normalization (E.164) for patients + users", "Implements: …
  Step 1 ONLY", and lists the 5 additions (`normalize_phone_e164`,
  `patients.normalized_phone`, `users.normalized_phone`,
  `_phone_normalize_quarantine`, `idx_patients_normalized_phone`).
- **072_dedup_detection.sql** — header reads "Patient phone dedup
  DETECTION (no consumption)", lists `_patient_phone_duplicates`,
  `_user_phone_duplicates`, `_patient_dedup_plan`, and the
  auto-population step.
- **073_create_global_patients.sql** — header reads "global_patients
  table + patients dedup flags + patients.global_patient_id
  pointer", calls out the pre-flight assertion, the
  `patient_account_status` ENUM, the dedup-plan consumption, and
  the RLS DENY-ALL placeholder (real policies belong to Prompt 6,
  ORPH-V2-06).

### P4 — `pgcrypto` availability

```
$ list_extensions → pgcrypto: installed_version "1.3", schema "extensions"
```

Already installed in the standard Supabase `extensions` schema. No
`CREATE EXTENSION` needed. Note that mig 073 references
`gen_random_bytes` and bcrypt without schema-qualification; the
postgres role's default `search_path` includes `extensions` on
Supabase, so unqualified calls resolve correctly. Documented as a
soft dependency.

### Pre-flight verdict

All four P-steps clean. Quarantine, dedup plan, and `global_patients`
all absent. Proceed to Phase 2 (mig 071).

---

## 2. Step 1 — apply mig 071 + quarantine review

### S1 — apply

Tool: `mcp__supabase__apply_migration`, name `071_normalize_patient_phone`,
project `mtmdotixlhwksyoordbl`. Wall-clock window:

- pre-apply timestamp: `2026-04-29 03:14:11.497892+00`
- quarantine row insert timestamps: `2026-04-29 03:14:35.099774+00`
- post-apply verify timestamp: `2026-04-29 03:14:43.754438+00`

Apply itself completed inside the ~32 s window; the migration's
final UPDATE/INSERT activity timestamps at 03:14:35, so the run
itself was on the order of ~5–15 seconds. No errors, no warnings;
MCP returned `{"success": true}`.

### S2 — column / function / index verification

```sql
SELECT
  (SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='patients'
                     AND column_name='normalized_phone')) AS patients_has_col,
  (SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='users'
                     AND column_name='normalized_phone')) AS users_has_col,
  (SELECT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='_phone_normalize_quarantine')) AS quarantine_table_exists,
  (SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='normalize_phone_e164'
                   AND pronamespace = 'public'::regnamespace)) AS normalizer_function_exists,
  (SELECT EXISTS (SELECT 1 FROM pg_indexes
                   WHERE schemaname='public' AND indexname='idx_patients_normalized_phone')) AS norm_phone_index_exists;
```

Result:

```
patients_has_col                = true
users_has_col                   = true
quarantine_table_exists         = true
normalizer_function_exists      = true
norm_phone_index_exists         = true
```

All five TRUE — schema additions match plan.

### S3 — quarantine inventory

```sql
SELECT table_name, COUNT(*) AS row_count
  FROM public._phone_normalize_quarantine
 GROUP BY table_name;
```

| table_name | row_count |
|------------|-----------|
| patients   | 3         |
| users      | 71        |
| **total**  | **74**    |

Backfill stats (sanity check):

| table | rows | with phone | normalized | quarantined |
|-------|-----:|-----------:|-----------:|------------:|
| patients | 35  | 35  | 32  | 3  |
| users    | 288 | 288 | 217 | 71 |

Full quarantine dump preserved in
`audits/quarantine-resolution.md` § "Build 02 staging apply —
2026-04-28" with category breakdown (buckets A–F).

### Decision (Mo, 2026-04-28)

**PATH B for all 74 rows** — leave in quarantine, defer to mig 075
(Prompt 3) which will emit sentinel `global_patients` rows. Reasoning
captured in `audits/quarantine-resolution.md`. No source-table phone
corrections were applied at this step.

### S4 — section verdict

Apply timing OK. Schema check OK. Quarantine inventoried, decision
recorded, no rows mutated. **Proceed to Phase 3 (mig 072)** — mig 072
is read-only and quarantine doesn't block it; quarantine doesn't
block mig 073 either.

---

## 3. Step 2 — apply mig 072 + dedup plan review

### S5 — apply

Tool: `mcp__supabase__apply_migration`, name `072_dedup_detection`,
project `mtmdotixlhwksyoordbl`. Wall-clock window:

- pre-apply timestamp: `2026-04-29 03:18:56.117107+00`
- post-apply verify timestamp: `2026-04-29 03:19:18.377737+00`
- auto-population insert timestamp (the row that landed):
  `decided_at = 2026-04-29 03:19:11.331352+00`

Apply itself completed inside the ~22 s window; the auto-populated
row's timestamp at 03:19:11 puts the migration runtime on the order
of ~5–15 seconds. No errors, no warnings; MCP returned
`{"success": true}`.

### S6 — schema check

```sql
SELECT
  (SELECT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='_patient_dedup_plan')) AS plan_exists,
  (SELECT EXISTS (SELECT 1 FROM information_schema.views
                   WHERE table_schema='public' AND table_name='_patient_phone_duplicates')) AS patient_dups_view,
  (SELECT EXISTS (SELECT 1 FROM information_schema.views
                   WHERE table_schema='public' AND table_name='_user_phone_duplicates')) AS user_dups_view;
```

Result: `plan_exists = true`, `patient_dups_view = true`,
`user_dups_view = true`. All three TRUE.

### S7 — dedup plan inventory

```sql
SELECT COUNT(*) AS total_clusters FROM public._patient_dedup_plan;
```
→ `total_clusters = 1`.

```sql
SELECT resolution,
       COUNT(*)                                       AS row_count,
       COUNT(*) FILTER (WHERE decided_at IS NOT NULL) AS resolved,
       COUNT(*) FILTER (WHERE decided_at IS NULL)     AS unresolved
  FROM public._patient_dedup_plan
 GROUP BY resolution;
```

| resolution | row_count | resolved | unresolved |
|---|---:|---:|---:|
| auto_oldest_wins | 1 | 1 | **0** |

No `manual_review` rows. mig 073's gate would pass. Per the prompt:
since `unresolved = 0` and there's only 1 cluster, this *is* the
spot-check.

**Full plan dump (winner / loser context).**

```
Cluster 1 — normalized_phone = +201098765432
  winner_patient_id: d076ab14-5fa6-4526-b246-e7a0e45280a4
  loser_patient_ids: [c58fc4ea-1cbe-455f-ac68-ba9d7e7e29eb]
  resolution       : auto_oldest_wins
  decided_at       : 2026-04-29 03:19:11.331352+00
  decided_by       : NULL  (system)
  notes            : NULL

  winner_row:
    unique_id    PT32C8B898
    full_name    سارة خالد
    age / sex    25 / Female
    clinic_id    298866c7-87b7-4405-9487-c7174bafaf99
    raw phone    01098765432
    created_at   2026-02-09T00:17:14.311221+00:00

  loser_rows[0]:
    unique_id    MED-9T3SZK
    full_name    محمد عبدالله حسن
    age / sex    42 / Male
    clinic_id    8d27729f-9f9b-426a-aa48-cc16a419559a
    raw phone    201098765432
    created_at   2026-03-15T16:54:25.663934+00:00
    created_by_doctor_id  879f9f87-bde6-492f-bf13-005404103345
```

**Mo's decision (2026-04-28):** accept the auto-pick. Sara remains
the canonical winner; Mohamed will be flagged as
`duplicate_of_patient_id = Sara.id` by mig 073. The two rows are
different people (different name, age, sex, clinic) sharing the
same phone after normalization. Mo acknowledged the data-quality
concern at decision time (likely a phone-correction follow-up via
the admin scope, or a true family-shared-phone case to be
addressed in Prompt 3+). Captured in `audits/dedup-resolution.md`
§ "Build 02 staging apply — dedup plan inventory (2026-04-28)".

**Side channel — `_user_phone_duplicates` (informational, not
consumed by mig 073).**

| normalized_phone | dup_count | user_ids |
|---|---:|---|
| +201034737110 | 2 | 692965c6-…, 315bc631-… |
| +201098765432 | 2 | d076ab14-… (Sara), c58fc4ea-… (Mohamed) |
| +201215335374 | 2 | 7352e055-…, 99a103d8-… |
| +201222101833 | 2 | 91f6460d-…, 15d02015-… |

User-side dedup is Prompt 3's responsibility. Recorded for
hand-off; no action this apply.

### S8 — `audits/dedup-resolution.md` updated

Appended the "Build 02 staging apply — dedup plan inventory
(2026-04-28)" subsection inside the existing "Cluster inventory"
section. Includes the cluster dump, the caveat about Sara/Mohamed
being different people, and Mo's accept-auto-rule sign-off line
("Reviewed and signed off by Mo on 2026-04-28").

### S9 — section verdict

Apply OK, schema check OK, plan auto-populated, all rows
`decided_at IS NOT NULL`. Mig 073's gate is satisfied. **Proceed to
Phase 4 (mig 073)** pending Mo's go.

---

## 4. Step 3 — apply mig 073

### S10 — apply

Tool: `mcp__supabase__apply_migration`, name `073_create_global_patients`,
project `mtmdotixlhwksyoordbl`. Wall-clock window:

- pre-apply timestamp: `2026-04-29 03:23:22.976095+00`
- post-apply verify timestamp: `2026-04-29 03:24:23.902771+00`

MCP returned `{"success": true}`. **The 073.1 pre-flight gate did NOT
fire** — `_patient_dedup_plan.decided_at IS NULL` count was 0 (all 1
auto-resolved cluster had `decided_at = NOW()` from mig 072.4). The
073.13 post-condition assertion also passed, since the only patients
rows with `global_patient_id IS NULL` after the backfill are the 3
quarantined rows already in `_phone_normalize_quarantine` (the
assertion exempts those). The migration was a clean run.

### S11 — schema verification

```sql
SELECT
  (SELECT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='global_patients')) AS gp_exists,
  (SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='patients' AND column_name='global_patient_id')) AS pointer_exists,
  (SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='patients' AND column_name='is_canonical')) AS canonical_flag_exists,
  (SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='patients' AND column_name='duplicate_of_patient_id')) AS dup_of_exists,
  (SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname='patient_account_status')) AS enum_exists,
  (SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='global_patients_normalized_phone_uniq')) AS uniq_phone_idx,
  (SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='global_patients_claimed_user_id_uniq')) AS uniq_claimed_user_idx,
  (SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_patients_global_patient_id')) AS pointer_idx_exists,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.global_patients'::regclass) AS rls_enabled,
  (SELECT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname='public' AND tablename='global_patients' AND policyname='global_patients_deny_all')) AS deny_policy_exists,
  (SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_global_patients_touch_updated')) AS touch_trigger_exists;
```

Result: every column TRUE.

| check | result |
|---|---|
| `gp_exists` | true |
| `pointer_exists` (patients.global_patient_id) | true |
| `canonical_flag_exists` | true |
| `dup_of_exists` | true |
| `enum_exists` (patient_account_status) | true |
| `uniq_phone_idx` (global_patients_normalized_phone_uniq) | true |
| `uniq_claimed_user_idx` | true |
| `pointer_idx_exists` (idx_patients_global_patient_id) | true |
| `rls_enabled` (on global_patients) | true |
| `deny_policy_exists` (global_patients_deny_all) | true |
| `touch_trigger_exists` (trg_global_patients_touch_updated) | true |

### S12 — row counts after backfill

```sql
SELECT
  (SELECT COUNT(*) FROM public.global_patients) AS gp_total,
  (SELECT COUNT(*) FROM public.patients WHERE is_canonical = TRUE) AS canonical_patients,
  (SELECT COUNT(*) FROM public.patients WHERE is_canonical = FALSE) AS noncanonical_patients,
  (SELECT COUNT(*) FROM public.patients WHERE is_canonical IS NULL) AS canonical_null,
  (SELECT COUNT(*) FROM public.patients WHERE duplicate_of_patient_id IS NOT NULL) AS losers_flagged,
  (SELECT COUNT(*) FROM public.patients WHERE global_patient_id IS NOT NULL) AS pointer_filled,
  (SELECT COUNT(*) FROM public.patients WHERE global_patient_id IS NULL) AS pointer_null;
```

| metric | value |
|---|---:|
| `gp_total` (global_patients rows) | **31** |
| canonical patients (is_canonical=TRUE) | 31 |
| non-canonical patients (is_canonical=FALSE) | 4 |
| is_canonical IS NULL | 0 |
| losers flagged (duplicate_of_patient_id NOT NULL) | 1 |
| patients pointer filled | 32 |
| patients pointer NULL | 3 |

**Reconciliation.** patients_total = 35 = 31 canonical + 1 loser + 3
quarantined ✓. pointer_filled = 32 = 31 canonical + 1 loser (Mohamed
points at Sara's `global_patients` row via `normalized_phone =
+201098765432`) ✓. pointer_null = 3 = exactly the 3 quarantined
patients (`81696b8a…`, `bbb7c45a…`, `fdbc93ce…`) ✓. The single
flagged loser is Mohamed (`c58fc4ea…`) → `duplicate_of_patient_id =
d076ab14…` (Sara) ✓.

Migration complete. Proceed to Phase 5 (validation) pending Mo's go.

---

## 5. Step 4 — validation (`scripts/validate-mig-071-072-073.sql`)

Each of the 23 numbered checks (24 queries; check 1 has parts a/b) was
run individually via `mcp__supabase__execute_sql`. Aggregate:
**21 PASS, 2 FAIL.** Both FAILs are checks 22 and 23 (audit-log
inserts); root cause is the `audit_events.actor_user_id NOT NULL`
constraint, not a data invariant.

| # | Check | Expected | Actual | PASS/FAIL |
|---|---|---|---|---|
| 1a | unnormalized_unquarantined_patients | 0 | 0 | PASS |
| 1b | unnormalized_unquarantined_users | 0 | 0 | PASS |
| 2 | bad_format_patients / bad_format_users | 0 / 0 | 0 / 0 | PASS |
| 3 | normalize_phone_e164 known inputs (7 booleans) | all TRUE | all TRUE | PASS |
| 4 | quarantine count by table (informational) | record only | patients=3, users=71 | PASS |
| 5 | missing_plan_rows | 0 | 0 | PASS |
| 6 | auto_oldest_wins with decided_at NULL | 0 | 0 | PASS |
| 7 | unresolved_manual_review | 0 | 0 | PASS |
| 8 | winner_outside_cluster | 0 | 0 | PASS |
| 9 | _user_phone_duplicates queryable (informational) | reference | 4 | PASS |
| 10 | winners_not_canonical | 0 | 0 | PASS |
| 11 | losers_misflagged | 0 | 0 | PASS |
| 12 | bad_clusters (one-winner-per-phone invariant) | 0 | 0 | PASS |
| 13 | broken_pointers | 0 | 0 | PASS |
| 14 | global_patients count = canonical unique phones | counts_match TRUE | TRUE (31 = 31) | PASS |
| 15 | leaked_claim | 0 | 0 | PASS |
| 16 | unlinked_patients | 0 | 0 | PASS |
| 17 | dangling_pointers | 0 | 0 | PASS |
| 18 | UNIQUE on global_patients.normalized_phone (no rows returned) | 0 rows | 0 rows | PASS |
| 19 | enum_values | `{active,suspended,locked,deceased,merged}` | identical | PASS |
| 20 | global_patients.account_status data type | `patient_account_status` | `patient_account_status` | PASS |
| 21 | RLS DENY-ALL placeholder | name=`global_patients_deny_all`, using=`false` | identical (polcmd=`*`) | PASS |
| 22 | PATIENT_DEDUP_FLAGGED audit count = losers | 1 = 1 | 1 ≠ **0** | **FAIL** |
| 23 | GLOBAL_PATIENT_CREATED audit count = gp_count | 31 = 31 | 31 ≠ **0** | **FAIL** |

**Spot-check (5 random patients).** Every row has
`is_canonical=true`, `global_patient_id` resolves to a real
`global_patients.id`, `gp.normalized_phone` equals `p.normalized_phone`,
`gp_status='active'`. Sample:

```
patient_id   raw_phone        normalized_phone   is_canonical   gp_status
2aa993bb…    01034737440      +201034737440      true           active
5f07fe43…    01034737330      +201034737330      true           active
ab9e83e7…    +201111111104    +201111111104      true           active
6036cd97…    01234567890      +201234567890      true           active
99a103d8…    201215335374     +201215335374      true           active
```

### Root cause of checks 22 + 23

`audit_events.actor_user_id` is **`NOT NULL`** with FK to
`public.users(id)`. The migration's INSERTs in 073.5 and 073.10
pass `NULL` for actor_user_id (system action, no actor). The DO
block wraps each INSERT in `BEGIN/EXCEPTION WHEN OTHERS THEN
RAISE NOTICE`, so the migration succeeds and the data work lands,
but the audit rows are silently rejected. We don't see the NOTICE
through MCP.

The migration's author explicitly declared this non-blocking:

```sql
-- Wrapped in a sub-block so a shape-mismatch in audit_events doesn't
-- abort the migration; the audit row is nice-to-have, not load-bearing.
```

Diagnostic queries (D1–D5) confirmed:

- `audit_events.actor_user_id`: `uuid`, `is_nullable = NO`, FK to
  `public.users(id)`.
- `audit_events.action`: `text` (not ENUM, no CHECK constraint) — so
  the new `PATIENT_DEDUP_FLAGGED` / `GLOBAL_PATIENT_CREATED` strings
  would have been accepted.
- No rows for either action exist in `audit_events`. The inserts
  truly didn't land — not a query bug.

### Mo's decision (2026-04-28)

Accept the FAIL. The data integrity invariants (checks 10–18) all
PASS. The audit-log gap is logged as a **new orphan,
ORPH-V2-11**, owned by Backend, to be closed by the next migration
that either (a) makes `audit_events.actor_user_id` nullable, or
(b) seeds a system sentinel user in `public.users` — followed by
re-running the two INSERTs from mig 073.5 / 073.10 with the same
idempotency guards.

### Section verdict

21 / 23 PASS. The 2 FAILs are observability-only and tracked as
ORPH-V2-11. **Proceed to Phase 6 (admin endpoint smoke test).**

---

## 6. Step 5 — admin endpoint smoke test

### S17 — test phone

Pulled a real `normalized_phone` from `global_patients`:

```sql
SELECT normalized_phone FROM public.global_patients LIMIT 1;
-- Used the spot-check row 2aa993bb-c7a6-465b-a77f-f798ea29565f
-- → +201034737440
```

### S18 — staging deployment URL

`https://medassist-clinic.vercel.app` (Mo, 2026-04-28). Trailing
slash stripped for curl.

### S19 — three smoke tests, run from the cowork sandbox

Test phone: `+201034737440` (URL-encoded by `--data-urlencode`).

| # | Request | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | `GET /api/admin/global-patients/lookup?phone=+201034737440` with `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` | 200 + JSON | **404 + Next.js _not-found_ HTML** | **N/A — endpoint not deployed** |
| 2 | Same URL, no `Authorization` header | 401 | **404 + Next.js _not-found_ HTML** | **N/A — endpoint not deployed** |
| 3 | Same URL, `Authorization: Bearer not-a-real-service-role-key` | 401 | **404 + Next.js _not-found_ HTML** | **N/A — endpoint not deployed** |

### Diagnostic — confirmed deploy-lag, NOT auth/path

Three control probes against the same Vercel host disambiguate the
404:

| URL | Status | Interpretation |
|---|---|---|
| `/api/admin/patient-dedup` (older sibling endpoint, exists in repo before Build 02) | 401 | Endpoint EXISTS on the deployed bundle, returns 401 to unauthenticated request. The Next.js routing and the auth layer both work. |
| `/api/admin/global-patients/lookup` | 404 | Route NOT in the deployed bundle. |
| `/api/totally-bogus` | 404 | Confirms 404 is route-absent (matches the lookup case). |

Combined with the local file proof that `apps/clinic/app/api/admin/global-patients/lookup/route.ts`
exists in the working tree (re-exporting `GET` from
`packages/shared/lib/api/handlers/admin/global-patients-lookup/handler.ts`),
the deduction is unambiguous: the deployed Vercel build predates
the Build 02 follow-up that introduced this route.

### Decision (Mo, 2026-04-28)

Skip Phase 6 on this apply; document as **pending next deploy**.
Server-side migration health stands on its own — the migrations
were applied directly via Supabase MCP, not via a Next.js build,
so the API endpoint test is independent. The three curl tests are
re-runnable any time after the next Vercel deploy lands.

### Re-run plan (post-deploy)

Once `apps/clinic/app/api/admin/global-patients/lookup/route.ts`
is in the deployed bundle, re-run from any shell with the same
test phone:

```bash
HOST="https://medassist-clinic.vercel.app"
PHONE="+201034737440"
ENDPOINT="/api/admin/global-patients/lookup"
KEY="$SUPABASE_SERVICE_ROLE_KEY"   # do NOT inline the literal token

curl -fsS -G --data-urlencode "phone=$PHONE" \
  -H "Authorization: Bearer $KEY" \
  "$HOST$ENDPOINT" | jq .
# Expect: 200 + { id, normalized_phone:"+201034737440",
#                 claimed:false, claimed_user_id:null, account_status:"active", ... }

curl -s -o /dev/null -G --data-urlencode "phone=$PHONE" \
  -w "%{http_code}\n" \
  "$HOST$ENDPOINT"
# Expect: 401

curl -s -o /dev/null -G --data-urlencode "phone=$PHONE" \
  -H "Authorization: Bearer not-a-real-service-role-key" \
  -w "%{http_code}\n" \
  "$HOST$ENDPOINT"
# Expect: 401
```

The handler tests (`packages/shared/lib/api/handlers/admin/global-patients-lookup/__tests__/handler.test.ts`,
9 cases) already cover the same auth contract at the unit level
and PASSED in Build 02 follow-up. The smoke test is integration
verification only — its absence on this apply doesn't undermine
data integrity.

### Section verdict

Tests deferred to next deploy. Server-side state confirmed
healthy by Section 5 (validation 21/23 PASS).

---

## 7. Sign-off

### Final summary

| step | status |
|---|---|
| **Migrations applied** | 071 ✓, 072 ✓, 073 ✓ (all returned `{"success": true}` from MCP) |
| **Pre-flight gate (mig 073)** | passed without firing — 0 unresolved clusters at apply time |
| **Validation** | **21 / 23 PASS**; 2 FAIL (checks 22 + 23, audit-log only) accepted as ORPH-V2-11 follow-up |
| **Spot-check** | 5 random patients all link cleanly to `global_patients` with matching `normalized_phone` and `account_status='active'` |
| **Admin endpoint smoke** | **deferred** — endpoint not in current Vercel bundle; re-run after next deploy (Section 6) |
| **Quarantine** | 74 rows left in place per Mo's PATH B decision; resolved by mig 075 in Prompt 3 |
| **Dedup plan** | 1 cluster auto-resolved (Sara wins +201098765432); Mo signed off |
| **Orphan ledger** | ORPH-V2-10 → Closed; ORPH-V2-11 → Open (audit_events backfill) |

### Files written / updated

- `audits/patient-identity-build-02-staging-apply.md` — this document (sections 1–7).
- `audits/dedup-resolution.md` — Build 02 staging apply subsection appended under "Cluster inventory" with the cluster dump, caveat, and Mo's accept-auto-rule sign-off line.
- `audits/orphan-ledger.md` — ORPH-V2-10 moved to Closed Items; ORPH-V2-11 added to Open Items (audit_events backfill follow-up). V2-01 through V2-09 unchanged; verified.
- `audits/quarantine-resolution.md` — created; 74-row inventory categorized into buckets A–F, PATH B decision recorded with reasoning, Mo's sign-off line.

### Migration ledger state

`mcp__supabase__list_migrations` after apply (most recent four):

```
… 069 add_idempotency_keys
   070 users_phone_verified_and_phone_change_for_staff
   071 normalize_patient_phone               ← applied this run
   072 dedup_detection                       ← applied this run
   073 create_global_patients                ← applied this run
```

### Database state at sign-off

| metric | value |
|---|---:|
| `patients` total | 35 |
| `users` total | 288 |
| `global_patients` total | 31 |
| `_patient_dedup_plan` rows | 1 (auto, decided) |
| `_phone_normalize_quarantine` rows | 74 (3 patients + 71 users; PATH B) |
| canonical patients (`is_canonical = TRUE`) | 31 |
| flagged duplicates (`duplicate_of_patient_id NOT NULL`) | 1 |
| patients with `global_patient_id` populated | 32 |
| patients with `global_patient_id` NULL | 3 (= 3 quarantined patients) |

### Open follow-ups owed by other prompts

- **Prompt 3 (data layer cutover)** owes ORPH-V2-07 (NOT NULL flip on `patients.global_patient_id` after quarantine resolution via mig 075) and ORPH-V2-08 (route reads through `findGlobalPatientById` / `findGlobalPatientByPhone`).
- **Prompt 6** owes ORPH-V2-06 (real RLS policies replacing the DENY-ALL placeholder).
- **Backend, next migration** owes ORPH-V2-11 (`audit_events.actor_user_id` nullability + audit row backfill from mig 073).
- **Next deploy** owes the three smoke-test curl runs against the now-shipped `/api/admin/global-patients/lookup` route.

### Hand-off

Build 02 staging apply complete. Awaiting Mo's review before
Prompt 3 launch. Status update for `audits/EXECUTION_PROMPTS.md`
will follow Mo's sign-off:

> Build 02 ✅ COMPLETE (with follow-up + staging apply). Validation
> 21/23 PASS; the 2 FAILs are audit_events shape mismatches tracked
> as ORPH-V2-11. Admin endpoint smoke deferred to next deploy.
> Mo signed off the dedup auto-pick (+201098765432, Sara wins) and
> the PATH B quarantine deferral (74 rows → mig 075).

### Mo's sign-off

> Mo: confirm sign-off and I'll mark **Build 02 ✅ COMPLETE (with
> follow-up + staging apply)** in `audits/EXECUTION_PROMPTS.md`
> status tracker. After your confirmation, Prompt 3 is ready to
> launch.

**Signed.** Build 02 staging apply ✅ COMPLETE — Mo, 2026-04-28.

Decisions on record (each captured at its decision point earlier in
this document):

1. Staging project = `medassist-egypt` (`mtmdotixlhwksyoordbl`).
2. Quarantine: PATH B for all 74 rows → mig 075 (Prompt 3).
3. Dedup cluster `+201098765432` → accept auto-rule (Sara wins).
4. Validation FAILs 22+23 → accept; tracked as ORPH-V2-11.
5. Phase 6 (admin endpoint smoke) → deferred to next deploy.

**Tracker update owed.** `audits/EXECUTION_PROMPTS.md` does not
exist in the repository (verified earlier and flagged in
`audits/patient-identity-build-02-followup-results.md` § 1). Mo
owns the tracker update — exact line to add when the file lands:

> Build 02 ✅ COMPLETE (with follow-up + staging apply, 2026-04-28).
> Mig 071/072/073 applied to staging via Supabase MCP; validation
> 21/23 PASS (audit-events shape FAIL → ORPH-V2-11); admin endpoint
> smoke deferred to next deploy. Sign-off: Mo, 2026-04-28.

**Stop point.** This deliverable is the apply report. Prompt 3 is
launched separately at Mo's discretion.
