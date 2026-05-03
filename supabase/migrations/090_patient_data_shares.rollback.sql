-- ============================================================================
-- Rollback for migration 090 — patient_data_shares
--
-- WARNING: rollback DROPS all patient_data_shares rows AND every audit_events
-- row whose entity_type = 'patient_data_share' that was written by the
-- lifecycle functions. The audit rows are NOT cascaded automatically — we
-- explicitly delete them so the rollback restores the pre-mig-090 state of
-- the audit_events table as well.
--
-- DO NOT run this rollback after Prompt 6 ships RLS policies on the table —
-- doing so would lose the share grants needed for cross-clinic visibility.
-- The Build 05 results doc § 9 (honest gaps) flags this constraint.
-- ============================================================================

-- Drop functions first (they reference the table type).
DROP FUNCTION IF EXISTS public.mark_share_expired_notification(UUID, TEXT);
DROP FUNCTION IF EXISTS public.auto_renew_shares_on_visit(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.revoke_data_share(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.extend_data_share(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.create_data_share(
  UUID, UUID, UUID, TEXT, TEXT, UUID, TEXT, INTEGER
);

-- Delete share-related audit rows so rollback restores audit table to its
-- pre-mig-090 state. This must run BEFORE the table drop because the audit
-- rows reference the table by entity_type (text — no FK), but the share
-- rows themselves reference audit_events via audit_event_id (FK).
DELETE FROM public.audit_events
 WHERE entity_type = 'patient_data_share'
   AND action IN (
     'SHARE_GRANTED',
     'SHARE_EXTENDED',
     'SHARE_REVOKED',
     'SHARE_AUTO_RENEWED',
     'SHARE_EXPIRED'
   );

-- Drop trigger + policies + indices + table.
DROP TRIGGER IF EXISTS tg_patient_data_shares_touch_updated_at
  ON public.patient_data_shares;

DROP POLICY IF EXISTS patient_data_shares_no_select ON public.patient_data_shares;
DROP POLICY IF EXISTS patient_data_shares_no_insert ON public.patient_data_shares;
DROP POLICY IF EXISTS patient_data_shares_no_update ON public.patient_data_shares;
DROP POLICY IF EXISTS patient_data_shares_no_delete ON public.patient_data_shares;

DROP INDEX IF EXISTS public.idx_pds_global_patient;
DROP INDEX IF EXISTS public.idx_pds_grantee_clinic_active;
DROP INDEX IF EXISTS public.idx_pds_grantor_clinic_active;
DROP INDEX IF EXISTS public.idx_pds_expires;
DROP INDEX IF EXISTS public.idx_pds_global_patient_active;

DROP TABLE IF EXISTS public.patient_data_shares;

-- Note: AuditAction TS enum entries (SHARE_GRANTED etc.) are NOT removed
-- by this rollback. They live in TypeScript and would be reverted by
-- reverting the corresponding code change. Keeping the enum entries doesn't
-- break anything if the table is gone — the actions just become unused.
