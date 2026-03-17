-- ============================================================================
-- Migration 019: Add clinic_id to All Tables
-- Distributes clinic_id across all tables for fine-grained clinic-scoped RLS.
-- Backfills from existing relationships where possible.
-- ============================================================================

-- ============================================================================
-- PATIENTS: Add clinic_id (may already exist from earlier migrations)
-- ============================================================================
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_clinic ON public.patients(clinic_id);

-- Backfill from clinic_memberships (if patient registered with a doctor)
UPDATE public.patients p
SET clinic_id = (
  SELECT DISTINCT cm.clinic_id
  FROM public.clinic_memberships cm
  WHERE cm.user_id = p.id
  AND cm.status = 'ACTIVE'
  LIMIT 1
)
WHERE p.clinic_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.user_id = p.id AND cm.status = 'ACTIVE'
  );

-- ============================================================================
-- VITAL_SIGNS: Add clinic_id
-- ============================================================================
ALTER TABLE public.vital_signs
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vital_signs_clinic ON public.vital_signs(clinic_id);

-- Backfill from doctor's clinic membership
UPDATE public.vital_signs vs
SET clinic_id = (
  SELECT DISTINCT cm.clinic_id
  FROM public.clinic_memberships cm
  WHERE cm.user_id = vs.doctor_id
  AND cm.status = 'ACTIVE'
  LIMIT 1
)
WHERE vs.clinic_id IS NULL
  AND vs.doctor_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.user_id = vs.doctor_id AND cm.status = 'ACTIVE'
  );

-- ============================================================================
-- LAB_ORDERS: Add clinic_id
-- ============================================================================
ALTER TABLE public.lab_orders
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lab_orders_clinic ON public.lab_orders(clinic_id);

-- Backfill from doctor's clinic membership
UPDATE public.lab_orders lo
SET clinic_id = (
  SELECT DISTINCT cm.clinic_id
  FROM public.clinic_memberships cm
  WHERE cm.user_id = lo.doctor_id
  AND cm.status = 'ACTIVE'
  LIMIT 1
)
WHERE lo.clinic_id IS NULL
  AND lo.doctor_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.user_id = lo.doctor_id AND cm.status = 'ACTIVE'
  );

-- ============================================================================
-- LAB_RESULTS: Add clinic_id (via lab_orders)
-- ============================================================================
ALTER TABLE public.lab_results
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lab_results_clinic ON public.lab_results(clinic_id);

-- Backfill from lab_orders
UPDATE public.lab_results lr
SET clinic_id = lo.clinic_id
FROM public.lab_orders lo
WHERE lr.lab_order_id = lo.id
  AND lr.clinic_id IS NULL
  AND lo.clinic_id IS NOT NULL;

-- ============================================================================
-- IMAGING_ORDERS: Add clinic_id
-- ============================================================================
ALTER TABLE public.imaging_orders
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_imaging_orders_clinic ON public.imaging_orders(clinic_id);

-- Backfill from doctor's clinic membership
UPDATE public.imaging_orders io
SET clinic_id = (
  SELECT DISTINCT cm.clinic_id
  FROM public.clinic_memberships cm
  WHERE cm.user_id = io.doctor_id
  AND cm.status = 'ACTIVE'
  LIMIT 1
)
WHERE io.clinic_id IS NULL
  AND io.doctor_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.user_id = io.doctor_id AND cm.status = 'ACTIVE'
  );

-- ============================================================================
-- CHECK_IN_QUEUE: Add clinic_id
-- ============================================================================
ALTER TABLE public.check_in_queue
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_check_in_queue_clinic ON public.check_in_queue(clinic_id);

-- Backfill from doctor's clinic membership
UPDATE public.check_in_queue ciq
SET clinic_id = (
  SELECT DISTINCT cm.clinic_id
  FROM public.clinic_memberships cm
  WHERE cm.user_id = ciq.doctor_id
  AND cm.status = 'ACTIVE'
  LIMIT 1
)
WHERE ciq.clinic_id IS NULL
  AND ciq.doctor_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.user_id = ciq.doctor_id AND cm.status = 'ACTIVE'
  );

-- ============================================================================
-- PAYMENTS: Add clinic_id (may already exist)
-- ============================================================================
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_clinic ON public.payments(clinic_id);

-- Backfill from doctor's clinic membership
UPDATE public.payments p
SET clinic_id = (
  SELECT DISTINCT cm.clinic_id
  FROM public.clinic_memberships cm
  WHERE cm.user_id = p.doctor_id
  AND cm.status = 'ACTIVE'
  LIMIT 1
)
WHERE p.clinic_id IS NULL
  AND p.doctor_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.user_id = p.doctor_id AND cm.status = 'ACTIVE'
  );

-- ============================================================================
-- CONVERSATIONS: Add clinic_id
-- ============================================================================
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_clinic ON public.conversations(clinic_id);

-- Backfill from doctor's clinic membership
UPDATE public.conversations c
SET clinic_id = (
  SELECT DISTINCT cm.clinic_id
  FROM public.clinic_memberships cm
  WHERE cm.user_id = c.doctor_id
  AND cm.status = 'ACTIVE'
  LIMIT 1
)
WHERE c.clinic_id IS NULL
  AND c.doctor_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.user_id = c.doctor_id AND cm.status = 'ACTIVE'
  );

-- ============================================================================
-- MESSAGES: Add clinic_id (via conversations)
-- ============================================================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_clinic ON public.messages(clinic_id);

-- Backfill from conversations
UPDATE public.messages m
SET clinic_id = c.clinic_id
FROM public.conversations c
WHERE m.conversation_id = c.id
  AND m.clinic_id IS NULL
  AND c.clinic_id IS NOT NULL;

-- ============================================================================
-- DOCTOR_PATIENT_RELATIONSHIPS: Add clinic_id (may already exist)
-- ============================================================================
ALTER TABLE public.doctor_patient_relationships
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dpr_clinic ON public.doctor_patient_relationships(clinic_id);

-- Backfill from doctor's clinic membership
UPDATE public.doctor_patient_relationships dpr
SET clinic_id = (
  SELECT DISTINCT cm.clinic_id
  FROM public.clinic_memberships cm
  WHERE cm.user_id = dpr.doctor_id
  AND cm.status = 'ACTIVE'
  LIMIT 1
)
WHERE dpr.clinic_id IS NULL
  AND dpr.doctor_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.user_id = dpr.doctor_id AND cm.status = 'ACTIVE'
  );

-- ============================================================================
-- PATIENT_CONSENT_GRANTS: Add clinic_id
-- ============================================================================
ALTER TABLE public.patient_consent_grants
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_consent_grants_clinic ON public.patient_consent_grants(clinic_id);

-- Backfill from doctor's clinic membership
UPDATE public.patient_consent_grants pcg
SET clinic_id = (
  SELECT DISTINCT cm.clinic_id
  FROM public.clinic_memberships cm
  WHERE cm.user_id = pcg.doctor_id
  AND cm.status = 'ACTIVE'
  LIMIT 1
)
WHERE pcg.clinic_id IS NULL
  AND pcg.doctor_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.user_id = pcg.doctor_id AND cm.status = 'ACTIVE'
  );

-- ============================================================================
-- MEDICATION_REMINDERS: Add clinic_id
-- ============================================================================
ALTER TABLE public.medication_reminders
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_med_reminders_clinic ON public.medication_reminders(clinic_id);

-- Backfill from clinical_notes
UPDATE public.medication_reminders mr
SET clinic_id = cn.clinic_id
FROM public.clinical_notes cn
WHERE mr.clinical_note_id = cn.id
  AND mr.clinic_id IS NULL
  AND cn.clinic_id IS NOT NULL;

-- ============================================================================
-- DOCTOR_AVAILABILITY: Add clinic_id
-- ============================================================================
ALTER TABLE public.doctor_availability
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_doc_availability_clinic ON public.doctor_availability(clinic_id);

-- Backfill from doctor's clinic membership
UPDATE public.doctor_availability da
SET clinic_id = (
  SELECT DISTINCT cm.clinic_id
  FROM public.clinic_memberships cm
  WHERE cm.user_id = da.doctor_id
  AND cm.status = 'ACTIVE'
  LIMIT 1
)
WHERE da.clinic_id IS NULL
  AND da.doctor_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.user_id = da.doctor_id AND cm.status = 'ACTIVE'
  );

-- ============================================================================
-- PATIENT_MEDICAL_RECORDS: Add clinic_id
-- ============================================================================
ALTER TABLE public.patient_medical_records
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_medical_records_clinic ON public.patient_medical_records(clinic_id);

-- Backfill from patient's clinic
UPDATE public.patient_medical_records pmr
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE pmr.patient_id = p.id
  AND pmr.clinic_id IS NULL
  AND p.clinic_id IS NOT NULL;

-- ============================================================================
-- PATIENT_MEDICATIONS: Add clinic_id
-- ============================================================================
ALTER TABLE public.patient_medications
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patient_meds_clinic ON public.patient_medications(clinic_id);

-- Backfill from patient's clinic
UPDATE public.patient_medications pm
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE pm.patient_id = p.id
  AND pm.clinic_id IS NULL
  AND p.clinic_id IS NOT NULL;

-- ============================================================================
-- PATIENT_ALLERGIES: Add clinic_id
-- ============================================================================
ALTER TABLE public.patient_allergies
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_allergies_clinic ON public.patient_allergies(clinic_id);

-- Backfill from patient's clinic
UPDATE public.patient_allergies pa
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE pa.patient_id = p.id
  AND pa.clinic_id IS NULL
  AND p.clinic_id IS NOT NULL;

-- ============================================================================
-- CHRONIC_CONDITIONS: Add clinic_id
-- ============================================================================
ALTER TABLE public.chronic_conditions
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chronic_conditions_clinic ON public.chronic_conditions(clinic_id);

-- Backfill from patient's clinic
UPDATE public.chronic_conditions cc
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE cc.patient_id = p.id
  AND cc.clinic_id IS NULL
  AND p.clinic_id IS NOT NULL;

-- ============================================================================
-- IMMUNIZATIONS: Add clinic_id
-- ============================================================================
ALTER TABLE public.immunizations
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_immunizations_clinic ON public.immunizations(clinic_id);

-- Backfill from patient's clinic
UPDATE public.immunizations i
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE i.patient_id = p.id
  AND i.clinic_id IS NULL
  AND p.clinic_id IS NOT NULL;

-- ============================================================================
-- PATIENT_DIARY: Add clinic_id
-- ============================================================================
ALTER TABLE public.patient_diary
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patient_diary_clinic ON public.patient_diary(clinic_id);

-- Backfill from patient's clinic
UPDATE public.patient_diary pd
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE pd.patient_id = p.id
  AND pd.clinic_id IS NULL
  AND p.clinic_id IS NOT NULL;

-- ============================================================================
-- PATIENT_HEALTH_METRICS: Add clinic_id
-- ============================================================================
ALTER TABLE public.patient_health_metrics
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_health_metrics_clinic ON public.patient_health_metrics(clinic_id);

-- Backfill from patient's clinic
UPDATE public.patient_health_metrics phm
SET clinic_id = p.clinic_id
FROM public.patients p
WHERE phm.patient_id = p.id
  AND phm.clinic_id IS NULL
  AND p.clinic_id IS NOT NULL;

-- ============================================================================
-- RECORD_SHARING_PREFERENCES: Add clinic_id
-- ============================================================================
ALTER TABLE public.record_sharing_preferences
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sharing_prefs_clinic ON public.record_sharing_preferences(clinic_id);

-- Backfill from doctor's clinic membership
UPDATE public.record_sharing_preferences rsp
SET clinic_id = (
  SELECT DISTINCT cm.clinic_id
  FROM public.clinic_memberships cm
  WHERE cm.user_id = rsp.doctor_id
  AND cm.status = 'ACTIVE'
  LIMIT 1
)
WHERE rsp.clinic_id IS NULL
  AND rsp.doctor_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.user_id = rsp.doctor_id AND cm.status = 'ACTIVE'
  );

-- ============================================================================
-- Summary comment
-- ============================================================================
COMMENT ON TABLE public.clinic_memberships IS 'clinic_id has been added to all relevant tables for clinic-scoped RLS policies.';
