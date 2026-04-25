-- ============================================================================
-- Migration 048: Re-apply clinic_id rollout (subset of mig 019 + 026)
-- ============================================================================
--
-- Background
-- ----------
-- Audit on 2026-04-24 found that mig 019 (clinic_id_everywhere) and mig 026
-- (data_foundation_fixes) effectively never applied to the live DB. Of 22
-- tables that should have a clinic_id column, only 4 do today
-- (clinical_notes, payments, patient_consent_grants, appointments). The
-- other 19 are missing it, even though several code paths (e.g.
-- apps/clinic/app/api/doctor/stats/route.ts:72,88 against
-- doctor_patient_relationships) assume it exists and silently error in
-- production via PostgREST.
--
-- Symptom Mo noticed: Dr. Naser's profile shows totalPatients = 0 because
-- the dpr.clinic_id query errors out and the route's destructure swallows
-- the count.
--
-- Scope of this migration (Mo's call: 2A end-to-end column rollout)
-- ----------------------------------------------------------------
-- Add clinic_id (nullable) + index + backfill on all 19 missing tables.
-- Backfill rule mirrors mig 019/026: each row gets the doctor's earliest
-- ACTIVE clinic_membership, OR for child tables, the parent row's
-- clinic_id. patients uses created_by_doctor_id (mig 026's logic) since
-- that's more accurate than user-id-based lookup.
--
-- DOES NOT include (deliberately, because Mo asked for the column rollout
-- only):
--   - The enum types `visibility_mode`, `consent_type`, `assignment_scope`
--     (referenced by mig 020's tables — those tables exist but have TEXT
--     columns now)
--   - The RLS functions `can_access_patient`, `is_clinic_member`,
--     `get_clinic_role` (mig 021)
--   - The RLS policy rewrites (mig 021) — current policies stay in place
--   - `clinics.default_visibility` and `clinics.settings` columns (mig 021)
--   - NOT NULL constraints (separate per-table follow-up after orphan triage)
--   - The clinic_doctors / front_desk_staff → clinic_memberships unification
--     in mig 026 PART 1 (legacy reconciliation, can be done separately)
-- See report comments in the conversation that produced this migration.
--
-- Pre-flight (run 2026-04-24 against mtmdotixlhwksyoordbl)
-- --------------------------------------------------------
-- Row counts (largest first): patients 108, doctor_availability 82,
-- doctor_patient_relationships 44, messages 29, check_in_queue 19,
-- conversations 17, patient_diary 11, patient_medical_records 11,
-- patient_medications 7, medication_reminders 3, imaging_orders 1,
-- record_sharing_preferences 1, all others 0.
--
-- All 19 tables verified to have the expected backfill-source columns
-- (doctor_id, patient_id, lab_order_id, conversation_id, clinical_note_id,
-- created_by_doctor_id) where required.
--
-- Idempotent: each ALTER uses ADD COLUMN IF NOT EXISTS; each backfill
-- updates only rows where clinic_id IS NULL.
-- ============================================================================


-- ============================================================================
-- PHASE 1: ADD COLUMNS + INDEXES (idempotent)
-- ============================================================================

-- Group A: doctor-derived backfill source (clinic_memberships of doctor_id)
ALTER TABLE public.vital_signs                  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.lab_orders                   ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.imaging_orders               ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.check_in_queue               ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.conversations                ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.doctor_patient_relationships ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.doctor_availability          ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.record_sharing_preferences   ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

-- Group B: patient-creator-derived backfill source
ALTER TABLE public.patients                     ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

-- Group C: child-table-derived backfill source (depend on parent rows being populated)
ALTER TABLE public.lab_results                  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.messages                     ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.medication_reminders         ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.patient_medical_records      ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.patient_medications          ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.patient_allergies            ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.chronic_conditions           ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.immunizations                ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.patient_diary                ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
ALTER TABLE public.patient_health_metrics       ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

-- Indexes (one per table)
CREATE INDEX IF NOT EXISTS idx_vital_signs_clinic                   ON public.vital_signs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_clinic                    ON public.lab_orders(clinic_id);
CREATE INDEX IF NOT EXISTS idx_imaging_orders_clinic                ON public.imaging_orders(clinic_id);
CREATE INDEX IF NOT EXISTS idx_check_in_queue_clinic                ON public.check_in_queue(clinic_id);
CREATE INDEX IF NOT EXISTS idx_conversations_clinic                 ON public.conversations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_dpr_clinic                           ON public.doctor_patient_relationships(clinic_id);
CREATE INDEX IF NOT EXISTS idx_dpr_clinic_doctor                    ON public.doctor_patient_relationships(clinic_id, doctor_id);
CREATE INDEX IF NOT EXISTS idx_doc_availability_clinic              ON public.doctor_availability(clinic_id);
CREATE INDEX IF NOT EXISTS idx_sharing_prefs_clinic                 ON public.record_sharing_preferences(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_clinic                      ON public.patients(clinic_id) WHERE clinic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lab_results_clinic                   ON public.lab_results(clinic_id);
CREATE INDEX IF NOT EXISTS idx_messages_clinic                      ON public.messages(clinic_id);
CREATE INDEX IF NOT EXISTS idx_med_reminders_clinic                 ON public.medication_reminders(clinic_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_clinic               ON public.patient_medical_records(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patient_meds_clinic                  ON public.patient_medications(clinic_id);
CREATE INDEX IF NOT EXISTS idx_allergies_clinic                     ON public.patient_allergies(clinic_id);
CREATE INDEX IF NOT EXISTS idx_chronic_conditions_clinic            ON public.chronic_conditions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_immunizations_clinic                 ON public.immunizations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patient_diary_clinic                 ON public.patient_diary(clinic_id);
CREATE INDEX IF NOT EXISTS idx_health_metrics_clinic                ON public.patient_health_metrics(clinic_id);


-- ============================================================================
-- PHASE 2: BACKFILL — TIER 1 (parents, no inter-table dependencies)
-- ============================================================================

-- Helper rule: take the doctor's earliest ACTIVE clinic_membership
-- (matches mig 023/045's logic for clinical_notes — OWNER memberships are
-- typically older than DOCTOR memberships at other clinics).

-- patients ← created_by_doctor_id's clinic
UPDATE public.patients p
SET clinic_id = (
  SELECT cm.clinic_id FROM public.clinic_memberships cm
  WHERE cm.user_id = p.created_by_doctor_id
    AND cm.status  = 'ACTIVE'
    AND cm.role   IN ('OWNER', 'DOCTOR')
  ORDER BY cm.created_at ASC LIMIT 1
)
WHERE p.clinic_id IS NULL
  AND p.created_by_doctor_id IS NOT NULL;

-- doctor_patient_relationships ← doctor_id's clinic
UPDATE public.doctor_patient_relationships dpr
SET clinic_id = (
  SELECT cm.clinic_id FROM public.clinic_memberships cm
  WHERE cm.user_id = dpr.doctor_id
    AND cm.status  = 'ACTIVE'
    AND cm.role   IN ('OWNER', 'DOCTOR')
  ORDER BY cm.created_at ASC LIMIT 1
)
WHERE dpr.clinic_id IS NULL;

-- vital_signs ← doctor_id's clinic
UPDATE public.vital_signs vs
SET clinic_id = (
  SELECT cm.clinic_id FROM public.clinic_memberships cm
  WHERE cm.user_id = vs.doctor_id
    AND cm.status  = 'ACTIVE'
    AND cm.role   IN ('OWNER', 'DOCTOR')
  ORDER BY cm.created_at ASC LIMIT 1
)
WHERE vs.clinic_id IS NULL;

-- lab_orders ← doctor_id's clinic
UPDATE public.lab_orders lo
SET clinic_id = (
  SELECT cm.clinic_id FROM public.clinic_memberships cm
  WHERE cm.user_id = lo.doctor_id
    AND cm.status  = 'ACTIVE'
    AND cm.role   IN ('OWNER', 'DOCTOR')
  ORDER BY cm.created_at ASC LIMIT 1
)
WHERE lo.clinic_id IS NULL;

-- imaging_orders ← doctor_id's clinic
UPDATE public.imaging_orders io
SET clinic_id = (
  SELECT cm.clinic_id FROM public.clinic_memberships cm
  WHERE cm.user_id = io.doctor_id
    AND cm.status  = 'ACTIVE'
    AND cm.role   IN ('OWNER', 'DOCTOR')
  ORDER BY cm.created_at ASC LIMIT 1
)
WHERE io.clinic_id IS NULL;

-- check_in_queue ← doctor_id's clinic
UPDATE public.check_in_queue ciq
SET clinic_id = (
  SELECT cm.clinic_id FROM public.clinic_memberships cm
  WHERE cm.user_id = ciq.doctor_id
    AND cm.status  = 'ACTIVE'
    AND cm.role   IN ('OWNER', 'DOCTOR')
  ORDER BY cm.created_at ASC LIMIT 1
)
WHERE ciq.clinic_id IS NULL;

-- conversations ← doctor_id's clinic
UPDATE public.conversations c
SET clinic_id = (
  SELECT cm.clinic_id FROM public.clinic_memberships cm
  WHERE cm.user_id = c.doctor_id
    AND cm.status  = 'ACTIVE'
    AND cm.role   IN ('OWNER', 'DOCTOR')
  ORDER BY cm.created_at ASC LIMIT 1
)
WHERE c.clinic_id IS NULL;

-- doctor_availability ← doctor_id's clinic
UPDATE public.doctor_availability da
SET clinic_id = (
  SELECT cm.clinic_id FROM public.clinic_memberships cm
  WHERE cm.user_id = da.doctor_id
    AND cm.status  = 'ACTIVE'
    AND cm.role   IN ('OWNER', 'DOCTOR')
  ORDER BY cm.created_at ASC LIMIT 1
)
WHERE da.clinic_id IS NULL;

-- record_sharing_preferences ← doctor_id's clinic
UPDATE public.record_sharing_preferences rsp
SET clinic_id = (
  SELECT cm.clinic_id FROM public.clinic_memberships cm
  WHERE cm.user_id = rsp.doctor_id
    AND cm.status  = 'ACTIVE'
    AND cm.role   IN ('OWNER', 'DOCTOR')
  ORDER BY cm.created_at ASC LIMIT 1
)
WHERE rsp.clinic_id IS NULL;


-- ============================================================================
-- PHASE 3: BACKFILL — TIER 2 (children, depend on tier 1)
-- ============================================================================

-- lab_results ← lab_orders.clinic_id (lab_orders just backfilled above)
UPDATE public.lab_results lr
SET clinic_id = lo.clinic_id
FROM public.lab_orders lo
WHERE lr.lab_order_id = lo.id
  AND lr.clinic_id IS NULL
  AND lo.clinic_id IS NOT NULL;

-- messages ← conversations.clinic_id (conversations just backfilled above)
UPDATE public.messages m
SET clinic_id = c.clinic_id
FROM public.conversations c
WHERE m.conversation_id = c.id
  AND m.clinic_id IS NULL
  AND c.clinic_id IS NOT NULL;

-- medication_reminders ← clinical_notes.clinic_id (already populated by mig 045/046)
UPDATE public.medication_reminders mr
SET clinic_id = cn.clinic_id
FROM public.clinical_notes cn
WHERE mr.clinical_note_id = cn.id
  AND mr.clinic_id IS NULL
  AND cn.clinic_id IS NOT NULL;

-- patient_medical_records ← patients.clinic_id (just backfilled in tier 1)
UPDATE public.patient_medical_records pmr
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE pmr.patient_id = p.id
  AND pmr.clinic_id IS NULL
  AND p.clinic_id IS NOT NULL;

-- patient_medications ← patients.clinic_id
UPDATE public.patient_medications pm
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE pm.patient_id = p.id
  AND pm.clinic_id IS NULL
  AND p.clinic_id IS NOT NULL;

-- patient_allergies ← patients.clinic_id
UPDATE public.patient_allergies pa
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE pa.patient_id = p.id
  AND pa.clinic_id IS NULL
  AND p.clinic_id IS NOT NULL;

-- chronic_conditions ← patients.clinic_id
UPDATE public.chronic_conditions cc
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE cc.patient_id = p.id
  AND cc.clinic_id IS NULL
  AND p.clinic_id IS NOT NULL;

-- immunizations ← patients.clinic_id
UPDATE public.immunizations i
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE i.patient_id = p.id
  AND i.clinic_id IS NULL
  AND p.clinic_id IS NOT NULL;

-- patient_diary ← patients.clinic_id
UPDATE public.patient_diary pd
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE pd.patient_id = p.id
  AND pd.clinic_id IS NULL
  AND p.clinic_id IS NOT NULL;

-- patient_health_metrics ← patients.clinic_id
UPDATE public.patient_health_metrics phm
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE phm.patient_id = p.id
  AND phm.clinic_id IS NULL
  AND p.clinic_id IS NOT NULL;


-- ============================================================================
-- PHASE 4: COLUMN COMMENTS (declare the architectural intent)
-- ============================================================================

COMMENT ON COLUMN public.doctor_patient_relationships.clinic_id IS
  'Owning clinic for this doctor-patient relationship. Backfilled from doctor_id''s '
  'earliest ACTIVE clinic_membership in mig 048. Currently nullable; NOT NULL is a '
  'follow-up after orphan rows are triaged per-table.';

-- (We could comment all 19, but DPR is the one Mo specifically cares about for
--  the doctor/stats route. Other tables get comments when their NOT NULL lands.)
