-- ============================================================================
-- Migration 083 — effective_messaging_consent grace-period view
--
-- DEVIATION: Plan v2 § 4.5 said this view ships with the patient_clinic_records
-- migration (now mig 075). Build 03 omitted it; Phase A of Prompt 4 confirmed
-- the view does not exist on staging today (2026-04-29). Mo confirmed in the
-- Prompt 4 launch session: ship the view here.
--
-- Closes ORPH-V2-04 partial: messaging code paths can now read
-- `effective_messaging_consent` instead of `patient_clinic_records.consent_to_messaging`.
-- The PARTIAL "drop the view" item (ORPH-V2-05) remains open until 90 days
-- post-cutover (after the re-consent flow has had time to drive migration).
--
-- WHAT THIS VIEW BRIDGES
--   New consent surface: `patient_clinic_records.consent_to_messaging` (BOOL) +
--     consent_to_messaging_granted_at TIMESTAMPTZ.
--   Legacy consent surface: `patient_consent_grants` rows where
--     consent_type = 'messaging' AND consent_state = 'granted' AND
--     revoked_at IS NULL — granted per-(doctor, patient).
--
-- BRIDGE LOGIC
--   For each (global_patient_id, clinic_id) pair:
--     effective_consent =
--       PCR.consent_to_messaging
--       OR (
--         a legacy patient_consent_grants row exists for this clinic
--         AND the legacy grant is still inside the 90-day grace period
--         AND the patient has not yet been prompted to re-confirm
--         (i.e., NO MESSAGING_CONSENT_RECONFIRMED or _REVOKED audit row
--          exists for this (gpid, clinic) pair)
--       )
--
--   The grace window is 90 days from the view's apply date (mig 083).
--   Beyond 90 days, the legacy fallback drops out and only the new column
--   counts. After the re-consent UI ships (this prompt's B17), patients
--   get a one-time prompt-per-clinic that converts the legacy consent
--   into either an explicit YES (writes consent_to_messaging=TRUE) or
--   explicit NO (writes _RECONFIRMED with payload denied=true OR a
--   MESSAGING_CONSENT_REVOKED audit and leaves consent_to_messaging=FALSE).
--
-- SECURITY
--   security_invoker = true: the underlying tables' RLS is enforced
--   against the calling user's role. Today (Build 03 leaves PCR + global_
--   patients on DENY-ALL placeholder), only service-role bypasses RLS
--   to read this view. After Prompt 6's RLS rewrite, the view becomes
--   readable by clinic-membership for matching rows.
-- ============================================================================

-- Drop and recreate, idempotent.
DROP VIEW IF EXISTS public.effective_messaging_consent CASCADE;

CREATE VIEW public.effective_messaging_consent
  WITH (security_invoker = true)
AS
WITH legacy_grants AS (
  -- Legacy per-doctor messaging grants that we still want to honor in
  -- the grace window. Aggregate to one row per (clinic, patient).
  --
  -- Some legacy rows have clinic_id IS NULL (predates the multi-tenant
  -- clinic_id column add) but DO have patient_clinic_record_id from
  -- mig 080. We coalesce: prefer the explicit clinic_id if set, else
  -- derive from the PCR row.
  SELECT
    COALESCE(pcg.clinic_id, pcr_for_pcg.clinic_id) AS clinic_id,
    pcg.global_patient_id,
    MIN(pcg.granted_at) AS legacy_granted_at
  FROM public.patient_consent_grants pcg
  LEFT JOIN public.patient_clinic_records pcr_for_pcg
    ON pcr_for_pcg.id = pcg.patient_clinic_record_id
  WHERE pcg.consent_type = 'messaging'
    AND pcg.consent_state = 'granted'
    AND pcg.revoked_at IS NULL
    AND pcg.global_patient_id IS NOT NULL
    AND COALESCE(pcg.clinic_id, pcr_for_pcg.clinic_id) IS NOT NULL
  GROUP BY COALESCE(pcg.clinic_id, pcr_for_pcg.clinic_id), pcg.global_patient_id
),
reconfirmation_decisions AS (
  -- Has the patient ALREADY been through the re-consent prompt for this
  -- clinic? If yes (either RECONFIRMED or REVOKED), the legacy fallback
  -- no longer applies — the new column is authoritative.
  SELECT DISTINCT
    (entity_id) AS global_patient_id,
    (metadata->>'clinic_id')::UUID AS clinic_id
  FROM public.audit_events
  WHERE action IN ('MESSAGING_CONSENT_RECONFIRMED','MESSAGING_CONSENT_REVOKED')
    AND entity_type = 'global_patients'
    AND entity_id IS NOT NULL
    AND metadata->>'clinic_id' IS NOT NULL
)
SELECT
  pcr.global_patient_id,
  pcr.clinic_id,
  pcr.consent_to_messaging,
  pcr.consent_to_messaging_granted_at,
  -- The bridge: TRUE if the new column is TRUE, OR if a legacy grant
  -- still applies inside the 90-day grace window with no re-consent
  -- decision yet. Otherwise FALSE.
  (
    pcr.consent_to_messaging
    OR (
      lg.legacy_granted_at IS NOT NULL
      AND NOW() < (TIMESTAMPTZ '2026-04-29' + INTERVAL '90 days')
      AND rd.global_patient_id IS NULL
    )
  ) AS effective_consent,
  -- For diagnostics + the re-consent UI: how did we get TRUE?
  CASE
    WHEN pcr.consent_to_messaging THEN 'explicit'
    WHEN lg.legacy_granted_at IS NOT NULL
         AND NOW() < (TIMESTAMPTZ '2026-04-29' + INTERVAL '90 days')
         AND rd.global_patient_id IS NULL THEN 'legacy_grace'
    ELSE 'none'
  END AS source,
  lg.legacy_granted_at,
  -- 90-day grace expires at this timestamp (cutover date + 90 days).
  -- Hardcoded at view-creation time; the view's behavior is deterministic
  -- and does not drift with apply date.
  (TIMESTAMPTZ '2026-04-29' + INTERVAL '90 days') AS grace_expires_at,
  -- TRUE iff the patient has NOT yet been prompted to re-confirm at
  -- this clinic. The re-consent UI keys off this column to decide
  -- whether to show the modal for this clinic.
  (rd.global_patient_id IS NULL AND lg.legacy_granted_at IS NOT NULL
   AND NOT pcr.consent_to_messaging) AS needs_reconsent
FROM public.patient_clinic_records pcr
LEFT JOIN legacy_grants lg
  ON lg.global_patient_id = pcr.global_patient_id
 AND lg.clinic_id = pcr.clinic_id
LEFT JOIN reconfirmation_decisions rd
  ON rd.global_patient_id = pcr.global_patient_id
 AND rd.clinic_id = pcr.clinic_id;

COMMENT ON VIEW public.effective_messaging_consent IS
  'Bridges legacy patient_consent_grants (per-doctor messaging) with the new patient_clinic_records.consent_to_messaging (per-clinic). Returns effective_consent=TRUE during the 90-day grace window if either source affirms consent. Beyond the grace window, only the explicit consent column counts. Drop after re-consent migration completes (ORPH-V2-05). Reads through the underlying RLS via security_invoker.';

COMMENT ON COLUMN public.effective_messaging_consent.source IS
  'Diagnostic: explicit | legacy_grace | none. Tells callers whether the consent comes from the new column or the legacy bridge. The re-consent UI uses needs_reconsent to drive the modal show/hide.';

COMMENT ON COLUMN public.effective_messaging_consent.grace_expires_at IS
  'Hardcoded TIMESTAMPTZ ''2026-04-29'' + 90 days. After this timestamp the legacy fallback no longer counts. Cleanup mig (ORPH-V2-05) drops the view shortly after.';
