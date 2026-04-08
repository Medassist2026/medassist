-- ============================================================================
-- Migration 042: Create all missing tables and columns
--
-- Tables missing from the DB that are referenced in application code:
--   1. assistant_doctor_assignments  (staff management, roles)
--   2. notifications                 (in-app notification system)
--   3. patient_visibility            (patient privacy/sharing)
--   4. audit_events                  (medical-grade audit logging)
--   5. clinic_frontdesk              (legacy frontdesk-clinic link)
--   6. lab_results_orders            (lab ordering workflow)
--   7. lab_results_entries           (individual lab result values)
--   8. push_subscriptions            (web push notifications)
--   9. patient_medication_reminders  (medication timeline)
--
-- Columns missing from existing tables:
--   - payments.clinic_id             (invoice API selects it)
-- ============================================================================


-- ─── 1. assistant_doctor_assignments ─────────────────────────────────────────
-- Links frontdesk/assistant users to specific doctors within a clinic.
-- Used by staff management, leave, and membership routes.
CREATE TABLE IF NOT EXISTS public.assistant_doctor_assignments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        UUID        NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  assistant_user_id UUID       NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  doctor_user_id   UUID        NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  scope            TEXT        NOT NULL DEFAULT 'full',  -- 'full' | 'schedule_only' | 'read_only'
  status           TEXT        NOT NULL DEFAULT 'ACTIVE'
                               CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_by       UUID        REFERENCES public.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (clinic_id, assistant_user_id, doctor_user_id)
);
CREATE INDEX IF NOT EXISTS idx_ada_clinic     ON public.assistant_doctor_assignments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_ada_assistant  ON public.assistant_doctor_assignments(assistant_user_id);
CREATE INDEX IF NOT EXISTS idx_ada_doctor     ON public.assistant_doctor_assignments(doctor_user_id);
ALTER TABLE public.assistant_doctor_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clinic_members_view_assignments" ON public.assistant_doctor_assignments
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_memberships
      WHERE user_id = auth.uid() AND status = 'ACTIVE'
    )
  );


-- ─── 2. notifications ────────────────────────────────────────────────────────
-- In-app notification feed for doctors, frontdesk, and patients.
CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_role  TEXT        NOT NULL DEFAULT 'doctor'
                              CHECK (recipient_role IN ('doctor', 'frontdesk', 'patient')),
  type            TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  body            TEXT,
  clinic_id       UUID        REFERENCES public.clinics(id) ON DELETE SET NULL,
  appointment_id  UUID        REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_id      UUID        REFERENCES public.patients(id) ON DELETE SET NULL,
  read            BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, read, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_view_own_notifications" ON public.notifications
  FOR ALL USING (recipient_id = auth.uid());


-- ─── 3. patient_visibility ───────────────────────────────────────────────────
-- Controls which doctors can see which patients within a clinic.
-- Referenced in 8 places in visibility.ts and patient/sharing routes.
CREATE TABLE IF NOT EXISTS public.patient_visibility (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           UUID        NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id          UUID        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  grantee_type        TEXT        NOT NULL DEFAULT 'DOCTOR'
                                  CHECK (grantee_type IN ('DOCTOR', 'ROLE')),
  grantee_user_id     UUID        REFERENCES public.users(id) ON DELETE CASCADE,
  mode                TEXT        NOT NULL DEFAULT 'DOCTOR_SCOPED_OWNER'
                                  CHECK (mode IN ('DOCTOR_SCOPED_OWNER', 'CLINIC_WIDE', 'SHARED_BY_CONSENT')),
  consent             TEXT        NOT NULL DEFAULT 'IMPLICIT_CLINIC_POLICY'
                                  CHECK (consent IN ('IMPLICIT_CLINIC_POLICY', 'DOCTOR_TO_DOCTOR_TRANSFER', 'PATIENT_CONSENT_CODE')),
  granted_by_user_id  UUID        REFERENCES public.users(id),
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pv_clinic_patient ON public.patient_visibility(clinic_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_pv_grantee        ON public.patient_visibility(grantee_user_id);
ALTER TABLE public.patient_visibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clinic_doctors_view_visibility" ON public.patient_visibility
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_memberships
      WHERE user_id = auth.uid() AND status = 'ACTIVE'
    )
  );


-- ─── 4. audit_events ─────────────────────────────────────────────────────────
-- Medical-grade audit log (separate from audit_log, used by audit.ts).
CREATE TABLE IF NOT EXISTS public.audit_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID        REFERENCES public.clinics(id) ON DELETE SET NULL,
  actor_user_id   UUID        NOT NULL REFERENCES public.users(id),
  action          TEXT        NOT NULL,
  entity_type     TEXT        NOT NULL,
  entity_id       UUID,
  metadata        JSONB       DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_clinic  ON public.audit_events(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor   ON public.audit_events(actor_user_id);
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners_view_audit_events" ON public.audit_events
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_memberships
      WHERE user_id = auth.uid() AND role = 'OWNER' AND status = 'ACTIVE'
    )
  );


-- ─── 5. clinic_frontdesk ─────────────────────────────────────────────────────
-- Legacy join table linking frontdesk users to clinics.
-- Referenced in register and create-frontdesk routes.
CREATE TABLE IF NOT EXISTS public.clinic_frontdesk (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       UUID        NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  frontdesk_id    UUID        NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (clinic_id, frontdesk_id)
);
CREATE INDEX IF NOT EXISTS idx_clinic_frontdesk_clinic ON public.clinic_frontdesk(clinic_id);
-- Backfill from front_desk_staff (links via users.id = front_desk_staff.id)
INSERT INTO public.clinic_frontdesk (clinic_id, frontdesk_id, created_at)
SELECT fds.clinic_id, fds.id, fds.created_at
FROM public.front_desk_staff fds
WHERE fds.clinic_id IS NOT NULL
ON CONFLICT (clinic_id, frontdesk_id) DO NOTHING;


-- ─── 6. lab_results_orders ───────────────────────────────────────────────────
-- Lab order header (one per order session).
CREATE TABLE IF NOT EXISTS public.lab_results_orders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  clinic_id   UUID        REFERENCES public.clinics(id) ON DELETE SET NULL,
  doctor_id   UUID        REFERENCES public.users(id)   ON DELETE SET NULL,
  status      TEXT        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'collected', 'processing', 'completed', 'cancelled')),
  ordered_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lro_patient ON public.lab_results_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lro_clinic  ON public.lab_results_orders(clinic_id);
ALTER TABLE public.lab_results_orders ENABLE ROW LEVEL SECURITY;


-- ─── 7. lab_results_entries ──────────────────────────────────────────────────
-- Individual test result within an order.
CREATE TABLE IF NOT EXISTS public.lab_results_entries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID        NOT NULL REFERENCES public.lab_results_orders(id) ON DELETE CASCADE,
  test_id         UUID        REFERENCES public.lab_tests(id) ON DELETE SET NULL,
  test_name       TEXT        NOT NULL,
  result_value    TEXT,
  result_unit     TEXT,
  reference_range TEXT,
  is_abnormal     BOOLEAN     DEFAULT FALSE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lre_order ON public.lab_results_entries(order_id);
ALTER TABLE public.lab_results_entries ENABLE ROW LEVEL SECURITY;


-- ─── 8. push_subscriptions ───────────────────────────────────────────────────
-- Web Push API subscriptions (schema from push/subscribe/route.ts comments).
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint    TEXT        NOT NULL UNIQUE,
  keys_p256dh TEXT        NOT NULL,
  keys_auth   TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_user ON public.push_subscriptions(user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_manage_own_push" ON public.push_subscriptions
  FOR ALL USING (user_id = auth.uid());


-- ─── 9. patient_medication_reminders ─────────────────────────────────────────
-- Medication reminders timeline for patient detail view.
CREATE TABLE IF NOT EXISTS public.patient_medication_reminders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  medication_name TEXT        NOT NULL,
  dosage          TEXT,
  frequency       TEXT,
  reminder_times  TEXT[],
  notes           TEXT,
  is_active       BOOLEAN     DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pmr_patient ON public.patient_medication_reminders(patient_id);
ALTER TABLE public.patient_medication_reminders ENABLE ROW LEVEL SECURITY;


-- ─── Missing column: payments.clinic_id ──────────────────────────────────────
-- The invoice API selects clinic_id from payments.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_clinic ON public.payments(clinic_id);

-- Backfill clinic_id on payments from appointments
UPDATE public.payments p
SET clinic_id = a.clinic_id
FROM public.appointments a
WHERE p.appointment_id = a.id
  AND p.clinic_id IS NULL
  AND a.clinic_id IS NOT NULL;
