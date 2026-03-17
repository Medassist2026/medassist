-- ============================================================================
-- Migration 018: Clinic Memberships (Unified RBAC)
-- Replaces clinic_doctors and front_desk_staff.clinic_id with a single
-- membership table. This is the gate for all clinic access.
-- ============================================================================

-- Create membership roles enum type
DO $$ BEGIN
  CREATE TYPE clinic_role AS ENUM ('OWNER', 'DOCTOR', 'ASSISTANT', 'FRONT_DESK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE membership_status AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The core RBAC table
CREATE TABLE IF NOT EXISTS public.clinic_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role clinic_role NOT NULL DEFAULT 'DOCTOR',
  status membership_status NOT NULL DEFAULT 'ACTIVE',
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_clinic ON public.clinic_memberships(clinic_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON public.clinic_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_role ON public.clinic_memberships(role);
CREATE INDEX IF NOT EXISTS idx_memberships_active ON public.clinic_memberships(clinic_id, status) WHERE status = 'ACTIVE';

-- Enable RLS
ALTER TABLE public.clinic_memberships ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Members can view clinic memberships" ON public.clinic_memberships;
DROP POLICY IF EXISTS "Owners can manage memberships" ON public.clinic_memberships;
DROP POLICY IF EXISTS "Owners can update memberships" ON public.clinic_memberships;

-- Members can see other members in their clinic
CREATE POLICY "Members can view clinic memberships"
ON public.clinic_memberships FOR SELECT
USING (
  clinic_id IN (
    SELECT cm.clinic_id FROM public.clinic_memberships cm
    WHERE cm.user_id = auth.uid() AND cm.status = 'ACTIVE'
  )
);

-- Only OWNER can insert memberships
CREATE POLICY "Owners can manage memberships"
ON public.clinic_memberships FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.clinic_id = clinic_memberships.clinic_id
    AND cm.user_id = auth.uid()
    AND cm.role = 'OWNER'
    AND cm.status = 'ACTIVE'
  )
  OR NOT EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.clinic_id = clinic_memberships.clinic_id
  )
);

-- Only OWNER can update memberships
CREATE POLICY "Owners can update memberships"
ON public.clinic_memberships FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.clinic_id = clinic_memberships.clinic_id
    AND cm.user_id = auth.uid()
    AND cm.role = 'OWNER'
    AND cm.status = 'ACTIVE'
  )
);

-- Migrate data from clinic_doctors (if table exists)
INSERT INTO public.clinic_memberships (clinic_id, user_id, role, status, created_at)
SELECT
  cd.clinic_id,
  cd.doctor_id,
  CASE
    WHEN cd.role = 'frontdesk' THEN 'FRONT_DESK'::clinic_role
    ELSE 'DOCTOR'::clinic_role
  END,
  'ACTIVE'::membership_status,
  COALESCE(cd.created_at, NOW())
FROM public.clinic_doctors cd
ON CONFLICT (clinic_id, user_id) DO NOTHING;

-- Migrate front_desk_staff (if table and clinic_id column exists)
INSERT INTO public.clinic_memberships (clinic_id, user_id, role, status, created_at)
SELECT
  fds.clinic_id,
  fds.id,
  'FRONT_DESK'::clinic_role,
  'ACTIVE'::membership_status,
  COALESCE(fds.created_at, NOW())
FROM public.front_desk_staff fds
WHERE fds.clinic_id IS NOT NULL
ON CONFLICT (clinic_id, user_id) DO NOTHING;

-- Set the first doctor in each clinic as OWNER (if not already an owner)
UPDATE public.clinic_memberships cm1
SET role = 'OWNER'
WHERE cm1.id IN (
  SELECT DISTINCT ON (clinic_id) id
  FROM public.clinic_memberships
  WHERE role = 'DOCTOR'
    AND clinic_id NOT IN (
      SELECT clinic_id FROM public.clinic_memberships
      WHERE role = 'OWNER'
    )
  ORDER BY clinic_id, created_at ASC
);

COMMENT ON TABLE public.clinic_memberships IS 'Unified RBAC: every user access to a clinic goes through this table. Replaces clinic_doctors and front_desk_staff.clinic_id.';
