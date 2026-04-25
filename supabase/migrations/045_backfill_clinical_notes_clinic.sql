-- ============================================================================
-- Migration 045: Backfill clinical_notes.clinic_id (resolvable orphans)
-- ============================================================================
--
-- Background
-- ----------
-- Investigation on 2026-04-24 found 56 clinical_notes rows with clinic_id IS
-- NULL across 22 doctors. Recent commit ed5aa2a switched analytics + profile
-- queries to .eq('clinic_id', activeClinicId), which silently drops these rows
-- because PostgREST .eq() does not match NULL. Visible symptom: Dr. Naser sees
-- 11 of his 35 visits on /doctor/profile and /doctor/analytics.
--
-- Root cause is two-layered:
--   1. data layer (clinical-notes.ts:73) writes `clinic_id: params.clinicId
--      || null` with no warning on miss
--   2. API handler (handlers/clinical/notes/handler.ts:34-51) silently catches
--      membership-lookup failures and proceeds with clinic_id = null
-- The save-path layer is fixed in the same PR as this migration. This file
-- handles the historical rows.
--
-- Backfill rule
-- -------------
-- Same logic migration 023 used: pick each doctor's earliest ACTIVE
-- clinic_membership (ORDER BY created_at ASC LIMIT 1). For OWNER+DOCTOR
-- doctors, the OWNER membership is older — so notes land on the OWNER clinic,
-- which matches what /doctor/analytics scopes to by default.
--
-- Pre-flight (run 2026-04-24): 33 of 56 rows are resolvable this way.
-- 23 rows belong to test/seed accounts (Phase5/7/8/14, Dr Session*) whose
-- doctors have zero ACTIVE memberships — those stay NULL and need a separate
-- cleanup decision before clinical_notes.clinic_id can become NOT NULL.
--
-- Safety
-- ------
-- Idempotent (only updates rows where clinic_id IS NULL).
-- No data deleted. No schema change in this migration.
-- ============================================================================

UPDATE public.clinical_notes cn
SET clinic_id = (
  SELECT cm.clinic_id
  FROM public.clinic_memberships cm
  WHERE cm.user_id = cn.doctor_id
    AND cm.status  = 'ACTIVE'
  ORDER BY cm.created_at ASC
  LIMIT 1
)
WHERE cn.clinic_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.clinic_memberships cm
    WHERE cm.user_id = cn.doctor_id
      AND cm.status  = 'ACTIVE'
  );

-- Document why the column remains nullable for now
COMMENT ON COLUMN public.clinical_notes.clinic_id IS
  'Owning clinic for this note. Currently nullable due to ~23 historical test/seed rows '
  'with no resolvable clinic. New writes are guarded at the API layer (see '
  'apps/clinic/app/api/clinical/notes/route.ts) — a 400 is returned if no clinic resolves. '
  'Plan: delete unresolvable rows, then ALTER ... SET NOT NULL.';
