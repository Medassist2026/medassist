# RLS Rewrite Plan — Migrations 052–05x

> Companion to `RLS_REWRITE_PROMPT.md`. Produced 2026-04-25 after auditing
> the live `medassist-egypt` DB. **No DB writes performed yet** — this is the
> proposal for review before any `apply_migration` call.

---

## 1. Audit results (live DB, 2026-04-25)

Trust this section over the prompt's "current state" — these are direct reads
from `pg_proc`, `pg_type`, `information_schema`, and `pg_policies`, not file
guesses.

### Enums

| Enum | Status |
|---|---|
| `clinic_role` | **Exists** (values: `OWNER`, `DOCTOR`, `ASSISTANT`, `FRONT_DESK`) |
| `visibility_mode` | Missing |
| `consent_type` | Missing |
| `assignment_scope` | Missing |
| `assignment_status` | Missing |

The prompt said 3 enums are missing; actually **4** are missing. Mig 020 also
defines `assignment_status`, which the prompt acknowledges in its column list
but undercounts in its enum list.

### Functions

`can_access_patient`, `is_clinic_member`, `get_clinic_role` — **all missing.**

### Columns

The 3 tables exist with TEXT columns + CHECK constraints (effectively a
poor-man's enum):

| Column | Type | Default | CHECK | Mig 020 target |
|---|---|---|---|---|
| `assistant_doctor_assignments.scope` | text | `'full'` | none found | enum `assignment_scope` ('APPOINTMENTS_ONLY'/'PATIENT_DEMOGRAPHICS'/'FULL_DOCTOR_SUPPORT') |
| `assistant_doctor_assignments.status` | text | `'ACTIVE'` | `IN ('ACTIVE','REVOKED')` | enum `assignment_status` |
| `patient_visibility.mode` | text | `'DOCTOR_SCOPED_OWNER'` | matches enum domain | enum `visibility_mode` |
| `patient_visibility.consent` | text | `'IMPLICIT_CLINIC_POLICY'` | matches enum domain | enum `consent_type` |
| `patient_visibility.grantee_type` | text | `'DOCTOR'` | `IN ('DOCTOR','ROLE')` | TEXT with CHECK (already correct) |

**Risk** on `assistant_doctor_assignments.scope`: the current default value
`'full'` is **not in the enum domain**. The table has 0 rows so no data
migration is needed, but the default must be dropped before the type cast
or the cast itself will fail.

`clinics.default_visibility` and `clinics.settings` — both **missing**.

### Policy state on the 11 target tables

```
patients         INSERT(3) SELECT(2) UPDATE(2)
clinical_notes   INSERT(1) SELECT(2) UPDATE(1)
appointments     ALL(1) INSERT(1) SELECT(3)
vital_signs      INSERT(1) SELECT(2)
lab_orders       INSERT(1) SELECT(2)
lab_results      SELECT(1)
imaging_orders   ALL(1) SELECT(1)
payments         ALL(1) INSERT(1) SELECT(2)
check_in_queue   ALL(2) SELECT(1) UPDATE(1)
conversations    INSERT(2) SELECT(2) UPDATE(2)
messages         INSERT(1) SELECT(1) UPDATE(1)
```

### Critical reframing finding 🔍

**The `DROP POLICY IF EXISTS` clauses in mig 021 do NOT match the names of
the existing policies.** Examples:

| Mig 021 drops | Live DB has |
|---|---|
| `"Doctors can view their patients"` (patients) | `"Front desk can view all patients"`, `"Patients can read own profile"` |
| `"Doctors can view own appointments"` | `"Doctors can read their appointments"` |
| `"Patients can view own appointments"` | _(no policy with this name; patient access goes via service-role)_ |
| `"Doctors can view their patients vitals"` | exact match — would actually drop |

If we ran mig 021 verbatim today, **most existing policies would survive**
and the new `can_access_patient`-based policies would be **added alongside**
them. RLS uses OR semantics for SELECT, so the result is **additive, not
destructive**.

This inverts the prompt's risk model. The original concern was "doctors lose
access to all their patients via the new path." With current names, the new
path is purely *additive* — the worst case is over-permissive access
(patients become visible via two paths, which is fine), not no-access. Real
risk now is forgetting to drop the legacy policies later, leaving a
permanent over-permissive bypass.

### Other findings

- **`appointments.clinic_id` is still NULLABLE.** Every other table in the
  11 has it `NOT NULL`. The prompt asserted all 11 are NOT NULL — that's
  wrong for `appointments`. This is a real architecture inconsistency.
  Investigate as part of Phase 1; backfill + NOT NULL constraint may be a
  prerequisite to Phase 4 for that table.
- **The 2 existing `patient_visibility` rows** look hand-created
  (created 2026-04-12 and 2026-04-16, both `DOCTOR_SCOPED_OWNER` /
  `IMPLICIT_CLINIC_POLICY` / `DOCTOR`). They will conflict with the seed
  unless we deduplicate.
- **`patient_visibility` has no UNIQUE constraint** on
  `(clinic_id, patient_id, grantee_user_id)`. The mig 020 seed uses
  `ON CONFLICT DO NOTHING` which silently does nothing without a
  constraint to conflict on. The seed needs to be rewritten to
  `INSERT … WHERE NOT EXISTS (…)` or we should add a partial unique index
  first.
- **Service-role bypass dominates the read paths.** The code-path inventory
  shows that `clinical_notes`, `patients`, `appointments`, `payments`,
  `check_in_queue` are heavily read via `createAdminClient()`, which
  bypasses RLS entirely. Most production reads will be unaffected by the
  rewrite. RLS changes here are defense-in-depth, not the primary access
  gate. (This is also a separate architecture concern — too much logic
  bypasses RLS — but it's out of scope for this work.)

### Migration history mismatch

`supabase_migrations.schema_migrations` only has rows up to mig 014, then
jumps to a series of `2026042x...` timestamped migrations corresponding to
mig 045–051. **Migrations 015–044 are not recorded** in the migration table
even though most of their effects are visible in the schema. This means
`apply_migration` will record our new migrations, but we should treat the
recorded history as unreliable for sequencing decisions — always verify
against schema state.

---

## 2. Proposed migrations

### Mig 052 — `seed_patient_visibility.sql`

Replicates the seed INSERT from mig 020 lines 141–164, but rewritten for
idempotency (since there's no UNIQUE constraint to conflict on):

```sql
INSERT INTO public.patient_visibility (
  clinic_id, patient_id, grantee_type, grantee_user_id, mode, consent
)
SELECT DISTINCT
  dpr.clinic_id,
  dpr.patient_id,
  'DOCTOR',
  dpr.doctor_id,
  'DOCTOR_SCOPED_OWNER',
  'IMPLICIT_CLINIC_POLICY'
FROM public.doctor_patient_relationships dpr
WHERE dpr.status = 'active'
  AND dpr.clinic_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.patient_visibility pv
    WHERE pv.clinic_id = dpr.clinic_id
      AND pv.patient_id = dpr.patient_id
      AND pv.grantee_type = 'DOCTOR'
      AND pv.grantee_user_id = dpr.doctor_id
  );
```

Also adds the missing UNIQUE constraint so future seeds/inserts are safe:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uniq_patient_visibility_doctor_grant
ON public.patient_visibility (clinic_id, patient_id, grantee_user_id)
WHERE grantee_type = 'DOCTOR';
```

**Expected post-state:** ~32 rows (one per active DPR with non-null
clinic_id) + the 2 pre-existing rows = 32–34 rows depending on overlap.

**Verification:**

```sql
-- Every active clinic-scoped DPR must produce a visibility row.
SELECT COUNT(*) FROM public.doctor_patient_relationships dpr
WHERE dpr.status = 'active' AND dpr.clinic_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.patient_visibility pv
    WHERE pv.clinic_id = dpr.clinic_id
      AND pv.patient_id = dpr.patient_id
      AND pv.grantee_type = 'DOCTOR'
      AND pv.grantee_user_id = dpr.doctor_id
  );
-- Expect 0.
```

### Mig 053 — `enums_and_clinic_extras.sql`

Creates the 4 missing enum types, converts the 5 columns, drops the bad
default on `assistant_doctor_assignments.scope`, adds `clinics.default_visibility`
and `clinics.settings`.

Sequence (the order matters):

1. `CREATE TYPE` for all 4 enums.
2. For each affected column:
   - Drop the old `DEFAULT` (and the CHECK constraint, if any — the type
     cast won't replace it).
   - `ALTER COLUMN … TYPE <enum> USING <col>::<enum>` — this validates that
     every existing value is a member of the enum domain.
   - Re-add the `DEFAULT`, this time as the enum value.
3. For `assistant_doctor_assignments.scope`, since the old default `'full'`
   is not a valid enum value, replace it with `'APPOINTMENTS_ONLY'`
   (matches mig 020 line 22). 0 rows means no data migration needed.
4. `ALTER TABLE clinics ADD COLUMN default_visibility visibility_mode DEFAULT 'DOCTOR_SCOPED_OWNER'`
5. `ALTER TABLE clinics ADD COLUMN settings JSONB DEFAULT '{}'`

**Verification:** column types, constraint definitions, and that
`clinics.default_visibility` is non-null for every clinic.

### Mig 054 — `access_control_functions.sql`

Lift the 3 functions verbatim from mig 021 lines 8–112. They depend on
the enums (Mig 053) and the seeded `patient_visibility` (Mig 052).

**Verification — call each function directly with known inputs before any
policy uses them:**

```sql
-- Naser is OWNER of clinic 298866c7…  → expect TRUE for any patient in that clinic
SELECT public.can_access_patient(
  '298866c7-87b7-4405-9487-c7174bafaf99'::uuid,
  (SELECT id FROM public.patients WHERE clinic_id = '298866c7-87b7-4405-9487-c7174bafaf99' LIMIT 1),
  '619a7fdd-45a1-49b5-aed2-fbada918b232'::uuid,
  'READ'
);

-- Same patient, different doctor not in that clinic → expect FALSE
SELECT public.can_access_patient(
  '298866c7-87b7-4405-9487-c7174bafaf99'::uuid,
  (SELECT id FROM public.patients WHERE clinic_id = '298866c7-87b7-4405-9487-c7174bafaf99' LIMIT 1),
  (SELECT user_id FROM public.clinic_memberships
     WHERE clinic_id <> '298866c7-87b7-4405-9487-c7174bafaf99'
       AND role = 'DOCTOR' LIMIT 1),
  'READ'
);
```

### Mig 055..065 — Per-table policy rewrites (one migration each)

Order, lowest blast radius first (per code-path inventory):

| # | Table | Read sites | Risk |
|---|---|---|---|
| 055 | `vital_signs` | 3 | Low — patient-scoped, narrow |
| 056 | `imaging_orders` | 1 | Low — single handler |
| 057 | `lab_results` | 1 | Low — joined via `lab_orders` |
| 058 | `lab_orders` | 4 | Low — patient/doctor scoped |
| 059 | `check_in_queue` | 7 | Medium — admin client |
| 060 | `messages` | 4 | Medium — joined via `conversations` |
| 061 | `conversations` | 10 | Medium — many call sites |
| 062 | `payments` | 13 | Medium-high — public invoice route |
| 063 | `appointments` | 15 | High — first deal with NULLABLE clinic_id |
| 064 | `clinical_notes` | 28 | High — biggest blast radius |
| 065 | `patients` | 21 | Highest — most exercised, identity table |

**Critical rule for every per-table migration:**

Because the `DROP POLICY IF EXISTS` names in mig 021 don't match the live
DB, we **cannot** ship the SQL from mig 021 verbatim. Each migration must:

1. Read the live policy names (`SELECT policyname FROM pg_policies WHERE …`)
   _at the time of migration_, not from this file or from mig 021.
2. Drop the actual current SELECT policies by name.
3. Add the new `can_access_patient`-based SELECT policy.
4. Leave INSERT/UPDATE/DELETE/ALL policies alone (mig 021 didn't rewrite
   them, and they encode separate concerns).

Each migration ships with paired SQL test cases that simulate the
authenticated context for the 5 personas in the prompt:
- doctor in the clinic with a visibility grant → sees rows
- doctor NOT in the clinic → sees no rows
- patient → sees only their own rows
- OWNER in clinic → sees all rows in their clinic
- ASSISTANT/FRONT_DESK → sees only what the assignment scope allows

Test approach (Postgres can simulate auth via session config):

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"<user_id>"}';
SELECT COUNT(*) FROM public.<table>;  -- compare to expected
ROLLBACK;
```

### Mig 066 — `cleanup_legacy_policies.sql` (DEFERRED)

After mig 055–065 are stable in production for at least one usage cycle and
we've confirmed via Supabase logs that traffic is hitting the new policies,
*then* we drop any remaining legacy SELECT policies that the new policy
makes redundant. Doing this in mig 055–065 directly would be the
"destructive" version of mig 021 that the prompt warned about — keeping it
separate gives us a rollback window.

---

## 3. Architecture flags

Things I'd surface to Mo before kicking off code:

1. **`appointments.clinic_id` NULLABLE** — was this an intentional carve-out
   in mig 051, or was it missed? If it's an oversight, the `appointments`
   policy rewrite needs a backfill+NOT-NULL prequel. If it's intentional
   (e.g. patient-initiated bookings before clinic assignment), the new
   policy needs an explicit `clinic_id IS NULL` branch that mirrors the
   intent.
2. **Service-role usage is the real RLS gap.** The audit shows that the
   biggest read paths (`createAdminClient` in `data/clinical-notes.ts`,
   `data/patients.ts`, `data/appointments.ts`, etc.) bypass RLS entirely
   and rely on application-layer `clinic_id` filtering. Tightening RLS is
   defense-in-depth; the actual tenant-isolation correctness lives in app
   code today. Worth a separate triage item — but it's out of scope here.
3. ~~**Mig 021's INSERT policy for `clinical_notes`** is a widening~~ —
   **CORRECTION** (2026-04-25 after re-reading the actual WITH CHECK
   expressions):
   - Live INSERT: `WITH CHECK (doctor_id = auth.uid())` — only requires
     the inserter to be the doctor on the note.
   - Mig 021 INSERT: `WITH CHECK (doctor_id = auth.uid() AND (clinic_id IS NULL OR is_clinic_member(clinic_id, auth.uid())))`.
   - This is a **TIGHTENING**, not a widening: mig 021 adds the constraint
     that the doctor must be an active member of the clinic they're
     attaching the note to. The doctor still has to be `auth.uid()`.
   - No front-desk widening. Original plan was wrong.
4. **`patient_visibility` UNIQUE constraint** is missing — added in
   Mig 052. This is a divergence from mig 020 as written but a correctness
   improvement.
5. **Mig 020 enum count** — the source defines 4 enums, the prompt counts
   3. Plan reflects the source.

---

## 4. Out of scope (per the prompt)

- Re-applying mig 045–051 (already done).
- Touching `clinic_doctors` / `front_desk_staff` (separate triage).
- Patient-facing schema changes.
- Data changes to `clinical_notes`, `payments`, `appointments`.
- Refactoring service-role usage to go through RLS (separate triage).

---

## 5. Open questions — RESOLVED 2026-04-25

### Q1 — Additive vs destructive: per-table impact

Mo asked for a per-table comparison. After pulling the actual `polqual`
expressions and walking through them:

| Table | Old SELECT predicates | New SELECT predicate | Drop legacy in same migration? |
|---|---|---|---|
| `vital_signs` | `doctor_id = auth.uid() OR patient_id IN (appointments where doctor_id = auth.uid())` + `patient_id = auth.uid()` | `doctor_id = auth.uid() OR patient_id = auth.uid() OR can_access_patient(...)` | **Safe** — table has 0 rows; no risk of doctor losing access. |
| `imaging_orders` | `doctor_id = auth.uid()` (ALL) + `patient_id = auth.uid()` | superset (adds OWNER + can_access_patient) | **Safe** — clean superset. |
| `lab_results` | `doctor_id OR patient_id` (via lab_orders) | + clinic-scoped path | **Safe** — clean superset. |
| `lab_orders` | `doctor_id OR patient_id` | superset | **Safe** — clean superset. |
| `check_in_queue` | global frontdesk leak (`users.role='frontdesk'`) + clinic-scoped via doctor + doctor_id=auth.uid() | `doctor_id OR patient_id OR is_clinic_member(clinic_id)` | **Tightens** (closes cross-clinic leak). Recommend separate cleanup phase. |
| `messages` | via conversations | superset | **Safe** — clean superset. |
| `conversations` | doctor_id, patient_id | superset | **Safe** — clean superset. |
| `payments` | global frontdesk leak + clinic-scoped + doctor_id | `doctor_id OR patient_id OR is_clinic_member(clinic_id)` | **Tightens** (closes cross-clinic leak). Recommend separate cleanup phase. |
| `appointments` | global frontdesk leak (`Front desk can view all`) + clinic-scoped + `doctor_id IN doctors` (legacy table ref) | `doctor_id OR patient_id OR is_clinic_member(clinic_id)` | **Tightens** (closes leak; removes legacy `doctors` table dependency). Separate cleanup. |
| `clinical_notes` | `doctor_id = auth.uid()` + `patient_id = auth.uid() AND synced_to_patient` | superset (adds OWNER + can_access_patient) | **Safe** — clean superset. |
| `patients` | global frontdesk leak + `id = auth.uid()` | `id = auth.uid() OR can_access_patient(...)` | **Tightens** (closes leak). Separate cleanup — but doctors today have NO RLS read access to patients (only via service role), so the new policy is the first time doctors get RLS-level patient access. |

**Recommendation:** keep the additive-then-cleanup approach (mig 055–065
add only; mig 066 drops legacy). Rationale: even for the "clean superset"
tables, dropping legacy in the same migration removes our ability to tell
whether a missing read is caused by an under-seeded `patient_visibility`
or by a bug in `can_access_patient`. Mig 066 gives us a window (one
production cycle) where Supabase logs can show traffic shifting onto the
new policies before we cut the safety net.

The four "tightens" rows above (check_in_queue, payments, appointments,
patients) all have a real cross-clinic leak via `users.role = 'frontdesk'`
in their current SELECT policies. Cleanup in mig 066 closes that leak
permanently. (The `clinic_memberships` table is fully reconciled so no
legitimate frontdesk user loses access.)

### Q2 — `appointments.clinic_id` backfill: ✅ feasible

- Total rows: 17. With clinic_id: 14. NULL: 3.
- For all 3 NULL rows, the doctor IS an active member of the patient's
  clinic. Backfill is deterministic.

```sql
-- Mig 055-pre (or include in mig 053): backfill, then NOT NULL.
UPDATE public.appointments a
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE a.patient_id = p.id AND a.clinic_id IS NULL;

ALTER TABLE public.appointments ALTER COLUMN clinic_id SET NOT NULL;
```

After this, the appointments policy can use `is_clinic_member(clinic_id, auth.uid())`
without needing a `clinic_id IS NULL` fallback branch.

### Q3 — `clinical_notes` INSERT change: tightening (not widening)

(See §3 flag #3 above for the corrected analysis.)

In product terms, here's what actually changes:

| Scenario today | After mig 021 |
|---|---|
| Doctor writes a note to clinic A while signed in as themselves and they ARE a member of clinic A | ✅ allowed → ✅ allowed (no change) |
| Doctor writes a note tagged with clinic A while NOT being a member of clinic A | ✅ allowed at RLS (unscoped) → ❌ blocked at RLS |
| Doctor's clinic_membership was revoked but their auth user still exists | ✅ allowed → ❌ blocked at RLS |
| Front desk staff tries to insert a clinical note | ❌ already blocked (must have `doctor_id = auth.uid()`) → ❌ still blocked (same check survives) |
| Multi-clinic doctor (e.g. Naser) writes a note in either clinic | ✅ → ✅ (member of both) |

Net product impact: **none for legitimate users.** The tightening only
catches misuse / stale state. Recommend shipping as-is in mig 021's form.

### Q4 — Ordering, in product/UX terms

The order is ascending blast radius. If a policy bug breaks a table, the
table powers a feature, and the feature breaks for some users. Here's
what each table powers and what "broken" looks like:

1. **`vital_signs`** — BP/temperature/weight at check-in. Doctor sees
   them in the chart; patient sees own in their app. **Currently 0 rows
   in the live DB.** Lowest-stakes test bed.
2. **`imaging_orders`** — X-ray/MRI requests. Single read site. Broken =
   one tab in the doctor visit screen renders empty; doctor reissues.
3. **`lab_results` / `lab_orders`** — Blood tests. Patient sees results
   in the patient app; doctor sees in chart. Broken = lab section appears
   empty for hours; we hot-fix and the data is still there.
4. **`check_in_queue`** — Front desk waiting room board. Broken = front
   desk has to call patients in by name from memory. Visible to clinic
   staff but not to patients.
5. **`messages` / `conversations`** — Patient-doctor chat. Broken =
   patients can't message; some users notice within minutes. Medium blast.
6. **`payments`** — Invoices, doctor fees, public invoice URL.
   Broken = front desk can't process payments at the counter; public
   invoice page 404s. Hits revenue and visibility.
7. **`appointments`** — Calendar/scheduling. Broken = nobody can see
   today's schedule; everything else (queue, payments, notes) loses its
   pivot. **Severe.**
8. **`clinical_notes`** — SOAP notes / visit records — the clinical
   record itself. Broken = doctor can't write notes during a visit, can't
   read patient history. **Critical clinical workflow.**
9. **`patients`** — The identity table. Used in every JOIN of every
   feature. Broken = the app shows empty everywhere for everyone in every
   clinic at once. **Catastrophic.**

UX pacing: ship one migration per day or every 2–3 days. After each
deploy, watch Supabase logs for unexpected `RLS denied` patterns before
moving on. By the time we touch `patients`, we've validated the function
on 10 lower-stakes tables.

### Q5 — Test personas: confirmed

| Role | User ID | Clinic | Notes |
|---|---|---|---|
| **OWNER (multi-clinic)** | `619a7fdd-45a1-49b5-aed2-fbada918b232` (Naser) | OWNER of `298866c7…` (عيادة د. ناصر حسن); DOCTOR of `8d27729f…` (عيادة د. أحمد) | Tests both OWNER and DOCTOR personas in one user. |
| **DOCTOR (multi-clinic, non-Naser)** | `c982eabc-ed1d-409f-90e4-b135fcf945e6` | DOCTOR at `4b5a180f…` (عياده الدقي) and `b29f51b3…` (عياده شلبي) | Tests DOCTOR cross-clinic isolation (must NOT see clinic Naser's patients). |
| **DOCTOR (single-clinic)** | `4912312e-ecb2-4fb8-9aa4-7dccc10d40ad` | `8895d705…` (عيادة المعادي) | Already has 1 hand-created `patient_visibility` row — natural baseline. |
| **ASSISTANT** | `bf98c1a5-eba6-4f60-9af3-34e5237b2177` | `298866c7…` (Naser's clinic) | Tests assignment-scope-gated access; can pair with Naser as the granting OWNER. |
| **FRONT_DESK** | `efe080c7-0127-406e-860b-2c69ae5f808f` | `298866c7…` (Naser's clinic) | Tests front-desk persona under new clinic-scoped policies. |
| **PATIENT** | (TBD per table — pick one with `clinic_id = 298866c7…` to pair with the OWNER tests) | — | Tests `id = auth.uid()` self-access path. |

For the verification SQL in mig 054 and each per-table migration, these
six users cover the 5 personas in the prompt.

---

_Plan generated 2026-04-25 by Claude during the RLS rewrite picked up after
mig 045–051. No DB writes performed; this is a proposal. §5 resolved
2026-04-25 after Mo's first-round review._
