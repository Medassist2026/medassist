-- ============================================================================
-- Migration 088 — patient_clinic_records AFTER INSERT audit trigger
-- ============================================================================
--
-- Closes the runtime gap left open by mig 075's backfill-only audit. Mig 075
-- emitted PATIENT_CLINIC_RECORD_CREATED audit rows for every PCR row created
-- at migration time (mig 075.6); mig 074 closed ORPH-V2-11 by relaxing the
-- audit_events.actor_user_id NOT NULL constraint so those system-attributed
-- rows could land. But neither migration installed a trigger or added a
-- runtime audit write, so when resolveIdentityForClinic ->
-- getOrCreatePatientClinicRecord inserts a fresh PCR row at runtime
-- (e.g. via the verify-privacy-code -> D7 unlock flow), no audit row is
-- written.
--
-- The 2026-04-30 D7 manual test (T2.10) caught the regression: Sara's
-- clinic-B PCR row had zero PATIENT_CLINIC_RECORD_CREATED audit rows.
-- See audits/patient-identity-build-04-d7-test-results.md § 3 T2.10 +
-- § 5 outstanding item 1.
--
-- Fix shape: AFTER INSERT trigger on patient_clinic_records that writes
-- one PATIENT_CLINIC_RECORD_CREATED audit row per inserted PCR row.
-- - actor_kind = 'system' (we cannot reliably capture the application-level
--   actor_user_id from a trigger; for user-attributed audit, the data layer
--   would need to write a separate audit row inside resolveIdentityForClinic
--   — out of scope here, see deliverable § 6)
-- - actor_user_id = NULL (required by audit_events_actor_consistency CHECK
--   when actor_kind='system')
-- - entity_type = 'patient_clinic_record', entity_id = NEW.id
-- - clinic_id = NEW.clinic_id (the clinic where the row landed)
-- - metadata.source = 'trigger_pcr_insert' so trigger-written rows are
--   distinguishable from migration_075_backfill rows
--
-- Atomicity: the trigger runs inside the same transaction as the INSERT
-- (default AFTER INSERT semantics in Postgres). If the audit INSERT fails
-- for any reason, the original PCR INSERT rolls back too — matching the
-- application-layer audit invariant from spec § 16.1.
--
-- Idempotency: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS makes
-- re-applying this migration a no-op.
--
-- Scope: patient_clinic_records ONLY. The same gap pattern may exist on
-- global_patients and patient_data_shares, but those are out of scope for
-- this migration.
--
-- Closes: ORPH-V2-11 follow-up (D7 runtime path).
-- Opens: ORPH-V4-D7-04 (Sara's pre-trigger PCR row at clinic B is
--        permanently missing its audit row — not backfilled because
--        forensic timestamps matter more than completeness; decision
--        deferred to Prompt 6.5).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 088.1 — Trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_audit_pcr_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.audit_events (
    action,
    actor_kind,
    actor_user_id,
    clinic_id,
    entity_type,
    entity_id,
    metadata,
    created_at
  ) VALUES (
    'PATIENT_CLINIC_RECORD_CREATED',
    'system',
    NULL,
    NEW.clinic_id,
    'patient_clinic_record',
    NEW.id,
    jsonb_build_object(
      'source', 'trigger_pcr_insert',
      'global_patient_id', NEW.global_patient_id,
      'clinic_id', NEW.clinic_id,
      'first_seen_at', NEW.first_seen_at,
      'last_seen_at', NEW.last_seen_at,
      'is_anonymous_to_global', NEW.is_anonymous_to_global,
      'consent_to_messaging', NEW.consent_to_messaging
    ),
    NOW()
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_audit_pcr_insert() IS
  'AFTER INSERT trigger on patient_clinic_records. Writes a '
  'PATIENT_CLINIC_RECORD_CREATED audit row with actor_kind=system, '
  'actor_user_id=NULL, metadata.source=trigger_pcr_insert. Fires inside '
  'the same transaction as the INSERT — if the audit write fails, the '
  'original INSERT rolls back. The trigger cannot capture the legitimate '
  'application-level actor_user_id; for user-attributed audit, the data '
  'layer would need to add a separate audit write inside '
  'resolveIdentityForClinic. Closes the runtime gap left by mig 075 '
  '(which only emitted audit rows for migration-time bulk inserts) and '
  'caught by the 2026-04-30 D7 manual test (T2.10).';

-- ---------------------------------------------------------------------------
-- 088.2 — Trigger (idempotent: drop + create)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_audit_pcr_insert_trg ON public.patient_clinic_records;

CREATE TRIGGER tg_audit_pcr_insert_trg
  AFTER INSERT ON public.patient_clinic_records
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_audit_pcr_insert();

COMMENT ON TRIGGER tg_audit_pcr_insert_trg ON public.patient_clinic_records IS
  'Catches every INSERT on patient_clinic_records and writes a system-attributed '
  'PATIENT_CLINIC_RECORD_CREATED audit row. Coexists with '
  'patient_clinic_records_touch_updated_at_trg (BEFORE UPDATE) — different '
  'event timing, no conflict.';

-- ---------------------------------------------------------------------------
-- 088.3 — Post-condition assertion
-- ---------------------------------------------------------------------------
-- Confirm the trigger is installed and enabled. Fails loudly otherwise.
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO v_count
    FROM pg_trigger
   WHERE tgrelid = 'public.patient_clinic_records'::regclass
     AND tgname = 'tg_audit_pcr_insert_trg'
     AND tgenabled = 'O'
     AND NOT tgisinternal;
  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'mig 088 post-condition: expected 1 enabled tg_audit_pcr_insert_trg trigger, found %', v_count;
  END IF;
END;
$$;
