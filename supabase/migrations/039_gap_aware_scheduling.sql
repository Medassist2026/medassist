-- ============================================================================
-- Migration 039 — Gap-Aware Scheduling
--
-- Adds estimated_slot_time to check_in_queue so each walk-in patient knows
-- which time block they're occupying in the doctor's schedule.
-- Also adds a Postgres helper function to compute gap-aware slot assignments.
--
-- Gap logic: appointments own their time slot; walk-ins fill free gaps.
-- Sort: priority DESC, queue_number ASC
-- ============================================================================

-- ── estimated_slot_time on check_in_queue ───────────────────────────────────
-- The estimated calendar time this patient will be seen.
-- For appointment queue_type: mirrors appointment.start_time
-- For walkin queue_type: computed from available gap in schedule
ALTER TABLE check_in_queue
  ADD COLUMN IF NOT EXISTS estimated_slot_time TIMESTAMPTZ;

-- ── get_next_walkin_slot: compute next available gap for a walk-in ───────────
-- Returns the start time of the next free gap in the schedule for a given doctor.
-- A "free gap" is a block of time not covered by:
--   1. Scheduled appointments (status NOT IN ('cancelled', 'no_show'))
--   2. Existing queue walk-in entries with estimated_slot_time assigned
--
-- Parameters:
--   p_doctor_id       — the doctor
--   p_slot_duration   — how many minutes to reserve (default 15)
--   p_date            — which date (defaults to Cairo today)
--
-- Returns NULL if no gap found within doctor working hours.
CREATE OR REPLACE FUNCTION get_next_walkin_slot(
  p_doctor_id     UUID,
  p_slot_duration INTEGER DEFAULT 15,
  p_date          DATE    DEFAULT NULL
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_date          DATE;
  v_tz            TEXT := 'Africa/Cairo';
  v_day_of_week   INTEGER;
  v_work_start    TIME;
  v_work_end      TIME;
  v_cursor        TIMESTAMPTZ;
  v_slot_end      TIMESTAMPTZ;
  v_conflict      BOOLEAN;
  v_now           TIMESTAMPTZ;
BEGIN
  -- Default to Cairo today
  v_date := COALESCE(p_date, (NOW() AT TIME ZONE v_tz)::DATE);
  v_day_of_week := EXTRACT(DOW FROM v_date); -- 0=Sun, 6=Sat

  -- Get doctor working hours for this day
  SELECT start_time, end_time
  INTO   v_work_start, v_work_end
  FROM   doctor_availability
  WHERE  doctor_id  = p_doctor_id
    AND  day_of_week = v_day_of_week
    AND  is_available = TRUE
  LIMIT 1;

  -- Doctor not working this day
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_now    := NOW() AT TIME ZONE 'UTC';
  v_cursor := GREATEST(
    (v_date::TEXT || ' ' || v_work_start::TEXT || '+02:00')::TIMESTAMPTZ,
    v_now
  );

  -- Round cursor up to next 15-minute boundary for clean slot alignment
  v_cursor := date_trunc('hour', v_cursor) +
    INTERVAL '15 min' * CEIL(EXTRACT(EPOCH FROM (v_cursor - date_trunc('hour', v_cursor))) / 900);

  LOOP
    v_slot_end := v_cursor + (p_slot_duration || ' minutes')::INTERVAL;

    -- Stop if we've gone past working hours
    IF v_slot_end > (v_date::TEXT || ' ' || v_work_end::TEXT || '+02:00')::TIMESTAMPTZ THEN
      RETURN NULL;
    END IF;

    -- Check for conflicts with scheduled appointments
    SELECT EXISTS (
      SELECT 1
      FROM   appointments
      WHERE  doctor_id  = p_doctor_id
        AND  status    NOT IN ('cancelled', 'no_show')
        AND  start_time < v_slot_end
        AND  (start_time + (duration_minutes || ' minutes')::INTERVAL) > v_cursor
    ) INTO v_conflict;

    IF NOT v_conflict THEN
      -- Check for conflicts with existing walk-in queue slots
      SELECT EXISTS (
        SELECT 1
        FROM   check_in_queue
        WHERE  doctor_id           = p_doctor_id
          AND  queue_type          = 'walkin'
          AND  status             IN ('waiting', 'in_progress')
          AND  estimated_slot_time IS NOT NULL
          AND  estimated_slot_time < v_slot_end
          AND  (estimated_slot_time + (p_slot_duration || ' minutes')::INTERVAL) > v_cursor
      ) INTO v_conflict;
    END IF;

    IF NOT v_conflict THEN
      RETURN v_cursor; -- Found a free slot
    END IF;

    -- Advance cursor by p_slot_duration
    v_cursor := v_cursor + (p_slot_duration || ' minutes')::INTERVAL;
  END LOOP;
END;
$$;

-- ── get_schedule_blocks: full timeline for visual display ────────────────────
-- Returns all occupied + free blocks for a doctor on a given date.
-- Used by the frontdesk schedule/gaps API to render the timeline.
CREATE OR REPLACE FUNCTION get_schedule_blocks(
  p_doctor_id UUID,
  p_date      DATE DEFAULT NULL
) RETURNS TABLE (
  block_start   TIMESTAMPTZ,
  block_end     TIMESTAMPTZ,
  block_type    TEXT,   -- 'appointment' | 'walkin' | 'free' | 'urgent'
  patient_name  TEXT,
  queue_number  INTEGER,
  minutes_free  INTEGER -- only set for 'free' blocks
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_date        DATE;
  v_tz          TEXT := 'Africa/Cairo';
  v_day_of_week INTEGER;
  v_work_start  TIME;
  v_work_end    TIME;
  v_day_start   TIMESTAMPTZ;
  v_day_end     TIMESTAMPTZ;
BEGIN
  v_date        := COALESCE(p_date, (NOW() AT TIME ZONE v_tz)::DATE);
  v_day_of_week := EXTRACT(DOW FROM v_date);

  SELECT start_time, end_time
  INTO   v_work_start, v_work_end
  FROM   doctor_availability
  WHERE  doctor_id   = p_doctor_id
    AND  day_of_week = v_day_of_week
    AND  is_available = TRUE
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  v_day_start := (v_date::TEXT || ' ' || v_work_start::TEXT || '+02:00')::TIMESTAMPTZ;
  v_day_end   := (v_date::TEXT || ' ' || v_work_end::TEXT   || '+02:00')::TIMESTAMPTZ;

  -- Appointment blocks
  RETURN QUERY
    SELECT
      a.start_time                                              AS block_start,
      a.start_time + (a.duration_minutes || ' minutes')::INTERVAL AS block_end,
      CASE a.appointment_type WHEN 'urgent' THEN 'urgent' ELSE 'appointment' END AS block_type,
      p.full_name                                              AS patient_name,
      NULL::INTEGER                                            AS queue_number,
      NULL::INTEGER                                            AS minutes_free
    FROM   appointments a
    JOIN   patients p ON p.id = a.patient_id
    WHERE  a.doctor_id = p_doctor_id
      AND  a.start_time >= v_day_start
      AND  a.start_time <  v_day_end
      AND  a.status NOT IN ('cancelled', 'no_show')
    ORDER BY a.start_time;

  -- Walk-in blocks (those with assigned slot times)
  RETURN QUERY
    SELECT
      q.estimated_slot_time                                    AS block_start,
      q.estimated_slot_time + INTERVAL '15 minutes'           AS block_end,
      'walkin'::TEXT                                           AS block_type,
      p.full_name                                             AS patient_name,
      q.queue_number                                           AS queue_number,
      NULL::INTEGER                                            AS minutes_free
    FROM   check_in_queue q
    JOIN   patients p ON p.id = q.patient_id
    WHERE  q.doctor_id           = p_doctor_id
      AND  q.queue_type          = 'walkin'
      AND  q.status             IN ('waiting', 'in_progress')
      AND  q.estimated_slot_time IS NOT NULL
      AND  q.estimated_slot_time >= v_day_start
      AND  q.estimated_slot_time <  v_day_end
    ORDER BY q.estimated_slot_time;
END;
$$;

-- ── Index for gap queries ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ciq_estimated_slot
  ON check_in_queue (doctor_id, estimated_slot_time)
  WHERE status IN ('waiting', 'in_progress') AND estimated_slot_time IS NOT NULL;
