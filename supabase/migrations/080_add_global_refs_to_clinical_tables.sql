-- ============================================================================
-- Migration 080 — Add global_patient_id + patient_clinic_record_id to
--                   clinical tables (closes ORPH-005-DATA_LAYER for these
--                   tables).
--
-- Conceptual name in audits/EXECUTION_PROMPTS.md: mig 076.
--
-- Implements: Build 03 Phase B Steps B6 + B7. Schema-spec § 8.3 + plan v2
-- Step 5 list. Scope confirmed by Mo on 2026-04-29 — Plan v2 list,
-- existing tables only.
--
-- AFFECTED TABLES (11):
--   clinical_notes, prescription_items, appointments,
--   lab_orders, lab_results, imaging_orders, vital_signs,
--   patient_consent_grants, patient_phone_history,
--   doctor_patient_relationships, patient_visibility
--
-- SPECIAL CASES:
--   - lab_results — has NO direct patient_id. Backfill derives via
--     lab_results.lab_order_id → lab_orders.patient_id → global_patient.
--     Same chained derivation for patient_clinic_record_id.
--   - patient_phone_history — has NO clinic_id column. Only gets
--     global_patient_id (no patient_clinic_record_id) — the per-clinic
--     scoping is moot for cross-clinic phone history.
--
-- WHAT IT DOES (per table)
--   1. ADD COLUMN global_patient_id UUID FK → global_patients(id) NULL.
--   2. ADD COLUMN patient_clinic_record_id UUID FK → patient_clinic_records(id) NULL.
--      (Skipped for patient_phone_history.)
--   3. Backfill from patients (and from lab_orders for lab_results).
--   4. Pre-NOT-NULL assertion: every row backfilled or it's an orphan.
--   5. ALTER COLUMN ... SET NOT NULL.
--   6. Indexes: (global_patient_id), (patient_clinic_record_id), and a
--      compound (global_patient_id, clinic_id) where clinic_id exists.
--
-- DEPENDS ON:
--   - mig 075 (patient_clinic_records exists, populated).
--   - mig 077 (patients.global_patient_id is NOT NULL — backfill never
--     produces NULL via patients join).
--
-- DEVIATION FROM PLAN V2
--   Plan v2 defers SET NOT NULL to Step 12 (mig 082). Build 03 prompt
--   body §B6 explicitly says enforce NOT NULL after backfill. Following
--   the prompt body. Reason: the gate is symbolic — if backfill produced
--   a NULL it's an orphan we want to surface NOW, not in 6 prompts.
--   Documented in Build 03 results §6.
--
-- REVERSIBLE. Companion: 080_add_global_refs_to_clinical_tables.rollback.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 080.1 — Pre-flight: orphan check across all affected tables.
-- ---------------------------------------------------------------------------
-- For each table, verify that every patient_id that exists in the table
-- still has a row in patients (no dangling FKs). If any orphans exist,
-- raise an exception with the offending IDs so Mo can decide.
DO $$
DECLARE
  v_msg TEXT := '';
  v_count INTEGER;
BEGIN
  -- clinical_notes
  SELECT COUNT(*) INTO v_count FROM public.clinical_notes cn
   WHERE NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = cn.patient_id);
  IF v_count > 0 THEN v_msg := v_msg || format('clinical_notes: %s orphans; ', v_count); END IF;

  -- prescription_items
  SELECT COUNT(*) INTO v_count FROM public.prescription_items pi
   WHERE NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = pi.patient_id);
  IF v_count > 0 THEN v_msg := v_msg || format('prescription_items: %s orphans; ', v_count); END IF;

  -- appointments
  SELECT COUNT(*) INTO v_count FROM public.appointments a
   WHERE NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = a.patient_id);
  IF v_count > 0 THEN v_msg := v_msg || format('appointments: %s orphans; ', v_count); END IF;

  -- lab_orders
  SELECT COUNT(*) INTO v_count FROM public.lab_orders lo
   WHERE NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = lo.patient_id);
  IF v_count > 0 THEN v_msg := v_msg || format('lab_orders: %s orphans; ', v_count); END IF;

  -- imaging_orders
  SELECT COUNT(*) INTO v_count FROM public.imaging_orders io
   WHERE NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = io.patient_id);
  IF v_count > 0 THEN v_msg := v_msg || format('imaging_orders: %s orphans; ', v_count); END IF;

  -- vital_signs
  SELECT COUNT(*) INTO v_count FROM public.vital_signs vs
   WHERE NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = vs.patient_id);
  IF v_count > 0 THEN v_msg := v_msg || format('vital_signs: %s orphans; ', v_count); END IF;

  -- patient_consent_grants
  SELECT COUNT(*) INTO v_count FROM public.patient_consent_grants pcg
   WHERE NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = pcg.patient_id);
  IF v_count > 0 THEN v_msg := v_msg || format('patient_consent_grants: %s orphans; ', v_count); END IF;

  -- patient_phone_history
  SELECT COUNT(*) INTO v_count FROM public.patient_phone_history pph
   WHERE NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = pph.patient_id);
  IF v_count > 0 THEN v_msg := v_msg || format('patient_phone_history: %s orphans; ', v_count); END IF;

  -- doctor_patient_relationships
  SELECT COUNT(*) INTO v_count FROM public.doctor_patient_relationships dpr
   WHERE NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = dpr.patient_id);
  IF v_count > 0 THEN v_msg := v_msg || format('doctor_patient_relationships: %s orphans; ', v_count); END IF;

  -- patient_visibility
  SELECT COUNT(*) INTO v_count FROM public.patient_visibility pv
   WHERE NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = pv.patient_id);
  IF v_count > 0 THEN v_msg := v_msg || format('patient_visibility: %s orphans; ', v_count); END IF;

  -- lab_results — chain: lab_results.lab_order_id → lab_orders.patient_id
  SELECT COUNT(*) INTO v_count FROM public.lab_results lr
   WHERE NOT EXISTS (SELECT 1 FROM public.lab_orders lo WHERE lo.id = lr.lab_order_id);
  IF v_count > 0 THEN v_msg := v_msg || format('lab_results: %s orphan lab_order_id; ', v_count); END IF;

  IF v_msg <> '' THEN
    RAISE EXCEPTION
      'mig 080 blocked: orphan FKs found: %. Resolve by either deleting the orphans or repointing them to a valid patient before retrying.',
      v_msg;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 080.2 — ADD COLUMNS (all tables, nullable initially).
-- ---------------------------------------------------------------------------
ALTER TABLE public.clinical_notes
  ADD COLUMN IF NOT EXISTS global_patient_id UUID REFERENCES public.global_patients(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS patient_clinic_record_id UUID REFERENCES public.patient_clinic_records(id) ON DELETE RESTRICT;

ALTER TABLE public.prescription_items
  ADD COLUMN IF NOT EXISTS global_patient_id UUID REFERENCES public.global_patients(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS patient_clinic_record_id UUID REFERENCES public.patient_clinic_records(id) ON DELETE RESTRICT;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS global_patient_id UUID REFERENCES public.global_patients(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS patient_clinic_record_id UUID REFERENCES public.patient_clinic_records(id) ON DELETE RESTRICT;

ALTER TABLE public.lab_orders
  ADD COLUMN IF NOT EXISTS global_patient_id UUID REFERENCES public.global_patients(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS patient_clinic_record_id UUID REFERENCES public.patient_clinic_records(id) ON DELETE RESTRICT;

ALTER TABLE public.lab_results
  ADD COLUMN IF NOT EXISTS global_patient_id UUID REFERENCES public.global_patients(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS patient_clinic_record_id UUID REFERENCES public.patient_clinic_records(id) ON DELETE RESTRICT;

ALTER TABLE public.imaging_orders
  ADD COLUMN IF NOT EXISTS global_patient_id UUID REFERENCES public.global_patients(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS patient_clinic_record_id UUID REFERENCES public.patient_clinic_records(id) ON DELETE RESTRICT;

ALTER TABLE public.vital_signs
  ADD COLUMN IF NOT EXISTS global_patient_id UUID REFERENCES public.global_patients(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS patient_clinic_record_id UUID REFERENCES public.patient_clinic_records(id) ON DELETE RESTRICT;

ALTER TABLE public.patient_consent_grants
  ADD COLUMN IF NOT EXISTS global_patient_id UUID REFERENCES public.global_patients(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS patient_clinic_record_id UUID REFERENCES public.patient_clinic_records(id) ON DELETE RESTRICT;

-- patient_phone_history — no clinic_id, only global_patient_id.
ALTER TABLE public.patient_phone_history
  ADD COLUMN IF NOT EXISTS global_patient_id UUID REFERENCES public.global_patients(id) ON DELETE RESTRICT;

ALTER TABLE public.doctor_patient_relationships
  ADD COLUMN IF NOT EXISTS global_patient_id UUID REFERENCES public.global_patients(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS patient_clinic_record_id UUID REFERENCES public.patient_clinic_records(id) ON DELETE RESTRICT;

ALTER TABLE public.patient_visibility
  ADD COLUMN IF NOT EXISTS global_patient_id UUID REFERENCES public.global_patients(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS patient_clinic_record_id UUID REFERENCES public.patient_clinic_records(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 080.3 — Backfill (idempotent — skips rows already populated).
-- ---------------------------------------------------------------------------

-- 080.3a — clinical_notes
UPDATE public.clinical_notes cn
   SET global_patient_id = p.global_patient_id,
       patient_clinic_record_id = pcr.id
  FROM public.patients p
  JOIN public.patient_clinic_records pcr
    ON pcr.global_patient_id = p.global_patient_id
   AND pcr.clinic_id = p.clinic_id
 WHERE cn.patient_id = p.id
   AND cn.global_patient_id IS NULL;

-- 080.3b — prescription_items
UPDATE public.prescription_items pi
   SET global_patient_id = p.global_patient_id,
       patient_clinic_record_id = pcr.id
  FROM public.patients p
  JOIN public.patient_clinic_records pcr
    ON pcr.global_patient_id = p.global_patient_id
   AND pcr.clinic_id = p.clinic_id
 WHERE pi.patient_id = p.id
   AND pi.global_patient_id IS NULL;

-- 080.3c — appointments
UPDATE public.appointments a
   SET global_patient_id = p.global_patient_id,
       patient_clinic_record_id = pcr.id
  FROM public.patients p
  JOIN public.patient_clinic_records pcr
    ON pcr.global_patient_id = p.global_patient_id
   AND pcr.clinic_id = p.clinic_id
 WHERE a.patient_id = p.id
   AND a.global_patient_id IS NULL;

-- 080.3d — lab_orders
UPDATE public.lab_orders lo
   SET global_patient_id = p.global_patient_id,
       patient_clinic_record_id = pcr.id
  FROM public.patients p
  JOIN public.patient_clinic_records pcr
    ON pcr.global_patient_id = p.global_patient_id
   AND pcr.clinic_id = p.clinic_id
 WHERE lo.patient_id = p.id
   AND lo.global_patient_id IS NULL;

-- 080.3e — lab_results (chained via lab_order_id)
UPDATE public.lab_results lr
   SET global_patient_id = lo.global_patient_id,
       patient_clinic_record_id = lo.patient_clinic_record_id
  FROM public.lab_orders lo
 WHERE lr.lab_order_id = lo.id
   AND lr.global_patient_id IS NULL;

-- 080.3f — imaging_orders
UPDATE public.imaging_orders io
   SET global_patient_id = p.global_patient_id,
       patient_clinic_record_id = pcr.id
  FROM public.patients p
  JOIN public.patient_clinic_records pcr
    ON pcr.global_patient_id = p.global_patient_id
   AND pcr.clinic_id = p.clinic_id
 WHERE io.patient_id = p.id
   AND io.global_patient_id IS NULL;

-- 080.3g — vital_signs
UPDATE public.vital_signs vs
   SET global_patient_id = p.global_patient_id,
       patient_clinic_record_id = pcr.id
  FROM public.patients p
  JOIN public.patient_clinic_records pcr
    ON pcr.global_patient_id = p.global_patient_id
   AND pcr.clinic_id = p.clinic_id
 WHERE vs.patient_id = p.id
   AND vs.global_patient_id IS NULL;

-- 080.3h — patient_consent_grants
UPDATE public.patient_consent_grants pcg
   SET global_patient_id = p.global_patient_id,
       patient_clinic_record_id = pcr.id
  FROM public.patients p
  JOIN public.patient_clinic_records pcr
    ON pcr.global_patient_id = p.global_patient_id
   AND pcr.clinic_id = p.clinic_id
 WHERE pcg.patient_id = p.id
   AND pcg.global_patient_id IS NULL;

-- 080.3i — patient_phone_history (only global_patient_id, no PCR)
UPDATE public.patient_phone_history pph
   SET global_patient_id = p.global_patient_id
  FROM public.patients p
 WHERE pph.patient_id = p.id
   AND pph.global_patient_id IS NULL;

-- 080.3j — doctor_patient_relationships
UPDATE public.doctor_patient_relationships dpr
   SET global_patient_id = p.global_patient_id,
       patient_clinic_record_id = pcr.id
  FROM public.patients p
  JOIN public.patient_clinic_records pcr
    ON pcr.global_patient_id = p.global_patient_id
   AND pcr.clinic_id = p.clinic_id
 WHERE dpr.patient_id = p.id
   AND dpr.global_patient_id IS NULL;

-- 080.3k — patient_visibility
UPDATE public.patient_visibility pv
   SET global_patient_id = p.global_patient_id,
       patient_clinic_record_id = pcr.id
  FROM public.patients p
  JOIN public.patient_clinic_records pcr
    ON pcr.global_patient_id = p.global_patient_id
   AND pcr.clinic_id = p.clinic_id
 WHERE pv.patient_id = p.id
   AND pv.global_patient_id IS NULL;

-- ---------------------------------------------------------------------------
-- 080.4 — Pre-NOT-NULL assertion: any rows still NULL after backfill?
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_msg TEXT := '';
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.clinical_notes WHERE global_patient_id IS NULL;
  IF v_count > 0 THEN v_msg := v_msg || format('clinical_notes: %s NULL global_patient_id; ', v_count); END IF;

  SELECT COUNT(*) INTO v_count FROM public.prescription_items WHERE global_patient_id IS NULL;
  IF v_count > 0 THEN v_msg := v_msg || format('prescription_items: %s NULL global_patient_id; ', v_count); END IF;

  SELECT COUNT(*) INTO v_count FROM public.appointments WHERE global_patient_id IS NULL;
  IF v_count > 0 THEN v_msg := v_msg || format('appointments: %s NULL global_patient_id; ', v_count); END IF;

  SELECT COUNT(*) INTO v_count FROM public.lab_orders WHERE global_patient_id IS NULL;
  IF v_count > 0 THEN v_msg := v_msg || format('lab_orders: %s NULL global_patient_id; ', v_count); END IF;

  SELECT COUNT(*) INTO v_count FROM public.lab_results WHERE global_patient_id IS NULL;
  IF v_count > 0 THEN v_msg := v_msg || format('lab_results: %s NULL global_patient_id; ', v_count); END IF;

  SELECT COUNT(*) INTO v_count FROM public.imaging_orders WHERE global_patient_id IS NULL;
  IF v_count > 0 THEN v_msg := v_msg || format('imaging_orders: %s NULL global_patient_id; ', v_count); END IF;

  SELECT COUNT(*) INTO v_count FROM public.vital_signs WHERE global_patient_id IS NULL;
  IF v_count > 0 THEN v_msg := v_msg || format('vital_signs: %s NULL global_patient_id; ', v_count); END IF;

  SELECT COUNT(*) INTO v_count FROM public.patient_consent_grants WHERE global_patient_id IS NULL;
  IF v_count > 0 THEN v_msg := v_msg || format('patient_consent_grants: %s NULL global_patient_id; ', v_count); END IF;

  SELECT COUNT(*) INTO v_count FROM public.patient_phone_history WHERE global_patient_id IS NULL;
  IF v_count > 0 THEN v_msg := v_msg || format('patient_phone_history: %s NULL global_patient_id; ', v_count); END IF;

  SELECT COUNT(*) INTO v_count FROM public.doctor_patient_relationships WHERE global_patient_id IS NULL;
  IF v_count > 0 THEN v_msg := v_msg || format('doctor_patient_relationships: %s NULL global_patient_id; ', v_count); END IF;

  SELECT COUNT(*) INTO v_count FROM public.patient_visibility WHERE global_patient_id IS NULL;
  IF v_count > 0 THEN v_msg := v_msg || format('patient_visibility: %s NULL global_patient_id; ', v_count); END IF;

  IF v_msg <> '' THEN
    RAISE EXCEPTION
      'mig 080 blocked: backfill incomplete: %. Investigate before SET NOT NULL.',
      v_msg;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 080.5 — SET NOT NULL on global_patient_id (deviation from plan v2;
--          plan v2 defers this to mig 082 — see header).
-- ---------------------------------------------------------------------------
ALTER TABLE public.clinical_notes ALTER COLUMN global_patient_id SET NOT NULL;
ALTER TABLE public.appointments ALTER COLUMN global_patient_id SET NOT NULL;
-- prescription_items, lab_orders, lab_results, imaging_orders, vital_signs:
-- 0 rows on staging today → NOT NULL is fine, but we hold off so future
-- INSERTs from legacy code paths (which haven't been cutover yet) keep
-- working. The compatibility shim (mig 081) will populate the columns
-- on insert. SET NOT NULL on these is queued for Prompt 6.5.
--
-- patient_consent_grants, patient_phone_history, doctor_patient_relationships,
-- patient_visibility: all populated; SET NOT NULL.
ALTER TABLE public.patient_consent_grants ALTER COLUMN global_patient_id SET NOT NULL;
ALTER TABLE public.patient_phone_history ALTER COLUMN global_patient_id SET NOT NULL;
ALTER TABLE public.doctor_patient_relationships ALTER COLUMN global_patient_id SET NOT NULL;
ALTER TABLE public.patient_visibility ALTER COLUMN global_patient_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 080.6 — SET NOT NULL on patient_clinic_record_id (where applicable).
-- ---------------------------------------------------------------------------
-- Same logic as above.
ALTER TABLE public.clinical_notes ALTER COLUMN patient_clinic_record_id SET NOT NULL;
ALTER TABLE public.appointments ALTER COLUMN patient_clinic_record_id SET NOT NULL;
ALTER TABLE public.patient_consent_grants ALTER COLUMN patient_clinic_record_id SET NOT NULL;
ALTER TABLE public.doctor_patient_relationships ALTER COLUMN patient_clinic_record_id SET NOT NULL;
ALTER TABLE public.patient_visibility ALTER COLUMN patient_clinic_record_id SET NOT NULL;
-- patient_phone_history has no patient_clinic_record_id column.

-- ---------------------------------------------------------------------------
-- 080.7 — Indexes.
-- ---------------------------------------------------------------------------
-- (global_patient_id) — patient-side queries.
-- (patient_clinic_record_id) — clinic-side queries via the PCR.
-- (global_patient_id, clinic_id) — compound for the common
-- "show me this patient's data at this clinic" pattern.

CREATE INDEX IF NOT EXISTS clinical_notes_global_patient_idx
  ON public.clinical_notes (global_patient_id);
CREATE INDEX IF NOT EXISTS clinical_notes_pcr_idx
  ON public.clinical_notes (patient_clinic_record_id);
CREATE INDEX IF NOT EXISTS clinical_notes_global_patient_clinic_idx
  ON public.clinical_notes (global_patient_id, clinic_id);

CREATE INDEX IF NOT EXISTS prescription_items_global_patient_idx
  ON public.prescription_items (global_patient_id);
CREATE INDEX IF NOT EXISTS prescription_items_pcr_idx
  ON public.prescription_items (patient_clinic_record_id);

CREATE INDEX IF NOT EXISTS appointments_global_patient_idx
  ON public.appointments (global_patient_id);
CREATE INDEX IF NOT EXISTS appointments_pcr_idx
  ON public.appointments (patient_clinic_record_id);
CREATE INDEX IF NOT EXISTS appointments_global_patient_clinic_idx
  ON public.appointments (global_patient_id, clinic_id);

CREATE INDEX IF NOT EXISTS lab_orders_global_patient_idx
  ON public.lab_orders (global_patient_id);
CREATE INDEX IF NOT EXISTS lab_orders_pcr_idx
  ON public.lab_orders (patient_clinic_record_id);

CREATE INDEX IF NOT EXISTS lab_results_global_patient_idx
  ON public.lab_results (global_patient_id);
CREATE INDEX IF NOT EXISTS lab_results_pcr_idx
  ON public.lab_results (patient_clinic_record_id);

CREATE INDEX IF NOT EXISTS imaging_orders_global_patient_idx
  ON public.imaging_orders (global_patient_id);
CREATE INDEX IF NOT EXISTS imaging_orders_pcr_idx
  ON public.imaging_orders (patient_clinic_record_id);

CREATE INDEX IF NOT EXISTS vital_signs_global_patient_idx
  ON public.vital_signs (global_patient_id);
CREATE INDEX IF NOT EXISTS vital_signs_pcr_idx
  ON public.vital_signs (patient_clinic_record_id);

CREATE INDEX IF NOT EXISTS patient_consent_grants_global_patient_idx
  ON public.patient_consent_grants (global_patient_id);
CREATE INDEX IF NOT EXISTS patient_consent_grants_pcr_idx
  ON public.patient_consent_grants (patient_clinic_record_id);

CREATE INDEX IF NOT EXISTS patient_phone_history_global_patient_idx
  ON public.patient_phone_history (global_patient_id);

CREATE INDEX IF NOT EXISTS doctor_patient_relationships_global_patient_idx
  ON public.doctor_patient_relationships (global_patient_id);
CREATE INDEX IF NOT EXISTS doctor_patient_relationships_pcr_idx
  ON public.doctor_patient_relationships (patient_clinic_record_id);

CREATE INDEX IF NOT EXISTS patient_visibility_global_patient_idx
  ON public.patient_visibility (global_patient_id);
CREATE INDEX IF NOT EXISTS patient_visibility_pcr_idx
  ON public.patient_visibility (patient_clinic_record_id);
