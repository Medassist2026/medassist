# Audit Session B — Structural Drift Spot-Check

**Captured:** 2026-05-03
**Method:** 15 random claims sampled from `migration-claims-vs-reality.md` MATCH category (5 columns, 5 policies, 5 functions; seed=20260503). Each compared at a structural level: column type/nullable/default; policy USING/WITH CHECK/cmd; function security_definer/return_type/arguments/body.

## Summary

| Category | Sample size | Structural MATCH | Structural DRIFT | Drift rate |
|---|---:|---:|---:|---:|
| Columns | 5 | 5 | 0 | 0% |
| Policies | 5 | 4 | 1 | 20% |
| Functions | 5 | 4 | 1 | 20% |
| **Total** | **15** | **13** | **2** | **13%** |

Two confirmed drift cases:

1. **Policy `invoice_requests::frontdesk_invoice_requests`** — file claims a `front_desk_staff`-table-based USING clause; staging has a `clinic_memberships`-table-based USING clause. Different lookup mechanism. Functionally similar (both gate to "frontdesk in this clinic") but the rewrite happened only on staging.
2. **Function `can_patient_access_global_patient`** — file claims `SECURITY INVOKER`; staging has `SECURITY DEFINER`. Security model differs.

The 13% drift rate is below the 20% threshold flagged in the task brief, so an expanded sample is not strictly required. But both findings are non-trivial — the policy drift represents a forgotten file edit, and the function drift represents a security-mode change. Session C should treat them as forensic-fix targets.

The other 5 policies and 5 functions had body differences that were purely cosmetic (whitespace, enum-cast representations) — all functionally MATCH.

---

## Column verifications (5/5 structural match)

### Column #1 — `clinics.settings` (mig 021)

* **File claim:** `ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'`
* **Staging:** `data_type=jsonb`, `is_nullable=YES`, `default='{}'::jsonb`
* **Verdict: STRUCTURAL MATCH** ✓

### Column #2 — `patients.full_name` (mig 004)

* **File claim:** `ADD COLUMN IF NOT EXISTS full_name TEXT` (nullable, no default)
* **Staging:** `data_type=text`, `is_nullable=YES`, `default=None`
* **Verdict: STRUCTURAL MATCH** ✓

### Column #3 — `messages.clinic_id` (mig 048)

* **File claim:** `ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL` (nullable per the ADD)
* **Staging:** `data_type=uuid`, `is_nullable=NO`, `default=None`
* **Note:** the NOT NULL was applied later in `mig 051_clinic_id_not_null_19_tables.sql:33` — `ALTER TABLE public.messages ALTER COLUMN clinic_id SET NOT NULL`. Both migrations are in the tracking table per Session A, so the additive sequence (048 → 051) gives the staging state.
* **Verdict: STRUCTURAL MATCH across migration tree** ✓

### Column #4 — `doctor_patient_relationships.patient_clinic_record_id` (mig 080)

* **File claim:** `ADD COLUMN IF NOT EXISTS patient_clinic_record_id UUID REFERENCES public.patient_clinic_records(id) ON DELETE RESTRICT` followed by `ALTER COLUMN ... SET NOT NULL` after backfill, in the same migration.
* **Staging:** `data_type=uuid`, `is_nullable=NO`, `default=None`
* **Verdict: STRUCTURAL MATCH** ✓

### Column #5 — `lab_results.patient_clinic_record_id` (mig 080)

* **File claim:** same `ADD COLUMN ... ON DELETE RESTRICT`. The migration body comment notes lab_results is a "special case" because it has no direct patient_id — the SET NOT NULL is intentionally NOT applied for this table.
* **Staging:** `data_type=uuid`, `is_nullable=YES`, `default=None`
* **Verdict: STRUCTURAL MATCH** (the nullable-staging matches the special-case file logic) ✓

---

## Policy verifications (4 match, 1 drift)

### Policy #1 — `invoice_requests::frontdesk_invoice_requests` (mig 040) — **DRIFT**

* **File claim (mig 040):**
  ```sql
  CREATE POLICY "frontdesk_invoice_requests" ON invoice_requests
    FOR ALL USING (
      clinic_id IN (
        SELECT clinic_id FROM front_desk_staff
        WHERE id = auth.uid()
      )
    );
  ```
* **Staging:**
  ```sql
  cmd: ALL
  qual: (clinic_id IN (
    SELECT clinic_memberships.clinic_id
    FROM clinic_memberships
    WHERE clinic_memberships.user_id = auth.uid()
      AND clinic_memberships.role = ANY (ARRAY['FRONT_DESK'::clinic_role, 'ASSISTANT'::clinic_role])
      AND clinic_memberships.status = 'ACTIVE'::membership_status
  ))
  ```
* **Drift:** the `front_desk_staff` table reference was replaced with a `clinic_memberships` join that filters on the `clinic_role` enum (`FRONT_DESK`, `ASSISTANT`) and `membership_status = 'ACTIVE'`. The replacement aligns with the membership refactor (mig 050+) but the policy file at `040_invoice_fields.sql` was never updated to reflect the rewrite.
* **Severity:** the rewrite is functionally MORE permissive (allows ASSISTANT role too) but ALSO MORE restrictive (status must be ACTIVE). The file's read of `front_desk_staff` would not work on staging today (because all rows in `front_desk_staff` were migrated to `clinic_memberships` per the `clinic_doctors`/`clinic_frontdesk` drop in mig 052).
* **Verdict: STRUCTURAL DRIFT.** Rewrite happened only on staging.
* **Recommendation:** Session C should backfill the rewrite into a forensic migration (or update mig 040 in place — bad form). Note: this same pattern likely affects every other policy in mig 040 / mig 042 that references `front_desk_staff`. Worth a targeted re-scan.

### Policy #2 — `audit_events::owners_view_audit_events` (mig 042) — match

* **File claim:**
  ```sql
  CREATE POLICY "owners_view_audit_events" ON public.audit_events
    FOR SELECT USING (
      clinic_id IN (
        SELECT clinic_id FROM public.clinic_memberships
        WHERE user_id = auth.uid() AND role = 'OWNER' AND status = 'ACTIVE'
      )
    );
  ```
* **Staging:**
  ```sql
  cmd: SELECT
  qual: (clinic_id IN ( SELECT clinic_memberships.clinic_id
    FROM clinic_memberships
   WHERE ((clinic_memberships.user_id = auth.uid())
     AND (clinic_memberships.role = 'OWNER'::clinic_role)
     AND (clinic_memberships.status = 'ACTIVE'::membership_status))))
  ```
* **Diff:** staging has explicit `::clinic_role` and `::membership_status` casts. These are auto-injected by Postgres at policy-recompile time when the underlying columns are enum types. Functionally identical.
* **Verdict: STRUCTURAL MATCH** (cosmetic enum-cast difference only) ✓

### Policy #3 — `privacy_code_sms_tokens::privacy_code_sms_tokens_no_insert` (mig 086) — match

* **File claim:** `FOR INSERT TO authenticated WITH CHECK (FALSE)`
* **Staging:** `cmd=INSERT, qual=None, with_check='false'`
* **Verdict: STRUCTURAL MATCH** ✓

### Policy #4 — `privacy_code_attempts::privacy_code_attempts_select_v2` (mig 094a) — match

* **File claim:**
  ```sql
  USING (
    public.can_patient_access_global_patient(global_patient_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.clinic_memberships cm
      WHERE cm.clinic_id = privacy_code_attempts.attempted_by_clinic_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'OWNER'
        AND cm.status = 'ACTIVE'
    )
  )
  ```
* **Staging:**
  ```sql
  qual: (can_patient_access_global_patient(global_patient_id, auth.uid())
    OR (EXISTS ( SELECT 1
       FROM clinic_memberships cm
      WHERE ((cm.clinic_id = privacy_code_attempts.attempted_by_clinic_id)
        AND (cm.user_id = auth.uid())
        AND (cm.role = 'OWNER'::clinic_role)
        AND (cm.status = 'ACTIVE'::membership_status)))))
  ```
* **Diff:** enum casts inserted by Postgres. Functionally identical.
* **Verdict: STRUCTURAL MATCH** ✓

### Policy #5 — `patient_medication_intake::patients_own_intake_insert` (mig 015) — match

* **File claim:** `FOR INSERT WITH CHECK (auth.uid() = patient_id)`
* **Staging:** `cmd=INSERT, qual=None, with_check=(auth.uid() = patient_id)`
* **Verdict: STRUCTURAL MATCH** ✓

---

## Function verifications (4 match, 1 drift)

### Function #1 — `_generate_sms_code_plaintext` (mig 087) — match

* **File claim:** `LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions, pg_temp`, returns `TEXT`, no args
* **Staging:** `security_definer=True, return_type=text, arguments='', volatility=v`
* **Body diff:** body matches verbatim (random byte → 4-digit code).
* **Verdict: STRUCTURAL MATCH** ✓

### Function #2 — `generate_prescription_number` (mig 007) — match

* **File claim:** `RETURNS TEXT` (no SECURITY clause = INVOKER default)
* **Staging:** `security_definer=False, return_type=text, arguments='', volatility=v`
* **Verdict: STRUCTURAL MATCH** ✓ (INVOKER inferred by absence of clause; both file and staging are INVOKER)

### Function #3 — `extend_data_share` (mig 090) — match

* **File claim:** `LANGUAGE plpgsql VOLATILE SECURITY DEFINER`, returns `JSONB`, args: `p_share_id UUID, p_duration TEXT, p_actor_user_id UUID`
* **Staging:** `security_definer=True, return_type=jsonb, arguments='p_share_id uuid, p_duration text, p_actor_user_id uuid', volatility=v`
* **Verdict: STRUCTURAL MATCH** ✓

### Function #4 — `can_patient_access_global_patient` (mig 092) — **DRIFT**

* **File claim (mig 092):**
  ```sql
  CREATE OR REPLACE FUNCTION public.can_patient_access_global_patient(
    p_global_patient_id UUID,
    p_user_id UUID
  ) RETURNS BOOLEAN
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  PARALLEL SAFE
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.global_patients
      WHERE id = p_global_patient_id
        AND claimed_user_id = p_user_id
    );
  $$;
  ```
* **Staging:** `security_definer=True`, return_type=boolean, args match, volatility=s, body matches semantically.
* **Drift:** **`SECURITY INVOKER` (file) → `SECURITY DEFINER` (staging).** This is a security-mode change.
* **Cross-reference with Mo's project memory:** "Prompt 6 architecture rulings — hybrid 3 INVOKER + 1 DEFINER helper." If `can_patient_access_global_patient` is intended to be the 1 DEFINER helper, staging is correct and mig 092 file is stale. If it's intended to be 1 of the 3 INVOKER helpers, staging is incorrect and a hot-patch made it DEFINER. Mig 094a's comment "clinic_memberships SELECT policy uses is_clinic_member which is DEFINER, breaking any cycle" suggests the DEFINER helpers may include this function for the same recursion-breaking reason.
* **Severity:** moderate. DEFINER functions run with the function-owner's privileges (typically `postgres`/superuser), which bypasses RLS. Used carefully (with `SET search_path` and a hardened body), this is intentional. Without those guards, it's an escalation surface. The staging body looks safe — no dynamic SQL, no user-input concatenation — but the security model does differ from what the file declares.
* **Verdict: STRUCTURAL DRIFT (security mode).** Mo should confirm whether INVOKER (file) or DEFINER (staging) is intended.

### Function #5 — `initiate_sms_share` (mig 087) — match

* **File claim:** `LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions, pg_temp`, returns `JSONB`, args: `p_phone TEXT, p_requesting_clinic_id UUID, p_requesting_doctor_id UUID, p_request_id UUID DEFAULT NULL`
* **Staging:** `security_definer=True, return_type=jsonb, arguments='p_phone text, p_requesting_clinic_id uuid, p_requesting_doctor_id uuid, p_request_id uuid DEFAULT NULL::uuid', volatility=v`
* **Body diff:** identical opening — DECLARE block matches.
* **Verdict: STRUCTURAL MATCH** ✓

---

## Recommendations for Session C

1. **Drift rate is below the 20% expansion threshold,** so the bounded-drift assumption from Session A still holds. No need to expand the sample.
2. **Two specific findings need forensic-fix entries:**
   - Backfill the `invoice_requests::frontdesk_invoice_requests` rewrite (and likely sister policies in mig 040 / 042 that referenced `front_desk_staff`) into a new migration.
   - Reconcile `can_patient_access_global_patient`'s security mode — either patch staging back to INVOKER (matches file, but breaks the RLS cycle-break that 094a comments rely on), or update mig 092 to declare DEFINER (matches staging). Mo's call.
3. **All 5 column claims, all enum-cast policy diffs, and 4 of 5 function claims are clean.** Name-level Session A results plus this 13% drift sample suggest Session C's reconciliation work is bounded — bulk of the schema is internally consistent.
4. **Pattern to watch in Session C:** `front_desk_staff` references in pre-mig-052 policies. mig 052 dropped the `clinic_doctors`/`clinic_frontdesk` legacy join tables, but `front_desk_staff` itself was retained. Older policies that read `front_desk_staff` may have been quietly rewritten to `clinic_memberships` on staging (as seen in finding #1) without their files being updated. A targeted scan would surface them.
