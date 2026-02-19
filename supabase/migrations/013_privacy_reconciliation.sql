-- ============================================================================
-- Migration 013: Privacy Reconciliation + Consent Enforcement
-- Purpose: Align runtime privacy model with schema and harden access controls.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- PATIENTS TABLE ALIGNMENT
-- ============================================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'locked', 'dormant', 'merged')),
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_by_doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_patients_account_status ON public.patients(account_status);
CREATE INDEX IF NOT EXISTS idx_patients_last_activity ON public.patients(last_activity_at DESC);

-- ============================================================================
-- DOCTOR-PATIENT RELATIONSHIPS ALIGNMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.doctor_patient_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'inactive', 'pending')),
  relationship_type TEXT DEFAULT 'walk_in',
  access_type TEXT DEFAULT 'walk_in' CHECK (access_type IN ('walk_in', 'verified')),
  access_level TEXT NOT NULL DEFAULT 'walk_in_limited' CHECK (access_level IN ('ghost', 'walk_in_limited', 'verified_consented')),
  consent_state TEXT NOT NULL DEFAULT 'pending' CHECK (consent_state IN ('pending', 'granted', 'revoked')),
  doctor_entered_name TEXT,
  doctor_entered_age INTEGER,
  doctor_entered_sex TEXT,
  verified_at TIMESTAMPTZ,
  consent_granted_at TIMESTAMPTZ,
  consent_revoked_at TIMESTAMPTZ,
  last_visit_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(doctor_id, patient_id)
);

ALTER TABLE public.doctor_patient_relationships
  ADD COLUMN IF NOT EXISTS access_type TEXT DEFAULT 'walk_in' CHECK (access_type IN ('walk_in', 'verified')),
  ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'walk_in_limited' CHECK (access_level IN ('ghost', 'walk_in_limited', 'verified_consented')),
  ADD COLUMN IF NOT EXISTS consent_state TEXT DEFAULT 'pending' CHECK (consent_state IN ('pending', 'granted', 'revoked')),
  ADD COLUMN IF NOT EXISTS doctor_entered_name TEXT,
  ADD COLUMN IF NOT EXISTS doctor_entered_age INTEGER,
  ADD COLUMN IF NOT EXISTS doctor_entered_sex TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_visit_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_dpr_access_level ON public.doctor_patient_relationships(access_level);
CREATE INDEX IF NOT EXISTS idx_dpr_consent_state ON public.doctor_patient_relationships(consent_state);

UPDATE public.doctor_patient_relationships
SET
  access_level = CASE
    WHEN access_type = 'verified' THEN 'verified_consented'
    ELSE 'walk_in_limited'
  END,
  consent_state = CASE
    WHEN access_type = 'verified' THEN 'granted'
    ELSE 'pending'
  END
WHERE access_level IS NULL OR consent_state IS NULL;

-- ============================================================================
-- PRIVACY TABLES REQUIRED BY RUNTIME
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.anonymous_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  daily_number INTEGER NOT NULL,
  actual_start_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(doctor_id, visit_date, daily_number)
);

CREATE TABLE IF NOT EXISTS public.opt_out_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  reason_category TEXT NOT NULL DEFAULT 'not_specified',
  opt_out_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.patient_phone_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.patient_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.phone_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  old_phone TEXT NOT NULL,
  new_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'auth',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.patient_phone_history
  ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.phone_change_requests
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS otp_hash TEXT,
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'patient_phone_history'
      AND column_name = 'added_at'
  ) THEN
    EXECUTE '
      UPDATE public.patient_phone_history
      SET changed_at = COALESCE(changed_at, added_at)
      WHERE changed_at IS NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'phone_change_requests'
      AND column_name = 'created_at'
  ) THEN
    EXECUTE '
      UPDATE public.phone_change_requests
      SET requested_at = COALESCE(requested_at, created_at)
      WHERE requested_at IS NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'otp_codes'
      AND column_name = 'code_hash'
  ) THEN
    EXECUTE '
      UPDATE public.otp_codes
      SET otp_hash = COALESCE(otp_hash, code_hash)
      WHERE otp_hash IS NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'otp_codes'
      AND column_name = 'used_at'
  ) THEN
    EXECUTE '
      UPDATE public.otp_codes
      SET consumed_at = COALESCE(consumed_at, used_at)
      WHERE consumed_at IS NULL
    ';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_anonymous_visits_doctor_date ON public.anonymous_visits(doctor_id, visit_date);
CREATE INDEX IF NOT EXISTS idx_opt_out_statistics_doctor_date ON public.opt_out_statistics(doctor_id, opt_out_date DESC);
CREATE INDEX IF NOT EXISTS idx_phone_history_patient ON public.patient_phone_history(patient_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_codes_patient_purpose ON public.otp_codes(patient_id, purpose, expires_at DESC);

-- ============================================================================
-- CONSENT LEDGER
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patient_consent_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('messaging', 'history_sharing')),
  consent_state TEXT NOT NULL CHECK (consent_state IN ('granted', 'revoked')),
  verification_method TEXT NOT NULL DEFAULT 'patient_code',
  verification_token_hash TEXT,
  granted_by TEXT NOT NULL DEFAULT 'patient' CHECK (granted_by IN ('patient', 'guardian')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_consent_lookup
  ON public.patient_consent_grants(doctor_id, patient_id, consent_type, consent_state);

CREATE INDEX IF NOT EXISTS idx_patient_consent_clinic
  ON public.patient_consent_grants(clinic_id, doctor_id, consent_type);

-- ============================================================================
-- APPOINTMENT STATUS ALIGNMENT
-- ============================================================================

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('scheduled', 'cancelled', 'completed'));

-- ============================================================================
-- RUNTIME HELPER FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_next_anonymous_number(UUID);
DROP FUNCTION IF EXISTS public.find_duplicate_patient_phones();
DROP FUNCTION IF EXISTS public.mark_duplicate_patients(UUID, UUID[]);
DROP FUNCTION IF EXISTS public.get_public_table_names();
DROP FUNCTION IF EXISTS public.get_table_columns(TEXT);
DROP FUNCTION IF EXISTS public.can_open_messaging_conversation(UUID, UUID);

CREATE OR REPLACE FUNCTION public.get_next_anonymous_number(p_doctor_id UUID)
RETURNS INTEGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(daily_number), 0) + 1
  INTO next_num
  FROM public.anonymous_visits
  WHERE doctor_id = p_doctor_id
    AND visit_date = CURRENT_DATE;

  RETURN next_num;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.find_duplicate_patient_phones()
RETURNS TABLE(phone TEXT, duplicate_count BIGINT, patient_ids UUID[]) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.phone,
    COUNT(*) AS duplicate_count,
    ARRAY_AGG(p.id) AS patient_ids
  FROM public.patients p
  GROUP BY p.phone
  HAVING COUNT(*) > 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.mark_duplicate_patients(p_keep_id UUID, p_merge_ids UUID[])
RETURNS VOID AS $$
BEGIN
  UPDATE public.patients
  SET account_status = 'merged',
      converted_at = NOW()
  WHERE id = ANY(p_merge_ids)
    AND id <> p_keep_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_public_table_names()
RETURNS TABLE(table_name TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT t.table_name::TEXT
  FROM information_schema.tables t
  WHERE t.table_schema = 'public';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_table_columns(p_table_name TEXT)
RETURNS TABLE(column_name TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT c.column_name::TEXT
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = p_table_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_open_messaging_conversation(
  p_doctor_id UUID,
  p_patient_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_has_relationship BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.doctor_patient_relationships dpr
    WHERE dpr.doctor_id = p_doctor_id
      AND dpr.patient_id = p_patient_id
      AND (
        (dpr.access_level = 'verified_consented' AND dpr.consent_state = 'granted')
        OR dpr.access_type = 'verified'
      )
  ) INTO v_has_relationship;

  RETURN v_has_relationship;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.get_public_table_names() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_table_columns(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_table_names() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_table_columns(TEXT) TO service_role;

-- ============================================================================
-- RLS: ENABLE + POLICIES FOR NEW TABLES
-- ============================================================================

ALTER TABLE public.anonymous_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opt_out_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_phone_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_consent_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can manage anonymous visits" ON public.anonymous_visits;
CREATE POLICY "Doctors can manage anonymous visits"
ON public.anonymous_visits FOR ALL
USING (doctor_id = auth.uid())
WITH CHECK (doctor_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can manage opt out stats" ON public.opt_out_statistics;
CREATE POLICY "Doctors can manage opt out stats"
ON public.opt_out_statistics FOR ALL
USING (doctor_id = auth.uid())
WITH CHECK (doctor_id = auth.uid());

DROP POLICY IF EXISTS "Patients can view phone history" ON public.patient_phone_history;
CREATE POLICY "Patients can view phone history"
ON public.patient_phone_history FOR SELECT
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "Patients can view own recovery codes" ON public.patient_recovery_codes;
CREATE POLICY "Patients can view own recovery codes"
ON public.patient_recovery_codes FOR SELECT
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "Patients can view own phone change requests" ON public.phone_change_requests;
CREATE POLICY "Patients can view own phone change requests"
ON public.phone_change_requests FOR SELECT
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "Patients can view own otp" ON public.otp_codes;
CREATE POLICY "Patients can view own otp"
ON public.otp_codes FOR SELECT
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "Participants can read consent grants" ON public.patient_consent_grants;
CREATE POLICY "Participants can read consent grants"
ON public.patient_consent_grants FOR SELECT
USING (doctor_id = auth.uid() OR patient_id = auth.uid());

DROP POLICY IF EXISTS "Patients can manage consent grants" ON public.patient_consent_grants;
CREATE POLICY "Patients can manage consent grants"
ON public.patient_consent_grants FOR INSERT
WITH CHECK (patient_id = auth.uid());

DROP POLICY IF EXISTS "Patients can revoke consent grants" ON public.patient_consent_grants;
CREATE POLICY "Patients can revoke consent grants"
ON public.patient_consent_grants FOR UPDATE
USING (patient_id = auth.uid())
WITH CHECK (patient_id = auth.uid());

-- Conversation policy hardening (when table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'conversations'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'created_from_appointment_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "Create conversation after visit" ON public.conversations';
    EXECUTE 'CREATE POLICY "Create conversation after visit" ON public.conversations FOR INSERT WITH CHECK (
      created_from_appointment_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.appointments v
        WHERE v.id = created_from_appointment_id
          AND v.status = ''completed''
          AND v.doctor_id = conversations.doctor_id
          AND v.patient_id = conversations.patient_id
      )
      AND public.can_open_messaging_conversation(conversations.doctor_id, conversations.patient_id)
      AND (conversations.doctor_id = auth.uid() OR conversations.patient_id = auth.uid())
    )';

    EXECUTE 'DROP POLICY IF EXISTS "Participants can update conversation counters" ON public.conversations';
    EXECUTE 'CREATE POLICY "Participants can update conversation counters" ON public.conversations FOR UPDATE USING (
      doctor_id = auth.uid() OR patient_id = auth.uid()
    ) WITH CHECK (
      doctor_id = auth.uid() OR patient_id = auth.uid()
    )';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'messages'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = 'conversation_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Participants can update message read state" ON public.messages';
    EXECUTE 'CREATE POLICY "Participants can update message read state" ON public.messages FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = messages.conversation_id
          AND (c.patient_id = auth.uid() OR c.doctor_id = auth.uid())
      )
    )';
  END IF;
END
$$;

-- Keep updated_at current for consent ledger.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_patient_consent_grants_updated_at ON public.patient_consent_grants;
CREATE TRIGGER trg_patient_consent_grants_updated_at
BEFORE UPDATE ON public.patient_consent_grants
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();
