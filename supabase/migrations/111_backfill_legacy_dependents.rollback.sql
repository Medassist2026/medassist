-- ============================================================================
-- Rollback for migration 111 — Backfill 3 legacy dependents.
--
-- Resets the 3 child gps and deletes the reconstructed parent gp from
-- §111.3 (if present). Does NOT restore dep #1 child gp's normalized_phone
-- to '+201234567890' (rollback can't safely decide; leaving column NULL is
-- the safer state).
-- ============================================================================

DO $$
DECLARE
  k_dep1_child_gp_id  CONSTANT UUID := '6036cd97-f149-449f-8975-cb7cc5651059';
  k_dep2_child_gp_id  CONSTANT UUID := '50f41bd5-f41d-414a-9105-a2fade215cc3';
  k_dep3_child_gp_id  CONSTANT UUID := 'fa8e3189-9260-424c-a62e-ba8f108265dc';
  k_dep1_parent_phone CONSTANT TEXT := '+201234567890';

  v_reconstructed_gp UUID;
BEGIN
  -- Find the reconstructed parent gp via its audit row (most reliable).
  SELECT (metadata->>'reconstructed_guardian_gp_id')::uuid INTO v_reconstructed_gp
    FROM public.audit_events
   WHERE action = 'BACKFILL_DEPENDENT_GUARDIAN_RECONSTRUCTION'
     AND (metadata->>'patient_id')::uuid = k_dep1_child_gp_id
   ORDER BY created_at DESC LIMIT 1;

  -- Step 1: clear FK references on child gps (so we can delete the parent).
  UPDATE public.global_patients
     SET is_minor = FALSE,
         guardian_global_patient_id = NULL
   WHERE id IN (k_dep1_child_gp_id, k_dep2_child_gp_id, k_dep3_child_gp_id);

  -- Step 2: delete the reconstructed parent gp (if present and not claimed).
  IF v_reconstructed_gp IS NOT NULL THEN
    DELETE FROM public.global_patients
     WHERE id = v_reconstructed_gp
       AND claimed = FALSE  -- defensive; do not delete if a real user claimed it
       AND display_name = 'ولي أمر فاطمة أحمد';  -- defensive; do not delete if name has been corrected
  END IF;

  -- Step 3: counter-audit.
  INSERT INTO public.audit_events (
    action, actor_kind, actor_user_id,
    entity_type, entity_id, metadata, created_at
  ) VALUES (
    'ROLLBACK_111_BACKFILL_LEGACY_DEPENDENTS', 'migration', NULL,
    'system', NULL,
    jsonb_build_object(
      'source', 'migration_111_rollback',
      'reset_minor_gps', jsonb_build_array(
        k_dep1_child_gp_id, k_dep2_child_gp_id, k_dep3_child_gp_id),
      'deleted_parent_gp', v_reconstructed_gp,
      'note_unrestored_field', 'dep #1 child gp normalized_phone NOT restored to ' || k_dep1_parent_phone || '; manual fix needed if rollback was intentional in production'
    ),
    NOW()
  );

  RAISE NOTICE 'mig 111 rollback: 3 child gps reset to is_minor=FALSE / guardian=NULL; reconstructed parent gp deleted (%).', v_reconstructed_gp;
END;
$$ LANGUAGE plpgsql;
