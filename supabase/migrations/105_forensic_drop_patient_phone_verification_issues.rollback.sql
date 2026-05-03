-- ============================================================================
-- Rollback for migration 105 — FORENSIC DROP: patient_phone_verification_issues
--
-- Recreates the orphan table from the staging DDL (per
-- audits/database-audit/staging-schema-2026-05-03.sql:786-799). Does NOT
-- repopulate any rows — the table was empty on staging at the time of mig
-- 105's apply (per pre-drop assertion).
--
-- Run only if the drop in mig 105 needs to be reverted for an unforeseen
-- reason. Prefer authoring a forward migration that recreates the table
-- with the correct shape for whatever new product use case justifies its
-- return.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.patient_phone_verification_issues (
  id                  uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id          uuid NOT NULL,
  phone               text NOT NULL,
  issue_type          text NOT NULL,
  error_message       text,
  error_code          text,
  resolved            boolean DEFAULT false,
  resolved_by         uuid,
  resolved_at         timestamp with time zone,
  resolution_action   text,
  resolution_notes    text,
  created_at          timestamp with time zone DEFAULT now(),
  CONSTRAINT patient_phone_verification_issues_pkey PRIMARY KEY (id),
  CONSTRAINT patient_phone_verification_issues_issue_type_check
    CHECK (issue_type = ANY (ARRAY['sms_delivery_failed'::text, 'otp_delivery_failed'::text,
                                    'patient_reported_wrong'::text, 'staff_flagged'::text,
                                    'duplicate_detected'::text])),
  CONSTRAINT patient_phone_verification_issues_resolution_action_check
    CHECK (resolution_action = ANY (ARRAY['phone_corrected'::text, 'verified_correct'::text,
                                           'account_merged'::text, 'dismissed'::text]))
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_phone_verification_issues_patient_id_fkey') THEN
    ALTER TABLE public.patient_phone_verification_issues
      ADD CONSTRAINT patient_phone_verification_issues_patient_id_fkey
      FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_phone_verification_issues_resolved_by_fkey') THEN
    ALTER TABLE public.patient_phone_verification_issues
      ADD CONSTRAINT patient_phone_verification_issues_resolved_by_fkey
      FOREIGN KEY (resolved_by) REFERENCES public.users(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_phone_issues_patient
  ON public.patient_phone_verification_issues USING btree (patient_id);
CREATE INDEX IF NOT EXISTS idx_phone_issues_unresolved
  ON public.patient_phone_verification_issues USING btree (resolved, created_at DESC)
  WHERE (resolved = false);

ALTER TABLE public.patient_phone_verification_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view phone verification issues" ON public.patient_phone_verification_issues;
CREATE POLICY "Staff can view phone verification issues"
  ON public.patient_phone_verification_issues
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND users.role = ANY (ARRAY['doctor'::text, 'frontdesk'::text])
    )
  );

COMMIT;
