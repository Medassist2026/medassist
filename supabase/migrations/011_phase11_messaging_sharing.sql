-- ============================================================================
-- Migration 010: Phase 11 - Messaging and Record Sharing
-- ============================================================================

-- ============================================================================
-- 1. CONVERSATIONS TABLE (UX-P008)
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  created_from_appointment_id UUID REFERENCES appointments(id), -- REQUIRED: Messaging only after appointment
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'closed')),
  blocked_by UUID, -- Who blocked (doctor_id if doctor blocked patient)
  blocked_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  patient_unread_count INTEGER DEFAULT 0,
  doctor_unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(patient_id, doctor_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_patient ON conversations(patient_id);
CREATE INDEX IF NOT EXISTS idx_conversations_doctor ON conversations(doctor_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

-- ============================================================================
-- 2. MESSAGES TABLE (UX-P008)
-- ============================================================================

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('patient', 'doctor')),
  content TEXT NOT NULL,
  attachments TEXT[] DEFAULT '{}',
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- ============================================================================
-- 3. RECORD SHARING PREFERENCES TABLE (UX-P011)
-- ============================================================================

CREATE TABLE IF NOT EXISTS record_sharing_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  
  -- Individual category controls
  share_medications BOOLEAN DEFAULT true,
  share_conditions BOOLEAN DEFAULT true,
  share_allergies BOOLEAN DEFAULT true,  -- Recommended always true for safety
  share_lab_results BOOLEAN DEFAULT true,
  share_visit_history BOOLEAN DEFAULT true,
  share_diary BOOLEAN DEFAULT false,  -- More personal, default off
  share_vitals BOOLEAN DEFAULT true,
  
  -- Relationship status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'pending')),
  revoked_at TIMESTAMPTZ,
  
  -- Metadata
  custom_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(patient_id, doctor_id)
);

CREATE INDEX IF NOT EXISTS idx_sharing_patient ON record_sharing_preferences(patient_id);
CREATE INDEX IF NOT EXISTS idx_sharing_doctor ON record_sharing_preferences(doctor_id);
CREATE INDEX IF NOT EXISTS idx_sharing_status ON record_sharing_preferences(status);

-- ============================================================================
-- 4. DEFAULT SHARING PREFERENCES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS default_sharing_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE UNIQUE,
  
  share_medications BOOLEAN DEFAULT true,
  share_conditions BOOLEAN DEFAULT true,
  share_allergies BOOLEAN DEFAULT true,
  share_lab_results BOOLEAN DEFAULT true,
  share_visit_history BOOLEAN DEFAULT true,
  share_diary BOOLEAN DEFAULT false,
  share_vitals BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. RLS POLICIES - CONVERSATIONS
-- ============================================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Patients can view their conversations
DROP POLICY IF EXISTS "Patients can view their conversations" ON conversations;
CREATE POLICY "Patients can view their conversations"
ON conversations FOR SELECT
USING (patient_id = auth.uid());

-- Doctors can view their conversations
DROP POLICY IF EXISTS "Doctors can view their conversations" ON conversations;
CREATE POLICY "Doctors can view their conversations"
ON conversations FOR SELECT
USING (doctor_id = auth.uid());

-- Only create conversation if visit exists
DROP POLICY IF EXISTS "Create conversation after visit" ON conversations;
CREATE POLICY "Create conversation after visit"
ON conversations FOR INSERT
WITH CHECK (
  created_from_appointment_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM appointments v
    WHERE v.id = created_from_appointment_id
    AND (v.patient_id = auth.uid() OR v.doctor_id = auth.uid())
  )
);

-- Doctors can block/unblock
DROP POLICY IF EXISTS "Doctors can update conversation status" ON conversations;
CREATE POLICY "Doctors can update conversation status"
ON conversations FOR UPDATE
USING (doctor_id = auth.uid());

-- ============================================================================
-- 6. RLS POLICIES - MESSAGES
-- ============================================================================

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Participants can view messages
DROP POLICY IF EXISTS "Participants can view messages" ON messages;
CREATE POLICY "Participants can view messages"
ON messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_id
    AND (c.patient_id = auth.uid() OR c.doctor_id = auth.uid())
  )
);

-- Participants can send messages (if not blocked)
DROP POLICY IF EXISTS "Participants can send messages" ON messages;
CREATE POLICY "Participants can send messages"
ON messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_id
    AND c.status = 'active'
    AND (c.patient_id = auth.uid() OR c.doctor_id = auth.uid())
  )
);

-- ============================================================================
-- 7. RLS POLICIES - SHARING PREFERENCES
-- ============================================================================

ALTER TABLE record_sharing_preferences ENABLE ROW LEVEL SECURITY;

-- Patients can manage their sharing preferences
DROP POLICY IF EXISTS "Patients can manage sharing" ON record_sharing_preferences;
CREATE POLICY "Patients can manage sharing"
ON record_sharing_preferences FOR ALL
USING (patient_id = auth.uid());

-- Doctors can view their patients' sharing preferences
DROP POLICY IF EXISTS "Doctors can view sharing preferences" ON record_sharing_preferences;
CREATE POLICY "Doctors can view sharing preferences"
ON record_sharing_preferences FOR SELECT
USING (doctor_id = auth.uid() AND status = 'active');

ALTER TABLE default_sharing_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can manage default sharing" ON default_sharing_preferences;
CREATE POLICY "Patients can manage default sharing"
ON default_sharing_preferences FOR ALL
USING (patient_id = auth.uid());

-- ============================================================================
-- 8. HELPER FUNCTIONS
-- ============================================================================

-- Function to check if doctor can view specific record type
CREATE OR REPLACE FUNCTION can_doctor_view_record(
  p_doctor_id UUID,
  p_patient_id UUID,
  p_record_type TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_can_view BOOLEAN;
BEGIN
  -- Check sharing preferences
  EXECUTE format(
    'SELECT share_%s FROM record_sharing_preferences WHERE doctor_id = $1 AND patient_id = $2 AND status = ''active''',
    p_record_type
  ) INTO v_can_view USING p_doctor_id, p_patient_id;
  
  -- Default to false if no preference set
  RETURN COALESCE(v_can_view, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create conversation after first appointment
CREATE OR REPLACE FUNCTION create_conversation_after_visit()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create if conversation doesn't exist
  INSERT INTO conversations (patient_id, doctor_id, created_from_appointment_id)
  VALUES (NEW.patient_id, NEW.doctor_id, NEW.id)
  ON CONFLICT (patient_id, doctor_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create conversation after appointment
DROP TRIGGER IF EXISTS trigger_create_conversation ON appointments;
CREATE TRIGGER trigger_create_conversation
AFTER INSERT ON appointments
FOR EACH ROW
WHEN (NEW.status = 'completed')
EXECUTE FUNCTION create_conversation_after_visit();

-- Function to create default sharing preferences after first appointment
CREATE OR REPLACE FUNCTION create_sharing_preferences_after_visit()
RETURNS TRIGGER AS $$
DECLARE
  v_defaults RECORD;
BEGIN
  -- Get patient's default preferences
  SELECT * INTO v_defaults FROM default_sharing_preferences 
  WHERE patient_id = NEW.patient_id;
  
  -- Insert sharing preferences (using defaults if available)
  INSERT INTO record_sharing_preferences (
    patient_id, doctor_id,
    share_medications, share_conditions, share_allergies,
    share_lab_results, share_visit_history, share_diary, share_vitals
  )
  VALUES (
    NEW.patient_id, NEW.doctor_id,
    COALESCE(v_defaults.share_medications, true),
    COALESCE(v_defaults.share_conditions, true),
    COALESCE(v_defaults.share_allergies, true),
    COALESCE(v_defaults.share_lab_results, true),
    COALESCE(v_defaults.share_visit_history, true),
    COALESCE(v_defaults.share_diary, false),
    COALESCE(v_defaults.share_vitals, true)
  )
  ON CONFLICT (patient_id, doctor_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for sharing preferences
DROP TRIGGER IF EXISTS trigger_create_sharing ON appointments;
CREATE TRIGGER trigger_create_sharing
AFTER INSERT ON appointments
FOR EACH ROW
WHEN (NEW.status = 'completed')
EXECUTE FUNCTION create_sharing_preferences_after_visit();

-- ============================================================================
-- 9. COMMENTS
-- ============================================================================

COMMENT ON TABLE conversations IS 'Patient-doctor messaging threads (UX-P008)';
COMMENT ON TABLE messages IS 'Individual messages within conversations';
COMMENT ON TABLE record_sharing_preferences IS 'Per-doctor record sharing controls (UX-P011)';
COMMENT ON TABLE default_sharing_preferences IS 'Patient default sharing settings for new doctors';
COMMENT ON COLUMN conversations.created_from_appointment_id IS 'REQUIRED - Ensures messaging only after appointment';
COMMENT ON COLUMN conversations.status IS 'active=can message, blocked=doctor blocked patient, closed=ended';

-- ============================================================================
-- End of Migration 010
-- ============================================================================
