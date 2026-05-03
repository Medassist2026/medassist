-- ============================================================
-- mig 092 rollback — undo Prompt 6 Phase B helper functions
-- Date: 2026-04-30
--
-- Drops the 3 NEW helpers introduced by mig 092 and restores the
-- ORIGINAL is_clinic_member body (the one that shipped before
-- Phase B).  is_clinic_member is the only DEFINER helper that
-- existed pre-mig-092 — every other Prompt 6 helper is brand new.
--
-- DO NOT RUN this rollback after Phase C migrations (093+) have
-- shipped — those policies depend on the new helpers and would
-- start returning DENY for every patient-related read.  Roll back
-- 097 → 096 → 095 → 094 → 093 → 092 in order.
-- ============================================================

BEGIN;

-- 1. Restore the pre-mig-092 is_clinic_member body (verbatim from
--    pre-mig-092 staging snapshot — same body, but with the
--    explicit search_path REMOVED to match what existed before).
CREATE OR REPLACE FUNCTION public.is_clinic_member(
  p_clinic_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_memberships
    WHERE clinic_id = p_clinic_id
      AND user_id = p_user_id
      AND status = 'ACTIVE'
  );
$$;

-- 2. Drop the 3 NEW helpers that did not exist before mig 092.
DROP FUNCTION IF EXISTS public.can_clinic_access_global_patient(UUID, UUID);
DROP FUNCTION IF EXISTS public.can_patient_access_global_patient(UUID, UUID);
DROP FUNCTION IF EXISTS public.can_view_patient_data_at_clinic(UUID, UUID, UUID);

COMMIT;

-- Post-rollback assertion
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('can_clinic_access_global_patient','can_patient_access_global_patient','can_view_patient_data_at_clinic')
  ) THEN
    RAISE EXCEPTION 'mig 092 rollback failed: at least one new helper still present';
  END IF;
  RAISE NOTICE 'mig 092 rollback: 3 new helpers dropped, is_clinic_member restored';
END $$;
