-- ============================================================
-- Pre-Prompt-6 RLS snapshot — staging (mtmdotixlhwksyoordbl)
-- Captured: 2026-04-30 by cowork-session Phase A.1
--
-- CONTENTS: 166 policies across 58 tables in the public schema.
-- Source: pg_policies, server-side formatted via format() in 3 chunks.
--
-- USE: deterministic rollback artifact. To restore pre-Prompt-6
-- state: drop all current policies on the affected tables, then
-- run this file. Idempotent — uses DROP POLICY IF EXISTS.
-- ============================================================

-- Section 1: Enable RLS on every table that had a policy.
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymous_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_doctor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_in_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chronic_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_notes ENABLE ROW LEVEL SECURITY;
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


-- Section 2: CREATE POLICY statements (166 total, in tablename + policyname order)

-- Policy: "Users can create analytics events" on public.analytics_events (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Users can create analytics events" ON public.analytics_events;
CREATE POLICY "Users can create analytics events" ON public.analytics_events AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_id = auth.uid()));

-- Policy: "Doctors can manage anonymous visits" on public.anonymous_visits (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can manage anonymous visits" ON public.anonymous_visits;
CREATE POLICY "Doctors can manage anonymous visits" ON public.anonymous_visits AS PERMISSIVE FOR ALL TO public
  USING ((doctor_id = auth.uid()))
  WITH CHECK ((doctor_id = auth.uid()));

-- Policy: "Doctors see own anonymous visits" on public.anonymous_visits (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors see own anonymous visits" ON public.anonymous_visits;
CREATE POLICY "Doctors see own anonymous visits" ON public.anonymous_visits AS PERMISSIVE FOR ALL TO public
  USING ((doctor_id = auth.uid()));

-- Policy: "Clinic-scoped appointment access" on public.appointments (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Clinic-scoped appointment access" ON public.appointments;
CREATE POLICY "Clinic-scoped appointment access" ON public.appointments AS PERMISSIVE FOR SELECT TO public
  USING (((doctor_id = auth.uid()) OR (patient_id = auth.uid()) OR ((clinic_id IS NOT NULL) AND is_clinic_member(clinic_id, auth.uid()))));

-- Policy: "Doctors and front desk can create appointments" on public.appointments (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors and front desk can create appointments" ON public.appointments;
CREATE POLICY "Doctors and front desk can create appointments" ON public.appointments AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((doctor_id = auth.uid()) OR (doctor_id IN ( SELECT cm_doc.user_id
   FROM clinic_memberships cm_doc
  WHERE ((cm_doc.role = ANY (ARRAY['OWNER'::clinic_role, 'DOCTOR'::clinic_role])) AND (cm_doc.status = 'ACTIVE'::membership_status) AND (cm_doc.clinic_id IN ( SELECT clinic_memberships.clinic_id
           FROM clinic_memberships
          WHERE ((clinic_memberships.user_id = auth.uid()) AND (clinic_memberships.role = ANY (ARRAY['FRONT_DESK'::clinic_role, 'ASSISTANT'::clinic_role])) AND (clinic_memberships.status = 'ACTIVE'::membership_status)))))))));

-- Policy: "Doctors can read their appointments" on public.appointments (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can read their appointments" ON public.appointments;
CREATE POLICY "Doctors can read their appointments" ON public.appointments AS PERMISSIVE FOR SELECT TO public
  USING ((doctor_id IN ( SELECT doctors.id
   FROM doctors
  WHERE (doctors.id = auth.uid()))));

-- Policy: "Front desk can manage appointments" on public.appointments (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Front desk can manage appointments" ON public.appointments;
CREATE POLICY "Front desk can manage appointments" ON public.appointments AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'frontdesk'::text)))));

-- Policy: "Front desk can read clinic appointments" on public.appointments (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Front desk can read clinic appointments" ON public.appointments;
CREATE POLICY "Front desk can read clinic appointments" ON public.appointments AS PERMISSIVE FOR SELECT TO public
  USING ((doctor_id IN ( SELECT cm_doc.user_id
   FROM clinic_memberships cm_doc
  WHERE ((cm_doc.role = ANY (ARRAY['OWNER'::clinic_role, 'DOCTOR'::clinic_role])) AND (cm_doc.status = 'ACTIVE'::membership_status) AND (cm_doc.clinic_id IN ( SELECT clinic_memberships.clinic_id
           FROM clinic_memberships
          WHERE ((clinic_memberships.user_id = auth.uid()) AND (clinic_memberships.status = 'ACTIVE'::membership_status))))))));

-- Policy: "Front desk can view all appointments" on public.appointments (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Front desk can view all appointments" ON public.appointments;
CREATE POLICY "Front desk can view all appointments" ON public.appointments AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'frontdesk'::text)))));

-- Policy: clinic_members_view_assignments on public.assistant_doctor_assignments (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS clinic_members_view_assignments ON public.assistant_doctor_assignments;
CREATE POLICY clinic_members_view_assignments ON public.assistant_doctor_assignments AS PERMISSIVE FOR SELECT TO public
  USING ((clinic_id IN ( SELECT clinic_memberships.clinic_id
   FROM clinic_memberships
  WHERE ((clinic_memberships.user_id = auth.uid()) AND (clinic_memberships.status = 'ACTIVE'::membership_status)))));

-- Policy: owners_view_audit_events on public.audit_events (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS owners_view_audit_events ON public.audit_events;
CREATE POLICY owners_view_audit_events ON public.audit_events AS PERMISSIVE FOR SELECT TO public
  USING ((clinic_id IN ( SELECT clinic_memberships.clinic_id
   FROM clinic_memberships
  WHERE ((clinic_memberships.user_id = auth.uid()) AND (clinic_memberships.role = 'OWNER'::clinic_role) AND (clinic_memberships.status = 'ACTIVE'::membership_status)))));

-- Policy: service_role_audit_log on public.audit_log (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS service_role_audit_log ON public.audit_log;
CREATE POLICY service_role_audit_log ON public.audit_log AS PERMISSIVE FOR ALL TO public
  USING ((auth.role() = 'service_role'::text));

-- Policy: "Clinic-scoped queue access" on public.check_in_queue (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Clinic-scoped queue access" ON public.check_in_queue;
CREATE POLICY "Clinic-scoped queue access" ON public.check_in_queue AS PERMISSIVE FOR SELECT TO public
  USING (((doctor_id = auth.uid()) OR (patient_id = auth.uid()) OR ((clinic_id IS NOT NULL) AND is_clinic_member(clinic_id, auth.uid()))));

-- Policy: "Doctors can read their own queue" on public.check_in_queue (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can read their own queue" ON public.check_in_queue;
CREATE POLICY "Doctors can read their own queue" ON public.check_in_queue AS PERMISSIVE FOR SELECT TO public
  USING ((doctor_id = auth.uid()));

-- Policy: "Doctors can update their own queue" on public.check_in_queue (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can update their own queue" ON public.check_in_queue;
CREATE POLICY "Doctors can update their own queue" ON public.check_in_queue AS PERMISSIVE FOR UPDATE TO public
  USING ((doctor_id = auth.uid()))
  WITH CHECK ((doctor_id = auth.uid()));

-- Policy: "Front desk can manage queue" on public.check_in_queue (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Front desk can manage queue" ON public.check_in_queue;
CREATE POLICY "Front desk can manage queue" ON public.check_in_queue AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'frontdesk'::text)))));

-- Policy: "Frontdesk can manage queue for their clinic" on public.check_in_queue (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Frontdesk can manage queue for their clinic" ON public.check_in_queue;
CREATE POLICY "Frontdesk can manage queue for their clinic" ON public.check_in_queue AS PERMISSIVE FOR ALL TO public
  USING ((doctor_id IN ( SELECT cm_d.user_id
   FROM (clinic_memberships cm_fd
     JOIN clinic_memberships cm_d ON ((cm_d.clinic_id = cm_fd.clinic_id)))
  WHERE ((cm_fd.user_id = auth.uid()) AND (cm_fd.status = 'ACTIVE'::membership_status)))))
  WITH CHECK ((doctor_id IN ( SELECT cm_d.user_id
   FROM (clinic_memberships cm_fd
     JOIN clinic_memberships cm_d ON ((cm_d.clinic_id = cm_fd.clinic_id)))
  WHERE ((cm_fd.user_id = auth.uid()) AND (cm_fd.status = 'ACTIVE'::membership_status)))));

-- Policy: "Doctors view chronic conditions for treated patients" on public.chronic_conditions (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors view chronic conditions for treated patients" ON public.chronic_conditions;
CREATE POLICY "Doctors view chronic conditions for treated patients" ON public.chronic_conditions AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM clinical_notes cn
  WHERE ((cn.patient_id = chronic_conditions.patient_id) AND (cn.doctor_id = auth.uid())))));

-- Policy: "Patients manage own chronic conditions" on public.chronic_conditions (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients manage own chronic conditions" ON public.chronic_conditions;
CREATE POLICY "Patients manage own chronic conditions" ON public.chronic_conditions AS PERMISSIVE FOR ALL TO public
  USING ((patient_id = auth.uid()))
  WITH CHECK ((patient_id = auth.uid()));

-- Policy: "Members can view clinic memberships" on public.clinic_memberships (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Members can view clinic memberships" ON public.clinic_memberships;
CREATE POLICY "Members can view clinic memberships" ON public.clinic_memberships AS PERMISSIVE FOR SELECT TO public
  USING (is_clinic_member(clinic_id, auth.uid()));

-- Policy: "Owners can manage memberships" on public.clinic_memberships (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Owners can manage memberships" ON public.clinic_memberships;
CREATE POLICY "Owners can manage memberships" ON public.clinic_memberships AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((EXISTS ( SELECT 1
   FROM clinic_memberships cm
  WHERE ((cm.clinic_id = clinic_memberships.clinic_id) AND (cm.user_id = auth.uid()) AND (cm.role = 'OWNER'::clinic_role) AND (cm.status = 'ACTIVE'::membership_status)))) OR (NOT (EXISTS ( SELECT 1
   FROM clinic_memberships cm
  WHERE (cm.clinic_id = clinic_memberships.clinic_id))))));

-- Policy: "Owners can update memberships" on public.clinic_memberships (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Owners can update memberships" ON public.clinic_memberships;
CREATE POLICY "Owners can update memberships" ON public.clinic_memberships AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM clinic_memberships cm
  WHERE ((cm.clinic_id = clinic_memberships.clinic_id) AND (cm.user_id = auth.uid()) AND (cm.role = 'OWNER'::clinic_role) AND (cm.status = 'ACTIVE'::membership_status)))));

-- Policy: "Clinic-scoped note access" on public.clinical_notes (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Clinic-scoped note access" ON public.clinical_notes;
CREATE POLICY "Clinic-scoped note access" ON public.clinical_notes AS PERMISSIVE FOR SELECT TO public
  USING (((doctor_id = auth.uid()) OR ((patient_id = auth.uid()) AND (COALESCE(synced_to_patient, false) = true)) OR ((clinic_id IS NOT NULL) AND can_access_patient(clinic_id, patient_id, auth.uid(), 'READ'::text))));

-- Policy: "Doctors can create clinical notes" on public.clinical_notes (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can create clinical notes" ON public.clinical_notes;
CREATE POLICY "Doctors can create clinical notes" ON public.clinical_notes AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((doctor_id = auth.uid()));

-- Policy: "Doctors can insert notes in their clinic" on public.clinical_notes (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can insert notes in their clinic" ON public.clinical_notes;
CREATE POLICY "Doctors can insert notes in their clinic" ON public.clinical_notes AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((doctor_id = auth.uid()) AND ((clinic_id IS NULL) OR is_clinic_member(clinic_id, auth.uid()))));

-- Policy: "Doctors can read own clinical notes" on public.clinical_notes (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can read own clinical notes" ON public.clinical_notes;
CREATE POLICY "Doctors can read own clinical notes" ON public.clinical_notes AS PERMISSIVE FOR SELECT TO public
  USING ((doctor_id = auth.uid()));

-- Policy: "Doctors can update own clinical notes" on public.clinical_notes (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can update own clinical notes" ON public.clinical_notes;
CREATE POLICY "Doctors can update own clinical notes" ON public.clinical_notes AS PERMISSIVE FOR UPDATE TO public
  USING ((doctor_id = auth.uid()));

-- Policy: "Patients can read their clinical notes" on public.clinical_notes (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can read their clinical notes" ON public.clinical_notes;
CREATE POLICY "Patients can read their clinical notes" ON public.clinical_notes AS PERMISSIVE FOR SELECT TO public
  USING (((patient_id = auth.uid()) AND (synced_to_patient = true)));

-- Policy: "Clinic-scoped conversation access" on public.conversations (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Clinic-scoped conversation access" ON public.conversations;
CREATE POLICY "Clinic-scoped conversation access" ON public.conversations AS PERMISSIVE FOR SELECT TO public
  USING (((patient_id = auth.uid()) OR (doctor_id = auth.uid()) OR ((clinic_id IS NOT NULL) AND is_clinic_member(clinic_id, auth.uid()))));

-- Policy: "Create conversation after appointment" on public.conversations (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Create conversation after appointment" ON public.conversations;
CREATE POLICY "Create conversation after appointment" ON public.conversations AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((created_from_appointment_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM appointments a
  WHERE ((a.id = conversations.created_from_appointment_id) AND ((a.patient_id = auth.uid()) OR (a.doctor_id = auth.uid())))))));

-- Policy: "Create conversation after visit" on public.conversations (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Create conversation after visit" ON public.conversations;
CREATE POLICY "Create conversation after visit" ON public.conversations AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((created_from_appointment_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM appointments v
  WHERE ((v.id = conversations.created_from_appointment_id) AND (v.status = 'completed'::text) AND (v.doctor_id = conversations.doctor_id) AND (v.patient_id = conversations.patient_id)))) AND can_open_messaging_conversation(doctor_id, patient_id) AND ((doctor_id = auth.uid()) OR (patient_id = auth.uid()))));

-- Policy: "Doctors can update conversation status" on public.conversations (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can update conversation status" ON public.conversations;
CREATE POLICY "Doctors can update conversation status" ON public.conversations AS PERMISSIVE FOR UPDATE TO public
  USING ((doctor_id = auth.uid()));

-- Policy: "Doctors can view their conversations" on public.conversations (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can view their conversations" ON public.conversations;
CREATE POLICY "Doctors can view their conversations" ON public.conversations AS PERMISSIVE FOR SELECT TO public
  USING ((doctor_id = auth.uid()));

-- Policy: "Participants can update conversation counters" on public.conversations (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Participants can update conversation counters" ON public.conversations;
CREATE POLICY "Participants can update conversation counters" ON public.conversations AS PERMISSIVE FOR UPDATE TO public
  USING (((doctor_id = auth.uid()) OR (patient_id = auth.uid())))
  WITH CHECK (((doctor_id = auth.uid()) OR (patient_id = auth.uid())));

-- Policy: "Patients can view their conversations" on public.conversations (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can view their conversations" ON public.conversations;
CREATE POLICY "Patients can view their conversations" ON public.conversations AS PERMISSIVE FOR SELECT TO public
  USING ((patient_id = auth.uid()));

-- Policy: "Patients can manage default sharing" on public.default_sharing_preferences (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can manage default sharing" ON public.default_sharing_preferences;
CREATE POLICY "Patients can manage default sharing" ON public.default_sharing_preferences AS PERMISSIVE FOR ALL TO public
  USING ((patient_id = auth.uid()));

-- Policy: "Doctors can delete their own availability" on public.doctor_availability (cmd=DELETE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can delete their own availability" ON public.doctor_availability;
CREATE POLICY "Doctors can delete their own availability" ON public.doctor_availability AS PERMISSIVE FOR DELETE TO authenticated
  USING ((doctor_id = auth.uid()));

-- Policy: "Doctors can insert their availability" on public.doctor_availability (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can insert their availability" ON public.doctor_availability;
CREATE POLICY "Doctors can insert their availability" ON public.doctor_availability AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((doctor_id = auth.uid()));

-- Policy: "Doctors can insert their own availability" on public.doctor_availability (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can insert their own availability" ON public.doctor_availability;
CREATE POLICY "Doctors can insert their own availability" ON public.doctor_availability AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((doctor_id = auth.uid()));

-- Policy: "Doctors can update their availability" on public.doctor_availability (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can update their availability" ON public.doctor_availability;
CREATE POLICY "Doctors can update their availability" ON public.doctor_availability AS PERMISSIVE FOR UPDATE TO public
  USING ((doctor_id = auth.uid()));

-- Policy: "Doctors can update their own availability" on public.doctor_availability (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can update their own availability" ON public.doctor_availability;
CREATE POLICY "Doctors can update their own availability" ON public.doctor_availability AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((doctor_id = auth.uid()))
  WITH CHECK ((doctor_id = auth.uid()));

-- Policy: "Doctors can view their availability" on public.doctor_availability (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can view their availability" ON public.doctor_availability;
CREATE POLICY "Doctors can view their availability" ON public.doctor_availability AS PERMISSIVE FOR SELECT TO public
  USING ((doctor_id = auth.uid()));

-- Policy: "Doctors can view their own availability" on public.doctor_availability (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can view their own availability" ON public.doctor_availability;
CREATE POLICY "Doctors can view their own availability" ON public.doctor_availability AS PERMISSIVE FOR SELECT TO authenticated
  USING ((doctor_id = auth.uid()));

-- Policy: "Frontdesk can view doctor availability" on public.doctor_availability (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Frontdesk can view doctor availability" ON public.doctor_availability;
CREATE POLICY "Frontdesk can view doctor availability" ON public.doctor_availability AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'frontdesk'::text)))));

-- Policy: "Patients can view doctor availability" on public.doctor_availability (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can view doctor availability" ON public.doctor_availability;
CREATE POLICY "Patients can view doctor availability" ON public.doctor_availability AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'patient'::text)))));

-- Policy: "Doctors can create relationships" on public.doctor_patient_relationships (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can create relationships" ON public.doctor_patient_relationships;
CREATE POLICY "Doctors can create relationships" ON public.doctor_patient_relationships AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((doctor_id = auth.uid()));

-- Policy: "Doctors can update their relationships" on public.doctor_patient_relationships (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can update their relationships" ON public.doctor_patient_relationships;
CREATE POLICY "Doctors can update their relationships" ON public.doctor_patient_relationships AS PERMISSIVE FOR UPDATE TO public
  USING ((doctor_id = auth.uid()));

-- Policy: "Doctors can view their patient relationships" on public.doctor_patient_relationships (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can view their patient relationships" ON public.doctor_patient_relationships;
CREATE POLICY "Doctors can view their patient relationships" ON public.doctor_patient_relationships AS PERMISSIVE FOR SELECT TO public
  USING ((doctor_id = auth.uid()));

-- Policy: "Patients can view their doctor relationships" on public.doctor_patient_relationships (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can view their doctor relationships" ON public.doctor_patient_relationships;
CREATE POLICY "Patients can view their doctor relationships" ON public.doctor_patient_relationships AS PERMISSIVE FOR SELECT TO public
  USING ((patient_id = auth.uid()));

-- Policy: "Doctors can manage their saved templates" on public.doctor_templates (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can manage their saved templates" ON public.doctor_templates;
CREATE POLICY "Doctors can manage their saved templates" ON public.doctor_templates AS PERMISSIVE FOR ALL TO public
  USING ((doctor_id = auth.uid()));

-- Policy: "Doctors can insert own record during registration" on public.doctors (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can insert own record during registration" ON public.doctors;
CREATE POLICY "Doctors can insert own record during registration" ON public.doctors AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = id));

-- Policy: "Doctors can read own profile" on public.doctors (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can read own profile" ON public.doctors;
CREATE POLICY "Doctors can read own profile" ON public.doctors AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = id));

-- Policy: "Doctors can update own profile" on public.doctors (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can update own profile" ON public.doctors;
CREATE POLICY "Doctors can update own profile" ON public.doctors AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = id));

-- Policy: "Clinic members can view frontdesk staff in same clinic" on public.front_desk_staff (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Clinic members can view frontdesk staff in same clinic" ON public.front_desk_staff;
CREATE POLICY "Clinic members can view frontdesk staff in same clinic" ON public.front_desk_staff AS PERMISSIVE FOR SELECT TO public
  USING ((id IN ( SELECT cm_target.user_id
   FROM clinic_memberships cm_target
  WHERE ((cm_target.role = ANY (ARRAY['FRONT_DESK'::clinic_role, 'ASSISTANT'::clinic_role])) AND (cm_target.status = 'ACTIVE'::membership_status) AND (cm_target.clinic_id IN ( SELECT clinic_memberships.clinic_id
           FROM clinic_memberships
          WHERE ((clinic_memberships.user_id = auth.uid()) AND (clinic_memberships.status = 'ACTIVE'::membership_status))))))));

-- Policy: "Front desk staff can read own record" on public.front_desk_staff (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Front desk staff can read own record" ON public.front_desk_staff;
CREATE POLICY "Front desk staff can read own record" ON public.front_desk_staff AS PERMISSIVE FOR SELECT TO public
  USING ((id = auth.uid()));

-- Policy: "Front desk staff can update own record" on public.front_desk_staff (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Front desk staff can update own record" ON public.front_desk_staff;
CREATE POLICY "Front desk staff can update own record" ON public.front_desk_staff AS PERMISSIVE FOR UPDATE TO public
  USING ((id = auth.uid()))
  WITH CHECK ((id = auth.uid()));

-- Policy: global_patients_deny_all on public.global_patients (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS global_patients_deny_all ON public.global_patients;
CREATE POLICY global_patients_deny_all ON public.global_patients AS PERMISSIVE FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- Policy: "Clinic-scoped imaging order access" on public.imaging_orders (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Clinic-scoped imaging order access" ON public.imaging_orders;
CREATE POLICY "Clinic-scoped imaging order access" ON public.imaging_orders AS PERMISSIVE FOR SELECT TO public
  USING (((doctor_id = auth.uid()) OR (patient_id = auth.uid()) OR ((clinic_id IS NOT NULL) AND can_access_patient(clinic_id, patient_id, auth.uid(), 'READ'::text))));

-- Policy: "Doctors manage their imaging orders" on public.imaging_orders (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors manage their imaging orders" ON public.imaging_orders;
CREATE POLICY "Doctors manage their imaging orders" ON public.imaging_orders AS PERMISSIVE FOR ALL TO public
  USING ((doctor_id = auth.uid()))
  WITH CHECK ((doctor_id = auth.uid()));

-- Policy: "Patients view own imaging orders" on public.imaging_orders (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients view own imaging orders" ON public.imaging_orders;
CREATE POLICY "Patients view own imaging orders" ON public.imaging_orders AS PERMISSIVE FOR SELECT TO public
  USING ((patient_id = auth.uid()));

-- Policy: "Doctors view immunizations for treated patients" on public.immunizations (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors view immunizations for treated patients" ON public.immunizations;
CREATE POLICY "Doctors view immunizations for treated patients" ON public.immunizations AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM clinical_notes cn
  WHERE ((cn.patient_id = immunizations.patient_id) AND (cn.doctor_id = auth.uid())))));

-- Policy: "Patients manage own immunizations" on public.immunizations (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients manage own immunizations" ON public.immunizations;
CREATE POLICY "Patients manage own immunizations" ON public.immunizations AS PERMISSIVE FOR ALL TO public
  USING ((patient_id = auth.uid()))
  WITH CHECK ((patient_id = auth.uid()));

-- Policy: doctor_invoice_requests_read on public.invoice_requests (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS doctor_invoice_requests_read ON public.invoice_requests;
CREATE POLICY doctor_invoice_requests_read ON public.invoice_requests AS PERMISSIVE FOR SELECT TO public
  USING ((clinic_id IN ( SELECT clinic_memberships.clinic_id
   FROM clinic_memberships
  WHERE ((clinic_memberships.user_id = auth.uid()) AND (clinic_memberships.role = ANY (ARRAY['OWNER'::clinic_role, 'DOCTOR'::clinic_role])) AND (clinic_memberships.status = 'ACTIVE'::membership_status)))));

-- Policy: frontdesk_invoice_requests on public.invoice_requests (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS frontdesk_invoice_requests ON public.invoice_requests;
CREATE POLICY frontdesk_invoice_requests ON public.invoice_requests AS PERMISSIVE FOR ALL TO public
  USING ((clinic_id IN ( SELECT clinic_memberships.clinic_id
   FROM clinic_memberships
  WHERE ((clinic_memberships.user_id = auth.uid()) AND (clinic_memberships.role = ANY (ARRAY['FRONT_DESK'::clinic_role, 'ASSISTANT'::clinic_role])) AND (clinic_memberships.status = 'ACTIVE'::membership_status)))));

-- Policy: "Clinic-scoped lab order access" on public.lab_orders (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Clinic-scoped lab order access" ON public.lab_orders;
CREATE POLICY "Clinic-scoped lab order access" ON public.lab_orders AS PERMISSIVE FOR SELECT TO public
  USING (((doctor_id = auth.uid()) OR (patient_id = auth.uid()) OR ((clinic_id IS NOT NULL) AND can_access_patient(clinic_id, patient_id, auth.uid(), 'READ'::text))));

-- Policy: "Doctors can create lab orders" on public.lab_orders (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can create lab orders" ON public.lab_orders;
CREATE POLICY "Doctors can create lab orders" ON public.lab_orders AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((doctor_id = auth.uid()));

-- Policy: "Doctors can view their lab orders" on public.lab_orders (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can view their lab orders" ON public.lab_orders;
CREATE POLICY "Doctors can view their lab orders" ON public.lab_orders AS PERMISSIVE FOR SELECT TO public
  USING ((doctor_id = auth.uid()));

-- Policy: "Patients can view own lab orders" on public.lab_orders (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can view own lab orders" ON public.lab_orders;
CREATE POLICY "Patients can view own lab orders" ON public.lab_orders AS PERMISSIVE FOR SELECT TO public
  USING ((patient_id = auth.uid()));

-- Policy: "Clinic-scoped lab results access" on public.lab_results (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Clinic-scoped lab results access" ON public.lab_results;
CREATE POLICY "Clinic-scoped lab results access" ON public.lab_results AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM lab_orders lo
  WHERE ((lo.id = lab_results.lab_order_id) AND ((lo.doctor_id = auth.uid()) OR (lo.patient_id = auth.uid()) OR ((lo.clinic_id IS NOT NULL) AND can_access_patient(lo.clinic_id, lo.patient_id, auth.uid(), 'READ'::text)))))));

-- Policy: "View lab results" on public.lab_results (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "View lab results" ON public.lab_results;
CREATE POLICY "View lab results" ON public.lab_results AS PERMISSIVE FOR SELECT TO public
  USING ((lab_order_id IN ( SELECT lab_orders.id
   FROM lab_orders
  WHERE ((lab_orders.doctor_id = auth.uid()) OR (lab_orders.patient_id = auth.uid())))));

-- Policy: "Anyone can view lab test catalog" on public.lab_tests (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Anyone can view lab test catalog" ON public.lab_tests;
CREATE POLICY "Anyone can view lab test catalog" ON public.lab_tests AS PERMISSIVE FOR SELECT TO public
  USING (true);

-- Policy: "Doctors can view patient adherence" on public.medication_adherence_log (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can view patient adherence" ON public.medication_adherence_log;
CREATE POLICY "Doctors can view patient adherence" ON public.medication_adherence_log AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM doctor_patient_relationships dpr
  WHERE ((dpr.patient_id = medication_adherence_log.patient_id) AND (dpr.doctor_id = auth.uid()) AND (dpr.status = 'active'::text)))));

-- Policy: "Patients can manage their adherence log" on public.medication_adherence_log (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can manage their adherence log" ON public.medication_adherence_log;
CREATE POLICY "Patients can manage their adherence log" ON public.medication_adherence_log AS PERMISSIVE FOR ALL TO public
  USING ((patient_id = auth.uid()));

-- Policy: "Patients can read their medication reminders" on public.medication_reminders (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can read their medication reminders" ON public.medication_reminders;
CREATE POLICY "Patients can read their medication reminders" ON public.medication_reminders AS PERMISSIVE FOR SELECT TO public
  USING ((patient_id = auth.uid()));

-- Policy: "Patients can update their medication reminders" on public.medication_reminders (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can update their medication reminders" ON public.medication_reminders;
CREATE POLICY "Patients can update their medication reminders" ON public.medication_reminders AS PERMISSIVE FOR UPDATE TO public
  USING ((patient_id = auth.uid()));

-- Policy: "Clinic-scoped message access" on public.messages (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Clinic-scoped message access" ON public.messages;
CREATE POLICY "Clinic-scoped message access" ON public.messages AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.patient_id = auth.uid()) OR (c.doctor_id = auth.uid()) OR ((c.clinic_id IS NOT NULL) AND is_clinic_member(c.clinic_id, auth.uid())))))));

-- Policy: "Participants can send messages" on public.messages (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
CREATE POLICY "Participants can send messages" ON public.messages AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND (c.status = 'active'::text) AND ((c.patient_id = auth.uid()) OR (c.doctor_id = auth.uid()))))));

-- Policy: "Participants can update message read state" on public.messages (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Participants can update message read state" ON public.messages;
CREATE POLICY "Participants can update message read state" ON public.messages AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.patient_id = auth.uid()) OR (c.doctor_id = auth.uid()))))));

-- Policy: "Participants can view messages" on public.messages (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
CREATE POLICY "Participants can view messages" ON public.messages AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.patient_id = auth.uid()) OR (c.doctor_id = auth.uid()))))));

-- Policy: users_view_own_notifications on public.notifications (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS users_view_own_notifications ON public.notifications;
CREATE POLICY users_view_own_notifications ON public.notifications AS PERMISSIVE FOR ALL TO public
  USING ((recipient_id = auth.uid()));

-- Policy: "Doctors can manage opt out stats" on public.opt_out_statistics (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can manage opt out stats" ON public.opt_out_statistics;
CREATE POLICY "Doctors can manage opt out stats" ON public.opt_out_statistics AS PERMISSIVE FOR ALL TO public
  USING ((doctor_id = auth.uid()))
  WITH CHECK ((doctor_id = auth.uid()));

-- Policy: "Doctors see own opt out stats" on public.opt_out_statistics (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors see own opt out stats" ON public.opt_out_statistics;
CREATE POLICY "Doctors see own opt out stats" ON public.opt_out_statistics AS PERMISSIVE FOR ALL TO public
  USING ((doctor_id = auth.uid()));

-- Policy: "Users can view own phone-based otp" on public.otp_codes (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Users can view own phone-based otp" ON public.otp_codes;
CREATE POLICY "Users can view own phone-based otp" ON public.otp_codes AS PERMISSIVE FOR SELECT TO public
  USING ((phone IN ( SELECT u.phone
   FROM users u
  WHERE (u.id = auth.uid()))));

-- Policy: "Doctors view allergies for treated patients" on public.patient_allergies (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors view allergies for treated patients" ON public.patient_allergies;
CREATE POLICY "Doctors view allergies for treated patients" ON public.patient_allergies AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM clinical_notes cn
  WHERE ((cn.patient_id = patient_allergies.patient_id) AND (cn.doctor_id = auth.uid())))));

-- Policy: "Patients manage own allergies" on public.patient_allergies (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients manage own allergies" ON public.patient_allergies;
CREATE POLICY "Patients manage own allergies" ON public.patient_allergies AS PERMISSIVE FOR ALL TO public
  USING ((patient_id = auth.uid()))
  WITH CHECK ((patient_id = auth.uid()));

-- Policy: patient_clinic_records_deny_all on public.patient_clinic_records (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS patient_clinic_records_deny_all ON public.patient_clinic_records;
CREATE POLICY patient_clinic_records_deny_all ON public.patient_clinic_records AS PERMISSIVE FOR ALL TO public
  USING (false)
  WITH CHECK (false);

-- Policy: "Participants can read consent grants" on public.patient_consent_grants (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Participants can read consent grants" ON public.patient_consent_grants;
CREATE POLICY "Participants can read consent grants" ON public.patient_consent_grants AS PERMISSIVE FOR SELECT TO public
  USING (((doctor_id = auth.uid()) OR (patient_id = auth.uid())));

-- Policy: "Patients can manage consent grants" on public.patient_consent_grants (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can manage consent grants" ON public.patient_consent_grants;
CREATE POLICY "Patients can manage consent grants" ON public.patient_consent_grants AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((patient_id = auth.uid()));

-- Policy: "Patients can revoke consent grants" on public.patient_consent_grants (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can revoke consent grants" ON public.patient_consent_grants;
CREATE POLICY "Patients can revoke consent grants" ON public.patient_consent_grants AS PERMISSIVE FOR UPDATE TO public
  USING ((patient_id = auth.uid()))
  WITH CHECK ((patient_id = auth.uid()));

-- Policy: patient_data_shares_no_delete on public.patient_data_shares (cmd=DELETE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS patient_data_shares_no_delete ON public.patient_data_shares;
CREATE POLICY patient_data_shares_no_delete ON public.patient_data_shares AS PERMISSIVE FOR DELETE TO public
  USING (false);

-- Policy: patient_data_shares_no_insert on public.patient_data_shares (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS patient_data_shares_no_insert ON public.patient_data_shares;
CREATE POLICY patient_data_shares_no_insert ON public.patient_data_shares AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (false);

-- Policy: patient_data_shares_no_select on public.patient_data_shares (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS patient_data_shares_no_select ON public.patient_data_shares;
CREATE POLICY patient_data_shares_no_select ON public.patient_data_shares AS PERMISSIVE FOR SELECT TO public
  USING (false);

-- Policy: patient_data_shares_no_update on public.patient_data_shares (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS patient_data_shares_no_update ON public.patient_data_shares;
CREATE POLICY patient_data_shares_no_update ON public.patient_data_shares AS PERMISSIVE FOR UPDATE TO public
  USING (false)
  WITH CHECK (false);

-- Policy: "Doctors can view shared patient diary" on public.patient_diary (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can view shared patient diary" ON public.patient_diary;
CREATE POLICY "Doctors can view shared patient diary" ON public.patient_diary AS PERMISSIVE FOR SELECT TO public
  USING (((is_shared = true) AND (EXISTS ( SELECT 1
   FROM doctor_patient_relationships dpr
  WHERE ((dpr.patient_id = patient_diary.patient_id) AND (dpr.doctor_id = auth.uid()) AND (dpr.status = 'active'::text))))));

-- Policy: "Patients can manage their diary" on public.patient_diary (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can manage their diary" ON public.patient_diary;
CREATE POLICY "Patients can manage their diary" ON public.patient_diary AS PERMISSIVE FOR ALL TO public
  USING ((patient_id = auth.uid()));

-- Policy: "Doctors can view patient health metrics" on public.patient_health_metrics (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can view patient health metrics" ON public.patient_health_metrics;
CREATE POLICY "Doctors can view patient health metrics" ON public.patient_health_metrics AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM doctor_patient_relationships dpr
  WHERE ((dpr.patient_id = patient_health_metrics.patient_id) AND (dpr.doctor_id = auth.uid()) AND (dpr.status = 'active'::text)))));

-- Policy: "Patients can manage their health metrics" on public.patient_health_metrics (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can manage their health metrics" ON public.patient_health_metrics;
CREATE POLICY "Patients can manage their health metrics" ON public.patient_health_metrics AS PERMISSIVE FOR ALL TO public
  USING ((patient_id = auth.uid()));

-- Policy: "Doctors can view patient medical records" on public.patient_medical_records (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can view patient medical records" ON public.patient_medical_records;
CREATE POLICY "Doctors can view patient medical records" ON public.patient_medical_records AS PERMISSIVE FOR SELECT TO public
  USING ((patient_id IN ( SELECT clinical_notes.patient_id
   FROM clinical_notes
  WHERE (clinical_notes.doctor_id = auth.uid()))));

-- Policy: "Patients can create own medical records" on public.patient_medical_records (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can create own medical records" ON public.patient_medical_records;
CREATE POLICY "Patients can create own medical records" ON public.patient_medical_records AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((patient_id = auth.uid()));

-- Policy: "Patients can delete own medical records" on public.patient_medical_records (cmd=DELETE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can delete own medical records" ON public.patient_medical_records;
CREATE POLICY "Patients can delete own medical records" ON public.patient_medical_records AS PERMISSIVE FOR DELETE TO public
  USING ((patient_id = auth.uid()));

-- Policy: "Patients can update own medical records" on public.patient_medical_records (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can update own medical records" ON public.patient_medical_records;
CREATE POLICY "Patients can update own medical records" ON public.patient_medical_records AS PERMISSIVE FOR UPDATE TO public
  USING ((patient_id = auth.uid()))
  WITH CHECK ((patient_id = auth.uid()));

-- Policy: "Patients can view own medical records" on public.patient_medical_records (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can view own medical records" ON public.patient_medical_records;
CREATE POLICY "Patients can view own medical records" ON public.patient_medical_records AS PERMISSIVE FOR SELECT TO public
  USING ((patient_id = auth.uid()));

-- Policy: doctors_read_intake on public.patient_medication_intake (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS doctors_read_intake ON public.patient_medication_intake;
CREATE POLICY doctors_read_intake ON public.patient_medication_intake AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM doctors
  WHERE (doctors.id = auth.uid()))));

-- Policy: patients_own_intake_delete on public.patient_medication_intake (cmd=DELETE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS patients_own_intake_delete ON public.patient_medication_intake;
CREATE POLICY patients_own_intake_delete ON public.patient_medication_intake AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = patient_id));

-- Policy: patients_own_intake_insert on public.patient_medication_intake (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS patients_own_intake_insert ON public.patient_medication_intake;
CREATE POLICY patients_own_intake_insert ON public.patient_medication_intake AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = patient_id));

-- Policy: patients_own_intake_select on public.patient_medication_intake (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS patients_own_intake_select ON public.patient_medication_intake;
CREATE POLICY patients_own_intake_select ON public.patient_medication_intake AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = patient_id));

-- Policy: patients_own_intake_update on public.patient_medication_intake (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS patients_own_intake_update ON public.patient_medication_intake;
CREATE POLICY patients_own_intake_update ON public.patient_medication_intake AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = patient_id));

-- Policy: "Doctors can view patient medications" on public.patient_medications (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can view patient medications" ON public.patient_medications;
CREATE POLICY "Doctors can view patient medications" ON public.patient_medications AS PERMISSIVE FOR SELECT TO public
  USING ((patient_id IN ( SELECT clinical_notes.patient_id
   FROM clinical_notes
  WHERE (clinical_notes.doctor_id = auth.uid()))));

-- Policy: "Patients can create own medications" on public.patient_medications (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can create own medications" ON public.patient_medications;
CREATE POLICY "Patients can create own medications" ON public.patient_medications AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((patient_id = auth.uid()));

-- Policy: "Patients can delete own medications" on public.patient_medications (cmd=DELETE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can delete own medications" ON public.patient_medications;
CREATE POLICY "Patients can delete own medications" ON public.patient_medications AS PERMISSIVE FOR DELETE TO public
  USING ((patient_id = auth.uid()));

-- Policy: "Patients can update own medications" on public.patient_medications (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can update own medications" ON public.patient_medications;
CREATE POLICY "Patients can update own medications" ON public.patient_medications AS PERMISSIVE FOR UPDATE TO public
  USING ((patient_id = auth.uid()))
  WITH CHECK ((patient_id = auth.uid()));

-- Policy: "Patients can view own medications" on public.patient_medications (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can view own medications" ON public.patient_medications;
CREATE POLICY "Patients can view own medications" ON public.patient_medications AS PERMISSIVE FOR SELECT TO public
  USING ((patient_id = auth.uid()));

-- Policy: "Doctors can view patient phone history" on public.patient_phone_history (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can view patient phone history" ON public.patient_phone_history;
CREATE POLICY "Doctors can view patient phone history" ON public.patient_phone_history AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'doctor'::text)))));

-- Policy: "Patients can view own phone history" on public.patient_phone_history (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can view own phone history" ON public.patient_phone_history;
CREATE POLICY "Patients can view own phone history" ON public.patient_phone_history AS PERMISSIVE FOR SELECT TO public
  USING ((patient_id = auth.uid()));

-- Policy: "Patients can view phone history" on public.patient_phone_history (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can view phone history" ON public.patient_phone_history;
CREATE POLICY "Patients can view phone history" ON public.patient_phone_history AS PERMISSIVE FOR SELECT TO public
  USING ((patient_id = auth.uid()));

-- Policy: "Staff can view phone verification issues" on public.patient_phone_verification_issues (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Staff can view phone verification issues" ON public.patient_phone_verification_issues;
CREATE POLICY "Staff can view phone verification issues" ON public.patient_phone_verification_issues AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['doctor'::text, 'frontdesk'::text]))))));

-- Policy: patient_privacy_codes_no_delete on public.patient_privacy_codes (cmd=DELETE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS patient_privacy_codes_no_delete ON public.patient_privacy_codes;
CREATE POLICY patient_privacy_codes_no_delete ON public.patient_privacy_codes AS PERMISSIVE FOR DELETE TO authenticated
  USING (false);

-- Policy: patient_privacy_codes_no_insert on public.patient_privacy_codes (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS patient_privacy_codes_no_insert ON public.patient_privacy_codes;
CREATE POLICY patient_privacy_codes_no_insert ON public.patient_privacy_codes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (false);

-- Policy: patient_privacy_codes_no_select on public.patient_privacy_codes (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS patient_privacy_codes_no_select ON public.patient_privacy_codes;
CREATE POLICY patient_privacy_codes_no_select ON public.patient_privacy_codes AS PERMISSIVE FOR SELECT TO authenticated
  USING (false);

-- Policy: patient_privacy_codes_no_update on public.patient_privacy_codes (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS patient_privacy_codes_no_update ON public.patient_privacy_codes;
CREATE POLICY patient_privacy_codes_no_update ON public.patient_privacy_codes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (false);

-- Policy: "Patients can view own recovery codes" on public.patient_recovery_codes (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can view own recovery codes" ON public.patient_recovery_codes;
CREATE POLICY "Patients can view own recovery codes" ON public.patient_recovery_codes AS PERMISSIVE FOR SELECT TO public
  USING ((patient_id = auth.uid()));

-- Policy: clinic_doctors_view_visibility on public.patient_visibility (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS clinic_doctors_view_visibility ON public.patient_visibility;
CREATE POLICY clinic_doctors_view_visibility ON public.patient_visibility AS PERMISSIVE FOR SELECT TO public
  USING ((clinic_id IN ( SELECT clinic_memberships.clinic_id
   FROM clinic_memberships
  WHERE ((clinic_memberships.user_id = auth.uid()) AND (clinic_memberships.status = 'ACTIVE'::membership_status)))));

-- Policy: "Clinic members can view patients" on public.patients (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Clinic members can view patients" ON public.patients;
CREATE POLICY "Clinic members can view patients" ON public.patients AS PERMISSIVE FOR SELECT TO public
  USING (((id = auth.uid()) OR ((clinic_id IS NOT NULL) AND can_access_patient(clinic_id, id, auth.uid(), 'READ'::text)) OR (EXISTS ( SELECT 1
   FROM doctor_patient_relationships dpr
  WHERE ((dpr.patient_id = patients.id) AND (dpr.doctor_id = auth.uid()) AND (dpr.status = 'active'::text))))));

-- Policy: "Doctors can create walk-in patients" on public.patients (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can create walk-in patients" ON public.patients;
CREATE POLICY "Doctors can create walk-in patients" ON public.patients AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'doctor'::text)))));

-- Policy: "Doctors can update walk-in patients they created" on public.patients (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can update walk-in patients they created" ON public.patients;
CREATE POLICY "Doctors can update walk-in patients they created" ON public.patients AS PERMISSIVE FOR UPDATE TO public
  USING (((created_by_doctor_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'doctor'::text))))));

-- Policy: "Front desk can create patients" on public.patients (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Front desk can create patients" ON public.patients;
CREATE POLICY "Front desk can create patients" ON public.patients AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'frontdesk'::text)))));

-- Policy: "Front desk can view all patients" on public.patients (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Front desk can view all patients" ON public.patients;
CREATE POLICY "Front desk can view all patients" ON public.patients AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'frontdesk'::text)))));

-- Policy: "Patients can insert own record during registration" on public.patients (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can insert own record during registration" ON public.patients;
CREATE POLICY "Patients can insert own record during registration" ON public.patients AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = id));

-- Policy: "Patients can read own profile" on public.patients (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can read own profile" ON public.patients;
CREATE POLICY "Patients can read own profile" ON public.patients AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = id));

-- Policy: "Patients can update own profile" on public.patients (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can update own profile" ON public.patients;
CREATE POLICY "Patients can update own profile" ON public.patients AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = id));

-- Policy: "Clinic-scoped payment access" on public.payments (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Clinic-scoped payment access" ON public.payments;
CREATE POLICY "Clinic-scoped payment access" ON public.payments AS PERMISSIVE FOR SELECT TO public
  USING (((doctor_id = auth.uid()) OR (patient_id = auth.uid()) OR ((clinic_id IS NOT NULL) AND is_clinic_member(clinic_id, auth.uid()))));

-- Policy: "Doctors can view their own payments" on public.payments (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can view their own payments" ON public.payments;
CREATE POLICY "Doctors can view their own payments" ON public.payments AS PERMISSIVE FOR SELECT TO public
  USING ((doctor_id = auth.uid()));

-- Policy: "Front desk can create payments" on public.payments (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Front desk can create payments" ON public.payments;
CREATE POLICY "Front desk can create payments" ON public.payments AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'frontdesk'::text)))));

-- Policy: "Front desk can view payments" on public.payments (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Front desk can view payments" ON public.payments;
CREATE POLICY "Front desk can view payments" ON public.payments AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'frontdesk'::text)))));

-- Policy: "Frontdesk can manage payments for their clinic" on public.payments (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Frontdesk can manage payments for their clinic" ON public.payments;
CREATE POLICY "Frontdesk can manage payments for their clinic" ON public.payments AS PERMISSIVE FOR ALL TO public
  USING ((doctor_id IN ( SELECT cm_d.user_id
   FROM (clinic_memberships cm_fd
     JOIN clinic_memberships cm_d ON ((cm_d.clinic_id = cm_fd.clinic_id)))
  WHERE ((cm_fd.user_id = auth.uid()) AND (cm_fd.status = 'ACTIVE'::membership_status)))))
  WITH CHECK ((doctor_id IN ( SELECT cm_d.user_id
   FROM (clinic_memberships cm_fd
     JOIN clinic_memberships cm_d ON ((cm_d.clinic_id = cm_fd.clinic_id)))
  WHERE ((cm_fd.user_id = auth.uid()) AND (cm_fd.status = 'ACTIVE'::membership_status)))));

-- Policy: "Owners can view staff phone change requests in their clinic" on public.phone_change_requests (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Owners can view staff phone change requests in their clinic" ON public.phone_change_requests;
CREATE POLICY "Owners can view staff phone change requests in their clinic" ON public.phone_change_requests AS PERMISSIVE FOR SELECT TO public
  USING (((user_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (clinic_memberships m_owner
     JOIN clinic_memberships m_subject ON ((m_subject.clinic_id = m_owner.clinic_id)))
  WHERE ((m_owner.user_id = auth.uid()) AND (m_owner.role = 'OWNER'::clinic_role) AND (m_owner.status = 'ACTIVE'::membership_status) AND (m_subject.user_id = phone_change_requests.user_id) AND (m_subject.status = 'ACTIVE'::membership_status))))));

-- Policy: "Patients can create phone change requests" on public.phone_change_requests (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can create phone change requests" ON public.phone_change_requests;
CREATE POLICY "Patients can create phone change requests" ON public.phone_change_requests AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((patient_id = auth.uid()));

-- Policy: "Patients can view own phone change requests" on public.phone_change_requests (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can view own phone change requests" ON public.phone_change_requests;
CREATE POLICY "Patients can view own phone change requests" ON public.phone_change_requests AS PERMISSIVE FOR SELECT TO public
  USING ((patient_id = auth.uid()));

-- Policy: "Staff can create own phone change requests" on public.phone_change_requests (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Staff can create own phone change requests" ON public.phone_change_requests;
CREATE POLICY "Staff can create own phone change requests" ON public.phone_change_requests AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_id = auth.uid()));

-- Policy: "Staff can view own phone change requests" on public.phone_change_requests (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Staff can view own phone change requests" ON public.phone_change_requests;
CREATE POLICY "Staff can view own phone change requests" ON public.phone_change_requests AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = auth.uid()));

-- Policy: "Staff can manage phone corrections" on public.phone_corrections (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Staff can manage phone corrections" ON public.phone_corrections;
CREATE POLICY "Staff can manage phone corrections" ON public.phone_corrections AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['doctor'::text, 'frontdesk'::text]))))));

-- Policy: doctors_insert_prescriptions on public.prescription_items (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS doctors_insert_prescriptions ON public.prescription_items;
CREATE POLICY doctors_insert_prescriptions ON public.prescription_items AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((doctor_id = auth.uid()));

-- Policy: doctors_own_prescriptions on public.prescription_items (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS doctors_own_prescriptions ON public.prescription_items;
CREATE POLICY doctors_own_prescriptions ON public.prescription_items AS PERMISSIVE FOR SELECT TO public
  USING ((doctor_id = auth.uid()));

-- Policy: patients_own_prescriptions on public.prescription_items (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS patients_own_prescriptions ON public.prescription_items;
CREATE POLICY patients_own_prescriptions ON public.prescription_items AS PERMISSIVE FOR SELECT TO public
  USING ((patient_id = auth.uid()));

-- Policy: service_role_full_access_prescriptions on public.prescription_items (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS service_role_full_access_prescriptions ON public.prescription_items;
CREATE POLICY service_role_full_access_prescriptions ON public.prescription_items AS PERMISSIVE FOR ALL TO public
  USING ((auth.role() = 'service_role'::text));

-- Policy: "Doctors can manage their own templates" on public.prescription_templates (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can manage their own templates" ON public.prescription_templates;
CREATE POLICY "Doctors can manage their own templates" ON public.prescription_templates AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = doctor_id))
  WITH CHECK ((auth.uid() = doctor_id));

-- Policy: privacy_code_attempts_no_delete on public.privacy_code_attempts (cmd=DELETE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS privacy_code_attempts_no_delete ON public.privacy_code_attempts;
CREATE POLICY privacy_code_attempts_no_delete ON public.privacy_code_attempts AS PERMISSIVE FOR DELETE TO authenticated
  USING (false);

-- Policy: privacy_code_attempts_no_insert on public.privacy_code_attempts (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS privacy_code_attempts_no_insert ON public.privacy_code_attempts;
CREATE POLICY privacy_code_attempts_no_insert ON public.privacy_code_attempts AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (false);

-- Policy: privacy_code_attempts_no_select on public.privacy_code_attempts (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS privacy_code_attempts_no_select ON public.privacy_code_attempts;
CREATE POLICY privacy_code_attempts_no_select ON public.privacy_code_attempts AS PERMISSIVE FOR SELECT TO authenticated
  USING (false);

-- Policy: privacy_code_attempts_no_update on public.privacy_code_attempts (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS privacy_code_attempts_no_update ON public.privacy_code_attempts;
CREATE POLICY privacy_code_attempts_no_update ON public.privacy_code_attempts AS PERMISSIVE FOR UPDATE TO authenticated
  USING (false);

-- Policy: privacy_code_sms_tokens_no_delete on public.privacy_code_sms_tokens (cmd=DELETE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS privacy_code_sms_tokens_no_delete ON public.privacy_code_sms_tokens;
CREATE POLICY privacy_code_sms_tokens_no_delete ON public.privacy_code_sms_tokens AS PERMISSIVE FOR DELETE TO authenticated
  USING (false);

-- Policy: privacy_code_sms_tokens_no_insert on public.privacy_code_sms_tokens (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS privacy_code_sms_tokens_no_insert ON public.privacy_code_sms_tokens;
CREATE POLICY privacy_code_sms_tokens_no_insert ON public.privacy_code_sms_tokens AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (false);

-- Policy: privacy_code_sms_tokens_no_select on public.privacy_code_sms_tokens (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS privacy_code_sms_tokens_no_select ON public.privacy_code_sms_tokens;
CREATE POLICY privacy_code_sms_tokens_no_select ON public.privacy_code_sms_tokens AS PERMISSIVE FOR SELECT TO authenticated
  USING (false);

-- Policy: privacy_code_sms_tokens_no_update on public.privacy_code_sms_tokens (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS privacy_code_sms_tokens_no_update ON public.privacy_code_sms_tokens;
CREATE POLICY privacy_code_sms_tokens_no_update ON public.privacy_code_sms_tokens AS PERMISSIVE FOR UPDATE TO authenticated
  USING (false);

-- Policy: users_manage_own_push on public.push_subscriptions (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS users_manage_own_push ON public.push_subscriptions;
CREATE POLICY users_manage_own_push ON public.push_subscriptions AS PERMISSIVE FOR ALL TO public
  USING ((user_id = auth.uid()));

-- Policy: "Doctors can view sharing preferences" on public.record_sharing_preferences (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can view sharing preferences" ON public.record_sharing_preferences;
CREATE POLICY "Doctors can view sharing preferences" ON public.record_sharing_preferences AS PERMISSIVE FOR SELECT TO public
  USING (((doctor_id = auth.uid()) AND (status = 'active'::text)));

-- Policy: "Patients can manage sharing" on public.record_sharing_preferences (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can manage sharing" ON public.record_sharing_preferences;
CREATE POLICY "Patients can manage sharing" ON public.record_sharing_preferences AS PERMISSIVE FOR ALL TO public
  USING ((patient_id = auth.uid()));

-- Policy: service_role_sms on public.sms_reminders (cmd=ALL, permissive=PERMISSIVE)
DROP POLICY IF EXISTS service_role_sms ON public.sms_reminders;
CREATE POLICY service_role_sms ON public.sms_reminders AS PERMISSIVE FOR ALL TO public
  USING ((auth.role() = 'service_role'::text));

-- Policy: "Everyone can read templates" on public.templates (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Everyone can read templates" ON public.templates;
CREATE POLICY "Everyone can read templates" ON public.templates AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- Policy: "Users can insert own record during registration" on public.users (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Users can insert own record during registration" ON public.users;
CREATE POLICY "Users can insert own record during registration" ON public.users AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = id));

-- Policy: "Users can read own profile" on public.users (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
CREATE POLICY "Users can read own profile" ON public.users AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = id));

-- Policy: "Users can update own profile" on public.users (cmd=UPDATE, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = id));

-- Policy: "Clinic-scoped vital signs access" on public.vital_signs (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Clinic-scoped vital signs access" ON public.vital_signs;
CREATE POLICY "Clinic-scoped vital signs access" ON public.vital_signs AS PERMISSIVE FOR SELECT TO public
  USING (((doctor_id = auth.uid()) OR (patient_id = auth.uid()) OR ((clinic_id IS NOT NULL) AND can_access_patient(clinic_id, patient_id, auth.uid(), 'READ'::text))));

-- Policy: "Doctors can create vitals" on public.vital_signs (cmd=INSERT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can create vitals" ON public.vital_signs;
CREATE POLICY "Doctors can create vitals" ON public.vital_signs AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((doctor_id = auth.uid()));

-- Policy: "Doctors can view their patients vitals" on public.vital_signs (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Doctors can view their patients vitals" ON public.vital_signs;
CREATE POLICY "Doctors can view their patients vitals" ON public.vital_signs AS PERMISSIVE FOR SELECT TO public
  USING (((doctor_id = auth.uid()) OR (patient_id IN ( SELECT appointments.patient_id
   FROM appointments
  WHERE (appointments.doctor_id = auth.uid())))));

-- Policy: "Patients can view own vitals" on public.vital_signs (cmd=SELECT, permissive=PERMISSIVE)
DROP POLICY IF EXISTS "Patients can view own vitals" ON public.vital_signs;
CREATE POLICY "Patients can view own vitals" ON public.vital_signs AS PERMISSIVE FOR SELECT TO public
  USING ((patient_id = auth.uid()));