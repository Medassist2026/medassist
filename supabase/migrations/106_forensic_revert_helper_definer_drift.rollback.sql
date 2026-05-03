-- ============================================================================
-- Rollback for migration 106 — re-flip both helpers from INVOKER → DEFINER
--
-- Use only if Phase D run #1.5 (post-mig-106) surfaces a RLS regression that
-- traces to one of these helpers running under INVOKER. Restoring DEFINER
-- returns staging to its pre-mig-106 state (matching the mig 094a applied
-- outcome). After rollback, file mig 092's post-condition for
-- can_clinic_access_global_patient (asserts prosecdef = FALSE) will FIRE on
-- any re-apply of mig 092 — that is the exact pre-rollback drift state.
--
-- The COMMENTs are also restored to their pre-mig-106 mig 094a wording so
-- pg_description matches the rollback target.
-- ============================================================================

BEGIN;

ALTER FUNCTION public.can_patient_access_global_patient(uuid, uuid)
  SECURITY DEFINER;

ALTER FUNCTION public.can_clinic_access_global_patient(uuid, uuid)
  SECURITY DEFINER;

COMMENT ON FUNCTION public.can_patient_access_global_patient(uuid, uuid) IS
  'mig 094a: FLIPPED to SECURITY DEFINER. Reads global_patients which has a SELECT policy that recurses through patient_clinic_records — INVOKER would re-enter the calling policy.';

COMMENT ON FUNCTION public.can_clinic_access_global_patient(uuid, uuid) IS
  'mig 094a: FLIPPED to SECURITY DEFINER per uniform-rule. Reads PCR + patient_data_shares — both have policies with cross-table EXISTS that recurse under INVOKER.';

COMMIT;

-- Smoke probe
DO $$
DECLARE
  v_count INT;
  fname TEXT;
BEGIN
  FOREACH fname IN ARRAY ARRAY[
    'can_patient_access_global_patient',
    'can_clinic_access_global_patient'
  ] LOOP
    SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = fname
      AND p.prosecdef = TRUE;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'mig 106 rollback: % is not SECURITY DEFINER after rollback', fname;
    END IF;
  END LOOP;
  RAISE NOTICE 'mig 106 rollback: PASS (both helpers restored to DEFINER)';
END $$;
