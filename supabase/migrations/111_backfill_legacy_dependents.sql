-- ============================================================================
-- Migration 111 — Backfill 3 legacy dependents (B07 Phase B)
--
-- Audit references:
--   * audits/B07-architectural-review-2026-05-10.md § 6 (legacy data state;
--     3 dependents on patients table)
--   * audits/b07-phase-b-execution-2026-05-10.md § Decision 4 (Mo's Q2 ruling
--     for dependent #1 — Option A, create parent gp + relink child)
--   * audits/b07-phase-b-execution-2026-05-10.md § Decision 6 (review-doc
--     drift: live staging has 2 phone-lookup cases, not 1 as review claimed)
--   * Empirical Lessons #2 (smoke-probe assertion), #16 (verify against
--     ground truth; pre-work query confirmed each dependent's resolution
--     path before this migration was written)
--   * DECISIONS_LOG.md D-068 (cross-clinic sharing — minors share like
--     adults; backfill produces the data shape this assumes)
--
-- Originated by: cowork session 2026-05-10 (B07 Phase B)
-- Locked rulings: 2026-05-09 / 2026-05-10 — backfill 3 legacy dependents in
--                 Phase B; legacy patients rows stay until Prompt 6.5 (no
--                 row deletion). Mo's Q2 ruling specifies Option A for
--                 dependent #1 (create new parent gp, relink child gp,
--                 emit audit). The placeholder display_name 'ولي أمر فاطمة أحمد'
--                 is correctable by clinic frontdesk later.
--
-- What this migration does
-- ------------------------
-- For each of the 3 live legacy dependents (identified by patient.id at
-- pre-work time), set the corresponding global_patients row's is_minor=TRUE
-- and guardian_global_patient_id pointing at the resolved guardian gp.
--
-- Resolution paths (one per dependent):
--
--   §111.1 — Dependent #3 احمد محمد (patient `fdbc93ce…`, child gp `fa8e3189…`)
--     guardian_id FK → patients.id `4cc900cf…` → that patient's gp
--     `4cc900cf…` (same uuid, old convention). Guardian has phone
--     +201111111113. Direct FK lookup; no ambiguity.
--
--   §111.2 — Dependent #2 نوح عمر (patient `81696b8a…`, child gp `50f41bd5…`)
--     guardian_id IS NULL; parent_phone is `01111111105` →
--     `+201111111105`. Phone lookup finds gp `7a987351…` ("عمر فاروق").
--     Phone-lookup path; the only candidate gp at that phone.
--
--   §111.3 — Dependent #1 فاطمة أحمد (patient `6036cd97…`, child gp
--     `6036cd97…` — same uuid, old convention)
--     guardian_id IS NULL; parent_phone is `01234567890` →
--     `+201234567890`. Phone lookup self-resolves to the child's own gp
--     (the child gp's normalized_phone IS the parent's phone, an old data
--     convention). NO separate parent gp exists. Per Mo's Q2 ruling Option A:
--       (a) Create a new parent gp for `+201234567890` with display_name
--           'ولي أمر فاطمة أحمد' (placeholder), is_minor=FALSE, claimed=FALSE,
--           account_status='active'.
--       (b) Update child gp `6036cd97…`: set normalized_phone=NULL
--           (release the parent's phone), is_minor=TRUE,
--           guardian_global_patient_id=<new parent gp id>.
--       (c) Emit audit `BACKFILL_DEPENDENT_GUARDIAN_RECONSTRUCTION`
--           with both gp ids and the resolution rationale in metadata.
--
-- Legacy patients rows are NOT modified. They stay until Prompt 6.5
-- (Legacy Cleanup). is_dependent on the legacy table remains TRUE on all 3.
--
-- ABORT semantics
-- ---------------
-- If any of the 3 dependents cannot be resolved (e.g., the guardian gp
-- has been deleted between pre-work and apply, or schema state diverges),
-- the migration RAISES EXCEPTION with a clear message and rolls back. Per
-- Phase B prompt: "If no guardian can be resolved, ABORT the migration".
--
-- Rollback
-- --------
-- REVERSIBLE. Companion: 111_backfill_legacy_dependents.rollback.sql.
-- The rollback resets is_minor=FALSE and guardian_global_patient_id=NULL
-- on the 3 child gps, deletes the new parent gp created for dependent #1,
-- and emits a counter-audit. It does NOT restore the dependent #1 child
-- gp's normalized_phone to '+201234567890' (the rollback would have to
-- decide what value to restore; the safer behavior is to leave the column
-- NULL and let any future data-hygiene decide manually).
--
-- ============================================================================

DO $$
DECLARE
  -- Pinned dependent identifiers (from pre-work verification 2026-05-10)
  k_dep1_patient_id   CONSTANT UUID := '6036cd97-f149-449f-8975-cb7cc5651059';  -- فاطمة أحمد
  k_dep1_child_gp_id  CONSTANT UUID := '6036cd97-f149-449f-8975-cb7cc5651059';  -- (same uuid, old convention)
  k_dep1_parent_phone CONSTANT TEXT := '+201234567890';

  k_dep2_patient_id   CONSTANT UUID := '81696b8a-3b38-4912-a2e9-b06b151df066';  -- نوح عمر
  k_dep2_child_gp_id  CONSTANT UUID := '50f41bd5-f41d-414a-9105-a2fade215cc3';
  k_dep2_parent_phone CONSTANT TEXT := '+201111111105';

  k_dep3_patient_id   CONSTANT UUID := 'fdbc93ce-cbca-4929-8f98-44949b6b3af1';  -- احمد محمد
  k_dep3_child_gp_id  CONSTANT UUID := 'fa8e3189-9260-424c-a62e-ba8f108265dc';
  k_dep3_guardian_patient_id CONSTANT UUID := '4cc900cf-1c5a-43a2-91ab-a3958b43627c';

  -- Resolved guardian gp ids
  v_dep1_guardian_gp UUID;
  v_dep2_guardian_gp UUID;
  v_dep3_guardian_gp UUID;

  v_minor_count_before INT;
  v_minor_count_after INT;
  v_pinned_rows_before INT;
  v_pinned_rows_after INT;
BEGIN
  -- Defensive precondition: confirm the 3 child gps still exist with
  -- is_minor=FALSE (otherwise this migration would have already applied).
  SELECT COUNT(*) INTO v_pinned_rows_before
    FROM public.global_patients
   WHERE id IN (k_dep1_child_gp_id, k_dep2_child_gp_id, k_dep3_child_gp_id);
  IF v_pinned_rows_before <> 3 THEN
    RAISE EXCEPTION
      'mig 111: expected 3 pinned child gps to exist; found %. Aborting.',
      v_pinned_rows_before;
  END IF;

  SELECT COUNT(*) INTO v_minor_count_before
    FROM public.global_patients WHERE is_minor = TRUE;
  IF v_minor_count_before <> 0 THEN
    RAISE EXCEPTION
      'mig 111: expected 0 existing is_minor=TRUE rows pre-backfill; found %. Has this migration already applied?',
      v_minor_count_before;
  END IF;

  -- =======================================================================
  -- §111.1 — Dependent #3 (احمد محمد): FK lookup
  -- =======================================================================
  SELECT p.global_patient_id INTO v_dep3_guardian_gp
    FROM public.patients p
   WHERE p.id = k_dep3_guardian_patient_id;
  IF v_dep3_guardian_gp IS NULL THEN
    RAISE EXCEPTION
      'mig 111 §111.1 (dependent #3 احمد محمد): guardian patient % did not resolve to a global_patient_id. Aborting.',
      k_dep3_guardian_patient_id;
  END IF;

  UPDATE public.global_patients
     SET is_minor = TRUE,
         guardian_global_patient_id = v_dep3_guardian_gp
   WHERE id = k_dep3_child_gp_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mig 111 §111.1: UPDATE on child gp % returned 0 rows.', k_dep3_child_gp_id;
  END IF;

  INSERT INTO public.audit_events (
    action, actor_kind, actor_user_id,
    entity_type, entity_id, metadata, created_at
  ) VALUES (
    'BACKFILL_DEPENDENT_GUARDIAN_FK_LOOKUP', 'migration', NULL,
    'global_patients', k_dep3_child_gp_id,
    jsonb_build_object(
      'source', 'migration_111',
      'dependent_path', 'fk_lookup',
      'patient_id', k_dep3_patient_id,
      'child_gp_id', k_dep3_child_gp_id,
      'guardian_patient_id', k_dep3_guardian_patient_id,
      'guardian_gp_id', v_dep3_guardian_gp
    ),
    NOW()
  );

  -- =======================================================================
  -- §111.2 — Dependent #2 (نوح عمر): phone lookup
  -- =======================================================================
  SELECT id INTO v_dep2_guardian_gp
    FROM public.global_patients
   WHERE normalized_phone = k_dep2_parent_phone
     AND id <> k_dep2_child_gp_id  -- exclude self (defensive; shouldn't match anyway since child gp has NULL phone)
   LIMIT 1;
  IF v_dep2_guardian_gp IS NULL THEN
    RAISE EXCEPTION
      'mig 111 §111.2 (dependent #2 نوح عمر): no gp found at parent phone %. Aborting.',
      k_dep2_parent_phone;
  END IF;

  UPDATE public.global_patients
     SET is_minor = TRUE,
         guardian_global_patient_id = v_dep2_guardian_gp
   WHERE id = k_dep2_child_gp_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mig 111 §111.2: UPDATE on child gp % returned 0 rows.', k_dep2_child_gp_id;
  END IF;

  INSERT INTO public.audit_events (
    action, actor_kind, actor_user_id,
    entity_type, entity_id, metadata, created_at
  ) VALUES (
    'BACKFILL_DEPENDENT_GUARDIAN_PHONE_LOOKUP', 'migration', NULL,
    'global_patients', k_dep2_child_gp_id,
    jsonb_build_object(
      'source', 'migration_111',
      'dependent_path', 'phone_lookup',
      'patient_id', k_dep2_patient_id,
      'child_gp_id', k_dep2_child_gp_id,
      'parent_phone_normalized', k_dep2_parent_phone,
      'guardian_gp_id', v_dep2_guardian_gp
    ),
    NOW()
  );

  -- =======================================================================
  -- §111.3 — Dependent #1 (فاطمة أحمد): RECONSTRUCTION (Option A)
  -- =======================================================================
  -- Sanity: confirm no other gp at this phone besides the child gp itself.
  -- If this assumption breaks (someone added a parent gp between pre-work
  -- and apply), prefer that pre-existing gp over reconstruction.
  SELECT id INTO v_dep1_guardian_gp
    FROM public.global_patients
   WHERE normalized_phone = k_dep1_parent_phone
     AND id <> k_dep1_child_gp_id
   LIMIT 1;

  IF v_dep1_guardian_gp IS NULL THEN
    -- Step 1 of 3: release the parent's phone from the child gp first.
    -- The child gp currently holds k_dep1_parent_phone in normalized_phone
    -- (an old data convention). The unique index on normalized_phone would
    -- block the new parent gp INSERT below if we didn't do this first.
    -- Setting normalized_phone=NULL doesn't violate any CHECK constraint
    -- (mig 109's only normalized_phone-touching predicates exempt NULL).
    UPDATE public.global_patients
       SET normalized_phone = NULL
     WHERE id = k_dep1_child_gp_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'mig 111 §111.3 step 1: could not release child gp phone.';
    END IF;

    -- Step 2 of 3: create the new parent gp at the now-free phone.
    INSERT INTO public.global_patients (
      id, normalized_phone, display_name, is_minor, guardian_global_patient_id,
      claimed, claimed_user_id, account_status, preferred_language
    ) VALUES (
      gen_random_uuid(),
      k_dep1_parent_phone,
      'ولي أمر فاطمة أحمد',  -- placeholder, correctable by clinic frontdesk
      FALSE,
      NULL,
      FALSE,
      NULL,
      'active',
      'ar'
    )
    RETURNING id INTO v_dep1_guardian_gp;

    INSERT INTO public.audit_events (
      action, actor_kind, actor_user_id,
      entity_type, entity_id, metadata, created_at
    ) VALUES (
      'BACKFILL_DEPENDENT_GUARDIAN_RECONSTRUCTION', 'migration', NULL,
      'global_patients', v_dep1_guardian_gp,
      jsonb_build_object(
        'source', 'migration_111',
        'dependent_path', 'reconstruction',
        'reason', 'phone_lookup_self_resolves: child gp held parent phone in normalized_phone column (old data convention); no separate parent gp existed',
        'patient_id', k_dep1_patient_id,
        'child_gp_id', k_dep1_child_gp_id,
        'parent_phone_normalized', k_dep1_parent_phone,
        'reconstructed_guardian_gp_id', v_dep1_guardian_gp,
        'placeholder_display_name', 'ولي أمر فاطمة أحمد',
        'placeholder_correction_path', 'clinic frontdesk patient profile edit'
      ),
      NOW()
    );
  ELSE
    -- A separate parent gp already exists (someone created it between
    -- pre-work and apply, or a hand-fix landed). Use it; emit a different
    -- audit action to make the divergence visible.
    INSERT INTO public.audit_events (
      action, actor_kind, actor_user_id,
      entity_type, entity_id, metadata, created_at
    ) VALUES (
      'BACKFILL_DEPENDENT_GUARDIAN_PRE_EXISTING_PARENT_GP', 'migration', NULL,
      'global_patients', k_dep1_child_gp_id,
      jsonb_build_object(
        'source', 'migration_111',
        'dependent_path', 'pre_existing_parent_gp',
        'patient_id', k_dep1_patient_id,
        'child_gp_id', k_dep1_child_gp_id,
        'parent_phone_normalized', k_dep1_parent_phone,
        'guardian_gp_id', v_dep1_guardian_gp,
        'note', 'Found a pre-existing parent gp at the lookup phone — used it instead of reconstructing.'
      ),
      NOW()
    );
  END IF;

  -- Now flip the child gp: release the parent's phone, mark as minor,
  -- attach guardian. Single UPDATE so all CHECK constraints (mig 109)
  -- are satisfied at every committed state.
  UPDATE public.global_patients
     SET normalized_phone = NULL,
         is_minor = TRUE,
         guardian_global_patient_id = v_dep1_guardian_gp
   WHERE id = k_dep1_child_gp_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mig 111 §111.3: UPDATE on child gp % returned 0 rows.', k_dep1_child_gp_id;
  END IF;

  -- Emit a separate audit for the child-gp flip itself (paired with the
  -- guardian audit above — together they capture the full Option A action).
  INSERT INTO public.audit_events (
    action, actor_kind, actor_user_id,
    entity_type, entity_id, metadata, created_at
  ) VALUES (
    'BACKFILL_DEPENDENT_CHILD_GP_FLIPPED_TO_MINOR', 'migration', NULL,
    'global_patients', k_dep1_child_gp_id,
    jsonb_build_object(
      'source', 'migration_111',
      'patient_id', k_dep1_patient_id,
      'child_gp_id', k_dep1_child_gp_id,
      'guardian_gp_id', v_dep1_guardian_gp,
      'released_normalized_phone', k_dep1_parent_phone,
      'note', 'Released parent phone from child gp; phone now anchored on the parent gp.'
    ),
    NOW()
  );

  -- =======================================================================
  -- §111.4 — Smoke probe (post-backfill assertions)
  -- =======================================================================
  SELECT COUNT(*) INTO v_minor_count_after
    FROM public.global_patients WHERE is_minor = TRUE;
  IF v_minor_count_after <> 3 THEN
    RAISE EXCEPTION
      'mig 111 smoke probe: expected exactly 3 is_minor=TRUE rows post-backfill; found %.',
      v_minor_count_after;
  END IF;

  -- All 3 must have a non-NULL guardian.
  PERFORM 1 FROM public.global_patients
   WHERE is_minor = TRUE AND guardian_global_patient_id IS NULL LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'mig 111 smoke probe: at least one minor lacks guardian_global_patient_id.';
  END IF;

  -- All 3 must have NULL claimed_user_id (CHECK 109.3 enforces this; double-check).
  PERFORM 1 FROM public.global_patients
   WHERE is_minor = TRUE AND claimed_user_id IS NOT NULL LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'mig 111 smoke probe: at least one minor has claimed_user_id set; CHECK 109.3 should have prevented this.';
  END IF;

  -- The 3 pinned ids must all be the minors.
  PERFORM 1 FROM public.global_patients
   WHERE is_minor = TRUE
     AND id NOT IN (k_dep1_child_gp_id, k_dep2_child_gp_id, k_dep3_child_gp_id) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'mig 111 smoke probe: an unexpected gp was flipped to is_minor.';
  END IF;

  -- Legacy patients rows must remain unchanged: still 3 dependents, IDs preserved.
  SELECT COUNT(*) INTO v_pinned_rows_after
    FROM public.patients
   WHERE id IN (k_dep1_patient_id, k_dep2_patient_id, k_dep3_patient_id)
     AND is_dependent = TRUE;
  IF v_pinned_rows_after <> 3 THEN
    RAISE EXCEPTION
      'mig 111 smoke probe: legacy patients rows mutated unexpectedly (expected 3 with is_dependent=TRUE; found %).',
      v_pinned_rows_after;
  END IF;

  RAISE NOTICE 'mig 111 backfill: 3 dependents flipped to is_minor=TRUE with guardian_global_patient_id resolved (FK / phone / reconstruction). Legacy patients rows preserved.';
END;
$$ LANGUAGE plpgsql;
