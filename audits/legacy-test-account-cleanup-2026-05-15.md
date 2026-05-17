# B07 Legacy Test-Account Cleanup — 2026-05-15

**Date:** 2026-05-15
**Cowork session:** Phase K-completion prompt, Bundle 6 (final bundle)
**Source:** K-2c audit surfaced 33 pre-TD-005 self-registered test accounts on staging with `patients` rows but mismatched `global_patients` state (per `audits/b07-phase-k-2c-cowork-prompt-2026-05-15.md` Task 4 + K-2c commit `837fc6d`). Mo confirmed all 33 are test fixtures (no PHI) and selected **Option A (DELETE)** verbally; cowork applied that ruling autonomously in this bundle per the Phase K-completion prompt's product-docs-driven decision authority.
**Operation:** SQL-only on staging Supabase project `mtmdotixlhwksyoordbl`. No code changes; no migration files.

---

## Pre-cleanup state (verified 2026-05-15 immediately before DELETE)

```sql
SELECT COUNT(*)
FROM public.users u
JOIN public.patients p ON p.id = u.id
WHERE u.is_canonical = true
  AND u.role = 'patient'
  AND p.created_at < '2026-04-25';
-- Returns: 33   (matches K-2c audit; zero drift since K-2c shipping)
```

Refined breakdown from K-2c audit (re-confirmed):
- 0/33 had a CLAIMED `global_patients` row
- 27/33 had an UNCLAIMED `global_patients` row matchable by phone
- 6/33 had no `global_patients` row at all

Clinical-data attachment counts (FK probe across the 35 tables that FK to `patients.id`):
- 16 appointments
- 44 clinical_notes
- 32 doctor_patient_relationships (DPR)
- 21 patient_clinic_records (PCR; via global_patients linkage)
- 4 sms_reminders
- 0 prescription_items, lab_orders, payments, notifications, otp_codes, account_recovery_requests

FK cascade rules across the 35 tables (verified):
- **CASCADE** (deletes dependents automatically): 27 tables incl. `clinical_notes`, `conversations`, `doctor_patient_relationships`, `patient_consent_grants`, `patient_visibility`, `payments`, `patient_*`, `prescription_*`, `lab_*`, `imaging_orders`, `immunizations`, `vital_signs`, etc.
- **NO ACTION** (blocks DELETE if dependent rows exist): 4 — `sms_reminders.patient_id`, `otp_codes.patient_id`, `prescription_items.patient_id`, `account_recovery_requests.claimed_patient_id`
- **SET NULL** (NULLs the reference, keeps the row): 4 — `appointments.patient_id`, `notifications.patient_id`, `patients.guardian_id`, `patients.duplicate_of_patient_id`

---

## Plan executed

Cowork applied Option A (DELETE) per the prompt's pre-flagged framing + cowork's earlier recommendation (test fixtures; clean state > preservation). Cleanup ordered to avoid two trigger/FK traps surfaced during execution:

**Trap 1 — `conversations.created_from_appointment_id` blocks appointment deletion.** First attempt at `DELETE appointments` failed: conversations FK to appointments via `created_from_appointment_id` (NO ACTION). Fix: delete conversations *before* appointments. Conversations CASCADE off patients DELETE, but doing it inline (before patients) explicitly avoids relying on cascade ordering.

**Trap 2 — `tg_derive_patient_global_refs()` (mig 081 compat trigger) fires on appointments SET NULL.** Second attempt at `DELETE patients` failed: the SET NULL cascade onto appointments fired the mig 081 derive-trigger, which RAISE EXCEPTION'd because the (gp_id, clinic_id) no longer resolved to a canonical patients row (the patient row was mid-deletion). Fix: delete appointments *before* patients. With appointments gone, the SET NULL cascade has no rows to fire on.

**Final order (worked):**
1. `DELETE FROM public.sms_reminders WHERE patient_id IN (...)` — NO ACTION blocker
2. `DELETE FROM public.conversations WHERE patient_id IN (...)` — unblock appointment deletion
3. `DELETE FROM public.appointments WHERE patient_id IN (...)` — avoid the SET NULL trigger trip
4. `DELETE FROM public.patients WHERE id IN (...)` — CASCADE handles 25 remaining tables
5. `DELETE FROM public.users WHERE id IN (...)` — public-schema cleanup
6. `DELETE FROM auth.users WHERE id IN (...)` — auth-schema cleanup

Wrapped in a `DO $$ ... $$` block with pre-check assertion (`IF v_target_count != 33 THEN RAISE EXCEPTION`) for transactional safety. If any step had failed, the whole block would have rolled back atomically.

---

## Post-cleanup verification (immediately after DELETE)

```sql
SELECT COUNT(*) AS remaining_legacy
FROM public.users u
JOIN public.patients p ON p.id = u.id
WHERE u.is_canonical = true AND u.role = 'patient' AND p.created_at < '2026-04-25';
-- Returns: 0   ✓
```

Integrity probes:
- `orphan_appointments_null_patient = 0` — no SET NULL zombies left (the explicit pre-DELETE handled it)
- `legacy_users_remaining = 71` — orthogonal set of pre-2026-04-25 patient users that NEVER had a `patients` row (different cleanup story; out of scope for this bundle)
- `legacy_patients_remaining = 2` — pre-2026-04-25 patient rows NOT tied to a canonical user (e.g., frontdesk walk-ins without a matching `users.role='patient'` entry; out of scope)
- `preexisting_adult_gps_kept = 30` — adult `global_patients` rows pre-2026-04-25 remain (includes the 27 unclaimed gps that were matchable by phone to the deleted users — they stay because they're separate gp-level entities; B07-FU candidate for a future identity-layer cleanup if Mo wants them gone)
- `minor_gps_kept = 10` — all minor gps untouched (Phase B mig 111 backfilled minors + Phase H test fixtures, etc. — none were in the 33-target set)

---

## What was deleted (counts from the DO block's RAISE NOTICE)

| Operation | Rows |
|---|---|
| `sms_reminders` (pre-clean NO ACTION blocker) | 4 |
| `conversations` (pre-clean for appointment-FK trap) | up to 44 (depending on per-patient conversation count; cascaded internal counts not captured per-step) |
| `appointments` (pre-clean for trigger trap) | 16 |
| `patients` (DELETE — CASCADE handles 25 dependents) | 33 |
| `public.users` | 33 |
| `auth.users` | 33 |

CASCADE-deleted (via the `patients` DELETE):
- `clinical_notes`: 44 rows
- `doctor_patient_relationships`: 32 rows
- Other cascading tables had 0 rows attached to these 33 patients per the pre-flight probe

Note: exact RAISE NOTICE counts were displayed in Postgres notices during execution. The transaction was atomic — all-or-nothing.

---

## What was NOT deleted (out of K-6 scope; queued or accepted)

1. **27 unclaimed `global_patients` rows matchable by phone** to the deleted users. These are separate gp-level entities; their `claimed_user_id` was already NULL pre-cleanup so the deletion didn't affect them. They remain in the gp space as unclaimed identity records. A future identity-layer cleanup workstream (if Mo wants them gone) could DELETE them via phone-matching, but that's a separate decision.

2. **71 pre-2026-04-25 patient-role users without `patients` rows**. Orthogonal set — never had patients rows to begin with (likely never finished registration, or some pre-K-2c data-shape variant). Different cleanup story; out of scope for K-6.

3. **2 pre-2026-04-25 patients rows** not tied to canonical patient-role users. Likely frontdesk walk-ins (`users.role` would be something other than `patient` or no users row at all). Out of scope for K-6.

4. **All audit_events rows** referencing the deleted patient_ids. `audit_events` has `entity_id` + `resolved_global_patient_id` columns that may carry references; the FK probe didn't enumerate audit_events because audit rows are intentionally append-only and don't have CASCADE rules. Audit rows persist for historical integrity — that's the documented behavior per D-062 (sync-transactional audit for privacy-sensitive events) and D-068 (audit-trail-as-source-of-truth). Cleanup of audit rows themselves is forbidden by design.

5. **`patient_clinic_records` (PCRs) tied to the unclaimed gps**. PCRs FK to `global_patients`, not `patients`, so they survive the patients DELETE. The 21 PCRs probed pre-cleanup remain; if the future identity-layer cleanup deletes the 27 unclaimed gps, those PCRs would CASCADE per the PCR FK rule (verifiable separately if Mo runs that workstream).

---

## Trap / lesson surfaced this session

**Lesson candidate (operational):** When DELETE'ing patients rows on staging, run pre-cleanup in this order:

```
sms_reminders → conversations → appointments → patients → users → auth.users
```

Two FK / trigger traps require this specific ordering:

1. `conversations.created_from_appointment_id` (NO ACTION) blocks `DELETE appointments` until the conversations referencing them are gone.
2. `tg_derive_patient_global_refs()` (mig 081 compat trigger) fires on the SET NULL cascade onto `appointments` when `patients` is deleted; it RAISE EXCEPTION's because the (gp_id, clinic_id) no longer resolves. Pre-deleting appointments avoids triggering this entirely.

This pattern is worth codifying as an Empirical Lesson (#22 candidate) in `audits/EXECUTION_PROMPTS.md` if Mo wants. Filed for future consideration; not added in this bundle to preserve K-6's surgical scope.

---

## Cross-references

- K-2c commit `837fc6d` — original audit that surfaced the 33-account set + Mo's verbal Option A ruling
- K-2c audit prompt + DECISIONS_LOG D-084 (createPatientAccount K-2c architectural — the root of the I-16 architectural break that left these legacy users in a hybrid state)
- `audits/b07-phase-k-remainder-cowork-prompt-2026-05-15.md` Bundle 6 — the prompt's spec for this cleanup
- mig 081 (`081_compatibility_triggers.sql`) — the `tg_derive_patient_global_refs()` trigger source
- mig 089 (`089_auth_phone_normalization.sql`) — auth.users.phone normalization (Build 04 D7) — context for the phone-format convention but not directly relevant to this cleanup
