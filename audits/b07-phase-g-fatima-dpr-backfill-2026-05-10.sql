-- ============================================================================
-- B07 Phase G — Housekeeping: backfill DPR for fatima ahmad
-- Date: 2026-05-10
-- Author: Phase G cowork session (Mo housekeeping request)
-- Status: NOT a migration — one-off staging data-fix per Phase G prompt
-- ============================================================================
--
-- CONTEXT
--   Phase G Section 0 architectural survey revealed 3 backfilled minors
--   on staging:
--     #1 fatima ahmad      (6036cd97-...) — patients ✓ PCR ✓ DPR ✗ (gap)
--     #2 noah omar          (81696b8a-...) — patients ✓ PCR ✓ DPR ✓
--     #3 ahmed mohamed     (fdbc93ce-...) — patients ✓ PCR ✓ DPR ✓
--
--   fatima's missing DPR row makes her invisible to the registering
--   clinic's doctor-side patient list. Mig 111 (Phase B backfill)
--   correctly created her gp + patients + PCR but did not create a
--   DPR because no specific doctor was identified at backfill time.
--
--   Mo's Phase G housekeeping request: bring fatima to the same shape
--   as #2 and #3 so all 3 mig-111 minors have consistent
--   (patients, PCR, DPR).
--
-- DOCTOR CHOICE
--   The first eligible OWNER/DOCTOR at fatima's clinic (sorted by
--   clinic_memberships.created_at ASC). This matches the
--   onboardPatient adult convention ("doctor selected at registration")
--   for a synthetic backfill.
--
-- AUDIT
--   The DPR insert by itself does not emit an audit event (matches the
--   walk-in adult onboarding convention; the DPR row IS the audit
--   trail). Mig 081's BEFORE INSERT trigger on DPR auto-fills
--   global_patient_id + patient_clinic_record_id via the existing
--   (gpid, clinicId) → patients chain.
--
-- IDEMPOTENCY
--   Guarded by ON CONFLICT DO NOTHING on (doctor_id, patient_id).
--   Safe to re-run.
--
-- REVERSAL
--   DELETE FROM public.doctor_patient_relationships
--     WHERE patient_id = '6036cd97-f149-449f-8975-cb7cc5651059'
--       AND notes = 'mig-111 backfill — Phase G housekeeping';
-- ============================================================================

BEGIN;

WITH fatima_context AS (
  SELECT
    p.id AS patient_id,
    p.clinic_id,
    p.full_name,
    p.age,
    p.sex,
    -- Pick the first eligible OWNER/DOCTOR at this clinic. NULL-safe via
    -- LIMIT 1; if no such doctor exists the INSERT short-circuits.
    (SELECT cm.user_id
       FROM public.clinic_memberships cm
      WHERE cm.clinic_id = p.clinic_id
        AND cm.role IN ('OWNER','DOCTOR')
        AND cm.status = 'ACTIVE'
      ORDER BY cm.created_at ASC
      LIMIT 1) AS doctor_id
  FROM public.patients p
  WHERE p.id = '6036cd97-f149-449f-8975-cb7cc5651059'
)
INSERT INTO public.doctor_patient_relationships (
  doctor_id,
  patient_id,
  clinic_id,
  status,
  relationship_type,
  access_level,
  consent_state,
  access_type,
  notes,
  last_visit_at,
  doctor_entered_name,
  doctor_entered_age,
  doctor_entered_sex
)
SELECT
  doctor_id,
  patient_id,
  clinic_id,
  'active',
  'primary',     -- DPR.relationship_type CHECK = {primary, secondary, consultant}
  'walk_in_limited',
  'pending',
  'walk_in',
  'mig-111 backfill — Phase G housekeeping',
  NOW(),
  full_name,
  age,
  sex
FROM fatima_context
WHERE doctor_id IS NOT NULL
ON CONFLICT (doctor_id, patient_id) DO NOTHING;

-- Verification: confirm DPR count went from 0 to 1.
DO $$
DECLARE
  v_dpr_count INTEGER;
BEGIN
  SELECT count(*) INTO v_dpr_count
    FROM public.doctor_patient_relationships
   WHERE patient_id = '6036cd97-f149-449f-8975-cb7cc5651059';
  IF v_dpr_count = 0 THEN
    RAISE WARNING 'Phase G housekeeping: fatima DPR backfill produced 0 rows. Possible cause: no OWNER/DOCTOR at clinic 298866c7-87b7-4405-9487-c7174bafaf99.';
  ELSE
    RAISE NOTICE 'Phase G housekeeping: fatima DPR count is now %', v_dpr_count;
  END IF;
END $$;

COMMIT;
