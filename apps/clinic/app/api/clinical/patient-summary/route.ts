export const dynamic = 'force-dynamic'

/**
 * GET /api/clinical/patient-summary?patientId=xxx
 *
 * Returns a compact clinical summary for a returning patient, used to populate
 * the "Living Patient Card" in the session form.
 *
 * Pulls from clinical_notes written by THIS doctor for THIS patient only.
 * Respects data isolation — doctors only see their own notes.
 *
 * Response shape:
 * {
 *   isReturning: boolean          — false when no prior notes exist
 *   totalVisits: number
 *   lastVisit: { ... } | null
 *   visitTimeline: [...]          — last 6 visits, newest first
 *   allergies: string[]           — from most recent note
 *   chronicDiseases: string[]     — from most recent note
 *   pendingFollowUp: { date, notes } | null  — from last note's follow_up_date
 * }
 */

import { NextResponse } from 'next/server'
import { requireApiRole } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'

export async function GET(request: Request) {
  try {
    const user    = await requireApiRole('doctor')
    const { searchParams } = new URL(request.url)
    const patientId = searchParams.get('patientId')

    if (!patientId) {
      return NextResponse.json({ error: 'patientId required' }, { status: 400 })
    }

    const supabase = createAdminClient('patient-summary')

    // Fetch last 10 clinical notes by this doctor for this patient, newest first
    const { data: notes, error } = await supabase
      .from('clinical_notes')
      .select('id, created_at, chief_complaint, diagnosis, medications, plan, note_data')
      .eq('doctor_id', user.id)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('[patient-summary] DB error:', error)
      return NextResponse.json({ isReturning: false, totalVisits: 0, lastVisit: null, visitTimeline: [], allergies: [], chronicDiseases: [], pendingFollowUp: null })
    }

    if (!notes || notes.length === 0) {
      return NextResponse.json({ isReturning: false, totalVisits: 0, lastVisit: null, visitTimeline: [], allergies: [], chronicDiseases: [], pendingFollowUp: null })
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    function extractComplaints(note: any): string[] {
      // chief_complaint is stored as a string[] column
      if (Array.isArray(note.chief_complaint)) return note.chief_complaint.filter(Boolean)
      const nd = note.note_data || {}
      if (Array.isArray(nd.chief_complaint)) return nd.chief_complaint.filter(Boolean)
      return []
    }

    function extractDiagnoses(note: any): string[] {
      // diagnosis is stored as [{icd10_code, text}]
      if (Array.isArray(note.diagnosis)) {
        return note.diagnosis
          .map((d: any) => d?.text || d)
          .filter((t: any) => typeof t === 'string' && t.trim())
      }
      return []
    }

    function extractMedications(note: any): Array<{ name: string; frequency: string; duration: string }> {
      // medications stored as [{drug, frequency, duration, notes}]
      const src = Array.isArray(note.medications) && note.medications.length > 0
        ? note.medications
        : ((note.note_data || {}).medications || [])
      return src.map((m: any) => ({
        name:      m.drug || m.name || '',
        frequency: m.frequency || '',
        duration:  m.duration || '',
      })).filter((m: any) => m.name)
    }

    function extractFollowUp(note: any): { date: string; notes: string } | null {
      const nd = note.note_data || {}
      if (!nd.follow_up_date) return null
      // Only surface if follow-up is in the future
      try {
        if (new Date(nd.follow_up_date) < new Date()) return null
      } catch { return null }
      return { date: nd.follow_up_date, notes: nd.follow_up_notes || '' }
    }

    // ── Build response ───────────────────────────────────────────────────────

    const most_recent = notes[0]
    const nd_recent   = most_recent.note_data || {}

    // Last visit (full detail)
    const lastVisit = {
      id:          most_recent.id,
      date:        most_recent.created_at,
      complaints:  extractComplaints(most_recent),
      diagnoses:   extractDiagnoses(most_recent),
      medications: extractMedications(most_recent),
      plan:        most_recent.plan || (nd_recent.plan || ''),
    }

    // Timeline (compact) — last 6 visits
    const visitTimeline = notes.slice(0, 6).map((note: any) => ({
      id:          note.id,
      date:        note.created_at,
      complaints:  extractComplaints(note),
      medCount:    extractMedications(note).length,
      diagCount:   extractDiagnoses(note).length,
    }))

    // Clinical context — from most recent note
    const allergies       = nd_recent.allergies        || []
    const chronicDiseases = nd_recent.chronic_diseases || []

    // Pending follow-up — scan last few notes in case the last note doesn't have one
    let pendingFollowUp: { date: string; notes: string } | null = null
    for (const note of notes.slice(0, 3)) {
      pendingFollowUp = extractFollowUp(note)
      if (pendingFollowUp) break
    }

    return NextResponse.json({
      isReturning:    true,
      totalVisits:    notes.length,          // up to 10; use as "at least N"
      lastVisit,
      visitTimeline,
      allergies,
      chronicDiseases,
      pendingFollowUp,
    })

  } catch (error: any) {
    console.error('[patient-summary] Unexpected error:', error)
    return NextResponse.json({ isReturning: false, totalVisits: 0, lastVisit: null, visitTimeline: [], allergies: [], chronicDiseases: [], pendingFollowUp: null })
  }
}
