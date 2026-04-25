-- ============================================================================
-- Migration 049: Backfill clinic_id for self-registered patients
-- ============================================================================
--
-- Background
-- ----------
-- After mig 048 added clinic_id to patients and backfilled via
-- created_by_doctor_id, 79 of 108 patients remained NULL — all are
-- self-registered users (their patients.id matches an auth.users.id)
-- with no created_by_doctor_id set. 73 of those 79 have no doctor
-- connection at all and need a separate cleanup decision (Mo's call).
--
-- This migration handles the 6 that DO have a doctor connection:
--   - 3 are linked via doctor_patient_relationships
--   - 3 are linked via appointments
-- They can be backfilled to the linked clinic now that DPR.clinic_id
-- (mig 048) and appointments.clinic_id (pre-existing) are populated.
--
-- Pre-flight (run 2026-04-24): 6 rows, mapping verified
--   4 → 298866c7… (Naser's clinic)
--   1 → 5748f73a…
--   1 → 343ffa3e…
--
-- Idempotent: only updates rows where clinic_id IS NULL.
-- ============================================================================

UPDATE public.patients p
SET clinic_id = COALESCE(
  -- First try: doctor_patient_relationships (oldest first)
  (SELECT dpr.clinic_id
     FROM public.doctor_patient_relationships dpr
    WHERE dpr.patient_id = p.id
      AND dpr.clinic_id IS NOT NULL
    ORDER BY dpr.created_at ASC
    LIMIT 1),
  -- Then try: appointments (earliest first)
  (SELECT a.clinic_id
     FROM public.appointments a
    WHERE a.patient_id = p.id
      AND a.clinic_id IS NOT NULL
    ORDER BY a.start_time ASC
    LIMIT 1)
)
WHERE p.clinic_id IS NULL
  AND (
    EXISTS (SELECT 1 FROM public.doctor_patient_relationships dpr
             WHERE dpr.patient_id = p.id AND dpr.clinic_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.appointments a
                WHERE a.patient_id = p.id AND a.clinic_id IS NOT NULL)
  );

-- Cascade to children that backfilled-from-patients in mig 048 (some of those
-- may now resolve thanks to this update — most notably patient_diary,
-- patient_medical_records, patient_medications which depend on patients.clinic_id).
UPDATE public.patient_medical_records pmr
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE pmr.patient_id = p.id AND pmr.clinic_id IS NULL AND p.clinic_id IS NOT NULL;

UPDATE public.patient_medications pm
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE pm.patient_id = p.id AND pm.clinic_id IS NULL AND p.clinic_id IS NOT NULL;

UPDATE public.patient_allergies pa
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE pa.patient_id = p.id AND pa.clinic_id IS NULL AND p.clinic_id IS NOT NULL;

UPDATE public.chronic_conditions cc
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE cc.patient_id = p.id AND cc.clinic_id IS NULL AND p.clinic_id IS NOT NULL;

UPDATE public.immunizations i
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE i.patient_id = p.id AND i.clinic_id IS NULL AND p.clinic_id IS NOT NULL;

UPDATE public.patient_diary pd
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE pd.patient_id = p.id AND pd.clinic_id IS NULL AND p.clinic_id IS NOT NULL;

UPDATE public.patient_health_metrics phm
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE phm.patient_id = p.id AND phm.clinic_id IS NULL AND p.clinic_id IS NOT NULL;
