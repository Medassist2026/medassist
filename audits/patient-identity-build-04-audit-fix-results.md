# Patient Identity Build 04 — D7 Audit Regression Fix (mig 088)

**Date:** 2026-04-30
**Trigger:** D7 manual test T2.10 FAIL — see
`audits/patient-identity-build-04-d7-test-results.md` § 3 + § 5.
**Scope:** Single migration (mig 088) adding an `AFTER INSERT` trigger on
`patient_clinic_records`. No data-layer changes, no schema changes
beyond the trigger, no backfill of historical missing audit rows.
**Headline:** Audit regression closed for all future PCR inserts.
Historical gap (Sara's clinic-B PCR from D7 testing) is intentionally
left uncovered and tracked as **ORPH-V4-D7-04**.

---

## 1. Pre-fix verification

### P1 — repro confirmed

```sql
SELECT pcr.id AS pcr_id, pcr.global_patient_id, pcr.clinic_id,
       pcr.first_seen_at,
       (SELECT COUNT(*) FROM public.audit_events
         WHERE action = 'PATIENT_CLINIC_RECORD_CREATED'
           AND entity_id::text = pcr.id::text
           AND clinic_id = pcr.clinic_id) AS audit_count_by_pcr_id
  FROM public.patient_clinic_records pcr
 WHERE pcr.global_patient_id = 'd076ab14-5fa6-4526-b246-e7a0e45280a4'
   AND pcr.clinic_id = '4b5a180f-694f-4956-8004-0583c80bce33';
```

Result:

| pcr_id | first_seen_at | audit_count_by_pcr_id |
|---|---|---|
| `9095f06f-c885-4b38-9bd2-8850ad0bb9ca` | 2026-04-30 05:08:51.943 UTC | **0** |

(Note: the `9095f06f` row was inserted during D7 testing on 2026-04-29
local but the timestamp shows 2026-04-30 UTC due to the timezone offset
— the relevant fact is that the row predates mig 088 and has no audit.)

The test plan's broader query (`audit_count` keyed by gpid, not pcr_id)
also returned 0 — confirms zero audit rows exist for this PCR under any
keying scheme.

### P2 — existing trigger inventory

```sql
SELECT t.tgname, t.tgenabled, p.proname AS function_name
  FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
 WHERE t.tgrelid = 'public.patient_clinic_records'::regclass
   AND NOT t.tgisinternal;
```

| tgname | enabled | function |
|---|---|---|
| `patient_clinic_records_touch_updated_at_trg` | O | `patient_clinic_records_touch_updated_at` (BEFORE UPDATE) |

Only one trigger pre-fix: a BEFORE UPDATE bump for `updated_at`.
Confirmed: no INSERT trigger writing audit rows. The new trigger name
`tg_audit_pcr_insert_trg` does not collide.

### P3 — `PATIENT_CLINIC_RECORD_CREATED` enum membership

```bash
$ grep -n "PATIENT_CLINIC_RECORD_CREATED" packages/shared/lib/data/audit.ts
52:  //    PATIENT_CLINIC_RECORD_CREATED — written by mig 074 for every backfilled
77:  | 'PATIENT_CLINIC_RECORD_CREATED'
```

Already in the AuditAction TS enum (added in Build 03 — see audit.ts
header comment around line 52). No enum work needed.

### P4 — `audit_events` schema sanity

| column | type | nullable |
|---|---|---|
| id | uuid | NO |
| clinic_id | uuid | YES |
| actor_user_id | uuid | YES |
| action | text | NO |
| entity_type | text | NO |
| entity_id | uuid | YES |
| metadata | jsonb | YES |
| created_at | timestamptz | YES |
| actor_kind | text | NO |

CHECK constraints:

- `audit_events_actor_consistency` — `(actor_kind='user' AND actor_user_id IS NOT NULL) OR (actor_kind IN ('system','migration') AND actor_user_id IS NULL)`
- `audit_events_actor_kind_check` — `actor_kind IN ('user','system','migration')`

Plan to use `actor_kind='system'` + `actor_user_id=NULL` is consistent
with both constraints.

### P5 — actor choice rationale

Trigger-fired audits cannot reliably capture the application-level
`actor_user_id` (the trigger sees the Postgres session, not the
authenticated end user from a Next.js route handler). Two valid choices
allowed by the CHECK:

- `actor_kind='migration'` — implies the row was written *by a
  migration*, which it isn't.
- `actor_kind='system'` — neutral system attribution. **Chosen.**

If Mo wants user-attributed audits later (e.g., capturing which
frontdesk staffer performed the unlock), the data layer would need to
add a separate audit write inside `resolveIdentityForClinic` with
`actor_kind='user'` and the legitimate `actor_user_id`. That is out of
scope for this fix.

---

## 2. Migration content

### Files

| File | Lines | Purpose |
|---|---|---|
| `supabase/migrations/088_pcr_insert_audit_trigger.sql` | 113 | Forward — trigger function + trigger + post-condition assertion |
| `supabase/migrations/088_pcr_insert_audit_trigger.rollback.sql` | 16 | Rollback — drop trigger + drop function |

### Forward — key content

Trigger function:

```sql
CREATE OR REPLACE FUNCTION public.tg_audit_pcr_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.audit_events (
    action, actor_kind, actor_user_id,
    clinic_id, entity_type, entity_id,
    metadata, created_at
  ) VALUES (
    'PATIENT_CLINIC_RECORD_CREATED',
    'system',
    NULL,
    NEW.clinic_id,
    'patient_clinic_record',
    NEW.id,
    jsonb_build_object(
      'source', 'trigger_pcr_insert',
      'global_patient_id', NEW.global_patient_id,
      'clinic_id', NEW.clinic_id,
      'first_seen_at', NEW.first_seen_at,
      'last_seen_at', NEW.last_seen_at,
      'is_anonymous_to_global', NEW.is_anonymous_to_global,
      'consent_to_messaging', NEW.consent_to_messaging
    ),
    NOW()
  );
  RETURN NEW;
END;
$$;
```

Trigger definition:

```sql
DROP TRIGGER IF EXISTS tg_audit_pcr_insert_trg ON public.patient_clinic_records;

CREATE TRIGGER tg_audit_pcr_insert_trg
  AFTER INSERT ON public.patient_clinic_records
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_audit_pcr_insert();
```

Post-condition assertion (`DO $$ … $$`) verifies exactly one enabled
trigger of this name exists on the table; raises on mismatch.

### Idempotency

- `CREATE OR REPLACE FUNCTION` — re-running replaces the function body
  in place.
- `DROP TRIGGER IF EXISTS … ; CREATE TRIGGER …` — re-running drops and
  recreates the trigger.
- Re-applying mig 088 is therefore a no-op modulo a brief
  drop-and-recreate window; safe.

### Atomicity

`AFTER INSERT … FOR EACH ROW` runs inside the same transaction as the
originating INSERT. If the audit-row INSERT fails (CHECK violation, FK
violation, etc.), the original PCR INSERT rolls back as well — matching
the application-layer audit invariant from spec § 16.1. This is the
desired behavior; no override needed.

---

## 3. Apply result

```text
mcp__supabase__apply_migration
  project_id = mtmdotixlhwksyoordbl  (medassist-egypt = staging)
  name       = 088_pcr_insert_audit_trigger
  → {"success": true}
```

Post-condition `DO $$ … $$` block ran inside the same migration call and
did not raise — the trigger landed enabled.

---

## 4. Trigger verification

### S4 — trigger present and enabled

```sql
SELECT t.tgname, t.tgenabled, p.proname FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
 WHERE t.tgrelid = 'public.patient_clinic_records'::regclass
   AND NOT t.tgisinternal;
```

| tgname | enabled | function |
|---|---|---|
| `patient_clinic_records_touch_updated_at_trg` | O | `patient_clinic_records_touch_updated_at` |
| **`tg_audit_pcr_insert_trg`** | **O** | **`tg_audit_pcr_insert`** |

Both triggers present, both enabled. **PASS.**

### S5 — synthetic INSERT fires the trigger

Pre-INSERT count for Sara at test clinic `af2c1281-…` (Privacy Clinic A):
`pre_count = 0` ✅ — safe to insert.

INSERT:

```sql
INSERT INTO public.patient_clinic_records (
  global_patient_id, clinic_id, first_seen_at, last_seen_at,
  is_anonymous_to_global, consent_to_messaging
) VALUES (
  'd076ab14-5fa6-4526-b246-e7a0e45280a4',
  'af2c1281-16ef-42de-9a59-c4c26f68a8b2',
  NOW(), NOW(), FALSE, FALSE
) RETURNING id;
```

Returned `id = 54405aec-c1e3-4927-bd8a-ea881d66b2d0`.

Audit verification:

```sql
SELECT action, actor_kind, actor_user_id, entity_type, entity_id, clinic_id,
       metadata->>'source' AS source, created_at
  FROM public.audit_events
 WHERE action = 'PATIENT_CLINIC_RECORD_CREATED'
   AND entity_id::text = '54405aec-c1e3-4927-bd8a-ea881d66b2d0';
```

| field | value |
|---|---|
| action | `PATIENT_CLINIC_RECORD_CREATED` |
| actor_kind | `system` |
| actor_user_id | `null` |
| entity_type | `patient_clinic_record` |
| entity_id | `54405aec-c1e3-4927-bd8a-ea881d66b2d0` |
| clinic_id | `af2c1281-16ef-42de-9a59-c4c26f68a8b2` |
| metadata.source | `trigger_pcr_insert` |
| metadata.global_patient_id | `d076ab14-5fa6-4526-b246-e7a0e45280a4` |
| metadata.is_anonymous_to_global | `false` |
| metadata.consent_to_messaging | `false` |
| created_at | `2026-04-30 05:32:30.636959+00` (same instant as INSERT) |

**PASS.** Trigger fires inside the same transaction (timestamp matches
the row's `first_seen_at` to the microsecond — proof of atomicity).

### S6 — staging cleanup

CTE delete returned `audit_rows_deleted=1, pcr_rows_deleted=1`.
Re-query confirms `pcr_remaining=0, audit_remaining=0` for the test
PCR id. Staging clean.

### S7 — historical gap intact (intentional)

Sara's clinic-B PCR row (`9095f06f-…`) still has `audit_count = 0`
post-mig-088. **This is correct.** The trigger only fires on new
INSERTs; backfilling a `created_at = NOW()` audit row for an event that
happened before the trigger existed would be forensically dishonest
(the audit timestamp would not match the actual event timestamp). See § 6.

---

## 5. Orphan ledger updates

### Part A — ORPH-V2-11 closed-row follow-up note

The existing closed-items row for ORPH-V2-11 has been amended with a
follow-up paragraph dated 2026-04-30 documenting the runtime gap, the
mig 088 closure, and the historical Sara/clinic-B exception.

### Part B — ORPH-V4-D7-04 opened

```
| ORPH-V4-D7-04 | Sara's clinic-B PCR row from D7 testing has no
PATIENT_CLINIC_RECORD_CREATED audit row (historical, pre-trigger) |
AUDIT | Build 04 D7 audit-fix (mig 088, applied 2026-04-30) | Prompt 6.5 |
Mo | …default disposition (a) accept the gap — forensic honesty
about what audit existed at the time of the event. |
```

Closing prompt is Prompt 6.5; owner Mo. Decision is deferred — mig 088
itself does not require it to be resolved.

---

## 6. Honest gap acknowledgment

Sara's clinic-B PCR row (`9095f06f-c885-4b38-9bd2-8850ad0bb9ca`,
inserted 2026-04-29 05:08:51 UTC during D7 manual testing) is
permanently missing its `PATIENT_CLINIC_RECORD_CREATED` audit row.

This is intentional. The choice was between:

- **(a) Accept the gap.** Forensically, an audit log is a record of
  what was observed *at the time the event occurred*. A backfill
  written today with `created_at = NOW()` and an explanatory `metadata`
  flag would be a synthesis, not an observation, and could mislead a
  future investigator who runs a query over the audit table without
  reading every metadata field. The gap is small (1 row), well-known,
  and traceable — the missing audit is not a privacy or correctness
  problem, only a completeness one.
- **(b) Backfill with explicit synthesis markers.** Insert a row with
  `metadata.source='d7_test_backfill'` plus a separate
  `metadata.event_actually_occurred_at` carrying the original
  timestamp. This works, but spreads the source-of-truth across two
  fields and trades one form of inaccuracy (missing row) for another
  (timestamp on a real-looking `created_at` is fictional).

Default disposition is (a). Prompt 6.5 has the final call.

The trigger covers every future INSERT regardless of caller —
data-layer code (`getOrCreatePatientClinicRecord`), future migrations,
manual ops, ad-hoc fixes. Going forward, the audit invariant from spec
§ 16.1 holds for `patient_clinic_records.PATIENT_CLINIC_RECORD_CREATED`
without any application-layer cooperation.

---

**End of audit-fix results.** Mig 088 closes the runtime audit
regression caught by D7 T2.10. Prompt 5 (Patient Data Shares &
Lifecycle) is unblocked.
