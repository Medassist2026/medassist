-- ============================================================
-- mig 096 rollback — drop audit_events generated column + 2 v2 policies
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS audit_events_clinic_member_select_v2 ON public.audit_events;
DROP POLICY IF EXISTS audit_events_patient_self_select_v2 ON public.audit_events;

DROP INDEX IF EXISTS public.idx_audit_events_resolved_gpid;

ALTER TABLE public.audit_events
  DROP COLUMN IF EXISTS resolved_global_patient_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_events'
      AND column_name='resolved_global_patient_id'
  ) THEN
    RAISE EXCEPTION 'mig 096 rollback failed: resolved_global_patient_id column still present';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND policyname IN ('audit_events_clinic_member_select_v2','audit_events_patient_self_select_v2')
  ) THEN
    RAISE EXCEPTION 'mig 096 rollback failed: at least one v2 policy still present';
  END IF;
  RAISE NOTICE 'mig 096 rollback: column + index + 2 policies dropped';
END $$;

COMMIT;
