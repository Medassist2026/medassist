-- Rollback for migration 091 — atomic multi-grantor share creation.
-- Drops the wrapper function only. create_data_share (mig 090) is
-- untouched and continues to work for single-share writes.
--
-- After rollback, callers reach create_shares_for_grantors must be
-- updated to fall back to the per-grantor TS loop in patient-shares.ts
-- (which has the partial-failure window from Build 05 § 3).

DROP FUNCTION IF EXISTS public.create_shares_for_grantors(
  UUID, UUID[], UUID, TEXT, UUID, TEXT, TEXT
);
