-- ============================================================================
-- PHASE 8: PATIENT EMPOWERMENT
-- ============================================================================
-- This migration adds patient diary, health tracking, and doctor-patient
-- relationship management features.

-- ============================================================================
-- DOCTOR-PATIENT RELATIONSHIPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.doctor_patient_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  relationship_type TEXT DEFAULT 'primary' CHECK (relationship_type IN ('primary', 'secondary', 'consultant')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(doctor_id, patient_id)
);

CREATE INDEX idx_doctor_patient_rel_doctor ON public.doctor_patient_relationships(doctor_id);
CREATE INDEX idx_doctor_patient_rel_patient ON public.doctor_patient_relationships(patient_id);
CREATE INDEX idx_doctor_patient_rel_status ON public.doctor_patient_relationships(status);

COMMENT ON TABLE public.doctor_patient_relationships IS 'Tracks formal doctor-patient relationships for access control and care coordination';
COMMENT ON COLUMN public.doctor_patient_relationships.status IS 'active: current relationship, inactive: ended, pending: awaiting confirmation';
COMMENT ON COLUMN public.doctor_patient_relationships.relationship_type IS 'primary: main doctor, secondary: additional care, consultant: specialist referral';

-- ============================================================================
-- PATIENT DIARY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patient_diary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('symptom', 'mood', 'activity', 'medication_log', 'note')),
  title TEXT NOT NULL,
  content TEXT,
  severity INTEGER CHECK (severity BETWEEN 1 AND 5), -- 1=mild, 5=severe (for symptoms)
  mood_score INTEGER CHECK (mood_score BETWEEN 1 AND 5), -- 1=poor, 5=excellent
  tags TEXT[], -- ['headache', 'fatigue', 'exercise', etc.]
  is_shared BOOLEAN DEFAULT FALSE, -- Whether shared with doctor
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_patient_diary_patient ON public.patient_diary(patient_id);
CREATE INDEX idx_patient_diary_date ON public.patient_diary(entry_date DESC);
CREATE INDEX idx_patient_diary_type ON public.patient_diary(entry_type);
CREATE INDEX idx_patient_diary_shared ON public.patient_diary(is_shared);

COMMENT ON TABLE public.patient_diary IS 'Patient-managed health diary for tracking symptoms, moods, activities, and notes';
COMMENT ON COLUMN public.patient_diary.entry_type IS 'symptom: health issue, mood: emotional state, activity: exercise/habits, medication_log: med adherence, note: general';
COMMENT ON COLUMN public.patient_diary.severity IS 'For symptoms only: 1=mild, 2=moderate, 3=significant, 4=severe, 5=critical';
COMMENT ON COLUMN public.patient_diary.mood_score IS 'Daily mood rating: 1=very poor, 2=poor, 3=neutral, 4=good, 5=excellent';
COMMENT ON COLUMN public.patient_diary.is_shared IS 'When true, doctors with active relationships can view this entry';

-- ============================================================================
-- HEALTH METRICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patient_health_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'blood_pressure', 'blood_glucose', 'weight', 'temperature',
    'heart_rate', 'oxygen_saturation', 'sleep_hours', 'water_intake',
    'steps', 'exercise_minutes'
  )),
  value_numeric NUMERIC, -- For single numeric values (weight, glucose, etc.)
  value_systolic INTEGER, -- For blood pressure systolic
  value_diastolic INTEGER, -- For blood pressure diastolic
  unit TEXT, -- 'kg', 'mg/dL', 'mmHg', 'bpm', '%', 'hours', 'ml', 'steps', 'minutes'
  notes TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'device', 'wearable')), -- How data was captured
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_health_metrics_patient ON public.patient_health_metrics(patient_id);
CREATE INDEX idx_health_metrics_recorded ON public.patient_health_metrics(recorded_at DESC);
CREATE INDEX idx_health_metrics_type ON public.patient_health_metrics(metric_type);

COMMENT ON TABLE public.patient_health_metrics IS 'Patient-tracked health measurements and vital signs';
COMMENT ON COLUMN public.patient_health_metrics.source IS 'manual: entered by user, device: from medical device, wearable: from fitness tracker';

-- ============================================================================
-- MEDICATION ADHERENCE LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.medication_adherence_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  medication_reminder_id UUID REFERENCES public.medication_reminders(id) ON DELETE SET NULL,
  medication_name TEXT NOT NULL,
  scheduled_time TIMESTAMPTZ NOT NULL,
  taken_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('taken', 'missed', 'skipped', 'delayed')),
  notes TEXT, -- Reason for missed/skipped
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_med_adherence_patient ON public.medication_adherence_log(patient_id);
CREATE INDEX idx_med_adherence_scheduled ON public.medication_adherence_log(scheduled_time DESC);
CREATE INDEX idx_med_adherence_status ON public.medication_adherence_log(status);

COMMENT ON TABLE public.medication_adherence_log IS 'Tracks patient medication adherence for better health monitoring';
COMMENT ON COLUMN public.medication_adherence_log.status IS 'taken: on time, missed: forgot, skipped: intentional, delayed: taken late';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.doctor_patient_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_diary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_adherence_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DOCTOR-PATIENT RELATIONSHIPS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Doctors can view their patient relationships" ON doctor_patient_relationships;
CREATE POLICY "Doctors can view their patient relationships"
ON doctor_patient_relationships FOR SELECT
USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS "Patients can view their doctor relationships" ON doctor_patient_relationships;
CREATE POLICY "Patients can view their doctor relationships"
ON doctor_patient_relationships FOR SELECT
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can create relationships" ON doctor_patient_relationships;
CREATE POLICY "Doctors can create relationships"
ON doctor_patient_relationships FOR INSERT
WITH CHECK (doctor_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can update their relationships" ON doctor_patient_relationships;
CREATE POLICY "Doctors can update their relationships"
ON doctor_patient_relationships FOR UPDATE
USING (doctor_id = auth.uid());

-- ============================================================================
-- PATIENT DIARY POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Patients can manage their diary" ON patient_diary;
CREATE POLICY "Patients can manage their diary"
ON patient_diary FOR ALL
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can view patient diary" ON patient_diary;
CREATE POLICY "Doctors can view patient diary"
ON patient_diary FOR SELECT
USING (
  is_shared = TRUE
  AND EXISTS (
    SELECT 1 FROM doctor_patient_relationships dpr
    WHERE dpr.patient_id = patient_diary.patient_id
    AND dpr.doctor_id = auth.uid()
    AND dpr.status = 'active'
  )
);

-- ============================================================================
-- HEALTH METRICS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Patients can manage their health metrics" ON patient_health_metrics;
CREATE POLICY "Patients can manage their health metrics"
ON patient_health_metrics FOR ALL
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can view patient health metrics" ON patient_health_metrics;
CREATE POLICY "Doctors can view patient health metrics"
ON patient_health_metrics FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM doctor_patient_relationships dpr
    WHERE dpr.patient_id = patient_health_metrics.patient_id
    AND dpr.doctor_id = auth.uid()
    AND dpr.status = 'active'
  )
);

-- ============================================================================
-- MEDICATION ADHERENCE LOG POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Patients can manage their adherence log" ON medication_adherence_log;
CREATE POLICY "Patients can manage their adherence log"
ON medication_adherence_log FOR ALL
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can view patient adherence" ON medication_adherence_log;
CREATE POLICY "Doctors can view patient adherence"
ON medication_adherence_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM doctor_patient_relationships dpr
    WHERE dpr.patient_id = medication_adherence_log.patient_id
    AND dpr.doctor_id = auth.uid()
    AND dpr.status = 'active'
  )
);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at for patient_diary
CREATE OR REPLACE FUNCTION update_patient_diary_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_patient_diary_updated_at ON patient_diary;
CREATE TRIGGER update_patient_diary_updated_at
  BEFORE UPDATE ON patient_diary
  FOR EACH ROW
  EXECUTE FUNCTION update_patient_diary_timestamp();

-- ============================================================================
-- SEED DATA (Optional - Create relationships for existing patients)
-- ============================================================================

-- Automatically create doctor-patient relationships based on existing clinical notes
INSERT INTO public.doctor_patient_relationships (doctor_id, patient_id, status, relationship_type)
SELECT DISTINCT
  cn.doctor_id,
  cn.patient_id,
  'active' as status,
  'primary' as relationship_type
FROM public.clinical_notes cn
WHERE NOT EXISTS (
  SELECT 1 FROM public.doctor_patient_relationships dpr
  WHERE dpr.doctor_id = cn.doctor_id
  AND dpr.patient_id = cn.patient_id
)
ON CONFLICT (doctor_id, patient_id) DO NOTHING;

-- ============================================================================
-- PHASE 8 COMPLETE
-- ============================================================================

COMMENT ON SCHEMA public IS 'Phase 8: Patient Empowerment - Added patient diary, health tracking, medication adherence, and doctor-patient relationships';
