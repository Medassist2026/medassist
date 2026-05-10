-- ============================================================================
-- Rollback for migration 113 — authority helper functions.
-- Drops public wrappers first (so internals' grants/refs don't dangle), then
-- internal DEFINER companions. No COMMIT/BEGIN — runs in apply transaction.
-- ============================================================================

DROP FUNCTION IF EXISTS public.is_authorized_actor_on(UUID, UUID);
DROP FUNCTION IF EXISTS public.delegated_capability_includes(UUID, UUID, TEXT);

DROP FUNCTION IF EXISTS public._is_authorized_actor_on_internal(UUID, UUID);
DROP FUNCTION IF EXISTS public._delegated_capability_includes_internal(UUID, UUID, TEXT);
