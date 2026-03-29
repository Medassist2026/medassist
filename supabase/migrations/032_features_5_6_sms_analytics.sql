-- Migration 032: Template usage tracking
-- ============================================================================
--
-- Adds usage_count to prescription_templates so the quick-tap bar can
-- self-reorder by most-used template.
--
-- sms_reminders already exists with a compatible schema — no changes needed.
-- analytics_events already exists — no changes needed.
-- ============================================================================

ALTER TABLE public.prescription_templates
  ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_prescription_templates_usage_count
  ON public.prescription_templates(usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_prescription_templates_doctor_usage
  ON public.prescription_templates(doctor_id, usage_count DESC);

COMMENT ON COLUMN public.prescription_templates.usage_count IS
  'Number of times this template has been applied in a session. '
  'Incremented by PATCH /api/clinical/templates. Sorts the quick-tap bar.';
