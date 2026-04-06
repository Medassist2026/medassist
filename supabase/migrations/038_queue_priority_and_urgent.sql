-- ============================================================================
-- Migration 038 — Queue Priority Column + Urgent Appointment Type
--
-- A1: Manual queue pull-up — frontdesk moves a patient earlier in the queue
--     by reassigning queue_number values. The sort is now:
--       ORDER BY priority DESC, queue_number ASC
--
-- A2: حجز مستعجل (Urgent Same-Day Booking) — a specific time-slot reservation
--     today that bumps whatever was there, assigned higher priority than regular
--     walk-ins but below emergencies.
--
-- Priority scale (matches the analysis):
--   9 = emergency (طوارئ) — drops everything
--   3 = urgent booking (مستعجل) — doctor requested, specific time
--   2 = appointment on-time
--   1 = walk-in / early arrival
--   0 = late arrival (arrived after their appointment window closed)
-- ============================================================================

-- ── priority column on check_in_queue ───────────────────────────────────────
ALTER TABLE check_in_queue
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 1;

-- Back-fill existing rows from queue_type
UPDATE check_in_queue SET priority =
  CASE queue_type
    WHEN 'emergency'    THEN 9
    WHEN 'appointment'  THEN 2
    ELSE 1                       -- walkin
  END
WHERE priority = 1;  -- only touch rows that are still at default

-- ── urgent appointment type ──────────────────────────────────────────────────
-- Add 'urgent' as a valid appointment_type value.
-- 'urgent' = same-day, doctor-requested, specific time slot.
-- Different from 'emergency' (طوارئ) which has no scheduled time.
DO $$ BEGIN
  ALTER TABLE appointments
    DROP CONSTRAINT IF EXISTS appointments_appointment_type_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Re-add constraint with 'urgent' included
ALTER TABLE appointments
  ADD CONSTRAINT appointments_appointment_type_check
    CHECK (appointment_type IN (
      'regular', 'followup', 'emergency', 'consultation', 'urgent'
    ));

-- ── reorder_queue_item: atomically move a patient to a target position ───────
-- Moves p_queue_id to position p_target_queue_number,
-- shifting everything else up or down accordingly.
CREATE OR REPLACE FUNCTION reorder_queue_item(
  p_queue_id            UUID,
  p_target_queue_number INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doctor_id      UUID;
  v_current_num    INTEGER;
  v_today_start    TIMESTAMPTZ;
BEGIN
  v_today_start := (CURRENT_DATE::TEXT || 'T00:00:00+02:00')::TIMESTAMPTZ;

  SELECT doctor_id, queue_number
  INTO   v_doctor_id, v_current_num
  FROM   check_in_queue
  WHERE  id = p_queue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue item not found';
  END IF;

  IF v_current_num = p_target_queue_number THEN
    RETURN; -- no-op
  END IF;

  IF p_target_queue_number < v_current_num THEN
    -- Moving UP: shift items between target and current DOWN by 1
    UPDATE check_in_queue
    SET    queue_number = queue_number + 1
    WHERE  doctor_id    = v_doctor_id
      AND  queue_number >= p_target_queue_number
      AND  queue_number <  v_current_num
      AND  status        = 'waiting'
      AND  created_at   >= v_today_start
      AND  id           != p_queue_id;
  ELSE
    -- Moving DOWN: shift items between current and target UP by 1
    UPDATE check_in_queue
    SET    queue_number = queue_number - 1
    WHERE  doctor_id    = v_doctor_id
      AND  queue_number >  v_current_num
      AND  queue_number <= p_target_queue_number
      AND  status        = 'waiting'
      AND  created_at   >= v_today_start
      AND  id           != p_queue_id;
  END IF;

  -- Place the item at its new position
  UPDATE check_in_queue
  SET    queue_number = p_target_queue_number
  WHERE  id = p_queue_id;
END;
$$;

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ciq_priority_queue
  ON check_in_queue (doctor_id, priority DESC, queue_number ASC)
  WHERE status IN ('waiting', 'in_progress');
