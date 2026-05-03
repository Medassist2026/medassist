-- ============================================================================
-- Rollback for mig 083 — effective_messaging_consent view
--
-- Drops the view. CASCADE in case any later migration references it.
-- After rollback, messaging code paths that read the view will fail —
-- they must be reverted in lockstep (or fall back to direct PCR reads).
-- ============================================================================

DROP VIEW IF EXISTS public.effective_messaging_consent CASCADE;
