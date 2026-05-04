# Pre-Apply Scan: Migs 100, 101, 102 — Body & Column Verification

**Author:** Audit Session C continuation (post-mig-100-failure session)
**Date:** 2026-05-03
**Scope:** Per Mo's "Moderate" directive — verify only the tables migs 100, 101, 102 reference. Triggered by mig 100 application failure (`column "clinic_id" does not exist` on `front_desk_staff`).
**Read-only.** No DDL applied. No file edits in this session — this scan informs Mo's edit decisions for Step 2 of the recovery sequence.
**Time-boxed:** 45 min budget, completed in ~30 min.

---

## Executive Summary

| Mig | Status | Findings |
|---|---|---|
| 100 | **NEEDS EDIT** | 1 BODY-DRIFT, 1 COLUMN-MISSING (both on the same `front_desk_staff` policy). Everything else verified MATCH. |
| 101 | **CLEAN — APPLIES AS-IS** | 4 of 5 policies present with byte-matching bodies; 1 net-new policy (intentional, per Session B finding); 5 tables exist; all 9 FKs already exist (IF NOT EXISTS guards correctly skip); all 15 indexes already exist. |
| 102 | **CLEAN — APPLIES AS-IS** | All 6 functions present with body-matching definitions (modulo two cosmetic `public.`-prefix omissions); all 3 triggers present and matching; all ON CONFLICT UNIQUE constraints exist; all referenced columns present. |

**Net: only mig 100 needs editing. Migs 101 and 102 should apply cleanly without further changes.**

---

## Mig 100 — `100_forensic_backfill_2026_04_08_rls.sql`

### Table: `check_in_queue`

Live columns (16): `id`, `patient_id`, `doctor_id`, `appointment_id`, `queue_number`, `queue_type`, `status`, `checked_in_at`, `called_at`, `completed_at`, `created_at`, `apt_window_status`, `swapped_appointment_id`, `swapped_patient_name`, `estimated_slot_time`, `priority`, `clinic_id`. **Note:** `clinic_id` IS PRESENT on `check_in_queue` (relevant: mig 100 doesn't reference it on this table, but other live policies do — `Clinic-scoped queue access`, `check_in_queue_select_v2`).

Mig 100 column references on `check_in_queue`: `doctor_id` ✓.

Policies (3 mig 100 policies vs live state):

| Policy name | File body | Live body | Verdict |
|---|---|---|---|
| `Frontdesk can manage queue for their clinic` | `doctor_id IN (SELECT cm_d.user_id FROM clinic_memberships cm_fd JOIN clinic_memberships cm_d ON cm_d.clinic_id = cm_fd.clinic_id WHERE cm_fd.user_id = auth.uid() AND cm_fd.status = 'ACTIVE')` (USING + WITH CHECK) | identical (modulo whitespace and `public.` prefix) | **MATCH** |
| `Doctors can read their own queue` | `(doctor_id = auth.uid())` (USING) | `(doctor_id = auth.uid())` | **MATCH** |
| `Doctors can update their own queue` | `(doctor_id = auth.uid())` (USING + WITH CHECK) | `(doctor_id = auth.uid())` | **MATCH** |

ALTER TABLE ENABLE ROW LEVEL SECURITY: live `relrowsecurity = true` ✓. No-op on apply.

### Table: `payments`

Live columns (15): `id`, `patient_id`, `doctor_id`, `appointment_id`, `clinical_note_id`, `amount`, `payment_method`, `payment_status`, `notes`, `collected_by`, `created_at`, `insurance_company`, `insurance_policy_number`, `clinic_id`, `client_idempotency_key`. **Note:** `clinic_id` IS PRESENT on `payments`.

Mig 100 column references on `payments`: `doctor_id` ✓.

Policies (2 mig 100 policies vs live):

| Policy name | File body | Live body | Verdict |
|---|---|---|---|
| `Frontdesk can manage payments for their clinic` | doctor_id-IN-clinic_memberships JOIN | identical (modulo whitespace, `public.` prefix, and enum cast `'ACTIVE'::membership_status`) | **MATCH** |
| `Doctors can view their own payments` | `(doctor_id = auth.uid())` | `(doctor_id = auth.uid())` | **MATCH** |

ALTER TABLE ENABLE ROW LEVEL SECURITY: live `relrowsecurity = true` ✓.

### Table: `front_desk_staff` ⚠️

Live columns (4): `id`, `unique_id`, `full_name`, `created_at`. **`clinic_id` IS NOT PRESENT.**

Mig 100 column references on `front_desk_staff`: `id` ✓, **`clinic_id` ✗ MISSING**.

Policies (3 mig 100 policies vs live):

| Policy name | File body | Live body | Verdict |
|---|---|---|---|
| `Front desk staff can read own record` | `(id = auth.uid())` | `(id = auth.uid())` | **MATCH** |
| `Front desk staff can update own record` | `(id = auth.uid())` (USING + WITH CHECK) | `(id = auth.uid())` | **MATCH** |
| `Clinic members can view frontdesk staff in same clinic` | `clinic_id IN (SELECT cm.clinic_id FROM public.clinic_memberships cm WHERE cm.user_id = auth.uid() AND cm.status = 'ACTIVE')` | `(id IN (SELECT cm_target.user_id FROM clinic_memberships cm_target WHERE cm_target.role = ANY (ARRAY['FRONT_DESK'::clinic_role, 'ASSISTANT'::clinic_role]) AND cm_target.status = 'ACTIVE'::membership_status AND cm_target.clinic_id IN (SELECT clinic_memberships.clinic_id FROM clinic_memberships WHERE clinic_memberships.user_id = auth.uid() AND clinic_memberships.status = 'ACTIVE'::membership_status)))` | **BODY-DRIFT + COLUMN-MISSING** |

The third policy on staging:
- **Does NOT reference `front_desk_staff.clinic_id`** at all.
- Joins via `clinic_memberships.user_id` to find rows whose `id` (= front_desk_staff.id, expected to equal a staff member's auth.uid) is the user_id of an ACTIVE `FRONT_DESK` or `ASSISTANT` membership in any clinic the auth user is a member of.
- Is a **structural rewrite** — replacing the now-impossible `clinic_id`-direct lookup with a `clinic_memberships`-mediated lookup.

This is the same systematic-rewrite pattern Session B's structural-drift spot-check flagged for `invoice_requests::frontdesk_invoice_requests`. The pattern is now confirmed for `front_desk_staff` itself.

ALTER TABLE ENABLE ROW LEVEL SECURITY: live `relrowsecurity = true` ✓.

### Table: `otp_codes`

Live columns (13): include `phone` ✓, `id`, `code_hash`, `purpose`, `patient_id`, `attempts`, `max_attempts`, `used`, `used_at`, `created_at`, `expires_at`, `otp_hash`, `consumed_at`.

Mig 100 column references on `otp_codes`: `phone` ✓. Subquery references `users.id` ✓ and `users.phone` ✓.

Policy:

| Policy name | File body | Live body | Verdict |
|---|---|---|---|
| `Users can view own phone-based otp` | `(phone IN (SELECT u.phone FROM public.users u WHERE u.id = auth.uid()))` | `(phone IN (SELECT u.phone FROM users u WHERE (u.id = auth.uid())))` | **MATCH** (modulo `public.` prefix) |

`DROP POLICY IF EXISTS "Patients can view own otp"` runs first — the older policy this fix replaces. Verified absent on staging (not in the policies query result), so the DROP is a no-op.

### Mig 100 verdict

**1 finding requires file edit before re-apply:**

- The third `front_desk_staff` policy (`Clinic members can view frontdesk staff in same clinic`) needs its USING body replaced with the live structurally-rewritten variant (the `id IN ... clinic_memberships JOIN` form). After the edit, mig 100 will apply cleanly as a no-op against staging (DROP POLICY IF EXISTS + CREATE POLICY with the matching body).

**Smoke probe assertion:** the smoke probe checks policy NAMES only (not bodies). The renamed policy will pass the existence assertion regardless of body shape, so the smoke probe is unchanged after the edit.

---

## Mig 101 — `101_forensic_backfill_unclaimed_tables.sql`

### Table: `account_recovery_requests`

Live columns (13): exact match against mig 101 file CREATE TABLE declaration (id, claimed_phone, claimed_patient_id, new_phone, status, verification_method, verification_data, reviewed_by, reviewed_at, review_notes, created_at, expires_at, completed_at). All NOT NULL / nullable flags match. CREATE TABLE IF NOT EXISTS will be no-op.

FKs (2 expected per mig 101): both present.

| FK | Live | File | Verdict |
|---|---|---|---|
| `account_recovery_requests_claimed_patient_id_fkey` | `FOREIGN KEY (claimed_patient_id) REFERENCES patients(id)` | identical (no ON DELETE) | **EXISTS — IF NOT EXISTS guard skips** |
| `account_recovery_requests_reviewed_by_fkey` | `FOREIGN KEY (reviewed_by) REFERENCES users(id)` | identical | **EXISTS — IF NOT EXISTS guard skips** |

Indexes (2 expected): `idx_recovery_requests_phone` ✓, `idx_recovery_requests_status` ✓. Both present, CREATE INDEX IF NOT EXISTS no-op.

ALTER TABLE ENABLE ROW LEVEL SECURITY: live `relrowsecurity = true` (per Session B finding). No-op.

Policy:

| Policy name | Verdict |
|---|---|
| `service_role_account_recovery` | **NEW** — does not exist on staging (per Session B finding: "0 policies"). DROP POLICY IF EXISTS no-op + CREATE POLICY succeeds. **This is intentional.** |

### Table: `audit_log`

Live columns (9): exact match against mig 101 (id, user_id, user_role, action, resource_type, resource_id, details, ip_address, created_at). CREATE TABLE IF NOT EXISTS no-op.

Indexes (4 expected): all present (`idx_audit_log_action`, `idx_audit_log_created`, `idx_audit_log_resource`, `idx_audit_log_user`). All no-op.

ALTER TABLE ENABLE ROW LEVEL SECURITY: ✓.

Policy:

| Policy name | File body | Live body | Verdict |
|---|---|---|---|
| `service_role_audit_log` | `(auth.role() = 'service_role'::text)` | `(auth.role() = 'service_role'::text)` | **MATCH** |

### Table: `phone_corrections`

Live columns (12): exact match against mig 101 (id, patient_id, old_phone, new_phone, reason, verification_method, initiated_by, initiated_by_user_id, status, otp_hash, created_at, completed_at). CREATE TABLE IF NOT EXISTS no-op.

FKs (2 expected): both present.

| FK | Live | Verdict |
|---|---|---|
| `phone_corrections_initiated_by_user_id_fkey` | `FOREIGN KEY (initiated_by_user_id) REFERENCES users(id)` | **EXISTS — IF NOT EXISTS guard skips** |
| `phone_corrections_patient_id_fkey` | `FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE` | **EXISTS — IF NOT EXISTS guard skips** |

Indexes (2 expected): both present (`idx_corrections_patient`, `idx_corrections_pending`). No-op.

Policy:

| Policy name | File body | Live body | Verdict |
|---|---|---|---|
| `Staff can manage phone corrections` | `EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = ANY (ARRAY['doctor'::text, 'frontdesk'::text]))` | `(EXISTS (SELECT 1 FROM users WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['doctor'::text, 'frontdesk'::text])))))` | **MATCH** (modulo `public.` prefix and parens) |

### Table: `sms_reminders`

Live columns (14): exact match. CREATE TABLE IF NOT EXISTS no-op.

FKs (3 expected): all present.

| FK | Live | Verdict |
|---|---|---|
| `sms_reminders_appointment_id_fkey` | `FOREIGN KEY (appointment_id) REFERENCES appointments(id)` | **EXISTS — guard skips** |
| `sms_reminders_clinic_id_fkey` | `FOREIGN KEY (clinic_id) REFERENCES clinics(id)` | **EXISTS — guard skips** |
| `sms_reminders_patient_id_fkey` | `FOREIGN KEY (patient_id) REFERENCES patients(id)` | **EXISTS — guard skips** |

Indexes (5 expected): all present. No-op.

Policy:

| Policy name | File body | Live body | Verdict |
|---|---|---|---|
| `service_role_sms` | `(auth.role() = 'service_role'::text)` | `(auth.role() = 'service_role'::text)` | **MATCH** |

### Table: `patient_phone_verification_issues`

Live columns (12): exact match. CREATE TABLE IF NOT EXISTS no-op.

FKs (2 expected): both present.

| FK | Live | Verdict |
|---|---|---|
| `patient_phone_verification_issues_patient_id_fkey` | `FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE` | **EXISTS** |
| `patient_phone_verification_issues_resolved_by_fkey` | `FOREIGN KEY (resolved_by) REFERENCES users(id)` | **EXISTS** |

Indexes (2 expected): both present. No-op.

Policy:

| Policy name | File body | Live body | Verdict |
|---|---|---|---|
| `Staff can view phone verification issues` | `EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = ANY (ARRAY['doctor'::text, 'frontdesk'::text]))` | identical structure | **MATCH** |

### Mig 101 verdict

**0 findings.** Mig 101 will apply cleanly as a true no-op for the 4 existing policies + indexes + FKs, plus a single net-new `service_role_account_recovery` policy creation (intentional, per Session B finding). All 5 tables already exist; CREATE TABLE IF NOT EXISTS skips. All 15 indexes already exist; CREATE INDEX IF NOT EXISTS skips. All 9 FKs already exist; the DO $$ IF NOT EXISTS guards skip.

Smoke probe will PASS:
- 5 tables present ✓
- 5 indexes-of-record present ✓
- 5 policies present (4 already, 1 newly created by mig) ✓

**No file edit needed.**

---

## Mig 102 — `102_forensic_backfill_helper_functions.sql`

### Helper functions (6)

| Function | Present? | Body match? | Notes |
|---|---|---|---|
| `cleanup_expired_verification_data()` | YES | MATCH (modulo whitespace) | Live + file both reference `public.otp_codes`, `public.phone_change_requests`, `public.account_recovery_requests`. |
| `update_patient_activity()` | YES | MATCH (modulo whitespace) | Live + file both reference `public.patients`. |
| `create_conversation_after_appointment()` | YES | MATCH except live omits `public.` prefix on `INSERT INTO conversations` | Cosmetic difference. After CREATE OR REPLACE, body becomes `public.conversations` (matches mig 102 file). Behavioral no-op (search_path includes public). |
| `create_sharing_preferences_after_appointment()` | YES | MATCH except live omits `public.` prefix on `default_sharing_preferences` SELECT and `record_sharing_preferences` INSERT | Same as above — cosmetic. |
| `is_account_dormant(timestamp with time zone)` | YES | MATCH exactly | IMMUTABLE flag matches. |
| `mark_dormant_accounts()` | YES | MATCH (modulo whitespace) | Live + file both reference `public.patients`. |

After CREATE OR REPLACE applies, all 6 function bodies will be byte-equivalent to the mig 102 file. The two `public.`-prefix re-additions in `create_conversation_after_appointment` and `create_sharing_preferences_after_appointment` are pure formatting changes — search_path resolves the same target either way.

### Trigger bindings (3)

| Trigger | Table | Timing | Live function | File function | Verdict |
|---|---|---|---|---|---|
| `update_patient_activity_on_appointment` | `appointments` | AFTER INSERT | `update_patient_activity()` | `update_patient_activity()` | **MATCH** |
| `update_patient_activity_on_note` | `clinical_notes` | AFTER INSERT | `update_patient_activity()` | `update_patient_activity()` | **MATCH** |
| `update_patient_records_updated_at` | `patient_medical_records` | BEFORE UPDATE | `update_updated_at_column()` | `update_updated_at_column()` | **MATCH** |

DROP TRIGGER IF EXISTS + CREATE TRIGGER will recreate identical triggers. No-op behaviorally.

### Function dependencies

`update_updated_at_column()` (referenced by trigger #3, declared in earlier migration): **EXISTS** ✓ on staging.

### Column verification

All columns referenced by mig 102 function bodies are present:

| Table | Columns referenced | All present? |
|---|---|---|
| `otp_codes` | `expires_at` | ✓ |
| `phone_change_requests` | `expires_at`, `status` | ✓ |
| `account_recovery_requests` | `expires_at`, `status` | ✓ |
| `patients` | `id`, `last_activity_at`, `account_status`, `registered` | ✓ |
| `conversations` | `patient_id`, `doctor_id`, `created_from_appointment_id` | ✓ |
| `default_sharing_preferences` | `patient_id`, `share_medications`, `share_conditions`, `share_allergies`, `share_lab_results`, `share_visit_history`, `share_diary`, `share_vitals` | ✓ |
| `record_sharing_preferences` | `patient_id`, `doctor_id`, all 7 share_* columns | ✓ |
| `appointments` | `id`, `doctor_id`, `patient_id` (via NEW.* in trigger functions) | ✓ |
| `clinical_notes` | `patient_id` (via NEW.* in trigger function) | ✓ |
| `patient_medical_records` | (table exists for trigger binding) | ✓ |

### ON CONFLICT UNIQUE constraint verification

Mig 102's two ON CONFLICT clauses depend on UNIQUE constraints on `(patient_id, doctor_id)`:

| Constraint | Live | Verdict |
|---|---|---|
| `conversations_patient_id_doctor_id_key` | `UNIQUE (patient_id, doctor_id)` | **EXISTS** ✓ |
| `record_sharing_preferences_patient_id_doctor_id_key` | `UNIQUE (patient_id, doctor_id)` | **EXISTS** ✓ |

Both ON CONFLICT clauses will resolve correctly.

### Mig 102 verdict

**0 findings.** Mig 102 will apply cleanly as a no-op for all functions (CREATE OR REPLACE produces identical-modulo-whitespace bodies) and triggers (DROP + CREATE produces identical bindings). Smoke probe asserts function presence + trigger presence; all 9 expected items already exist.

**No file edit needed.**

---

## Summary

### Counts

- **Total verdicts: 18 MATCH, 1 BODY-DRIFT, 1 COLUMN-MISSING, 1 NEW (intentional).**
- **Migrations affected: only mig 100.**

### Recommended file edits before re-apply

**Mig 100 — single edit:** Replace the `front_desk_staff` "Clinic members can view frontdesk staff in same clinic" policy USING body with the live structurally-rewritten variant. Specifically, replace lines 128-139 of `100_forensic_backfill_2026_04_08_rls.sql`:

```sql
DROP POLICY IF EXISTS "Clinic members can view frontdesk staff in same clinic" ON public.front_desk_staff;
CREATE POLICY "Clinic members can view frontdesk staff in same clinic"
  ON public.front_desk_staff
  FOR SELECT
  USING (
    clinic_id IN (
      SELECT cm.clinic_id
      FROM public.clinic_memberships cm
      WHERE cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
    )
  );
```

…with the live form:

```sql
DROP POLICY IF EXISTS "Clinic members can view frontdesk staff in same clinic" ON public.front_desk_staff;
CREATE POLICY "Clinic members can view frontdesk staff in same clinic"
  ON public.front_desk_staff
  FOR SELECT
  USING (
    id IN (
      SELECT cm_target.user_id
      FROM public.clinic_memberships cm_target
      WHERE cm_target.role = ANY (ARRAY['FRONT_DESK'::clinic_role, 'ASSISTANT'::clinic_role])
        AND cm_target.status = 'ACTIVE'::membership_status
        AND cm_target.clinic_id IN (
          SELECT clinic_memberships.clinic_id
          FROM public.clinic_memberships
          WHERE clinic_memberships.user_id = auth.uid()
            AND clinic_memberships.status = 'ACTIVE'::membership_status
        )
    )
  );
```

Plus header annotation per Mo's Step 2 directive ("VERIFIED 2026-05-03 PART 3" subsection citing `front_desk_staff.clinic_id` drop + structural rewrite as out-of-band changes between 2026-04-08 and 2026-05-03; reference this scan doc).

The `100_forensic_backfill_2026_04_08_rls.rollback.sql` file should also be reviewed — if it contains the original `clinic_id IN ...` policy form, the rollback would re-introduce a broken DROP POLICY (which would still succeed since DROP IF EXISTS is forgiving). Since rollback isn't currently planned, this can be left as a known-divergent doc artifact OR updated for symmetry — Mo's call.

**Migs 101 and 102: no edits needed.** Both apply as planned.

### Out-of-band findings to capture

This scan surfaced **one new untracked schema change** that Sessions A/B/C didn't enumerate:

- **`front_desk_staff.clinic_id` was dropped** between 2026-04-08 (when the original RLS hardening SQL referenced it) and 2026-05-03 (today's scan). Method: presumably dashboard SQL editor (consistent with the other untracked changes Session A enumerated). Effect: dependent policy `Clinic members can view frontdesk staff in same clinic` was simultaneously rewritten to a `clinic_memberships`-mediated form that doesn't reference the now-missing column.
- This finding should be captured in `audits/database-audit/out-of-band-post-2026-04-08.md` per Mo's Step 4 directive.
- Empirical Lesson #9 candidate: backfilling untracked SQL applies requires temporal verification — the schema state at backfill time may differ from the schema state at original apply time.

### Scope-bounding

This scan is **moderate-scope** (per Mo): only the tables migs 100-102 touch. Adjacent untracked changes are not enumerated:

- The `invoice_requests::frontdesk_invoice_requests` rewrite Session B flagged remains a Phase F follow-up task (PROGRAM_STATE.md task #5).
- Other tables that may have similar drift (e.g., other `front_desk_staff`-referencing policies elsewhere in the codebase) are not scanned here.
- Recommended: when Phase F task #5 runs, broaden the search to all policies that reference `front_desk_staff.clinic_id` or other dropped columns from the `front_desk_staff` schema evolution.

---

## Verification queries reproducible

For audit reproducibility, the queries used in this scan:

```sql
-- Q1: Mig 100 + 101 column verification
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN ('check_in_queue', 'payments', 'front_desk_staff', 'otp_codes',
  'account_recovery_requests', 'audit_log', 'phone_corrections',
  'sms_reminders', 'patient_phone_verification_issues',
  'users', 'clinic_memberships')
ORDER BY table_name, ordinal_position;

-- Q2: Mig 102 column verification
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN ('appointments', 'clinical_notes', 'patient_medical_records',
  'patients', 'conversations', 'default_sharing_preferences',
  'record_sharing_preferences', 'phone_change_requests')
ORDER BY table_name, ordinal_position;

-- Q3: Mig 100 + 101 policies on target tables
SELECT tablename, policyname, cmd, qual::text, with_check::text
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('otp_codes', 'account_recovery_requests', 'audit_log',
    'phone_corrections', 'sms_reminders', 'patient_phone_verification_issues',
    'check_in_queue', 'payments', 'front_desk_staff')
ORDER BY tablename, policyname;

-- Q4: Mig 102 helper function bodies
SELECT p.proname, p.prosecdef, pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('cleanup_expired_verification_data', 'update_patient_activity',
    'create_conversation_after_appointment', 'create_sharing_preferences_after_appointment',
    'is_account_dormant', 'mark_dormant_accounts');

-- Q5: Mig 102 trigger bindings
SELECT trigger_name, event_object_table, action_timing, event_manipulation, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN ('update_patient_activity_on_appointment',
    'update_patient_activity_on_note', 'update_patient_records_updated_at');

-- Q6: Mig 101 FKs (all 9 expected)
SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('public.account_recovery_requests'::regclass,
    'public.phone_corrections'::regclass, 'public.sms_reminders'::regclass,
    'public.patient_phone_verification_issues'::regclass)
  AND contype = 'f';

-- Q7: Mig 102 ON CONFLICT UNIQUE constraints
SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('public.conversations'::regclass,
    'public.record_sharing_preferences'::regclass)
  AND contype IN ('u', 'p');

-- Q8: Mig 101 indexes (15 expected)
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('idx_recovery_requests_phone', 'idx_recovery_requests_status',
    'idx_audit_log_action', 'idx_audit_log_created', 'idx_audit_log_resource',
    'idx_audit_log_user', 'idx_corrections_patient', 'idx_corrections_pending',
    'idx_sms_reminders_appointment', 'idx_sms_reminders_patient',
    'idx_sms_reminders_scheduled', 'idx_sms_reminders_status', 'idx_sms_reminders_type',
    'idx_phone_issues_patient', 'idx_phone_issues_unresolved');
```

All run read-only against project `mtmdotixlhwksyoordbl` (medassist-egypt staging) on 2026-05-03.
