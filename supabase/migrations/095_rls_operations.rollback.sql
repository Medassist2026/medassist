-- ============================================================
-- mig 095 rollback — drop the 4 ops-table v2 SELECT policies
-- Pure additive rollback: no legacy policies were touched.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS appointments_select_v2 ON public.appointments;
DROP POLICY IF EXISTS check_in_queue_select_v2 ON public.check_in_queue;
DROP POLICY IF EXISTS payments_select_v2 ON public.payments;
DROP POLICY IF EXISTS doctor_availability_select_v2 ON public.doctor_availability;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND policyname IN ('appointments_select_v2','check_in_queue_select_v2',
                         'payments_select_v2','doctor_availability_select_v2')
  ) THEN
    RAISE EXCEPTION 'mig 095 rollback failed: at least one v2 policy still present';
  END IF;
  RAISE NOTICE 'mig 095 rollback: 4 v2 policies dropped';
END $$;

COMMIT;
