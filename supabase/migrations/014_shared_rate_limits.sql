-- ============================================================================
-- Migration 014: Shared DB-Backed API Rate Limiting
-- Purpose: Replace in-memory rate limiting with a shared, multi-instance-safe store.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_ms INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, key_hash, window_start)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_updated_at
  ON public.api_rate_limits(updated_at);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_scope TEXT,
  p_key_hash TEXT,
  p_window_ms INTEGER,
  p_max_requests INTEGER
)
RETURNS TABLE (
  allowed BOOLEAN,
  retry_after_seconds INTEGER,
  remaining INTEGER,
  current_count INTEGER
) AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_epoch_ms BIGINT;
  v_window_start_ms BIGINT;
  v_window_start TIMESTAMPTZ;
  v_next_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF p_window_ms <= 0 OR p_max_requests <= 0 THEN
    RAISE EXCEPTION 'Invalid rate limit configuration';
  END IF;

  v_epoch_ms := FLOOR(EXTRACT(EPOCH FROM v_now) * 1000)::BIGINT;
  v_window_start_ms := (v_epoch_ms / p_window_ms) * p_window_ms;
  v_window_start := TO_TIMESTAMP(v_window_start_ms / 1000.0);
  v_next_window_start := TO_TIMESTAMP((v_window_start_ms + p_window_ms) / 1000.0);

  INSERT INTO public.api_rate_limits (scope, key_hash, window_start, window_ms, count, created_at, updated_at)
  VALUES (p_scope, p_key_hash, v_window_start, p_window_ms, 1, v_now, v_now)
  ON CONFLICT (scope, key_hash, window_start)
  DO UPDATE SET
    count = public.api_rate_limits.count + 1,
    updated_at = v_now
  RETURNING count INTO v_count;

  IF random() < 0.02 THEN
    DELETE FROM public.api_rate_limits
    WHERE updated_at < (v_now - INTERVAL '2 days');
  END IF;

  allowed := v_count <= p_max_requests;
  remaining := GREATEST(p_max_requests - v_count, 0);
  retry_after_seconds := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_next_window_start - v_now)))::INTEGER);
  current_count := v_count;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
