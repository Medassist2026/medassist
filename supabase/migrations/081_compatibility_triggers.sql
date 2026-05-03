-- ============================================================================
-- Migration 081 — Compatibility shim triggers (closes ORPH-V3-02 surface)
--
-- Conceptual name in audits/EXECUTION_PROMPTS.md: mig 077.
--
-- Implements: Build 03 Phase B Step B8.
--
-- WHY THIS MIGRATION EXISTS
--   Mig 080 added global_patient_id + patient_clinic_record_id to 11
--   clinical tables. Application code is being progressively migrated
--   to write through global_patient_id (Step B11 — data layer cutover).
--   Until that cutover is 100% complete, INSERTs may arrive in three
--   shapes:
--     (A) legacy code path: patient_id only
--     (B) new code path: global_patient_id + patient_clinic_record_id only
--     (C) both columns set
--
--   This shim makes all three shapes write CONSISTENT row data:
--     (A) → derive global_patient_id + PCR from patient_id
--     (B) → derive patient_id from (global_patient_id, clinic_id) via
--           the canonical patients row for that pair
--     (C) → verify the two sides agree; RAISE EXCEPTION on mismatch
--           (silent overwrite is the worst possible failure mode here)
--
-- LIFECYCLE
--   These triggers exist UNTIL Prompt 6.5 (Legacy Cleanup), at which
--   point legacy patient_id columns get dropped and the shim becomes
--   unnecessary. Tracked as ORPH-V3-02 with closing prompt 6.5.
--
-- DEPENDS ON:
--   - mig 080 (the new columns exist on all 11 tables).
--
-- WHAT IT ADDS
--   1. tg_derive_patient_global_refs() — generic shim for the 9 tables
--      that have BOTH patient_id and clinic_id.
--   2. tg_derive_lab_results_global_refs() — special for lab_results
--      (no patient_id; derives via lab_order_id → lab_orders).
--   3. tg_derive_patient_phone_history_global_refs() — special for
--      patient_phone_history (no clinic_id; only syncs global_patient_id).
--   4. BEFORE INSERT OR UPDATE triggers on each affected table.
--
-- REVERSIBLE. Companion: 081_compatibility_triggers.rollback.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 081.1 — Generic shim for tables with patient_id + clinic_id +
--          global_patient_id + patient_clinic_record_id columns.
--
-- Applies to: clinical_notes, prescription_items, appointments,
--              lab_orders, imaging_orders, vital_signs,
--              patient_consent_grants, doctor_patient_relationships,
--              patient_visibility (9 tables).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_derive_patient_global_refs()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_derived_global_id UUID;
  v_derived_pcr_id UUID;
  v_derived_patient_id UUID;
BEGIN
  -- ----- Direction 1: legacy code → derive new columns from patient_id.
  IF NEW.patient_id IS NOT NULL THEN
    SELECT p.global_patient_id, pcr.id
      INTO v_derived_global_id, v_derived_pcr_id
      FROM public.patients p
      LEFT JOIN public.patient_clinic_records pcr
        ON pcr.global_patient_id = p.global_patient_id
       AND pcr.clinic_id = p.clinic_id
     WHERE p.id = NEW.patient_id;

    IF v_derived_global_id IS NULL THEN
      RAISE EXCEPTION
        'compat shim (%): patient_id % does not resolve to a global_patient_id. Possible causes: patient deleted, or patient_id pointing at a row that bypassed Build 02 backfill.',
        TG_TABLE_NAME, NEW.patient_id;
    END IF;

    -- Mismatch is fatal — silent overwrite would corrupt cross-references.
    IF NEW.global_patient_id IS NOT NULL
       AND NEW.global_patient_id <> v_derived_global_id THEN
      RAISE EXCEPTION
        'compat shim (%): inconsistent input — patient_id % derives global_patient_id %, but row carries global_patient_id %. Refusing silent overwrite.',
        TG_TABLE_NAME, NEW.patient_id, v_derived_global_id, NEW.global_patient_id;
    END IF;

    NEW.global_patient_id := v_derived_global_id;

    -- PCR derivation: only if patient_clinic_records row exists for the pair.
    IF v_derived_pcr_id IS NOT NULL THEN
      IF NEW.patient_clinic_record_id IS NOT NULL
         AND NEW.patient_clinic_record_id <> v_derived_pcr_id THEN
        RAISE EXCEPTION
          'compat shim (%): inconsistent input — patient_id % derives PCR %, but row carries PCR %. Refusing silent overwrite.',
          TG_TABLE_NAME, NEW.patient_id, v_derived_pcr_id, NEW.patient_clinic_record_id;
      END IF;
      NEW.patient_clinic_record_id := v_derived_pcr_id;
    END IF;

  -- ----- Direction 2: new code → derive patient_id from global_patient_id.
  ELSIF NEW.global_patient_id IS NOT NULL AND NEW.clinic_id IS NOT NULL THEN
    SELECT p.id INTO v_derived_patient_id
      FROM public.patients p
     WHERE p.global_patient_id = NEW.global_patient_id
       AND p.clinic_id = NEW.clinic_id
       AND p.is_canonical = TRUE
     ORDER BY p.created_at ASC
     LIMIT 1;

    IF v_derived_patient_id IS NULL THEN
      RAISE EXCEPTION
        'compat shim (%): global_patient_id % + clinic_id % does not resolve to a canonical patients row. The global patient may not yet have a presence at this clinic — call getOrCreatePatientClinicRecord first.',
        TG_TABLE_NAME, NEW.global_patient_id, NEW.clinic_id;
    END IF;

    NEW.patient_id := v_derived_patient_id;

    -- Derive PCR if caller didn't provide it.
    IF NEW.patient_clinic_record_id IS NULL THEN
      SELECT id INTO NEW.patient_clinic_record_id
        FROM public.patient_clinic_records
       WHERE global_patient_id = NEW.global_patient_id
         AND clinic_id = NEW.clinic_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_derive_patient_global_refs() IS
  'Compatibility shim for clinical tables during the Build 03 → Prompt 6.5 transition. Derives the missing column(s) from whichever side the caller provided. Removed in Prompt 6.5 / Legacy Cleanup (ORPH-V3-02).';

-- ---------------------------------------------------------------------------
-- 081.2 — Attach the generic shim to the 9 standard tables.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_clinical_notes_derive_global_refs ON public.clinical_notes;
CREATE TRIGGER tg_clinical_notes_derive_global_refs
  BEFORE INSERT OR UPDATE ON public.clinical_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_derive_patient_global_refs();

DROP TRIGGER IF EXISTS tg_prescription_items_derive_global_refs ON public.prescription_items;
CREATE TRIGGER tg_prescription_items_derive_global_refs
  BEFORE INSERT OR UPDATE ON public.prescription_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_derive_patient_global_refs();

DROP TRIGGER IF EXISTS tg_appointments_derive_global_refs ON public.appointments;
CREATE TRIGGER tg_appointments_derive_global_refs
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.tg_derive_patient_global_refs();

DROP TRIGGER IF EXISTS tg_lab_orders_derive_global_refs ON public.lab_orders;
CREATE TRIGGER tg_lab_orders_derive_global_refs
  BEFORE INSERT OR UPDATE ON public.lab_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_derive_patient_global_refs();

DROP TRIGGER IF EXISTS tg_imaging_orders_derive_global_refs ON public.imaging_orders;
CREATE TRIGGER tg_imaging_orders_derive_global_refs
  BEFORE INSERT OR UPDATE ON public.imaging_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_derive_patient_global_refs();

DROP TRIGGER IF EXISTS tg_vital_signs_derive_global_refs ON public.vital_signs;
CREATE TRIGGER tg_vital_signs_derive_global_refs
  BEFORE INSERT OR UPDATE ON public.vital_signs
  FOR EACH ROW EXECUTE FUNCTION public.tg_derive_patient_global_refs();

DROP TRIGGER IF EXISTS tg_patient_consent_grants_derive_global_refs ON public.patient_consent_grants;
CREATE TRIGGER tg_patient_consent_grants_derive_global_refs
  BEFORE INSERT OR UPDATE ON public.patient_consent_grants
  FOR EACH ROW EXECUTE FUNCTION public.tg_derive_patient_global_refs();

DROP TRIGGER IF EXISTS tg_doctor_patient_relationships_derive_global_refs ON public.doctor_patient_relationships;
CREATE TRIGGER tg_doctor_patient_relationships_derive_global_refs
  BEFORE INSERT OR UPDATE ON public.doctor_patient_relationships
  FOR EACH ROW EXECUTE FUNCTION public.tg_derive_patient_global_refs();

DROP TRIGGER IF EXISTS tg_patient_visibility_derive_global_refs ON public.patient_visibility;
CREATE TRIGGER tg_patient_visibility_derive_global_refs
  BEFORE INSERT OR UPDATE ON public.patient_visibility
  FOR EACH ROW EXECUTE FUNCTION public.tg_derive_patient_global_refs();

-- ---------------------------------------------------------------------------
-- 081.3 — Special shim for lab_results (chains via lab_order_id).
-- ---------------------------------------------------------------------------
-- lab_results has no patient_id. The legacy code path provides
-- lab_order_id only; the new path provides global_patient_id +
-- patient_clinic_record_id directly. Either way, the values must agree
-- with the parent lab_orders row.
CREATE OR REPLACE FUNCTION public.tg_derive_lab_results_global_refs()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_global UUID;
  v_parent_pcr UUID;
BEGIN
  IF NEW.lab_order_id IS NOT NULL THEN
    SELECT lo.global_patient_id, lo.patient_clinic_record_id
      INTO v_parent_global, v_parent_pcr
      FROM public.lab_orders lo
     WHERE lo.id = NEW.lab_order_id;

    -- Mismatch checks.
    IF NEW.global_patient_id IS NOT NULL
       AND NEW.global_patient_id <> v_parent_global THEN
      RAISE EXCEPTION
        'compat shim (lab_results): inconsistent input — lab_order_id % derives global_patient_id %, but row carries %. Refusing silent overwrite.',
        NEW.lab_order_id, v_parent_global, NEW.global_patient_id;
    END IF;

    IF NEW.patient_clinic_record_id IS NOT NULL
       AND v_parent_pcr IS NOT NULL
       AND NEW.patient_clinic_record_id <> v_parent_pcr THEN
      RAISE EXCEPTION
        'compat shim (lab_results): inconsistent input — lab_order_id % derives PCR %, but row carries PCR %. Refusing silent overwrite.',
        NEW.lab_order_id, v_parent_pcr, NEW.patient_clinic_record_id;
    END IF;

    NEW.global_patient_id := COALESCE(NEW.global_patient_id, v_parent_global);
    NEW.patient_clinic_record_id := COALESCE(NEW.patient_clinic_record_id, v_parent_pcr);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_lab_results_derive_global_refs ON public.lab_results;
CREATE TRIGGER tg_lab_results_derive_global_refs
  BEFORE INSERT OR UPDATE ON public.lab_results
  FOR EACH ROW EXECUTE FUNCTION public.tg_derive_lab_results_global_refs();

-- ---------------------------------------------------------------------------
-- 081.4 — Special shim for patient_phone_history (no clinic_id, no PCR).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_derive_patient_phone_history_global_refs()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_derived_global UUID;
BEGIN
  IF NEW.patient_id IS NOT NULL THEN
    SELECT p.global_patient_id INTO v_derived_global
      FROM public.patients p
     WHERE p.id = NEW.patient_id;

    IF v_derived_global IS NULL THEN
      RAISE EXCEPTION
        'compat shim (patient_phone_history): patient_id % does not resolve to a global_patient_id',
        NEW.patient_id;
    END IF;

    IF NEW.global_patient_id IS NOT NULL
       AND NEW.global_patient_id <> v_derived_global THEN
      RAISE EXCEPTION
        'compat shim (patient_phone_history): inconsistent input — patient_id % derives global_patient_id %, but row carries %. Refusing silent overwrite.',
        NEW.patient_id, v_derived_global, NEW.global_patient_id;
    END IF;

    NEW.global_patient_id := v_derived_global;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_patient_phone_history_derive_global_refs ON public.patient_phone_history;
CREATE TRIGGER tg_patient_phone_history_derive_global_refs
  BEFORE INSERT OR UPDATE ON public.patient_phone_history
  FOR EACH ROW EXECUTE FUNCTION public.tg_derive_patient_phone_history_global_refs();

-- ---------------------------------------------------------------------------
-- 081.5 — DATA_LAYER_CUTOVER_COMPLETE telemetry marker.
-- ---------------------------------------------------------------------------
-- Emitted once when this migration applies cleanly. Closes ORPH-V2-08
-- in the orphan ledger. The data layer code changes (Phase B11) are
-- bundled with this prompt's commit, so by the time this migration
-- runs in production, both the DB triggers and the application reads
-- are in place.
INSERT INTO public.audit_events (
  action, actor_kind, actor_user_id,
  entity_type, entity_id, metadata, created_at
)
VALUES (
  'DATA_LAYER_CUTOVER_COMPLETE',
  'migration',
  NULL,
  'system',
  NULL,
  jsonb_build_object(
    'source', 'migration_081',
    'migrations_applied', jsonb_build_array(
      '074_relax_audit_actor_user_id (mig 073.5)',
      '075_create_patient_clinic_records (mig 074)',
      '076_quarantine_resolution (mig 075)',
      '077_patients_global_patient_id_not_null (mig 075.2)',
      '078_user_dedup_detection (mig 075.5)',
      '079_user_dedup_consumption (mig 075.7)',
      '080_add_global_refs_to_clinical_tables (mig 076)',
      '081_compatibility_triggers (mig 077)'
    ),
    'closes_orphans', jsonb_build_array('ORPH-V2-07', 'ORPH-V2-08', 'ORPH-V2-11')
  ),
  NOW()
);
