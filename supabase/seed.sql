-- MedAssist Phase 1 - Seed Data
-- Run AFTER initial schema migration

-- ============================================================================
-- SEED SPECIALTY TEMPLATES
-- ============================================================================

-- General Practitioner Template
INSERT INTO public.templates (specialty, name, is_default, sections)
VALUES (
  'general-practitioner',
  'General Practice - Default',
  TRUE,
  '[
    {
      "type": "chief_complaint",
      "enabled": true,
      "order": 1,
      "chips": ["Fever", "Cough", "Sore throat", "Headache", "Abdominal pain", "Follow-up"]
    },
    {
      "type": "diagnosis",
      "enabled": true,
      "order": 2,
      "suggestions": ["Viral URTI", "Acute tonsillitis", "Gastroenteritis", "Hypertension (follow-up)"]
    },
    {
      "type": "medication",
      "enabled": true,
      "order": 3,
      "commonDrugs": ["Paracetamol", "Ibuprofen", "Amoxicillin", "ORS"]
    },
    {
      "type": "plan",
      "enabled": true,
      "order": 4,
      "chips": ["Rest", "Fluids", "Return if fever persists > 48h", "Labs if no improvement"]
    }
  ]'::jsonb
);

-- Pediatrics Template
INSERT INTO public.templates (specialty, name, is_default, sections)
VALUES (
  'pediatrics',
  'Pediatrics - Default',
  TRUE,
  '[
    {
      "type": "chief_complaint",
      "enabled": true,
      "order": 1,
      "chips": ["Fever", "Vomiting", "Diarrhea", "Cough", "Vaccination follow-up"]
    },
    {
      "type": "diagnosis",
      "enabled": true,
      "order": 2,
      "suggestions": ["Viral fever", "Acute otitis media", "Gastroenteritis"]
    },
    {
      "type": "medication",
      "enabled": true,
      "order": 3,
      "commonDrugs": ["Paracetamol (weight-based)", "Ibuprofen (weight-based)", "Zinc", "ORS"],
      "requiresWeightInput": true,
      "showDoseHelper": true
    },
    {
      "type": "plan",
      "enabled": true,
      "order": 4,
      "chips": ["Encourage fluids", "Monitor fever", "ER if lethargic / poor feeding"]
    }
  ]'::jsonb
);

-- Cardiology Template
INSERT INTO public.templates (specialty, name, is_default, sections)
VALUES (
  'cardiology',
  'Cardiology - Default',
  TRUE,
  '[
    {
      "type": "chief_complaint",
      "enabled": true,
      "order": 1,
      "chips": ["Chest pain", "Palpitations", "Follow-up"]
    },
    {
      "type": "diagnosis",
      "enabled": true,
      "order": 2,
      "suggestions": ["Hypertension", "Stable angina", "Arrhythmia"]
    },
    {
      "type": "medication",
      "enabled": true,
      "order": 3,
      "commonDrugs": ["Beta blockers", "ACE inhibitors", "Aspirin"]
    },
    {
      "type": "plan",
      "enabled": true,
      "order": 4,
      "chips": ["ECG", "Labs", "Lifestyle advice"]
    }
  ]'::jsonb
);

-- Endocrinology Template
INSERT INTO public.templates (specialty, name, is_default, sections)
VALUES (
  'endocrinology',
  'Endocrinology - Default',
  TRUE,
  '[
    {
      "type": "chief_complaint",
      "enabled": true,
      "order": 1,
      "chips": ["Diabetes follow-up", "Weight issues", "Fatigue"]
    },
    {
      "type": "diagnosis",
      "enabled": true,
      "order": 2,
      "suggestions": ["Type 2 DM", "Hypothyroidism"]
    },
    {
      "type": "medication",
      "enabled": true,
      "order": 3,
      "commonDrugs": ["Metformin", "Insulin (manual)", "Thyroxine"]
    },
    {
      "type": "plan",
      "enabled": true,
      "order": 4,
      "chips": ["Labs (HbA1c, TSH)", "Diet advice", "Follow-up interval"]
    }
  ]'::jsonb
);

-- ============================================================================
-- VERIFY SEED DATA
-- ============================================================================

-- Should return 4 templates
SELECT 
  specialty,
  name,
  is_default,
  jsonb_array_length(sections) as section_count
FROM public.templates
ORDER BY specialty;

-- ============================================================================
-- SEED COMPLETE
-- ============================================================================

COMMENT ON TABLE public.templates IS 'Seeded with 4 specialty templates for Egypt market';
