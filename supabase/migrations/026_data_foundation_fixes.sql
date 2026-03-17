-- ============================================================================
-- Migration 026: Data Foundation Fixes
--
-- Fixes 4 critical issues identified in the stress test:
-- 1. Unify membership tables (clinic_doctors → clinic_memberships)
-- 2. Ensure clinic_id is populated in doctor_patient_relationships
-- 3. Fix join-clinic to work for both doctors and frontdesk
-- 4. Ensure appointments always have clinic_id
-- ============================================================================

-- ============================================================================
-- PART 1: Ensure clinic_memberships has all records from clinic_doctors
-- This is idempotent — skips records that already exist
-- ============================================================================

-- Backfill any clinic_doctors records not yet in clinic_memberships
INSERT INTO clinic_memberships (clinic_id, user_id, role, status, created_at)
SELECT
  cd.clinic_id,
  cd.doctor_id,
  CASE
    WHEN cd.role = 'frontdesk' THEN 'FRONT_DESK'::clinic_role
    WHEN cd.role = 'owner' THEN 'OWNER'::clinic_role
    ELSE 'DOCTOR'::clinic_role
  END,
  'ACTIVE'::membership_status,
  cd.created_at
FROM clinic_doctors cd
WHERE NOT EXISTS (
  SELECT 1 FROM clinic_memberships cm
  WHERE cm.clinic_id = cd.clinic_id
  AND cm.user_id = cd.doctor_id
)
ON CONFLICT DO NOTHING;

-- Backfill any front_desk_staff records not yet in clinic_memberships
INSERT INTO clinic_memberships (clinic_id, user_id, role, status, created_at)
SELECT
  fds.clinic_id,
  fds.id,
  'FRONT_DESK'::clinic_role,
  'ACTIVE'::membership_status,
  NOW()
FROM front_desk_staff fds
WHERE fds.clinic_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM clinic_memberships cm
  WHERE cm.clinic_id = fds.clinic_id
  AND cm.user_id = fds.id
)
ON CONFLICT DO NOTHING;

-- Ensure the first doctor in each clinic is OWNER (if no owner exists)
UPDATE clinic_memberships cm
SET role = 'OWNER'
WHERE cm.id IN (
  SELECT DISTINCT ON (clinic_id) id
  FROM clinic_memberships
  WHERE role = 'DOCTOR'
  AND status = 'ACTIVE'
  AND clinic_id NOT IN (
    SELECT clinic_id FROM clinic_memberships WHERE role = 'OWNER' AND status = 'ACTIVE'
  )
  ORDER BY clinic_id, created_at ASC
);

-- ============================================================================
-- PART 2: Backfill clinic_id on appointments from doctor's active clinic
-- Only fills NULL clinic_id values
-- ============================================================================

UPDATE appointments a
SET clinic_id = cm.clinic_id
FROM clinic_memberships cm
WHERE a.clinic_id IS NULL
AND cm.user_id = a.doctor_id
AND cm.status = 'ACTIVE'
AND cm.role IN ('OWNER', 'DOCTOR')
-- Pick the oldest membership if doctor has multiple clinics
AND cm.clinic_id = (
  SELECT cm2.clinic_id
  FROM clinic_memberships cm2
  WHERE cm2.user_id = a.doctor_id
  AND cm2.status = 'ACTIVE'
  AND cm2.role IN ('OWNER', 'DOCTOR')
  ORDER BY cm2.created_at ASC
  LIMIT 1
);

-- ============================================================================
-- PART 3: Backfill clinic_id on doctor_patient_relationships
-- Links each relationship to the doctor's clinic
-- ============================================================================

-- Add clinic_id column if it doesn't exist (migration 019 may have added it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'doctor_patient_relationships'
    AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE doctor_patient_relationships
    ADD COLUMN clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_dpr_clinic_id
    ON doctor_patient_relationships(clinic_id);
  END IF;
END $$;

-- Backfill clinic_id on relationships
UPDATE doctor_patient_relationships dpr
SET clinic_id = cm.clinic_id
FROM clinic_memberships cm
WHERE dpr.clinic_id IS NULL
AND cm.user_id = dpr.doctor_id
AND cm.status = 'ACTIVE'
AND cm.role IN ('OWNER', 'DOCTOR')
AND cm.clinic_id = (
  SELECT cm2.clinic_id
  FROM clinic_memberships cm2
  WHERE cm2.user_id = dpr.doctor_id
  AND cm2.status = 'ACTIVE'
  AND cm2.role IN ('OWNER', 'DOCTOR')
  ORDER BY cm2.created_at ASC
  LIMIT 1
);

-- ============================================================================
-- PART 4: Backfill clinic_id on patients table
-- Uses the creating doctor's clinic
-- ============================================================================

UPDATE patients p
SET clinic_id = cm.clinic_id
FROM clinic_memberships cm
WHERE p.clinic_id IS NULL
AND p.created_by_doctor_id IS NOT NULL
AND cm.user_id = p.created_by_doctor_id
AND cm.status = 'ACTIVE'
AND cm.role IN ('OWNER', 'DOCTOR')
AND cm.clinic_id = (
  SELECT cm2.clinic_id
  FROM clinic_memberships cm2
  WHERE cm2.user_id = p.created_by_doctor_id
  AND cm2.status = 'ACTIVE'
  AND cm2.role IN ('OWNER', 'DOCTOR')
  ORDER BY cm2.created_at ASC
  LIMIT 1
);

-- ============================================================================
-- PART 5: Create a unified join-clinic endpoint support
-- Allow the join API to work for any role by using clinic_memberships directly
-- ============================================================================

-- No schema changes needed — we'll handle this in the API code
-- The clinic_memberships table already supports all roles

-- ============================================================================
-- PART 6: Add indexes for clinic-scoped queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_doctor
ON appointments(clinic_id, doctor_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_date
ON appointments(clinic_id, start_time DESC)
WHERE status IN ('scheduled', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_dpr_clinic_doctor
ON doctor_patient_relationships(clinic_id, doctor_id);

CREATE INDEX IF NOT EXISTS idx_patients_clinic
ON patients(clinic_id) WHERE clinic_id IS NOT NULL;
