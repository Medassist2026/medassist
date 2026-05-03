-- ============================================================
-- mig 094 — Prompt 6 Phase C: clinical-data tables RLS rewrite
-- Date: 2026-04-30 (cowork session 4)
-- Owner: Backend
--
-- Tables in scope (verified on staging):
--   1. clinical_notes      — has global_patient_id + clinic_id (NOT NULL)
--   2. prescription_items  — has global_patient_id + clinic_id (NULLABLE)
--   3. lab_results         — has global_patient_id + clinic_id (NOT NULL)
--   4. lab_orders          — has global_patient_id + clinic_id (NOT NULL)
--   5. imaging_orders      — has global_patient_id + clinic_id (NOT NULL)
--   6. vital_signs         — has global_patient_id + clinic_id (NOT NULL)
--
-- Tables Mo's Prompt 6 listed but that DO NOT exist on staging
-- (logged in build-06-results § 8 deviations — open question 3
-- resolved):
--   * prescriptions          — replaced by prescription_items
--   * medications            — never shipped
--   * medication_intake_log  — never shipped
--   * encounters             — clinical_notes plays this role
--
-- Tables Mo's Prompt 6 listed under clinical-data that BELONG
-- ELSEWHERE:
--   * prescription_templates — exists on staging but is doctor-scoped
--                              (doctor_id, no patient FK). Moves to
--                              mig 097 (non-patient).
--
-- Strategy
-- --------
-- Three policies per table:
--   A) <table>_select_v2                 PERMISSIVE  SELECT
--      USING (can_view_patient_data_at_clinic(global_patient_id, clinic_id, auth.uid()))
--      → adds cross-clinic read via active patient_data_shares
--
--   B) <table>_write_clinic_member_only  RESTRICTIVE INSERT
--      WITH CHECK (clinic_id IS NULL OR is_clinic_member(clinic_id, auth.uid()))
--      → enforces directional-consent ASYMMETRY: cross-clinic READ
--        does NOT imply cross-clinic WRITE.  This is the gate that
--        makes Phase D matrix scenarios 9-10 pass:
--           • Doctor at clinic B with active share, INSERTs at clinic A → MUST FAIL
--           • Doctor at clinic B with active share, UPDATEs row owned by A → MUST FAIL
--
--   C) <table>_update_clinic_member_only RESTRICTIVE UPDATE
--      USING (clinic_id IS NULL OR is_clinic_member(clinic_id, auth.uid()))
--      WITH CHECK (clinic_id IS NULL OR is_clinic_member(clinic_id, auth.uid()))
--      → blocks UPDATE on rows the user can SEE (via cross-clinic share)
--        but isn't a member of.  USING blocks the read-for-update;
--        WITH CHECK blocks attempts to move a row's clinic_id outside
--        the user's membership.
--
-- RESTRICTIVE policies AND-combine after the existing PERMISSIVE
-- policies OR-combine — net behavior: any user that satisfies SOME
-- existing PERMISSIVE INSERT/UPDATE must ALSO be a clinic member
-- of the row's clinic_id (or clinic_id is NULL).
--
-- All RESTRICTIVE policies scoped TO authenticated so service_role
-- (used by SECURITY DEFINER RPCs and migrations) is not constrained.
--
-- DELETE
-- ------
-- None of the 6 tables currently have DELETE policies.  In Postgres,
-- absence of any DELETE policy on an RLS-enabled table = deny-all
-- DELETE for all non-bypass roles.  No mig 094 work needed.
--
-- Coexistence with legacy
-- -----------------------
-- Per Mo's § C1 ruling: PERMISSIVE-OR for SELECT (legacy stays in
-- place; mig 094's v2 SELECT only ADDS cross-clinic visibility, never
-- removes existing grants).  The RESTRICTIVE INSERT/UPDATE constrain
-- the existing PERMISSIVE policies — this is the ONE deliberate
-- non-additive part of mig 094, justified by the directional-consent
-- write-asymmetry contract.  Mig 101 cleans up over-permissive
-- legacy policies (e.g. "Doctors can create clinical notes" with no
-- clinic_id check) once Phase D run #3 passes. (Originally referred
-- to as "mig 098" in Prompt 6 spec; renumbered to 101 per session-16
-- ruling 2026-05-02 to make room for Phase F migs 098/099/100.)
--
-- Closures: this migration's policies enable the cross-clinic read
-- path that the data layer expects but does not by itself close any
-- specific orphan ledger entry. ORPH-V*-RLS entries closed by
-- migs 093+094 collectively are reported in the Phase H results doc.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- 1. clinical_notes
-- ────────────────────────────────────────────────────────────────────

CREATE POLICY clinical_notes_select_v2 ON public.clinical_notes
FOR SELECT TO authenticated
USING (
  public.can_view_patient_data_at_clinic(
    clinical_notes.global_patient_id,
    clinical_notes.clinic_id,
    auth.uid()
  )
);

CREATE POLICY clinical_notes_write_clinic_member_only ON public.clinical_notes
AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  clinical_notes.clinic_id IS NULL
  OR public.is_clinic_member(clinical_notes.clinic_id, auth.uid())
);

CREATE POLICY clinical_notes_update_clinic_member_only ON public.clinical_notes
AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (
  clinical_notes.clinic_id IS NULL
  OR public.is_clinic_member(clinical_notes.clinic_id, auth.uid())
)
WITH CHECK (
  clinical_notes.clinic_id IS NULL
  OR public.is_clinic_member(clinical_notes.clinic_id, auth.uid())
);


-- ────────────────────────────────────────────────────────────────────
-- 2. prescription_items
-- ────────────────────────────────────────────────────────────────────

CREATE POLICY prescription_items_select_v2 ON public.prescription_items
FOR SELECT TO authenticated
USING (
  public.can_view_patient_data_at_clinic(
    prescription_items.global_patient_id,
    prescription_items.clinic_id,
    auth.uid()
  )
);

CREATE POLICY prescription_items_write_clinic_member_only ON public.prescription_items
AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  prescription_items.clinic_id IS NULL
  OR public.is_clinic_member(prescription_items.clinic_id, auth.uid())
);

CREATE POLICY prescription_items_update_clinic_member_only ON public.prescription_items
AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (
  prescription_items.clinic_id IS NULL
  OR public.is_clinic_member(prescription_items.clinic_id, auth.uid())
)
WITH CHECK (
  prescription_items.clinic_id IS NULL
  OR public.is_clinic_member(prescription_items.clinic_id, auth.uid())
);


-- ────────────────────────────────────────────────────────────────────
-- 3. lab_results
-- ────────────────────────────────────────────────────────────────────

CREATE POLICY lab_results_select_v2 ON public.lab_results
FOR SELECT TO authenticated
USING (
  public.can_view_patient_data_at_clinic(
    lab_results.global_patient_id,
    lab_results.clinic_id,
    auth.uid()
  )
);

CREATE POLICY lab_results_write_clinic_member_only ON public.lab_results
AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  public.is_clinic_member(lab_results.clinic_id, auth.uid())
);

CREATE POLICY lab_results_update_clinic_member_only ON public.lab_results
AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (public.is_clinic_member(lab_results.clinic_id, auth.uid()))
WITH CHECK (public.is_clinic_member(lab_results.clinic_id, auth.uid()));


-- ────────────────────────────────────────────────────────────────────
-- 4. lab_orders
-- ────────────────────────────────────────────────────────────────────

CREATE POLICY lab_orders_select_v2 ON public.lab_orders
FOR SELECT TO authenticated
USING (
  public.can_view_patient_data_at_clinic(
    lab_orders.global_patient_id,
    lab_orders.clinic_id,
    auth.uid()
  )
);

CREATE POLICY lab_orders_write_clinic_member_only ON public.lab_orders
AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  public.is_clinic_member(lab_orders.clinic_id, auth.uid())
);

CREATE POLICY lab_orders_update_clinic_member_only ON public.lab_orders
AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (public.is_clinic_member(lab_orders.clinic_id, auth.uid()))
WITH CHECK (public.is_clinic_member(lab_orders.clinic_id, auth.uid()));


-- ────────────────────────────────────────────────────────────────────
-- 5. imaging_orders
-- ────────────────────────────────────────────────────────────────────

CREATE POLICY imaging_orders_select_v2 ON public.imaging_orders
FOR SELECT TO authenticated
USING (
  public.can_view_patient_data_at_clinic(
    imaging_orders.global_patient_id,
    imaging_orders.clinic_id,
    auth.uid()
  )
);

CREATE POLICY imaging_orders_write_clinic_member_only ON public.imaging_orders
AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  public.is_clinic_member(imaging_orders.clinic_id, auth.uid())
);

CREATE POLICY imaging_orders_update_clinic_member_only ON public.imaging_orders
AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (public.is_clinic_member(imaging_orders.clinic_id, auth.uid()))
WITH CHECK (public.is_clinic_member(imaging_orders.clinic_id, auth.uid()));


-- ────────────────────────────────────────────────────────────────────
-- 6. vital_signs
-- ────────────────────────────────────────────────────────────────────

CREATE POLICY vital_signs_select_v2 ON public.vital_signs
FOR SELECT TO authenticated
USING (
  public.can_view_patient_data_at_clinic(
    vital_signs.global_patient_id,
    vital_signs.clinic_id,
    auth.uid()
  )
);

CREATE POLICY vital_signs_write_clinic_member_only ON public.vital_signs
AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  public.is_clinic_member(vital_signs.clinic_id, auth.uid())
);

CREATE POLICY vital_signs_update_clinic_member_only ON public.vital_signs
AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (public.is_clinic_member(vital_signs.clinic_id, auth.uid()))
WITH CHECK (public.is_clinic_member(vital_signs.clinic_id, auth.uid()));


COMMIT;

-- ============================================================
-- Post-condition: 18 v2/restrictive policies present (3 per table × 6 tables)
-- ============================================================
DO $$
DECLARE
  expected TEXT[] := ARRAY[
    'clinical_notes_select_v2','clinical_notes_write_clinic_member_only','clinical_notes_update_clinic_member_only',
    'prescription_items_select_v2','prescription_items_write_clinic_member_only','prescription_items_update_clinic_member_only',
    'lab_results_select_v2','lab_results_write_clinic_member_only','lab_results_update_clinic_member_only',
    'lab_orders_select_v2','lab_orders_write_clinic_member_only','lab_orders_update_clinic_member_only',
    'imaging_orders_select_v2','imaging_orders_write_clinic_member_only','imaging_orders_update_clinic_member_only',
    'vital_signs_select_v2','vital_signs_write_clinic_member_only','vital_signs_update_clinic_member_only'
  ];
  p TEXT;
  v_restrictive_count INT;
BEGIN
  FOREACH p IN ARRAY expected LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname=p) THEN
      RAISE EXCEPTION 'mig 094 post-condition failed: missing policy %', p;
    END IF;
  END LOOP;

  -- Verify the RESTRICTIVE policies are actually RESTRICTIVE (Postgres records this in pg_policies.permissive)
  SELECT COUNT(*) INTO v_restrictive_count
  FROM pg_policies
  WHERE schemaname='public'
    AND policyname LIKE '%_clinic_member_only'
    AND permissive = 'RESTRICTIVE';
  IF v_restrictive_count <> 12 THEN
    RAISE EXCEPTION 'mig 094 post-condition failed: expected 12 RESTRICTIVE policies, got %', v_restrictive_count;
  END IF;

  RAISE NOTICE 'mig 094 post-condition: 6 PERMISSIVE SELECT v2 + 12 RESTRICTIVE INSERT/UPDATE policies present';
END $$;
