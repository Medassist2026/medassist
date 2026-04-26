# Investigation prompt — Mig 020 enums + Mig 021 RLS rewrite

> Drop this entire file into a fresh Claude conversation when you're ready to
> pick up the RLS work. It assumes zero context from prior conversations.

## What the goal is

Re-apply two migrations that effectively never landed on the live MedAssist DB:

- **Mig 020** — `assignments_visibility_audit.sql` — adds 3 enum types
  (`visibility_mode`, `consent_type`, `assignment_scope`), creates 3 tables
  (`assistant_doctor_assignments`, `patient_visibility`, `audit_events`),
  and seeds `patient_visibility` from `doctor_patient_relationships`.
- **Mig 021** — `centralized_access_control.sql` — creates 3 RLS functions
  (`can_access_patient`, `is_clinic_member`, `get_clinic_role`), adds
  `clinics.default_visibility` + `clinics.settings`, and **rewrites the RLS
  policies on 11 tables** (patients, clinical_notes, appointments,
  vital_signs, lab_orders, lab_results, imaging_orders, payments,
  check_in_queue, conversations, messages) to route through
  `can_access_patient()`.

Both migration files exist in `supabase/migrations/`. They were referenced
by Mo's clinic-architecture work but never applied to the live DB
(`mtmdotixlhwksyoordbl`, project name `medassist-egypt`).

## Current state on the live DB (audited 2026-04-24)

### What's already in place (don't re-create)

- Tables `audit_events`, `patient_visibility`, `assistant_doctor_assignments`
  exist — but with TEXT columns where mig 020 specifies enums.
- Every `clinic_id` column referenced by mig 021's policies is now `NOT
  NULL` (mig 045–051 rolled out the multi-tenant scoping invariant).
- `clinic_memberships` is fully populated and reconciled with the legacy
  `clinic_doctors` / `front_desk_staff` tables — every doctor/frontdesk
  user has the right membership row.

### What's missing

- 3 enum types: `visibility_mode`, `consent_type`, `assignment_scope`
- 5 columns currently TEXT that should be enum:
  - `assistant_doctor_assignments.scope` (target: `assignment_scope`)
  - `assistant_doctor_assignments.status` (target: `assignment_status`)
  - `patient_visibility.mode` (target: `visibility_mode`)
  - `patient_visibility.consent` (target: `consent_type`)
  - `patient_visibility.grantee_type` (target: TEXT with CHECK — already
    has CHECK in mig 020, verify)
- 3 RLS functions: `can_access_patient`, `is_clinic_member`,
  `get_clinic_role`
- `clinics.default_visibility` (`visibility_mode` enum) and
  `clinics.settings` (`jsonb`) columns
- The mig 020 INSERT that seeds `patient_visibility` from
  `doctor_patient_relationships`. **This was never run.** Today
  `patient_visibility` likely has 0 (or very few) rows. If you flip the
  policies in mig 021 *before* seeding visibility, doctors lose access
  to all their patients via the new path.
- The mig 021 RLS policy rewrite: 11 tables × ~3 policies each = ~30
  new policies that **drop and replace** ~40 existing
  doctor-scoped/patient-scoped policies.

## Why this is risky

Mig 021 is not additive — it **drops** existing policies and replaces
them with `can_access_patient()`-based ones. The replacement is correct
in spirit but every read path in the app needs to keep working under
the new rules. Concretely:

- `patients` SELECT today is gated by `id = auth.uid()` OR
  doctor-walk-in policies. After mig 021, it's gated by
  `can_access_patient(clinic_id, id, auth.uid(), 'READ')` PLUS a legacy
  DPR fallback for patients with no `clinic_id`. We just enforced
  `patients.clinic_id NOT NULL` in mig 051, so the legacy DPR fallback
  is now unreachable — but the function itself depends on
  `patient_visibility` being seeded.
- Any RLS-relying read path that depends on `doctor_patient_relationships`
  for access (rather than `patient_visibility`) will break silently if
  the visibility seeding is incomplete.

The earlier conversation that did mig 045–051 deliberately deferred this
work because of that risk. The prereqs are now in place: every
`clinic_id` is populated, so `can_access_patient` won't have null-clinic
edge cases. But the RLS rewrite still needs careful sequencing and
verification.

## Suggested phasing (not a final plan — investigate first)

1. **Investigate before coding.** Read mig 020 and mig 021 in full from
   `supabase/migrations/`. Confirm the enum names, function signatures,
   and policy bodies match what's described above. Don't trust this
   prompt over the source.
2. **Check the seed precondition.** Count rows in `patient_visibility`
   today. If empty, mig 020's INSERT (lines 141–164 of
   `020_assignments_visibility_audit.sql`) has never run. Run it as a
   standalone migration first (`mig 052_seed_patient_visibility.sql`)
   and verify every active DPR with non-null `clinic_id` produces a
   `patient_visibility` row.
3. **Add the enums + columns.** Convert TEXT → enum on the 5 columns.
   Verify existing values match the enum. Add `clinics.default_visibility`
   and `clinics.settings`. Call this `mig 053_enums_and_clinic_extras`.
4. **Add the functions.** Create `can_access_patient`, `is_clinic_member`,
   `get_clinic_role` as `SECURITY DEFINER STABLE`. Test each one by
   calling it directly with known inputs (e.g.
   `SELECT can_access_patient(<naser's clinic>, <a patient>, <naser>, 'READ')`).
   Call this `mig 054_access_control_functions`.
5. **Rewrite policies one table at a time.** Don't ship all 11 in one
   migration. Start with the lowest-risk table (probably `vital_signs`
   or `imaging_orders` — small data, narrow read paths). For each
   table:
   - Read every code path that queries the table (use `Grep` for
     `from('<table_name>')`)
   - Identify the auth role + clinic context expected at each call site
   - Apply the new policy
   - Manually exercise each call site under at least three users:
     (a) doctor in the clinic, (b) doctor NOT in the clinic, (c) patient
   - Confirm reads return the same results as before
6. **Save `patients` and `clinical_notes` for last.** They're the most
   exercised tables and the biggest blast radius. By that point you'll
   have battle-tested the function on the easier tables.

## Verification plan

For each policy migration, write SQL test cases that simulate the
authenticated context using `set local role authenticated; set local
"request.jwt.claims" to '{"sub":"<user_id>"}';` and verify that:

- A doctor in the clinic sees their patients' rows
- A doctor NOT in the clinic sees nothing
- A patient sees only their own rows
- An OWNER sees all rows in their clinic
- A FRONT_DESK / ASSISTANT sees only what their `assistant_doctor_assignments`
  scope allows

The test users can come from `clinic_memberships`. Naser
(`619a7fdd-45a1-49b5-aed2-fbada918b232`) is OWNER of clinic
`298866c7-87b7-4405-9487-c7174bafaf99` and DOCTOR at `8d27729f…` —
he's a good multi-clinic test subject.

## Architecture rules (from CLAUDE.md)

These apply throughout:

1. Read the actual migration files before generating new SQL — never
   guess what they contain.
2. State the root cause of any issue before proposing a fix.
3. Check whether the fix conflicts with existing patterns (global
   patient identity, RLS patterns, server/client boundaries).
4. After making changes: state what changed, list files that might need
   corresponding updates, suggest what to test.
5. Never silently deviate from the architecture — flag any divergence
   and explain.

## Don't repeat the mig 048 mistake

When the previous wave of clinic_id work was done, comments in the code
(e.g., `apps/clinic/app/api/doctor/stats/route.ts:65,93,114`) confidently
claimed `clinic_id` existed on tables based on what the migration files
said, when in fact the migrations had never run. Treat this prompt the
same way: trust live `pg_proc`, `information_schema`, and `pg_policies`
queries over what any source file claims. The first `apply_migration`
call should be preceded by a cluster of `execute_sql` audits.

## Useful starting queries

```sql
-- Are the functions in place?
SELECT proname FROM pg_proc
WHERE proname IN ('can_access_patient','is_clinic_member','get_clinic_role');

-- Are the enums in place?
SELECT typname FROM pg_type
WHERE typname IN ('visibility_mode','consent_type','assignment_scope');

-- What policies exist on the 11 tables today?
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'patients','clinical_notes','appointments','vital_signs','lab_orders',
    'lab_results','imaging_orders','payments','check_in_queue',
    'conversations','messages'
  )
ORDER BY tablename, policyname;

-- Is patient_visibility seeded?
SELECT COUNT(*) FROM public.patient_visibility;
SELECT COUNT(DISTINCT patient_id) FROM public.doctor_patient_relationships
WHERE status = 'active' AND clinic_id IS NOT NULL;
-- These two counts should be roughly equal after the mig 020 seed runs.
```

## Out of scope for this work

- Re-applying any of the clinic_id column rollouts (mig 045–051 already
  did that)
- Touching the legacy `clinic_doctors` / `front_desk_staff` tables (separate
  triage; data is reconciled, code still has dual-writes)
- Patient-facing schema changes — this is purely backend RLS work
- Any change to `clinical_notes`, `payments`, or `appointments` *data*
  (only RLS policies)

---

Last updated: 2026-04-24 by Mo + Claude during the multi-tenant
clinic_id rollout (migrations 045–051).
