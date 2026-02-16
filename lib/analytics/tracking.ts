import { createClient } from '@/lib/supabase/server'

export interface AnalyticsEvent {
  event_name: string
  user_id?: string
  properties: Record<string, any>
}

/**
 * Track an analytics event
 */
export async function trackEvent(event: AnalyticsEvent) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('analytics_events')
    .insert({
      event_name: event.event_name,
      user_id: event.user_id || null,
      properties: event.properties
    })
  
  if (error) {
    console.error('Analytics tracking error:', error)
    // Don't throw - analytics failures shouldn't break the app
  }
}

/**
 * Track clinical session completion
 */
export async function trackSessionCompletion(params: {
  doctorId: string
  patientId: string
  durationSeconds: number
  keystrokeCount: number
  templateUsed: string
  chiefComplaintsCount: number
  medicationsCount: number
}) {
  await trackEvent({
    event_name: 'clinical_session_completed',
    user_id: params.doctorId,
    properties: {
      patient_id: params.patientId,
      duration_seconds: params.durationSeconds,
      keystroke_count: params.keystrokeCount,
      template_used: params.templateUsed,
      chief_complaints_count: params.chiefComplaintsCount,
      medications_count: params.medicationsCount,
      met_45s_target: params.durationSeconds <= 45,
      met_10_keystroke_target: params.keystrokeCount <= 10
    }
  })
}
