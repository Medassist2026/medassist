-- ============================================================================
-- Migration 052: Drop legacy membership tables
-- ============================================================================
--
-- Background
-- ----------
-- clinic_memberships has been the source of truth for clinic linkage since
-- mig 018. Three legacy tables were kept around for backward compatibility:
--
--   - clinic_doctors      (pure linkage table — replaced by memberships)
--   - clinic_frontdesk    (pure linkage table — replaced by memberships)
--   - front_desk_staff    (METADATA table; only its clinic_id column is legacy)
--
-- Sequence of cleanup work:
--   - mig 026 (PART 1): reconciled legacy rows into clinic_memberships
--   - 2026-04-24 code pass: removed all dual-WRITES to legacy tables
--   - 2026-04-24 code pass: removed all read-fallbacks to legacy tables
--   - mig 052 (this): rewrites 4 RLS policies that still referenced legacy
--     tables, then drops the now-unreferenced tables + columns.
--
-- Pre-flight (run 2026-04-24 against mtmdotixlhwksyoordbl):
--   - Zero FK references INTO clinic_doctors or clinic_frontdesk
--   - Zero RLS policies ON either table
--   - 4 RLS policies on OTHER tables that referenced legacy in their bodies:
--     * appointments "Doctors and front desk can create appointments" (INSERT)
--     * appointments "Front desk can read clinic appointments"        (SELECT)
--     * invoice_requests "doctor_invoice_requests_read"               (SELECT)
--     * invoice_requests "frontdesk_invoice_requests"                 (ALL)
--     These are rewritten below to query clinic_memberships instead.
--   - clinic_doctors / clinic_frontdesk fully reconciled with clinic_memberships
--   - All in-tree code reads/writes against legacy objects already replaced
--     (see commit history; verified by grep)
--
-- After this migration:
--   - Re-generate supabase/lib/supabase/types.ts (Database type still
--     references the dropped objects).
-- ============================================================================


-- ── PART 1: Rewrite RLS policies that still reference legacy tables ─────────

-- appointments — frontdesk can create appointments for doctors in their clinic.
-- Old: clinic_doctors with role='frontdesk' inner query.
-- New: clinic_memberships with role IN ('FRONT_DESK','ASSISTANT') for the
--      current user, and OWNER/DOCTOR for the target doctor.
DROP POLICY IF EXISTS "Doctors and front desk can create appointments" ON public.appointments;
CREATE POLICY "Doctors and front desk can create appointments"
ON public.appointments FOR INSERT
WITH CHECK (
  -- Doctor creating their own appointment
  doctor_id = auth.uid()
  -- OR frontdesk/assistant creating for a doctor in the same clinic
  OR doctor_id IN (
    SELECT cm_doc.user_id
    FROM public.clinic_memberships cm_doc
    WHERE cm_doc.role IN ('OWNER','DOCTOR')
      AND cm_doc.status = 'ACTIVE'
      AND cm_doc.clinic_id IN (
        SELECT clinic_id
        FROM public.clinic_memberships
        WHERE user_id = auth.uid()
          AND role IN ('FRONT_DESK','ASSISTANT')
          AND status = 'ACTIVE'
      )
  )
);

-- appointments — frontdesk reads appointments for doctors in their clinic.
-- Old: clinic_doctors-derived doctor list.
-- New: clinic_memberships-derived doctor list (current user is any role in
--      the clinic, target row's doctor is OWNER/DOCTOR in the same clinic).
DROP POLICY IF EXISTS "Front desk can read clinic appointments" ON public.appointments;
CREATE POLICY "Front desk can read clinic appointments"
ON public.appointments FOR SELECT
USING (
  doctor_id IN (
    SELECT cm_doc.user_id
    FROM public.clinic_memberships cm_doc
    WHERE cm_doc.role IN ('OWNER','DOCTOR')
      AND cm_doc.status = 'ACTIVE'
      AND cm_doc.clinic_id IN (
        SELECT clinic_id
        FROM public.clinic_memberships
        WHERE user_id = auth.uid()
          AND status = 'ACTIVE'
      )
  )
);

-- invoice_requests — doctors read invoices for clinics they belong to.
-- Old: clinic_doctors filter.
-- New: clinic_memberships filter (role OWNER/DOCTOR).
DROP POLICY IF EXISTS "doctor_invoice_requests_read" ON public.invoice_requests;
CREATE POLICY "doctor_invoice_requests_read"
ON public.invoice_requests FOR SELECT
USING (
  clinic_id IN (
    SELECT clinic_id
    FROM public.clinic_memberships
    WHERE user_id = auth.uid()
      AND role IN ('OWNER','DOCTOR')
      AND status = 'ACTIVE'
  )
);

-- invoice_requests — frontdesk full access for their clinic.
-- Old: front_desk_staff.clinic_id filter.
-- New: clinic_memberships filter (role FRONT_DESK/ASSISTANT).
DROP POLICY IF EXISTS "frontdesk_invoice_requests" ON public.invoice_requests;
CREATE POLICY "frontdesk_invoice_requests"
ON public.invoice_requests FOR ALL
USING (
  clinic_id IN (
    SELECT clinic_id
    FROM public.clinic_memberships
    WHERE user_id = auth.uid()
      AND role IN ('FRONT_DESK','ASSISTANT')
      AND status = 'ACTIVE'
  )
);


-- front_desk_staff — clinic members can view frontdesk in same clinic.
-- Old: filter by front_desk_staff.clinic_id (which we're about to drop).
-- New: filter by joining clinic_memberships on the staff row's id.
DROP POLICY IF EXISTS "Clinic members can view frontdesk staff in same clinic" ON public.front_desk_staff;
CREATE POLICY "Clinic members can view frontdesk staff in same clinic"
ON public.front_desk_staff FOR SELECT
USING (
  id IN (
    SELECT cm_target.user_id
    FROM public.clinic_memberships cm_target
    WHERE cm_target.role IN ('FRONT_DESK','ASSISTANT')
      AND cm_target.status = 'ACTIVE'
      AND cm_target.clinic_id IN (
        SELECT clinic_id FROM public.clinic_memberships
        WHERE user_id = auth.uid() AND status = 'ACTIVE'
      )
  )
);


-- ── PART 2: Drop the legacy linkage tables ───────────────────────────────────

DROP TABLE IF EXISTS public.clinic_doctors;
DROP TABLE IF EXISTS public.clinic_frontdesk;


-- ── PART 3: Drop the legacy clinic_id column from the metadata table ────────

-- The FK constraint front_desk_staff_clinic_id_fkey auto-drops with the column.
ALTER TABLE public.front_desk_staff
  DROP COLUMN IF EXISTS clinic_id;


-- ── PART 4: Document the new contract ────────────────────────────────────────

COMMENT ON TABLE public.front_desk_staff IS
  'Frontdesk user metadata (id, full_name, unique_id, phone, email). Clinic '
  'linkage lives in clinic_memberships (role=FRONT_DESK or ASSISTANT). The '
  'legacy clinic_id column was dropped in mig 052; clinic_memberships is the '
  'sole source of truth.';
