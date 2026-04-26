-- ============================================================================
-- Migration 054: Centralized access-control functions
-- ============================================================================
-- Lifts the 3 functions from mig 021 lines 8-112:
--
--   can_access_patient(clinic_id, patient_id, user_id, permission)
--     -> the central authorization predicate. Returns TRUE if the user is
--        an active clinic member AND has READ/WRITE/SHARE access to the
--        patient via clinic_memberships role + patient_visibility grants
--        + (for ASSISTANT/FRONT_DESK) assistant_doctor_assignments scope.
--
--   is_clinic_member(clinic_id, user_id)
--     -> simple existence check on clinic_memberships with status='ACTIVE'.
--        Used by tables that want clinic-scoped access without per-patient
--        gating (e.g. appointments, payments, queue, conversations).
--
--   get_clinic_role(clinic_id, user_id)
--     -> returns the clinic_role enum value or NULL.
--
-- All three are SECURITY DEFINER STABLE: they run with the function-
-- owner's privileges (so they can read clinic_memberships even when
-- called from a context that has RLS on the source tables) and the
-- planner can cache results within a single statement.
--
-- Idempotency: all three use CREATE OR REPLACE. The function bodies are
-- byte-identical with mig 021 lines 8-112; nothing is rewritten.
--
-- Dependencies (audited 2026-04-25):
--   - public.clinic_memberships table with status='ACTIVE' rows
--   - public.patient_visibility seeded by mig 052 (32 rows)
--   - public.assistant_doctor_assignments table (currently 0 rows; that's
--     fine, the function returns FALSE for assistants until grants are
--     created)
--   - clinic_role enum with values OWNER, DOCTOR, ASSISTANT, FRONT_DESK
--   - membership_status enum with value ACTIVE
--   - visibility_mode enum (mig 053) with value CLINIC_WIDE
--   - assignment_scope enum (mig 053) with values PATIENT_DEMOGRAPHICS,
--     FULL_DOCTOR_SUPPORT
--
-- This migration ONLY creates the functions. No policy is rewritten yet
-- (mig 055-065 do that, one table at a time).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- can_access_patient: the central authorization predicate.
-- ----------------------------------------------------------------------------
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
  -- Step 1: must be active member of clinic.
  SELECT role INTO v_membership
  FROM public.clinic_memberships
  WHERE clinic_id = p_clinic_id
    AND user_id = p_user_id
    AND status = 'ACTIVE';

  IF v_membership IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Step 2: OWNER sees all patients in the clinic.
  IF v_membership.role = 'OWNER' THEN
    RETURN TRUE;
  END IF;

  -- Step 3: DOCTOR access via patient_visibility grants.
  IF v_membership.role = 'DOCTOR' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.patient_visibility pv
      WHERE pv.clinic_id = p_clinic_id
        AND pv.patient_id = p_patient_id
        AND (
          (pv.grantee_type = 'DOCTOR' AND pv.grantee_user_id = p_user_id)
          OR pv.mode = 'CLINIC_WIDE'
        )
        AND (pv.expires_at IS NULL OR pv.expires_at > NOW())
    ) INTO v_has_visibility;

    RETURN v_has_visibility;
  END IF;

  -- Step 4: ASSISTANT / FRONT_DESK -> must be assigned to a doctor who
  -- has access to this patient, AND the assignment scope must permit the
  -- requested permission.
  IF v_membership.role IN ('ASSISTANT', 'FRONT_DESK') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.assistant_doctor_assignments ada
      WHERE ada.clinic_id = p_clinic_id
        AND ada.assistant_user_id = p_user_id
        AND ada.status = 'ACTIVE'
        AND (
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

COMMENT ON FUNCTION public.can_access_patient IS
  'Centralized patient access control. Checks clinic membership, role, visibility grants, and assistant scope.';

-- ----------------------------------------------------------------------------
-- is_clinic_member: existence check on clinic_memberships.
-- ----------------------------------------------------------------------------
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

COMMENT ON FUNCTION public.is_clinic_member IS
  'Helper function to check if a user is an active member of a clinic.';

-- ----------------------------------------------------------------------------
-- get_clinic_role: lookup helper.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_clinic_role(
  p_clinic_id UUID,
  p_user_id UUID
) RETURNS clinic_role AS $$
  SELECT role FROM public.clinic_memberships
  WHERE clinic_id = p_clinic_id
    AND user_id = p_user_id
    AND status = 'ACTIVE';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.get_clinic_role IS
  'Helper function to get a user''s role within a clinic.';

-- ============================================================================
-- Post-migration smoke tests (run manually after apply_migration):
--
-- All three should return predictable booleans for known users. Naser:
--   - OWNER of clinic 298866c7-87b7-4405-9487-c7174bafaf99
--   - DOCTOR of clinic 8d27729f-9f9b-426a-aa48-cc16a419559a
--
--   -- Naser as OWNER -> TRUE for any patient in clinic 298866c7.
--   SELECT public.can_access_patient(
--     '298866c7-87b7-4405-9487-c7174bafaf99'::uuid,
--     (SELECT id FROM public.patients WHERE clinic_id='298866c7-87b7-4405-9487-c7174bafaf99' LIMIT 1),
--     '619a7fdd-45a1-49b5-aed2-fbada918b232'::uuid,
--     'READ'
--   );  -- expect TRUE
--
--   -- Naser as DOCTOR in clinic 8d27729f -> only TRUE if a
--   -- patient_visibility grant exists for him there.
--   SELECT public.can_access_patient(
--     '8d27729f-9f9b-426a-aa48-cc16a419559a'::uuid,
--     (SELECT id FROM public.patients WHERE clinic_id='8d27729f-9f9b-426a-aa48-cc16a419559a' LIMIT 1),
--     '619a7fdd-45a1-49b5-aed2-fbada918b232'::uuid,
--     'READ'
--   );  -- TRUE iff a pv row binds Naser to that patient.
--
--   -- Stranger doctor (not a member of clinic 298866c7) -> FALSE.
--   SELECT public.can_access_patient(
--     '298866c7-87b7-4405-9487-c7174bafaf99'::uuid,
--     (SELECT id FROM public.patients WHERE clinic_id='298866c7-87b7-4405-9487-c7174bafaf99' LIMIT 1),
--     'c982eabc-ed1d-409f-90e4-b135fcf945e6'::uuid,  -- doctor at الدقي/شلبي
--     'READ'
--   );  -- expect FALSE
--
--   -- is_clinic_member sanity
--   SELECT public.is_clinic_member(
--     '298866c7-87b7-4405-9487-c7174bafaf99'::uuid,
--     '619a7fdd-45a1-49b5-aed2-fbada918b232'::uuid
--   );  -- expect TRUE
--
--   -- get_clinic_role sanity
--   SELECT public.get_clinic_role(
--     '298866c7-87b7-4405-9487-c7174bafaf99'::uuid,
--     '619a7fdd-45a1-49b5-aed2-fbada918b232'::uuid
--   );  -- expect 'OWNER'
-- ============================================================================
