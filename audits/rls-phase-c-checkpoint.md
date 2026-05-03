# Phase C checkpoint — FK shape resolution + mig 094–097 design preview

**Status:** Mig 093 shipped to staging. Mig 094–097 designed but not yet written. **This is the doc Mo asked for in the session 2 close-out: review policy shape before Phase D matrix burns time.**
**Date:** 2026-04-30 (cowork session 3)

---

## 1. FK shape resolution (the long-running ambiguity)

Mo's Prompt 6 § C3 explicitly flagged this: "the join shape depends on whether `clinical_notes.patient_id` is a global_patient_id, a patients.id (legacy), or a patient_clinic_records.id." Resolved against staging.

**Every clinical-data table that exists post-Build-03 has THREE patient FKs simultaneously**, courtesy of the mig 081 compat shim triggers:

| Table | `patient_id` → `patients.id` | `patient_clinic_record_id` → `patient_clinic_records.id` | `global_patient_id` → `global_patients.id` |
|---|:---:|:---:|:---:|
| `clinical_notes` | ✅ | ✅ | ✅ |
| `lab_orders` | ✅ | ✅ | ✅ |
| `lab_results` | ❌ | ✅ | ✅ |
| `imaging_orders` | ✅ | ✅ | ✅ |
| `vital_signs` | ✅ | ✅ | ✅ |
| `prescription_items` | ✅ | ✅ | ✅ |
| `appointments` | ✅ | ✅ | ✅ |
| `doctor_patient_relationships` | ✅ | ✅ | ✅ |
| `patient_consent_grants` | ✅ | ✅ | ✅ |
| `patient_phone_history` | ✅ | ❌ | ✅ |

**Tables with ONLY legacy `patient_id → patients.id`** (no global_patient_id, no PCR FK):

`chronic_conditions`, `check_in_queue`, `conversations`, `default_sharing_preferences`, `notifications`, `payments`

**Decision:** RLS policies on tables with `global_patient_id` use that column directly (cleanest path, single point of truth, allows the new identity model). Policies on legacy-only tables either route through `clinic_id` if scoped that way, or — for the few tables where patient-self visibility matters (`conversations`, `notifications`) — JOIN through `patients` to find `global_patient_id`.

**Tables that don't exist on staging but Mo's Prompt 6 mentioned:** `prescriptions` (table), `medications`, `medication_intake_log`, `encounters`. Likely renamed/replaced post-prompt — the actual implementation is `prescription_items`, drug data lives elsewhere or hasn't shipped, and `clinical_notes` plays the encounter role. Document in build-06-results § 8 deviations.

---

## 2. Mig 093 — patient identity tables ✅ SHIPPED

Applied to staging 2026-04-30. Post-condition assertions all passed.

**State summary (verified):**

| Table | v2 policies | Legacy policies coexisting | Total | Notes |
|---|---:|---:|---:|---|
| `global_patients` | 4 | 0 | 4 | Was 1 DENY-ALL → 4 real (SELECT/INSERT-deny/UPDATE-self/DELETE-deny). Closes ORPH-V2-06. |
| `patient_clinic_records` | 4 | 0 | 4 | Closes ORPH-V3-01. |
| `patient_data_shares` | 4 | 0 | 4 | Closes ORPH-V5-01. |
| `privacy_code_attempts` | 1 | 3 | 4 | SELECT real; INSERT/UPDATE/DELETE stay DENY-ALL. Closes ORPH-V4-01. |
| `patient_privacy_codes` | 0 | 4 | 4 | DENY-ALL untouched (FINAL state per spec § 5). Closes ORPH-V4-02. |
| `privacy_code_sms_tokens` | 0 | 4 | 4 | DENY-ALL untouched. Closes ORPH-V4-03. |
| `patients` (legacy) | 3 | 8 | 11 | PERMISSIVE-OR coexistence per Mo's ruling 3. Mig 101 drops legacy after Phase D run #3 (originally referred to as "mig 098" in Prompt 6 spec; renumbered per session-16 ruling). |

**No caregiver paths** in any policy (Mo's ruling 2). `dependent_account_links` re-introduced in Prompt 7.

---

## 3. Mig 094 — clinical data RLS (PROPOSED, not yet written)

**Tables in scope:** `clinical_notes`, `lab_orders`, `lab_results`, `imaging_orders`, `vital_signs`, `prescription_items`. All have `global_patient_id`.

### 3.1 The cross-clinic clinical_notes policy — Mo's explicit review item

```sql
DROP POLICY IF EXISTS "Clinic-scoped note access" ON public.clinical_notes;
DROP POLICY IF EXISTS "Doctors can read own clinical notes" ON public.clinical_notes;
DROP POLICY IF EXISTS "Patients can read their clinical notes" ON public.clinical_notes;
-- (Note: keep "Doctors can create clinical notes" + "Doctors can insert notes in their clinic"
--  + "Doctors can update own clinical notes" alongside as v2 INSERT/UPDATE coverage; these
--  are identity-orthogonal and don't conflict with the new SELECT model.)

CREATE POLICY clinical_notes_select_v2 ON public.clinical_notes
FOR SELECT TO authenticated
USING (
  public.can_view_patient_data_at_clinic(
    clinical_notes.global_patient_id,
    clinical_notes.clinic_id,
    auth.uid()
  )
);
```

**Why this works** (the question Mo flagged):
- `clinical_notes.global_patient_id` is the patient. Verified FK in § 1 above.
- `clinical_notes.clinic_id` is which clinic owns this note. The "data clinic" in the directional-consent model.
- `can_view_patient_data_at_clinic` (mig 092 § 4, SECURITY DEFINER) returns TRUE if the viewer is:
  - the claimed patient, OR
  - a member of the data clinic (clinic-self auto-share), OR
  - a member of any clinic that has an **active grantor=clinic_id share** for this patient.
- The function bypasses RLS on its internal joins to `clinic_memberships` and `patient_data_shares`, so the cross-clinic check works regardless of whether the viewer can see those rows under their own context.

**Performance:** this single helper call replaces a 3-table join inlined per row. Phase B benchmark shows the helper at 0.023ms warm — well under the 1ms threshold. RLS evaluates STABLE helpers once per query, not per row.

**INSERT / UPDATE / DELETE policies:** unchanged from existing (clinic member of `clinic_id` writes only); the cross-clinic visibility is a READ feature, not a WRITE feature.

### 3.2 Same shape applies to lab_orders, lab_results, imaging_orders, vital_signs, prescription_items

All have `(global_patient_id, clinic_id)` columns that fit the helper signature. Mig 094 will be one CREATE POLICY per table using `can_view_patient_data_at_clinic`, plus the legacy SELECT policies dropped on the same migration so PERMISSIVE-OR doesn't bypass the new clinic-scoping (where existing policies were too permissive).

### 3.3 5 hot-spot scopes — explicit access pattern preservation

Per Mo's session-2 close: `patient-privacy-checks`, `clinic-context`, `visibility`, `prescription-sync`, `lab-results`. After Phase F migrates these callsites from admin client to user-context client, each must still get its rows under the new RLS:

| Hot-spot | Tables touched | New RLS allows? | Notes |
|---|---|:---:|---|
| `patient-privacy-checks` | `patient_clinic_records`, `global_patients` | ✅ | `is_clinic_member(clinic_id)` matches; mig 093 ships this |
| `clinic-context` | `clinic_memberships` | ✅ (existing) | `Members can view clinic memberships` policy already in place |
| `visibility` | `patient_visibility` (legacy table dropped Prompt 6.5) | ✅ via legacy policies | These callsites become Prompt 6.5 dead code |
| `prescription-sync` | `prescription_items` | ✅ | mig 094's `can_view_patient_data_at_clinic` policy |
| `lab-results` | `lab_results` | ✅ | mig 094's `can_view_patient_data_at_clinic` policy |

All 5 hot-spots are covered by mig 093/094 designs. Phase D matrix scenarios should explicitly include one positive + one negative case per hot-spot.

---

## 4. Mig 095 — operations tables (PROPOSED)

**Tables:** `appointments`, `check_in_queue`, `payments`, `doctor_availability`, `doctor_templates`. All clinic-internal — **no cross-clinic visibility** per Mo's § C4. Policy shape: simple `is_clinic_member(clinic_id)` for SELECT/INSERT/UPDATE; no DELETE. `appointments` has `global_patient_id` so a future cross-clinic referral feature can opt in via `can_view_patient_data_at_clinic` later.

**Coexistence note:** `appointments` already has 8 SELECT/INSERT policies including the 2024-era "clinic-scoped" + "doctors can read own" + "front desk can manage" patterns. Mig 095 ADDS `appointments_select_v2` and lets the existing 8 coexist via PERMISSIVE-OR. Mig 101 drops the legacy 8 once Phase D run #3 passes.

---

## 5. Mig 096 — communication + audit_events (PROPOSED)

**Tables:** `messages`, `conversations`, `notifications`, `audit_events`.

**audit_events refined Option A':** mig 096 adds the generated column:
```sql
ALTER TABLE public.audit_events
  ADD COLUMN resolved_global_patient_id UUID
  GENERATED ALWAYS AS (
    COALESCE(
      NULLIF(metadata->>'global_patient_id','')::UUID,
      CASE WHEN entity_type = 'global_patients' THEN entity_id END
    )
  ) STORED;

CREATE INDEX idx_audit_events_resolved_gpid
  ON public.audit_events(resolved_global_patient_id)
  WHERE resolved_global_patient_id IS NOT NULL;
```

This catches 120 of 282 staging rows (42.6%) — the patient-visible subset. Internal admin events (QUARANTINE, AUTH_PHONE, etc.) intentionally excluded.

**Patient-side audit policy:** SELECT WHERE `resolved_global_patient_id IN (SELECT id FROM global_patients WHERE claimed_user_id = auth.uid())`. Plus the existing OWNER-only policy stays for clinic-internal audit review.

`conversations` already has 7 policies — mig 096 adds clinic-internal + patient-self SELECT v2; legacy coexists.

---

## 6. Mig 097 — non-patient tables (PROPOSED)

**Tables:** `clinics`, `clinic_memberships`, `users`, `doctors`, etc.

These already have functional policies. Mig 097's job is mostly to ensure no DENY-ALL placeholders linger and to align names with the v2 convention (where Phase D matrix needs uniform identification). May end up being a no-op in practice — verify against Phase A.1 snapshot during writing.

---

## 7. Mig 101 — drop legacy policies (PROPOSED, runs LAST)

(Originally listed here as "mig 098" — renumbered to 101 per session-16 ruling 2026-05-02. Phase F added migs 098/099/100 for patient_code work + clinic-resolve RPC; the legacy drop now occupies slot 101.)

After Phase D test matrix run #3 passes 100%, mig 101 drops the legacy policies that mig 093–096 added v2 alongside. Single consolidated DROP POLICY list ~30–40 names. Per Mo: **single FAIL in run #3 = STOP, do not ship 101.**

---

## 8. Open questions for next session

1. `patients` legacy v2 policies on staging — sample-validate by trying `patients` SELECT under the new policies against existing rows. Currently 11 policies (3 v2 + 8 legacy). Make sure the v2 set alone returns the right rows when legacy is removed (verified during Phase D run #3 simulation).
2. Audit_events `resolved_global_patient_id` generated column performance — for 282 rows it's instant, but for production-scale audit accumulation we may want an `entity_id`-only fallback path that doesn't require parsing JSON metadata per row at index time. Re-benchmark in Phase E.
3. The 2 `prescriptions`/`medications` references in Mo's Prompt 6 § C3 — confirm whether prescription_items + clinical_notes is the full replacement, or if there's a missing-table audit beyond § 8 deviations.

These are non-blocking for mig 094 design but should be answered before Phase D matrix design.

---

## Phase C status

| Migration | Status | Tables | Closes |
|---|---|---|---|
| 092 helpers | ✅ shipped | 4 helpers | (none, infra) |
| 093 patient identity | ✅ shipped | 7 tables | V2-06, V3-01, V4-01, V4-02, V4-03, V5-01 |
| 094 clinical data | 📝 design done, write next session | 6 tables | (none — closes Phase C in matrix) |
| 095 operations | 📝 design done, write next session | 5 tables | (none) |
| 096 communication | 📝 design done, write next session | 4 tables + audit gen-col | (none) |
| 097 non-patient | 📝 design preview | ~5 tables | (none) |
| 101 drop legacy | ⏳ AFTER Phase D run #3 100% | (DROP only) | — |

**Phase D matrix design is unblocked for tables 092–093.** Recommend starting Phase D scenario authoring for the patient identity tables in parallel with mig 094–097 writing.
