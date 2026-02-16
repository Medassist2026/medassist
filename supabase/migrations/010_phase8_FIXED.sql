-- ============================================================================
-- PHASE 8: PATIENT EMPOWERMENT - FIXED VERSION
-- ============================================================================
-- This version properly handles existing tables and missing columns

-- ============================================================================
-- STEP 1: DROP EXISTING INCOMPLETE TABLES (SAFE - uses CASCADE)
-- ============================================================================

-- Drop all Phase 8 tables if they exist (in correct order to handle dependencies)
DROP TABLE IF EXISTS public.medication_adherence_log CASCADE;
DROP TABLE IF EXISTS public.patient_health_metrics CASCADE;
DROP TABLE IF EXISTS public.patient_diary CASCADE;
DROP TABLE IF EXISTS public.doctor_patient_relationships CASCADE;

-- ============================================================================
-- STEP 2: CREATE DOCTOR-PATIENT RELATIONSHIPS TABLE
-- ============================================================================

CREATE TABLE public.doctor_patient_relationships (
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

COMMENT ON TABLE public.doctor_patient_relationships IS 'Tracks formal doctor-patient relationships for access control';

-- ============================================================================
-- STEP 3: CREATE PATIENT DIARY TABLE
-- ============================================================================

CREATE TABLE public.patient_diary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('symptom', 'mood', 'activity', 'medication_log', 'note')),
  title TEXT NOT NULL,
  content TEXT,
  severity INTEGER CHECK (severity BETWEEN 1 AND 5),
  mood_score INTEGER CHECK (mood_score BETWEEN 1 AND 5),
  tags TEXT[],
  is_shared BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_patient_diary_patient ON public.patient_diary(patient_id);
CREATE INDEX idx_patient_diary_date ON public.patient_diary(entry_date DESC);
CREATE INDEX idx_patient_diary_type ON public.patient_diary(entry_type);
CREATE INDEX idx_patient_diary_shared ON public.patient_diary(is_shared);

COMMENT ON TABLE public.patient_diary IS 'Patient health diary for tracking symptoms, moods, and activities';

-- ============================================================================
-- STEP 4: CREATE HEALTH METRICS TABLE
-- ============================================================================

CREATE TABLE public.patient_health_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'blood_pressure', 'blood_glucose', 'weight', 'temperature',
    'heart_rate', 'oxygen_saturation', 'sleep_hours', 'water_intake',
    'steps', 'exercise_minutes'
  )),
  value_numeric NUMERIC,
  value_systolic INTEGER,
  value_diastolic INTEGER,
  unit TEXT,
  notes TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'device', 'wearable')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_health_metrics_patient ON public.patient_health_metrics(patient_id);
CREATE INDEX idx_health_metrics_recorded ON public.patient_health_metrics(recorded_at DESC);
CREATE INDEX idx_health_metrics_type ON public.patient_health_metrics(metric_type);

COMMENT ON TABLE public.patient_health_metrics IS 'Patient health measurements and vital signs';

-- ============================================================================
-- STEP 5: CREATE MEDICATION ADHERENCE LOG TABLE
-- ============================================================================

CREATE TABLE public.medication_adherence_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  medication_reminder_id UUID REFERENCES public.medication_reminders(id) ON DELETE SET NULL,
  medication_name TEXT NOT NULL,
  scheduled_time TIMESTAMPTZ NOT NULL,
  taken_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('taken', 'missed', 'skipped', 'delayed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_med_adherence_patient ON public.medication_adherence_log(patient_id);
CREATE INDEX idx_med_adherence_scheduled ON public.medication_adherence_log(scheduled_time DESC);
CREATE INDEX idx_med_adherence_status ON public.medication_adherence_log(status);

COMMENT ON TABLE public.medication_adherence_log IS 'Medication adherence tracking';

-- ============================================================================
-- STEP 6: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.doctor_patient_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_diary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_adherence_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 7: RLS POLICIES - DOCTOR-PATIENT RELATIONSHIPS
-- ============================================================================

CREATE POLICY "Doctors can view their patient relationships"
ON public.doctor_patient_relationships FOR SELECT
USING (doctor_id = auth.uid());

CREATE POLICY "Patients can view their doctor relationships"
ON public.doctor_patient_relationships FOR SELECT
USING (patient_id = auth.uid());

CREATE POLICY "Doctors can create relationships"
ON public.doctor_patient_relationships FOR INSERT
WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Doctors can update their relationships"
ON public.doctor_patient_relationships FOR UPDATE
USING (doctor_id = auth.uid());

-- ============================================================================
-- STEP 8: RLS POLICIES - PATIENT DIARY
-- ============================================================================

CREATE POLICY "Patients can manage their diary"
ON public.patient_diary FOR ALL
USING (patient_id = auth.uid());

CREATE POLICY "Doctors can view shared patient diary"
ON public.patient_diary FOR SELECT
USING (
  is_shared = TRUE
  AND EXISTS (
    SELECT 1 FROM public.doctor_patient_relationships dpr
    WHERE dpr.patient_id = patient_diary.patient_id
    AND dpr.doctor_id = auth.uid()
    AND dpr.status = 'active'
  )
);

-- ============================================================================
-- STEP 9: RLS POLICIES - HEALTH METRICS
-- ============================================================================

CREATE POLICY "Patients can manage their health metrics"
ON public.patient_health_metrics FOR ALL
USING (patient_id = auth.uid());

CREATE POLICY "Doctors can view patient health metrics"
ON public.patient_health_metrics FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.doctor_patient_relationships dpr
    WHERE dpr.patient_id = patient_health_metrics.patient_id
    AND dpr.doctor_id = auth.uid()
    AND dpr.status = 'active'
  )
);

-- ============================================================================
-- STEP 10: RLS POLICIES - MEDICATION ADHERENCE
-- ============================================================================

CREATE POLICY "Patients can manage their adherence log"
ON public.medication_adherence_log FOR ALL
USING (patient_id = auth.uid());

CREATE POLICY "Doctors can view patient adherence"
ON public.medication_adherence_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.doctor_patient_relationships dpr
    WHERE dpr.patient_id = medication_adherence_log.patient_id
    AND dpr.doctor_id = auth.uid()
    AND dpr.status = 'active'
  )
);

-- ============================================================================
-- STEP 11: TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_patient_diary_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_patient_diary_updated_at
  BEFORE UPDATE ON public.patient_diary
  FOR EACH ROW
  EXECUTE FUNCTION update_patient_diary_timestamp();

-- ============================================================================
-- STEP 12: SEED RELATIONSHIPS FROM EXISTING DATA
-- ============================================================================

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
-- VERIFICATION
-- ============================================================================

-- Verify all tables were created successfully
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN (
    'doctor_patient_relationships',
    'patient_diary',
    'patient_health_metrics',
    'medication_adherence_log'
  );

  IF table_count = 4 THEN
    RAISE NOTICE '✅ Phase 8: All 4 tables created successfully';
  ELSE
    RAISE WARNING '⚠️ Only % out of 4 tables were created', table_count;
  END IF;
END $$;

-- ============================================================================
-- PHASE 8 COMPLETE
-- ============================================================================
