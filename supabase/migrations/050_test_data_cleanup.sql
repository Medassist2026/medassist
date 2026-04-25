-- ============================================================================
-- Migration 050: Test/seed data cleanup (Actions A + B + C)
-- ============================================================================
--
-- Background
-- ----------
-- After mig 048 (clinic_id added everywhere) + mig 049 (6 self-registered
-- patients backfilled), several tables still have NULL clinic_id rows that
-- can't be backfilled — they belong to test/seed data with no resolvable
-- clinic. This migration deletes that test/seed data so mig 051 can add
-- NOT NULL across the 19 tables.
--
-- Approved by Mo on 2026-04-24 (chat: "Y/Y/Y" to all three actions).
--
-- Action A — delete 73 orphan patients + cascades + 18 zombie appointments
--   - Patients: 73 self-registered users with no doctor connection (60 are
--     `registered=TRUE`; 58 created on 2026-02-16 seed-data spike).
--   - Cascade fallout (auto): 12 dpr, 10 medical_records, 7 medications,
--     11 diary, 11 queue, 13 conversations, plus messages cascade from
--     conversations.
--   - Explicit: 22 appointments tied to orphan patients (would otherwise
--     SET NULL their patient_id and become zombies). Pre-flight verified
--     0 conversation/sms_reminder NO-ACTION blockers.
--
-- Action B — delete data owned by 24 Class-B test doctors (no membership)
--   - Doctors classified by name pattern: Phase*, Dr Session*, Repro*,
--     Auth Probe*, Smoke, bla|bal, Test*, OR full_name IS NULL.
--   - Their data: 22 appts (overlap with Action A — same test doctors
--     owned the orphan patients' appts), 12 dpr, 50 doctor_availability,
--     7 check_in_queue. Net new after Action A: ~75 rows.
--   - Doctor accounts themselves are KEPT (auth users are cheap; some
--     might be reused for QA tests).
--
-- Action C — delete 10 orphan availability slots for 2 real-looking
-- doctors with no membership
--   - Ahmed Mohammad (ca6b11eb…) — 5 slots
--   - Mohsen mohmady (3d408b41…) — 5 slots
--   - Doctor accounts KEPT. Slots are useless without a clinic context.
--
-- Pre-flight verified (2026-04-24): zero NO-ACTION FK blockers across all
-- targets. Idempotent: re-running this on a clean DB is a no-op (all
-- WHERE clauses target rows that no longer exist).
-- ============================================================================


-- ── Action A: orphan patient cleanup ────────────────────────────────────────

-- A1: Delete the 22 zombie appointments tied to orphan patients FIRST
-- (appointments.patient_id is ON DELETE SET NULL; deleting patients first
-- would zombie these rows. Easier to delete them outright.)
DELETE FROM public.appointments
WHERE patient_id IN (
  SELECT id FROM public.patients WHERE clinic_id IS NULL
);

-- A2: Delete the 73 orphan patients. Cascades (per FK rules):
--   - doctor_patient_relationships → CASCADE
--   - patient_medical_records      → CASCADE
--   - patient_medications          → CASCADE
--   - patient_diary                → CASCADE
--   - check_in_queue               → CASCADE
--   - conversations                → CASCADE (and messages cascade from there)
--   - patient_allergies            → CASCADE
--   - chronic_conditions           → CASCADE
--   - immunizations                → CASCADE
--   - patient_health_metrics       → CASCADE
--   - patient_consent_grants       → CASCADE
--   - patient_visibility           → CASCADE
--   - record_sharing_preferences   → CASCADE
--   - vital_signs                  → CASCADE
--   - default_sharing_preferences  → CASCADE
--   - imaging_orders               → CASCADE
--   - lab_orders                   → CASCADE
--   - medication_reminders         → CASCADE
--   - medication_adherence_log     → CASCADE
--   - patient_phone_history        → CASCADE
--   - patient_phone_verification_issues → CASCADE
--   - patient_recovery_codes       → CASCADE
--   - phone_change_requests        → CASCADE
--   - phone_corrections            → CASCADE
DELETE FROM public.patients
WHERE clinic_id IS NULL;


-- ── Action B: Class B test-doctor data cleanup ──────────────────────────────

-- B0: Materialize class B doctor IDs into a temp table so all 4 deletes
--     reference the same set without re-evaluating the regex.
CREATE TEMP TABLE _class_b_doctors AS
SELECT d.id
FROM public.doctors d
WHERE NOT EXISTS (
  SELECT 1 FROM public.clinic_memberships cm
  WHERE cm.user_id = d.id AND cm.status = 'ACTIVE'
)
AND (
  d.full_name ~* '^(Phase|Dr Session|Test|Repro|Auth Probe|Smoke|bla|bal)'
  OR d.full_name LIKE 'Test %'
  OR d.full_name IS NULL
);

-- B1: their appointments (should be ~0 left after Action A handled most)
DELETE FROM public.appointments
WHERE doctor_id IN (SELECT id FROM _class_b_doctors);

-- B2: their doctor_patient_relationships (the test-doctor side of test patients)
DELETE FROM public.doctor_patient_relationships
WHERE doctor_id IN (SELECT id FROM _class_b_doctors);

-- B3: their doctor_availability
DELETE FROM public.doctor_availability
WHERE doctor_id IN (SELECT id FROM _class_b_doctors);

-- B4: their check_in_queue entries
DELETE FROM public.check_in_queue
WHERE doctor_id IN (SELECT id FROM _class_b_doctors);

DROP TABLE _class_b_doctors;


-- ── Action C: Ahmed Mohammad + Mohsen mohmady orphan availability ───────────

DELETE FROM public.doctor_availability
WHERE doctor_id IN (
  'ca6b11eb-7cd0-46c1-a9b0-a142dc7af10f',  -- Ahmed Mohammad
  '3d408b41-2cc5-49e3-8d14-67449910d0c5'   -- Mohsen mohmady
);
