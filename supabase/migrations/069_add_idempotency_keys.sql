-- 069_add_idempotency_keys.sql
--
-- TD-008 Phase 1 — offline-write replay safety.
--
-- Why: when a frontdesk laptop goes offline mid-day, payments and clinical
-- notes get queued in IndexedDB. On reconnect the queue replays each write.
-- If the network flaps mid-replay, the same write gets sent again. Without
-- a dedupe key, the server would record a duplicate payment / a duplicate
-- clinical note — both of which are real bugs in clinical/financial context.
--
-- Check-in (frontdesk/checkin) does NOT need this column — it has natural
-- dedupe via (patient_id, doctor_id, today, status in [waiting, in_progress])
-- enforced in the handler, which now returns 200 (was 409) on dedupe so the
-- queue treats the replay as a success and removes it.
--
-- For payments and clinical_notes there is NO natural dedupe key (a doctor
-- can legitimately write 2 notes for the same patient on the same day; a
-- patient can pay cash twice in the same visit for two services). The
-- client (useOfflineMutation hook) generates a UUID per write attempt and
-- includes it in the body. The handler uses the column's UNIQUE constraint
-- as the dedupe enforcement; on conflict we look up and return the existing
-- record id.
--
-- Backward compat: column is NULLABLE and the unique index is partial
-- (WHERE NOT NULL), so existing rows and any caller that doesn't send a
-- key are unaffected. This is intentional — this migration must not break
-- any in-flight writes.
--
-- Related: D-043 (Capacitor PWA strategy), D-044 (LAN sync deferred),
-- TD-008 in ARCHITECTURE.md §17.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS client_idempotency_key TEXT;

ALTER TABLE clinical_notes
  ADD COLUMN IF NOT EXISTS client_idempotency_key TEXT;

-- Partial unique index — NULL keys are not subject to uniqueness so existing
-- rows (and any non-offline-aware caller) are not affected. New offline-aware
-- writes always send a key, so they get the dedupe behavior.
CREATE UNIQUE INDEX IF NOT EXISTS payments_client_idempotency_key_uniq
  ON payments (client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS clinical_notes_client_idempotency_key_uniq
  ON clinical_notes (client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;

COMMENT ON COLUMN payments.client_idempotency_key IS
  'Client-generated UUID for offline-write replay dedupe. NULL for non-offline writes. See TD-008.';
COMMENT ON COLUMN clinical_notes.client_idempotency_key IS
  'Client-generated UUID for offline-write replay dedupe. NULL for non-offline writes. See TD-008.';
