-- ============================================================
-- mig 096 — Prompt 6 Phase C: communication tables RLS
--          + audit_events resolved_global_patient_id generated col
-- Date: 2026-04-30 (cowork session 9)
-- Owner: Backend
--
-- Tables in scope:
--   1. audit_events  — adds resolved_global_patient_id generated column,
--                      partial index, + 2 v2 SELECT policies (clinic
--                      member + claimed-patient-self).
--                      Existing owners_view_audit_events policy stays
--                      (PERMISSIVE-OR coexistence).
--   2. messages, conversations, notifications — existing policies
--                      already cover the v2 model semantics
--                      (clinic-scoped + participant-self). Documented
--                      as deliberate "no v2 policy added" in build-06
--                      § 8 — see end of this file.
--
-- The generated column shape (refined Option A' from session 1):
--   resolved_global_patient_id = COALESCE(
--     NULLIF(metadata->>'global_patient_id','')::UUID,
--     CASE WHEN entity_type = 'global_patients' THEN entity_id END
--   )
--
-- Coverage on staging (snapshot 2026-04-30): 106 of 302 rows resolve
-- (35.1%). Rows that don't resolve are user-side admin events
-- (QUARANTINE_*, AUTH_PHONE_NORMALIZED, RECOVERY_*, USER_DEDUP_*,
-- DATA_LAYER_CUTOVER_COMPLETE, VIEW_PATIENT) which patients shouldn't
-- see anyway, plus 2 CREATE_CLINICAL_NOTE rows that need a JOIN to
-- resolve (deliberately excluded; clinical-note actions surface to
-- patients via the clinical_notes table itself, not the audit feed).
--
-- TEMPLATE per Empirical Lesson #2: post-condition smoke-probe runs
-- INSIDE BEGIN/COMMIT. auth.users SELECT runs BEFORE role switch.
-- ============================================================

BEGIN;

-- ── 1. audit_events: generated column + index ─────────────────────
-- IMMUTABLE expression: jsonb->> + NULLIF + cast + CASE are all
-- IMMUTABLE, so STORED generated column accepts this.

ALTER TABLE public.audit_events
  ADD COLUMN IF NOT EXISTS resolved_global_patient_id UUID
  GENERATED ALWAYS AS (
    COALESCE(
      NULLIF(metadata->>'global_patient_id', '')::UUID,
      CASE WHEN entity_type = 'global_patients' THEN entity_id END
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_audit_events_resolved_gpid
  ON public.audit_events(resolved_global_patient_id)
  WHERE resolved_global_patient_id IS NOT NULL;

COMMENT ON COLUMN public.audit_events.resolved_global_patient_id IS
  'mig 096: refined Option A''. COALESCE of metadata->>global_patient_id and entity_id where entity_type=global_patients. Used by audit_events patient-self SELECT v2 policy.';

-- ── 2. audit_events: 2 v2 SELECT policies ─────────────────────────
-- Existing `owners_view_audit_events` (OWNER-only) coexists via
-- PERMISSIVE-OR. The two new v2 policies expand visibility to:
--   (a) any clinic member (DOCTOR/FRONT_DESK, not just OWNER) for
--       audit rows scoped to their clinic
--   (b) the claimed patient for audit rows about themselves

CREATE POLICY audit_events_clinic_member_select_v2 ON public.audit_events
FOR SELECT TO authenticated
USING (
  audit_events.clinic_id IS NOT NULL
  AND public.is_clinic_member(audit_events.clinic_id, auth.uid())
);

CREATE POLICY audit_events_patient_self_select_v2 ON public.audit_events
FOR SELECT TO authenticated
USING (
  audit_events.resolved_global_patient_id IS NOT NULL
  AND public.can_patient_access_global_patient(
        audit_events.resolved_global_patient_id, auth.uid())
);

-- ── 3. messages / conversations / notifications: documented gap ───
-- Existing policies on these tables already implement the v2 semantic:
--
--   messages       — "Clinic-scoped message access" (SELECT) +
--                    participant policies
--   conversations  — 7 existing policies: clinic-scoped + participant
--                    self + post-visit creation
--   notifications  — users_view_own_notifications (ALL): user_id = auth.uid()
--
-- Adding parallel _v2 policies would be no-op redundancy. Mig 101
-- legacy cleanup will rename / consolidate naming for uniformity but
-- the behavioural surface is already correct. (Originally "mig 098"
-- in Prompt 6 spec; renumbered to 101 per session-16 ruling.)
--
-- Honest gap recorded in build-06 § 8.

-- ── POST-CONDITION (Empirical Lesson #2 template) ─────────────────
DO $post$
DECLARE
  v_count INT;
  v_smoke_uid UUID;
  v_resolved_count INT;
  v_total_count INT;
BEGIN
  -- 2 new audit_events policies present
  SELECT COUNT(*) INTO v_count FROM pg_policies
   WHERE schemaname='public' AND tablename='audit_events'
     AND policyname IN ('audit_events_clinic_member_select_v2',
                        'audit_events_patient_self_select_v2');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'mig 096 post-condition failed: expected 2 audit_events v2 policies, got %', v_count;
  END IF;

  -- Generated column populated for existing rows
  SELECT COUNT(*) FILTER (WHERE resolved_global_patient_id IS NOT NULL),
         COUNT(*)
    INTO v_resolved_count, v_total_count
    FROM public.audit_events;
  RAISE NOTICE 'mig 096 audit_events generated column: % of % rows resolve (%.1f%%)',
    v_resolved_count, v_total_count, (v_resolved_count::numeric / NULLIF(v_total_count,0) * 100);

  -- Smoke-probe: read auth.users.id BEFORE role switch
  SELECT id INTO v_smoke_uid FROM auth.users LIMIT 1;
  IF v_smoke_uid IS NULL THEN
    RAISE NOTICE 'mig 096 smoke-probe: no auth.users present, skipping';
  ELSE
    PERFORM set_config('role', 'authenticated', TRUE);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_smoke_uid::text, 'role', 'authenticated')::text, TRUE);

    -- These selects MUST not error 42P17.
    PERFORM COUNT(*) FROM public.audit_events;
    PERFORM COUNT(*) FROM public.messages;
    PERFORM COUNT(*) FROM public.conversations;
    PERFORM COUNT(*) FROM public.notifications;
  END IF;

  RAISE NOTICE 'mig 096 post-condition: 2 audit_events v2 policies + 4 smoke-probes passed';
END $post$;

COMMIT;
