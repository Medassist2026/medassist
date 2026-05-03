-- ============================================================
-- staging-schema-2026-05-03.sql
-- MedAssist Audit Session A — schema snapshot of medassist-egypt
-- Captured: 2026-05-03T04:11:00Z UTC
-- Project:  mtmdotixlhwksyoordbl (medassist-egypt, PostgreSQL 17.6)
-- Schema:   public
-- 
-- This file is a forensic snapshot reconstructed from
-- information_schema and pg_catalog. It is not a runnable
-- migration — DO NOT pipe it into psql.
-- ============================================================

-- ====== EXTENSIONS ============================================
-- CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions VERSION '1.11';
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions VERSION '1.3';
-- CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA pg_catalog VERSION '1.0';
-- CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault VERSION '0.3.1';
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions VERSION '1.1';

-- ====== ENUMS =================================================
CREATE TYPE public.assignment_scope AS ENUM ('APPOINTMENTS_ONLY', 'PATIENT_DEMOGRAPHICS', 'FULL_DOCTOR_SUPPORT');
CREATE TYPE public.assignment_status AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE public.clinic_role AS ENUM ('OWNER', 'DOCTOR', 'ASSISTANT', 'FRONT_DESK');
CREATE TYPE public.consent_type AS ENUM ('IMPLICIT_CLINIC_POLICY', 'DOCTOR_TO_DOCTOR_TRANSFER', 'PATIENT_CONSENT_CODE');
CREATE TYPE public.membership_status AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');
CREATE TYPE public.patient_account_status AS ENUM ('active', 'suspended', 'locked', 'deceased', 'merged');
CREATE TYPE public.privacy_code_attempt_result AS ENUM ('success', 'failure', 'locked_out', 'code_revoked', 'rate_limited');
CREATE TYPE public.visibility_mode AS ENUM ('DOCTOR_SCOPED_OWNER', 'CLINIC_WIDE', 'SHARED_BY_CONSENT');

-- ====== TABLES & COLUMNS =====================================

-- ----- public._patient_dedup_plan (rows≈-1)
CREATE TABLE public._patient_dedup_plan (
  normalized_phone                         text NOT NULL,
  winner_patient_id                        uuid NOT NULL,
  loser_patient_ids                        ARRAY /*udt=_uuid*/ NOT NULL,
  resolution                               text NOT NULL,
  decided_by                               uuid,
  decided_at                               timestamp with time zone,
  notes                                    text,
  created_at                               timestamp with time zone NOT NULL DEFAULT now()
);

-- ----- public._phone_normalize_quarantine (rows≈0)
CREATE TABLE public._phone_normalize_quarantine (
  table_name                               text NOT NULL,
  row_id                                   uuid NOT NULL,
  raw_phone                                text,
  detected_at                              timestamp with time zone NOT NULL DEFAULT now()
);

-- ----- public._rls_test_results (rows≈154)
CREATE TABLE public._rls_test_results (
  run_no                                   integer NOT NULL,
  scenario                                 text NOT NULL,
  table_name                               text NOT NULL,
  description                              text NOT NULL,
  expected_outcome                         text NOT NULL,
  actual_outcome                           text NOT NULL,
  actual_rows                              integer,
  notes                                    text,
  ran_at                                   timestamp with time zone NOT NULL DEFAULT now()
);

-- ----- public._user_dedup_plan (rows≈-1)
CREATE TABLE public._user_dedup_plan (
  normalized_phone                         text NOT NULL,
  winner_user_id                           uuid NOT NULL,
  loser_user_ids                           ARRAY /*udt=_uuid*/ NOT NULL,
  resolution                               text NOT NULL,
  decided_by                               uuid,
  decided_at                               timestamp with time zone,
  notes                                    text,
  created_at                               timestamp with time zone NOT NULL DEFAULT now()
);

-- ----- public.account_recovery_requests (rows≈-1)
CREATE TABLE public.account_recovery_requests (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  claimed_phone                            text NOT NULL,
  claimed_patient_id                       uuid,
  new_phone                                text NOT NULL,
  status                                   text DEFAULT 'pending'::text,
  verification_method                      text,
  verification_data                        jsonb,
  reviewed_by                              uuid,
  reviewed_at                              timestamp with time zone,
  review_notes                             text,
  created_at                               timestamp with time zone DEFAULT now(),
  expires_at                               timestamp with time zone DEFAULT (now() + '7 days'::interval),
  completed_at                             timestamp with time zone
);

-- ----- public.analytics_events (rows≈51)
CREATE TABLE public.analytics_events (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  event_name                               text NOT NULL,
  user_id                                  uuid NOT NULL,
  properties                               jsonb,
  created_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.anonymous_visits (rows≈-1)
CREATE TABLE public.anonymous_visits (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  doctor_id                                uuid NOT NULL,
  clinic_id                                uuid,
  visit_date                               date NOT NULL DEFAULT CURRENT_DATE,
  daily_number                             integer NOT NULL,
  scheduled_time                           timestamp with time zone,
  actual_start_time                        timestamp with time zone,
  actual_end_time                          timestamp with time zone,
  status                                   text DEFAULT 'completed'::text,
  created_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.api_rate_limits (rows≈109)
CREATE TABLE public.api_rate_limits (
  scope                                    text NOT NULL,
  key_hash                                 text NOT NULL,
  window_start                             timestamp with time zone NOT NULL,
  window_ms                                integer NOT NULL,
  count                                    integer NOT NULL DEFAULT 0,
  created_at                               timestamp with time zone NOT NULL DEFAULT now(),
  updated_at                               timestamp with time zone NOT NULL DEFAULT now()
);

-- ----- public.appointments (rows≈17)
CREATE TABLE public.appointments (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  doctor_id                                uuid NOT NULL,
  patient_id                               uuid,
  clinic_id                                uuid NOT NULL,
  start_time                               timestamp with time zone NOT NULL,
  duration_minutes                         integer DEFAULT 10,
  status                                   text DEFAULT 'scheduled'::text,
  created_by_role                          text NOT NULL,
  created_at                               timestamp with time zone DEFAULT now(),
  notes                                    text,
  checked_in_at                            timestamp with time zone,
  checked_in_by                            uuid,
  appointment_type                         text DEFAULT 'regular'::text,
  reason                                   text,
  window_status                            text NOT NULL DEFAULT 'none'::text,
  window_queue_id                          uuid,
  global_patient_id                        uuid NOT NULL,
  patient_clinic_record_id                 uuid NOT NULL
);

-- ----- public.assistant_doctor_assignments (rows≈-1)
CREATE TABLE public.assistant_doctor_assignments (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  clinic_id                                uuid NOT NULL,
  assistant_user_id                        uuid NOT NULL,
  doctor_user_id                           uuid NOT NULL,
  scope                                    USER-DEFINED /*udt=assignment_scope*/ NOT NULL DEFAULT 'APPOINTMENTS_ONLY'::assignment_scope,
  status                                   USER-DEFINED /*udt=assignment_status*/ NOT NULL DEFAULT 'ACTIVE'::assignment_status,
  created_by                               uuid,
  created_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.audit_events (rows≈310)
CREATE TABLE public.audit_events (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  clinic_id                                uuid,
  actor_user_id                            uuid,
  action                                   text NOT NULL,
  entity_type                              text NOT NULL,
  entity_id                                uuid,
  metadata                                 jsonb DEFAULT '{}'::jsonb,
  created_at                               timestamp with time zone DEFAULT now(),
  actor_kind                               text NOT NULL,
  resolved_global_patient_id               uuid GENERATED ALWAYS AS (COALESCE((NULLIF((metadata ->> 'global_patient_id'::text), ''::text))::uuid,
CASE
    WHEN (entity_type = 'global_patients'::text) THEN entity_id
    ELSE NULL::uuid
END)) STORED
);

-- ----- public.audit_log (rows≈-1)
CREATE TABLE public.audit_log (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id                                  uuid,
  user_role                                text,
  action                                   text NOT NULL,
  resource_type                            text,
  resource_id                              text,
  details                                  jsonb,
  ip_address                               text,
  created_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.check_in_queue (rows≈19)
CREATE TABLE public.check_in_queue (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  doctor_id                                uuid NOT NULL,
  appointment_id                           uuid,
  queue_number                             integer NOT NULL,
  queue_type                               text DEFAULT 'appointment'::text,
  status                                   text DEFAULT 'waiting'::text,
  checked_in_at                            timestamp with time zone DEFAULT now(),
  called_at                                timestamp with time zone,
  completed_at                             timestamp with time zone,
  created_at                               timestamp with time zone DEFAULT now(),
  apt_window_status                        text NOT NULL DEFAULT 'none'::text,
  swapped_appointment_id                   uuid,
  swapped_patient_name                     text,
  estimated_slot_time                      timestamp with time zone,
  priority                                 integer NOT NULL DEFAULT 1,
  clinic_id                                uuid NOT NULL
);

-- ----- public.chronic_conditions (rows≈-1)
CREATE TABLE public.chronic_conditions (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  condition_name                           text NOT NULL,
  diagnosed_date                           date NOT NULL DEFAULT CURRENT_DATE,
  status                                   text NOT NULL DEFAULT 'active'::text,
  notes                                    text,
  created_at                               timestamp with time zone NOT NULL DEFAULT now(),
  updated_at                               timestamp with time zone NOT NULL DEFAULT now(),
  clinic_id                                uuid NOT NULL
);

-- ----- public.clinic_memberships (rows≈45)
CREATE TABLE public.clinic_memberships (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  clinic_id                                uuid NOT NULL,
  user_id                                  uuid NOT NULL,
  role                                     USER-DEFINED /*udt=clinic_role*/ NOT NULL DEFAULT 'DOCTOR'::clinic_role,
  status                                   USER-DEFINED /*udt=membership_status*/ NOT NULL DEFAULT 'ACTIVE'::membership_status,
  created_by                               uuid,
  created_at                               timestamp with time zone DEFAULT now(),
  updated_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.clinical_notes (rows≈45)
CREATE TABLE public.clinical_notes (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  doctor_id                                uuid NOT NULL,
  patient_id                               uuid NOT NULL,
  appointment_id                           uuid,
  chief_complaint                          ARRAY /*udt=_text*/ NOT NULL DEFAULT '{}'::text[],
  diagnosis                                jsonb NOT NULL DEFAULT '[]'::jsonb,
  medications                              jsonb NOT NULL DEFAULT '[]'::jsonb,
  plan                                     text NOT NULL DEFAULT ''::text,
  template_id                              uuid,
  keystroke_count                          integer,
  duration_seconds                         integer,
  synced_to_patient                        boolean DEFAULT false,
  created_at                               timestamp with time zone DEFAULT now(),
  modified_at                              timestamp with time zone DEFAULT now(),
  prescription_number                      text,
  doctor_license_number                    text,
  prescription_date                        date DEFAULT CURRENT_DATE,
  prescription_printed_at                  timestamp with time zone,
  clinic_id                                uuid NOT NULL,
  note_data                                jsonb DEFAULT '{}'::jsonb,
  client_idempotency_key                   text,
  global_patient_id                        uuid NOT NULL,
  patient_clinic_record_id                 uuid NOT NULL
);

-- ----- public.clinics (rows≈23)
CREATE TABLE public.clinics (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  unique_id                                text NOT NULL,
  name                                     text NOT NULL,
  created_at                               timestamp with time zone DEFAULT now(),
  address                                  text NOT NULL DEFAULT ''::text,
  invite_code                              text,
  default_visibility                       USER-DEFINED /*udt=visibility_mode*/ DEFAULT 'DOCTOR_SCOPED_OWNER'::visibility_mode,
  settings                                 jsonb DEFAULT '{}'::jsonb
);

-- ----- public.conversations (rows≈17)
CREATE TABLE public.conversations (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  doctor_id                                uuid NOT NULL,
  created_from_appointment_id              uuid,
  status                                   text DEFAULT 'active'::text,
  blocked_by                               uuid,
  blocked_at                               timestamp with time zone,
  last_message_at                          timestamp with time zone,
  patient_unread_count                     integer DEFAULT 0,
  doctor_unread_count                      integer DEFAULT 0,
  created_at                               timestamp with time zone DEFAULT now(),
  updated_at                               timestamp with time zone DEFAULT now(),
  clinic_id                                uuid NOT NULL
);

-- ----- public.default_sharing_preferences (rows≈-1)
CREATE TABLE public.default_sharing_preferences (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  share_medications                        boolean DEFAULT true,
  share_conditions                         boolean DEFAULT true,
  share_allergies                          boolean DEFAULT true,
  share_lab_results                        boolean DEFAULT true,
  share_visit_history                      boolean DEFAULT true,
  share_diary                              boolean DEFAULT false,
  share_vitals                             boolean DEFAULT true,
  created_at                               timestamp with time zone DEFAULT now(),
  updated_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.doctor_availability (rows≈22)
CREATE TABLE public.doctor_availability (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  doctor_id                                uuid NOT NULL,
  day_of_week                              integer NOT NULL,
  start_time                               time without time zone NOT NULL,
  end_time                                 time without time zone NOT NULL,
  slot_duration_minutes                    integer DEFAULT 15,
  is_active                                boolean DEFAULT true,
  created_at                               timestamp with time zone DEFAULT now(),
  clinic_id                                uuid NOT NULL
);

-- ----- public.doctor_patient_relationships (rows≈32)
CREATE TABLE public.doctor_patient_relationships (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  doctor_id                                uuid NOT NULL,
  patient_id                               uuid NOT NULL,
  status                                   text NOT NULL DEFAULT 'active'::text,
  relationship_type                        text DEFAULT 'primary'::text,
  started_at                               timestamp with time zone DEFAULT now(),
  ended_at                                 timestamp with time zone,
  notes                                    text,
  created_at                               timestamp with time zone DEFAULT now(),
  access_type                              text DEFAULT 'walk_in'::text,
  access_level                             text DEFAULT 'walk_in_limited'::text,
  consent_state                            text DEFAULT 'pending'::text,
  doctor_entered_name                      text,
  doctor_entered_age                       integer,
  doctor_entered_sex                       text,
  verified_at                              timestamp with time zone,
  consent_granted_at                       timestamp with time zone,
  consent_revoked_at                       timestamp with time zone,
  last_visit_at                            timestamp with time zone,
  clinic_id                                uuid NOT NULL,
  global_patient_id                        uuid NOT NULL,
  patient_clinic_record_id                 uuid NOT NULL
);

-- ----- public.doctor_templates (rows≈-1)
CREATE TABLE public.doctor_templates (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  doctor_id                                uuid NOT NULL,
  template_id                              uuid NOT NULL,
  customizations                           jsonb,
  last_used                                timestamp with time zone
);

-- ----- public.doctors (rows≈109)
CREATE TABLE public.doctors (
  id                                       uuid NOT NULL,
  unique_id                                text NOT NULL,
  specialty                                text NOT NULL,
  default_template_id                      uuid,
  created_at                               timestamp with time zone DEFAULT now(),
  full_name                                text
);

-- ----- public.front_desk_staff (rows≈49)
CREATE TABLE public.front_desk_staff (
  id                                       uuid NOT NULL,
  unique_id                                text NOT NULL,
  full_name                                text NOT NULL,
  created_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.global_patients (rows≈63)
CREATE TABLE public.global_patients (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  normalized_phone                         text,
  legacy_phone                             text,
  display_name                             text,
  date_of_birth                            date,
  age                                      integer,
  sex                                      text,
  preferred_language                       text NOT NULL DEFAULT 'ar'::text,
  claimed                                  boolean NOT NULL DEFAULT false,
  claimed_at                               timestamp with time zone,
  claimed_user_id                          uuid,
  account_status                           USER-DEFINED /*udt=patient_account_status*/ NOT NULL DEFAULT 'active'::patient_account_status,
  merged_into                              uuid,
  deceased_at                              timestamp with time zone,
  consent_to_anonymous_research            boolean NOT NULL DEFAULT false,
  consent_to_anonymous_research_at         timestamp with time zone,
  created_at                               timestamp with time zone NOT NULL DEFAULT now(),
  updated_at                               timestamp with time zone NOT NULL DEFAULT now(),
  patient_code_hash                        text,
  patient_code_generated_at                timestamp with time zone,
  patient_code_expires_at                  timestamp with time zone
);

-- ----- public.imaging_orders (rows≈1)
CREATE TABLE public.imaging_orders (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  doctor_id                                uuid NOT NULL,
  patient_id                               uuid NOT NULL,
  modality                                 text NOT NULL,
  study_name                               text NOT NULL,
  clinical_indication                      text,
  priority                                 text NOT NULL DEFAULT 'routine'::text,
  status                                   text NOT NULL DEFAULT 'requested'::text,
  facility_name                            text,
  ordered_at                               timestamp with time zone NOT NULL DEFAULT now(),
  scheduled_for                            timestamp with time zone,
  completed_at                             timestamp with time zone,
  created_at                               timestamp with time zone NOT NULL DEFAULT now(),
  updated_at                               timestamp with time zone NOT NULL DEFAULT now(),
  clinic_id                                uuid NOT NULL,
  global_patient_id                        uuid,
  patient_clinic_record_id                 uuid
);

-- ----- public.immunizations (rows≈-1)
CREATE TABLE public.immunizations (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  vaccine_name                             text NOT NULL,
  administered_date                        date NOT NULL DEFAULT CURRENT_DATE,
  provider_name                            text,
  facility_name                            text,
  dose                                     text,
  lot_number                               text,
  notes                                    text,
  created_at                               timestamp with time zone NOT NULL DEFAULT now(),
  updated_at                               timestamp with time zone NOT NULL DEFAULT now(),
  clinic_id                                uuid NOT NULL
);

-- ----- public.invoice_requests (rows≈-1)
CREATE TABLE public.invoice_requests (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id                               uuid NOT NULL,
  clinic_id                                uuid NOT NULL,
  invoice_number                           text NOT NULL,
  issued_by                                uuid,
  sms_sent                                 boolean DEFAULT false,
  sms_sent_at                              timestamp with time zone,
  created_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.lab_orders (rows≈-1)
CREATE TABLE public.lab_orders (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  doctor_id                                uuid NOT NULL,
  clinical_note_id                         uuid,
  status                                   text DEFAULT 'pending'::text,
  priority                                 text DEFAULT 'routine'::text,
  notes                                    text,
  ordered_at                               timestamp with time zone DEFAULT now(),
  collected_at                             timestamp with time zone,
  completed_at                             timestamp with time zone,
  created_at                               timestamp with time zone DEFAULT now(),
  clinic_id                                uuid NOT NULL,
  global_patient_id                        uuid,
  patient_clinic_record_id                 uuid
);

-- ----- public.lab_results (rows≈-1)
CREATE TABLE public.lab_results (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  lab_order_id                             uuid NOT NULL,
  lab_test_id                              uuid NOT NULL,
  result_value                             numeric,
  result_text                              text,
  is_abnormal                              boolean DEFAULT false,
  abnormal_flag                            text,
  result_date                              timestamp with time zone DEFAULT now(),
  created_at                               timestamp with time zone DEFAULT now(),
  clinic_id                                uuid NOT NULL,
  global_patient_id                        uuid,
  patient_clinic_record_id                 uuid
);

-- ----- public.lab_results_entries (rows≈-1)
CREATE TABLE public.lab_results_entries (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id                                 uuid NOT NULL,
  test_id                                  uuid,
  test_name                                text NOT NULL,
  result_value                             text,
  result_unit                              text,
  reference_range                          text,
  is_abnormal                              boolean DEFAULT false,
  notes                                    text,
  created_at                               timestamp with time zone DEFAULT now(),
  updated_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.lab_results_orders (rows≈-1)
CREATE TABLE public.lab_results_orders (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id                               uuid NOT NULL,
  clinic_id                                uuid,
  doctor_id                                uuid,
  status                                   text NOT NULL DEFAULT 'pending'::text,
  ordered_at                               timestamp with time zone DEFAULT now(),
  created_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.lab_tests (rows≈-1)
CREATE TABLE public.lab_tests (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  test_code                                text NOT NULL,
  test_name                                text NOT NULL,
  category                                 text NOT NULL,
  normal_range_min                         numeric,
  normal_range_max                         numeric,
  unit                                     text,
  is_active                                boolean DEFAULT true,
  created_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.medication_adherence_log (rows≈-1)
CREATE TABLE public.medication_adherence_log (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  medication_reminder_id                   uuid,
  medication_name                          text NOT NULL,
  scheduled_time                           timestamp with time zone NOT NULL,
  taken_at                                 timestamp with time zone,
  status                                   text NOT NULL,
  notes                                    text,
  created_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.medication_reminders (rows≈3)
CREATE TABLE public.medication_reminders (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  clinical_note_id                         uuid NOT NULL,
  patient_id                               uuid NOT NULL,
  medication                               jsonb NOT NULL,
  status                                   text DEFAULT 'pending'::text,
  expires_at                               timestamp with time zone NOT NULL,
  created_at                               timestamp with time zone DEFAULT now(),
  clinic_id                                uuid NOT NULL
);

-- ----- public.messages (rows≈29)
CREATE TABLE public.messages (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  conversation_id                          uuid NOT NULL,
  sender_id                                uuid NOT NULL,
  sender_type                              text NOT NULL,
  content                                  text NOT NULL,
  attachments                              ARRAY /*udt=_text*/ DEFAULT '{}'::text[],
  read_at                                  timestamp with time zone,
  sent_at                                  timestamp with time zone DEFAULT now(),
  created_at                               timestamp with time zone DEFAULT now(),
  clinic_id                                uuid NOT NULL
);

-- ----- public.notifications (rows≈-1)
CREATE TABLE public.notifications (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  recipient_id                             uuid NOT NULL,
  recipient_role                           text NOT NULL DEFAULT 'doctor'::text,
  type                                     text NOT NULL,
  title                                    text NOT NULL,
  body                                     text,
  clinic_id                                uuid,
  appointment_id                           uuid,
  patient_id                               uuid,
  read                                     boolean NOT NULL DEFAULT false,
  created_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.opt_out_statistics (rows≈-1)
CREATE TABLE public.opt_out_statistics (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  doctor_id                                uuid NOT NULL,
  clinic_id                                uuid,
  opt_out_date                             date NOT NULL DEFAULT CURRENT_DATE,
  opt_out_time                             timestamp with time zone DEFAULT now(),
  reason_category                          text DEFAULT 'not_specified'::text,
  created_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.otp_codes (rows≈-1)
CREATE TABLE public.otp_codes (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  phone                                    text NOT NULL,
  code_hash                                text NOT NULL,
  purpose                                  text NOT NULL,
  patient_id                               uuid,
  attempts                                 integer DEFAULT 0,
  max_attempts                             integer DEFAULT 3,
  used                                     boolean DEFAULT false,
  used_at                                  timestamp with time zone,
  created_at                               timestamp with time zone DEFAULT now(),
  expires_at                               timestamp with time zone DEFAULT (now() + '00:10:00'::interval),
  otp_hash                                 text,
  consumed_at                              timestamp with time zone
);

-- ----- public.patient_allergies (rows≈-1)
CREATE TABLE public.patient_allergies (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  allergen                                 text NOT NULL,
  reaction                                 text,
  severity                                 text NOT NULL DEFAULT 'moderate'::text,
  recorded_date                            date NOT NULL DEFAULT CURRENT_DATE,
  notes                                    text,
  created_at                               timestamp with time zone NOT NULL DEFAULT now(),
  updated_at                               timestamp with time zone NOT NULL DEFAULT now(),
  clinic_id                                uuid NOT NULL
);

-- ----- public.patient_clinic_records (rows≈36)
CREATE TABLE public.patient_clinic_records (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  global_patient_id                        uuid NOT NULL,
  clinic_id                                uuid NOT NULL,
  is_anonymous_to_global                   boolean NOT NULL DEFAULT false,
  consent_to_messaging                     boolean NOT NULL DEFAULT false,
  consent_to_messaging_granted_at          timestamp with time zone,
  first_seen_at                            timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at                             timestamp with time zone NOT NULL DEFAULT now(),
  created_at                               timestamp with time zone NOT NULL DEFAULT now(),
  updated_at                               timestamp with time zone NOT NULL DEFAULT now()
);

-- ----- public.patient_consent_grants (rows≈2)
CREATE TABLE public.patient_consent_grants (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  doctor_id                                uuid NOT NULL,
  patient_id                               uuid NOT NULL,
  clinic_id                                uuid,
  consent_type                             text NOT NULL,
  consent_state                            text NOT NULL,
  verification_method                      text NOT NULL DEFAULT 'patient_code'::text,
  verification_token_hash                  text,
  granted_by                               text NOT NULL DEFAULT 'patient'::text,
  granted_at                               timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at                               timestamp with time zone,
  created_at                               timestamp with time zone NOT NULL DEFAULT now(),
  updated_at                               timestamp with time zone NOT NULL DEFAULT now(),
  global_patient_id                        uuid NOT NULL,
  patient_clinic_record_id                 uuid NOT NULL
);

-- ----- public.patient_data_shares (rows≈3)
CREATE TABLE public.patient_data_shares (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  global_patient_id                        uuid NOT NULL,
  grantor_clinic_id                        uuid NOT NULL,
  grantee_clinic_id                        uuid NOT NULL,
  granted_at                               timestamp with time zone NOT NULL DEFAULT now(),
  expires_at                               timestamp with time zone,
  revoked_at                               timestamp with time zone,
  granted_via                              text NOT NULL,
  grant_reason                             text,
  audit_event_id                           uuid,
  created_at                               timestamp with time zone NOT NULL DEFAULT now(),
  updated_at                               timestamp with time zone NOT NULL DEFAULT now()
);

-- ----- public.patient_diary (rows≈11)
CREATE TABLE public.patient_diary (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  entry_date                               date NOT NULL DEFAULT CURRENT_DATE,
  entry_type                               text NOT NULL,
  title                                    text NOT NULL,
  content                                  text,
  severity                                 integer,
  mood_score                               integer,
  tags                                     ARRAY /*udt=_text*/,
  is_shared                                boolean DEFAULT false,
  created_at                               timestamp with time zone DEFAULT now(),
  updated_at                               timestamp with time zone DEFAULT now(),
  clinic_id                                uuid NOT NULL
);

-- ----- public.patient_health_metrics (rows≈-1)
CREATE TABLE public.patient_health_metrics (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  recorded_at                              timestamp with time zone NOT NULL DEFAULT now(),
  metric_type                              text NOT NULL,
  value_numeric                            numeric,
  value_systolic                           integer,
  value_diastolic                          integer,
  unit                                     text,
  notes                                    text,
  source                                   text DEFAULT 'manual'::text,
  created_at                               timestamp with time zone DEFAULT now(),
  clinic_id                                uuid NOT NULL
);

-- ----- public.patient_medical_records (rows≈11)
CREATE TABLE public.patient_medical_records (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  record_type                              text NOT NULL,
  title                                    text NOT NULL,
  description                              text,
  date                                     date NOT NULL,
  provider_name                            text,
  facility_name                            text,
  has_attachment                           boolean DEFAULT false,
  attachment_url                           text,
  created_at                               timestamp with time zone DEFAULT now(),
  updated_at                               timestamp with time zone DEFAULT now(),
  clinic_id                                uuid NOT NULL
);

-- ----- public.patient_medication_intake (rows≈-1)
CREATE TABLE public.patient_medication_intake (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id                               uuid NOT NULL,
  drug_name                                text NOT NULL,
  generic_name                             text,
  dosage                                   text,
  frequency                                text,
  prescriber                               text,
  condition                                text,
  duration_taking                          text,
  still_taking                             boolean DEFAULT true,
  intake_completed_at                      timestamp with time zone DEFAULT now(),
  created_at                               timestamp with time zone DEFAULT now(),
  updated_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.patient_medication_reminders (rows≈-1)
CREATE TABLE public.patient_medication_reminders (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id                               uuid NOT NULL,
  medication_name                          text NOT NULL,
  dosage                                   text,
  frequency                                text,
  reminder_times                           ARRAY /*udt=_text*/,
  notes                                    text,
  is_active                                boolean DEFAULT true,
  created_at                               timestamp with time zone DEFAULT now(),
  updated_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.patient_medications (rows≈7)
CREATE TABLE public.patient_medications (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  medication_name                          text NOT NULL,
  dosage                                   text NOT NULL,
  frequency                                text NOT NULL,
  route                                    text,
  start_date                               date NOT NULL,
  end_date                                 date,
  is_active                                boolean DEFAULT true,
  prescriber_name                          text,
  purpose                                  text,
  notes                                    text,
  created_at                               timestamp with time zone DEFAULT now(),
  updated_at                               timestamp with time zone DEFAULT now(),
  clinic_id                                uuid NOT NULL
);

-- ----- public.patient_phone_history (rows≈29)
CREATE TABLE public.patient_phone_history (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  phone                                    text NOT NULL,
  is_current                               boolean DEFAULT true,
  verified                                 boolean DEFAULT false,
  verified_at                              timestamp with time zone,
  added_at                                 timestamp with time zone DEFAULT now(),
  removed_at                               timestamp with time zone,
  removed_reason                           text,
  changed_at                               timestamp with time zone NOT NULL DEFAULT now(),
  changed_by                               uuid,
  change_reason                            text,
  global_patient_id                        uuid NOT NULL
);

-- ----- public.patient_phone_verification_issues (rows≈-1)
CREATE TABLE public.patient_phone_verification_issues (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  phone                                    text NOT NULL,
  issue_type                               text NOT NULL,
  error_message                            text,
  error_code                               text,
  resolved                                 boolean DEFAULT false,
  resolved_by                              uuid,
  resolved_at                              timestamp with time zone,
  resolution_action                        text,
  resolution_notes                         text,
  created_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.patient_privacy_codes (rows≈-1)
CREATE TABLE public.patient_privacy_codes (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  global_patient_id                        uuid NOT NULL,
  code_hash                                text NOT NULL,
  algorithm                                text NOT NULL DEFAULT 'bcrypt'::text,
  attempts_count                           integer NOT NULL DEFAULT 0,
  last_attempt_at                          timestamp with time zone,
  locked_until                             timestamp with time zone,
  regenerated_count                        integer NOT NULL DEFAULT 0,
  created_at                               timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at                               timestamp with time zone,
  revoked_reason                           text
);

-- ----- public.patient_recovery_codes (rows≈-1)
CREATE TABLE public.patient_recovery_codes (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  code_hash                                text NOT NULL,
  used                                     boolean DEFAULT false,
  used_at                                  timestamp with time zone,
  created_at                               timestamp with time zone DEFAULT now(),
  expires_at                               timestamp with time zone DEFAULT (now() + '2 years'::interval)
);

-- ----- public.patient_visibility (rows≈32)
CREATE TABLE public.patient_visibility (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  clinic_id                                uuid NOT NULL,
  patient_id                               uuid NOT NULL,
  grantee_type                             text NOT NULL DEFAULT 'DOCTOR'::text,
  grantee_user_id                          uuid,
  mode                                     USER-DEFINED /*udt=visibility_mode*/ NOT NULL DEFAULT 'DOCTOR_SCOPED_OWNER'::visibility_mode,
  consent                                  USER-DEFINED /*udt=consent_type*/ NOT NULL DEFAULT 'IMPLICIT_CLINIC_POLICY'::consent_type,
  granted_by_user_id                       uuid,
  expires_at                               timestamp with time zone,
  created_at                               timestamp with time zone DEFAULT now(),
  global_patient_id                        uuid NOT NULL,
  patient_clinic_record_id                 uuid NOT NULL
);

-- ----- public.patients (rows≈35)
CREATE TABLE public.patients (
  id                                       uuid NOT NULL,
  unique_id                                text NOT NULL,
  phone                                    text NOT NULL,
  registered                               boolean DEFAULT false,
  created_at                               timestamp with time zone DEFAULT now(),
  full_name                                text,
  age                                      integer,
  sex                                      text,
  parent_phone                             text,
  is_dependent                             boolean DEFAULT false,
  national_id_hash                         text,
  national_id_last4                        text,
  email                                    text,
  phone_verified                           boolean DEFAULT false,
  phone_verified_at                        timestamp with time zone,
  account_status                           text DEFAULT 'active'::text,
  last_activity_at                         timestamp with time zone DEFAULT now(),
  created_by_doctor_id                     uuid,
  converted_at                             timestamp with time zone,
  guardian_id                              uuid,
  clinic_id                                uuid NOT NULL,
  normalized_phone                         text,
  is_canonical                             boolean,
  duplicate_of_patient_id                  uuid,
  global_patient_id                        uuid NOT NULL
);

-- ----- public.payments (rows≈0)
CREATE TABLE public.payments (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  doctor_id                                uuid NOT NULL,
  appointment_id                           uuid,
  clinical_note_id                         uuid,
  amount                                   numeric NOT NULL,
  payment_method                           text NOT NULL,
  payment_status                           text DEFAULT 'completed'::text,
  notes                                    text,
  collected_by                             uuid,
  created_at                               timestamp with time zone DEFAULT now(),
  insurance_company                        text,
  insurance_policy_number                  text,
  clinic_id                                uuid NOT NULL,
  client_idempotency_key                   text
);

-- ----- public.phone_change_requests (rows≈-1)
CREATE TABLE public.phone_change_requests (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid,
  old_phone                                text NOT NULL,
  new_phone                                text NOT NULL,
  status                                   text DEFAULT 'pending'::text,
  verification_method                      text,
  old_phone_otp_hash                       text,
  old_phone_verified_at                    timestamp with time zone,
  new_phone_otp_hash                       text,
  new_phone_verified_at                    timestamp with time zone,
  created_at                               timestamp with time zone DEFAULT now(),
  expires_at                               timestamp with time zone DEFAULT (now() + '24:00:00'::interval),
  completed_at                             timestamp with time zone,
  requested_at                             timestamp with time zone NOT NULL DEFAULT now(),
  user_id                                  uuid
);

-- ----- public.phone_corrections (rows≈-1)
CREATE TABLE public.phone_corrections (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  old_phone                                text NOT NULL,
  new_phone                                text NOT NULL,
  reason                                   text NOT NULL,
  verification_method                      text,
  initiated_by                             text NOT NULL,
  initiated_by_user_id                     uuid,
  status                                   text DEFAULT 'pending'::text,
  otp_hash                                 text,
  created_at                               timestamp with time zone DEFAULT now(),
  completed_at                             timestamp with time zone
);

-- ----- public.prescription_items (rows≈-1)
CREATE TABLE public.prescription_items (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  clinical_note_id                         uuid NOT NULL,
  patient_id                               uuid NOT NULL,
  doctor_id                                uuid NOT NULL,
  clinic_id                                uuid,
  drug_name                                text NOT NULL,
  drug_brand_name                          text,
  drug_brand_name_ar                       text,
  generic_name                             text,
  drug_id                                  text,
  strength                                 text,
  form                                     text,
  frequency                                text NOT NULL,
  duration                                 text NOT NULL,
  quantity                                 integer,
  instructions                             text,
  status                                   text DEFAULT 'prescribed'::text,
  prescribed_at                            timestamp with time zone DEFAULT now(),
  created_at                               timestamp with time zone DEFAULT now(),
  updated_at                               timestamp with time zone DEFAULT now(),
  global_patient_id                        uuid,
  patient_clinic_record_id                 uuid
);

-- ----- public.prescription_templates (rows≈-1)
CREATE TABLE public.prescription_templates (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  doctor_id                                uuid NOT NULL,
  name                                     text NOT NULL,
  medications                              jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at                               timestamp with time zone NOT NULL DEFAULT now(),
  updated_at                               timestamp with time zone NOT NULL DEFAULT now(),
  usage_count                              integer NOT NULL DEFAULT 0
);

-- ----- public.privacy_code_attempts (rows≈-1)
CREATE TABLE public.privacy_code_attempts (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  global_patient_id                        uuid NOT NULL,
  privacy_code_id                          uuid,
  attempted_by_user_id                     uuid NOT NULL,
  attempted_by_clinic_id                   uuid NOT NULL,
  result                                   USER-DEFINED /*udt=privacy_code_attempt_result*/ NOT NULL,
  ip_address                               inet,
  user_agent                               text,
  request_id                               uuid,
  created_at                               timestamp with time zone NOT NULL DEFAULT now()
);

-- ----- public.privacy_code_sms_tokens (rows≈-1)
CREATE TABLE public.privacy_code_sms_tokens (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  global_patient_id                        uuid NOT NULL,
  requesting_clinic_id                     uuid NOT NULL,
  requesting_doctor_id                     uuid NOT NULL,
  sms_code_hash                            text NOT NULL,
  algorithm                                text NOT NULL DEFAULT 'bcrypt'::text,
  created_at                               timestamp with time zone NOT NULL DEFAULT now(),
  expires_at                               timestamp with time zone NOT NULL,
  used_at                                  timestamp with time zone,
  used_by_user_id                          uuid,
  attempts_count                           integer NOT NULL DEFAULT 0
);

-- ----- public.push_subscriptions (rows≈-1)
CREATE TABLE public.push_subscriptions (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id                                  uuid,
  endpoint                                 text NOT NULL,
  keys_p256dh                              text NOT NULL,
  keys_auth                                text NOT NULL,
  created_at                               timestamp with time zone DEFAULT now(),
  updated_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.record_sharing_preferences (rows≈1)
CREATE TABLE public.record_sharing_preferences (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  doctor_id                                uuid NOT NULL,
  share_medications                        boolean DEFAULT true,
  share_conditions                         boolean DEFAULT true,
  share_allergies                          boolean DEFAULT true,
  share_lab_results                        boolean DEFAULT true,
  share_visit_history                      boolean DEFAULT true,
  share_diary                              boolean DEFAULT false,
  share_vitals                             boolean DEFAULT true,
  status                                   text DEFAULT 'active'::text,
  revoked_at                               timestamp with time zone,
  custom_note                              text,
  created_at                               timestamp with time zone DEFAULT now(),
  updated_at                               timestamp with time zone DEFAULT now(),
  clinic_id                                uuid NOT NULL
);

-- ----- public.sms_reminders (rows≈-1)
CREATE TABLE public.sms_reminders (
  id                                       uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id                               uuid NOT NULL,
  appointment_id                           uuid,
  clinic_id                                uuid,
  phone_number                             text NOT NULL,
  message_type                             text NOT NULL,
  message_body                             text NOT NULL,
  message_body_ar                          text,
  status                                   text DEFAULT 'pending'::text,
  twilio_sid                               text,
  error_message                            text,
  scheduled_for                            timestamp with time zone,
  sent_at                                  timestamp with time zone,
  created_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.templates (rows≈-1)
CREATE TABLE public.templates (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  specialty                                text NOT NULL,
  name                                     text NOT NULL,
  is_default                               boolean DEFAULT false,
  sections                                 jsonb NOT NULL,
  created_at                               timestamp with time zone DEFAULT now()
);

-- ----- public.users (rows≈295)
CREATE TABLE public.users (
  id                                       uuid NOT NULL,
  phone                                    text NOT NULL,
  email                                    text,
  role                                     text NOT NULL,
  created_at                               timestamp with time zone DEFAULT now(),
  phone_verified                           boolean NOT NULL DEFAULT false,
  phone_verified_at                        timestamp with time zone,
  normalized_phone                         text,
  is_canonical                             boolean NOT NULL,
  duplicate_of_user_id                     uuid
);

-- ----- public.vital_signs (rows≈-1)
CREATE TABLE public.vital_signs (
  id                                       uuid NOT NULL DEFAULT uuid_generate_v4(),
  patient_id                               uuid NOT NULL,
  doctor_id                                uuid NOT NULL,
  clinical_note_id                         uuid,
  systolic_bp                              integer,
  diastolic_bp                             integer,
  heart_rate                               integer,
  temperature                              numeric,
  respiratory_rate                         integer,
  oxygen_saturation                        integer,
  weight                                   numeric,
  height                                   integer,
  bmi                                      numeric,
  notes                                    text,
  measured_at                              timestamp with time zone DEFAULT now(),
  created_at                               timestamp with time zone DEFAULT now(),
  clinic_id                                uuid NOT NULL,
  global_patient_id                        uuid,
  patient_clinic_record_id                 uuid
);

-- ====== VIEWS ================================================

CREATE OR REPLACE VIEW public._patient_phone_duplicates AS
 SELECT normalized_phone,
    (count(*))::integer AS dup_count,
    array_agg(id ORDER BY created_at, id) AS patient_ids,
    array_agg(clinic_id ORDER BY created_at, id) AS clinic_ids,
    array_agg(full_name ORDER BY created_at, id) AS full_names,
    min(created_at) AS earliest_created,
    max(created_at) AS latest_created
   FROM patients
  WHERE (normalized_phone IS NOT NULL)
  GROUP BY normalized_phone
 HAVING (count(*) > 1);

CREATE OR REPLACE VIEW public._user_phone_duplicates AS
 SELECT normalized_phone,
    (count(*))::integer AS dup_count,
    array_agg(id ORDER BY created_at, id) AS user_ids,
    min(created_at) AS earliest_created,
    max(created_at) AS latest_created
   FROM users
  WHERE (normalized_phone IS NOT NULL)
  GROUP BY normalized_phone
 HAVING (count(*) > 1);

CREATE OR REPLACE VIEW public.effective_messaging_consent AS
 WITH legacy_grants AS (
         SELECT COALESCE(pcg.clinic_id, pcr_for_pcg.clinic_id) AS clinic_id,
            pcg.global_patient_id,
            min(pcg.granted_at) AS legacy_granted_at
           FROM (patient_consent_grants pcg
             LEFT JOIN patient_clinic_records pcr_for_pcg ON ((pcr_for_pcg.id = pcg.patient_clinic_record_id)))
          WHERE ((pcg.consent_type = 'messaging'::text) AND (pcg.consent_state = 'granted'::text) AND (pcg.revoked_at IS NULL) AND (pcg.global_patient_id IS NOT NULL) AND (COALESCE(pcg.clinic_id, pcr_for_pcg.clinic_id) IS NOT NULL))
          GROUP BY COALESCE(pcg.clinic_id, pcr_for_pcg.clinic_id), pcg.global_patient_id
        ), reconfirmation_decisions AS (
         SELECT DISTINCT audit_events.entity_id AS global_patient_id,
            ((audit_events.metadata ->> 'clinic_id'::text))::uuid AS clinic_id
           FROM audit_events
          WHERE ((audit_events.action = ANY (ARRAY['MESSAGING_CONSENT_RECONFIRMED'::text, 'MESSAGING_CONSENT_REVOKED'::text])) AND (audit_events.entity_type = 'global_patients'::text) AND (audit_events.entity_id IS NOT NULL) AND ((audit_events.metadata ->> 'clinic_id'::text) IS NOT NULL))
        )
 SELECT pcr.global_patient_id,
    pcr.clinic_id,
    pcr.consent_to_messaging,
    pcr.consent_to_messaging_granted_at,
    (pcr.consent_to_messaging OR ((lg.legacy_granted_at IS NOT NULL) AND (now() < ('2026-04-29 00:00:00+00'::timestamp with time zone + '90 days'::interval)) AND (rd.global_patient_id IS NULL))) AS effective_consent,
        CASE
            WHEN pcr.consent_to_messaging THEN 'explicit'::text
            WHEN ((lg.legacy_granted_at IS NOT NULL) AND (now() < ('2026-04-29 00:00:00+00'::timestamp with time zone + '90 days'::interval)) AND (rd.global_patient_id IS NULL)) THEN 'legacy_grace'::text
            ELSE 'none'::text
        END AS source,
    lg.legacy_granted_at,
    ('2026-04-29 00:00:00+00'::timestamp with time zone + '90 days'::interval) AS grace_expires_at,
    ((rd.global_patient_id IS NULL) AND (lg.legacy_granted_at IS NOT NULL) AND (NOT pcr.consent_to_messaging)) AS needs_reconsent
   FROM ((patient_clinic_records pcr
     LEFT JOIN legacy_grants lg ON (((lg.global_patient_id = pcr.global_patient_id) AND (lg.clinic_id = pcr.clinic_id))))
     LEFT JOIN reconfirmation_decisions rd ON (((rd.global_patient_id = pcr.global_patient_id) AND (rd.clinic_id = pcr.clinic_id))));

-- ====== CONSTRAINTS (PK / FK / UNIQUE / CHECK) ===============
ALTER TABLE _patient_dedup_plan ADD CONSTRAINT _patient_dedup_plan_pkey PRIMARY KEY (normalized_phone);
ALTER TABLE _patient_dedup_plan ADD CONSTRAINT _patient_dedup_plan_resolution_check CHECK ((resolution = ANY (ARRAY['auto_oldest_wins'::text, 'manual_review'::text])));
ALTER TABLE _phone_normalize_quarantine ADD CONSTRAINT _phone_normalize_quarantine_pkey PRIMARY KEY (table_name, row_id);
ALTER TABLE _rls_test_results ADD CONSTRAINT _rls_test_results_actual_outcome_check CHECK ((actual_outcome = ANY (ARRAY['SUCCESS'::text, 'FAIL'::text])));
ALTER TABLE _rls_test_results ADD CONSTRAINT _rls_test_results_expected_outcome_check CHECK ((expected_outcome = ANY (ARRAY['SUCCESS'::text, 'FAIL'::text])));
ALTER TABLE _user_dedup_plan ADD CONSTRAINT _user_dedup_plan_pkey PRIMARY KEY (normalized_phone);
ALTER TABLE _user_dedup_plan ADD CONSTRAINT _user_dedup_plan_resolution_check CHECK ((resolution = ANY (ARRAY['auto_oldest_wins'::text, 'manual_review'::text])));
ALTER TABLE account_recovery_requests ADD CONSTRAINT account_recovery_requests_claimed_patient_id_fkey FOREIGN KEY (claimed_patient_id) REFERENCES patients(id);
ALTER TABLE account_recovery_requests ADD CONSTRAINT account_recovery_requests_pkey PRIMARY KEY (id);
ALTER TABLE account_recovery_requests ADD CONSTRAINT account_recovery_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE account_recovery_requests ADD CONSTRAINT account_recovery_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verification_sent'::text, 'verified'::text, 'completed'::text, 'rejected'::text, 'expired'::text])));
ALTER TABLE account_recovery_requests ADD CONSTRAINT account_recovery_requests_verification_method_check CHECK ((verification_method = ANY (ARRAY['email'::text, 'recovery_code'::text, 'national_id'::text, 'manual_review'::text])));
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_pkey PRIMARY KEY (id);
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE anonymous_visits ADD CONSTRAINT anonymous_visits_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE anonymous_visits ADD CONSTRAINT anonymous_visits_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;
ALTER TABLE anonymous_visits ADD CONSTRAINT anonymous_visits_doctor_id_visit_date_daily_number_key UNIQUE (doctor_id, visit_date, daily_number);
ALTER TABLE anonymous_visits ADD CONSTRAINT anonymous_visits_pkey PRIMARY KEY (id);
ALTER TABLE anonymous_visits ADD CONSTRAINT anonymous_visits_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE api_rate_limits ADD CONSTRAINT api_rate_limits_pkey PRIMARY KEY (scope, key_hash, window_start);
ALTER TABLE appointments ADD CONSTRAINT appointments_appointment_type_check CHECK ((appointment_type = ANY (ARRAY['regular'::text, 'followup'::text, 'emergency'::text, 'consultation'::text, 'urgent'::text])));
ALTER TABLE appointments ADD CONSTRAINT appointments_checked_in_by_fkey FOREIGN KEY (checked_in_by) REFERENCES users(id);
ALTER TABLE appointments ADD CONSTRAINT appointments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD CONSTRAINT appointments_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;
ALTER TABLE appointments ADD CONSTRAINT appointments_duration_minutes_check CHECK ((duration_minutes > 0));
ALTER TABLE appointments ADD CONSTRAINT appointments_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id) ON DELETE RESTRICT;
ALTER TABLE appointments ADD CONSTRAINT appointments_patient_clinic_record_id_fkey FOREIGN KEY (patient_clinic_record_id) REFERENCES patient_clinic_records(id) ON DELETE RESTRICT;
ALTER TABLE appointments ADD CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text, 'no_show'::text, 'in_progress'::text])));
ALTER TABLE appointments ADD CONSTRAINT appointments_window_status_check CHECK ((window_status = ANY (ARRAY['none'::text, 'open'::text, 'expired'::text])));
ALTER TABLE assistant_doctor_assignments ADD CONSTRAINT assistant_doctor_assignments_assistant_user_id_fkey FOREIGN KEY (assistant_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE assistant_doctor_assignments ADD CONSTRAINT assistant_doctor_assignments_clinic_id_assistant_user_id_do_key UNIQUE (clinic_id, assistant_user_id, doctor_user_id);
ALTER TABLE assistant_doctor_assignments ADD CONSTRAINT assistant_doctor_assignments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE assistant_doctor_assignments ADD CONSTRAINT assistant_doctor_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE assistant_doctor_assignments ADD CONSTRAINT assistant_doctor_assignments_doctor_user_id_fkey FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE assistant_doctor_assignments ADD CONSTRAINT assistant_doctor_assignments_pkey PRIMARY KEY (id);
ALTER TABLE audit_events ADD CONSTRAINT audit_events_actor_consistency CHECK ((((actor_kind = 'user'::text) AND (actor_user_id IS NOT NULL)) OR ((actor_kind = ANY (ARRAY['system'::text, 'migration'::text])) AND (actor_user_id IS NULL))));
ALTER TABLE audit_events ADD CONSTRAINT audit_events_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['user'::text, 'system'::text, 'migration'::text])));
ALTER TABLE audit_events ADD CONSTRAINT audit_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);
ALTER TABLE audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE check_in_queue ADD CONSTRAINT check_in_queue_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE check_in_queue ADD CONSTRAINT check_in_queue_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE check_in_queue ADD CONSTRAINT check_in_queue_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;
ALTER TABLE check_in_queue ADD CONSTRAINT check_in_queue_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE check_in_queue ADD CONSTRAINT check_in_queue_pkey PRIMARY KEY (id);
ALTER TABLE check_in_queue ADD CONSTRAINT check_in_queue_queue_type_check CHECK ((queue_type = ANY (ARRAY['appointment'::text, 'walkin'::text, 'emergency'::text])));
ALTER TABLE check_in_queue ADD CONSTRAINT check_in_queue_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE check_in_queue ADD CONSTRAINT ciq_apt_window_status_check CHECK ((apt_window_status = ANY (ARRAY['none'::text, 'open'::text, 'expired'::text])));
ALTER TABLE chronic_conditions ADD CONSTRAINT chronic_conditions_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE chronic_conditions ADD CONSTRAINT chronic_conditions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE chronic_conditions ADD CONSTRAINT chronic_conditions_pkey PRIMARY KEY (id);
ALTER TABLE chronic_conditions ADD CONSTRAINT chronic_conditions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'resolved'::text])));
ALTER TABLE clinic_memberships ADD CONSTRAINT clinic_memberships_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE clinic_memberships ADD CONSTRAINT clinic_memberships_clinic_id_user_id_key UNIQUE (clinic_id, user_id);
ALTER TABLE clinic_memberships ADD CONSTRAINT clinic_memberships_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE clinic_memberships ADD CONSTRAINT clinic_memberships_pkey PRIMARY KEY (id);
ALTER TABLE clinic_memberships ADD CONSTRAINT clinic_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE clinical_notes ADD CONSTRAINT clinical_notes_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE clinical_notes ADD CONSTRAINT clinical_notes_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE clinical_notes ADD CONSTRAINT clinical_notes_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;
ALTER TABLE clinical_notes ADD CONSTRAINT clinical_notes_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id) ON DELETE RESTRICT;
ALTER TABLE clinical_notes ADD CONSTRAINT clinical_notes_patient_clinic_record_id_fkey FOREIGN KEY (patient_clinic_record_id) REFERENCES patient_clinic_records(id) ON DELETE RESTRICT;
ALTER TABLE clinical_notes ADD CONSTRAINT clinical_notes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE clinical_notes ADD CONSTRAINT clinical_notes_pkey PRIMARY KEY (id);
ALTER TABLE clinical_notes ADD CONSTRAINT clinical_notes_prescription_number_key UNIQUE (prescription_number);
ALTER TABLE clinics ADD CONSTRAINT clinics_invite_code_key UNIQUE (invite_code);
ALTER TABLE clinics ADD CONSTRAINT clinics_pkey PRIMARY KEY (id);
ALTER TABLE clinics ADD CONSTRAINT clinics_unique_id_key UNIQUE (unique_id);
ALTER TABLE conversations ADD CONSTRAINT conversations_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD CONSTRAINT conversations_created_from_appointment_id_fkey FOREIGN KEY (created_from_appointment_id) REFERENCES appointments(id);
ALTER TABLE conversations ADD CONSTRAINT conversations_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD CONSTRAINT conversations_patient_id_doctor_id_key UNIQUE (patient_id, doctor_id);
ALTER TABLE conversations ADD CONSTRAINT conversations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
ALTER TABLE conversations ADD CONSTRAINT conversations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'blocked'::text, 'closed'::text])));
ALTER TABLE default_sharing_preferences ADD CONSTRAINT default_sharing_preferences_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE default_sharing_preferences ADD CONSTRAINT default_sharing_preferences_patient_id_key UNIQUE (patient_id);
ALTER TABLE default_sharing_preferences ADD CONSTRAINT default_sharing_preferences_pkey PRIMARY KEY (id);
ALTER TABLE doctor_availability ADD CONSTRAINT doctor_availability_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE doctor_availability ADD CONSTRAINT doctor_availability_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
ALTER TABLE doctor_availability ADD CONSTRAINT doctor_availability_doctor_id_day_of_week_start_time_key UNIQUE (doctor_id, day_of_week, start_time);
ALTER TABLE doctor_availability ADD CONSTRAINT doctor_availability_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;
ALTER TABLE doctor_availability ADD CONSTRAINT doctor_availability_pkey PRIMARY KEY (id);
ALTER TABLE doctor_availability ADD CONSTRAINT doctor_availability_slot_duration_minutes_check CHECK ((slot_duration_minutes > 0));
ALTER TABLE doctor_patient_relationships ADD CONSTRAINT doctor_patient_relationships_access_level_check CHECK ((access_level = ANY (ARRAY['ghost'::text, 'walk_in_limited'::text, 'verified_consented'::text])));
ALTER TABLE doctor_patient_relationships ADD CONSTRAINT doctor_patient_relationships_access_type_check CHECK ((access_type = ANY (ARRAY['walk_in'::text, 'verified'::text])));
ALTER TABLE doctor_patient_relationships ADD CONSTRAINT doctor_patient_relationships_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE doctor_patient_relationships ADD CONSTRAINT doctor_patient_relationships_consent_state_check CHECK ((consent_state = ANY (ARRAY['pending'::text, 'granted'::text, 'revoked'::text])));
ALTER TABLE doctor_patient_relationships ADD CONSTRAINT doctor_patient_relationships_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;
ALTER TABLE doctor_patient_relationships ADD CONSTRAINT doctor_patient_relationships_doctor_id_patient_id_key UNIQUE (doctor_id, patient_id);
ALTER TABLE doctor_patient_relationships ADD CONSTRAINT doctor_patient_relationships_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id) ON DELETE RESTRICT;
ALTER TABLE doctor_patient_relationships ADD CONSTRAINT doctor_patient_relationships_patient_clinic_record_id_fkey FOREIGN KEY (patient_clinic_record_id) REFERENCES patient_clinic_records(id) ON DELETE RESTRICT;
ALTER TABLE doctor_patient_relationships ADD CONSTRAINT doctor_patient_relationships_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE doctor_patient_relationships ADD CONSTRAINT doctor_patient_relationships_pkey PRIMARY KEY (id);
ALTER TABLE doctor_patient_relationships ADD CONSTRAINT doctor_patient_relationships_relationship_type_check CHECK ((relationship_type = ANY (ARRAY['primary'::text, 'secondary'::text, 'consultant'::text])));
ALTER TABLE doctor_patient_relationships ADD CONSTRAINT doctor_patient_relationships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'pending'::text])));
ALTER TABLE doctor_templates ADD CONSTRAINT doctor_templates_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;
ALTER TABLE doctor_templates ADD CONSTRAINT doctor_templates_doctor_id_template_id_key UNIQUE (doctor_id, template_id);
ALTER TABLE doctor_templates ADD CONSTRAINT doctor_templates_pkey PRIMARY KEY (id);
ALTER TABLE doctor_templates ADD CONSTRAINT doctor_templates_template_id_fkey FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE;
ALTER TABLE doctors ADD CONSTRAINT doctors_id_fkey FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE doctors ADD CONSTRAINT doctors_pkey PRIMARY KEY (id);
ALTER TABLE doctors ADD CONSTRAINT doctors_specialty_check CHECK ((specialty = ANY (ARRAY['general-practitioner'::text, 'pediatrics'::text, 'cardiology'::text, 'endocrinology'::text])));
ALTER TABLE doctors ADD CONSTRAINT doctors_unique_id_key UNIQUE (unique_id);
ALTER TABLE front_desk_staff ADD CONSTRAINT front_desk_staff_id_fkey FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE front_desk_staff ADD CONSTRAINT front_desk_staff_pkey PRIMARY KEY (id);
ALTER TABLE front_desk_staff ADD CONSTRAINT front_desk_staff_unique_id_key UNIQUE (unique_id);
ALTER TABLE global_patients ADD CONSTRAINT global_patients_age_check CHECK (((age IS NULL) OR ((age >= 0) AND (age <= 120))));
ALTER TABLE global_patients ADD CONSTRAINT global_patients_claim_consistency_chk CHECK ((((claimed = false) AND (claimed_user_id IS NULL) AND (claimed_at IS NULL)) OR ((claimed = true) AND (claimed_user_id IS NOT NULL) AND (claimed_at IS NOT NULL))));
ALTER TABLE global_patients ADD CONSTRAINT global_patients_claimed_user_id_fkey FOREIGN KEY (claimed_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE global_patients ADD CONSTRAINT global_patients_deceased_consistency_chk CHECK ((((account_status = 'deceased'::patient_account_status) AND (deceased_at IS NOT NULL)) OR (account_status <> 'deceased'::patient_account_status)));
ALTER TABLE global_patients ADD CONSTRAINT global_patients_merge_consistency_chk CHECK ((((account_status = 'merged'::patient_account_status) AND (merged_into IS NOT NULL)) OR ((account_status <> 'merged'::patient_account_status) AND (merged_into IS NULL))));
ALTER TABLE global_patients ADD CONSTRAINT global_patients_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES global_patients(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE global_patients ADD CONSTRAINT global_patients_phone_e164_chk CHECK ((normalized_phone ~ '^\+[1-9][0-9]{6,14}$'::text));
ALTER TABLE global_patients ADD CONSTRAINT global_patients_pkey PRIMARY KEY (id);
ALTER TABLE global_patients ADD CONSTRAINT global_patients_sex_check CHECK (((sex IS NULL) OR (sex = ANY (ARRAY['Male'::text, 'Female'::text, 'Other'::text, 'prefer_not_to_say'::text]))));
ALTER TABLE imaging_orders ADD CONSTRAINT imaging_orders_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE imaging_orders ADD CONSTRAINT imaging_orders_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;
ALTER TABLE imaging_orders ADD CONSTRAINT imaging_orders_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id) ON DELETE RESTRICT;
ALTER TABLE imaging_orders ADD CONSTRAINT imaging_orders_modality_check CHECK ((modality = ANY (ARRAY['xray'::text, 'ct'::text, 'mri'::text, 'ultrasound'::text, 'other'::text])));
ALTER TABLE imaging_orders ADD CONSTRAINT imaging_orders_patient_clinic_record_id_fkey FOREIGN KEY (patient_clinic_record_id) REFERENCES patient_clinic_records(id) ON DELETE RESTRICT;
ALTER TABLE imaging_orders ADD CONSTRAINT imaging_orders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE imaging_orders ADD CONSTRAINT imaging_orders_pkey PRIMARY KEY (id);
ALTER TABLE imaging_orders ADD CONSTRAINT imaging_orders_priority_check CHECK ((priority = ANY (ARRAY['routine'::text, 'urgent'::text, 'stat'::text])));
ALTER TABLE imaging_orders ADD CONSTRAINT imaging_orders_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'scheduled'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE immunizations ADD CONSTRAINT immunizations_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE immunizations ADD CONSTRAINT immunizations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE immunizations ADD CONSTRAINT immunizations_pkey PRIMARY KEY (id);
ALTER TABLE invoice_requests ADD CONSTRAINT invoice_requests_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE invoice_requests ADD CONSTRAINT invoice_requests_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES users(id);
ALTER TABLE invoice_requests ADD CONSTRAINT invoice_requests_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE;
ALTER TABLE invoice_requests ADD CONSTRAINT invoice_requests_payment_id_key UNIQUE (payment_id);
ALTER TABLE invoice_requests ADD CONSTRAINT invoice_requests_pkey PRIMARY KEY (id);
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_clinical_note_id_fkey FOREIGN KEY (clinical_note_id) REFERENCES clinical_notes(id) ON DELETE SET NULL;
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id) ON DELETE RESTRICT;
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_patient_clinic_record_id_fkey FOREIGN KEY (patient_clinic_record_id) REFERENCES patient_clinic_records(id) ON DELETE RESTRICT;
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_pkey PRIMARY KEY (id);
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_priority_check CHECK ((priority = ANY (ARRAY['routine'::text, 'urgent'::text, 'stat'::text])));
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'collected'::text, 'processing'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE lab_results ADD CONSTRAINT lab_results_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE lab_results ADD CONSTRAINT lab_results_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id) ON DELETE RESTRICT;
ALTER TABLE lab_results ADD CONSTRAINT lab_results_lab_order_id_fkey FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE CASCADE;
ALTER TABLE lab_results ADD CONSTRAINT lab_results_lab_test_id_fkey FOREIGN KEY (lab_test_id) REFERENCES lab_tests(id) ON DELETE CASCADE;
ALTER TABLE lab_results ADD CONSTRAINT lab_results_patient_clinic_record_id_fkey FOREIGN KEY (patient_clinic_record_id) REFERENCES patient_clinic_records(id) ON DELETE RESTRICT;
ALTER TABLE lab_results ADD CONSTRAINT lab_results_pkey PRIMARY KEY (id);
ALTER TABLE lab_results_entries ADD CONSTRAINT lab_results_entries_order_id_fkey FOREIGN KEY (order_id) REFERENCES lab_results_orders(id) ON DELETE CASCADE;
ALTER TABLE lab_results_entries ADD CONSTRAINT lab_results_entries_pkey PRIMARY KEY (id);
ALTER TABLE lab_results_entries ADD CONSTRAINT lab_results_entries_test_id_fkey FOREIGN KEY (test_id) REFERENCES lab_tests(id) ON DELETE SET NULL;
ALTER TABLE lab_results_orders ADD CONSTRAINT lab_results_orders_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE lab_results_orders ADD CONSTRAINT lab_results_orders_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE lab_results_orders ADD CONSTRAINT lab_results_orders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE lab_results_orders ADD CONSTRAINT lab_results_orders_pkey PRIMARY KEY (id);
ALTER TABLE lab_results_orders ADD CONSTRAINT lab_results_orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'collected'::text, 'processing'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE lab_tests ADD CONSTRAINT lab_tests_pkey PRIMARY KEY (id);
ALTER TABLE lab_tests ADD CONSTRAINT lab_tests_test_code_key UNIQUE (test_code);
ALTER TABLE medication_adherence_log ADD CONSTRAINT medication_adherence_log_medication_reminder_id_fkey FOREIGN KEY (medication_reminder_id) REFERENCES medication_reminders(id) ON DELETE SET NULL;
ALTER TABLE medication_adherence_log ADD CONSTRAINT medication_adherence_log_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE medication_adherence_log ADD CONSTRAINT medication_adherence_log_pkey PRIMARY KEY (id);
ALTER TABLE medication_adherence_log ADD CONSTRAINT medication_adherence_log_status_check CHECK ((status = ANY (ARRAY['taken'::text, 'missed'::text, 'skipped'::text, 'delayed'::text])));
ALTER TABLE medication_reminders ADD CONSTRAINT medication_reminders_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE medication_reminders ADD CONSTRAINT medication_reminders_clinical_note_id_fkey FOREIGN KEY (clinical_note_id) REFERENCES clinical_notes(id) ON DELETE CASCADE;
ALTER TABLE medication_reminders ADD CONSTRAINT medication_reminders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE medication_reminders ADD CONSTRAINT medication_reminders_pkey PRIMARY KEY (id);
ALTER TABLE medication_reminders ADD CONSTRAINT medication_reminders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])));
ALTER TABLE messages ADD CONSTRAINT messages_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE messages ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE messages ADD CONSTRAINT messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['patient'::text, 'doctor'::text])));
ALTER TABLE notifications ADD CONSTRAINT notifications_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD CONSTRAINT notifications_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD CONSTRAINT notifications_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE notifications ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_recipient_role_check CHECK ((recipient_role = ANY (ARRAY['doctor'::text, 'frontdesk'::text, 'patient'::text])));
ALTER TABLE opt_out_statistics ADD CONSTRAINT opt_out_statistics_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE opt_out_statistics ADD CONSTRAINT opt_out_statistics_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;
ALTER TABLE opt_out_statistics ADD CONSTRAINT opt_out_statistics_pkey PRIMARY KEY (id);
ALTER TABLE opt_out_statistics ADD CONSTRAINT opt_out_statistics_reason_category_check CHECK ((reason_category = ANY (ARRAY['privacy'::text, 'sensitive_condition'::text, 'cash_payment'::text, 'testing_service'::text, 'other'::text, 'not_specified'::text])));
ALTER TABLE otp_codes ADD CONSTRAINT otp_codes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE otp_codes ADD CONSTRAINT otp_codes_pkey PRIMARY KEY (id);
ALTER TABLE otp_codes ADD CONSTRAINT otp_codes_purpose_check CHECK ((purpose = ANY (ARRAY['phone_verification'::text, 'phone_change_old'::text, 'phone_change_new'::text, 'phone_correction'::text, 'account_recovery'::text, 'login'::text, 'registration'::text, 'password_reset'::text, 'reset_token'::text])));
ALTER TABLE patient_allergies ADD CONSTRAINT patient_allergies_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE patient_allergies ADD CONSTRAINT patient_allergies_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE patient_allergies ADD CONSTRAINT patient_allergies_pkey PRIMARY KEY (id);
ALTER TABLE patient_allergies ADD CONSTRAINT patient_allergies_severity_check CHECK ((severity = ANY (ARRAY['mild'::text, 'moderate'::text, 'severe'::text])));
ALTER TABLE patient_clinic_records ADD CONSTRAINT patient_clinic_records_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE RESTRICT;
ALTER TABLE patient_clinic_records ADD CONSTRAINT patient_clinic_records_consent_timestamp_consistency CHECK (((consent_to_messaging = false) OR ((consent_to_messaging = true) AND (consent_to_messaging_granted_at IS NOT NULL))));
ALTER TABLE patient_clinic_records ADD CONSTRAINT patient_clinic_records_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id) ON DELETE RESTRICT;
ALTER TABLE patient_clinic_records ADD CONSTRAINT patient_clinic_records_pcr_uniq UNIQUE (global_patient_id, clinic_id);
ALTER TABLE patient_clinic_records ADD CONSTRAINT patient_clinic_records_pkey PRIMARY KEY (id);
ALTER TABLE patient_consent_grants ADD CONSTRAINT patient_consent_grants_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE patient_consent_grants ADD CONSTRAINT patient_consent_grants_consent_state_check CHECK ((consent_state = ANY (ARRAY['granted'::text, 'revoked'::text])));
ALTER TABLE patient_consent_grants ADD CONSTRAINT patient_consent_grants_consent_type_check CHECK ((consent_type = ANY (ARRAY['messaging'::text, 'history_sharing'::text])));
ALTER TABLE patient_consent_grants ADD CONSTRAINT patient_consent_grants_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;
ALTER TABLE patient_consent_grants ADD CONSTRAINT patient_consent_grants_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id) ON DELETE RESTRICT;
ALTER TABLE patient_consent_grants ADD CONSTRAINT patient_consent_grants_granted_by_check CHECK ((granted_by = ANY (ARRAY['patient'::text, 'guardian'::text])));
ALTER TABLE patient_consent_grants ADD CONSTRAINT patient_consent_grants_patient_clinic_record_id_fkey FOREIGN KEY (patient_clinic_record_id) REFERENCES patient_clinic_records(id) ON DELETE RESTRICT;
ALTER TABLE patient_consent_grants ADD CONSTRAINT patient_consent_grants_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE patient_consent_grants ADD CONSTRAINT patient_consent_grants_pkey PRIMARY KEY (id);
ALTER TABLE patient_data_shares ADD CONSTRAINT patient_data_shares_audit_event_id_fkey FOREIGN KEY (audit_event_id) REFERENCES audit_events(id);
ALTER TABLE patient_data_shares ADD CONSTRAINT patient_data_shares_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id);
ALTER TABLE patient_data_shares ADD CONSTRAINT patient_data_shares_granted_via_check CHECK ((granted_via = ANY (ARRAY['PRIVACY_CODE'::text, 'SMS_CODE'::text, 'PATIENT_APP'::text, 'AUTO_RENEW'::text])));
ALTER TABLE patient_data_shares ADD CONSTRAINT patient_data_shares_grantee_clinic_id_fkey FOREIGN KEY (grantee_clinic_id) REFERENCES clinics(id);
ALTER TABLE patient_data_shares ADD CONSTRAINT patient_data_shares_grantor_clinic_id_fkey FOREIGN KEY (grantor_clinic_id) REFERENCES clinics(id);
ALTER TABLE patient_data_shares ADD CONSTRAINT patient_data_shares_grantor_grantee_distinct CHECK ((grantor_clinic_id <> grantee_clinic_id));
ALTER TABLE patient_data_shares ADD CONSTRAINT patient_data_shares_pkey PRIMARY KEY (id);
ALTER TABLE patient_diary ADD CONSTRAINT patient_diary_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE patient_diary ADD CONSTRAINT patient_diary_entry_type_check CHECK ((entry_type = ANY (ARRAY['symptom'::text, 'mood'::text, 'activity'::text, 'medication_log'::text, 'note'::text])));
ALTER TABLE patient_diary ADD CONSTRAINT patient_diary_mood_score_check CHECK (((mood_score >= 1) AND (mood_score <= 5)));
ALTER TABLE patient_diary ADD CONSTRAINT patient_diary_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE patient_diary ADD CONSTRAINT patient_diary_pkey PRIMARY KEY (id);
ALTER TABLE patient_diary ADD CONSTRAINT patient_diary_severity_check CHECK (((severity >= 1) AND (severity <= 5)));
ALTER TABLE patient_health_metrics ADD CONSTRAINT patient_health_metrics_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE patient_health_metrics ADD CONSTRAINT patient_health_metrics_metric_type_check CHECK ((metric_type = ANY (ARRAY['blood_pressure'::text, 'blood_glucose'::text, 'weight'::text, 'temperature'::text, 'heart_rate'::text, 'oxygen_saturation'::text, 'sleep_hours'::text, 'water_intake'::text, 'steps'::text, 'exercise_minutes'::text])));
ALTER TABLE patient_health_metrics ADD CONSTRAINT patient_health_metrics_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE patient_health_metrics ADD CONSTRAINT patient_health_metrics_pkey PRIMARY KEY (id);
ALTER TABLE patient_health_metrics ADD CONSTRAINT patient_health_metrics_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'device'::text, 'wearable'::text])));
ALTER TABLE patient_medical_records ADD CONSTRAINT patient_medical_records_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE patient_medical_records ADD CONSTRAINT patient_medical_records_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE patient_medical_records ADD CONSTRAINT patient_medical_records_pkey PRIMARY KEY (id);
ALTER TABLE patient_medical_records ADD CONSTRAINT patient_medical_records_record_type_check CHECK ((record_type = ANY (ARRAY['lab_result'::text, 'diagnosis'::text, 'procedure'::text, 'imaging'::text, 'other'::text])));
ALTER TABLE patient_medication_intake ADD CONSTRAINT patient_medication_intake_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE patient_medication_intake ADD CONSTRAINT patient_medication_intake_pkey PRIMARY KEY (id);
ALTER TABLE patient_medication_reminders ADD CONSTRAINT patient_medication_reminders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE patient_medication_reminders ADD CONSTRAINT patient_medication_reminders_pkey PRIMARY KEY (id);
ALTER TABLE patient_medications ADD CONSTRAINT patient_medications_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE patient_medications ADD CONSTRAINT patient_medications_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE patient_medications ADD CONSTRAINT patient_medications_pkey PRIMARY KEY (id);
ALTER TABLE patient_phone_history ADD CONSTRAINT patient_phone_history_change_reason_check CHECK (((change_reason IS NULL) OR (change_reason = ANY (ARRAY['self_service_change'::text, 'frontdesk_correction'::text, 'fallback_approved'::text, 'admin_change'::text]))));
ALTER TABLE patient_phone_history ADD CONSTRAINT patient_phone_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id);
ALTER TABLE patient_phone_history ADD CONSTRAINT patient_phone_history_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id) ON DELETE RESTRICT;
ALTER TABLE patient_phone_history ADD CONSTRAINT patient_phone_history_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE patient_phone_history ADD CONSTRAINT patient_phone_history_pkey PRIMARY KEY (id);
ALTER TABLE patient_phone_history ADD CONSTRAINT patient_phone_history_removed_reason_check CHECK ((removed_reason = ANY (ARRAY['user_changed'::text, 'number_recycled'::text, 'user_reported_lost'::text, 'admin_removed'::text, 'verification_failed'::text, 'entry_error'::text])));
ALTER TABLE patient_phone_verification_issues ADD CONSTRAINT patient_phone_verification_issues_issue_type_check CHECK ((issue_type = ANY (ARRAY['sms_delivery_failed'::text, 'otp_delivery_failed'::text, 'patient_reported_wrong'::text, 'staff_flagged'::text, 'duplicate_detected'::text])));
ALTER TABLE patient_phone_verification_issues ADD CONSTRAINT patient_phone_verification_issues_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE patient_phone_verification_issues ADD CONSTRAINT patient_phone_verification_issues_pkey PRIMARY KEY (id);
ALTER TABLE patient_phone_verification_issues ADD CONSTRAINT patient_phone_verification_issues_resolution_action_check CHECK ((resolution_action = ANY (ARRAY['phone_corrected'::text, 'verified_correct'::text, 'account_merged'::text, 'dismissed'::text])));
ALTER TABLE patient_phone_verification_issues ADD CONSTRAINT patient_phone_verification_issues_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id);
ALTER TABLE patient_privacy_codes ADD CONSTRAINT patient_privacy_codes_attempts_nonneg_chk CHECK ((attempts_count >= 0));
ALTER TABLE patient_privacy_codes ADD CONSTRAINT patient_privacy_codes_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE patient_privacy_codes ADD CONSTRAINT patient_privacy_codes_pkey PRIMARY KEY (id);
ALTER TABLE patient_privacy_codes ADD CONSTRAINT patient_privacy_codes_regen_nonneg_chk CHECK ((regenerated_count >= 0));
ALTER TABLE patient_privacy_codes ADD CONSTRAINT patient_privacy_codes_revoke_consistency_chk CHECK ((((revoked_at IS NULL) AND (revoked_reason IS NULL)) OR ((revoked_at IS NOT NULL) AND (revoked_reason IS NOT NULL))));
ALTER TABLE patient_privacy_codes ADD CONSTRAINT patient_privacy_codes_revoked_reason_check CHECK (((revoked_reason IS NULL) OR (revoked_reason = ANY (ARRAY['regenerated'::text, 'admin_reset'::text, 'phone_change'::text, 'merged'::text, 'deceased'::text]))));
ALTER TABLE patient_recovery_codes ADD CONSTRAINT patient_recovery_codes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE patient_recovery_codes ADD CONSTRAINT patient_recovery_codes_pkey PRIMARY KEY (id);
ALTER TABLE patient_visibility ADD CONSTRAINT patient_visibility_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE patient_visibility ADD CONSTRAINT patient_visibility_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id) ON DELETE RESTRICT;
ALTER TABLE patient_visibility ADD CONSTRAINT patient_visibility_granted_by_user_id_fkey FOREIGN KEY (granted_by_user_id) REFERENCES users(id);
ALTER TABLE patient_visibility ADD CONSTRAINT patient_visibility_grantee_type_check CHECK ((grantee_type = ANY (ARRAY['DOCTOR'::text, 'ROLE'::text])));
ALTER TABLE patient_visibility ADD CONSTRAINT patient_visibility_grantee_user_id_fkey FOREIGN KEY (grantee_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE patient_visibility ADD CONSTRAINT patient_visibility_patient_clinic_record_id_fkey FOREIGN KEY (patient_clinic_record_id) REFERENCES patient_clinic_records(id) ON DELETE RESTRICT;
ALTER TABLE patient_visibility ADD CONSTRAINT patient_visibility_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE patient_visibility ADD CONSTRAINT patient_visibility_pkey PRIMARY KEY (id);
ALTER TABLE patients ADD CONSTRAINT patients_account_status_check CHECK ((account_status = ANY (ARRAY['active'::text, 'suspended'::text, 'locked'::text, 'dormant'::text, 'merged'::text])));
ALTER TABLE patients ADD CONSTRAINT patients_age_check CHECK (((age >= 0) AND (age <= 120)));
ALTER TABLE patients ADD CONSTRAINT patients_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE patients ADD CONSTRAINT patients_created_by_doctor_id_fkey FOREIGN KEY (created_by_doctor_id) REFERENCES doctors(id);
ALTER TABLE patients ADD CONSTRAINT patients_duplicate_of_patient_id_fkey FOREIGN KEY (duplicate_of_patient_id) REFERENCES patients(id) ON DELETE SET NULL;
ALTER TABLE patients ADD CONSTRAINT patients_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id) ON DELETE RESTRICT;
ALTER TABLE patients ADD CONSTRAINT patients_guardian_id_fkey FOREIGN KEY (guardian_id) REFERENCES patients(id) ON DELETE SET NULL;
ALTER TABLE patients ADD CONSTRAINT patients_id_fkey FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE patients ADD CONSTRAINT patients_pkey PRIMARY KEY (id);
ALTER TABLE patients ADD CONSTRAINT patients_sex_check CHECK ((sex = ANY (ARRAY['Male'::text, 'Female'::text, 'Other'::text])));
ALTER TABLE patients ADD CONSTRAINT patients_unique_id_key UNIQUE (unique_id);
ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK ((amount >= (0)::numeric));
ALTER TABLE payments ADD CONSTRAINT payments_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE payments ADD CONSTRAINT payments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE payments ADD CONSTRAINT payments_clinical_note_id_fkey FOREIGN KEY (clinical_note_id) REFERENCES clinical_notes(id) ON DELETE SET NULL;
ALTER TABLE payments ADD CONSTRAINT payments_collected_by_fkey FOREIGN KEY (collected_by) REFERENCES users(id);
ALTER TABLE payments ADD CONSTRAINT payments_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;
ALTER TABLE payments ADD CONSTRAINT payments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE payments ADD CONSTRAINT payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'insurance'::text, 'other'::text])));
ALTER TABLE payments ADD CONSTRAINT payments_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'completed'::text, 'refunded'::text, 'cancelled'::text])));
ALTER TABLE payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
ALTER TABLE phone_change_requests ADD CONSTRAINT phone_change_requests_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE phone_change_requests ADD CONSTRAINT phone_change_requests_pkey PRIMARY KEY (id);
ALTER TABLE phone_change_requests ADD CONSTRAINT phone_change_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'old_verified'::text, 'new_verified'::text, 'completed'::text, 'expired'::text, 'cancelled'::text, 'rejected'::text])));
ALTER TABLE phone_change_requests ADD CONSTRAINT phone_change_requests_subject_xor CHECK (((patient_id IS NULL) <> (user_id IS NULL)));
ALTER TABLE phone_change_requests ADD CONSTRAINT phone_change_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE phone_change_requests ADD CONSTRAINT phone_change_requests_verification_method_check CHECK ((verification_method = ANY (ARRAY['sms_both'::text, 'sms_new_only'::text, 'email'::text, 'national_id'::text, 'recovery_code'::text, 'manual'::text])));
ALTER TABLE phone_corrections ADD CONSTRAINT phone_corrections_initiated_by_check CHECK ((initiated_by = ANY (ARRAY['patient'::text, 'staff'::text, 'system'::text])));
ALTER TABLE phone_corrections ADD CONSTRAINT phone_corrections_initiated_by_user_id_fkey FOREIGN KEY (initiated_by_user_id) REFERENCES users(id);
ALTER TABLE phone_corrections ADD CONSTRAINT phone_corrections_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE phone_corrections ADD CONSTRAINT phone_corrections_pkey PRIMARY KEY (id);
ALTER TABLE phone_corrections ADD CONSTRAINT phone_corrections_reason_check CHECK ((reason = ANY (ARRAY['entry_error'::text, 'patient_reported'::text, 'sms_failed'::text, 'duplicate_resolution'::text, 'other'::text])));
ALTER TABLE phone_corrections ADD CONSTRAINT phone_corrections_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'otp_sent'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE phone_corrections ADD CONSTRAINT phone_corrections_verification_method_check CHECK ((verification_method = ANY (ARRAY['otp_verified'::text, 'verbal_confirmation'::text, 'national_id_verified'::text, 'admin_override'::text])));
ALTER TABLE prescription_items ADD CONSTRAINT prescription_items_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE prescription_items ADD CONSTRAINT prescription_items_clinical_note_id_fkey FOREIGN KEY (clinical_note_id) REFERENCES clinical_notes(id) ON DELETE CASCADE;
ALTER TABLE prescription_items ADD CONSTRAINT prescription_items_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id);
ALTER TABLE prescription_items ADD CONSTRAINT prescription_items_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id) ON DELETE RESTRICT;
ALTER TABLE prescription_items ADD CONSTRAINT prescription_items_patient_clinic_record_id_fkey FOREIGN KEY (patient_clinic_record_id) REFERENCES patient_clinic_records(id) ON DELETE RESTRICT;
ALTER TABLE prescription_items ADD CONSTRAINT prescription_items_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE prescription_items ADD CONSTRAINT prescription_items_pkey PRIMARY KEY (id);
ALTER TABLE prescription_items ADD CONSTRAINT prescription_items_status_check CHECK ((status = ANY (ARRAY['prescribed'::text, 'dispensed'::text, 'cancelled'::text])));
ALTER TABLE prescription_templates ADD CONSTRAINT prescription_templates_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE prescription_templates ADD CONSTRAINT prescription_templates_pkey PRIMARY KEY (id);
ALTER TABLE privacy_code_attempts ADD CONSTRAINT privacy_code_attempts_attempted_by_clinic_id_fkey FOREIGN KEY (attempted_by_clinic_id) REFERENCES clinics(id) ON DELETE RESTRICT;
ALTER TABLE privacy_code_attempts ADD CONSTRAINT privacy_code_attempts_attempted_by_user_id_fkey FOREIGN KEY (attempted_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE privacy_code_attempts ADD CONSTRAINT privacy_code_attempts_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE privacy_code_attempts ADD CONSTRAINT privacy_code_attempts_pkey PRIMARY KEY (id);
ALTER TABLE privacy_code_attempts ADD CONSTRAINT privacy_code_attempts_privacy_code_id_fkey FOREIGN KEY (privacy_code_id) REFERENCES patient_privacy_codes(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE privacy_code_sms_tokens ADD CONSTRAINT privacy_code_sms_tokens_attempts_nonneg_chk CHECK ((attempts_count >= 0));
ALTER TABLE privacy_code_sms_tokens ADD CONSTRAINT privacy_code_sms_tokens_expires_after_created_chk CHECK ((expires_at > created_at));
ALTER TABLE privacy_code_sms_tokens ADD CONSTRAINT privacy_code_sms_tokens_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE privacy_code_sms_tokens ADD CONSTRAINT privacy_code_sms_tokens_pkey PRIMARY KEY (id);
ALTER TABLE privacy_code_sms_tokens ADD CONSTRAINT privacy_code_sms_tokens_requesting_clinic_id_fkey FOREIGN KEY (requesting_clinic_id) REFERENCES clinics(id) ON DELETE RESTRICT;
ALTER TABLE privacy_code_sms_tokens ADD CONSTRAINT privacy_code_sms_tokens_requesting_doctor_id_fkey FOREIGN KEY (requesting_doctor_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE privacy_code_sms_tokens ADD CONSTRAINT privacy_code_sms_tokens_used_by_user_id_fkey FOREIGN KEY (used_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE privacy_code_sms_tokens ADD CONSTRAINT privacy_code_sms_tokens_used_consistency_chk CHECK ((((used_at IS NULL) AND (used_by_user_id IS NULL)) OR (used_at IS NOT NULL)));
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE record_sharing_preferences ADD CONSTRAINT record_sharing_preferences_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE record_sharing_preferences ADD CONSTRAINT record_sharing_preferences_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;
ALTER TABLE record_sharing_preferences ADD CONSTRAINT record_sharing_preferences_patient_id_doctor_id_key UNIQUE (patient_id, doctor_id);
ALTER TABLE record_sharing_preferences ADD CONSTRAINT record_sharing_preferences_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE record_sharing_preferences ADD CONSTRAINT record_sharing_preferences_pkey PRIMARY KEY (id);
ALTER TABLE record_sharing_preferences ADD CONSTRAINT record_sharing_preferences_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'pending'::text])));
ALTER TABLE sms_reminders ADD CONSTRAINT sms_reminders_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
ALTER TABLE sms_reminders ADD CONSTRAINT sms_reminders_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE sms_reminders ADD CONSTRAINT sms_reminders_message_type_check CHECK ((message_type = ANY (ARRAY['appointment_reminder'::text, 'followup'::text, 'lab_ready'::text, 'custom'::text])));
ALTER TABLE sms_reminders ADD CONSTRAINT sms_reminders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE sms_reminders ADD CONSTRAINT sms_reminders_pkey PRIMARY KEY (id);
ALTER TABLE sms_reminders ADD CONSTRAINT sms_reminders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'failed'::text])));
ALTER TABLE templates ADD CONSTRAINT templates_pkey PRIMARY KEY (id);
ALTER TABLE users ADD CONSTRAINT users_duplicate_of_user_id_fkey FOREIGN KEY (duplicate_of_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE users ADD CONSTRAINT users_phone_key UNIQUE (phone);
ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['doctor'::text, 'patient'::text, 'frontdesk'::text])));
ALTER TABLE vital_signs ADD CONSTRAINT vital_signs_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE vital_signs ADD CONSTRAINT vital_signs_clinical_note_id_fkey FOREIGN KEY (clinical_note_id) REFERENCES clinical_notes(id) ON DELETE SET NULL;
ALTER TABLE vital_signs ADD CONSTRAINT vital_signs_diastolic_bp_check CHECK (((diastolic_bp > 0) AND (diastolic_bp < 200)));
ALTER TABLE vital_signs ADD CONSTRAINT vital_signs_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE;
ALTER TABLE vital_signs ADD CONSTRAINT vital_signs_global_patient_id_fkey FOREIGN KEY (global_patient_id) REFERENCES global_patients(id) ON DELETE RESTRICT;
ALTER TABLE vital_signs ADD CONSTRAINT vital_signs_heart_rate_check CHECK (((heart_rate > 0) AND (heart_rate < 300)));
ALTER TABLE vital_signs ADD CONSTRAINT vital_signs_height_check CHECK (((height > 0) AND (height < 300)));
ALTER TABLE vital_signs ADD CONSTRAINT vital_signs_oxygen_saturation_check CHECK (((oxygen_saturation > 0) AND (oxygen_saturation <= 100)));
ALTER TABLE vital_signs ADD CONSTRAINT vital_signs_patient_clinic_record_id_fkey FOREIGN KEY (patient_clinic_record_id) REFERENCES patient_clinic_records(id) ON DELETE RESTRICT;
ALTER TABLE vital_signs ADD CONSTRAINT vital_signs_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE vital_signs ADD CONSTRAINT vital_signs_pkey PRIMARY KEY (id);
ALTER TABLE vital_signs ADD CONSTRAINT vital_signs_respiratory_rate_check CHECK (((respiratory_rate > 0) AND (respiratory_rate < 100)));
ALTER TABLE vital_signs ADD CONSTRAINT vital_signs_systolic_bp_check CHECK (((systolic_bp > 0) AND (systolic_bp < 300)));
ALTER TABLE vital_signs ADD CONSTRAINT vital_signs_temperature_check CHECK (((temperature > (30)::numeric) AND (temperature < (45)::numeric)));
ALTER TABLE vital_signs ADD CONSTRAINT vital_signs_weight_check CHECK (((weight > (0)::numeric) AND (weight < (500)::numeric)));

-- ====== INDEXES (full indexdef) ==============================
CREATE UNIQUE INDEX _patient_dedup_plan_pkey ON public._patient_dedup_plan USING btree (normalized_phone);
CREATE UNIQUE INDEX _phone_normalize_quarantine_pkey ON public._phone_normalize_quarantine USING btree (table_name, row_id);
CREATE UNIQUE INDEX _user_dedup_plan_pkey ON public._user_dedup_plan USING btree (normalized_phone);
CREATE UNIQUE INDEX account_recovery_requests_pkey ON public.account_recovery_requests USING btree (id);
CREATE INDEX idx_recovery_requests_phone ON public.account_recovery_requests USING btree (claimed_phone);
CREATE INDEX idx_recovery_requests_status ON public.account_recovery_requests USING btree (status);
CREATE UNIQUE INDEX analytics_events_pkey ON public.analytics_events USING btree (id);
CREATE INDEX idx_analytics_events_created ON public.analytics_events USING btree (created_at DESC);
CREATE INDEX idx_analytics_events_name ON public.analytics_events USING btree (event_name);
CREATE INDEX idx_analytics_events_user ON public.analytics_events USING btree (user_id);
CREATE UNIQUE INDEX anonymous_visits_doctor_id_visit_date_daily_number_key ON public.anonymous_visits USING btree (doctor_id, visit_date, daily_number);
CREATE UNIQUE INDEX anonymous_visits_pkey ON public.anonymous_visits USING btree (id);
CREATE INDEX idx_anonymous_visits_date ON public.anonymous_visits USING btree (doctor_id, visit_date);
CREATE INDEX idx_anonymous_visits_doctor_date ON public.anonymous_visits USING btree (doctor_id, visit_date);
CREATE INDEX idx_anonymous_visits_status ON public.anonymous_visits USING btree (status);
CREATE UNIQUE INDEX api_rate_limits_pkey ON public.api_rate_limits USING btree (scope, key_hash, window_start);
CREATE INDEX idx_api_rate_limits_updated_at ON public.api_rate_limits USING btree (updated_at);
CREATE INDEX appointments_global_patient_clinic_idx ON public.appointments USING btree (global_patient_id, clinic_id);
CREATE INDEX appointments_global_patient_idx ON public.appointments USING btree (global_patient_id);
CREATE INDEX appointments_pcr_idx ON public.appointments USING btree (patient_clinic_record_id);
CREATE UNIQUE INDEX appointments_pkey ON public.appointments USING btree (id);
CREATE INDEX idx_appointments_checked_in ON public.appointments USING btree (checked_in_at);
CREATE INDEX idx_appointments_doctor ON public.appointments USING btree (doctor_id);
CREATE INDEX idx_appointments_patient ON public.appointments USING btree (patient_id);
CREATE INDEX idx_appointments_start_time ON public.appointments USING btree (start_time);
CREATE INDEX idx_appointments_status ON public.appointments USING btree (status);
CREATE INDEX idx_appointments_type ON public.appointments USING btree (appointment_type);
CREATE INDEX idx_appointments_window_lookup ON public.appointments USING btree (doctor_id, status, window_status, checked_in_at) WHERE ((status = 'scheduled'::text) AND (window_status = 'none'::text));
CREATE INDEX idx_appointments_window_status ON public.appointments USING btree (window_status) WHERE (window_status = 'open'::text);
CREATE UNIQUE INDEX assistant_doctor_assignments_clinic_id_assistant_user_id_do_key ON public.assistant_doctor_assignments USING btree (clinic_id, assistant_user_id, doctor_user_id);
CREATE UNIQUE INDEX assistant_doctor_assignments_pkey ON public.assistant_doctor_assignments USING btree (id);
CREATE INDEX idx_ada_assistant ON public.assistant_doctor_assignments USING btree (assistant_user_id);
CREATE INDEX idx_ada_clinic ON public.assistant_doctor_assignments USING btree (clinic_id);
CREATE INDEX idx_ada_doctor ON public.assistant_doctor_assignments USING btree (doctor_user_id);
CREATE UNIQUE INDEX audit_events_pkey ON public.audit_events USING btree (id);
CREATE INDEX idx_audit_events_actor ON public.audit_events USING btree (actor_user_id);
CREATE INDEX idx_audit_events_clinic ON public.audit_events USING btree (clinic_id, created_at DESC);
CREATE INDEX idx_audit_events_resolved_gpid ON public.audit_events USING btree (resolved_global_patient_id) WHERE (resolved_global_patient_id IS NOT NULL);
CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id);
CREATE INDEX idx_audit_log_action ON public.audit_log USING btree (action);
CREATE INDEX idx_audit_log_created ON public.audit_log USING btree (created_at DESC);
CREATE INDEX idx_audit_log_resource ON public.audit_log USING btree (resource_type, resource_id);
CREATE INDEX idx_audit_log_user ON public.audit_log USING btree (user_id);
CREATE UNIQUE INDEX check_in_queue_pkey ON public.check_in_queue USING btree (id);
CREATE INDEX idx_check_in_queue_clinic ON public.check_in_queue USING btree (clinic_id);
CREATE INDEX idx_ciq_apt_window_status ON public.check_in_queue USING btree (apt_window_status) WHERE (apt_window_status = 'open'::text);
CREATE INDEX idx_ciq_estimated_slot ON public.check_in_queue USING btree (doctor_id, estimated_slot_time) WHERE ((status = ANY (ARRAY['waiting'::text, 'in_progress'::text])) AND (estimated_slot_time IS NOT NULL));
CREATE INDEX idx_ciq_priority_queue ON public.check_in_queue USING btree (doctor_id, priority DESC, queue_number) WHERE (status = ANY (ARRAY['waiting'::text, 'in_progress'::text]));
CREATE INDEX idx_queue_created ON public.check_in_queue USING btree (created_at);
CREATE INDEX idx_queue_doctor ON public.check_in_queue USING btree (doctor_id);
CREATE INDEX idx_queue_status ON public.check_in_queue USING btree (status);
CREATE UNIQUE INDEX chronic_conditions_pkey ON public.chronic_conditions USING btree (id);
CREATE INDEX idx_chronic_conditions_clinic ON public.chronic_conditions USING btree (clinic_id);
CREATE INDEX idx_chronic_conditions_patient ON public.chronic_conditions USING btree (patient_id);
CREATE INDEX idx_chronic_conditions_status ON public.chronic_conditions USING btree (status);
CREATE UNIQUE INDEX clinic_memberships_clinic_id_user_id_key ON public.clinic_memberships USING btree (clinic_id, user_id);
CREATE UNIQUE INDEX clinic_memberships_pkey ON public.clinic_memberships USING btree (id);
CREATE INDEX idx_memberships_active ON public.clinic_memberships USING btree (clinic_id, status) WHERE (status = 'ACTIVE'::membership_status);
CREATE INDEX idx_memberships_clinic ON public.clinic_memberships USING btree (clinic_id);
CREATE INDEX idx_memberships_role ON public.clinic_memberships USING btree (role);
CREATE INDEX idx_memberships_user ON public.clinic_memberships USING btree (user_id);
CREATE UNIQUE INDEX clinical_notes_client_idempotency_key_uniq ON public.clinical_notes USING btree (client_idempotency_key) WHERE (client_idempotency_key IS NOT NULL);
CREATE INDEX clinical_notes_global_patient_clinic_idx ON public.clinical_notes USING btree (global_patient_id, clinic_id);
CREATE INDEX clinical_notes_global_patient_idx ON public.clinical_notes USING btree (global_patient_id);
CREATE INDEX clinical_notes_pcr_idx ON public.clinical_notes USING btree (patient_clinic_record_id);
CREATE UNIQUE INDEX clinical_notes_pkey ON public.clinical_notes USING btree (id);
CREATE UNIQUE INDEX clinical_notes_prescription_number_key ON public.clinical_notes USING btree (prescription_number);
CREATE INDEX idx_clinical_notes_clinic ON public.clinical_notes USING btree (clinic_id);
CREATE INDEX idx_clinical_notes_created ON public.clinical_notes USING btree (created_at DESC);
CREATE INDEX idx_clinical_notes_doctor ON public.clinical_notes USING btree (doctor_id);
CREATE INDEX idx_clinical_notes_doctor_clinic ON public.clinical_notes USING btree (doctor_id, clinic_id);
CREATE INDEX idx_clinical_notes_patient ON public.clinical_notes USING btree (patient_id);
CREATE INDEX idx_clinical_notes_prescription ON public.clinical_notes USING btree (prescription_number);
CREATE INDEX idx_clinical_notes_synced ON public.clinical_notes USING btree (synced_to_patient);
CREATE UNIQUE INDEX clinics_invite_code_key ON public.clinics USING btree (invite_code);
CREATE UNIQUE INDEX clinics_pkey ON public.clinics USING btree (id);
CREATE UNIQUE INDEX clinics_unique_id_key ON public.clinics USING btree (unique_id);
CREATE INDEX idx_clinics_invite_code ON public.clinics USING btree (invite_code);
CREATE INDEX idx_clinics_unique_id ON public.clinics USING btree (unique_id);
CREATE UNIQUE INDEX conversations_patient_id_doctor_id_key ON public.conversations USING btree (patient_id, doctor_id);
CREATE UNIQUE INDEX conversations_pkey ON public.conversations USING btree (id);
CREATE INDEX idx_conversations_clinic ON public.conversations USING btree (clinic_id);
CREATE INDEX idx_conversations_doctor ON public.conversations USING btree (doctor_id);
CREATE INDEX idx_conversations_patient ON public.conversations USING btree (patient_id);
CREATE INDEX idx_conversations_status ON public.conversations USING btree (status);
CREATE UNIQUE INDEX default_sharing_preferences_patient_id_key ON public.default_sharing_preferences USING btree (patient_id);
CREATE UNIQUE INDEX default_sharing_preferences_pkey ON public.default_sharing_preferences USING btree (id);
CREATE UNIQUE INDEX doctor_availability_doctor_id_day_of_week_start_time_key ON public.doctor_availability USING btree (doctor_id, day_of_week, start_time);
CREATE UNIQUE INDEX doctor_availability_pkey ON public.doctor_availability USING btree (id);
CREATE INDEX idx_doc_availability_clinic ON public.doctor_availability USING btree (clinic_id);
CREATE INDEX idx_doctor_availability_day ON public.doctor_availability USING btree (day_of_week);
CREATE INDEX idx_doctor_availability_doctor ON public.doctor_availability USING btree (doctor_id);
CREATE INDEX idx_doctor_availability_doctor_id ON public.doctor_availability USING btree (doctor_id);
CREATE UNIQUE INDEX doctor_patient_relationships_doctor_id_patient_id_key ON public.doctor_patient_relationships USING btree (doctor_id, patient_id);
CREATE INDEX doctor_patient_relationships_global_patient_idx ON public.doctor_patient_relationships USING btree (global_patient_id);
CREATE INDEX doctor_patient_relationships_pcr_idx ON public.doctor_patient_relationships USING btree (patient_clinic_record_id);
CREATE UNIQUE INDEX doctor_patient_relationships_pkey ON public.doctor_patient_relationships USING btree (id);
CREATE INDEX idx_doctor_patient_rel_doctor ON public.doctor_patient_relationships USING btree (doctor_id);
CREATE INDEX idx_doctor_patient_rel_patient ON public.doctor_patient_relationships USING btree (patient_id);
CREATE INDEX idx_doctor_patient_rel_status ON public.doctor_patient_relationships USING btree (status);
CREATE INDEX idx_dpr_access_level ON public.doctor_patient_relationships USING btree (access_level);
CREATE INDEX idx_dpr_clinic ON public.doctor_patient_relationships USING btree (clinic_id);
CREATE INDEX idx_dpr_clinic_doctor ON public.doctor_patient_relationships USING btree (clinic_id, doctor_id);
CREATE INDEX idx_dpr_consent_state ON public.doctor_patient_relationships USING btree (consent_state);
CREATE UNIQUE INDEX doctor_templates_doctor_id_template_id_key ON public.doctor_templates USING btree (doctor_id, template_id);
CREATE UNIQUE INDEX doctor_templates_pkey ON public.doctor_templates USING btree (id);
CREATE INDEX idx_doctor_templates_doctor ON public.doctor_templates USING btree (doctor_id);
CREATE INDEX idx_doctor_templates_last_used ON public.doctor_templates USING btree (last_used DESC);
CREATE UNIQUE INDEX doctors_pkey ON public.doctors USING btree (id);
CREATE UNIQUE INDEX doctors_unique_id_key ON public.doctors USING btree (unique_id);
CREATE INDEX idx_doctors_specialty ON public.doctors USING btree (specialty);
CREATE INDEX idx_doctors_unique_id ON public.doctors USING btree (unique_id);
CREATE UNIQUE INDEX front_desk_staff_pkey ON public.front_desk_staff USING btree (id);
CREATE UNIQUE INDEX front_desk_staff_unique_id_key ON public.front_desk_staff USING btree (unique_id);
CREATE INDEX idx_front_desk_unique_id ON public.front_desk_staff USING btree (unique_id);
CREATE INDEX global_patients_claimed_user_id_active_idx ON public.global_patients USING btree (claimed_user_id) WHERE (account_status = 'active'::patient_account_status);
CREATE UNIQUE INDEX global_patients_claimed_user_id_uniq ON public.global_patients USING btree (claimed_user_id) WHERE (claimed_user_id IS NOT NULL);
CREATE UNIQUE INDEX global_patients_normalized_phone_uniq ON public.global_patients USING btree (normalized_phone);
CREATE UNIQUE INDEX global_patients_pkey ON public.global_patients USING btree (id);
CREATE INDEX idx_imaging_orders_clinic ON public.imaging_orders USING btree (clinic_id);
CREATE INDEX idx_imaging_orders_doctor ON public.imaging_orders USING btree (doctor_id);
CREATE INDEX idx_imaging_orders_ordered_at ON public.imaging_orders USING btree (ordered_at DESC);
CREATE INDEX idx_imaging_orders_patient ON public.imaging_orders USING btree (patient_id);
CREATE INDEX idx_imaging_orders_status ON public.imaging_orders USING btree (status);
CREATE INDEX imaging_orders_global_patient_idx ON public.imaging_orders USING btree (global_patient_id);
CREATE INDEX imaging_orders_pcr_idx ON public.imaging_orders USING btree (patient_clinic_record_id);
CREATE UNIQUE INDEX imaging_orders_pkey ON public.imaging_orders USING btree (id);
CREATE INDEX idx_immunizations_administered_date ON public.immunizations USING btree (administered_date DESC);
CREATE INDEX idx_immunizations_clinic ON public.immunizations USING btree (clinic_id);
CREATE INDEX idx_immunizations_patient ON public.immunizations USING btree (patient_id);
CREATE UNIQUE INDEX immunizations_pkey ON public.immunizations USING btree (id);
CREATE INDEX invoice_requests_clinic_id_idx ON public.invoice_requests USING btree (clinic_id);
CREATE INDEX invoice_requests_payment_id_idx ON public.invoice_requests USING btree (payment_id);
CREATE UNIQUE INDEX invoice_requests_payment_id_key ON public.invoice_requests USING btree (payment_id);
CREATE UNIQUE INDEX invoice_requests_pkey ON public.invoice_requests USING btree (id);
CREATE INDEX idx_lab_orders_clinic ON public.lab_orders USING btree (clinic_id);
CREATE INDEX idx_lab_orders_ordered ON public.lab_orders USING btree (ordered_at);
CREATE INDEX idx_lab_orders_patient ON public.lab_orders USING btree (patient_id);
CREATE INDEX idx_lab_orders_status ON public.lab_orders USING btree (status);
CREATE INDEX lab_orders_global_patient_idx ON public.lab_orders USING btree (global_patient_id);
CREATE INDEX lab_orders_pcr_idx ON public.lab_orders USING btree (patient_clinic_record_id);
CREATE UNIQUE INDEX lab_orders_pkey ON public.lab_orders USING btree (id);
CREATE INDEX idx_lab_results_abnormal ON public.lab_results USING btree (is_abnormal);
CREATE INDEX idx_lab_results_clinic ON public.lab_results USING btree (clinic_id);
CREATE INDEX idx_lab_results_order ON public.lab_results USING btree (lab_order_id);
CREATE INDEX idx_lab_results_test ON public.lab_results USING btree (lab_test_id);
CREATE INDEX lab_results_global_patient_idx ON public.lab_results USING btree (global_patient_id);
CREATE INDEX lab_results_pcr_idx ON public.lab_results USING btree (patient_clinic_record_id);
CREATE UNIQUE INDEX lab_results_pkey ON public.lab_results USING btree (id);
CREATE INDEX idx_lre_order ON public.lab_results_entries USING btree (order_id);
CREATE UNIQUE INDEX lab_results_entries_pkey ON public.lab_results_entries USING btree (id);
CREATE INDEX idx_lro_clinic ON public.lab_results_orders USING btree (clinic_id);
CREATE INDEX idx_lro_patient ON public.lab_results_orders USING btree (patient_id);
CREATE UNIQUE INDEX lab_results_orders_pkey ON public.lab_results_orders USING btree (id);
CREATE INDEX idx_lab_tests_active ON public.lab_tests USING btree (is_active);
CREATE INDEX idx_lab_tests_category ON public.lab_tests USING btree (category);
CREATE UNIQUE INDEX lab_tests_pkey ON public.lab_tests USING btree (id);
CREATE UNIQUE INDEX lab_tests_test_code_key ON public.lab_tests USING btree (test_code);
CREATE INDEX idx_med_adherence_patient ON public.medication_adherence_log USING btree (patient_id);
CREATE INDEX idx_med_adherence_scheduled ON public.medication_adherence_log USING btree (scheduled_time DESC);
CREATE INDEX idx_med_adherence_status ON public.medication_adherence_log USING btree (status);
CREATE UNIQUE INDEX medication_adherence_log_pkey ON public.medication_adherence_log USING btree (id);
CREATE INDEX idx_med_reminders_clinic ON public.medication_reminders USING btree (clinic_id);
CREATE INDEX idx_medication_reminders_expires ON public.medication_reminders USING btree (expires_at);
CREATE INDEX idx_medication_reminders_patient ON public.medication_reminders USING btree (patient_id);
CREATE INDEX idx_medication_reminders_status ON public.medication_reminders USING btree (status);
CREATE UNIQUE INDEX medication_reminders_pkey ON public.medication_reminders USING btree (id);
CREATE INDEX idx_messages_clinic ON public.messages USING btree (clinic_id);
CREATE INDEX idx_messages_conversation ON public.messages USING btree (conversation_id, sent_at DESC);
CREATE INDEX idx_messages_sender ON public.messages USING btree (sender_id);
CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id);
CREATE INDEX idx_notifications_recipient ON public.notifications USING btree (recipient_id, read, created_at DESC);
CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);
CREATE INDEX idx_opt_out_statistics_doctor_date ON public.opt_out_statistics USING btree (doctor_id, opt_out_date DESC);
CREATE INDEX idx_opt_out_stats_date ON public.opt_out_statistics USING btree (opt_out_date);
CREATE INDEX idx_opt_out_stats_doctor ON public.opt_out_statistics USING btree (doctor_id, opt_out_date);
CREATE UNIQUE INDEX opt_out_statistics_pkey ON public.opt_out_statistics USING btree (id);
CREATE INDEX idx_otp_codes_patient_purpose ON public.otp_codes USING btree (patient_id, purpose, expires_at DESC);
CREATE INDEX idx_otp_codes_phone_purpose ON public.otp_codes USING btree (phone, purpose, expires_at DESC) WHERE (used = false);
CREATE INDEX idx_otp_expires ON public.otp_codes USING btree (expires_at) WHERE (used = false);
CREATE INDEX idx_otp_phone ON public.otp_codes USING btree (phone, purpose) WHERE (used = false);
CREATE UNIQUE INDEX otp_codes_pkey ON public.otp_codes USING btree (id);
CREATE INDEX idx_allergies_clinic ON public.patient_allergies USING btree (clinic_id);
CREATE INDEX idx_patient_allergies_patient ON public.patient_allergies USING btree (patient_id);
CREATE INDEX idx_patient_allergies_recorded_date ON public.patient_allergies USING btree (recorded_date DESC);
CREATE UNIQUE INDEX patient_allergies_pkey ON public.patient_allergies USING btree (id);
CREATE INDEX patient_clinic_records_clinic_recency_idx ON public.patient_clinic_records USING btree (clinic_id, last_seen_at DESC);
CREATE INDEX patient_clinic_records_global_patient_idx ON public.patient_clinic_records USING btree (global_patient_id);
CREATE UNIQUE INDEX patient_clinic_records_pcr_uniq ON public.patient_clinic_records USING btree (global_patient_id, clinic_id);
CREATE UNIQUE INDEX patient_clinic_records_pkey ON public.patient_clinic_records USING btree (id);
CREATE INDEX idx_patient_consent_clinic ON public.patient_consent_grants USING btree (clinic_id, doctor_id, consent_type);
CREATE INDEX idx_patient_consent_lookup ON public.patient_consent_grants USING btree (doctor_id, patient_id, consent_type, consent_state);
CREATE INDEX patient_consent_grants_global_patient_idx ON public.patient_consent_grants USING btree (global_patient_id);
CREATE INDEX patient_consent_grants_pcr_idx ON public.patient_consent_grants USING btree (patient_clinic_record_id);
CREATE UNIQUE INDEX patient_consent_grants_pkey ON public.patient_consent_grants USING btree (id);
CREATE INDEX idx_pds_expires ON public.patient_data_shares USING btree (expires_at) WHERE ((revoked_at IS NULL) AND (expires_at IS NOT NULL));
CREATE INDEX idx_pds_global_patient ON public.patient_data_shares USING btree (global_patient_id);
CREATE INDEX idx_pds_global_patient_active ON public.patient_data_shares USING btree (global_patient_id, granted_at DESC) WHERE (revoked_at IS NULL);
CREATE INDEX idx_pds_grantee_clinic_active ON public.patient_data_shares USING btree (grantee_clinic_id, expires_at) WHERE (revoked_at IS NULL);
CREATE INDEX idx_pds_grantor_clinic_active ON public.patient_data_shares USING btree (grantor_clinic_id, expires_at) WHERE (revoked_at IS NULL);
CREATE UNIQUE INDEX patient_data_shares_pkey ON public.patient_data_shares USING btree (id);
CREATE INDEX idx_patient_diary_clinic ON public.patient_diary USING btree (clinic_id);
CREATE INDEX idx_patient_diary_date ON public.patient_diary USING btree (entry_date DESC);
CREATE INDEX idx_patient_diary_patient ON public.patient_diary USING btree (patient_id);
CREATE INDEX idx_patient_diary_shared ON public.patient_diary USING btree (is_shared);
CREATE INDEX idx_patient_diary_type ON public.patient_diary USING btree (entry_type);
CREATE UNIQUE INDEX patient_diary_pkey ON public.patient_diary USING btree (id);
CREATE INDEX idx_health_metrics_clinic ON public.patient_health_metrics USING btree (clinic_id);
CREATE INDEX idx_health_metrics_patient ON public.patient_health_metrics USING btree (patient_id);
CREATE INDEX idx_health_metrics_recorded ON public.patient_health_metrics USING btree (recorded_at DESC);
CREATE INDEX idx_health_metrics_type ON public.patient_health_metrics USING btree (metric_type);
CREATE UNIQUE INDEX patient_health_metrics_pkey ON public.patient_health_metrics USING btree (id);
CREATE INDEX idx_medical_records_clinic ON public.patient_medical_records USING btree (clinic_id);
CREATE INDEX idx_patient_records_date ON public.patient_medical_records USING btree (date DESC);
CREATE INDEX idx_patient_records_patient ON public.patient_medical_records USING btree (patient_id);
CREATE INDEX idx_patient_records_type ON public.patient_medical_records USING btree (record_type);
CREATE UNIQUE INDEX patient_medical_records_pkey ON public.patient_medical_records USING btree (id);
CREATE INDEX idx_medication_intake_active ON public.patient_medication_intake USING btree (patient_id, still_taking) WHERE (still_taking = true);
CREATE INDEX idx_medication_intake_patient ON public.patient_medication_intake USING btree (patient_id);
CREATE UNIQUE INDEX patient_medication_intake_pkey ON public.patient_medication_intake USING btree (id);
CREATE INDEX idx_pmr_patient ON public.patient_medication_reminders USING btree (patient_id);
CREATE UNIQUE INDEX patient_medication_reminders_pkey ON public.patient_medication_reminders USING btree (id);
CREATE INDEX idx_patient_medications_active ON public.patient_medications USING btree (is_active);
CREATE INDEX idx_patient_medications_patient ON public.patient_medications USING btree (patient_id);
CREATE INDEX idx_patient_medications_start ON public.patient_medications USING btree (start_date DESC);
CREATE INDEX idx_patient_meds_clinic ON public.patient_medications USING btree (clinic_id);
CREATE UNIQUE INDEX patient_medications_pkey ON public.patient_medications USING btree (id);
CREATE INDEX idx_phone_history_current ON public.patient_phone_history USING btree (is_current) WHERE (is_current = true);
CREATE INDEX idx_phone_history_patient ON public.patient_phone_history USING btree (patient_id);
CREATE INDEX idx_phone_history_phone ON public.patient_phone_history USING btree (phone);
CREATE INDEX patient_phone_history_global_patient_idx ON public.patient_phone_history USING btree (global_patient_id);
CREATE UNIQUE INDEX patient_phone_history_pkey ON public.patient_phone_history USING btree (id);
CREATE INDEX idx_phone_issues_patient ON public.patient_phone_verification_issues USING btree (patient_id);
CREATE INDEX idx_phone_issues_unresolved ON public.patient_phone_verification_issues USING btree (resolved, created_at DESC) WHERE (resolved = false);
CREATE UNIQUE INDEX patient_phone_verification_issues_pkey ON public.patient_phone_verification_issues USING btree (id);
CREATE UNIQUE INDEX patient_privacy_codes_active_uniq ON public.patient_privacy_codes USING btree (global_patient_id) WHERE (revoked_at IS NULL);
CREATE INDEX patient_privacy_codes_locked_until_idx ON public.patient_privacy_codes USING btree (locked_until) WHERE ((locked_until IS NOT NULL) AND (revoked_at IS NULL));
CREATE UNIQUE INDEX patient_privacy_codes_pkey ON public.patient_privacy_codes USING btree (id);
CREATE INDEX idx_recovery_codes_patient ON public.patient_recovery_codes USING btree (patient_id);
CREATE INDEX idx_recovery_codes_unused ON public.patient_recovery_codes USING btree (patient_id, used) WHERE (used = false);
CREATE UNIQUE INDEX patient_recovery_codes_pkey ON public.patient_recovery_codes USING btree (id);
CREATE INDEX idx_pv_clinic_patient ON public.patient_visibility USING btree (clinic_id, patient_id);
CREATE INDEX idx_pv_grantee ON public.patient_visibility USING btree (grantee_user_id);
CREATE INDEX patient_visibility_global_patient_idx ON public.patient_visibility USING btree (global_patient_id);
CREATE INDEX patient_visibility_pcr_idx ON public.patient_visibility USING btree (patient_clinic_record_id);
CREATE UNIQUE INDEX patient_visibility_pkey ON public.patient_visibility USING btree (id);
CREATE UNIQUE INDEX uniq_patient_visibility_doctor_grant ON public.patient_visibility USING btree (clinic_id, patient_id, grantee_user_id) WHERE (grantee_type = 'DOCTOR'::text);
CREATE INDEX idx_patients_account_status ON public.patients USING btree (account_status);
CREATE INDEX idx_patients_clinic ON public.patients USING btree (clinic_id) WHERE (clinic_id IS NOT NULL);
CREATE INDEX idx_patients_email ON public.patients USING btree (email) WHERE (email IS NOT NULL);
CREATE INDEX idx_patients_global_patient_id ON public.patients USING btree (global_patient_id);
CREATE INDEX idx_patients_guardian_id ON public.patients USING btree (guardian_id) WHERE (guardian_id IS NOT NULL);
CREATE INDEX idx_patients_last_activity ON public.patients USING btree (last_activity_at);
CREATE INDEX idx_patients_national_id_hash ON public.patients USING btree (national_id_hash) WHERE (national_id_hash IS NOT NULL);
CREATE INDEX idx_patients_normalized_phone ON public.patients USING btree (normalized_phone) WHERE (normalized_phone IS NOT NULL);
CREATE INDEX idx_patients_parent_phone ON public.patients USING btree (parent_phone) WHERE (parent_phone IS NOT NULL);
CREATE INDEX idx_patients_phone ON public.patients USING btree (phone);
CREATE INDEX idx_patients_unique_id ON public.patients USING btree (unique_id);
CREATE UNIQUE INDEX patients_pkey ON public.patients USING btree (id);
CREATE UNIQUE INDEX patients_unique_id_key ON public.patients USING btree (unique_id);
CREATE INDEX idx_payments_appointment ON public.payments USING btree (appointment_id);
CREATE INDEX idx_payments_clinic ON public.payments USING btree (clinic_id);
CREATE INDEX idx_payments_created ON public.payments USING btree (created_at);
CREATE INDEX idx_payments_doctor ON public.payments USING btree (doctor_id);
CREATE INDEX idx_payments_patient ON public.payments USING btree (patient_id);
CREATE INDEX idx_payments_status ON public.payments USING btree (payment_status);
CREATE UNIQUE INDEX payments_client_idempotency_key_uniq ON public.payments USING btree (client_idempotency_key) WHERE (client_idempotency_key IS NOT NULL);
CREATE UNIQUE INDEX payments_pkey ON public.payments USING btree (id);
CREATE INDEX idx_phone_change_patient ON public.phone_change_requests USING btree (patient_id);
CREATE INDEX idx_phone_change_pending ON public.phone_change_requests USING btree (patient_id, status) WHERE (status = ANY (ARRAY['pending'::text, 'old_verified'::text]));
CREATE INDEX idx_phone_change_status ON public.phone_change_requests USING btree (status);
CREATE INDEX idx_phone_change_user ON public.phone_change_requests USING btree (user_id) WHERE (user_id IS NOT NULL);
CREATE UNIQUE INDEX phone_change_requests_pkey ON public.phone_change_requests USING btree (id);
CREATE INDEX idx_corrections_patient ON public.phone_corrections USING btree (patient_id);
CREATE INDEX idx_corrections_pending ON public.phone_corrections USING btree (status) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX phone_corrections_pkey ON public.phone_corrections USING btree (id);
CREATE INDEX idx_prescription_items_clinic ON public.prescription_items USING btree (clinic_id);
CREATE INDEX idx_prescription_items_doctor ON public.prescription_items USING btree (doctor_id);
CREATE INDEX idx_prescription_items_drug ON public.prescription_items USING btree (drug_name);
CREATE INDEX idx_prescription_items_note ON public.prescription_items USING btree (clinical_note_id);
CREATE INDEX idx_prescription_items_patient ON public.prescription_items USING btree (patient_id);
CREATE INDEX idx_prescription_items_prescribed_at ON public.prescription_items USING btree (prescribed_at DESC);
CREATE INDEX idx_prescription_items_status ON public.prescription_items USING btree (status);
CREATE INDEX prescription_items_global_patient_idx ON public.prescription_items USING btree (global_patient_id);
CREATE INDEX prescription_items_pcr_idx ON public.prescription_items USING btree (patient_clinic_record_id);
CREATE UNIQUE INDEX prescription_items_pkey ON public.prescription_items USING btree (id);
CREATE INDEX idx_prescription_templates_doctor_id ON public.prescription_templates USING btree (doctor_id);
CREATE INDEX idx_prescription_templates_doctor_usage ON public.prescription_templates USING btree (doctor_id, usage_count DESC);
CREATE INDEX idx_prescription_templates_usage_count ON public.prescription_templates USING btree (usage_count DESC);
CREATE UNIQUE INDEX prescription_templates_pkey ON public.prescription_templates USING btree (id);
CREATE INDEX privacy_code_attempts_clinic_time_idx ON public.privacy_code_attempts USING btree (attempted_by_clinic_id, created_at DESC);
CREATE INDEX privacy_code_attempts_clinic_window_idx ON public.privacy_code_attempts USING btree (global_patient_id, attempted_by_clinic_id, created_at DESC);
CREATE INDEX privacy_code_attempts_ip_time_idx ON public.privacy_code_attempts USING btree (ip_address, created_at DESC) WHERE (ip_address IS NOT NULL);
CREATE INDEX privacy_code_attempts_lifetime_idx ON public.privacy_code_attempts USING btree (global_patient_id, created_at DESC) WHERE (result = ANY (ARRAY['failure'::privacy_code_attempt_result, 'locked_out'::privacy_code_attempt_result]));
CREATE UNIQUE INDEX privacy_code_attempts_pkey ON public.privacy_code_attempts USING btree (id);
CREATE INDEX privacy_code_sms_tokens_patient_active_idx ON public.privacy_code_sms_tokens USING btree (global_patient_id, created_at DESC) WHERE (used_at IS NULL);
CREATE UNIQUE INDEX privacy_code_sms_tokens_pkey ON public.privacy_code_sms_tokens USING btree (id);
CREATE INDEX privacy_code_sms_tokens_verify_idx ON public.privacy_code_sms_tokens USING btree (global_patient_id, requesting_clinic_id, expires_at DESC) WHERE (used_at IS NULL);
CREATE INDEX idx_push_user ON public.push_subscriptions USING btree (user_id);
CREATE UNIQUE INDEX push_subscriptions_endpoint_key ON public.push_subscriptions USING btree (endpoint);
CREATE UNIQUE INDEX push_subscriptions_pkey ON public.push_subscriptions USING btree (id);
CREATE INDEX idx_sharing_doctor ON public.record_sharing_preferences USING btree (doctor_id);
CREATE INDEX idx_sharing_patient ON public.record_sharing_preferences USING btree (patient_id);
CREATE INDEX idx_sharing_prefs_clinic ON public.record_sharing_preferences USING btree (clinic_id);
CREATE INDEX idx_sharing_status ON public.record_sharing_preferences USING btree (status);
CREATE UNIQUE INDEX record_sharing_preferences_patient_id_doctor_id_key ON public.record_sharing_preferences USING btree (patient_id, doctor_id);
CREATE UNIQUE INDEX record_sharing_preferences_pkey ON public.record_sharing_preferences USING btree (id);
CREATE INDEX idx_sms_reminders_appointment ON public.sms_reminders USING btree (appointment_id);
CREATE INDEX idx_sms_reminders_patient ON public.sms_reminders USING btree (patient_id);
CREATE INDEX idx_sms_reminders_scheduled ON public.sms_reminders USING btree (scheduled_for);
CREATE INDEX idx_sms_reminders_status ON public.sms_reminders USING btree (status);
CREATE INDEX idx_sms_reminders_type ON public.sms_reminders USING btree (message_type);
CREATE UNIQUE INDEX sms_reminders_pkey ON public.sms_reminders USING btree (id);
CREATE INDEX idx_templates_default ON public.templates USING btree (is_default);
CREATE INDEX idx_templates_specialty ON public.templates USING btree (specialty);
CREATE UNIQUE INDEX templates_pkey ON public.templates USING btree (id);
CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);
CREATE INDEX users_is_canonical_idx ON public.users USING btree (is_canonical) WHERE (is_canonical = true);
CREATE UNIQUE INDEX users_phone_key ON public.users USING btree (phone);
CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);
CREATE INDEX idx_vital_signs_clinic ON public.vital_signs USING btree (clinic_id);
CREATE INDEX idx_vital_signs_clinical_note ON public.vital_signs USING btree (clinical_note_id);
CREATE INDEX idx_vital_signs_measured ON public.vital_signs USING btree (measured_at);
CREATE INDEX idx_vital_signs_patient ON public.vital_signs USING btree (patient_id);
CREATE INDEX vital_signs_global_patient_idx ON public.vital_signs USING btree (global_patient_id);
CREATE INDEX vital_signs_pcr_idx ON public.vital_signs USING btree (patient_clinic_record_id);
CREATE UNIQUE INDEX vital_signs_pkey ON public.vital_signs USING btree (id);

-- ====== TRIGGERS =============================================
CREATE TRIGGER tg_appointments_derive_global_refs BEFORE INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION tg_derive_patient_global_refs();
CREATE TRIGGER trigger_create_conversation AFTER UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION create_conversation_after_appointment();
CREATE TRIGGER trigger_create_sharing AFTER UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION create_sharing_preferences_after_appointment();
CREATE TRIGGER update_patient_activity_on_appointment AFTER INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION update_patient_activity();
CREATE TRIGGER update_chronic_conditions_updated_at BEFORE UPDATE ON public.chronic_conditions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tg_clinical_notes_derive_global_refs BEFORE INSERT OR UPDATE ON public.clinical_notes FOR EACH ROW EXECUTE FUNCTION tg_derive_patient_global_refs();
CREATE TRIGGER update_clinical_notes_modified_at BEFORE UPDATE ON public.clinical_notes FOR EACH ROW EXECUTE FUNCTION update_modified_at();
CREATE TRIGGER update_patient_activity_on_note AFTER INSERT ON public.clinical_notes FOR EACH ROW EXECUTE FUNCTION update_patient_activity();
CREATE TRIGGER tg_doctor_patient_relationships_derive_global_refs BEFORE INSERT OR UPDATE ON public.doctor_patient_relationships FOR EACH ROW EXECUTE FUNCTION tg_derive_patient_global_refs();
CREATE TRIGGER trg_global_patients_touch_updated BEFORE UPDATE ON public.global_patients FOR EACH ROW EXECUTE FUNCTION touch_global_patients_updated_at();
CREATE TRIGGER tg_imaging_orders_derive_global_refs BEFORE INSERT OR UPDATE ON public.imaging_orders FOR EACH ROW EXECUTE FUNCTION tg_derive_patient_global_refs();
CREATE TRIGGER update_imaging_orders_updated_at BEFORE UPDATE ON public.imaging_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_immunizations_updated_at BEFORE UPDATE ON public.immunizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tg_lab_orders_derive_global_refs BEFORE INSERT OR UPDATE ON public.lab_orders FOR EACH ROW EXECUTE FUNCTION tg_derive_patient_global_refs();
CREATE TRIGGER tg_lab_results_derive_global_refs BEFORE INSERT OR UPDATE ON public.lab_results FOR EACH ROW EXECUTE FUNCTION tg_derive_lab_results_global_refs();
CREATE TRIGGER update_patient_allergies_updated_at BEFORE UPDATE ON public.patient_allergies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER patient_clinic_records_touch_updated_at_trg BEFORE UPDATE ON public.patient_clinic_records FOR EACH ROW EXECUTE FUNCTION patient_clinic_records_touch_updated_at();
CREATE TRIGGER tg_audit_pcr_insert_trg AFTER INSERT ON public.patient_clinic_records FOR EACH ROW EXECUTE FUNCTION tg_audit_pcr_insert();
CREATE TRIGGER tg_patient_consent_grants_derive_global_refs BEFORE INSERT OR UPDATE ON public.patient_consent_grants FOR EACH ROW EXECUTE FUNCTION tg_derive_patient_global_refs();
CREATE TRIGGER trg_patient_consent_grants_updated_at BEFORE UPDATE ON public.patient_consent_grants FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER tg_patient_data_shares_touch_updated_at BEFORE UPDATE ON public.patient_data_shares FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER update_patient_diary_updated_at BEFORE UPDATE ON public.patient_diary FOR EACH ROW EXECUTE FUNCTION update_patient_diary_timestamp();
CREATE TRIGGER update_patient_records_updated_at BEFORE UPDATE ON public.patient_medical_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER medication_intake_updated BEFORE UPDATE ON public.patient_medication_intake FOR EACH ROW EXECUTE FUNCTION update_medication_intake_timestamp();
CREATE TRIGGER update_patient_medications_updated_at BEFORE UPDATE ON public.patient_medications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tg_patient_phone_history_derive_global_refs BEFORE INSERT OR UPDATE ON public.patient_phone_history FOR EACH ROW EXECUTE FUNCTION tg_derive_patient_phone_history_global_refs();
CREATE TRIGGER tg_patient_visibility_derive_global_refs BEFORE INSERT OR UPDATE ON public.patient_visibility FOR EACH ROW EXECUTE FUNCTION tg_derive_patient_global_refs();
CREATE TRIGGER tg_prescription_items_derive_global_refs BEFORE INSERT OR UPDATE ON public.prescription_items FOR EACH ROW EXECUTE FUNCTION tg_derive_patient_global_refs();
CREATE TRIGGER tg_vital_signs_derive_global_refs BEFORE INSERT OR UPDATE ON public.vital_signs FOR EACH ROW EXECUTE FUNCTION tg_derive_patient_global_refs();
CREATE TRIGGER trigger_calculate_bmi BEFORE INSERT OR UPDATE ON public.vital_signs FOR EACH ROW EXECUTE FUNCTION update_bmi();

-- ====== RLS STATE ============================================
-- public._patient_dedup_plan: RLS DISABLED
-- public._phone_normalize_quarantine: RLS DISABLED
-- public._rls_test_results: RLS DISABLED
-- public._user_dedup_plan: RLS DISABLED
ALTER TABLE public.account_recovery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymous_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_doctor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_in_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chronic_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.default_sharing_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_patient_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.front_desk_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imaging_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.immunizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_results_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_results_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_adherence_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opt_out_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_clinic_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_consent_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_data_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_diary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_medication_intake ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_medication_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_phone_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_phone_verification_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_privacy_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_code_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_code_sms_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_sharing_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vital_signs ENABLE ROW LEVEL SECURITY;

-- ====== POLICIES =============================================
CREATE POLICY "Users can create analytics events" ON public.analytics_events
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Doctors can manage anonymous visits" ON public.anonymous_visits
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((doctor_id = auth.uid()))
  WITH CHECK ((doctor_id = auth.uid()));
CREATE POLICY "Doctors see own anonymous visits" ON public.anonymous_visits
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((doctor_id = auth.uid()));
CREATE POLICY "Clinic-scoped appointment access" ON public.appointments
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((doctor_id = auth.uid()) OR (patient_id = auth.uid()) OR ((clinic_id IS NOT NULL) AND is_clinic_member(clinic_id, auth.uid()))));
CREATE POLICY "Doctors and front desk can create appointments" ON public.appointments
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK (((doctor_id = auth.uid()) OR (doctor_id IN ( SELECT cm_doc.user_id
   FROM clinic_memberships cm_doc
  WHERE ((cm_doc.role = ANY (ARRAY['OWNER'::clinic_role, 'DOCTOR'::clinic_role])) AND (cm_doc.status = 'ACTIVE'::membership_status) AND (cm_doc.clinic_id IN ( SELECT clinic_memberships.clinic_id
           FROM clinic_memberships
          WHERE ((clinic_memberships.user_id = auth.uid()) AND (clinic_memberships.role = ANY (ARRAY['FRONT_DESK'::clinic_role, 'ASSISTANT'::clinic_role])) AND (clinic_memberships.status = 'ACTIVE'::membership_status)))))))));
CREATE POLICY "Doctors can read their appointments" ON public.appointments
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((doctor_id IN ( SELECT doctors.id
   FROM doctors
  WHERE (doctors.id = auth.uid()))));
CREATE POLICY "Front desk can manage appointments" ON public.appointments
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'frontdesk'::text)))));
CREATE POLICY "Front desk can read clinic appointments" ON public.appointments
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((doctor_id IN ( SELECT cm_doc.user_id
   FROM clinic_memberships cm_doc
  WHERE ((cm_doc.role = ANY (ARRAY['OWNER'::clinic_role, 'DOCTOR'::clinic_role])) AND (cm_doc.status = 'ACTIVE'::membership_status) AND (cm_doc.clinic_id IN ( SELECT clinic_memberships.clinic_id
           FROM clinic_memberships
          WHERE ((clinic_memberships.user_id = auth.uid()) AND (clinic_memberships.status = 'ACTIVE'::membership_status))))))));
CREATE POLICY "Front desk can view all appointments" ON public.appointments
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'frontdesk'::text)))));
CREATE POLICY "appointments_select_v2" ON public.appointments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_clinic_member(clinic_id, auth.uid()));
CREATE POLICY "clinic_members_view_assignments" ON public.assistant_doctor_assignments
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((clinic_id IN ( SELECT clinic_memberships.clinic_id
   FROM clinic_memberships
  WHERE ((clinic_memberships.user_id = auth.uid()) AND (clinic_memberships.status = 'ACTIVE'::membership_status)))));
CREATE POLICY "audit_events_clinic_member_select_v2" ON public.audit_events
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((clinic_id IS NOT NULL) AND is_clinic_member(clinic_id, auth.uid())));
CREATE POLICY "audit_events_patient_self_select_v2" ON public.audit_events
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((resolved_global_patient_id IS NOT NULL) AND can_patient_access_global_patient(resolved_global_patient_id, auth.uid())));
CREATE POLICY "owners_view_audit_events" ON public.audit_events
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((clinic_id IN ( SELECT clinic_memberships.clinic_id
   FROM clinic_memberships
  WHERE ((clinic_memberships.user_id = auth.uid()) AND (clinic_memberships.role = 'OWNER'::clinic_role) AND (clinic_memberships.status = 'ACTIVE'::membership_status)))));
CREATE POLICY "service_role_audit_log" ON public.audit_log
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Clinic-scoped queue access" ON public.check_in_queue
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((doctor_id = auth.uid()) OR (patient_id = auth.uid()) OR ((clinic_id IS NOT NULL) AND is_clinic_member(clinic_id, auth.uid()))));
CREATE POLICY "Doctors can read their own queue" ON public.check_in_queue
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((doctor_id = auth.uid()));
CREATE POLICY "Doctors can update their own queue" ON public.check_in_queue
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((doctor_id = auth.uid()))
  WITH CHECK ((doctor_id = auth.uid()));
CREATE POLICY "Front desk can manage queue" ON public.check_in_queue
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'frontdesk'::text)))));
CREATE POLICY "Frontdesk can manage queue for their clinic" ON public.check_in_queue
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((doctor_id IN ( SELECT cm_d.user_id
   FROM (clinic_memberships cm_fd
     JOIN clinic_memberships cm_d ON ((cm_d.clinic_id = cm_fd.clinic_id)))
  WHERE ((cm_fd.user_id = auth.uid()) AND (cm_fd.status = 'ACTIVE'::membership_status)))))
  WITH CHECK ((doctor_id IN ( SELECT cm_d.user_id
   FROM (clinic_memberships cm_fd
     JOIN clinic_memberships cm_d ON ((cm_d.clinic_id = cm_fd.clinic_id)))
  WHERE ((cm_fd.user_id = auth.uid()) AND (cm_fd.status = 'ACTIVE'::membership_status)))));
CREATE POLICY "check_in_queue_select_v2" ON public.check_in_queue
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_clinic_member(clinic_id, auth.uid()));
CREATE POLICY "Doctors view chronic conditions for treated patients" ON public.chronic_conditions
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM clinical_notes cn
  WHERE ((cn.patient_id = chronic_conditions.patient_id) AND (cn.doctor_id = auth.uid())))));
CREATE POLICY "Patients manage own chronic conditions" ON public.chronic_conditions
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((patient_id = auth.uid()))
  WITH CHECK ((patient_id = auth.uid()));
CREATE POLICY "Members can view clinic memberships" ON public.clinic_memberships
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (is_clinic_member(clinic_id, auth.uid()));
CREATE POLICY "Owners can manage memberships" ON public.clinic_memberships
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK (((EXISTS ( SELECT 1
   FROM clinic_memberships cm
  WHERE ((cm.clinic_id = clinic_memberships.clinic_id) AND (cm.user_id = auth.uid()) AND (cm.role = 'OWNER'::clinic_role) AND (cm.status = 'ACTIVE'::membership_status)))) OR (NOT (EXISTS ( SELECT 1
   FROM clinic_memberships cm
  WHERE (cm.clinic_id = clinic_memberships.clinic_id))))));
CREATE POLICY "Owners can update memberships" ON public.clinic_memberships
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM clinic_memberships cm
  WHERE ((cm.clinic_id = clinic_memberships.clinic_id) AND (cm.user_id = auth.uid()) AND (cm.role = 'OWNER'::clinic_role) AND (cm.status = 'ACTIVE'::membership_status)))));
CREATE POLICY "Clinic-scoped note access" ON public.clinical_notes
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((doctor_id = auth.uid()) OR ((patient_id = auth.uid()) AND (COALESCE(synced_to_patient, false) = true)) OR ((clinic_id IS NOT NULL) AND can_access_patient(clinic_id, patient_id, auth.uid(), 'READ'::text))));
CREATE POLICY "Doctors can create clinical notes" ON public.clinical_notes
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((doctor_id = auth.uid()));
CREATE POLICY "Doctors can insert notes in their clinic" ON public.clinical_notes
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK (((doctor_id = auth.uid()) AND ((clinic_id IS NULL) OR is_clinic_member(clinic_id, auth.uid()))));
CREATE POLICY "Doctors can read own clinical notes" ON public.clinical_notes
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((doctor_id = auth.uid()));
CREATE POLICY "Doctors can update own clinical notes" ON public.clinical_notes
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((doctor_id = auth.uid()));
CREATE POLICY "Patients can read their clinical notes" ON public.clinical_notes
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((patient_id = auth.uid()) AND (synced_to_patient = true)));
CREATE POLICY "clinical_notes_select_v2" ON public.clinical_notes
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (can_view_patient_data_at_clinic(global_patient_id, clinic_id, auth.uid()));
CREATE POLICY "clinical_notes_update_clinic_member_only" ON public.clinical_notes
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (((clinic_id IS NULL) OR is_clinic_member(clinic_id, auth.uid())))
  WITH CHECK (((clinic_id IS NULL) OR is_clinic_member(clinic_id, auth.uid())));
CREATE POLICY "clinical_notes_write_clinic_member_only" ON public.clinical_notes
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK (((clinic_id IS NULL) OR is_clinic_member(clinic_id, auth.uid())));
CREATE POLICY "clinics_select_v2" ON public.clinics
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_clinic_member(id, auth.uid()));
CREATE POLICY "Clinic-scoped conversation access" ON public.conversations
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((patient_id = auth.uid()) OR (doctor_id = auth.uid()) OR ((clinic_id IS NOT NULL) AND is_clinic_member(clinic_id, auth.uid()))));
CREATE POLICY "Create conversation after appointment" ON public.conversations
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK (((created_from_appointment_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM appointments a
  WHERE ((a.id = conversations.created_from_appointment_id) AND ((a.patient_id = auth.uid()) OR (a.doctor_id = auth.uid())))))));
CREATE POLICY "Create conversation after visit" ON public.conversations
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK (((created_from_appointment_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM appointments v
  WHERE ((v.id = conversations.created_from_appointment_id) AND (v.status = 'completed'::text) AND (v.doctor_id = conversations.doctor_id) AND (v.patient_id = conversations.patient_id)))) AND can_open_messaging_conversation(doctor_id, patient_id) AND ((doctor_id = auth.uid()) OR (patient_id = auth.uid()))));
CREATE POLICY "Doctors can update conversation status" ON public.conversations
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((doctor_id = auth.uid()));
CREATE POLICY "Doctors can view their conversations" ON public.conversations
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((doctor_id = auth.uid()));
CREATE POLICY "Participants can update conversation counters" ON public.conversations
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((doctor_id = auth.uid()) OR (patient_id = auth.uid())))
  WITH CHECK (((doctor_id = auth.uid()) OR (patient_id = auth.uid())));
CREATE POLICY "Patients can view their conversations" ON public.conversations
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "Patients can manage default sharing" ON public.default_sharing_preferences
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "Doctors can delete their own availability" ON public.doctor_availability
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((doctor_id = auth.uid()));
CREATE POLICY "Doctors can insert their availability" ON public.doctor_availability
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((doctor_id = auth.uid()));
CREATE POLICY "Doctors can insert their own availability" ON public.doctor_availability
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK ((doctor_id = auth.uid()));
CREATE POLICY "Doctors can update their availability" ON public.doctor_availability
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((doctor_id = auth.uid()));
CREATE POLICY "Doctors can update their own availability" ON public.doctor_availability
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((doctor_id = auth.uid()))
  WITH CHECK ((doctor_id = auth.uid()));
CREATE POLICY "Doctors can view their availability" ON public.doctor_availability
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((doctor_id = auth.uid()));
CREATE POLICY "Doctors can view their own availability" ON public.doctor_availability
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((doctor_id = auth.uid()));
CREATE POLICY "Frontdesk can view doctor availability" ON public.doctor_availability
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'frontdesk'::text)))));
CREATE POLICY "Patients can view doctor availability" ON public.doctor_availability
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'patient'::text)))));
CREATE POLICY "doctor_availability_select_v2" ON public.doctor_availability
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_clinic_member(clinic_id, auth.uid()));
CREATE POLICY "Doctors can create relationships" ON public.doctor_patient_relationships
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((doctor_id = auth.uid()));
CREATE POLICY "Doctors can update their relationships" ON public.doctor_patient_relationships
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((doctor_id = auth.uid()));
CREATE POLICY "Doctors can view their patient relationships" ON public.doctor_patient_relationships
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((doctor_id = auth.uid()));
CREATE POLICY "Patients can view their doctor relationships" ON public.doctor_patient_relationships
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "Doctors can manage their saved templates" ON public.doctor_templates
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((doctor_id = auth.uid()));
CREATE POLICY "Doctors can insert own record during registration" ON public.doctors
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((auth.uid() = id));
CREATE POLICY "Doctors can read own profile" ON public.doctors
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((auth.uid() = id));
CREATE POLICY "Doctors can update own profile" ON public.doctors
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((auth.uid() = id));
CREATE POLICY "doctors_select_authenticated_v2" ON public.doctors
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);
CREATE POLICY "Clinic members can view frontdesk staff in same clinic" ON public.front_desk_staff
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((id IN ( SELECT cm_target.user_id
   FROM clinic_memberships cm_target
  WHERE ((cm_target.role = ANY (ARRAY['FRONT_DESK'::clinic_role, 'ASSISTANT'::clinic_role])) AND (cm_target.status = 'ACTIVE'::membership_status) AND (cm_target.clinic_id IN ( SELECT clinic_memberships.clinic_id
           FROM clinic_memberships
          WHERE ((clinic_memberships.user_id = auth.uid()) AND (clinic_memberships.status = 'ACTIVE'::membership_status))))))));
CREATE POLICY "Front desk staff can read own record" ON public.front_desk_staff
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((id = auth.uid()));
CREATE POLICY "Front desk staff can update own record" ON public.front_desk_staff
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((id = auth.uid()))
  WITH CHECK ((id = auth.uid()));
CREATE POLICY "global_patients_no_delete_v2" ON public.global_patients
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (false);
CREATE POLICY "global_patients_no_direct_insert_v2" ON public.global_patients
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK (false);
CREATE POLICY "global_patients_select_v2" ON public.global_patients
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((claimed_user_id = auth.uid()) OR user_has_clinic_path_to_gp(id, auth.uid())));
CREATE POLICY "global_patients_self_update_v2" ON public.global_patients
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((claimed_user_id = auth.uid()))
  WITH CHECK ((claimed_user_id = auth.uid()));
CREATE POLICY "Clinic-scoped imaging order access" ON public.imaging_orders
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((doctor_id = auth.uid()) OR (patient_id = auth.uid()) OR ((clinic_id IS NOT NULL) AND can_access_patient(clinic_id, patient_id, auth.uid(), 'READ'::text))));
CREATE POLICY "Doctors manage their imaging orders" ON public.imaging_orders
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((doctor_id = auth.uid()))
  WITH CHECK ((doctor_id = auth.uid()));
CREATE POLICY "Patients view own imaging orders" ON public.imaging_orders
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "imaging_orders_select_v2" ON public.imaging_orders
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (can_view_patient_data_at_clinic(global_patient_id, clinic_id, auth.uid()));
CREATE POLICY "imaging_orders_update_clinic_member_only" ON public.imaging_orders
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (is_clinic_member(clinic_id, auth.uid()))
  WITH CHECK (is_clinic_member(clinic_id, auth.uid()));
CREATE POLICY "imaging_orders_write_clinic_member_only" ON public.imaging_orders
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK (is_clinic_member(clinic_id, auth.uid()));
CREATE POLICY "Doctors view immunizations for treated patients" ON public.immunizations
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM clinical_notes cn
  WHERE ((cn.patient_id = immunizations.patient_id) AND (cn.doctor_id = auth.uid())))));
CREATE POLICY "Patients manage own immunizations" ON public.immunizations
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((patient_id = auth.uid()))
  WITH CHECK ((patient_id = auth.uid()));
CREATE POLICY "doctor_invoice_requests_read" ON public.invoice_requests
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((clinic_id IN ( SELECT clinic_memberships.clinic_id
   FROM clinic_memberships
  WHERE ((clinic_memberships.user_id = auth.uid()) AND (clinic_memberships.role = ANY (ARRAY['OWNER'::clinic_role, 'DOCTOR'::clinic_role])) AND (clinic_memberships.status = 'ACTIVE'::membership_status)))));
CREATE POLICY "frontdesk_invoice_requests" ON public.invoice_requests
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((clinic_id IN ( SELECT clinic_memberships.clinic_id
   FROM clinic_memberships
  WHERE ((clinic_memberships.user_id = auth.uid()) AND (clinic_memberships.role = ANY (ARRAY['FRONT_DESK'::clinic_role, 'ASSISTANT'::clinic_role])) AND (clinic_memberships.status = 'ACTIVE'::membership_status)))));
CREATE POLICY "Clinic-scoped lab order access" ON public.lab_orders
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((doctor_id = auth.uid()) OR (patient_id = auth.uid()) OR ((clinic_id IS NOT NULL) AND can_access_patient(clinic_id, patient_id, auth.uid(), 'READ'::text))));
CREATE POLICY "Doctors can create lab orders" ON public.lab_orders
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((doctor_id = auth.uid()));
CREATE POLICY "Doctors can view their lab orders" ON public.lab_orders
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((doctor_id = auth.uid()));
CREATE POLICY "Patients can view own lab orders" ON public.lab_orders
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "lab_orders_select_v2" ON public.lab_orders
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (can_view_patient_data_at_clinic(global_patient_id, clinic_id, auth.uid()));
CREATE POLICY "lab_orders_update_clinic_member_only" ON public.lab_orders
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (is_clinic_member(clinic_id, auth.uid()))
  WITH CHECK (is_clinic_member(clinic_id, auth.uid()));
CREATE POLICY "lab_orders_write_clinic_member_only" ON public.lab_orders
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK (is_clinic_member(clinic_id, auth.uid()));
CREATE POLICY "Clinic-scoped lab results access" ON public.lab_results
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM lab_orders lo
  WHERE ((lo.id = lab_results.lab_order_id) AND ((lo.doctor_id = auth.uid()) OR (lo.patient_id = auth.uid()) OR ((lo.clinic_id IS NOT NULL) AND can_access_patient(lo.clinic_id, lo.patient_id, auth.uid(), 'READ'::text)))))));
CREATE POLICY "View lab results" ON public.lab_results
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((lab_order_id IN ( SELECT lab_orders.id
   FROM lab_orders
  WHERE ((lab_orders.doctor_id = auth.uid()) OR (lab_orders.patient_id = auth.uid())))));
CREATE POLICY "lab_results_select_v2" ON public.lab_results
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (can_view_patient_data_at_clinic(global_patient_id, clinic_id, auth.uid()));
CREATE POLICY "lab_results_update_clinic_member_only" ON public.lab_results
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (is_clinic_member(clinic_id, auth.uid()))
  WITH CHECK (is_clinic_member(clinic_id, auth.uid()));
CREATE POLICY "lab_results_write_clinic_member_only" ON public.lab_results
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK (is_clinic_member(clinic_id, auth.uid()));
CREATE POLICY "Anyone can view lab test catalog" ON public.lab_tests
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (true);
CREATE POLICY "Doctors can view patient adherence" ON public.medication_adherence_log
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM doctor_patient_relationships dpr
  WHERE ((dpr.patient_id = medication_adherence_log.patient_id) AND (dpr.doctor_id = auth.uid()) AND (dpr.status = 'active'::text)))));
CREATE POLICY "Patients can manage their adherence log" ON public.medication_adherence_log
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "Patients can read their medication reminders" ON public.medication_reminders
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "Patients can update their medication reminders" ON public.medication_reminders
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "Clinic-scoped message access" ON public.messages
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.patient_id = auth.uid()) OR (c.doctor_id = auth.uid()) OR ((c.clinic_id IS NOT NULL) AND is_clinic_member(c.clinic_id, auth.uid())))))));
CREATE POLICY "Participants can send messages" ON public.messages
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND (c.status = 'active'::text) AND ((c.patient_id = auth.uid()) OR (c.doctor_id = auth.uid()))))));
CREATE POLICY "Participants can update message read state" ON public.messages
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.patient_id = auth.uid()) OR (c.doctor_id = auth.uid()))))));
CREATE POLICY "Participants can view messages" ON public.messages
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.patient_id = auth.uid()) OR (c.doctor_id = auth.uid()))))));
CREATE POLICY "users_view_own_notifications" ON public.notifications
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((recipient_id = auth.uid()));
CREATE POLICY "Doctors can manage opt out stats" ON public.opt_out_statistics
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((doctor_id = auth.uid()))
  WITH CHECK ((doctor_id = auth.uid()));
CREATE POLICY "Doctors see own opt out stats" ON public.opt_out_statistics
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((doctor_id = auth.uid()));
CREATE POLICY "Users can view own phone-based otp" ON public.otp_codes
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((phone IN ( SELECT u.phone
   FROM users u
  WHERE (u.id = auth.uid()))));
CREATE POLICY "Doctors view allergies for treated patients" ON public.patient_allergies
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM clinical_notes cn
  WHERE ((cn.patient_id = patient_allergies.patient_id) AND (cn.doctor_id = auth.uid())))));
CREATE POLICY "Patients manage own allergies" ON public.patient_allergies
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((patient_id = auth.uid()))
  WITH CHECK ((patient_id = auth.uid()));
CREATE POLICY "patient_clinic_records_insert_v2" ON public.patient_clinic_records
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK (is_clinic_member(clinic_id, auth.uid()));
CREATE POLICY "patient_clinic_records_no_delete_v2" ON public.patient_clinic_records
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (false);
CREATE POLICY "patient_clinic_records_select_v2" ON public.patient_clinic_records
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_clinic_member(clinic_id, auth.uid()) OR can_patient_access_global_patient(global_patient_id, auth.uid())));
CREATE POLICY "patient_clinic_records_update_v2" ON public.patient_clinic_records
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_clinic_member(clinic_id, auth.uid()))
  WITH CHECK (is_clinic_member(clinic_id, auth.uid()));
CREATE POLICY "Participants can read consent grants" ON public.patient_consent_grants
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((doctor_id = auth.uid()) OR (patient_id = auth.uid())));
CREATE POLICY "Patients can manage consent grants" ON public.patient_consent_grants
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((patient_id = auth.uid()));
CREATE POLICY "Patients can revoke consent grants" ON public.patient_consent_grants
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((patient_id = auth.uid()))
  WITH CHECK ((patient_id = auth.uid()));
CREATE POLICY "patient_data_shares_no_delete_v2" ON public.patient_data_shares
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (false);
CREATE POLICY "patient_data_shares_no_direct_insert_v2" ON public.patient_data_shares
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK (false);
CREATE POLICY "patient_data_shares_revoke_update_v2" ON public.patient_data_shares
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((is_clinic_member(grantor_clinic_id, auth.uid()) OR can_patient_access_global_patient(global_patient_id, auth.uid())))
  WITH CHECK ((revoked_at IS NOT NULL));
CREATE POLICY "patient_data_shares_select_v2" ON public.patient_data_shares
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_clinic_member(grantor_clinic_id, auth.uid()) OR is_clinic_member(grantee_clinic_id, auth.uid()) OR can_patient_access_global_patient(global_patient_id, auth.uid())));
CREATE POLICY "Doctors can view shared patient diary" ON public.patient_diary
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((is_shared = true) AND (EXISTS ( SELECT 1
   FROM doctor_patient_relationships dpr
  WHERE ((dpr.patient_id = patient_diary.patient_id) AND (dpr.doctor_id = auth.uid()) AND (dpr.status = 'active'::text))))));
CREATE POLICY "Patients can manage their diary" ON public.patient_diary
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "Doctors can view patient health metrics" ON public.patient_health_metrics
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM doctor_patient_relationships dpr
  WHERE ((dpr.patient_id = patient_health_metrics.patient_id) AND (dpr.doctor_id = auth.uid()) AND (dpr.status = 'active'::text)))));
CREATE POLICY "Patients can manage their health metrics" ON public.patient_health_metrics
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "Doctors can view patient medical records" ON public.patient_medical_records
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((patient_id IN ( SELECT clinical_notes.patient_id
   FROM clinical_notes
  WHERE (clinical_notes.doctor_id = auth.uid()))));
CREATE POLICY "Patients can create own medical records" ON public.patient_medical_records
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((patient_id = auth.uid()));
CREATE POLICY "Patients can delete own medical records" ON public.patient_medical_records
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "Patients can update own medical records" ON public.patient_medical_records
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((patient_id = auth.uid()))
  WITH CHECK ((patient_id = auth.uid()));
CREATE POLICY "Patients can view own medical records" ON public.patient_medical_records
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "doctors_read_intake" ON public.patient_medication_intake
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM doctors
  WHERE (doctors.id = auth.uid()))));
CREATE POLICY "patients_own_intake_delete" ON public.patient_medication_intake
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((auth.uid() = patient_id));
CREATE POLICY "patients_own_intake_insert" ON public.patient_medication_intake
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((auth.uid() = patient_id));
CREATE POLICY "patients_own_intake_select" ON public.patient_medication_intake
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((auth.uid() = patient_id));
CREATE POLICY "patients_own_intake_update" ON public.patient_medication_intake
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((auth.uid() = patient_id));
CREATE POLICY "Doctors can view patient medications" ON public.patient_medications
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((patient_id IN ( SELECT clinical_notes.patient_id
   FROM clinical_notes
  WHERE (clinical_notes.doctor_id = auth.uid()))));
CREATE POLICY "Patients can create own medications" ON public.patient_medications
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((patient_id = auth.uid()));
CREATE POLICY "Patients can delete own medications" ON public.patient_medications
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "Patients can update own medications" ON public.patient_medications
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((patient_id = auth.uid()))
  WITH CHECK ((patient_id = auth.uid()));
CREATE POLICY "Patients can view own medications" ON public.patient_medications
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "Doctors can view patient phone history" ON public.patient_phone_history
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'doctor'::text)))));
CREATE POLICY "Patients can view own phone history" ON public.patient_phone_history
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "Patients can view phone history" ON public.patient_phone_history
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "Staff can view phone verification issues" ON public.patient_phone_verification_issues
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['doctor'::text, 'frontdesk'::text]))))));
CREATE POLICY "patient_privacy_codes_no_delete" ON public.patient_privacy_codes
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (false);
CREATE POLICY "patient_privacy_codes_no_insert" ON public.patient_privacy_codes
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK (false);
CREATE POLICY "patient_privacy_codes_no_select" ON public.patient_privacy_codes
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (false);
CREATE POLICY "patient_privacy_codes_no_update" ON public.patient_privacy_codes
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (false);
CREATE POLICY "Patients can view own recovery codes" ON public.patient_recovery_codes
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "clinic_doctors_view_visibility" ON public.patient_visibility
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((clinic_id IN ( SELECT clinic_memberships.clinic_id
   FROM clinic_memberships
  WHERE ((clinic_memberships.user_id = auth.uid()) AND (clinic_memberships.status = 'ACTIVE'::membership_status)))));
CREATE POLICY "Clinic members can view patients" ON public.patients
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((id = auth.uid()) OR ((clinic_id IS NOT NULL) AND can_access_patient(clinic_id, id, auth.uid(), 'READ'::text)) OR (EXISTS ( SELECT 1
   FROM doctor_patient_relationships dpr
  WHERE ((dpr.patient_id = patients.id) AND (dpr.doctor_id = auth.uid()) AND (dpr.status = 'active'::text))))));
CREATE POLICY "Doctors can create walk-in patients" ON public.patients
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'doctor'::text)))));
CREATE POLICY "Doctors can update walk-in patients they created" ON public.patients
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((created_by_doctor_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'doctor'::text))))));
CREATE POLICY "Front desk can create patients" ON public.patients
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'frontdesk'::text)))));
CREATE POLICY "Front desk can view all patients" ON public.patients
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'frontdesk'::text)))));
CREATE POLICY "Patients can insert own record during registration" ON public.patients
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((auth.uid() = id));
CREATE POLICY "Patients can read own profile" ON public.patients
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((auth.uid() = id));
CREATE POLICY "Patients can update own profile" ON public.patients
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((auth.uid() = id));
CREATE POLICY "patients_insert_v2" ON public.patients
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK (is_clinic_member(clinic_id, auth.uid()));
CREATE POLICY "patients_select_v2" ON public.patients
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((is_clinic_member(clinic_id, auth.uid()) OR user_has_clinic_path_to_gp(global_patient_id, auth.uid()) OR can_patient_access_global_patient(global_patient_id, auth.uid())));
CREATE POLICY "patients_update_v2" ON public.patients
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (is_clinic_member(clinic_id, auth.uid()))
  WITH CHECK (is_clinic_member(clinic_id, auth.uid()));
CREATE POLICY "Clinic-scoped payment access" ON public.payments
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((doctor_id = auth.uid()) OR (patient_id = auth.uid()) OR ((clinic_id IS NOT NULL) AND is_clinic_member(clinic_id, auth.uid()))));
CREATE POLICY "Doctors can view their own payments" ON public.payments
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((doctor_id = auth.uid()));
CREATE POLICY "Front desk can create payments" ON public.payments
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'frontdesk'::text)))));
CREATE POLICY "Front desk can view payments" ON public.payments
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'frontdesk'::text)))));
CREATE POLICY "Frontdesk can manage payments for their clinic" ON public.payments
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((doctor_id IN ( SELECT cm_d.user_id
   FROM (clinic_memberships cm_fd
     JOIN clinic_memberships cm_d ON ((cm_d.clinic_id = cm_fd.clinic_id)))
  WHERE ((cm_fd.user_id = auth.uid()) AND (cm_fd.status = 'ACTIVE'::membership_status)))))
  WITH CHECK ((doctor_id IN ( SELECT cm_d.user_id
   FROM (clinic_memberships cm_fd
     JOIN clinic_memberships cm_d ON ((cm_d.clinic_id = cm_fd.clinic_id)))
  WHERE ((cm_fd.user_id = auth.uid()) AND (cm_fd.status = 'ACTIVE'::membership_status)))));
CREATE POLICY "payments_select_v2" ON public.payments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (is_clinic_member(clinic_id, auth.uid()));
CREATE POLICY "Owners can view staff phone change requests in their clinic" ON public.phone_change_requests
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((user_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (clinic_memberships m_owner
     JOIN clinic_memberships m_subject ON ((m_subject.clinic_id = m_owner.clinic_id)))
  WHERE ((m_owner.user_id = auth.uid()) AND (m_owner.role = 'OWNER'::clinic_role) AND (m_owner.status = 'ACTIVE'::membership_status) AND (m_subject.user_id = phone_change_requests.user_id) AND (m_subject.status = 'ACTIVE'::membership_status))))));
CREATE POLICY "Patients can create phone change requests" ON public.phone_change_requests
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((patient_id = auth.uid()));
CREATE POLICY "Patients can view own phone change requests" ON public.phone_change_requests
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "Staff can create own phone change requests" ON public.phone_change_requests
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Staff can view own phone change requests" ON public.phone_change_requests
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((user_id = auth.uid()));
CREATE POLICY "Staff can manage phone corrections" ON public.phone_corrections
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['doctor'::text, 'frontdesk'::text]))))));
CREATE POLICY "doctors_insert_prescriptions" ON public.prescription_items
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((doctor_id = auth.uid()));
CREATE POLICY "doctors_own_prescriptions" ON public.prescription_items
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((doctor_id = auth.uid()));
CREATE POLICY "patients_own_prescriptions" ON public.prescription_items
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "prescription_items_select_v2" ON public.prescription_items
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (can_view_patient_data_at_clinic(global_patient_id, clinic_id, auth.uid()));
CREATE POLICY "prescription_items_update_clinic_member_only" ON public.prescription_items
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (((clinic_id IS NULL) OR is_clinic_member(clinic_id, auth.uid())))
  WITH CHECK (((clinic_id IS NULL) OR is_clinic_member(clinic_id, auth.uid())));
CREATE POLICY "prescription_items_write_clinic_member_only" ON public.prescription_items
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK (((clinic_id IS NULL) OR is_clinic_member(clinic_id, auth.uid())));
CREATE POLICY "service_role_full_access_prescriptions" ON public.prescription_items
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Doctors can manage their own templates" ON public.prescription_templates
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((auth.uid() = doctor_id))
  WITH CHECK ((auth.uid() = doctor_id));
CREATE POLICY "privacy_code_attempts_no_delete" ON public.privacy_code_attempts
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (false);
CREATE POLICY "privacy_code_attempts_no_insert" ON public.privacy_code_attempts
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK (false);
CREATE POLICY "privacy_code_attempts_no_update" ON public.privacy_code_attempts
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (false);
CREATE POLICY "privacy_code_attempts_select_v2" ON public.privacy_code_attempts
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((can_patient_access_global_patient(global_patient_id, auth.uid()) OR (EXISTS ( SELECT 1
   FROM clinic_memberships cm
  WHERE ((cm.clinic_id = privacy_code_attempts.attempted_by_clinic_id) AND (cm.user_id = auth.uid()) AND (cm.role = 'OWNER'::clinic_role) AND (cm.status = 'ACTIVE'::membership_status))))));
CREATE POLICY "privacy_code_sms_tokens_no_delete" ON public.privacy_code_sms_tokens
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (false);
CREATE POLICY "privacy_code_sms_tokens_no_insert" ON public.privacy_code_sms_tokens
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK (false);
CREATE POLICY "privacy_code_sms_tokens_no_select" ON public.privacy_code_sms_tokens
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (false);
CREATE POLICY "privacy_code_sms_tokens_no_update" ON public.privacy_code_sms_tokens
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (false);
CREATE POLICY "users_manage_own_push" ON public.push_subscriptions
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((user_id = auth.uid()));
CREATE POLICY "Doctors can view sharing preferences" ON public.record_sharing_preferences
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((doctor_id = auth.uid()) AND (status = 'active'::text)));
CREATE POLICY "Patients can manage sharing" ON public.record_sharing_preferences
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "service_role_sms" ON public.sms_reminders
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Everyone can read templates" ON public.templates
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);
CREATE POLICY "Users can insert own record during registration" ON public.users
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY "Users can read own profile" ON public.users
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((auth.uid() = id));
CREATE POLICY "Users can update own profile" ON public.users
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((auth.uid() = id));
CREATE POLICY "users_select_clinic_colleagues_v2" ON public.users
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (clinic_memberships cm_self
     JOIN clinic_memberships cm_target ON (((cm_target.clinic_id = cm_self.clinic_id) AND (cm_target.user_id = users.id) AND (cm_target.status = 'ACTIVE'::membership_status))))
  WHERE ((cm_self.user_id = auth.uid()) AND (cm_self.status = 'ACTIVE'::membership_status))))));
CREATE POLICY "Clinic-scoped vital signs access" ON public.vital_signs
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((doctor_id = auth.uid()) OR (patient_id = auth.uid()) OR ((clinic_id IS NOT NULL) AND can_access_patient(clinic_id, patient_id, auth.uid(), 'READ'::text))));
CREATE POLICY "Doctors can create vitals" ON public.vital_signs
  AS PERMISSIVE
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((doctor_id = auth.uid()));
CREATE POLICY "Doctors can view their patients vitals" ON public.vital_signs
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((doctor_id = auth.uid()) OR (patient_id IN ( SELECT appointments.patient_id
   FROM appointments
  WHERE (appointments.doctor_id = auth.uid())))));
CREATE POLICY "Patients can view own vitals" ON public.vital_signs
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((patient_id = auth.uid()));
CREATE POLICY "vital_signs_select_v2" ON public.vital_signs
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (can_view_patient_data_at_clinic(global_patient_id, clinic_id, auth.uid()));
CREATE POLICY "vital_signs_update_clinic_member_only" ON public.vital_signs
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (is_clinic_member(clinic_id, auth.uid()))
  WITH CHECK (is_clinic_member(clinic_id, auth.uid()));
CREATE POLICY "vital_signs_write_clinic_member_only" ON public.vital_signs
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK (is_clinic_member(clinic_id, auth.uid()));

-- ====== FUNCTIONS (full bodies) ==============================

-- function: _generate_privacy_code_plaintext (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=439)
CREATE OR REPLACE FUNCTION public._generate_privacy_code_plaintext()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  v_alphabet CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_alphabet_len CONSTANT INT := 32;
  v_plaintext TEXT := '';
  v_random_bytes BYTEA;
  v_byte INT;
  v_i INT;
BEGIN
  v_random_bytes := gen_random_bytes(6);
  FOR v_i IN 1..6 LOOP
    v_byte := get_byte(v_random_bytes, v_i - 1);
    v_plaintext := v_plaintext ||
      substr(v_alphabet, 1 + (v_byte % v_alphabet_len), 1);
  END LOOP;
  RETURN v_plaintext;
END;

$function$;

-- function: _generate_sms_code_plaintext (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=214)
CREATE OR REPLACE FUNCTION public._generate_sms_code_plaintext()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  v_random_bytes BYTEA;
  v_n INT;
BEGIN
  v_random_bytes := gen_random_bytes(2);
  v_n := (get_byte(v_random_bytes, 0) * 256 + get_byte(v_random_bytes, 1)) % 10000;
  RETURN lpad(v_n::TEXT, 4, '0');
END;

$function$;

-- function: auto_renew_shares_on_visit (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=1591)
CREATE OR REPLACE FUNCTION public.auto_renew_shares_on_visit(p_global_patient_id uuid, p_grantee_clinic_id uuid, p_encounter_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  v_share         patient_data_shares%ROWTYPE;
  v_new_expires   TIMESTAMPTZ;
  v_renewed_ids   UUID[] := ARRAY[]::UUID[];
  v_renewed_count INTEGER := 0;
  v_audit_id      UUID;
BEGIN
  IF p_global_patient_id IS NULL OR p_grantee_clinic_id IS NULL THEN
    RAISE EXCEPTION 'auto_renew_shares_on_visit: required arg is NULL';
  END IF;

  FOR v_share IN
    SELECT *
      FROM public.patient_data_shares
     WHERE global_patient_id = p_global_patient_id
       AND grantee_clinic_id = p_grantee_clinic_id
       AND revoked_at IS NULL
       AND expires_at IS NOT NULL
     FOR UPDATE
  LOOP
    v_new_expires := NOW() + INTERVAL '90 days';

    IF v_share.expires_at >= v_new_expires THEN
      CONTINUE;
    END IF;

    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
    ) VALUES (
      v_share.grantee_clinic_id, NULL, 'system',
      'SHARE_AUTO_RENEWED', 'patient_data_share', v_share.id,
      jsonb_build_object(
        'share_id', v_share.id,
        'previous_expires_at', v_share.expires_at,
        'new_expires_at', v_new_expires,
        'encounter_id', p_encounter_id,
        'trigger', 'visit'
      )
    )
    RETURNING id INTO v_audit_id;

    UPDATE public.patient_data_shares
       SET expires_at = v_new_expires
     WHERE id = v_share.id;

    v_renewed_ids := array_append(v_renewed_ids, v_share.id);
    v_renewed_count := v_renewed_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'renewed_count', v_renewed_count,
    'share_ids',     to_jsonb(v_renewed_ids)
  );
END;

$function$;

-- function: calculate_bmi (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=195)
CREATE OR REPLACE FUNCTION public.calculate_bmi(weight_kg numeric, height_cm integer)
RETURNS numeric
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

BEGIN
  IF height_cm IS NULL OR height_cm = 0 OR weight_kg IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN ROUND((weight_kg / ((height_cm / 100.0) * (height_cm / 100.0)))::NUMERIC, 1);
END;

$function$;

-- function: can_access_patient (lang=plpgsql, SECURITY DEFINER, STABLE, body_length=1775)
CREATE OR REPLACE FUNCTION public.can_access_patient(p_clinic_id uuid, p_patient_id uuid, p_user_id uuid, p_permission text DEFAULT 'READ'::text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $function$

DECLARE
  v_membership RECORD;
  v_has_visibility BOOLEAN;
BEGIN
  SELECT role INTO v_membership
  FROM public.clinic_memberships
  WHERE clinic_id = p_clinic_id
    AND user_id = p_user_id
    AND status = 'ACTIVE';

  IF v_membership IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_membership.role = 'OWNER' THEN
    RETURN TRUE;
  END IF;

  IF v_membership.role = 'DOCTOR' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.patient_visibility pv
      WHERE pv.clinic_id = p_clinic_id
        AND pv.patient_id = p_patient_id
        AND (
          (pv.grantee_type = 'DOCTOR' AND pv.grantee_user_id = p_user_id)
          OR pv.mode = 'CLINIC_WIDE'
        )
        AND (pv.expires_at IS NULL OR pv.expires_at > NOW())
    ) INTO v_has_visibility;

    RETURN v_has_visibility;
  END IF;

  IF v_membership.role IN ('ASSISTANT', 'FRONT_DESK') THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.assistant_doctor_assignments ada
      WHERE ada.clinic_id = p_clinic_id
        AND ada.assistant_user_id = p_user_id
        AND ada.status = 'ACTIVE'
        AND (
          EXISTS (
            SELECT 1 FROM public.patient_visibility pv
            WHERE pv.clinic_id = p_clinic_id
              AND pv.patient_id = p_patient_id
              AND (
                (pv.grantee_type = 'DOCTOR' AND pv.grantee_user_id = ada.doctor_user_id)
                OR pv.mode = 'CLINIC_WIDE'
              )
              AND (pv.expires_at IS NULL OR pv.expires_at > NOW())
          )
        )
        AND (
          p_permission = 'READ'
          OR (p_permission = 'WRITE' AND ada.scope IN ('PATIENT_DEMOGRAPHICS', 'FULL_DOCTOR_SUPPORT'))
          OR (p_permission = 'SHARE' AND ada.scope = 'FULL_DOCTOR_SUPPORT')
        )
    );
  END IF;

  RETURN FALSE;
END;

$function$;

-- function: can_clinic_access_global_patient (lang=sql, SECURITY DEFINER, STABLE, body_length=349)
CREATE OR REPLACE FUNCTION public.can_clinic_access_global_patient(p_global_patient_id uuid, p_clinic_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $function$

  SELECT EXISTS (SELECT 1 FROM public.patient_clinic_records WHERE global_patient_id = p_global_patient_id AND clinic_id = p_clinic_id)
      OR EXISTS (SELECT 1 FROM public.patient_data_shares WHERE global_patient_id = p_global_patient_id AND grantee_clinic_id = p_clinic_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()));

$function$;

-- function: can_doctor_view_record (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=292)
CREATE OR REPLACE FUNCTION public.can_doctor_view_record(p_doctor_id uuid, p_patient_id uuid, p_record_type text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  v_can_view BOOLEAN;
BEGIN
  EXECUTE format(
    'SELECT share_%s FROM record_sharing_preferences WHERE doctor_id = $1 AND patient_id = $2 AND status = ''active''',
    p_record_type
  ) INTO v_can_view USING p_doctor_id, p_patient_id;
  
  RETURN COALESCE(v_can_view, false);
END;

$function$;

-- function: can_open_messaging_conversation (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=411)
CREATE OR REPLACE FUNCTION public.can_open_messaging_conversation(p_doctor_id uuid, p_patient_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

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

$function$;

-- function: can_patient_access_global_patient (lang=sql, SECURITY DEFINER, STABLE, body_length=120)
CREATE OR REPLACE FUNCTION public.can_patient_access_global_patient(p_global_patient_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $function$

  SELECT EXISTS (SELECT 1 FROM public.global_patients WHERE id = p_global_patient_id AND claimed_user_id = p_user_id);

$function$;

-- function: can_view_patient_data_at_clinic (lang=sql, SECURITY DEFINER, STABLE, body_length=803)
CREATE OR REPLACE FUNCTION public.can_view_patient_data_at_clinic(p_global_patient_id uuid, p_data_clinic_id uuid, p_viewer_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $function$

  SELECT
    EXISTS (
      SELECT 1 FROM public.global_patients gp
      WHERE gp.id = p_global_patient_id
        AND gp.claimed_user_id = p_viewer_user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.clinic_memberships cm
      WHERE cm.clinic_id = p_data_clinic_id
        AND cm.user_id = p_viewer_user_id
        AND cm.status = 'ACTIVE'
    )
    OR EXISTS (
      SELECT 1
      FROM public.patient_data_shares pds
      JOIN public.clinic_memberships cm
        ON cm.clinic_id = pds.grantee_clinic_id
       AND cm.user_id = p_viewer_user_id
       AND cm.status = 'ACTIVE'
      WHERE pds.global_patient_id = p_global_patient_id
        AND pds.grantor_clinic_id = p_data_clinic_id
        AND pds.revoked_at IS NULL
        AND (pds.expires_at IS NULL OR pds.expires_at > NOW())
    );

$function$;

-- function: change_phone_commit (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=1895)
CREATE OR REPLACE FUNCTION public.change_phone_commit(p_request_id uuid, p_subject_id uuid, p_subject_kind text, p_old_phone text, p_new_phone text, p_actor_id uuid, p_change_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  touched_clinics jsonb := '[]'::jsonb;
  rec record;
BEGIN
  IF p_subject_kind NOT IN ('staff_user', 'patient') THEN
    RAISE EXCEPTION 'change_phone_commit: invalid subject_kind %', p_subject_kind
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_change_reason NOT IN ('self_service_change','frontdesk_correction','fallback_approved','admin_change') THEN
    RAISE EXCEPTION 'change_phone_commit: invalid change_reason %', p_change_reason
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM 1
  FROM public.phone_change_requests
  WHERE id = p_request_id
  FOR UPDATE;

  UPDATE public.users
     SET phone             = p_new_phone,
         phone_verified    = true,
         phone_verified_at = now()
   WHERE id = p_subject_id;

  IF p_subject_kind = 'patient' THEN
  FOR rec IN
    UPDATE public.patients
       SET phone             = p_new_phone,
           phone_verified    = true,
           phone_verified_at = now()
     WHERE phone = p_old_phone
    RETURNING id, clinic_id
  LOOP
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

  UPDATE public.phone_change_requests
     SET status       = 'completed',
         completed_at = now()
   WHERE id = p_request_id;

  RETURN jsonb_build_object('touchedClinics', touched_clinics);
END;

$function$;

-- function: change_phone_rollback (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=1139)
CREATE OR REPLACE FUNCTION public.change_phone_rollback(p_request_id uuid, p_subject_id uuid, p_subject_kind text, p_old_phone text, p_new_phone text, p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  rec record;
BEGIN
  IF p_subject_kind NOT IN ('staff_user', 'patient') THEN
    RAISE EXCEPTION 'change_phone_rollback: invalid subject_kind %', p_subject_kind
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.users
     SET phone = p_old_phone
   WHERE id = p_subject_id;

  IF p_subject_kind = 'patient' THEN
  FOR rec IN
    UPDATE public.patients
       SET phone = p_old_phone
     WHERE phone = p_new_phone
    RETURNING id
  LOOP
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

  UPDATE public.phone_change_requests
     SET status       = 'cancelled',
         completed_at = now()
   WHERE id = p_request_id;
END;

$function$;

-- function: check_phone_uniform (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=561)
CREATE OR REPLACE FUNCTION public.check_phone_uniform(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  v_start TIMESTAMPTZ := clock_timestamp();
  v_min_ms CONSTANT INT := 50;
  v_normalized TEXT;
  v_dummy BOOLEAN;
BEGIN
  v_normalized := public.normalize_phone_e164(p_phone);
  IF v_normalized IS NULL THEN
    SELECT FALSE INTO v_dummy;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.global_patients WHERE normalized_phone = v_normalized) INTO v_dummy;
  END IF;
  PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
  RETURN jsonb_build_object('exists', FALSE, 'requires_code', TRUE);
END;

$function$;

-- function: cleanup_expired_verification_data (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=503)
CREATE OR REPLACE FUNCTION public.cleanup_expired_verification_data()
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

BEGIN
  -- Delete expired OTPs older than 24 hours
  DELETE FROM public.otp_codes
  WHERE expires_at < NOW() - INTERVAL '24 hours';
  
  -- Mark expired phone change requests
  UPDATE public.phone_change_requests
  SET status = 'expired'
  WHERE expires_at < NOW()
    AND status IN ('pending', 'old_verified');
  
  -- Mark expired recovery requests
  UPDATE public.account_recovery_requests
  SET status = 'expired'
  WHERE expires_at < NOW()
    AND status IN ('pending', 'verification_sent');
END;

$function$;

-- function: consume_rate_limit (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=1310)
CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_scope text, p_key_hash text, p_window_ms integer, p_max_requests integer)
RETURNS TABLE(allowed boolean, retry_after_seconds integer, remaining integer, current_count integer)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_epoch_ms BIGINT;
  v_window_start_ms BIGINT;
  v_window_start TIMESTAMPTZ;
  v_next_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF p_window_ms <= 0 OR p_max_requests <= 0 THEN
    RAISE EXCEPTION 'Invalid rate limit configuration';
  END IF;

  v_epoch_ms := FLOOR(EXTRACT(EPOCH FROM v_now) * 1000)::BIGINT;
  v_window_start_ms := (v_epoch_ms / p_window_ms) * p_window_ms;
  v_window_start := TO_TIMESTAMP(v_window_start_ms / 1000.0);
  v_next_window_start := TO_TIMESTAMP((v_window_start_ms + p_window_ms) / 1000.0);

  INSERT INTO public.api_rate_limits (scope, key_hash, window_start, window_ms, count, created_at, updated_at)
  VALUES (p_scope, p_key_hash, v_window_start, p_window_ms, 1, v_now, v_now)
  ON CONFLICT (scope, key_hash, window_start)
  DO UPDATE SET
    count = public.api_rate_limits.count + 1,
    updated_at = v_now
  RETURNING count INTO v_count;

  IF random() < 0.02 THEN
    DELETE FROM public.api_rate_limits
    WHERE updated_at < (v_now - INTERVAL '2 days');
  END IF;

  allowed := v_count <= p_max_requests;
  remaining := GREATEST(p_max_requests - v_count, 0);
  retry_after_seconds := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_next_window_start - v_now)))::INTEGER);
  current_count := v_count;

  RETURN NEXT;
END;

$function$;

-- function: create_conversation_after_appointment (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=209)
CREATE OR REPLACE FUNCTION public.create_conversation_after_appointment()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

BEGIN
  INSERT INTO conversations (patient_id, doctor_id, created_from_appointment_id)
  VALUES (NEW.patient_id, NEW.doctor_id, NEW.id)
  ON CONFLICT (patient_id, doctor_id) DO NOTHING;
  
  RETURN NEW;
END;

$function$;

-- function: create_conversation_after_visit (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=256)
CREATE OR REPLACE FUNCTION public.create_conversation_after_visit()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

BEGIN
  -- Only create if conversation doesn't exist
  INSERT INTO conversations (patient_id, doctor_id, created_from_appointment_id)
  VALUES (NEW.patient_id, NEW.doctor_id, NEW.id)
  ON CONFLICT (patient_id, doctor_id) DO NOTHING;
  
  RETURN NEW;
END;

$function$;

-- function: create_data_share (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=3593)
CREATE OR REPLACE FUNCTION public.create_data_share(p_global_patient_id uuid, p_grantor_clinic_id uuid, p_grantee_clinic_id uuid, p_granted_via text, p_grant_reason text, p_actor_user_id uuid, p_actor_kind text, p_default_expiry_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  v_audit_id  UUID;
  v_share_id  UUID;
  v_expires   TIMESTAMPTZ;
  v_existing  patient_data_shares%ROWTYPE;
BEGIN
  IF p_global_patient_id IS NULL OR p_grantor_clinic_id IS NULL
     OR p_grantee_clinic_id IS NULL OR p_granted_via IS NULL THEN
    RAISE EXCEPTION 'create_data_share: required arg is NULL';
  END IF;
  IF p_grantor_clinic_id = p_grantee_clinic_id THEN
    RAISE EXCEPTION 'create_data_share: grantor and grantee must differ';
  END IF;
  IF p_granted_via NOT IN ('PRIVACY_CODE','SMS_CODE','PATIENT_APP','AUTO_RENEW') THEN
    RAISE EXCEPTION 'create_data_share: invalid granted_via %', p_granted_via;
  END IF;
  IF p_actor_kind NOT IN ('user','system','migration') THEN
    RAISE EXCEPTION 'create_data_share: invalid actor_kind %', p_actor_kind;
  END IF;
  IF p_actor_kind = 'user' AND p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'create_data_share: actor_kind=user requires actor_user_id';
  END IF;
  IF p_actor_kind <> 'user' AND p_actor_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'create_data_share: actor_kind=% forbids actor_user_id', p_actor_kind;
  END IF;

  SELECT * INTO v_existing
    FROM public.patient_data_shares
   WHERE global_patient_id = p_global_patient_id
     AND grantor_clinic_id  = p_grantor_clinic_id
     AND grantee_clinic_id  = p_grantee_clinic_id
     AND revoked_at IS NULL
     AND (expires_at IS NULL OR expires_at > NOW())
   ORDER BY granted_at DESC
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'created',          false,
      'idempotent_hit',   true,
      'share_id',         v_existing.id,
      'audit_event_id',   v_existing.audit_event_id,
      'global_patient_id', v_existing.global_patient_id,
      'grantor_clinic_id', v_existing.grantor_clinic_id,
      'grantee_clinic_id', v_existing.grantee_clinic_id,
      'granted_at',       v_existing.granted_at,
      'expires_at',       v_existing.expires_at,
      'granted_via',      v_existing.granted_via
    );
  END IF;

  v_expires := NOW() + make_interval(days => COALESCE(p_default_expiry_days, 90));

  INSERT INTO public.audit_events (
    clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
  ) VALUES (
    p_grantee_clinic_id, p_actor_user_id, p_actor_kind,
    'SHARE_GRANTED', 'patient_data_share', NULL,
    jsonb_build_object(
      'global_patient_id', p_global_patient_id,
      'grantor_clinic_id', p_grantor_clinic_id,
      'grantee_clinic_id', p_grantee_clinic_id,
      'expires_at',        v_expires,
      'granted_via',       p_granted_via,
      'grant_reason',      p_grant_reason
    )
  )
  RETURNING id INTO v_audit_id;

  INSERT INTO public.patient_data_shares (
    global_patient_id, grantor_clinic_id, grantee_clinic_id,
    granted_at, expires_at, revoked_at,
    granted_via, grant_reason, audit_event_id
  ) VALUES (
    p_global_patient_id, p_grantor_clinic_id, p_grantee_clinic_id,
    NOW(), v_expires, NULL,
    p_granted_via, p_grant_reason, v_audit_id
  )
  RETURNING id INTO v_share_id;

  UPDATE public.audit_events
     SET entity_id = v_share_id,
         metadata  = metadata || jsonb_build_object('share_id', v_share_id)
   WHERE id = v_audit_id;

  RETURN jsonb_build_object(
    'created',          true,
    'idempotent_hit',   false,
    'share_id',         v_share_id,
    'audit_event_id',   v_audit_id,
    'global_patient_id', p_global_patient_id,
    'grantor_clinic_id', p_grantor_clinic_id,
    'grantee_clinic_id', p_grantee_clinic_id,
    'granted_at',       NOW(),
    'expires_at',       v_expires,
    'granted_via',      p_granted_via
  );
END;

$function$;

-- function: create_shares_for_grantors (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=1259)
CREATE OR REPLACE FUNCTION public.create_shares_for_grantors(p_global_patient_id uuid, p_grantor_clinic_ids uuid[], p_grantee_clinic_id uuid, p_granted_via text, p_actor_user_id uuid, p_actor_kind text DEFAULT 'user'::text, p_grant_reason text DEFAULT NULL::text)
RETURNS TABLE(share_id uuid, audit_event_id uuid, grantor_clinic_id uuid, expires_at timestamp with time zone, idempotent_hit boolean)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  v_grantor_id UUID;
  v_result     JSONB;
BEGIN
  IF p_grantor_clinic_ids IS NULL OR array_length(p_grantor_clinic_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'create_shares_for_grantors: empty grantor list';
  END IF;

  IF p_grantee_clinic_id = ANY(p_grantor_clinic_ids) THEN
    RAISE EXCEPTION 'create_shares_for_grantors: grantee % is in grantor list',
      p_grantee_clinic_id;
  END IF;

  FOREACH v_grantor_id IN ARRAY p_grantor_clinic_ids LOOP
    v_result := public.create_data_share(
      p_global_patient_id   := p_global_patient_id,
      p_grantor_clinic_id   := v_grantor_id,
      p_grantee_clinic_id   := p_grantee_clinic_id,
      p_granted_via         := p_granted_via,
      p_grant_reason        := p_grant_reason,
      p_actor_user_id       := p_actor_user_id,
      p_actor_kind          := p_actor_kind,
      p_default_expiry_days := 90
    );

    share_id          := NULLIF(v_result->>'share_id', '')::UUID;
    audit_event_id    := NULLIF(v_result->>'audit_event_id', '')::UUID;
    grantor_clinic_id := v_grantor_id;
    expires_at        := NULLIF(v_result->>'expires_at', '')::TIMESTAMPTZ;
    idempotent_hit    := COALESCE((v_result->>'idempotent_hit')::BOOLEAN, FALSE);
    RETURN NEXT;
  END LOOP;

  RETURN;
END;

$function$;

-- function: create_sharing_preferences_after_appointment (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=799)
CREATE OR REPLACE FUNCTION public.create_sharing_preferences_after_appointment()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

DECLARE
  v_defaults RECORD;
BEGIN
  SELECT * INTO v_defaults FROM default_sharing_preferences 
  WHERE patient_id = NEW.patient_id;
  
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

$function$;

-- function: create_sharing_preferences_after_visit (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=900)
CREATE OR REPLACE FUNCTION public.create_sharing_preferences_after_visit()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

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

$function$;

-- function: extend_data_share (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=2373)
CREATE OR REPLACE FUNCTION public.extend_data_share(p_share_id uuid, p_duration text, p_actor_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  v_share        patient_data_shares%ROWTYPE;
  v_new_expires  TIMESTAMPTZ;
  v_audit_id     UUID;
BEGIN
  IF p_share_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'extend_data_share: share_id and actor_user_id required';
  END IF;
  IF p_duration NOT IN ('90_DAYS','1_YEAR','PERMANENT') THEN
    RAISE EXCEPTION 'extend_data_share: invalid duration %', p_duration;
  END IF;

  SELECT * INTO v_share
    FROM public.patient_data_shares
   WHERE id = p_share_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'extend_data_share: share % not found', p_share_id;
  END IF;
  IF v_share.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'extend_data_share: share % is revoked', p_share_id;
  END IF;

  IF p_duration = 'PERMANENT' THEN
    v_new_expires := NULL;
  ELSIF p_duration = '90_DAYS' THEN
    v_new_expires := GREATEST(
      COALESCE(v_share.expires_at, NOW()),
      NOW() + INTERVAL '90 days'
    );
  ELSE
    v_new_expires := GREATEST(
      COALESCE(v_share.expires_at, NOW()),
      NOW() + INTERVAL '1 year'
    );
  END IF;

  IF v_share.expires_at IS NULL THEN
    RETURN jsonb_build_object(
      'changed', false, 'reason', 'already_permanent',
      'share_id', v_share.id, 'expires_at', NULL,
      'previous_expires_at', NULL
    );
  END IF;

  IF p_duration <> 'PERMANENT' AND v_new_expires <= v_share.expires_at THEN
    RETURN jsonb_build_object(
      'changed', false, 'reason', 'would_shorten',
      'share_id', v_share.id, 'expires_at', v_share.expires_at,
      'previous_expires_at', v_share.expires_at
    );
  END IF;

  INSERT INTO public.audit_events (
    clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
  ) VALUES (
    v_share.grantee_clinic_id, p_actor_user_id, 'user',
    'SHARE_EXTENDED', 'patient_data_share', v_share.id,
    jsonb_build_object(
      'share_id', v_share.id,
      'previous_expires_at', v_share.expires_at,
      'new_expires_at', v_new_expires,
      'duration', p_duration
    )
  )
  RETURNING id INTO v_audit_id;

  UPDATE public.patient_data_shares
     SET expires_at = v_new_expires
   WHERE id = p_share_id;

  RETURN jsonb_build_object(
    'changed', true,
    'share_id', v_share.id,
    'expires_at', v_new_expires,
    'previous_expires_at', v_share.expires_at,
    'audit_event_id', v_audit_id,
    'duration', p_duration
  );
END;

$function$;

-- function: find_duplicate_patient_phones (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=184)
CREATE OR REPLACE FUNCTION public.find_duplicate_patient_phones()
RETURNS TABLE(phone text, duplicate_count bigint, patient_ids uuid[])
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

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

$function$;

-- function: generate_prescription_number (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=445)
CREATE OR REPLACE FUNCTION public.generate_prescription_number()
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

DECLARE
  year_part TEXT;
  sequence_num INTEGER;
  rx_number TEXT;
BEGIN
  year_part := TO_CHAR(CURRENT_DATE, 'YYYY');
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(prescription_number FROM 'RX-\d{4}-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO sequence_num
  FROM clinical_notes
  WHERE prescription_number LIKE 'RX-' || year_part || '-%';
  
  rx_number := 'RX-' || year_part || '-' || LPAD(sequence_num::TEXT, 4, '0');
  
  RETURN rx_number;
END;

$function$;

-- function: get_clinic_role (lang=sql, SECURITY DEFINER, STABLE, body_length=133)
CREATE OR REPLACE FUNCTION public.get_clinic_role(p_clinic_id uuid, p_user_id uuid)
RETURNS clinic_role
LANGUAGE sql SECURITY DEFINER STABLE
AS $function$

  SELECT role FROM public.clinic_memberships
  WHERE clinic_id = p_clinic_id
    AND user_id = p_user_id
    AND status = 'ACTIVE';

$function$;

-- function: get_next_anonymous_number (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=218)
CREATE OR REPLACE FUNCTION public.get_next_anonymous_number(p_doctor_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

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

$function$;

-- function: get_next_queue_number (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=217)
CREATE OR REPLACE FUNCTION public.get_next_queue_number(p_doctor_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(queue_number), 0) + 1
  INTO next_num
  FROM check_in_queue
  WHERE doctor_id = p_doctor_id
    AND DATE(created_at) = CURRENT_DATE;
  
  RETURN next_num;
END;

$function$;

-- function: get_next_walkin_slot (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=2483)
CREATE OR REPLACE FUNCTION public.get_next_walkin_slot(p_doctor_id uuid, p_slot_duration integer DEFAULT 15, p_date date DEFAULT NULL::date)
RETURNS timestamp with time zone
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

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
    AND  is_active = TRUE
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

$function$;

-- function: get_public_table_names (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=125)
CREATE OR REPLACE FUNCTION public.get_public_table_names()
RETURNS TABLE(table_name text)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

BEGIN
  RETURN QUERY
  SELECT t.table_name::TEXT
  FROM information_schema.tables t
  WHERE t.table_schema = 'public';
END;

$function$;

-- function: get_schedule_blocks (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=2500)
CREATE OR REPLACE FUNCTION public.get_schedule_blocks(p_doctor_id uuid, p_date date DEFAULT NULL::date)
RETURNS TABLE(block_start timestamp with time zone, block_end timestamp with time zone, block_type text, patient_name text, queue_number integer, minutes_free integer)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

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
    AND  is_active = TRUE
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

$function$;

-- function: get_table_columns (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=163)
CREATE OR REPLACE FUNCTION public.get_table_columns(p_table_name text)
RETURNS TABLE(column_name text)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

BEGIN
  RETURN QUERY
  SELECT c.column_name::TEXT
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = p_table_name;
END;

$function$;

-- function: initiate_sms_share (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=2681)
CREATE OR REPLACE FUNCTION public.initiate_sms_share(p_phone text, p_requesting_clinic_id uuid, p_requesting_doctor_id uuid, p_request_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  v_start TIMESTAMPTZ := clock_timestamp();
  v_min_ms CONSTANT INT := 50;
  v_normalized TEXT;
  v_gpid UUID;
  v_recent_unused INT;
  v_plaintext TEXT;
  v_hash TEXT;
  v_token_id UUID;
  v_uniform_payload CONSTANT JSONB := jsonb_build_object('requires_code', TRUE);
BEGIN
  v_normalized := public.normalize_phone_e164(p_phone);
  IF v_normalized IS NULL THEN
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_uniform_payload;
  END IF;

  SELECT id INTO v_gpid FROM public.global_patients WHERE normalized_phone = v_normalized LIMIT 1;
  IF v_gpid IS NULL THEN
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_uniform_payload;
  END IF;

  SELECT COUNT(*) INTO v_recent_unused
    FROM public.privacy_code_sms_tokens
   WHERE global_patient_id = v_gpid
     AND used_at IS NULL
     AND created_at > NOW() - INTERVAL '1 hour';

  IF v_recent_unused >= 3 THEN
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
    ) VALUES (
      p_requesting_clinic_id, p_requesting_doctor_id, 'user',
      'SMS_CODE_FAILED', 'global_patients', v_gpid,
      jsonb_build_object('reason','send_rate_limited','recent_unused',v_recent_unused,'request_id',p_request_id));
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_uniform_payload;
  END IF;

  v_plaintext := public._generate_sms_code_plaintext();
  v_hash := crypt(v_plaintext, gen_salt('bf', 12));

  INSERT INTO public.privacy_code_sms_tokens (
    global_patient_id, requesting_clinic_id, requesting_doctor_id,
    sms_code_hash, algorithm, expires_at
  ) VALUES (
    v_gpid, p_requesting_clinic_id, p_requesting_doctor_id,
    v_hash, 'bcrypt', NOW() + INTERVAL '5 minutes'
  ) RETURNING id INTO v_token_id;

  INSERT INTO public.audit_events (
    clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
  ) VALUES (
    p_requesting_clinic_id, p_requesting_doctor_id, 'user',
    'SMS_CONSENT_SENT', 'global_patients', v_gpid,
    jsonb_build_object(
      'sms_token_id',v_token_id,
      'expires_at',NOW() + INTERVAL '5 minutes',
      'sms_plaintext',v_plaintext,
      'requesting_clinic_id',p_requesting_clinic_id,
      'requesting_doctor_id',p_requesting_doctor_id,
      'request_id',p_request_id,
      'sms_dispatch_pending',TRUE));

  PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
  RETURN v_uniform_payload;
END;

$function$;

-- function: is_account_dormant (lang=plpgsql, SECURITY INVOKER, IMMUTABLE, body_length=66)
CREATE OR REPLACE FUNCTION public.is_account_dormant(last_activity timestamp with time zone)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER IMMUTABLE
AS $function$

BEGIN
  RETURN last_activity < NOW() - INTERVAL '6 months';
END;

$function$;

-- function: is_clinic_member (lang=sql, SECURITY DEFINER, STABLE, body_length=160)
CREATE OR REPLACE FUNCTION public.is_clinic_member(p_clinic_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $function$

  SELECT EXISTS (
    SELECT 1 FROM public.clinic_memberships
    WHERE clinic_id = p_clinic_id
      AND user_id = p_user_id
      AND status = 'ACTIVE'
  );

$function$;

-- function: mark_dormant_accounts (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=291)
CREATE OR REPLACE FUNCTION public.mark_dormant_accounts()
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE public.patients
  SET account_status = 'dormant'
  WHERE last_activity_at < NOW() - INTERVAL '6 months'
    AND account_status = 'active'
    AND registered = true;
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;

$function$;

-- function: mark_duplicate_patients (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=152)
CREATE OR REPLACE FUNCTION public.mark_duplicate_patients(p_keep_id uuid, p_merge_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

BEGIN
  UPDATE public.patients
  SET account_status = 'merged',
      converted_at = NOW()
  WHERE id = ANY(p_merge_ids)
    AND id <> p_keep_id;
END;

$function$;

-- function: mark_share_expired_notification (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=1373)
CREATE OR REPLACE FUNCTION public.mark_share_expired_notification(p_share_id uuid, p_cron_run_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  v_share     patient_data_shares%ROWTYPE;
  v_audit_id  UUID;
  v_already   BOOLEAN;
BEGIN
  IF p_share_id IS NULL THEN
    RAISE EXCEPTION 'mark_share_expired_notification: share_id required';
  END IF;

  SELECT * INTO v_share
    FROM public.patient_data_shares
   WHERE id = p_share_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_share_expired_notification: share % not found', p_share_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.audit_events
     WHERE action = 'SHARE_EXPIRED'
       AND entity_type = 'patient_data_share'
       AND entity_id = p_share_id
       AND (metadata->>'notified')::BOOLEAN IS TRUE
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object(
      'changed', false, 'reason', 'already_notified', 'share_id', p_share_id
    );
  END IF;

  INSERT INTO public.audit_events (
    clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
  ) VALUES (
    v_share.grantee_clinic_id, NULL, 'system',
    'SHARE_EXPIRED', 'patient_data_share', v_share.id,
    jsonb_build_object(
      'share_id', v_share.id,
      'expired_at', v_share.expires_at,
      'notified', true,
      'cron_run_id', p_cron_run_id
    )
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'changed', true, 'share_id', p_share_id, 'audit_event_id', v_audit_id
  );
END;

$function$;

-- function: normalize_phone_e164 (lang=plpgsql, SECURITY INVOKER, IMMUTABLE, body_length=1613)
CREATE OR REPLACE FUNCTION public.normalize_phone_e164(p_phone text)
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER IMMUTABLE
AS $function$

DECLARE
  v_western TEXT;
  v_cleaned TEXT;
  v_has_plus BOOLEAN;
  v_digits TEXT;
  v_twelve TEXT;
  v_mobile_prefix TEXT;
BEGIN
  IF p_phone IS NULL THEN
    RETURN NULL;
  END IF;

  v_western := translate(p_phone, '٠١٢٣٤٥٦٧٨٩', '0123456789');
  v_cleaned := regexp_replace(v_western, '[\s\-.()]', '', 'g');

  IF length(v_cleaned) = 0 THEN
    RETURN NULL;
  END IF;

  v_has_plus := left(v_cleaned, 1) = '+';
  v_digits := CASE WHEN v_has_plus THEN substring(v_cleaned FROM 2) ELSE v_cleaned END;

  IF v_digits !~ '^[0-9]+$' THEN
    RETURN NULL;
  END IF;

  IF left(v_digits, 2) = '00' THEN
    v_digits := substring(v_digits FROM 3);
    IF left(v_digits, 2) <> '20' THEN RETURN NULL; END IF;
    IF length(v_digits) <> 12 THEN RETURN NULL; END IF;
    v_twelve := v_digits;
  ELSIF left(v_digits, 2) = '20' THEN
    IF length(v_digits) <> 12 THEN RETURN NULL; END IF;
    v_twelve := v_digits;
  ELSIF left(v_digits, 1) = '0' THEN
    IF length(v_digits) <> 11 THEN RETURN NULL; END IF;
    IF left(v_digits, 2) <> '01' THEN RETURN NULL; END IF;
    v_twelve := '20' || substring(v_digits FROM 2);
  ELSIF length(v_digits) = 10 THEN
    v_mobile_prefix := substring(v_digits FROM 1 FOR 2);
    IF v_mobile_prefix NOT IN ('10', '11', '12', '15') THEN RETURN NULL; END IF;
    v_twelve := '20' || v_digits;
  ELSE
    RETURN NULL;
  END IF;

  IF length(v_twelve) <> 12 OR left(v_twelve, 2) <> '20' THEN
    RETURN NULL;
  END IF;

  v_mobile_prefix := substring(v_twelve FROM 3 FOR 2);
  IF v_mobile_prefix NOT IN ('10', '11', '12', '15') THEN
    RETURN NULL;
  END IF;

  RETURN '+' || v_twelve;
END;

$function$;

-- function: patient_clinic_records_touch_updated_at (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=53)
CREATE OR REPLACE FUNCTION public.patient_clinic_records_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;

$function$;

-- function: record_privacy_code_attempt (lang=sql, SECURITY DEFINER, VOLATILE, body_length=346)
CREATE OR REPLACE FUNCTION public.record_privacy_code_attempt(p_global_patient_id uuid, p_privacy_code_id uuid, p_attempted_by_user_id uuid, p_attempted_by_clinic_id uuid, p_result privacy_code_attempt_result, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_request_id uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER VOLATILE
AS $function$

  INSERT INTO public.privacy_code_attempts (
    global_patient_id, privacy_code_id,
    attempted_by_user_id, attempted_by_clinic_id,
    result, ip_address, user_agent, request_id
  ) VALUES (
    p_global_patient_id, p_privacy_code_id,
    p_attempted_by_user_id, p_attempted_by_clinic_id,
    p_result, p_ip, p_user_agent, p_request_id
  );

$function$;

-- function: regenerate_privacy_code (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=1854)
CREATE OR REPLACE FUNCTION public.regenerate_privacy_code(p_global_patient_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  v_caller_is_patient BOOLEAN;
  v_caller_is_service BOOLEAN;
  v_actor_kind TEXT;
  v_actor_user UUID;
  v_plaintext TEXT;
  v_hash TEXT;
  v_new_id UUID;
  v_new_regen_count INT;
BEGIN
  v_caller_is_service := (auth.role() = 'service_role');
  IF NOT v_caller_is_service THEN
    SELECT (claimed_user_id = auth.uid())
      INTO v_caller_is_patient
      FROM public.global_patients WHERE id = p_global_patient_id;
    IF NOT COALESCE(v_caller_is_patient, FALSE) THEN
      RAISE EXCEPTION 'unauthorized: only the claimed patient or service role may regenerate this code';
    END IF;
    v_actor_kind := 'user'; v_actor_user := auth.uid();
  ELSE
    v_actor_kind := 'system'; v_actor_user := NULL;
  END IF;

  v_plaintext := public._generate_privacy_code_plaintext();
  v_hash := crypt(v_plaintext, gen_salt('bf', 12));

  SELECT COALESCE(MAX(regenerated_count), -1) + 1 INTO v_new_regen_count
    FROM public.patient_privacy_codes WHERE global_patient_id = p_global_patient_id;

  UPDATE public.patient_privacy_codes
     SET revoked_at = NOW(), revoked_reason = 'regenerated'
   WHERE global_patient_id = p_global_patient_id AND revoked_at IS NULL;

  INSERT INTO public.patient_privacy_codes (
    global_patient_id, code_hash, algorithm, regenerated_count
  ) VALUES (p_global_patient_id, v_hash, 'bcrypt', v_new_regen_count)
  RETURNING id INTO v_new_id;

  INSERT INTO public.audit_events (
    clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
  ) VALUES (
    NULL, v_actor_user, v_actor_kind, 'PRIVACY_CODE_REGENERATED',
    'global_patients', p_global_patient_id,
    jsonb_build_object(
      'privacy_code_id', v_new_id,
      'regenerated_count', v_new_regen_count,
      'minted_via', CASE WHEN v_caller_is_service THEN 'lazy_mint' ELSE 'patient_request' END
    )
  );
  RETURN v_plaintext;
END;

$function$;

-- function: reorder_queue_item (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=1420)
CREATE OR REPLACE FUNCTION public.reorder_queue_item(p_queue_id uuid, p_target_queue_number integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

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

$function$;

-- function: revoke_data_share (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=1797)
CREATE OR REPLACE FUNCTION public.revoke_data_share(p_share_id uuid, p_actor_user_id uuid, p_actor_kind text, p_revoke_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  v_share     patient_data_shares%ROWTYPE;
  v_audit_id  UUID;
BEGIN
  IF p_share_id IS NULL THEN
    RAISE EXCEPTION 'revoke_data_share: share_id required';
  END IF;
  IF p_actor_kind NOT IN ('user','system') THEN
    RAISE EXCEPTION 'revoke_data_share: actor_kind must be user or system';
  END IF;
  IF p_actor_kind = 'user' AND p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'revoke_data_share: actor_kind=user requires actor_user_id';
  END IF;
  IF p_actor_kind <> 'user' AND p_actor_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'revoke_data_share: actor_kind=% forbids actor_user_id', p_actor_kind;
  END IF;

  SELECT * INTO v_share
    FROM public.patient_data_shares
   WHERE id = p_share_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'revoke_data_share: share % not found', p_share_id;
  END IF;

  IF v_share.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'changed', false, 'reason', 'already_revoked',
      'share_id', v_share.id, 'revoked_at', v_share.revoked_at
    );
  END IF;

  INSERT INTO public.audit_events (
    clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
  ) VALUES (
    v_share.grantee_clinic_id, p_actor_user_id, p_actor_kind,
    'SHARE_REVOKED', 'patient_data_share', v_share.id,
    jsonb_build_object(
      'share_id', v_share.id,
      'revoked_by_actor_kind', p_actor_kind,
      'revoke_reason', p_revoke_reason,
      'previous_expires_at', v_share.expires_at,
      'granted_via', v_share.granted_via
    )
  )
  RETURNING id INTO v_audit_id;

  UPDATE public.patient_data_shares
     SET revoked_at = NOW()
   WHERE id = p_share_id;

  RETURN jsonb_build_object(
    'changed', true,
    'share_id', v_share.id,
    'revoked_at', NOW(),
    'audit_event_id', v_audit_id
  );
END;

$function$;

-- function: rls_test_record (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=371)
CREATE OR REPLACE FUNCTION public.rls_test_record(p_run_no integer, p_scenario text, p_table text, p_desc text, p_expected text, p_actual_rows integer, p_pass boolean, p_notes text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

BEGIN
  INSERT INTO public._rls_test_results
    (run_no, scenario, table_name, description, expected_outcome, actual_outcome, actual_rows, notes)
  VALUES
    (p_run_no, p_scenario, p_table, p_desc, p_expected,
     CASE WHEN p_pass THEN p_expected ELSE
       CASE WHEN p_expected = 'SUCCESS' THEN 'FAIL' ELSE 'SUCCESS' END
     END,
     p_actual_rows, p_notes);
END 
$function$;

-- function: rls_test_seed (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=10506)
CREATE OR REPLACE FUNCTION public.rls_test_seed()
RETURNS TABLE(entity text, id uuid, note text)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  k_clinic_a UUID := '00000099-0000-0000-0000-000000000001';
  k_clinic_b UUID := '00000099-0000-0000-0000-000000000002';
  k_doctor_a UUID := '00000099-0000-0000-0000-000000000010';
  k_doctor_b UUID := '00000099-0000-0000-0000-000000000011';
  k_frontdesk_a UUID := '00000099-0000-0000-0000-000000000012';
  k_owner_a UUID := '00000099-0000-0000-0000-000000000013';
  k_patient_y_user UUID := '00000099-0000-0000-0000-000000000020';
  k_patient_x_user UUID := '00000099-0000-0000-0000-000000000021';
  k_patient_z_user UUID := '00000099-0000-0000-0000-000000000022';
  k_patient_x_gp UUID := '00000099-0000-0000-0000-000000000031';
  k_patient_y_gp UUID := '00000099-0000-0000-0000-000000000032';
  k_patient_z_gp UUID := '00000099-0000-0000-0000-000000000033';
  k_share_active UUID := '00000099-0000-0000-0000-000000000050';
  k_share_revoked UUID := '00000099-0000-0000-0000-000000000051';
  k_share_expired UUID := '00000099-0000-0000-0000-000000000052';
  k_priv_code UUID := '00000099-0000-0000-0000-000000000070';
  k_attempt UUID := '00000099-0000-0000-0000-000000000071';
  k_sms_token UUID := '00000099-0000-0000-0000-000000000072';
  k_clinical_note_y UUID := '00000099-0000-0000-0000-000000000080';
  k_clinical_note_x UUID := '00000099-0000-0000-0000-000000000081';
  k_clinical_note_z UUID := '00000099-0000-0000-0000-000000000082';
  k_lab_order_x UUID := '00000099-0000-0000-0000-000000000090';
  k_lab_result_x UUID := '00000099-0000-0000-0000-000000000091';
  k_imaging_order_x UUID := '00000099-0000-0000-0000-000000000092';
  k_vital_signs_x UUID := '00000099-0000-0000-0000-000000000093';
  k_prescription_item_x UUID := '00000099-0000-0000-0000-000000000094';
  k_appointment_x UUID := '00000099-0000-0000-0000-0000000000a0';
  k_checkin_x UUID := '00000099-0000-0000-0000-0000000000a1';
  k_payment_x UUID := '00000099-0000-0000-0000-0000000000a2';
  k_doctor_avail_a UUID := '00000099-0000-0000-0000-0000000000a3';
  k_conversation_yx UUID := '00000099-0000-0000-0000-0000000000a4';
  k_message_yx UUID := '00000099-0000-0000-0000-0000000000a5';
  k_notification_y UUID := '00000099-0000-0000-0000-0000000000a6';
  v_pcr_y_at_a UUID; v_pcr_x_at_a UUID; v_pcr_z_at_a UUID; v_lab_test_id UUID;
BEGIN
  PERFORM public.rls_test_teardown();
  INSERT INTO public.clinics (id, unique_id, name) VALUES (k_clinic_a, 'rls-test-clinic-a', 'RLS Test Clinic A'),(k_clinic_b, 'rls-test-clinic-b', 'RLS Test Clinic B');
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous, email_confirmed_at) VALUES
    (k_doctor_a, '00000000-0000-0000-0000-000000000000', 'authenticated','authenticated','rls-doctor-a@test.invalid','{"provider":"email"}','{}',NOW(),NOW(),false,NOW()),
    (k_doctor_b, '00000000-0000-0000-0000-000000000000', 'authenticated','authenticated','rls-doctor-b@test.invalid','{"provider":"email"}','{}',NOW(),NOW(),false,NOW()),
    (k_frontdesk_a, '00000000-0000-0000-0000-000000000000', 'authenticated','authenticated','rls-frontdesk-a@test.invalid','{"provider":"email"}','{}',NOW(),NOW(),false,NOW()),
    (k_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated','authenticated','rls-owner-a@test.invalid','{"provider":"email"}','{}',NOW(),NOW(),false,NOW()),
    (k_patient_y_user, '00000000-0000-0000-0000-000000000000', 'authenticated','authenticated','rls-patient-y@test.invalid','{"provider":"email"}','{}',NOW(),NOW(),false,NOW()),
    (k_patient_x_user, '00000000-0000-0000-0000-000000000000', 'authenticated','authenticated','rls-patient-x@test.invalid','{"provider":"email"}','{}',NOW(),NOW(),false,NOW()),
    (k_patient_z_user, '00000000-0000-0000-0000-000000000000', 'authenticated','authenticated','rls-patient-z@test.invalid','{"provider":"email"}','{}',NOW(),NOW(),false,NOW());
  INSERT INTO public.users (id, phone, role, is_canonical, normalized_phone) VALUES
    (k_doctor_a,'+10000000010','doctor',TRUE,'+10000000010'),(k_doctor_b,'+10000000011','doctor',TRUE,'+10000000011'),
    (k_frontdesk_a,'+10000000012','frontdesk',TRUE,'+10000000012'),(k_owner_a,'+10000000013','doctor',TRUE,'+10000000013'),
    (k_patient_y_user,'+10000000020','patient',TRUE,'+10000000020'),(k_patient_x_user,'+10000000021','patient',TRUE,'+10000000021'),(k_patient_z_user,'+10000000022','patient',TRUE,'+10000000022');
  INSERT INTO public.doctors (id, unique_id, specialty) VALUES
    (k_doctor_a,'rls-doctor-a','general-practitioner'),(k_doctor_b,'rls-doctor-b','general-practitioner'),(k_owner_a,'rls-owner-a','general-practitioner');
  INSERT INTO public.clinic_memberships (clinic_id, user_id, role, status) VALUES
    (k_clinic_a, k_doctor_a, 'DOCTOR', 'ACTIVE'),(k_clinic_b, k_doctor_b, 'DOCTOR', 'ACTIVE'),
    (k_clinic_a, k_frontdesk_a, 'FRONT_DESK', 'ACTIVE'),(k_clinic_a, k_owner_a, 'OWNER', 'ACTIVE');
  INSERT INTO public.global_patients (id, normalized_phone, claimed, claimed_user_id, claimed_at) VALUES
    (k_patient_x_gp,'+10000000031',FALSE,NULL,NULL),(k_patient_y_gp,'+10000000032',TRUE,k_patient_y_user,NOW()),(k_patient_z_gp,'+10000000033',FALSE,NULL,NULL);
  INSERT INTO public.patient_clinic_records (global_patient_id, clinic_id) VALUES
    (k_patient_x_gp, k_clinic_a),(k_patient_x_gp, k_clinic_b),(k_patient_y_gp, k_clinic_a),(k_patient_z_gp, k_clinic_a);
  INSERT INTO public.patient_data_shares (id, global_patient_id, grantor_clinic_id, grantee_clinic_id, granted_via, granted_at, expires_at, revoked_at) VALUES
    (k_share_active, k_patient_x_gp, k_clinic_a, k_clinic_b, 'PRIVACY_CODE', NOW() - INTERVAL '7 days', NULL, NULL),
    (k_share_revoked, k_patient_z_gp, k_clinic_a, k_clinic_b, 'PRIVACY_CODE', NOW() - INTERVAL '14 days', NULL, NOW() - INTERVAL '1 day'),
    (k_share_expired, k_patient_y_gp, k_clinic_a, k_clinic_b, 'PRIVACY_CODE', NOW() - INTERVAL '30 days', NOW() - INTERVAL '1 day', NULL);
  INSERT INTO public.patient_privacy_codes (id, global_patient_id, code_hash) VALUES (k_priv_code, k_patient_x_gp, 'bcrypt$placeholder$rls_test');
  INSERT INTO public.privacy_code_attempts (id, global_patient_id, attempted_by_user_id, attempted_by_clinic_id, result) VALUES (k_attempt, k_patient_y_gp, k_doctor_a, k_clinic_a, 'success');
  INSERT INTO public.privacy_code_sms_tokens (id, global_patient_id, requesting_clinic_id, requesting_doctor_id, sms_code_hash, expires_at) VALUES (k_sms_token, k_patient_z_gp, k_clinic_b, k_doctor_b, 'bcrypt$placeholder$sms_rls_test', NOW() + INTERVAL '5 minutes');
  INSERT INTO public.patients (id, unique_id, phone, clinic_id, normalized_phone, global_patient_id) VALUES
    (k_patient_y_user,'rls-legacy-py','+10000000020',k_clinic_a,'+10000000020',k_patient_y_gp),
    (k_patient_x_user,'rls-legacy-px','+10000000021',k_clinic_a,'+10000000021',k_patient_x_gp),
    (k_patient_z_user,'rls-legacy-pz','+10000000022',k_clinic_a,'+10000000022',k_patient_z_gp);
  SELECT pcr.id INTO v_pcr_y_at_a FROM public.patient_clinic_records pcr WHERE pcr.global_patient_id = k_patient_y_gp AND pcr.clinic_id = k_clinic_a;
  SELECT pcr.id INTO v_pcr_x_at_a FROM public.patient_clinic_records pcr WHERE pcr.global_patient_id = k_patient_x_gp AND pcr.clinic_id = k_clinic_a;
  SELECT pcr.id INTO v_pcr_z_at_a FROM public.patient_clinic_records pcr WHERE pcr.global_patient_id = k_patient_z_gp AND pcr.clinic_id = k_clinic_a;
  INSERT INTO public.clinical_notes (id, doctor_id, patient_id, clinic_id, global_patient_id, patient_clinic_record_id) VALUES
    (k_clinical_note_y, k_doctor_a, k_patient_y_user, k_clinic_a, k_patient_y_gp, v_pcr_y_at_a),
    (k_clinical_note_x, k_doctor_a, k_patient_x_user, k_clinic_a, k_patient_x_gp, v_pcr_x_at_a),
    (k_clinical_note_z, k_doctor_a, k_patient_z_user, k_clinic_a, k_patient_z_gp, v_pcr_z_at_a);
  INSERT INTO public.lab_orders (id, doctor_id, patient_id, clinic_id, global_patient_id, patient_clinic_record_id) VALUES (k_lab_order_x, k_doctor_a, k_patient_x_user, k_clinic_a, k_patient_x_gp, v_pcr_x_at_a);
  INSERT INTO public.imaging_orders (id, doctor_id, patient_id, modality, study_name, clinic_id, global_patient_id, patient_clinic_record_id) VALUES (k_imaging_order_x, k_doctor_a, k_patient_x_user, 'ct', 'rls-test-study', k_clinic_a, k_patient_x_gp, v_pcr_x_at_a);
  INSERT INTO public.vital_signs (id, doctor_id, patient_id, clinic_id, global_patient_id, patient_clinic_record_id) VALUES (k_vital_signs_x, k_doctor_a, k_patient_x_user, k_clinic_a, k_patient_x_gp, v_pcr_x_at_a);
  INSERT INTO public.prescription_items (id, clinical_note_id, patient_id, doctor_id, drug_name, frequency, duration, clinic_id, global_patient_id, patient_clinic_record_id) VALUES (k_prescription_item_x, k_clinical_note_x, k_patient_x_user, k_doctor_a, 'rls-test-drug', 'daily', '7d', k_clinic_a, k_patient_x_gp, v_pcr_x_at_a);
  SELECT lt.id INTO v_lab_test_id FROM public.lab_tests lt LIMIT 1;
  INSERT INTO public.lab_results (id, lab_order_id, lab_test_id, clinic_id, global_patient_id, patient_clinic_record_id) VALUES (k_lab_result_x, k_lab_order_x, v_lab_test_id, k_clinic_a, k_patient_x_gp, v_pcr_x_at_a);

  -- ── Session 14a: 7 ops/comm rows ──
  INSERT INTO public.appointments (id, doctor_id, clinic_id, start_time, created_by_role, global_patient_id, patient_clinic_record_id, patient_id) VALUES
    (k_appointment_x, k_doctor_a, k_clinic_a, NOW() + INTERVAL '1 day', 'doctor', k_patient_x_gp, v_pcr_x_at_a, k_patient_x_user);
  INSERT INTO public.check_in_queue (id, patient_id, doctor_id, queue_number, clinic_id) VALUES (k_checkin_x, k_patient_x_user, k_doctor_a, 1, k_clinic_a);
  INSERT INTO public.payments (id, patient_id, doctor_id, amount, payment_method, clinic_id) VALUES (k_payment_x, k_patient_x_user, k_doctor_a, 100.00, 'cash', k_clinic_a);
  INSERT INTO public.doctor_availability (id, doctor_id, day_of_week, start_time, end_time, clinic_id) VALUES (k_doctor_avail_a, k_doctor_a, 1, '09:00', '17:00', k_clinic_a);
  INSERT INTO public.conversations (id, patient_id, doctor_id, clinic_id) VALUES (k_conversation_yx, k_patient_y_user, k_doctor_a, k_clinic_a);
  INSERT INTO public.messages (id, conversation_id, sender_id, sender_type, content, clinic_id) VALUES (k_message_yx, k_conversation_yx, k_doctor_a, 'doctor', 'rls-test-message', k_clinic_a);
  INSERT INTO public.notifications (id, recipient_id, type, title) VALUES (k_notification_y, k_patient_y_user, 'system', 'rls-test-notification');

  RETURN QUERY VALUES ('seed_complete'::TEXT, '00000099-0000-0000-0000-000000000099'::UUID, '33 entities seeded — sessions 5+7+10+11+14a');
END 
$function$;

-- function: rls_test_teardown (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=5772)
CREATE OR REPLACE FUNCTION public.rls_test_teardown()
RETURNS TABLE(entity text, removed integer)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  k_clinic_uuids UUID[] := ARRAY['00000099-0000-0000-0000-000000000001'::UUID,'00000099-0000-0000-0000-000000000002'::UUID];
  k_user_uuids UUID[] := ARRAY['00000099-0000-0000-0000-000000000010'::UUID,'00000099-0000-0000-0000-000000000011'::UUID,'00000099-0000-0000-0000-000000000012'::UUID,'00000099-0000-0000-0000-000000000013'::UUID,'00000099-0000-0000-0000-000000000020'::UUID,'00000099-0000-0000-0000-000000000021'::UUID,'00000099-0000-0000-0000-000000000022'::UUID];
  k_gp_uuids UUID[] := ARRAY['00000099-0000-0000-0000-000000000031'::UUID,'00000099-0000-0000-0000-000000000032'::UUID,'00000099-0000-0000-0000-000000000033'::UUID];
  k_share_uuids UUID[] := ARRAY['00000099-0000-0000-0000-000000000050'::UUID,'00000099-0000-0000-0000-000000000051'::UUID,'00000099-0000-0000-0000-000000000052'::UUID];
  v_n INT;
BEGIN
  -- New ops/comm rows first (children of clinic_id / conversation)
  DELETE FROM public.notifications WHERE id::text LIKE '00000099%';
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'notifications'; removed := v_n; RETURN NEXT;
  DELETE FROM public.messages WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'messages'; removed := v_n; RETURN NEXT;
  DELETE FROM public.conversations WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'conversations'; removed := v_n; RETURN NEXT;
  DELETE FROM public.payments WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'payments'; removed := v_n; RETURN NEXT;
  DELETE FROM public.check_in_queue WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'check_in_queue'; removed := v_n; RETURN NEXT;
  DELETE FROM public.appointments WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'appointments'; removed := v_n; RETURN NEXT;
  DELETE FROM public.doctor_availability WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'doctor_availability'; removed := v_n; RETURN NEXT;
  -- Clinical-data
  DELETE FROM public.lab_results WHERE id::text LIKE '00000099%';
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'lab_results'; removed := v_n; RETURN NEXT;
  DELETE FROM public.prescription_items WHERE id::text LIKE '00000099%';
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'prescription_items'; removed := v_n; RETURN NEXT;
  DELETE FROM public.lab_orders WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'lab_orders'; removed := v_n; RETURN NEXT;
  DELETE FROM public.imaging_orders WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'imaging_orders'; removed := v_n; RETURN NEXT;
  DELETE FROM public.vital_signs WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'vital_signs'; removed := v_n; RETURN NEXT;
  DELETE FROM public.clinical_notes WHERE id::text LIKE '00000099%' OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'clinical_notes'; removed := v_n; RETURN NEXT;
  -- Privacy + audit
  DELETE FROM public.privacy_code_attempts WHERE id::text LIKE '00000099%' OR global_patient_id = ANY(k_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'privacy_code_attempts'; removed := v_n; RETURN NEXT;
  DELETE FROM public.privacy_code_sms_tokens WHERE id::text LIKE '00000099%' OR global_patient_id = ANY(k_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'privacy_code_sms_tokens'; removed := v_n; RETURN NEXT;
  DELETE FROM public.patient_privacy_codes WHERE id::text LIKE '00000099%' OR global_patient_id = ANY(k_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'patient_privacy_codes'; removed := v_n; RETURN NEXT;
  DELETE FROM public.audit_events WHERE (entity_type='global_patients' AND entity_id = ANY(k_gp_uuids)) OR (entity_type='patient_data_share' AND entity_id = ANY(k_share_uuids)) OR metadata->>'rls_test_v1'='true';
  DELETE FROM public.patient_data_shares WHERE id = ANY(k_share_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'patient_data_shares'; removed := v_n; RETURN NEXT;
  DELETE FROM public.patient_clinic_records WHERE global_patient_id = ANY(k_gp_uuids) OR clinic_id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'patient_clinic_records'; removed := v_n; RETURN NEXT;
  DELETE FROM public.patients WHERE id = ANY(k_user_uuids) OR clinic_id = ANY(k_clinic_uuids) OR global_patient_id = ANY(k_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'patients'; removed := v_n; RETURN NEXT;
  DELETE FROM public.global_patients WHERE id = ANY(k_gp_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'global_patients'; removed := v_n; RETURN NEXT;
  DELETE FROM public.clinic_memberships WHERE clinic_id = ANY(k_clinic_uuids) OR user_id = ANY(k_user_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'clinic_memberships'; removed := v_n; RETURN NEXT;
  DELETE FROM public.doctors WHERE id = ANY(k_user_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'doctors'; removed := v_n; RETURN NEXT;
  DELETE FROM public.users WHERE id = ANY(k_user_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'users'; removed := v_n; RETURN NEXT;
  DELETE FROM auth.users WHERE id = ANY(k_user_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'auth.users'; removed := v_n; RETURN NEXT;
  DELETE FROM public.clinics WHERE id = ANY(k_clinic_uuids);
  GET DIAGNOSTICS v_n = ROW_COUNT; entity := 'clinics'; removed := v_n; RETURN NEXT;
  RETURN;
END 
$function$;

-- function: shift_queue_numbers_up (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=454)
CREATE OR REPLACE FUNCTION public.shift_queue_numbers_up(p_doctor_id uuid, p_after_queue_number integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  v_today_start TIMESTAMPTZ;
BEGIN
  -- Cairo = UTC+2; use explicit offset for the day boundary
  v_today_start := (CURRENT_DATE::TEXT || 'T00:00:00+02:00')::TIMESTAMPTZ;

  UPDATE check_in_queue
  SET    queue_number = queue_number + 1
  WHERE  doctor_id    = p_doctor_id
    AND  queue_number > p_after_queue_number
    AND  status       = 'waiting'                -- only shift items still waiting
    AND  created_at  >= v_today_start;
END;

$function$;

-- function: tg_audit_pcr_insert (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=684)
CREATE OR REPLACE FUNCTION public.tg_audit_pcr_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

BEGIN
  INSERT INTO public.audit_events (
    action,
    actor_kind,
    actor_user_id,
    clinic_id,
    entity_type,
    entity_id,
    metadata,
    created_at
  ) VALUES (
    'PATIENT_CLINIC_RECORD_CREATED',
    'system',
    NULL,
    NEW.clinic_id,
    'patient_clinic_record',
    NEW.id,
    jsonb_build_object(
      'source', 'trigger_pcr_insert',
      'global_patient_id', NEW.global_patient_id,
      'clinic_id', NEW.clinic_id,
      'first_seen_at', NEW.first_seen_at,
      'last_seen_at', NEW.last_seen_at,
      'is_anonymous_to_global', NEW.is_anonymous_to_global,
      'consent_to_messaging', NEW.consent_to_messaging
    ),
    NOW()
  );
  RETURN NEW;
END;

$function$;

-- function: tg_derive_lab_results_global_refs (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=841)
CREATE OR REPLACE FUNCTION public.tg_derive_lab_results_global_refs()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

DECLARE v_parent_global UUID; v_parent_pcr UUID;
BEGIN
  IF NEW.lab_order_id IS NOT NULL THEN
    SELECT lo.global_patient_id, lo.patient_clinic_record_id INTO v_parent_global, v_parent_pcr
      FROM public.lab_orders lo WHERE lo.id = NEW.lab_order_id;
    IF NEW.global_patient_id IS NOT NULL AND NEW.global_patient_id <> v_parent_global THEN
      RAISE EXCEPTION 'compat shim (lab_results): inconsistent input';
    END IF;
    IF NEW.patient_clinic_record_id IS NOT NULL AND v_parent_pcr IS NOT NULL AND NEW.patient_clinic_record_id <> v_parent_pcr THEN
      RAISE EXCEPTION 'compat shim (lab_results): inconsistent input';
    END IF;
    NEW.global_patient_id := COALESCE(NEW.global_patient_id, v_parent_global);
    NEW.patient_clinic_record_id := COALESCE(NEW.patient_clinic_record_id, v_parent_pcr);
  END IF;
  RETURN NEW;
END;

$function$;

-- function: tg_derive_patient_global_refs (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=2210)
CREATE OR REPLACE FUNCTION public.tg_derive_patient_global_refs()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

DECLARE
  v_derived_global_id UUID;
  v_derived_pcr_id UUID;
  v_derived_patient_id UUID;
BEGIN
  IF NEW.patient_id IS NOT NULL THEN
    SELECT p.global_patient_id, pcr.id INTO v_derived_global_id, v_derived_pcr_id
      FROM public.patients p
      LEFT JOIN public.patient_clinic_records pcr
        ON pcr.global_patient_id = p.global_patient_id AND pcr.clinic_id = p.clinic_id
     WHERE p.id = NEW.patient_id;

    IF v_derived_global_id IS NULL THEN
      RAISE EXCEPTION 'compat shim (%): patient_id % does not resolve to a global_patient_id', TG_TABLE_NAME, NEW.patient_id;
    END IF;

    IF NEW.global_patient_id IS NOT NULL AND NEW.global_patient_id <> v_derived_global_id THEN
      RAISE EXCEPTION 'compat shim (%): inconsistent input — patient_id % derives global_patient_id %, but row carries %', TG_TABLE_NAME, NEW.patient_id, v_derived_global_id, NEW.global_patient_id;
    END IF;
    NEW.global_patient_id := v_derived_global_id;

    IF v_derived_pcr_id IS NOT NULL THEN
      IF NEW.patient_clinic_record_id IS NOT NULL AND NEW.patient_clinic_record_id <> v_derived_pcr_id THEN
        RAISE EXCEPTION 'compat shim (%): inconsistent input — patient_id % derives PCR %, but row carries %', TG_TABLE_NAME, NEW.patient_id, v_derived_pcr_id, NEW.patient_clinic_record_id;
      END IF;
      NEW.patient_clinic_record_id := v_derived_pcr_id;
    END IF;

  ELSIF NEW.global_patient_id IS NOT NULL AND NEW.clinic_id IS NOT NULL THEN
    SELECT p.id INTO v_derived_patient_id
      FROM public.patients p
     WHERE p.global_patient_id = NEW.global_patient_id AND p.clinic_id = NEW.clinic_id AND p.is_canonical = TRUE
     ORDER BY p.created_at ASC LIMIT 1;

    IF v_derived_patient_id IS NULL THEN
      RAISE EXCEPTION 'compat shim (%): global_patient_id % + clinic_id % does not resolve to a canonical patients row', TG_TABLE_NAME, NEW.global_patient_id, NEW.clinic_id;
    END IF;
    NEW.patient_id := v_derived_patient_id;

    IF NEW.patient_clinic_record_id IS NULL THEN
      SELECT id INTO NEW.patient_clinic_record_id FROM public.patient_clinic_records
       WHERE global_patient_id = NEW.global_patient_id AND clinic_id = NEW.clinic_id;
    END IF;
  END IF;

  RETURN NEW;
END;

$function$;

-- function: tg_derive_patient_phone_history_global_refs (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=598)
CREATE OR REPLACE FUNCTION public.tg_derive_patient_phone_history_global_refs()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

DECLARE v_derived_global UUID;
BEGIN
  IF NEW.patient_id IS NOT NULL THEN
    SELECT p.global_patient_id INTO v_derived_global FROM public.patients p WHERE p.id = NEW.patient_id;
    IF v_derived_global IS NULL THEN
      RAISE EXCEPTION 'compat shim (patient_phone_history): patient_id % does not resolve', NEW.patient_id;
    END IF;
    IF NEW.global_patient_id IS NOT NULL AND NEW.global_patient_id <> v_derived_global THEN
      RAISE EXCEPTION 'compat shim (patient_phone_history): inconsistent input';
    END IF;
    NEW.global_patient_id := v_derived_global;
  END IF;
  RETURN NEW;
END;

$function$;

-- function: touch_global_patients_updated_at (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=52)
CREATE OR REPLACE FUNCTION public.touch_global_patients_updated_at()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;

$function$;

-- function: touch_updated_at (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=52)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;

$function$;

-- function: update_bmi (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=78)
CREATE OR REPLACE FUNCTION public.update_bmi()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

BEGIN
  NEW.bmi := calculate_bmi(NEW.weight, NEW.height);
  RETURN NEW;
END;

$function$;

-- function: update_medication_intake_timestamp (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=52)
CREATE OR REPLACE FUNCTION public.update_medication_intake_timestamp()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;

$function$;

-- function: update_modified_at (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=53)
CREATE OR REPLACE FUNCTION public.update_modified_at()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

BEGIN
  NEW.modified_at = NOW();
  RETURN NEW;
END;

$function$;

-- function: update_patient_activity (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=112)
CREATE OR REPLACE FUNCTION public.update_patient_activity()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

BEGIN
  UPDATE public.patients 
  SET last_activity_at = NOW()
  WHERE id = NEW.patient_id;
  RETURN NEW;
END;

$function$;

-- function: update_patient_diary_timestamp (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=52)
CREATE OR REPLACE FUNCTION public.update_patient_diary_timestamp()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;

$function$;

-- function: update_updated_at_column (lang=plpgsql, SECURITY INVOKER, VOLATILE, body_length=52)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER VOLATILE
AS $function$

BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;

$function$;

-- function: user_has_clinic_path_to_gp (lang=sql, SECURITY DEFINER, STABLE, body_length=258)
CREATE OR REPLACE FUNCTION public.user_has_clinic_path_to_gp(p_global_patient_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $function$

  SELECT EXISTS (
    SELECT 1 FROM public.patient_clinic_records pcr
    JOIN public.clinic_memberships cm
      ON cm.clinic_id = pcr.clinic_id AND cm.user_id = p_user_id AND cm.status = 'ACTIVE'
    WHERE pcr.global_patient_id = p_global_patient_id
  );

$function$;

-- function: verify_privacy_code (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=5644)
CREATE OR REPLACE FUNCTION public.verify_privacy_code(p_phone text, p_code text, p_attempted_by_user_id uuid, p_attempted_by_clinic_id uuid, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_request_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  v_start TIMESTAMPTZ := clock_timestamp();
  v_min_ms CONSTANT INT := 50;
  v_normalized TEXT;
  v_gpid UUID;
  v_recent_failures INT;
  v_pc_id UUID;
  v_pc_hash TEXT;
  v_pc_attempts INT;
  v_pc_locked_until TIMESTAMPTZ;
  v_match BOOLEAN;
  v_new_attempts INT;
  v_failure_payload CONSTANT JSONB :=
    jsonb_build_object('success', FALSE, 'requires_code', TRUE);
BEGIN
  v_normalized := public.normalize_phone_e164(p_phone);

  IF v_normalized IS NULL THEN
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  SELECT id INTO v_gpid FROM public.global_patients WHERE normalized_phone = v_normalized LIMIT 1;
  IF v_gpid IS NULL THEN
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  SELECT COUNT(*) INTO v_recent_failures
    FROM public.privacy_code_attempts
   WHERE global_patient_id = v_gpid
     AND attempted_by_clinic_id = p_attempted_by_clinic_id
     AND created_at > NOW() - INTERVAL '1 hour'
     AND result IN ('failure','locked_out','rate_limited');

  IF v_recent_failures >= 5 THEN
    PERFORM public.record_privacy_code_attempt(
      v_gpid, NULL, p_attempted_by_user_id, p_attempted_by_clinic_id,
      'rate_limited', p_ip, p_user_agent, p_request_id);
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
    ) VALUES (
      p_attempted_by_clinic_id, p_attempted_by_user_id, 'user',
      'PRIVACY_CODE_ATTEMPT_FAILURE', 'global_patients', v_gpid,
      jsonb_build_object('reason','rate_limited','request_id',p_request_id));
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  SELECT id, code_hash, attempts_count, locked_until
    INTO v_pc_id, v_pc_hash, v_pc_attempts, v_pc_locked_until
    FROM public.patient_privacy_codes
   WHERE global_patient_id = v_gpid AND revoked_at IS NULL LIMIT 1;

  IF v_pc_id IS NULL THEN
    PERFORM public.record_privacy_code_attempt(
      v_gpid, NULL, p_attempted_by_user_id, p_attempted_by_clinic_id,
      'failure', p_ip, p_user_agent, p_request_id);
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  IF v_pc_locked_until IS NOT NULL AND v_pc_locked_until > NOW() THEN
    PERFORM public.record_privacy_code_attempt(
      v_gpid, v_pc_id, p_attempted_by_user_id, p_attempted_by_clinic_id,
      'locked_out', p_ip, p_user_agent, p_request_id);
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
    ) VALUES (
      p_attempted_by_clinic_id, p_attempted_by_user_id, 'user',
      'PRIVACY_CODE_ATTEMPT_FAILURE', 'global_patients', v_gpid,
      jsonb_build_object('reason','locked_out','request_id',p_request_id));
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  v_match := (crypt(p_code, v_pc_hash) = v_pc_hash);

  IF v_match THEN
    UPDATE public.patient_privacy_codes
       SET attempts_count = 0, last_attempt_at = NOW(), locked_until = NULL
     WHERE id = v_pc_id;
    PERFORM public.record_privacy_code_attempt(
      v_gpid, v_pc_id, p_attempted_by_user_id, p_attempted_by_clinic_id,
      'success', p_ip, p_user_agent, p_request_id);
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
    ) VALUES (
      p_attempted_by_clinic_id, p_attempted_by_user_id, 'user',
      'PRIVACY_CODE_ATTEMPT_SUCCESS', 'global_patients', v_gpid,
      jsonb_build_object('privacy_code_id',v_pc_id,'request_id',p_request_id));
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN jsonb_build_object('success', TRUE, 'global_patient_id', v_gpid);
  END IF;

  v_new_attempts := v_pc_attempts + 1;
  UPDATE public.patient_privacy_codes
     SET attempts_count = v_new_attempts, last_attempt_at = NOW(),
         locked_until = CASE WHEN v_new_attempts >= 5
                             THEN NOW() + INTERVAL '24 hours'
                             ELSE locked_until END
   WHERE id = v_pc_id;

  PERFORM public.record_privacy_code_attempt(
    v_gpid, v_pc_id, p_attempted_by_user_id, p_attempted_by_clinic_id,
    'failure', p_ip, p_user_agent, p_request_id);
  INSERT INTO public.audit_events (
    clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
  ) VALUES (
    p_attempted_by_clinic_id, p_attempted_by_user_id, 'user',
    'PRIVACY_CODE_ATTEMPT_FAILURE', 'global_patients', v_gpid,
    jsonb_build_object('reason','wrong_code','attempts_count',v_new_attempts,'request_id',p_request_id));

  IF v_new_attempts >= 5 THEN
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
    ) VALUES (
      p_attempted_by_clinic_id, NULL, 'system', 'PRIVACY_CODE_LOCKED',
      'global_patients', v_gpid,
      jsonb_build_object(
        'privacy_code_id',v_pc_id,
        'locked_until',(NOW() + INTERVAL '24 hours'),
        'attempts_count',v_new_attempts,
        'sms_dispatch_pending',TRUE));
  END IF;

  PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
  RETURN v_failure_payload;
END;

$function$;

-- function: verify_sms_code (lang=plpgsql, SECURITY DEFINER, VOLATILE, body_length=4260)
CREATE OR REPLACE FUNCTION public.verify_sms_code(p_phone text, p_code text, p_attempted_by_user_id uuid, p_attempted_by_clinic_id uuid, p_ip inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_request_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER VOLATILE
AS $function$

DECLARE
  v_start TIMESTAMPTZ := clock_timestamp();
  v_min_ms CONSTANT INT := 50;
  v_normalized TEXT;
  v_gpid UUID;
  v_token RECORD;
  v_match BOOLEAN;
  v_failure_payload CONSTANT JSONB := jsonb_build_object('success', FALSE, 'requires_code', TRUE);
BEGIN
  v_normalized := public.normalize_phone_e164(p_phone);
  IF v_normalized IS NULL THEN
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  SELECT id INTO v_gpid FROM public.global_patients WHERE normalized_phone = v_normalized LIMIT 1;
  IF v_gpid IS NULL THEN
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  SELECT id, sms_code_hash, expires_at, attempts_count INTO v_token
    FROM public.privacy_code_sms_tokens
   WHERE global_patient_id = v_gpid
     AND requesting_clinic_id = p_attempted_by_clinic_id
     AND used_at IS NULL AND expires_at > NOW()
   ORDER BY created_at DESC LIMIT 1;

  IF v_token.id IS NULL THEN
    PERFORM public.record_privacy_code_attempt(
      v_gpid, NULL, p_attempted_by_user_id, p_attempted_by_clinic_id,
      'failure', p_ip, p_user_agent, p_request_id);
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
    ) VALUES (
      p_attempted_by_clinic_id, p_attempted_by_user_id, 'user',
      'SMS_CODE_FAILED', 'global_patients', v_gpid,
      jsonb_build_object('reason','no_active_token','request_id',p_request_id));
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  IF v_token.attempts_count >= 5 THEN
    PERFORM public.record_privacy_code_attempt(
      v_gpid, NULL, p_attempted_by_user_id, p_attempted_by_clinic_id,
      'rate_limited', p_ip, p_user_agent, p_request_id);
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
    ) VALUES (
      p_attempted_by_clinic_id, p_attempted_by_user_id, 'user',
      'SMS_CODE_FAILED', 'global_patients', v_gpid,
      jsonb_build_object('reason','token_attempts_exhausted','sms_token_id',v_token.id,'request_id',p_request_id));
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN v_failure_payload;
  END IF;

  v_match := (crypt(p_code, v_token.sms_code_hash) = v_token.sms_code_hash);

  IF v_match THEN
    UPDATE public.privacy_code_sms_tokens
       SET used_at = NOW(), used_by_user_id = p_attempted_by_user_id,
           attempts_count = attempts_count + 1
     WHERE id = v_token.id;
    PERFORM public.record_privacy_code_attempt(
      v_gpid, NULL, p_attempted_by_user_id, p_attempted_by_clinic_id,
      'success', p_ip, p_user_agent, p_request_id);
    INSERT INTO public.audit_events (
      clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
    ) VALUES (
      p_attempted_by_clinic_id, p_attempted_by_user_id, 'user',
      'SMS_CODE_VERIFIED', 'global_patients', v_gpid,
      jsonb_build_object('sms_token_id',v_token.id,'request_id',p_request_id));
    PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
    RETURN jsonb_build_object('success', TRUE, 'global_patient_id', v_gpid);
  END IF;

  UPDATE public.privacy_code_sms_tokens
     SET attempts_count = attempts_count + 1
   WHERE id = v_token.id;

  PERFORM public.record_privacy_code_attempt(
    v_gpid, NULL, p_attempted_by_user_id, p_attempted_by_clinic_id,
    'failure', p_ip, p_user_agent, p_request_id);
  INSERT INTO public.audit_events (
    clinic_id, actor_user_id, actor_kind, action, entity_type, entity_id, metadata
  ) VALUES (
    p_attempted_by_clinic_id, p_attempted_by_user_id, 'user',
    'SMS_CODE_FAILED', 'global_patients', v_gpid,
    jsonb_build_object('reason','wrong_code','sms_token_id',v_token.id,'request_id',p_request_id));

  PERFORM pg_sleep(GREATEST(0, (v_min_ms - EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000) / 1000.0));
  RETURN v_failure_payload;
END;

$function$;

-- ====== END OF SCHEMA SNAPSHOT ===============================