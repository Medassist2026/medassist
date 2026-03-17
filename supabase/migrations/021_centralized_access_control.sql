-- ============================================================================
-- Migration 021: Centralized Access Control Function + RLS Rewrite
-- ============================================================================

-- The core access control function
-- Returns true if user_id can access patient_id within clinic_id
-- permission: 'READ', 'WRITE', 'SHARE'
CREATE OR REPLACE FUNCTION public.can_access_patient(
  p_clinic_id UUID,
  p_patient_id UUID,
  p_user_id UUID,
  p_permission TEXT DEFAULT 'READ'
) RETURNS BOOLEAN AS $$
DECLARE
  v_membership RECORD;
  v_has_visibility BOOLEAN;
BEGIN
  -- Step 1: Must be active member of clinic
  SELECT role INTO v_membership
  FROM public.clinic_memberships
  WHERE clinic_id = p_clinic_id
    AND user_id = p_user_id
    AND status = 'ACTIVE';

  IF v_membership IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Step 2: OWNER can access all patients in clinic
  IF v_membership.role = 'OWNER' THEN
    RETURN TRUE;
  END IF;

  -- Step 3: DOCTOR access check
  IF v_membership.role = 'DOCTOR' THEN
    -- Check patient_visibility for this doctor
    SELECT EXISTS (
      SELECT 1 FROM public.patient_visibility pv
      WHERE pv.clinic_id = p_clinic_id
        AND pv.patient_id = p_patient_id
        AND (
          -- Direct doctor grant
          (pv.grantee_type = 'DOCTOR' AND pv.grantee_user_id = p_user_id)
          -- Clinic-wide visibility
          OR pv.mode = 'CLINIC_WIDE'
        )
        AND (pv.expires_at IS NULL OR pv.expires_at > NOW())
    ) INTO v_has_visibility;

    RETURN v_has_visibility;
  END IF;

  -- Step 4: ASSISTANT / FRONT_DESK access check
  IF v_membership.role IN ('ASSISTANT', 'FRONT_DESK') THEN
    -- Must have active assignment to a doctor who has access
    RETURN EXISTS (
      SELECT 1
      FROM public.assistant_doctor_assignments ada
      WHERE ada.clinic_id = p_clinic_id
        AND ada.assistant_user_id = p_user_id
        AND ada.status = 'ACTIVE'
        AND (
          -- Check the assigned doctor has access to this patient
          EXISTS (
            SELECT 1 FROM public.patient_visibility pv
            WHERE pv.clinic_id = p_clinic_id
              AND pv.patient_id = p_patient_id
              AND (
                (pv.grantee_type = 'DOCTOR' AND pv.grantee_user_id = ada.doctor_user_id)
                OR pv.mode = 'CLINIC_WIDE'
              )
              AND (pv.expires_at IS NULL OR pv.expires_at > NOW())
          )
        )
        -- Check scope allows the operation
        AND (
          p_permission = 'READ'
          OR (p_permission = 'WRITE' AND ada.scope IN ('PATIENT_DEMOGRAPHICS', 'FULL_DOCTOR_SUPPORT'))
          OR (p_permission = 'SHARE' AND ada.scope = 'FULL_DOCTOR_SUPPORT')
        )
    );
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.can_access_patient IS 'Centralized patient access control. Checks clinic membership, role, visibility grants, and assistant scope.';

-- Helper: Check if user is active member of clinic
CREATE OR REPLACE FUNCTION public.is_clinic_member(
  p_clinic_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_memberships
    WHERE clinic_id = p_clinic_id
      AND user_id = p_user_id
      AND status = 'ACTIVE'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: Get user's role in a clinic
CREATE OR REPLACE FUNCTION public.get_clinic_role(
  p_clinic_id UUID,
  p_user_id UUID
) RETURNS clinic_role AS $$
  SELECT role FROM public.clinic_memberships
  WHERE clinic_id = p_clinic_id
    AND user_id = p_user_id
    AND status = 'ACTIVE';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- REWRITE KEY RLS POLICIES
-- ============================================================================

-- === PATIENTS: clinic-scoped access ===
DROP POLICY IF EXISTS "Doctors can view their patients" ON public.patients;
DROP POLICY IF EXISTS "Patients can view own data" ON public.patients;
DROP POLICY IF EXISTS "Clinic members can view patients" ON public.patients;

CREATE POLICY "Clinic members can view patients"
ON public.patients FOR SELECT
USING (
  -- Patient viewing own data
  id = auth.uid()
  -- Or clinic member with patient access
  OR (
    clinic_id IS NOT NULL
    AND public.can_access_patient(clinic_id, id, auth.uid(), 'READ')
  )
  -- Legacy: doctor_patient_relationships (for patients without clinic_id)
  OR EXISTS (
    SELECT 1 FROM public.doctor_patient_relationships dpr
    WHERE dpr.patient_id = patients.id
    AND dpr.doctor_id = auth.uid()
    AND dpr.status = 'active'
  )
);

-- === CLINICAL_NOTES: clinic-scoped ===
DROP POLICY IF EXISTS "Doctors can read own notes" ON public.clinical_notes;
DROP POLICY IF EXISTS "Patients can view synced notes" ON public.clinical_notes;
DROP POLICY IF EXISTS "Clinic-scoped note access" ON public.clinical_notes;
DROP POLICY IF EXISTS "Doctors can insert notes in their clinic" ON public.clinical_notes;

CREATE POLICY "Clinic-scoped note access"
ON public.clinical_notes FOR SELECT
USING (
  -- Doctor who wrote the note
  doctor_id = auth.uid()
  -- Patient viewing synced notes
  OR (patient_id = auth.uid() AND COALESCE(synced_to_patient, FALSE) = TRUE)
  -- Clinic member with patient access
  OR (
    clinic_id IS NOT NULL
    AND public.can_access_patient(clinic_id, patient_id, auth.uid(), 'READ')
  )
);

CREATE POLICY "Doctors can insert notes in their clinic"
ON public.clinical_notes FOR INSERT
WITH CHECK (
  doctor_id = auth.uid()
  AND (
    clinic_id IS NULL
    OR public.is_clinic_member(clinic_id, auth.uid())
  )
);

-- === APPOINTMENTS: clinic-scoped ===
DROP POLICY IF EXISTS "Doctors can view own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Patients can view own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Frontdesk can view appointments" ON public.appointments;
DROP POLICY IF EXISTS "Clinic-scoped appointment access" ON public.appointments;

CREATE POLICY "Clinic-scoped appointment access"
ON public.appointments FOR SELECT
USING (
  -- Doctor's own appointments
  doctor_id = auth.uid()
  -- Patient's own appointments
  OR patient_id = auth.uid()
  -- Clinic member
  OR (
    clinic_id IS NOT NULL
    AND public.is_clinic_member(clinic_id, auth.uid())
  )
);

-- === VITAL_SIGNS: clinic-scoped ===
DROP POLICY IF EXISTS "Doctors can view their patients vitals" ON public.vital_signs;
DROP POLICY IF EXISTS "Patients can view own vitals" ON public.vital_signs;
DROP POLICY IF EXISTS "Clinic-scoped vital signs access" ON public.vital_signs;

CREATE POLICY "Clinic-scoped vital signs access"
ON public.vital_signs FOR SELECT
USING (
  -- Doctor who recorded
  doctor_id = auth.uid()
  -- Patient's own
  OR patient_id = auth.uid()
  -- Clinic member with patient access
  OR (
    clinic_id IS NOT NULL
    AND public.can_access_patient(clinic_id, patient_id, auth.uid(), 'READ')
  )
);

-- === LAB_ORDERS: clinic-scoped ===
DROP POLICY IF EXISTS "Doctors can view lab orders" ON public.lab_orders;
DROP POLICY IF EXISTS "Patients can view own lab orders" ON public.lab_orders;
DROP POLICY IF EXISTS "Clinic-scoped lab order access" ON public.lab_orders;

CREATE POLICY "Clinic-scoped lab order access"
ON public.lab_orders FOR SELECT
USING (
  doctor_id = auth.uid()
  OR patient_id = auth.uid()
  OR (
    clinic_id IS NOT NULL
    AND public.can_access_patient(clinic_id, patient_id, auth.uid(), 'READ')
  )
);

-- === LAB_RESULTS: clinic-scoped (if applicable) ===
DROP POLICY IF EXISTS "Clinic-scoped lab results access" ON public.lab_results;

CREATE POLICY "Clinic-scoped lab results access"
ON public.lab_results FOR SELECT
USING (
  -- User can view if they can view the parent lab order
  EXISTS (
    SELECT 1 FROM public.lab_orders lo
    WHERE lo.id = lab_results.lab_order_id
    AND (
      lo.doctor_id = auth.uid()
      OR lo.patient_id = auth.uid()
      OR (
        lo.clinic_id IS NOT NULL
        AND public.can_access_patient(lo.clinic_id, lo.patient_id, auth.uid(), 'READ')
      )
    )
  )
);

-- === IMAGING_ORDERS: clinic-scoped ===
DROP POLICY IF EXISTS "Clinic-scoped imaging order access" ON public.imaging_orders;

CREATE POLICY "Clinic-scoped imaging order access"
ON public.imaging_orders FOR SELECT
USING (
  doctor_id = auth.uid()
  OR patient_id = auth.uid()
  OR (
    clinic_id IS NOT NULL
    AND public.can_access_patient(clinic_id, patient_id, auth.uid(), 'READ')
  )
);

-- === PAYMENTS: clinic-scoped ===
DROP POLICY IF EXISTS "Frontdesk can view payments" ON public.payments;
DROP POLICY IF EXISTS "Clinic-scoped payment access" ON public.payments;

CREATE POLICY "Clinic-scoped payment access"
ON public.payments FOR SELECT
USING (
  -- Doctor who was paid for
  doctor_id = auth.uid()
  -- Patient's own
  OR patient_id = auth.uid()
  -- Clinic member
  OR (
    clinic_id IS NOT NULL
    AND public.is_clinic_member(clinic_id, auth.uid())
  )
);

-- === CHECK_IN_QUEUE: clinic-scoped ===
DROP POLICY IF EXISTS "Frontdesk can manage queue" ON public.check_in_queue;
DROP POLICY IF EXISTS "Clinic-scoped queue access" ON public.check_in_queue;

CREATE POLICY "Clinic-scoped queue access"
ON public.check_in_queue FOR SELECT
USING (
  doctor_id = auth.uid()
  OR patient_id = auth.uid()
  OR (
    clinic_id IS NOT NULL
    AND public.is_clinic_member(clinic_id, auth.uid())
  )
);

-- === CONVERSATIONS: clinic-scoped ===
DROP POLICY IF EXISTS "Participants can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Clinic-scoped conversation access" ON public.conversations;

CREATE POLICY "Clinic-scoped conversation access"
ON public.conversations FOR SELECT
USING (
  patient_id = auth.uid()
  OR doctor_id = auth.uid()
  OR (
    clinic_id IS NOT NULL
    AND public.is_clinic_member(clinic_id, auth.uid())
  )
);

-- === MESSAGES: clinic-scoped ===
DROP POLICY IF EXISTS "Clinic-scoped message access" ON public.messages;

CREATE POLICY "Clinic-scoped message access"
ON public.messages FOR SELECT
USING (
  -- User can view if they can view the parent conversation
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
    AND (
      c.patient_id = auth.uid()
      OR c.doctor_id = auth.uid()
      OR (
        c.clinic_id IS NOT NULL
        AND public.is_clinic_member(c.clinic_id, auth.uid())
      )
    )
  )
);

-- ============================================================================
-- Add clinic default visibility setting to clinics table
-- ============================================================================
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS default_visibility visibility_mode DEFAULT 'DOCTOR_SCOPED_OWNER',
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

COMMENT ON COLUMN public.clinics.default_visibility IS 'Default patient visibility mode for new patients. Solo clinics should use DOCTOR_SCOPED_OWNER, centers can use CLINIC_WIDE.';
COMMENT ON COLUMN public.clinics.settings IS 'Clinic-level configuration and settings stored as JSON.';

-- ============================================================================
-- Summary: Core access control is now via can_access_patient()
-- ============================================================================
COMMENT ON FUNCTION public.is_clinic_member IS 'Helper function to check if a user is an active member of a clinic.';
COMMENT ON FUNCTION public.get_clinic_role IS 'Helper function to get a user''s role within a clinic.';
