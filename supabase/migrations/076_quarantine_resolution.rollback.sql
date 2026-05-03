-- ============================================================================
-- Rollback for mig 076 (conceptual mig 075).
--
-- The quarantine resolution did three load-bearing things:
--   1. Created sentinel global_patients rows for patients-side rows
--   2. Pointed patients.global_patient_id at those sentinels
--   3. Emptied _phone_normalize_quarantine
--
-- Reverting safely:
--   1. Restore _phone_normalize_quarantine entries from audit metadata
--      (raw_phone is preserved there).
--   2. Null out patients.global_patient_id for rows that pointed at a
--      sentinel.
--   3. Delete the sentinel global_patients rows.
--   4. Delete the audit rows this migration wrote.
--
-- Post-rollback state matches the post-mig-075 / pre-mig-076 baseline
-- (74 quarantine rows, 3 patients with NULL global_patient_id, 31
-- non-sentinel global_patients rows).
-- ============================================================================

-- R076.1 — Restore _phone_normalize_quarantine entries from audit metadata.
INSERT INTO public._phone_normalize_quarantine (table_name, row_id, raw_phone, detected_at)
SELECT
  ae.metadata->>'side',
  ae.entity_id,
  ae.metadata->>'raw_phone',
  NOW()
FROM public.audit_events ae
WHERE ae.action = 'QUARANTINE_RESOLVED_PATH_B'
  AND ae.metadata->>'source' = 'migration_076'
  AND ae.metadata->>'raw_phone' IS NOT NULL
ON CONFLICT DO NOTHING;

-- R076.2 — Null out patients.global_patient_id for sentinel-pointing rows.
UPDATE public.patients p
   SET global_patient_id = NULL
  FROM public.audit_events ae
 WHERE ae.action = 'QUARANTINE_RESOLVED_PATH_B'
   AND ae.metadata->>'source' = 'migration_076'
   AND ae.metadata->>'side' = 'patients'
   AND p.id = ae.entity_id
   AND p.global_patient_id::text = ae.metadata->>'sentinel_global_patient_id';

-- R076.3 — Delete sentinel global_patients rows.
DELETE FROM public.global_patients gp
 USING public.audit_events ae
 WHERE ae.action = 'GLOBAL_PATIENT_CREATED'
   AND ae.metadata->>'source' = 'migration_076_sentinel'
   AND gp.id = ae.entity_id;

-- R076.4 — Delete the audit rows this migration wrote.
DELETE FROM public.audit_events
 WHERE action IN ('QUARANTINE_RESOLVED_PATH_B', 'GLOBAL_PATIENT_CREATED')
   AND (
     metadata->>'source' = 'migration_076'
     OR metadata->>'source' = 'migration_076_sentinel'
   );

-- R076.5 — Re-add NOT NULL on global_patients.normalized_phone IF AND
--           ONLY IF no NULL rows remain (defensive — same pattern as
--           mig 074 rollback's NOT NULL re-add).
DO $$
DECLARE
  v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_null_count
    FROM public.global_patients
   WHERE normalized_phone IS NULL;

  IF v_null_count = 0 THEN
    ALTER TABLE public.global_patients
      ALTER COLUMN normalized_phone SET NOT NULL;
  ELSE
    RAISE NOTICE
      'mig 076 rollback: % global_patients rows still have NULL normalized_phone — leaving column nullable. Manually delete those rows then run: ALTER TABLE public.global_patients ALTER COLUMN normalized_phone SET NOT NULL;',
      v_null_count;
  END IF;
END $$;
