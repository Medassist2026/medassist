export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          phone: string
          email: string | null
          role: 'doctor' | 'patient'
          created_at: string
        }
        Insert: {
          id?: string
          phone: string
          email?: string | null
          role: 'doctor' | 'patient'
          created_at?: string
        }
        Update: {
          id?: string
          phone?: string
          email?: string | null
          role?: 'doctor' | 'patient'
          created_at?: string
        }
      }
      doctors: {
        Row: {
          id: string
          unique_id: string
          specialty: string
          default_template_id: string | null
          created_at: string
        }
        Insert: {
          id: string
          unique_id: string
          specialty: string
          default_template_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          unique_id?: string
          specialty?: string
          default_template_id?: string | null
          created_at?: string
        }
      }
      patients: {
        Row: {
          id: string
          unique_id: string
          phone: string
          registered: boolean
          created_at: string
        }
        Insert: {
          id: string
          unique_id: string
          phone: string
          registered?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          unique_id?: string
          phone?: string
          registered?: boolean
          created_at?: string
        }
      }
      clinics: {
        Row: {
          id: string
          unique_id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          unique_id: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          unique_id?: string
          name?: string
          created_at?: string
        }
      }
      clinic_doctors: {
        Row: {
          clinic_id: string
          doctor_id: string
          role: 'doctor' | 'frontdesk'
          created_at: string
        }
        Insert: {
          clinic_id: string
          doctor_id: string
          role: 'doctor' | 'frontdesk'
          created_at?: string
        }
        Update: {
          clinic_id?: string
          doctor_id?: string
          role?: 'doctor' | 'frontdesk'
          created_at?: string
        }
      }
      appointments: {
        Row: {
          id: string
          doctor_id: string
          patient_id: string | null
          clinic_id: string | null
          start_time: string
          duration_minutes: number
          status: 'scheduled' | 'cancelled'
          created_by_role: string
          created_at: string
        }
        Insert: {
          id?: string
          doctor_id: string
          patient_id?: string | null
          clinic_id?: string | null
          start_time: string
          duration_minutes?: number
          status?: 'scheduled' | 'cancelled'
          created_by_role: string
          created_at?: string
        }
        Update: {
          id?: string
          doctor_id?: string
          patient_id?: string | null
          clinic_id?: string | null
          start_time?: string
          duration_minutes?: number
          status?: 'scheduled' | 'cancelled'
          created_by_role?: string
          created_at?: string
        }
      }
      clinical_notes: {
        Row: {
          id: string
          doctor_id: string
          patient_id: string
          appointment_id: string | null
          chief_complaint: string[]
          diagnosis: Json
          medications: Json
          plan: string
          template_id: string | null
          keystroke_count: number | null
          duration_seconds: number | null
          synced_to_patient: boolean
          created_at: string
          modified_at: string
        }
        Insert: {
          id?: string
          doctor_id: string
          patient_id: string
          appointment_id?: string | null
          chief_complaint: string[]
          diagnosis: Json
          medications: Json
          plan: string
          template_id?: string | null
          keystroke_count?: number | null
          duration_seconds?: number | null
          synced_to_patient?: boolean
          created_at?: string
          modified_at?: string
        }
        Update: {
          id?: string
          doctor_id?: string
          patient_id?: string
          appointment_id?: string | null
          chief_complaint?: string[]
          diagnosis?: Json
          medications?: Json
          plan?: string
          template_id?: string | null
          keystroke_count?: number | null
          duration_seconds?: number | null
          synced_to_patient?: boolean
          created_at?: string
          modified_at?: string
        }
      }
      medication_reminders: {
        Row: {
          id: string
          clinical_note_id: string
          patient_id: string
          medication: Json
          status: 'pending' | 'accepted' | 'rejected'
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          clinical_note_id: string
          patient_id: string
          medication: Json
          status?: 'pending' | 'accepted' | 'rejected'
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          clinical_note_id?: string
          patient_id?: string
          medication?: Json
          status?: 'pending' | 'accepted' | 'rejected'
          expires_at?: string
          created_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          doctor_id: string
          patient_id: string
          sender_role: 'doctor' | 'patient'
          content: string
          created_at: string
          modified_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          doctor_id: string
          patient_id: string
          sender_role: 'doctor' | 'patient'
          content: string
          created_at?: string
          modified_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          doctor_id?: string
          patient_id?: string
          sender_role?: 'doctor' | 'patient'
          content?: string
          created_at?: string
          modified_at?: string | null
          deleted_at?: string | null
        }
      }
      templates: {
        Row: {
          id: string
          specialty: string
          name: string
          is_default: boolean
          sections: Json
          created_at: string
        }
        Insert: {
          id?: string
          specialty: string
          name: string
          is_default?: boolean
          sections: Json
          created_at?: string
        }
        Update: {
          id?: string
          specialty?: string
          name?: string
          is_default?: boolean
          sections?: Json
          created_at?: string
        }
      }
      doctor_templates: {
        Row: {
          id: string
          doctor_id: string
          template_id: string
          customizations: Json | null
          last_used: string | null
        }
        Insert: {
          id?: string
          doctor_id: string
          template_id: string
          customizations?: Json | null
          last_used?: string | null
        }
        Update: {
          id?: string
          doctor_id?: string
          template_id?: string
          customizations?: Json | null
          last_used?: string | null
        }
      }
      analytics_events: {
        Row: {
          id: string
          event_name: string
          user_id: string
          properties: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          event_name: string
          user_id: string
          properties?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          event_name?: string
          user_id?: string
          properties?: Json | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
