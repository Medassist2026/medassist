-- ============================================================================
-- Migration 023: Clinic Architecture Completion
-- ============================================================================
-- Fixes schema gaps for full clinic-centric multi-tenant with privacy-first
-- patient consent system.
-- ============================================================================

-- ============================================================================
-- 1. Add patient_code to patients (6-digit shareable code for consent)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'patient_code'
  ) THEN
    ALTER TABLE patients ADD COLUMN patient_code TEXT;

    -- Generate codes for existing patients
    UPDATE patients
    SET patient_code = UPPER(SUBSTRING(md5(random()::text || id::text) FROM 1 FOR 6))
    WHERE patient_code IS NULL;

    -- Add unique index
    CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_patient_code
      ON patients(patient_code) WHERE patient_code IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 2. Add default_visibility to clinics table
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clinics' AND column_name = 'default_visibility'
  ) THEN
    ALTER TABLE clinics ADD COLUMN default_visibility TEXT DEFAULT 'DOCTOR_SCOPED_OWNER';
  END IF;
END $$;

-- ============================================================================
-- 3. Ensure clinical_notes.clinic_id exists and has proper index
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clinical_notes' AND column_name = 'clinic_id'
  ) THEN
    ALTER TABLE clinical_notes ADD COLUMN clinic_id UUID REFERENCES clinics(id);
  END IF;
END $$;

-- Backfill clinical_notes.clinic_id from doctor's clinic membership
UPDATE clinical_notes cn
SET clinic_id = (
  SELECT cm.clinic_id
  FROM clinic_memberships cm
  WHERE cm.user_id = cn.doctor_id
    AND cm.status = 'ACTIVE'
  ORDER BY cm.created_at ASC
  LIMIT 1
)
WHERE cn.clinic_id IS NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_clinical_notes_clinic_id ON clinical_notes(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_doctor_clinic ON clinical_notes(doctor_id, clinic_id);

-- ============================================================================
-- 4. Performance indexes for visibility and audit queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_patient_visibility_clinic_patient
  ON patient_visibility(clinic_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_visibility_grantee
  ON patient_visibility(grantee_user_id) WHERE grantee_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_events_clinic_created
  ON audit_events(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor
  ON audit_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity
  ON audit_events(entity_type, entity_id);

-- ============================================================================
-- 5. Backfill NULL clinic_id on patients table
-- ============================================================================

UPDATE patients p
SET clinic_id = (
  SELECT cm.clinic_id
  FROM clinic_memberships cm
  WHERE cm.user_id = p.created_by_doctor_id
    AND cm.status = 'ACTIVE'
  ORDER BY cm.created_at ASC
  LIMIT 1
)
WHERE p.clinic_id IS NULL
  AND p.created_by_doctor_id IS NOT NULL;

-- ============================================================================
-- 6. Helper function: generate patient code
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_patient_code()
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 6-character alphanumeric code
    new_code := UPPER(SUBSTRING(md5(random()::text || clock_timestamp()::text) FROM 1 FOR 6));

    -- Check uniqueness
    SELECT EXISTS(SELECT 1 FROM patients WHERE patient_code = new_code) INTO code_exists;

    EXIT WHEN NOT code_exists;
  END LOOP;

  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. Auto-generate patient_code on insert if not provided
-- ============================================================================

CREATE OR REPLACE FUNCTION set_patient_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.patient_code IS NULL THEN
    NEW.patient_code := generate_patient_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_patient_code ON patients;
CREATE TRIGGER trg_set_patient_code
  BEFORE INSERT ON patients
  FOR EACH ROW
  EXECUTE FUNCTION set_patient_code();

-- ============================================================================
-- Done
-- ============================================================================
