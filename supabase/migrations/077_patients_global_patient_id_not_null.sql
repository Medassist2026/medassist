-- ============================================================================
-- Migration 077 — Flip patients.global_patient_id NOT NULL
--                   (closes ORPH-V2-07 part 2)
--
-- Conceptual name in audits/EXECUTION_PROMPTS.md: mig 075.2.
--
-- Implements: Build 03 Phase B Step 4 (B5).
--
-- WHY THIS MIGRATION EXISTS
--   Build 02 (mig 073) added patients.global_patient_id as nullable so
--   that the 3 quarantined patients rows could remain in place without
--   forcing premature data decisions. Mig 076 just resolved the
--   quarantine (sentinel for every patients row), so every patients
--   row now has a global_patient_id. This migration makes that
--   invariant structural — at the schema level, "every patients row
--   has identity in the network" becomes a guarantee.
--
-- DEPENDS ON:
--   - mig 076 (quarantine emptied; every patients row has global_patient_id).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 077.1 — Pre-flight assertion: refuses to run if any quarantine remains
--          OR if any patients row has global_patient_id IS NULL.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_unresolved_quarantine INTEGER;
  v_patients_without_global INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_unresolved_quarantine
    FROM public._phone_normalize_quarantine;

  IF v_unresolved_quarantine > 0 THEN
    RAISE EXCEPTION
      'mig 077 blocked: % unresolved quarantine rows. Resolve via mig 076 first.',
      v_unresolved_quarantine;
  END IF;

  SELECT COUNT(*) INTO v_patients_without_global
    FROM public.patients
   WHERE global_patient_id IS NULL;

  IF v_patients_without_global > 0 THEN
    RAISE EXCEPTION
      'mig 077 blocked: % patients rows have global_patient_id IS NULL. Re-run mig 076 or manually point them at a sentinel before retrying.',
      v_patients_without_global;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 077.2 — The flip.
-- ---------------------------------------------------------------------------
ALTER TABLE public.patients
  ALTER COLUMN global_patient_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 077.3 — Post-condition.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_is_nullable TEXT;
BEGIN
  SELECT is_nullable INTO v_is_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'patients'
     AND column_name = 'global_patient_id';

  IF v_is_nullable <> 'NO' THEN
    RAISE EXCEPTION
      'mig 077 post-condition failed: patients.global_patient_id is_nullable = % (expected NO)',
      v_is_nullable;
  END IF;
END $$;
