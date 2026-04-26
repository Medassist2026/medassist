-- ============================================================================
-- Migration 070: Phone-change v2 schema (Phase B foundation)
-- ============================================================================
-- See docs/PHONE_CHANGE_PLAN.md §3.4 for the full design rationale.
--
-- WHY
-- ---
-- The codebase has been carrying dormant phone-change tables since mig 013
-- (`phone_change_requests`, `patient_phone_history`) and mig 041 (the OTP
-- `purpose` CHECK was extended to `phone_change_old`/`phone_change_new`),
-- but no application code ever wired them. PR-2 of the Phase B work will
-- wire `/api/auth/change-phone/{request,verify,cancel,fallback}` against
-- these tables. Before that handler code can compile or run safely, three
-- schema gaps need closing:
--
--   1. `users` has no `phone_verified` / `phone_verified_at` columns. Today
--      only `patients` has them. Phase B promises that every login carries
--      a verified phone — that promise needs the column to exist on staff
--      users (doctor, frontdesk) too.
--
--   2. `patient_phone_history` has no `changed_by` (who) and no
--      `change_reason` enum (which flow drove the change — self-service vs
--      typo correction vs fallback approval vs admin). Without these the
--      audit trail of a phone change is missing both accountability and
--      provenance.
--
--   3. `phone_change_requests.patient_id` is `NOT NULL` and FK→patients,
--      so the table can ONLY model a patient phone change. Staff phone
--      changes (frontdesk/doctor) need a parallel column. Per the plan
--      §3.4 we add a nullable `user_id`, drop the NOT NULL on `patient_id`,
--      and enforce an XOR check so exactly one of them is populated. New
--      RLS policies cover the staff-subject case (subject can SELECT/INSERT
--      their own; clinic OWNER can SELECT requests for staff in their clinic
--      via `is_clinic_member`).
--
--   4. `phone_change_requests.status` CHECK currently lacks `'rejected'`.
--      The owner-approval flow needs a distinct rejected state separate
--      from `'cancelled'` so the inbox UI can render the right label and
--      the audit log can distinguish user-cancel from owner-reject.
--
--   5. The commit transaction (§5.2.1) is implemented as a SECURITY
--      DEFINER function `change_phone_commit` so the cross-clinic patient
--      propagation (§7) works without the caller needing rights on every
--      affected `patients` row. The compensating `change_phone_rollback`
--      function reverses the SQL writes when the post-commit
--      `auth.admin.updateUserById` call fails (per resolved Q1).
--
-- BACKFILL DECISION (option A from §9.3)
-- --------------------------------------
-- All 288 existing `users` rows are backfilled with `phone_verified=true`
-- and `phone_verified_at = created_at`. Justification: the registration
-- handler has required OTP since mig 024 — every user that signed up via
-- the app DID verify. Forcing 288 users to re-verify just to log in would
-- be friction without security gain. New users created AFTER this
-- migration get the default `false` until the registration handler is
-- updated (in PR-2) to set it to `true` upon OTP success.
--
-- NEW TABLES?
-- -----------
-- None. Every required surface already exists in the schema:
--   - `phone_change_requests` (mig 013)        — extended here (user_id, XOR, 'rejected')
--   - `patient_phone_history` (mig 013)        — extended here (changed_by, change_reason)
--   - `phone_corrections` (Phase C)            — already complete
--   - `account_recovery_requests` (fallback)   — already complete
--   - `otp_codes.purpose` CHECK (mig 041)      — already accepts the new purposes
--
-- IDEMPOTENCY
-- -----------
-- Every DDL statement uses `IF NOT EXISTS` / `IF EXISTS` / `CREATE OR
-- REPLACE` so the migration is safe to re-apply. The backfill UPDATE is
-- one-shot but bounded by `created_at < now()` AND `phone_verified IS
-- DISTINCT FROM true`, so re-running only touches rows that haven't been
-- backfilled yet. The `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`
-- pair on the status CHECK is atomic within the transaction.
--
-- DEPENDENCIES (audited 2026-04-25)
-- ---------------------------------
--   - public.users with `id, phone, email, role, created_at` (mig 001)
--   - public.patients with `id, phone, phone_verified*, clinic_id` (mig 013)
--   - public.patient_phone_history (mig 013)
--   - public.phone_change_requests (mig 013) with current status CHECK
--   - public.clinic_memberships with role/status enums (mig 053)
--   - public.is_clinic_member SECURITY DEFINER fn (mig 054)
--
-- RELATED DECISIONS
-- -----------------
--   D-007 (visibility), D-008 (admin-client scopes), D-019 (Egyptian
--   phone regex), D-024 (centralized access), D-041 (server-resolved
--   tenant), D-046 (canonical phone validation), D-049 (RLS patterns).
--
--   New: D-050 to be added to DECISIONS_LOG.md after PR-2 lands —
--   "Phone is identity; changing it is a deliberate dual-OTP event."
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) users.phone_verified + phone_verified_at  (with one-shot backfill)
-- ----------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone_verified    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz NULL;

-- One-shot backfill. Bounded by `phone_verified IS DISTINCT FROM true`
-- so re-running this migration is a no-op for already-backfilled rows.
-- COALESCE on `created_at` defends against any historical row with a NULL
-- timestamp (none observed today, but the column is YES nullable).
UPDATE public.users
   SET phone_verified    = true,
       phone_verified_at = COALESCE(created_at, now())
 WHERE created_at < now()
   AND phone_verified IS DISTINCT FROM true;

COMMENT ON COLUMN public.users.phone_verified IS
  'Set to true after the user has completed an OTP-verified phone change OR registration. Backfilled to true for all users created before mig 070 because the registration flow has required OTP since mig 024. See PHONE_CHANGE_PLAN.md §9.3.';
COMMENT ON COLUMN public.users.phone_verified_at IS
  'Timestamp of the most recent successful phone verification.';

-- ----------------------------------------------------------------------------
-- 2) patient_phone_history.changed_by + change_reason
-- ----------------------------------------------------------------------------
ALTER TABLE public.patient_phone_history
  ADD COLUMN IF NOT EXISTS changed_by    uuid NULL REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS change_reason text NULL;

-- Apply the CHECK constraint only if it doesn't already exist. The
-- `DO $$ ... $$` block is the idempotent way to gate a CHECK ADD.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_phone_history_change_reason_check'
      AND conrelid = 'public.patient_phone_history'::regclass
  ) THEN
    ALTER TABLE public.patient_phone_history
      ADD CONSTRAINT patient_phone_history_change_reason_check
      CHECK (
        change_reason IS NULL OR change_reason IN (
          'self_service_change',  -- staff or patient changed own phone via dual-OTP
          'frontdesk_correction', -- frontdesk fixed a typo (Phase C)
          'fallback_approved',    -- owner approved fallback / account_recovery_requests
          'admin_change'          -- support team via DB
        )
      );
  END IF;
END$$;

COMMENT ON COLUMN public.patient_phone_history.changed_by IS
  'User who initiated the change. NULL for legacy rows written before mig 070 or for system-driven changes (recycle, etc.).';
COMMENT ON COLUMN public.patient_phone_history.change_reason IS
  'Provenance of the change event (which flow drove it). Distinct from removed_reason which describes why the OLD entry was retired.';

-- ----------------------------------------------------------------------------
-- 3) phone_change_requests: support staff subjects (user_id) + 'rejected' status
-- ----------------------------------------------------------------------------

-- 3a) Drop the NOT NULL on patient_id. This must happen BEFORE adding the
-- XOR check, otherwise existing rows (today: 0) would fail the check the
-- moment they're inserted as staff.
ALTER TABLE public.phone_change_requests
  ALTER COLUMN patient_id DROP NOT NULL;

-- 3b) Add the user_id column.
ALTER TABLE public.phone_change_requests
  ADD COLUMN IF NOT EXISTS user_id uuid NULL
    REFERENCES public.users(id) ON DELETE CASCADE;

-- 3c) XOR check: exactly one of patient_id / user_id must be set.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'phone_change_requests_subject_xor'
      AND conrelid = 'public.phone_change_requests'::regclass
  ) THEN
    ALTER TABLE public.phone_change_requests
      ADD CONSTRAINT phone_change_requests_subject_xor
      CHECK ((patient_id IS NULL) <> (user_id IS NULL));
  END IF;
END$$;

-- 3d) Replace the status CHECK to add 'rejected'.
ALTER TABLE public.phone_change_requests
  DROP CONSTRAINT IF EXISTS phone_change_requests_status_check;
ALTER TABLE public.phone_change_requests
  ADD CONSTRAINT phone_change_requests_status_check
  CHECK (status IN (
    'pending', 'old_verified', 'new_verified',
    'completed', 'expired', 'cancelled', 'rejected'
  ));

-- 3e) Index for fast lookup by staff subject.
CREATE INDEX IF NOT EXISTS idx_phone_change_user
  ON public.phone_change_requests (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.phone_change_requests.user_id IS
  'Subject of a STAFF (frontdesk/doctor) phone change. Mutually exclusive with patient_id via the subject_xor CHECK constraint.';

-- ----------------------------------------------------------------------------
-- 4) RLS policies for staff phone-change requests
-- ----------------------------------------------------------------------------
-- Existing patient-side policies remain unchanged (mig 013):
--   - "Patients can view own phone change requests" (SELECT, patient_id=auth.uid())
--   - "Patients can create phone change requests"   (INSERT, patient_id=auth.uid())
--
-- We add three NEW policies for the staff-subject case. Use DROP POLICY
-- IF EXISTS first so the migration is idempotent on re-apply.

DROP POLICY IF EXISTS "Staff can view own phone change requests"
  ON public.phone_change_requests;
CREATE POLICY "Staff can view own phone change requests"
  ON public.phone_change_requests FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Staff can create own phone change requests"
  ON public.phone_change_requests;
CREATE POLICY "Staff can create own phone change requests"
  ON public.phone_change_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- The owner-inbox SELECT policy. An ACTIVE OWNER of clinic X can see any
-- staff phone-change request whose subject is also an ACTIVE member of
-- clinic X. Uses the SECURITY DEFINER function from mig 054 to avoid the
-- self-referential clinic_memberships subquery that caused the recursion
-- bug fixed by mig 056.
DROP POLICY IF EXISTS "Owners can view staff phone change requests in their clinic"
  ON public.phone_change_requests;
CREATE POLICY "Owners can view staff phone change requests in their clinic"
  ON public.phone_change_requests FOR SELECT
  USING (
    user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.clinic_memberships m_owner
      JOIN public.clinic_memberships m_subject
        ON m_subject.clinic_id = m_owner.clinic_id
      WHERE m_owner.user_id   = auth.uid()
        AND m_owner.role      = 'OWNER'
        AND m_owner.status    = 'ACTIVE'
        AND m_subject.user_id = phone_change_requests.user_id
        AND m_subject.status  = 'ACTIVE'
    )
  );

-- ----------------------------------------------------------------------------
-- 5) change_phone_commit: SECURITY DEFINER function for the atomic commit
-- ----------------------------------------------------------------------------
-- Called from the data layer (PR-2: phone-changes.ts -> verifyPhoneChangeStep)
-- after both OTPs have been verified. Runs as the function owner (postgres),
-- bypassing RLS so it can:
--   - update users.phone (UNIQUE-protected; raises 23505 on collision)
--   - propagate patients.phone across all clinics that share the OLD phone
--   - write the patient_phone_history pair per touched patient row
--   - mark the request 'completed'
-- Returns the list of touched (clinicId, patientId) pairs as JSONB so the
-- caller can fan out audit_events writes (one per clinic — see §7.4).
--
-- The caller is responsible for the post-commit auth.users.phone update via
-- supabase.auth.admin.updateUserById (resolved Q1) and for fire-and-forget
-- side effects (security SMS to OLD phone, confirmation SMS to NEW phone,
-- audit_events writes, in-app notification).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.change_phone_commit(
  p_request_id    uuid,
  p_subject_id    uuid,
  p_subject_kind  text,        -- 'staff_user' | 'patient'
  p_old_phone     text,
  p_new_phone     text,
  p_actor_id      uuid,
  p_change_reason text         -- 'self_service_change' | 'frontdesk_correction' | 'fallback_approved' | 'admin_change'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $$
DECLARE
  touched_clinics jsonb := '[]'::jsonb;
  rec record;
BEGIN
  -- Defend against bad input.
  IF p_subject_kind NOT IN ('staff_user', 'patient') THEN
    RAISE EXCEPTION 'change_phone_commit: invalid subject_kind %', p_subject_kind
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_change_reason NOT IN ('self_service_change','frontdesk_correction','fallback_approved','admin_change') THEN
    RAISE EXCEPTION 'change_phone_commit: invalid change_reason %', p_change_reason
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Lock the request row to serialize concurrent verify calls. The state
  -- check happens at the application layer; this lock just prevents two
  -- in-flight commits from racing.
  PERFORM 1
  FROM public.phone_change_requests
  WHERE id = p_request_id
  FOR UPDATE;

  -- 1) users.phone — single row keyed by subject_id.
  --    Raises 23505 (unique_violation) on collision; the caller catches it
  --    and surfaces a clean `phone_taken` error.
  --
  --    We attempt the update for both subject kinds because a patients row's
  --    id equals a users row's id (FK CASCADE), so updating users.phone here
  --    matches the patient's auth-side phone if they have one. If no matching
  --    users row exists (legacy walk-in patient with no auth account), this
  --    is a 0-row UPDATE — no error.
  UPDATE public.users
     SET phone             = p_new_phone,
         phone_verified    = true,
         phone_verified_at = now()
   WHERE id = p_subject_id;

  -- 2) Cross-clinic patient propagation (§7 strict policy from resolved Q4).
  --    ONLY runs when subject_kind = 'patient'. For a staff_user subject
  --    (frontdesk/doctor changing their own login phone) the patients table
  --    is not touched — even if the staff member happens to also be a patient
  --    elsewhere, that record's phone is a separate concept and is changed
  --    via the patient app flow, not the staff phone-change flow. See
  --    PHONE_CHANGE_PLAN.md §6.3.
  --
  --    For patient subjects: touch every patients row whose phone matches
  --    the OLD phone (today: at most 1 row; the schema permits more for
  --    cross-clinic identity propagation per D-007).
  IF p_subject_kind = 'patient' THEN
  FOR rec IN
    UPDATE public.patients
       SET phone             = p_new_phone,
           phone_verified    = true,
           phone_verified_at = now()
     WHERE phone = p_old_phone
    RETURNING id, clinic_id
  LOOP
    -- 3) History pair for each touched patients row.
    INSERT INTO public.patient_phone_history (
      patient_id, phone, is_current, removed_at, removed_reason,
      change_reason, changed_by
    ) VALUES (
      rec.id, p_old_phone, false, now(), 'user_changed',
      p_change_reason, p_actor_id
    );

    INSERT INTO public.patient_phone_history (
      patient_id, phone, is_current, verified, verified_at,
      change_reason, changed_by
    ) VALUES (
      rec.id, p_new_phone, true, true, now(),
      p_change_reason, p_actor_id
    );

    touched_clinics := touched_clinics || jsonb_build_object(
      'clinicId',  rec.clinic_id,
      'patientId', rec.id
    );
  END LOOP;
  END IF;

  -- 4) Mark the request completed.
  UPDATE public.phone_change_requests
     SET status       = 'completed',
         completed_at = now()
   WHERE id = p_request_id;

  RETURN jsonb_build_object('touchedClinics', touched_clinics);
END;
$$;

COMMENT ON FUNCTION public.change_phone_commit IS
  'Atomic commit for a verified phone-change request. Updates users.phone, propagates across all patient rows that share the OLD phone (per §7 strict policy), writes patient_phone_history rows, marks the request completed. Returns touched (clinicId, patientId) pairs for audit fan-out. SECURITY DEFINER: bypasses RLS to allow cross-clinic propagation.';

-- ----------------------------------------------------------------------------
-- 6) change_phone_rollback: compensating reverse of change_phone_commit
-- ----------------------------------------------------------------------------
-- Called by the data layer if `supabase.auth.admin.updateUserById` fails
-- AFTER `change_phone_commit` succeeded. Reverses the public-side writes
-- and marks the request 'cancelled'. Writes a fresh history pair documenting
-- the rollback so the audit trail of the attempt is preserved.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.change_phone_rollback(
  p_request_id   uuid,
  p_subject_id   uuid,
  p_subject_kind text,        -- 'staff_user' | 'patient' — must match the commit
  p_old_phone    text,
  p_new_phone    text,
  p_actor_id     uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $$
DECLARE
  rec record;
BEGIN
  IF p_subject_kind NOT IN ('staff_user', 'patient') THEN
    RAISE EXCEPTION 'change_phone_rollback: invalid subject_kind %', p_subject_kind
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 1) Revert users.phone — keyed by subject id (NOT by phone), so we can't
  --    accidentally touch some other user who legitimately holds the new
  --    phone. The 23505 risk only applies if old_phone has been re-claimed
  --    by another account in the rollback window — extremely unlikely.
  UPDATE public.users
     SET phone = p_old_phone
   WHERE id = p_subject_id;

  -- 2) Revert patients.phone — ONLY for patient subjects, mirroring
  --    change_phone_commit's gate. For staff_user the commit skipped the
  --    patients table, so the rollback must skip it too. We revert by the
  --    list of rows whose phone is currently new_phone — that subset is
  --    exactly the touched set because the commit was the only path that
  --    set phone=new_phone in this transaction window.
  IF p_subject_kind = 'patient' THEN
  FOR rec IN
    UPDATE public.patients
       SET phone = p_old_phone
     WHERE phone = p_new_phone
    RETURNING id
  LOOP
    -- 3) Write a "rolled back" history pair so the audit trail of the
    --    attempt is preserved. The original commit's history rows remain
    --    in place; these new rows document the reversal.
    INSERT INTO public.patient_phone_history (
      patient_id, phone, is_current, removed_at, removed_reason,
      change_reason, changed_by
    ) VALUES (
      rec.id, p_new_phone, false, now(), 'verification_failed',
      'admin_change', p_actor_id
    );

    INSERT INTO public.patient_phone_history (
      patient_id, phone, is_current, verified, verified_at,
      change_reason, changed_by
    ) VALUES (
      rec.id, p_old_phone, true, true, now(),
      'admin_change', p_actor_id
    );
  END LOOP;
  END IF;

  -- 4) Mark the request cancelled (the change did not stick).
  UPDATE public.phone_change_requests
     SET status       = 'cancelled',
         completed_at = now()
   WHERE id = p_request_id;
END;
$$;

COMMENT ON FUNCTION public.change_phone_rollback IS
  'Compensating reversal for change_phone_commit when the post-commit auth admin sync fails. Reverts public.users + patients writes, writes a "rolled back" history pair, marks the request cancelled. SECURITY DEFINER.';

-- ============================================================================
-- Post-migration verification (run via execute_sql after apply):
--
--   -- 1. New columns exist with backfill on users
--   SELECT
--     count(*) FILTER (WHERE phone_verified IS NULL)         AS null_count,        -- expect 0
--     count(*) FILTER (WHERE phone_verified = true)          AS true_count,        -- expect ~288
--     count(*) FILTER (WHERE phone_verified = false)         AS false_count,       -- expect 0
--     count(*) FILTER (WHERE phone_verified_at IS NULL)      AS null_at_count      -- expect 0
--   FROM public.users;
--
--   -- 2. patient_phone_history extended
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='patient_phone_history'
--     AND column_name IN ('changed_by','change_reason');     -- expect 2 rows
--
--   -- 3. phone_change_requests extended
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='phone_change_requests'
--     AND column_name = 'user_id';                           -- expect 1 row
--
--   SELECT pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.phone_change_requests'::regclass
--     AND conname = 'phone_change_requests_status_check';
--   -- expect: includes 'rejected'
--
--   SELECT pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.phone_change_requests'::regclass
--     AND conname = 'phone_change_requests_subject_xor';
--   -- expect: ((patient_id IS NULL) <> (user_id IS NULL))
--
--   -- 4. New RLS policies present
--   SELECT policyname FROM pg_policies
--   WHERE schemaname='public' AND tablename='phone_change_requests'
--   ORDER BY policyname;
--   -- expect: existing 2 + 3 new "Staff can*" / "Owners can*"
--
--   -- 5. Functions present + SECURITY DEFINER
--   SELECT proname, prosecdef FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('change_phone_commit','change_phone_rollback')
--   ORDER BY proname;
--   -- expect: 2 rows, prosecdef=true on both
--
--   -- 6. XOR check rejects bad rows (run in a rolled-back transaction)
--   BEGIN;
--   INSERT INTO public.phone_change_requests
--     (patient_id, user_id, old_phone, new_phone)
--   VALUES (NULL, NULL, '01000000000', '01000000001');
--   -- expect: ERROR: new row for relation "phone_change_requests" violates check constraint "phone_change_requests_subject_xor"
--   ROLLBACK;
--
--   BEGIN;
--   INSERT INTO public.phone_change_requests
--     (patient_id, user_id, old_phone, new_phone)
--   VALUES (
--     (SELECT id FROM public.patients LIMIT 1),
--     (SELECT id FROM public.users LIMIT 1),
--     '01000000000', '01000000001'
--   );
--   -- expect: ERROR: violates check constraint "phone_change_requests_subject_xor"
--   ROLLBACK;
-- ============================================================================
