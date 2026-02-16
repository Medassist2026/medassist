-- ============================================================================
-- PHASE 8: PATIENT EMPOWERMENT - STEP BY STEP VERSION
-- ============================================================================
-- Run this in sections to identify where the error occurs

-- ============================================================================
-- STEP 1: CREATE DOCTOR-PATIENT RELATIONSHIPS TABLE
-- ============================================================================
-- Run this first and verify it succeeds

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

-- Verify the table was created successfully:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'doctor_patient_relationships';

-- ============================================================================
-- STEP 2: CREATE INDEXES FOR RELATIONSHIPS TABLE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_doctor_patient_rel_doctor ON public.doctor_patient_relationships(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_patient_rel_patient ON public.doctor_patient_relationships(patient_id);
CREATE INDEX IF NOT EXISTS idx_doctor_patient_rel_status ON public.doctor_patient_relationships(status);

-- ============================================================================
-- STEP 3: CREATE PATIENT DIARY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patient_diary (
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

CREATE INDEX IF NOT EXISTS idx_patient_diary_patient ON public.patient_diary(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_diary_date ON public.patient_diary(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_patient_diary_type ON public.patient_diary(entry_type);
CREATE INDEX IF NOT EXISTS idx_patient_diary_shared ON public.patient_diary(is_shared);

-- ============================================================================
-- STEP 4: CREATE HEALTH METRICS TABLE
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
  value_numeric NUMERIC,
  value_systolic INTEGER,
  value_diastolic INTEGER,
  unit TEXT,
  notes TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'device', 'wearable')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_metrics_patient ON public.patient_health_metrics(patient_id);
CREATE INDEX IF NOT EXISTS idx_health_metrics_recorded ON public.patient_health_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_metrics_type ON public.patient_health_metrics(metric_type);

-- ============================================================================
-- STEP 5: CREATE MEDICATION ADHERENCE LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.medication_adherence_log (
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

CREATE INDEX IF NOT EXISTS idx_med_adherence_patient ON public.medication_adherence_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_med_adherence_scheduled ON public.medication_adherence_log(scheduled_time DESC);
CREATE INDEX IF NOT EXISTS idx_med_adherence_status ON public.medication_adherence_log(status);

-- ============================================================================
-- STEP 6: ENABLE RLS ON ALL NEW TABLES
-- ============================================================================

ALTER TABLE public.doctor_patient_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_diary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_adherence_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 7: CREATE RLS POLICIES FOR DOCTOR-PATIENT RELATIONSHIPS
-- ============================================================================

DROP POLICY IF EXISTS "Doctors can view their patient relationships" ON public.doctor_patient_relationships;
CREATE POLICY "Doctors can view their patient relationships"
ON public.doctor_patient_relationships FOR SELECT
USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS "Patients can view their doctor relationships" ON public.doctor_patient_relationships;
CREATE POLICY "Patients can view their doctor relationships"
ON public.doctor_patient_relationships FOR SELECT
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can create relationships" ON public.doctor_patient_relationships;
CREATE POLICY "Doctors can create relationships"
ON public.doctor_patient_relationships FOR INSERT
WITH CHECK (doctor_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can update their relationships" ON public.doctor_patient_relationships;
CREATE POLICY "Doctors can update their relationships"
ON public.doctor_patient_relationships FOR UPDATE
USING (doctor_id = auth.uid());

-- ============================================================================
-- STEP 8: CREATE RLS POLICIES FOR PATIENT DIARY
-- ============================================================================

DROP POLICY IF EXISTS "Patients can manage their diary" ON public.patient_diary;
CREATE POLICY "Patients can manage their diary"
ON public.patient_diary FOR ALL
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can view patient diary" ON public.patient_diary;
CREATE POLICY "Doctors can view patient diary"
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
-- STEP 9: CREATE RLS POLICIES FOR HEALTH METRICS
-- ============================================================================

DROP POLICY IF EXISTS "Patients can manage their health metrics" ON public.patient_health_metrics;
CREATE POLICY "Patients can manage their health metrics"
ON public.patient_health_metrics FOR ALL
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can view patient health metrics" ON public.patient_health_metrics;
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
-- STEP 10: CREATE RLS POLICIES FOR MEDICATION ADHERENCE LOG
-- ============================================================================

DROP POLICY IF EXISTS "Patients can manage their adherence log" ON public.medication_adherence_log;
CREATE POLICY "Patients can manage their adherence log"
ON public.medication_adherence_log FOR ALL
USING (patient_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can view patient adherence" ON public.medication_adherence_log;
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
-- STEP 11: CREATE TRIGGER FOR AUTO-UPDATING TIMESTAMPS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_patient_diary_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_patient_diary_updated_at ON public.patient_diary;
CREATE TRIGGER update_patient_diary_updated_at
  BEFORE UPDATE ON public.patient_diary
  FOR EACH ROW
  EXECUTE FUNCTION update_patient_diary_timestamp();

-- ============================================================================
-- STEP 12: SEED RELATIONSHIPS FROM EXISTING CLINICAL NOTES
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
-- VERIFICATION QUERIES (Run these to verify everything worked)
-- ============================================================================

-- Check tables exist:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%patient%';

-- Check doctor_patient_relationships structure:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'doctor_patient_relationships'
-- ORDER BY ordinal_position;

-- Verify status column exists:
-- SELECT status FROM doctor_patient_relationships LIMIT 0;

-- Check policies:
-- SELECT policyname, tablename FROM pg_policies WHERE tablename IN (
--   'doctor_patient_relationships', 'patient_diary',
--   'patient_health_metrics', 'medication_adherence_log'
-- );
