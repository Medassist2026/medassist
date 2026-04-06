-- ============================================================================
-- Migration 037 — Appointment Window State
--
-- Implements smart queue swap logic (Option C — Hybrid):
-- When a walk-in session starts and an appointment patient hasn't arrived,
-- the walk-in session becomes the "window" — the appointment patient can still
-- check in during that window and be inserted immediately after.
-- Once the walk-in session completes, the window closes → auto no-show.
-- ============================================================================

-- ── appointments table ──────────────────────────────────────────────────────
-- window_status: tracks whether this appointment has an active swap window
-- window_queue_id: which queue item's session is the open window

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS window_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS window_queue_id UUID;

DO $$ BEGIN
  ALTER TABLE appointments
    ADD CONSTRAINT appointments_window_status_check
      CHECK (window_status IN ('none', 'open', 'expired'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── check_in_queue table ────────────────────────────────────────────────────
-- apt_window_status: 'open' = this queue item is carrying an appointment window
-- swapped_appointment_id: which appointment was deferred to make room for this item
-- swapped_patient_name: denormalized for UI display without extra joins

ALTER TABLE check_in_queue
  ADD COLUMN IF NOT EXISTS apt_window_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS swapped_appointment_id UUID,
  ADD COLUMN IF NOT EXISTS swapped_patient_name TEXT;

DO $$ BEGIN
  ALTER TABLE check_in_queue
    ADD CONSTRAINT ciq_apt_window_status_check
      CHECK (apt_window_status IN ('none', 'open', 'expired'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── shift_queue_numbers_up ──────────────────────────────────────────────────
-- Atomically increments queue_number for all waiting items after a given
-- position so a patient can be inserted at that position without conflicts.
-- Called when an appointment patient arrives during an open window.

CREATE OR REPLACE FUNCTION shift_queue_numbers_up(
  p_doctor_id  UUID,
  p_after_queue_number INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today_start TIMESTAMPTZ;
BEGIN
  -- Cairo = UTC+2; use explicit offset for the day boundary
  v_today_start := (CURRENT_DATE::TEXT || 'T00:00:00+02:00')::TIMESTAMPTZ;

  UPDATE check_in_queue
  SET    queue_number = queue_number + 1
  WHERE  doctor_id    = p_doctor_id
    AND  queue_number > p_after_queue_number
    AND  status       = 'waiting'                -- only shift items still waiting
    AND  created_at  >= v_today_start;
END;
$$;

-- ── Indexes for window queries ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appointments_window_status
  ON appointments (window_status)
  WHERE window_status = 'open';

CREATE INDEX IF NOT EXISTS idx_ciq_apt_window_status
  ON check_in_queue (apt_window_status)
  WHERE apt_window_status = 'open';

CREATE INDEX IF NOT EXISTS idx_appointments_window_lookup
  ON appointments (doctor_id, status, window_status, checked_in_at)
  WHERE status = 'scheduled' AND window_status = 'none';
