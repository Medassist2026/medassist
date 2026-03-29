/**
 * Doctor Private Analytics — Feature 6
 *
 * Aggregates a doctor's own clinical data into actionable insights.
 * All queries are scoped to the authenticated doctor's ID — no cross-doctor
 * data leaks possible at the query level.
 *
 * Data sources:
 *  1. analytics_events (event_name='clinical_session_completed') — timing metrics
 *  2. clinical_notes — structured prescription + complaint data
 *
 * Design principles:
 *  - Pure computation functions, no HTTP deps — easy to unit-test
 *  - No external NLP — only frequency counts over existing structured fields
 *  - All computations done server-side; the API returns ready-to-render numbers
 *  - Backend-only; zero frontend changes in this phase
 */

import { createAdminClient } from '@shared/lib/supabase/admin'

// ============================================================================
// TYPES
// ============================================================================

export type StatsPeriod = '7d' | '30d' | '90d' | 'all'

export interface DoctorStatsSummary {
  totalSessions:            number
  uniquePatients:           number
  returningPatientRate:     number   // 0–1
  avgDurationSeconds:       number
  avgMedicationsPerSession: number
  avgKeystrokesPerSession:  number
  sessionsUnder45sRate:     number   // 0–1 — the "faster than paper" KPI
  sessionsWithMedicationsRate: number // 0–1
}

export interface TrendDataPoint {
  date:         string   // ISO date YYYY-MM-DD
  sessions:     number
  avgDuration:  number   // seconds
}

export interface ComplaintFrequency {
  complaint: string
  count:     number
  percent:   number   // relative to total sessions in period
}

export interface MedicationFrequency {
  name:    string
  count:   number
  percent: number
}

export interface WeeklyComparison {
  thisWeek:  { sessions: number; avgDuration: number; under45sRate: number }
  lastWeek:  { sessions: number; avgDuration: number; under45sRate: number }
  sessionsDelta:  number   // absolute change
  durationDelta:  number   // seconds, negative = faster (good)
}

export interface DoctorStatsResult {
  period:         StatsPeriod
  generatedAt:    string
  summary:        DoctorStatsSummary
  trends:         TrendDataPoint[]
  topComplaints:  ComplaintFrequency[]
  topMedications: MedicationFrequency[]
  weeklyComparison: WeeklyComparison
}

// ============================================================================
// HELPERS
// ============================================================================

function periodToStartDate(period: StatsPeriod): string | null {
  if (period === 'all') return null
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function topN<T extends { count: number }>(items: T[], n: number): T[] {
  return [...items].sort((a, b) => b.count - a.count).slice(0, n)
}

// ============================================================================
// CORE QUERY FUNCTIONS
// ============================================================================

/**
 * Fetch analytics_events for the doctor in the given period.
 * Returns raw event rows.
 */
async function fetchSessionEvents(doctorId: string, startDate: string | null) {
  const admin = createAdminClient('doctor-stats-events')
  let q = admin
    .from('analytics_events')
    .select('properties, created_at')
    .eq('user_id', doctorId)
    .eq('event_name', 'clinical_session_completed')
    .order('created_at', { ascending: true })

  if (startDate) q = q.gte('created_at', startDate)

  const { data, error } = await q
  if (error) throw new Error(`analytics_events query failed: ${error.message}`)
  return data || []
}

/**
 * Fetch clinical_notes for the doctor in the given period.
 * Only selects columns needed for analytics — not full note content.
 */
async function fetchClinicalNotes(doctorId: string, startDate: string | null) {
  const admin = createAdminClient('doctor-stats-notes')
  let q = admin
    .from('clinical_notes')
    .select('id, patient_id, chief_complaint, medications, created_at')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: true })

  if (startDate) q = q.gte('created_at', startDate)

  const { data, error } = await q
  if (error) throw new Error(`clinical_notes query failed: ${error.message}`)
  return data || []
}

// ============================================================================
// AGGREGATION FUNCTIONS
// ============================================================================

function computeSummary(
  events: any[],
  notes: any[],
): DoctorStatsSummary {
  const totalSessions = notes.length

  // Unique patients from notes (more reliable than events)
  const uniquePatientIds = new Set(notes.map((n: any) => n.patient_id).filter(Boolean))
  const uniquePatients = uniquePatientIds.size

  // Returning patients: patients who appear more than once
  const patientVisitCounts = new Map<string, number>()
  for (const note of notes) {
    if (note.patient_id) {
      patientVisitCounts.set(note.patient_id, (patientVisitCounts.get(note.patient_id) || 0) + 1)
    }
  }
  const returningPatientCount = [...patientVisitCounts.values()].filter(c => c > 1).length
  const returningPatientRate = uniquePatients > 0
    ? returningPatientCount / uniquePatients
    : 0

  // Timing metrics — from analytics events (more accurate than notes)
  const durations     = events.map((e: any) => e.properties?.duration_seconds || 0).filter((d: number) => d > 0)
  const keystrokes    = events.map((e: any) => e.properties?.keystroke_count  || 0).filter((k: number) => k > 0)
  const under45Events = events.filter((e: any) => e.properties?.met_45s_target === true)

  const avgDurationSeconds       = Math.round(average(durations))
  const avgKeystrokesPerSession  = Math.round(average(keystrokes))
  const sessionsUnder45sRate     = events.length > 0 ? under45Events.length / events.length : 0

  // Medication metrics from notes
  const notesMedCounts = notes.map((n: any) => Array.isArray(n.medications) ? n.medications.length : 0)
  const notesWithMeds  = notesMedCounts.filter((c: number) => c > 0)

  const avgMedicationsPerSession   = totalSessions > 0 ? average(notesMedCounts) : 0
  const sessionsWithMedicationsRate = totalSessions > 0 ? notesWithMeds.length / totalSessions : 0

  return {
    totalSessions,
    uniquePatients,
    returningPatientRate: Math.round(returningPatientRate * 100) / 100,
    avgDurationSeconds,
    avgMedicationsPerSession: Math.round(avgMedicationsPerSession * 10) / 10,
    avgKeystrokesPerSession,
    sessionsUnder45sRate: Math.round(sessionsUnder45sRate * 100) / 100,
    sessionsWithMedicationsRate: Math.round(sessionsWithMedicationsRate * 100) / 100,
  }
}

function computeTrends(notes: any[]): TrendDataPoint[] {
  // Group notes by date
  const byDate = new Map<string, number[]>()  // date → [duration, duration, ...]

  for (const note of notes) {
    const date = (note.created_at || '').slice(0, 10)  // YYYY-MM-DD
    if (!date) continue
    if (!byDate.has(date)) byDate.set(date, [])
    // We don't have duration in notes — events do, but correlating by date is close enough
    byDate.get(date)!.push(1)  // just count sessions per day
  }

  const trend: TrendDataPoint[] = []
  for (const [date, entries] of [...byDate.entries()].sort()) {
    trend.push({ date, sessions: entries.length, avgDuration: 0 })
  }

  return trend
}

function computeTrendsWithEvents(notes: any[], events: any[]): TrendDataPoint[] {
  // Build date → sessions from notes
  const sessionsByDate   = new Map<string, number>()
  const durationsByDate  = new Map<string, number[]>()

  for (const note of notes) {
    const date = (note.created_at || '').slice(0, 10)
    if (!date) continue
    sessionsByDate.set(date, (sessionsByDate.get(date) || 0) + 1)
  }

  for (const event of events) {
    const date     = (event.created_at || '').slice(0, 10)
    const duration = event.properties?.duration_seconds
    if (!date || !duration) continue
    if (!durationsByDate.has(date)) durationsByDate.set(date, [])
    durationsByDate.get(date)!.push(duration)
  }

  const allDates = new Set([...sessionsByDate.keys(), ...durationsByDate.keys()])
  const trend: TrendDataPoint[] = []

  for (const date of [...allDates].sort()) {
    trend.push({
      date,
      sessions:    sessionsByDate.get(date) || 0,
      avgDuration: Math.round(average(durationsByDate.get(date) || [])),
    })
  }

  return trend
}

function computeTopComplaints(notes: any[], totalSessions: number): ComplaintFrequency[] {
  const freq = new Map<string, number>()

  for (const note of notes) {
    const complaints: string[] = Array.isArray(note.chief_complaint) ? note.chief_complaint : []
    for (const complaint of complaints) {
      const key = complaint.trim()
      if (key) freq.set(key, (freq.get(key) || 0) + 1)
    }
  }

  const items: ComplaintFrequency[] = [...freq.entries()].map(([complaint, count]) => ({
    complaint,
    count,
    percent: totalSessions > 0 ? Math.round((count / totalSessions) * 100) / 100 : 0,
  }))

  return topN(items, 10)
}

function computeTopMedications(notes: any[], totalSessions: number): MedicationFrequency[] {
  const freq = new Map<string, number>()

  for (const note of notes) {
    const medications: any[] = Array.isArray(note.medications) ? note.medications : []
    for (const med of medications) {
      const name = (med.name || '').trim()
      if (name) freq.set(name, (freq.get(name) || 0) + 1)
    }
  }

  const items: MedicationFrequency[] = [...freq.entries()].map(([name, count]) => ({
    name,
    count,
    percent: totalSessions > 0 ? Math.round((count / totalSessions) * 100) / 100 : 0,
  }))

  return topN(items, 10)
}

function computeWeeklyComparison(events: any[], notes: any[]): WeeklyComparison {
  const now       = new Date()
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7)
  const prevStart = new Date(now); prevStart.setDate(now.getDate() - 14)

  const thisWeekEvents = events.filter((e: any) => new Date(e.created_at) >= weekStart)
  const lastWeekEvents = events.filter((e: any) => {
    const d = new Date(e.created_at)
    return d >= prevStart && d < weekStart
  })

  const thisWeekNotes = notes.filter((n: any) => new Date(n.created_at) >= weekStart)
  const lastWeekNotes = notes.filter((n: any) => {
    const d = new Date(n.created_at)
    return d >= prevStart && d < weekStart
  })

  const thisWeekDurations = thisWeekEvents.map((e: any) => e.properties?.duration_seconds || 0).filter(Boolean)
  const lastWeekDurations = lastWeekEvents.map((e: any) => e.properties?.duration_seconds || 0).filter(Boolean)

  const thisUnder45 = thisWeekEvents.filter((e: any) => e.properties?.met_45s_target).length
  const lastUnder45 = lastWeekEvents.filter((e: any) => e.properties?.met_45s_target).length

  const thisAvgDuration = Math.round(average(thisWeekDurations))
  const lastAvgDuration = Math.round(average(lastWeekDurations))

  return {
    thisWeek: {
      sessions:     thisWeekNotes.length,
      avgDuration:  thisAvgDuration,
      under45sRate: thisWeekEvents.length > 0 ? Math.round((thisUnder45 / thisWeekEvents.length) * 100) / 100 : 0,
    },
    lastWeek: {
      sessions:     lastWeekNotes.length,
      avgDuration:  lastAvgDuration,
      under45sRate: lastWeekEvents.length > 0 ? Math.round((lastUnder45 / lastWeekEvents.length) * 100) / 100 : 0,
    },
    sessionsDelta: thisWeekNotes.length - lastWeekNotes.length,
    durationDelta: thisAvgDuration - lastAvgDuration,  // negative = improved (faster)
  }
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Compute full analytics stats for a doctor over a given period.
 * Scoped strictly to the provided doctorId.
 */
export async function getDoctorStats(
  doctorId: string,
  period: StatsPeriod = '30d',
): Promise<DoctorStatsResult> {
  const startDate = periodToStartDate(period)

  // Fetch both data sources in parallel
  const [events, notes] = await Promise.all([
    fetchSessionEvents(doctorId, startDate),
    fetchClinicalNotes(doctorId, startDate),
  ])

  const summary          = computeSummary(events, notes)
  const trends           = computeTrendsWithEvents(notes, events)
  const topComplaints    = computeTopComplaints(notes, summary.totalSessions)
  const topMedications   = computeTopMedications(notes, summary.totalSessions)
  const weeklyComparison = computeWeeklyComparison(events, notes)

  return {
    period,
    generatedAt:   new Date().toISOString(),
    summary,
    trends,
    topComplaints,
    topMedications,
    weeklyComparison,
  }
}
