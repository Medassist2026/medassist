export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      account_recovery_requests: {
        Row: {
          claimed_patient_id: string | null
          claimed_phone: string
          completed_at: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          new_phone: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          verification_data: Json | null
          verification_method: string | null
        }
        Insert: {
          claimed_patient_id?: string | null
          claimed_phone: string
          completed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          new_phone: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          verification_data?: Json | null
          verification_method?: string | null
        }
        Update: {
          claimed_patient_id?: string | null
          claimed_phone?: string
          completed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          new_phone?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          verification_data?: Json | null
          verification_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_recovery_requests_claimed_patient_id_fkey"
            columns: ["claimed_patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_recovery_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string | null
          event_name: string
          id: string
          properties: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_name: string
          id?: string
          properties?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_name?: string
          id?: string
          properties?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      anonymous_visits: {
        Row: {
          actual_end_time: string | null
          actual_start_time: string | null
          clinic_id: string | null
          created_at: string | null
          daily_number: number
          doctor_id: string
          id: string
          scheduled_time: string | null
          status: string | null
          visit_date: string
        }
        Insert: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          clinic_id?: string | null
          created_at?: string | null
          daily_number: number
          doctor_id: string
          id?: string
          scheduled_time?: string | null
          status?: string | null
          visit_date?: string
        }
        Update: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          clinic_id?: string | null
          created_at?: string | null
          daily_number?: number
          doctor_id?: string
          id?: string
          scheduled_time?: string | null
          status?: string | null
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "anonymous_visits_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anonymous_visits_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_doctor_assignments: {
        Row: {
          id: string
          clinic_id: string
          assistant_user_id: string
          doctor_user_id: string
          scope: string
          status: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          assistant_user_id: string
          doctor_user_id: string
          scope: string
          status?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          assistant_user_id?: string
          doctor_user_id?: string
          scope?: string
          status?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          id: string
          clinic_id: string | null
          actor_user_id: string
          action: string
          entity_type: string
          entity_id: string | null
          metadata: Json | null
          ip_address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id?: string | null
          actor_user_id: string
          action: string
          entity_type: string
          entity_id?: string | null
          metadata?: Json | null
          ip_address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string | null
          actor_user_id?: string
          action?: string
          entity_type?: string
          entity_id?: string | null
          metadata?: Json | null
          ip_address?: string | null
          created_at?: string
        }
        Relationships: []
      }
      patient_visibility: {
        Row: {
          id: string
          clinic_id: string
          patient_id: string
          grantee_type: string
          grantee_user_id: string | null
          mode: string
          consent: string
          granted_by_user_id: string | null
          expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          patient_id: string
          grantee_type: string
          grantee_user_id?: string | null
          mode: string
          consent: string
          granted_by_user_id?: string | null
          expires_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          patient_id?: string
          grantee_type?: string
          grantee_user_id?: string | null
          mode?: string
          consent?: string
          granted_by_user_id?: string | null
          expires_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      api_rate_limits: {
        Row: {
          count: number
          created_at: string
          key_hash: string
          scope: string
          updated_at: string
          window_ms: number
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string
          key_hash: string
          scope: string
          updated_at?: string
          window_ms: number
          window_start: string
        }
        Update: {
          count?: number
          created_at?: string
          key_hash?: string
          scope?: string
          updated_at?: string
          window_ms?: number
          window_start?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          appointment_type: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          clinic_id: string | null
          created_at: string | null
          created_by_role: string
          doctor_id: string
          duration_minutes: number | null
          id: string
          notes: string | null
          patient_id: string | null
          start_time: string
          status: string | null
        }
        Insert: {
          appointment_type?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          clinic_id?: string | null
          created_at?: string | null
          created_by_role: string
          doctor_id: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          patient_id?: string | null
          start_time: string
          status?: string | null
        }
        Update: {
          appointment_type?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          clinic_id?: string | null
          created_at?: string | null
          created_by_role?: string
          doctor_id?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          patient_id?: string | null
          start_time?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      check_in_queue: {
        Row: {
          appointment_id: string | null
          called_at: string | null
          checked_in_at: string | null
          completed_at: string | null
          created_at: string | null
          doctor_id: string
          id: string
          patient_id: string
          queue_number: number
          queue_type: string | null
          status: string | null
        }
        Insert: {
          appointment_id?: string | null
          called_at?: string | null
          checked_in_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          doctor_id: string
          id?: string
          patient_id: string
          queue_number: number
          queue_type?: string | null
          status?: string | null
        }
        Update: {
          appointment_id?: string | null
          called_at?: string | null
          checked_in_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          doctor_id?: string
          id?: string
          patient_id?: string
          queue_number?: number
          queue_type?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_in_queue_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_in_queue_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_in_queue_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_doctors: {
        Row: {
          clinic_id: string
          created_at: string | null
          doctor_id: string
          role: string
        }
        Insert: {
          clinic_id: string
          created_at?: string | null
          doctor_id: string
          role: string
        }
        Update: {
          clinic_id?: string
          created_at?: string | null
          doctor_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_doctors_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_doctors_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_notes: {
        Row: {
          appointment_id: string | null
          chief_complaint: string[]
          clinic_id: string | null
          created_at: string | null
          diagnosis: Json
          doctor_id: string
          doctor_license_number: string | null
          duration_seconds: number | null
          id: string
          keystroke_count: number | null
          medications: Json
          modified_at: string | null
          patient_id: string
          plan: string
          prescription_date: string | null
          prescription_number: string | null
          prescription_printed_at: string | null
          synced_to_patient: boolean | null
          template_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          chief_complaint?: string[]
          clinic_id?: string | null
          created_at?: string | null
          diagnosis?: Json
          doctor_id: string
          doctor_license_number?: string | null
          duration_seconds?: number | null
          id?: string
          keystroke_count?: number | null
          medications?: Json
          modified_at?: string | null
          patient_id: string
          plan?: string
          prescription_date?: string | null
          prescription_number?: string | null
          prescription_printed_at?: string | null
          synced_to_patient?: boolean | null
          template_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          chief_complaint?: string[]
          clinic_id?: string | null
          created_at?: string | null
          diagnosis?: Json
          doctor_id?: string
          doctor_license_number?: string | null
          duration_seconds?: number | null
          id?: string
          keystroke_count?: number | null
          medications?: Json
          modified_at?: string | null
          patient_id?: string
          plan?: string
          prescription_date?: string | null
          prescription_number?: string | null
          prescription_printed_at?: string | null
          synced_to_patient?: boolean | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_notes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_notes_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          created_at: string | null
          default_visibility: string | null
          id: string
          name: string
          unique_id: string
        }
        Insert: {
          created_at?: string | null
          default_visibility?: string | null
          id?: string
          name: string
          unique_id: string
        }
        Update: {
          created_at?: string | null
          default_visibility?: string | null
          id?: string
          name?: string
          unique_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          created_at: string | null
          created_from_appointment_id: string | null
          doctor_id: string
          doctor_unread_count: number | null
          id: string
          last_message_at: string | null
          patient_id: string
          patient_unread_count: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string | null
          created_from_appointment_id?: string | null
          doctor_id: string
          doctor_unread_count?: number | null
          id?: string
          last_message_at?: string | null
          patient_id: string
          patient_unread_count?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string | null
          created_from_appointment_id?: string | null
          doctor_id?: string
          doctor_unread_count?: number | null
          id?: string
          last_message_at?: string | null
          patient_id?: string
          patient_unread_count?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_from_appointment_id_fkey"
            columns: ["created_from_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      default_sharing_preferences: {
        Row: {
          created_at: string | null
          id: string
          patient_id: string
          share_allergies: boolean | null
          share_conditions: boolean | null
          share_diary: boolean | null
          share_lab_results: boolean | null
          share_medications: boolean | null
          share_visit_history: boolean | null
          share_vitals: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          patient_id: string
          share_allergies?: boolean | null
          share_conditions?: boolean | null
          share_diary?: boolean | null
          share_lab_results?: boolean | null
          share_medications?: boolean | null
          share_visit_history?: boolean | null
          share_vitals?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          patient_id?: string
          share_allergies?: boolean | null
          share_conditions?: boolean | null
          share_diary?: boolean | null
          share_lab_results?: boolean | null
          share_medications?: boolean | null
          share_visit_history?: boolean | null
          share_vitals?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "default_sharing_preferences_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_availability: {
        Row: {
          created_at: string | null
          day_of_week: number
          doctor_id: string
          end_time: string
          id: string
          is_active: boolean | null
          slot_duration_minutes: number | null
          start_time: string
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          doctor_id: string
          end_time: string
          id?: string
          is_active?: boolean | null
          slot_duration_minutes?: number | null
          start_time: string
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          doctor_id?: string
          end_time?: string
          id?: string
          is_active?: boolean | null
          slot_duration_minutes?: number | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_availability_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_patient_relationships: {
        Row: {
          access_level: string | null
          access_type: string | null
          consent_granted_at: string | null
          consent_revoked_at: string | null
          consent_state: string | null
          created_at: string | null
          doctor_entered_age: number | null
          doctor_entered_name: string | null
          doctor_entered_sex: string | null
          doctor_id: string
          ended_at: string | null
          id: string
          last_visit_at: string | null
          notes: string | null
          patient_id: string
          relationship_type: string | null
          started_at: string | null
          status: string
          verified_at: string | null
        }
        Insert: {
          access_level?: string | null
          access_type?: string | null
          consent_granted_at?: string | null
          consent_revoked_at?: string | null
          consent_state?: string | null
          created_at?: string | null
          doctor_entered_age?: number | null
          doctor_entered_name?: string | null
          doctor_entered_sex?: string | null
          doctor_id: string
          ended_at?: string | null
          id?: string
          last_visit_at?: string | null
          notes?: string | null
          patient_id: string
          relationship_type?: string | null
          started_at?: string | null
          status?: string
          verified_at?: string | null
        }
        Update: {
          access_level?: string | null
          access_type?: string | null
          consent_granted_at?: string | null
          consent_revoked_at?: string | null
          consent_state?: string | null
          created_at?: string | null
          doctor_entered_age?: number | null
          doctor_entered_name?: string | null
          doctor_entered_sex?: string | null
          doctor_id?: string
          ended_at?: string | null
          id?: string
          last_visit_at?: string | null
          notes?: string | null
          patient_id?: string
          relationship_type?: string | null
          started_at?: string | null
          status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctor_patient_relationships_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_patient_relationships_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_templates: {
        Row: {
          customizations: Json | null
          doctor_id: string
          id: string
          last_used: string | null
          template_id: string
        }
        Insert: {
          customizations?: Json | null
          doctor_id: string
          id?: string
          last_used?: string | null
          template_id: string
        }
        Update: {
          customizations?: Json | null
          doctor_id?: string
          id?: string
          last_used?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_templates_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_templates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          created_at: string | null
          default_template_id: string | null
          full_name: string | null
          id: string
          specialty: string
          unique_id: string
        }
        Insert: {
          created_at?: string | null
          default_template_id?: string | null
          full_name?: string | null
          id: string
          specialty: string
          unique_id: string
        }
        Update: {
          created_at?: string | null
          default_template_id?: string | null
          full_name?: string | null
          id?: string
          specialty?: string
          unique_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctors_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      front_desk_staff: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          full_name: string
          id: string
          unique_id: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          full_name: string
          id: string
          unique_id: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          full_name?: string
          id?: string
          unique_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "front_desk_staff_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "front_desk_staff_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_orders: {
        Row: {
          clinical_note_id: string | null
          collected_at: string | null
          completed_at: string | null
          created_at: string | null
          doctor_id: string
          id: string
          notes: string | null
          ordered_at: string | null
          patient_id: string
          priority: string | null
          status: string | null
        }
        Insert: {
          clinical_note_id?: string | null
          collected_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          doctor_id: string
          id?: string
          notes?: string | null
          ordered_at?: string | null
          patient_id: string
          priority?: string | null
          status?: string | null
        }
        Update: {
          clinical_note_id?: string | null
          collected_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          doctor_id?: string
          id?: string
          notes?: string | null
          ordered_at?: string | null
          patient_id?: string
          priority?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_orders_clinical_note_id_fkey"
            columns: ["clinical_note_id"]
            isOneToOne: false
            referencedRelation: "clinical_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_results: {
        Row: {
          abnormal_flag: string | null
          created_at: string | null
          id: string
          is_abnormal: boolean | null
          lab_order_id: string
          lab_test_id: string
          result_date: string | null
          result_text: string | null
          result_value: number | null
        }
        Insert: {
          abnormal_flag?: string | null
          created_at?: string | null
          id?: string
          is_abnormal?: boolean | null
          lab_order_id: string
          lab_test_id: string
          result_date?: string | null
          result_text?: string | null
          result_value?: number | null
        }
        Update: {
          abnormal_flag?: string | null
          created_at?: string | null
          id?: string
          is_abnormal?: boolean | null
          lab_order_id?: string
          lab_test_id?: string
          result_date?: string | null
          result_text?: string | null
          result_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_results_lab_order_id_fkey"
            columns: ["lab_order_id"]
            isOneToOne: false
            referencedRelation: "lab_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_results_lab_test_id_fkey"
            columns: ["lab_test_id"]
            isOneToOne: false
            referencedRelation: "lab_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_tests: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_active: boolean | null
          normal_range_max: number | null
          normal_range_min: number | null
          test_code: string
          test_name: string
          unit: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          normal_range_max?: number | null
          normal_range_min?: number | null
          test_code: string
          test_name: string
          unit?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          normal_range_max?: number | null
          normal_range_min?: number | null
          test_code?: string
          test_name?: string
          unit?: string | null
        }
        Relationships: []
      }
      medication_adherence_log: {
        Row: {
          created_at: string | null
          id: string
          medication_name: string
          medication_reminder_id: string | null
          notes: string | null
          patient_id: string
          scheduled_time: string
          status: string
          taken_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          medication_name: string
          medication_reminder_id?: string | null
          notes?: string | null
          patient_id: string
          scheduled_time: string
          status: string
          taken_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          medication_name?: string
          medication_reminder_id?: string | null
          notes?: string | null
          patient_id?: string
          scheduled_time?: string
          status?: string
          taken_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_adherence_log_medication_reminder_id_fkey"
            columns: ["medication_reminder_id"]
            isOneToOne: false
            referencedRelation: "medication_reminders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_adherence_log_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_reminders: {
        Row: {
          clinical_note_id: string
          created_at: string | null
          expires_at: string
          id: string
          medication: Json
          patient_id: string
          status: string | null
        }
        Insert: {
          clinical_note_id: string
          created_at?: string | null
          expires_at: string
          id?: string
          medication: Json
          patient_id: string
          status?: string | null
        }
        Update: {
          clinical_note_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          medication?: Json
          patient_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_reminders_clinical_note_id_fkey"
            columns: ["clinical_note_id"]
            isOneToOne: false
            referencedRelation: "clinical_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_reminders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: string[] | null
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          read_at: string | null
          sender_id: string
          sender_type: string
          sent_at: string | null
        }
        Insert: {
          attachments?: string[] | null
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          read_at?: string | null
          sender_id: string
          sender_type: string
          sent_at?: string | null
        }
        Update: {
          attachments?: string[] | null
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          read_at?: string | null
          sender_id?: string
          sender_type?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      opt_out_statistics: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          doctor_id: string
          id: string
          opt_out_date: string
          opt_out_time: string | null
          reason_category: string | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          doctor_id: string
          id?: string
          opt_out_date?: string
          opt_out_time?: string | null
          reason_category?: string | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          doctor_id?: string
          id?: string
          opt_out_date?: string
          opt_out_time?: string | null
          reason_category?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opt_out_statistics_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opt_out_statistics_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_codes: {
        Row: {
          attempts: number | null
          code_hash: string
          consumed_at: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          max_attempts: number | null
          otp_hash: string | null
          patient_id: string | null
          phone: string
          purpose: string
          used: boolean | null
          used_at: string | null
        }
        Insert: {
          attempts?: number | null
          code_hash: string
          consumed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          max_attempts?: number | null
          otp_hash?: string | null
          patient_id?: string | null
          phone: string
          purpose: string
          used?: boolean | null
          used_at?: string | null
        }
        Update: {
          attempts?: number | null
          code_hash?: string
          consumed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          max_attempts?: number | null
          otp_hash?: string | null
          patient_id?: string | null
          phone?: string
          purpose?: string
          used?: boolean | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "otp_codes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_consent_grants: {
        Row: {
          clinic_id: string | null
          consent_state: string
          consent_type: string
          created_at: string
          doctor_id: string
          granted_at: string
          granted_by: string
          id: string
          patient_id: string
          revoked_at: string | null
          updated_at: string
          verification_method: string
          verification_token_hash: string | null
        }
        Insert: {
          clinic_id?: string | null
          consent_state: string
          consent_type: string
          created_at?: string
          doctor_id: string
          granted_at?: string
          granted_by?: string
          id?: string
          patient_id: string
          revoked_at?: string | null
          updated_at?: string
          verification_method?: string
          verification_token_hash?: string | null
        }
        Update: {
          clinic_id?: string | null
          consent_state?: string
          consent_type?: string
          created_at?: string
          doctor_id?: string
          granted_at?: string
          granted_by?: string
          id?: string
          patient_id?: string
          revoked_at?: string | null
          updated_at?: string
          verification_method?: string
          verification_token_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_consent_grants_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_consent_grants_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_consent_grants_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_diary: {
        Row: {
          content: string | null
          created_at: string | null
          entry_date: string
          entry_type: string
          id: string
          is_shared: boolean | null
          mood_score: number | null
          patient_id: string
          severity: number | null
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          entry_date?: string
          entry_type: string
          id?: string
          is_shared?: boolean | null
          mood_score?: number | null
          patient_id: string
          severity?: number | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          entry_date?: string
          entry_type?: string
          id?: string
          is_shared?: boolean | null
          mood_score?: number | null
          patient_id?: string
          severity?: number | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_diary_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_health_metrics: {
        Row: {
          created_at: string | null
          id: string
          metric_type: string
          notes: string | null
          patient_id: string
          recorded_at: string
          source: string | null
          unit: string | null
          value_diastolic: number | null
          value_numeric: number | null
          value_systolic: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          metric_type: string
          notes?: string | null
          patient_id: string
          recorded_at?: string
          source?: string | null
          unit?: string | null
          value_diastolic?: number | null
          value_numeric?: number | null
          value_systolic?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metric_type?: string
          notes?: string | null
          patient_id?: string
          recorded_at?: string
          source?: string | null
          unit?: string | null
          value_diastolic?: number | null
          value_numeric?: number | null
          value_systolic?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_health_metrics_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_medical_records: {
        Row: {
          attachment_url: string | null
          created_at: string | null
          date: string
          description: string | null
          facility_name: string | null
          has_attachment: boolean | null
          id: string
          patient_id: string
          provider_name: string | null
          record_type: string
          title: string
          updated_at: string | null
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string | null
          date: string
          description?: string | null
          facility_name?: string | null
          has_attachment?: boolean | null
          id?: string
          patient_id: string
          provider_name?: string | null
          record_type: string
          title: string
          updated_at?: string | null
        }
        Update: {
          attachment_url?: string | null
          created_at?: string | null
          date?: string
          description?: string | null
          facility_name?: string | null
          has_attachment?: boolean | null
          id?: string
          patient_id?: string
          provider_name?: string | null
          record_type?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_medical_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_medications: {
        Row: {
          created_at: string | null
          dosage: string
          end_date: string | null
          frequency: string
          id: string
          is_active: boolean | null
          medication_name: string
          notes: string | null
          patient_id: string
          prescriber_name: string | null
          purpose: string | null
          route: string | null
          start_date: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dosage: string
          end_date?: string | null
          frequency: string
          id?: string
          is_active?: boolean | null
          medication_name: string
          notes?: string | null
          patient_id: string
          prescriber_name?: string | null
          purpose?: string | null
          route?: string | null
          start_date: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dosage?: string
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean | null
          medication_name?: string
          notes?: string | null
          patient_id?: string
          prescriber_name?: string | null
          purpose?: string | null
          route?: string | null
          start_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_phone_history: {
        Row: {
          added_at: string | null
          change_reason: string | null
          changed_at: string
          changed_by: string | null
          id: string
          is_current: boolean | null
          patient_id: string
          phone: string
          removed_at: string | null
          removed_reason: string | null
          verified: boolean | null
          verified_at: string | null
        }
        Insert: {
          added_at?: string | null
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          is_current?: boolean | null
          patient_id: string
          phone: string
          removed_at?: string | null
          removed_reason?: string | null
          verified?: boolean | null
          verified_at?: string | null
        }
        Update: {
          added_at?: string | null
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          is_current?: boolean | null
          patient_id?: string
          phone?: string
          removed_at?: string | null
          removed_reason?: string | null
          verified?: boolean | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_phone_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_phone_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_phone_verification_issues: {
        Row: {
          created_at: string | null
          error_code: string | null
          error_message: string | null
          id: string
          issue_type: string
          patient_id: string
          phone: string
          resolution_action: string | null
          resolution_notes: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          issue_type: string
          patient_id: string
          phone: string
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          issue_type?: string
          patient_id?: string
          phone?: string
          resolution_action?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_phone_verification_issues_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_phone_verification_issues_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string | null
          expires_at: string | null
          id: string
          patient_id: string
          used: boolean | null
          used_at: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          patient_id: string
          used?: boolean | null
          used_at?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          patient_id?: string
          used?: boolean | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_recovery_codes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          account_status: string | null
          age: number | null
          clinic_id: string | null
          converted_at: string | null
          created_at: string | null
          created_by_doctor_id: string | null
          email: string | null
          full_name: string | null
          id: string
          is_dependent: boolean | null
          last_activity_at: string | null
          national_id_hash: string | null
          national_id_last4: string | null
          parent_phone: string | null
          patient_code: string | null
          phone: string
          phone_verified: boolean | null
          phone_verified_at: string | null
          registered: boolean | null
          sex: string | null
          unique_id: string
        }
        Insert: {
          account_status?: string | null
          age?: number | null
          clinic_id?: string | null
          converted_at?: string | null
          created_at?: string | null
          created_by_doctor_id?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_dependent?: boolean | null
          last_activity_at?: string | null
          national_id_hash?: string | null
          national_id_last4?: string | null
          parent_phone?: string | null
          patient_code?: string | null
          phone: string
          phone_verified?: boolean | null
          phone_verified_at?: string | null
          registered?: boolean | null
          sex?: string | null
          unique_id: string
        }
        Update: {
          account_status?: string | null
          age?: number | null
          clinic_id?: string | null
          converted_at?: string | null
          created_at?: string | null
          created_by_doctor_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_dependent?: boolean | null
          last_activity_at?: string | null
          national_id_hash?: string | null
          national_id_last4?: string | null
          parent_phone?: string | null
          patient_code?: string | null
          phone?: string
          phone_verified?: boolean | null
          phone_verified_at?: string | null
          registered?: boolean | null
          sex?: string | null
          unique_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_created_by_doctor_id_fkey"
            columns: ["created_by_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          appointment_id: string | null
          clinical_note_id: string | null
          collected_by: string | null
          created_at: string | null
          doctor_id: string
          id: string
          notes: string | null
          patient_id: string
          payment_method: string
          payment_status: string | null
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          clinical_note_id?: string | null
          collected_by?: string | null
          created_at?: string | null
          doctor_id: string
          id?: string
          notes?: string | null
          patient_id: string
          payment_method: string
          payment_status?: string | null
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          clinical_note_id?: string | null
          collected_by?: string | null
          created_at?: string | null
          doctor_id?: string
          id?: string
          notes?: string | null
          patient_id?: string
          payment_method?: string
          payment_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_clinical_note_id_fkey"
            columns: ["clinical_note_id"]
            isOneToOne: false
            referencedRelation: "clinical_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_change_requests: {
        Row: {
          completed_at: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          new_phone: string
          new_phone_otp_hash: string | null
          new_phone_verified_at: string | null
          old_phone: string
          old_phone_otp_hash: string | null
          old_phone_verified_at: string | null
          patient_id: string | null
          requested_at: string
          status: string | null
          user_id: string | null
          verification_method: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          new_phone: string
          new_phone_otp_hash?: string | null
          new_phone_verified_at?: string | null
          old_phone: string
          old_phone_otp_hash?: string | null
          old_phone_verified_at?: string | null
          patient_id?: string | null
          requested_at?: string
          status?: string | null
          user_id?: string | null
          verification_method?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          new_phone?: string
          new_phone_otp_hash?: string | null
          new_phone_verified_at?: string | null
          old_phone?: string
          old_phone_otp_hash?: string | null
          old_phone_verified_at?: string | null
          patient_id?: string | null
          requested_at?: string
          status?: string | null
          user_id?: string | null
          verification_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phone_change_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_change_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_corrections: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          initiated_by: string
          initiated_by_user_id: string | null
          new_phone: string
          old_phone: string
          otp_hash: string | null
          patient_id: string
          reason: string
          status: string | null
          verification_method: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          initiated_by: string
          initiated_by_user_id?: string | null
          new_phone: string
          old_phone: string
          otp_hash?: string | null
          patient_id: string
          reason: string
          status?: string | null
          verification_method?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          initiated_by?: string
          initiated_by_user_id?: string | null
          new_phone?: string
          old_phone?: string
          otp_hash?: string | null
          patient_id?: string
          reason?: string
          status?: string | null
          verification_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phone_corrections_initiated_by_user_id_fkey"
            columns: ["initiated_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_corrections_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      record_sharing_preferences: {
        Row: {
          created_at: string | null
          custom_note: string | null
          doctor_id: string
          id: string
          patient_id: string
          revoked_at: string | null
          share_allergies: boolean | null
          share_conditions: boolean | null
          share_diary: boolean | null
          share_lab_results: boolean | null
          share_medications: boolean | null
          share_visit_history: boolean | null
          share_vitals: boolean | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          custom_note?: string | null
          doctor_id: string
          id?: string
          patient_id: string
          revoked_at?: string | null
          share_allergies?: boolean | null
          share_conditions?: boolean | null
          share_diary?: boolean | null
          share_lab_results?: boolean | null
          share_medications?: boolean | null
          share_visit_history?: boolean | null
          share_vitals?: boolean | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          custom_note?: string | null
          doctor_id?: string
          id?: string
          patient_id?: string
          revoked_at?: string | null
          share_allergies?: boolean | null
          share_conditions?: boolean | null
          share_diary?: boolean | null
          share_lab_results?: boolean | null
          share_medications?: boolean | null
          share_visit_history?: boolean | null
          share_vitals?: boolean | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "record_sharing_preferences_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_sharing_preferences_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
          sections: Json
          specialty: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          sections: Json
          specialty: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          sections?: Json
          specialty?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          phone: string
          phone_verified: boolean
          phone_verified_at: string | null
          role: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id: string
          phone: string
          phone_verified?: boolean
          phone_verified_at?: string | null
          role: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          phone?: string
          phone_verified?: boolean
          phone_verified_at?: string | null
          role?: string
        }
        Relationships: []
      }
      vital_signs: {
        Row: {
          bmi: number | null
          clinical_note_id: string | null
          created_at: string | null
          diastolic_bp: number | null
          doctor_id: string
          heart_rate: number | null
          height: number | null
          id: string
          measured_at: string | null
          notes: string | null
          oxygen_saturation: number | null
          patient_id: string
          respiratory_rate: number | null
          systolic_bp: number | null
          temperature: number | null
          weight: number | null
        }
        Insert: {
          bmi?: number | null
          clinical_note_id?: string | null
          created_at?: string | null
          diastolic_bp?: number | null
          doctor_id: string
          heart_rate?: number | null
          height?: number | null
          id?: string
          measured_at?: string | null
          notes?: string | null
          oxygen_saturation?: number | null
          patient_id: string
          respiratory_rate?: number | null
          systolic_bp?: number | null
          temperature?: number | null
          weight?: number | null
        }
        Update: {
          bmi?: number | null
          clinical_note_id?: string | null
          created_at?: string | null
          diastolic_bp?: number | null
          doctor_id?: string
          heart_rate?: number | null
          height?: number | null
          id?: string
          measured_at?: string | null
          notes?: string | null
          oxygen_saturation?: number | null
          patient_id?: string
          respiratory_rate?: number | null
          systolic_bp?: number | null
          temperature?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vital_signs_clinical_note_id_fkey"
            columns: ["clinical_note_id"]
            isOneToOne: false
            referencedRelation: "clinical_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vital_signs_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vital_signs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_bmi: {
        Args: { height_cm: number; weight_kg: number }
        Returns: number
      }
      change_phone_commit: {
        Args: {
          p_request_id: string
          p_subject_id: string
          p_subject_kind: string
          p_old_phone: string
          p_new_phone: string
          p_actor_id: string
          p_change_reason: string
        }
        Returns: Json
      }
      change_phone_rollback: {
        Args: {
          p_request_id: string
          p_subject_id: string
          p_subject_kind: string
          p_old_phone: string
          p_new_phone: string
          p_actor_id: string
        }
        Returns: undefined
      }
      can_doctor_view_record: {
        Args: {
          p_doctor_id: string
          p_patient_id: string
          p_record_type: string
        }
        Returns: boolean
      }
      can_open_messaging_conversation: {
        Args: { p_doctor_id: string; p_patient_id: string }
        Returns: boolean
      }
      cleanup_expired_verification_data: { Args: never; Returns: undefined }
      consume_rate_limit: {
        Args: {
          p_key_hash: string
          p_max_requests: number
          p_scope: string
          p_window_ms: number
        }
        Returns: {
          allowed: boolean
          current_count: number
          remaining: number
          retry_after_seconds: number
        }[]
      }
      find_duplicate_patient_phones: {
        Args: never
        Returns: {
          duplicate_count: number
          patient_ids: string[]
          phone: string
        }[]
      }
      generate_prescription_number: { Args: never; Returns: string }
      get_next_anonymous_number: {
        Args: { p_doctor_id: string }
        Returns: number
      }
      get_next_queue_number: { Args: { p_doctor_id: string }; Returns: number }
      get_public_table_names: {
        Args: never
        Returns: {
          table_name: string
        }[]
      }
      get_table_columns: {
        Args: { p_table_name: string }
        Returns: {
          column_name: string
        }[]
      }
      is_account_dormant: { Args: { last_activity: string }; Returns: boolean }
      mark_dormant_accounts: { Args: never; Returns: number }
      mark_duplicate_patients: {
        Args: { p_keep_id: string; p_merge_ids: string[] }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
