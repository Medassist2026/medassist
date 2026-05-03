-- mig 097 rollback — drop 3 v2 policies. Pure additive rollback.

BEGIN;

DROP POLICY IF EXISTS clinics_select_v2 ON public.clinics;
DROP POLICY IF EXISTS users_select_clinic_colleagues_v2 ON public.users;
DROP POLICY IF EXISTS doctors_select_authenticated_v2 ON public.doctors;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND policyname IN ('clinics_select_v2','users_select_clinic_colleagues_v2','doctors_select_authenticated_v2')
  ) THEN
    RAISE EXCEPTION 'mig 097 rollback failed: at least one v2 policy still present';
  END IF;
  RAISE NOTICE 'mig 097 rollback: 3 v2 policies dropped';
END $$;

COMMIT;
