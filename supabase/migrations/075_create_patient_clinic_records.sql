-- ============================================================================
-- Migration 075 — patient_clinic_records (Layer 2 of patient identity v2)
--
-- Conceptual name in audits/EXECUTION_PROMPTS.md: mig 074.
--
-- Implements: schema-spec §3 + Build 03 Phase B Step 4 (Steps B1, B2, B3).
--
-- WHY THIS MIGRATION EXISTS
--   global_patients (mig 073) is the network-wide identity ring — phone,
--   claim status, account_status. patient_clinic_records is the per-clinic
--   relationship row: it carries clinic-specific state (consent-to-message
--   for THIS clinic, anonymity-to-global for THIS clinic, first/last seen
--   AT THIS clinic). UNIQUE(global_patient_id, clinic_id) is the
--   load-bearing dedup key for the network model.
--
-- WHAT IT ADDS
--   1. patient_clinic_records table (per spec §3 column list).
--   2. UNIQUE(global_patient_id, clinic_id) constraint.
--   3. Index on (clinic_id, last_seen_at DESC) — clinic-side queries
--      ("show me my recent patients").
--   4. Index on (global_patient_id) — patient-side queries ("show me
--      every clinic that has my data").
--   5. updated_at touch trigger (consistent with global_patients).
--   6. RLS DENY-ALL placeholder (Prompt 6 / Build 06 ships real policies —
--      tracked as ORPH-V3-01).
--   7. Backfill from existing (patients.global_patient_id, patients.clinic_id)
--      pairs:
--      - is_anonymous_to_global = FALSE  (existing data is implicit
--        relationship history, not anonymized)
--      - consent_to_messaging = FALSE  (per spec v2 Change 5 — Option 3
--        re-consent flow handles legacy consent migration; tracked as
--        ORPH-V2-02)
--      - first_seen_at = MIN(patients.created_at) for the pair
--      - last_seen_at = greatest of patients/clinical_notes/appointments/
--        payments created_at for that pair (the prompt body's spec calls
--        for MAX(encounters.created_at), but encounters doesn't exist
--        yet — see deviation note in Build 03 results §6).
--   8. PATIENT_CLINIC_RECORD_CREATED audit row per backfill (actor_kind=
--      'migration', actor_user_id=NULL — depends on mig 074).
--
-- DEPENDS ON:
--   - mig 073 (provides global_patients, patients.global_patient_id).
--   - mig 074 (relaxes audit_events.actor_user_id so audit inserts work).
--
-- POST-CONDITIONS
--   patient_clinic_records.count =
--     COUNT(DISTINCT (global_patient_id, clinic_id) FROM patients
--           WHERE global_patient_id IS NOT NULL AND clinic_id IS NOT NULL)
--   No duplicate (global_patient_id, clinic_id) pairs.
--   Every PCR row has a corresponding PATIENT_CLINIC_RECORD_CREATED audit.
--
-- REVERSIBLE. Companion: 075_create_patient_clinic_records.rollback.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 075.1 — Create the table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_clinic_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity edges. ON DELETE RESTRICT both ways: clinic data must
  -- survive identity-row merges (the "merge" replaces global_patient_id
  -- via UPDATE, not via DELETE), and identity must survive a clinic
  -- being archived (clinic deletion is a Major Operation, see schema
  -- spec § future).
  global_patient_id UUID NOT NULL
    REFERENCES public.global_patients(id) ON DELETE RESTRICT,
  clinic_id UUID NOT NULL
    REFERENCES public.clinics(id) ON DELETE RESTRICT,

  -- Per-clinic relationship state.
  is_anonymous_to_global BOOLEAN NOT NULL DEFAULT FALSE,
  consent_to_messaging BOOLEAN NOT NULL DEFAULT FALSE,
  consent_to_messaging_granted_at TIMESTAMPTZ,

  -- Recency tracking — seeds clinic-side queries by activity.
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT patient_clinic_records_pcr_uniq
    UNIQUE (global_patient_id, clinic_id),

  -- Consent timestamp must accompany consent — denormalize to enforce
  -- at the DB level. Without this, a mid-flight write of consent=true
  -- without granted_at could leave a row in an ambiguous state.
  CONSTRAINT patient_clinic_records_consent_timestamp_consistency
    CHECK (
      (consent_to_messaging = FALSE)
      OR
      (consent_to_messaging = TRUE AND consent_to_messaging_granted_at IS NOT NULL)
    )
);

COMMENT ON TABLE public.patient_clinic_records IS
  'Per-clinic relationship row. UNIQUE(global_patient_id, clinic_id). Replaces doctor_patient_relationships for clinic-level scoping; per-doctor scoping moves to patient_visibility/visibility_v2.';

-- ---------------------------------------------------------------------------
-- 075.2 — Indexes.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS patient_clinic_records_clinic_recency_idx
  ON public.patient_clinic_records (clinic_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS patient_clinic_records_global_patient_idx
  ON public.patient_clinic_records (global_patient_id);

-- ---------------------------------------------------------------------------
-- 075.3 — Touch trigger for updated_at.
-- ---------------------------------------------------------------------------
-- Reuses the trigger function pattern from mig 073's global_patients.
-- We define a per-table function here rather than a generic one to keep
-- this migration self-contained for rollback purposes.
CREATE OR REPLACE FUNCTION public.patient_clinic_records_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patient_clinic_records_touch_updated_at_trg
  ON public.patient_clinic_records;

CREATE TRIGGER patient_clinic_records_touch_updated_at_trg
  BEFORE UPDATE ON public.patient_clinic_records
  FOR EACH ROW
  EXECUTE FUNCTION public.patient_clinic_records_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 075.4 — RLS DENY-ALL placeholder (ORPH-V3-01).
-- ---------------------------------------------------------------------------
-- Real policies (clinic-self via membership + patient_clinic_records,
-- plus directional cross-clinic access via patient_data_shares) ship in
-- Prompt 6 / Build 06. Until then, only service-role bypasses RLS.
-- This means application-side reads MUST go through service-role admin
-- clients (createAdminClient) for now.
ALTER TABLE public.patient_clinic_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY patient_clinic_records_deny_all
  ON public.patient_clinic_records
  FOR ALL
  USING (FALSE)
  WITH CHECK (FALSE);

COMMENT ON POLICY patient_clinic_records_deny_all
  ON public.patient_clinic_records IS
  'DENY-ALL placeholder. Real policies ship in Prompt 6 (ORPH-V3-01). Service-role bypasses RLS — all current reads go through createAdminClient.';

-- ---------------------------------------------------------------------------
-- 075.5 — Backfill.
-- ---------------------------------------------------------------------------
-- One row per (patients.global_patient_id, patients.clinic_id) pair.
--
-- Recency seed: GREATEST of created_at across the activity tables that
-- have both patient_id and clinic_id wired today. We do NOT scan the 30+
-- patient-keyed tables — only the ones that meaningfully indicate a
-- clinic relationship: clinical_notes, appointments, payments. (vital_
-- signs / imaging_orders / lab_orders are clinical artifacts that bump
-- the same relationship; including them is purely an index-quality win
-- and adds latency to the backfill — kept simple for staging-scale data.)
--
-- ON CONFLICT DO NOTHING so re-applying this migration is idempotent.
INSERT INTO public.patient_clinic_records (
  global_patient_id, clinic_id,
  is_anonymous_to_global,
  consent_to_messaging,
  consent_to_messaging_granted_at,
  first_seen_at,
  last_seen_at,
  created_at,
  updated_at
)
SELECT
  pair.global_patient_id,
  pair.clinic_id,
  FALSE,                                              -- is_anonymous_to_global
  FALSE,                                              -- consent_to_messaging (re-consent flow seeds this; ORPH-V2-02)
  NULL,                                               -- consent_to_messaging_granted_at
  pair.first_created_at,                              -- first_seen_at
  GREATEST(
    pair.first_created_at,
    COALESCE(pair.last_clinical_note_at, pair.first_created_at),
    COALESCE(pair.last_appointment_at, pair.first_created_at),
    COALESCE(pair.last_payment_at, pair.first_created_at)
  ),                                                   -- last_seen_at
  pair.first_created_at,                              -- created_at
  NOW()                                                -- updated_at
FROM (
  SELECT
    p.global_patient_id,
    p.clinic_id,
    MIN(p.created_at) AS first_created_at,
    (SELECT MAX(cn.created_at) FROM public.clinical_notes cn
      WHERE cn.patient_id = p.id AND cn.clinic_id = p.clinic_id) AS last_clinical_note_at,
    (SELECT MAX(a.created_at) FROM public.appointments a
      WHERE a.patient_id = p.id AND a.clinic_id = p.clinic_id) AS last_appointment_at,
    (SELECT MAX(pay.created_at) FROM public.payments pay
      WHERE pay.patient_id = p.id AND pay.clinic_id = p.clinic_id) AS last_payment_at
  FROM public.patients p
  WHERE p.global_patient_id IS NOT NULL
    AND p.clinic_id IS NOT NULL
  GROUP BY p.global_patient_id, p.clinic_id, p.id
) pair
ON CONFLICT (global_patient_id, clinic_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 075.6 — Audit log: PATIENT_CLINIC_RECORD_CREATED per backfilled row.
-- ---------------------------------------------------------------------------
-- Idempotent via NOT EXISTS guard on entity_id (the PCR row's id).
INSERT INTO public.audit_events (
  action, actor_kind, actor_user_id,
  clinic_id, entity_type, entity_id,
  metadata, created_at
)
SELECT
  'PATIENT_CLINIC_RECORD_CREATED',
  'migration',
  NULL,
  pcr.clinic_id,
  'patient_clinic_record',
  pcr.id,
  jsonb_build_object(
    'source', 'migration_075_backfill',
    'global_patient_id', pcr.global_patient_id,
    'clinic_id', pcr.clinic_id,
    'first_seen_at', pcr.first_seen_at,
    'last_seen_at', pcr.last_seen_at
  ),
  NOW()
FROM public.patient_clinic_records pcr
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_events ae
   WHERE ae.action = 'PATIENT_CLINIC_RECORD_CREATED'
     AND ae.entity_id = pcr.id
);

-- ---------------------------------------------------------------------------
-- 075.7 — Post-condition assertion.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_expected INTEGER;
  v_actual INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_expected FROM (
    SELECT DISTINCT global_patient_id, clinic_id
      FROM public.patients
     WHERE global_patient_id IS NOT NULL
       AND clinic_id IS NOT NULL
  ) pairs;

  SELECT COUNT(*) INTO v_actual FROM public.patient_clinic_records;

  IF v_actual <> v_expected THEN
    RAISE EXCEPTION
      'mig 075 post-condition failed: patient_clinic_records count % != expected % distinct (global_patient_id, clinic_id) pairs',
      v_actual, v_expected;
  END IF;
END $$;
