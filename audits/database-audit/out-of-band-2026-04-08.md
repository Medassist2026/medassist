# Audit Session B — Out-of-band 2026-04-08 SQL fixes

**Captured:** 2026-05-03
**Source:** `supabase_migrations.schema_migrations.statements` for versions `20260408145102` and `20260408145129`
**Why these matter:** these two tracking rows have NO corresponding `.sql` file in the repo (per Session A). The SQL was applied via the migrations CLI but was never committed. Recovering it is required for Session C's reconciliation work.

Both were applied 2026-04-08 within 27 seconds of each other (14:51:02 UTC and 14:51:29 UTC). Both are RLS-hardening fixes — they look like a security pass that closed three unprotected tables and one incomplete `otp_codes` policy.

---

## 1. `20260408145102 enable_rls_on_unprotected_tables`

**Summary:** enables RLS on `check_in_queue`, `payments`, `front_desk_staff` and creates 8 new policies covering frontdesk + doctor access patterns.

**Verbatim SQL:**

```sql
-- ============================================================
-- SECURITY: Enable RLS on three previously unprotected tables
-- check_in_queue, payments, front_desk_staff
-- ============================================================

-- 1. check_in_queue
ALTER TABLE check_in_queue ENABLE ROW LEVEL SECURITY;

-- Frontdesk can read/write queue entries for their own clinic's doctors
CREATE POLICY "Frontdesk can manage queue for their clinic"
  ON check_in_queue
  FOR ALL
  USING (
    doctor_id IN (
      SELECT cm_d.user_id
      FROM clinic_memberships cm_fd
      JOIN clinic_memberships cm_d ON cm_d.clinic_id = cm_fd.clinic_id
      WHERE cm_fd.user_id = auth.uid()
        AND cm_fd.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    doctor_id IN (
      SELECT cm_d.user_id
      FROM clinic_memberships cm_fd
      JOIN clinic_memberships cm_d ON cm_d.clinic_id = cm_fd.clinic_id
      WHERE cm_fd.user_id = auth.uid()
        AND cm_fd.status = 'ACTIVE'
    )
  );

-- Doctors can read their own queue entries
CREATE POLICY "Doctors can read their own queue"
  ON check_in_queue
  FOR SELECT
  USING (doctor_id = auth.uid());

-- Doctors can update their own queue entries (e.g., mark in_progress, complete)
CREATE POLICY "Doctors can update their own queue"
  ON check_in_queue
  FOR UPDATE
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- 2. payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Frontdesk can read/write payments for their own clinic's doctors
CREATE POLICY "Frontdesk can manage payments for their clinic"
  ON payments
  FOR ALL
  USING (
    doctor_id IN (
      SELECT cm_d.user_id
      FROM clinic_memberships cm_fd
      JOIN clinic_memberships cm_d ON cm_d.clinic_id = cm_fd.clinic_id
      WHERE cm_fd.user_id = auth.uid()
        AND cm_fd.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    doctor_id IN (
      SELECT cm_d.user_id
      FROM clinic_memberships cm_fd
      JOIN clinic_memberships cm_d ON cm_d.clinic_id = cm_fd.clinic_id
      WHERE cm_fd.user_id = auth.uid()
        AND cm_fd.status = 'ACTIVE'
    )
  );

-- Doctors can view payments for their own sessions
CREATE POLICY "Doctors can view their own payments"
  ON payments
  FOR SELECT
  USING (doctor_id = auth.uid());

-- 3. front_desk_staff
ALTER TABLE front_desk_staff ENABLE ROW LEVEL SECURITY;

-- Staff can read their own record
CREATE POLICY "Front desk staff can read own record"
  ON front_desk_staff
  FOR SELECT
  USING (id = auth.uid());

-- Staff can update their own record
CREATE POLICY "Front desk staff can update own record"
  ON front_desk_staff
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Clinic owners/doctors can view frontdesk staff in their clinic
CREATE POLICY "Clinic members can view frontdesk staff in same clinic"
  ON front_desk_staff
  FOR SELECT
  USING (
    clinic_id IN (
      SELECT cm.clinic_id
      FROM clinic_memberships cm
      WHERE cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
    )
  );
```

**Effect on staging schema:**

* RLS enabled on 3 tables (all 3 are RLS-enabled on staging today, confirmed by Session A's `rls_state`).
* 8 policies created. All 8 names appear on staging (confirmed by Session A's policy list — these are part of the 136 EXTRA_ON_STAGING policies):
  * `check_in_queue::frontdesk can manage queue for their clinic`
  * `check_in_queue::doctors can read their own queue`
  * `check_in_queue::doctors can update their own queue`
  * `payments::frontdesk can manage payments for their clinic`
  * `payments::doctors can view their own payments`
  * `front_desk_staff::front desk staff can read own record`
  * `front_desk_staff::front desk staff can update own record`
  * `front_desk_staff::clinic members can view frontdesk staff in same clinic`

**Notes for Session C:**

* The status check uses bare `'ACTIVE'` (not `::membership_status`). At the time these were applied, `membership_status` enum may not yet have been the column type — that change appears in mig 050+. Postgres will have re-cast at policy compile time, so the staging policy bodies likely show `'ACTIVE'::membership_status`.
* The "Frontdesk can manage payments" policy IS the prior shape Mo's later policies likely replaced — Session C should check whether mig 094a or later overrides any of these 8 with `_v2` versions.

---

## 2. `20260408145129 fix_otp_codes_rls_phone_based_records`

**Summary:** drops the existing `Patients can view own otp` policy on `otp_codes` and replaces it with a phone-based one that covers all OTP record types (registration, password_reset, etc., not just patient-linked).

**Verbatim SQL:**

```sql
-- ============================================================
-- SECURITY: Fix otp_codes RLS to cover phone-based OTP records
-- The existing policy only covered patient_id-linked records.
-- Phone-based OTPs (purpose: password_reset, registration) had no policy.
-- Since all legitimate OTP access goes through the admin client (bypasses RLS),
-- we simply deny all direct reads by authenticated/anon users.
-- ============================================================

-- Drop the old incomplete policy
DROP POLICY IF EXISTS "Patients can view own otp" ON otp_codes;

-- New policy: users can only read OTPs linked to their own phone (via users table)
-- This covers the phone-based OTP schema used for auth flows
CREATE POLICY "Users can view own phone-based otp"
  ON otp_codes
  FOR SELECT
  USING (
    phone IN (
      SELECT u.phone FROM users u WHERE u.id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies for authenticated users —
-- all mutations go through the service role (admin client) exclusively.
```

**Effect on staging schema:**

* `Patients can view own otp` policy removed.
* `Users can view own phone-based otp` policy added (SELECT only, scoped by `users.phone`).

**Notes for Session C:**

* The introductory comment says "we simply deny all direct reads by authenticated/anon users" but the actual policy DOES allow direct reads if the phone matches `users.phone WHERE id = auth.uid()`. Comment and behavior diverge slightly. Likely the author iterated on the body during the apply but kept the original comment.
* The `otp_codes` table is heavily used by auth flows (`packages/shared/lib/data/phone-changes.ts` and the OTP create/verify handlers). Session C should keep this policy intact and merely backfill it into a forensic migration.

---

## Reconciliation guidance for Session C

1. **Backfill these two SQL bodies as a single forensic migration** (e.g., `100_backfill_2026_04_08_rls_fixes.sql`) with a clear header documenting the original tracking-row provenance.
2. **The 11 policies created by these two fixes are all in Session A's 136 EXTRA_ON_STAGING policy list.** Backfilling reduces that count by 11.
3. **Avoid re-applying.** Both blocks contain `CREATE POLICY` (not `IF NOT EXISTS`). To make the backfill idempotent, wrap each `CREATE POLICY` in a `DROP POLICY IF EXISTS` first, or use a repeating `DO $$ ... $$` block. The originals are not idempotent — they would have errored on a second apply.
4. **Watch for overlap with Phase F.** Phase F (Prompt 6) is rewriting policies on these same tables. The `_v2` policies that Phase F creates may overlap names — Session C should sequence the backfill BEFORE Phase F, then let Phase F's `DROP POLICY IF EXISTS` ahead of `CREATE POLICY ... _v2` handle the cleanup.

## Note on `otp_codes` policy and the app code

The OTP table has eight `.from('otp_codes')` callsites in the app code (per Task 1 inventory). Most go through `createAdminClient` (service_role, bypasses RLS), which is consistent with the comment in the second fix block. Worth a Session C scan to confirm no authenticated-role reads exist on `otp_codes` outside the path the policy permits.
