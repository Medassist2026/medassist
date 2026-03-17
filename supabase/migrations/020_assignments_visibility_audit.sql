-- ============================================================================
-- Migration 020: Assistant Assignments, Patient Visibility, Audit Events
-- ============================================================================

-- === ASSISTANT DOCTOR ASSIGNMENTS ===

DO $$ BEGIN
  CREATE TYPE assignment_scope AS ENUM ('APPOINTMENTS_ONLY', 'PATIENT_DEMOGRAPHICS', 'FULL_DOCTOR_SUPPORT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE assignment_status AS ENUM ('ACTIVE', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.assistant_doctor_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  assistant_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  doctor_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scope assignment_scope NOT NULL DEFAULT 'APPOINTMENTS_ONLY',
  status assignment_status NOT NULL DEFAULT 'ACTIVE',
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, assistant_user_id, doctor_user_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_clinic ON public.assistant_doctor_assignments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_assignments_assistant ON public.assistant_doctor_assignments(assistant_user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_doctor ON public.assistant_doctor_assignments(doctor_user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_active ON public.assistant_doctor_assignments(clinic_id, assistant_user_id) WHERE status = 'ACTIVE';

-- Drop existing RLS policies if they exist
DROP POLICY IF EXISTS "Members can view assignments" ON public.assistant_doctor_assignments;
DROP POLICY IF EXISTS "Clinic members can view assignments" ON public.assistant_doctor_assignments;
DROP POLICY IF EXISTS "Owners and doctors can manage assignments" ON public.assistant_doctor_assignments;
DROP POLICY IF EXISTS "Owners and doctors can update assignments" ON public.assistant_doctor_assignments;

ALTER TABLE public.assistant_doctor_assignments ENABLE ROW LEVEL SECURITY;

-- Members of the clinic can view assignments
CREATE POLICY "Clinic members can view assignments"
ON public.assistant_doctor_assignments FOR SELECT
USING (
  clinic_id IN (
    SELECT cm.clinic_id FROM public.clinic_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.status = 'ACTIVE'
  )
);

-- Only OWNER or the doctor can create assignments
CREATE POLICY "Owners and doctors can manage assignments"
ON public.assistant_doctor_assignments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.clinic_id = assistant_doctor_assignments.clinic_id
    AND cm.user_id = auth.uid()
    AND cm.status = 'ACTIVE'
    AND (cm.role = 'OWNER' OR cm.user_id = assistant_doctor_assignments.doctor_user_id)
  )
);

-- Only OWNER or the doctor can modify assignments
CREATE POLICY "Owners and doctors can update assignments"
ON public.assistant_doctor_assignments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.clinic_id = assistant_doctor_assignments.clinic_id
    AND cm.user_id = auth.uid()
    AND cm.status = 'ACTIVE'
    AND (cm.role = 'OWNER' OR cm.user_id = assistant_doctor_assignments.doctor_user_id)
  )
);

COMMENT ON TABLE public.assistant_doctor_assignments IS 'Links assistants/front-desk to specific doctors within a clinic. Defines what operations they can perform (scope).';

-- === PATIENT VISIBILITY (Permission Matrix Engine) ===

DO $$ BEGIN
  CREATE TYPE visibility_mode AS ENUM ('DOCTOR_SCOPED_OWNER', 'CLINIC_WIDE', 'SHARED_BY_CONSENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE consent_type AS ENUM ('IMPLICIT_CLINIC_POLICY', 'DOCTOR_TO_DOCTOR_TRANSFER', 'PATIENT_CONSENT_CODE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.patient_visibility (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  grantee_type TEXT NOT NULL CHECK (grantee_type IN ('DOCTOR', 'ROLE')),
  grantee_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  mode visibility_mode NOT NULL DEFAULT 'DOCTOR_SCOPED_OWNER',
  consent consent_type NOT NULL DEFAULT 'IMPLICIT_CLINIC_POLICY',
  granted_by_user_id UUID REFERENCES public.users(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visibility_clinic_patient ON public.patient_visibility(clinic_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_visibility_grantee ON public.patient_visibility(grantee_user_id);
CREATE INDEX IF NOT EXISTS idx_visibility_mode ON public.patient_visibility(clinic_id, mode);

-- Drop existing RLS policies if they exist
DROP POLICY IF EXISTS "Clinic members can view visibility" ON public.patient_visibility;
DROP POLICY IF EXISTS "Doctors and owners can manage visibility" ON public.patient_visibility;

ALTER TABLE public.patient_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinic members can view visibility"
ON public.patient_visibility FOR SELECT
USING (
  clinic_id IN (
    SELECT cm.clinic_id FROM public.clinic_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.status = 'ACTIVE'
  )
);

CREATE POLICY "Doctors and owners can manage visibility"
ON public.patient_visibility FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.clinic_id = patient_visibility.clinic_id
    AND cm.user_id = auth.uid()
    AND cm.status = 'ACTIVE'
    AND cm.role IN ('OWNER', 'DOCTOR')
  )
);

COMMENT ON TABLE public.patient_visibility IS 'Controls who can see which patients within a clinic. Supports doctor-scoped, clinic-wide, and consent-based sharing.';

-- Seed initial visibility from existing doctor_patient_relationships
-- Default: DOCTOR_SCOPED_OWNER for all existing relationships
INSERT INTO public.patient_visibility (clinic_id, patient_id, grantee_type, grantee_user_id, mode, consent)
SELECT DISTINCT
  COALESCE(dpr.clinic_id, (
    SELECT DISTINCT cm.clinic_id
    FROM public.clinic_memberships cm
    WHERE cm.user_id = dpr.doctor_id
    AND cm.status = 'ACTIVE'
    LIMIT 1
  )),
  dpr.patient_id,
  'DOCTOR',
  dpr.doctor_id,
  'DOCTOR_SCOPED_OWNER'::visibility_mode,
  'IMPLICIT_CLINIC_POLICY'::consent_type
FROM public.doctor_patient_relationships dpr
WHERE COALESCE(dpr.clinic_id, (
    SELECT DISTINCT cm.clinic_id
    FROM public.clinic_memberships cm
    WHERE cm.user_id = dpr.doctor_id
    AND cm.status = 'ACTIVE'
    LIMIT 1
  )) IS NOT NULL
  AND dpr.status = 'active'
ON CONFLICT DO NOTHING;

-- === AUDIT EVENTS (Medical-Grade Logging) ===

CREATE TABLE IF NOT EXISTS public.audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  actor_user_id UUID NOT NULL REFERENCES public.users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_clinic ON public.audit_events(clinic_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_events(created_at DESC);

-- Drop existing RLS policies if they exist
DROP POLICY IF EXISTS "Owners can view audit events" ON public.audit_events;
DROP POLICY IF EXISTS "System can insert audit events" ON public.audit_events;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Only clinic owners can view audit logs
CREATE POLICY "Owners can view audit events"
ON public.audit_events FOR SELECT
USING (
  clinic_id IN (
    SELECT cm.clinic_id FROM public.clinic_memberships cm
    WHERE cm.user_id = auth.uid()
    AND cm.status = 'ACTIVE'
    AND cm.role = 'OWNER'
  )
);

-- Anyone can insert (via app code with admin client)
CREATE POLICY "System can insert audit events"
ON public.audit_events FOR INSERT
WITH CHECK (true);

COMMENT ON TABLE public.audit_events IS 'Medical-grade audit logging. Tracks all data access, modifications, sharing, and consent changes.';
