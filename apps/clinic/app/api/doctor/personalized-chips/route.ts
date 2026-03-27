export const dynamic = 'force-dynamic'

/**
 * GET /api/doctor/personalized-chips
 *
 * Returns complaint and diagnosis chips ranked by how often THIS doctor has used them,
 * derived from their clinical_notes history.  No new table required — we aggregate
 * directly from clinical_notes.
 *
 * Response:
 *   { complaints: string[], diagnoses: string[] }
 *
 * Falls back to a general Egyptian-GP default list when the doctor has < 5 notes.
 */

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'

// ── Default fallbacks (used until doctor has enough history) ──────────────────

const DEFAULT_COMPLAINTS = [
  'صداع', 'كحة', 'سخونية', 'ألم بطن', 'ألم ظهر',
  'ألم حلق', 'رشح', 'إسهال', 'إمساك', 'غثيان',
  'دوخة', 'ضيق تنفس', 'ألم صدر', 'ألم مفاصل', 'طفح جلدي',
  'حرقان بول', 'ارتفاع ضغط', 'ارتفاع سكر', 'أرق', 'تعب عام',
]

const DEFAULT_DIAGNOSES = [
  'ارتفاع ضغط الدم الأساسي',
  'داء السكري من النوع الثاني',
  'التهاب الجهاز التنفسي العلوي',
  'نزلة برد',
  'التهاب المعدة',
  'حمى',
  'التهاب البلعوم الحاد',
  'التهاب الأنف التحسسي',
  'ألم أسفل الظهر',
  'التهاب المسالك البولية',
]

// ── Minimum notes before we switch to personalised order ─────────────────────
const MIN_NOTES_FOR_PERSONALISATION = 5

export async function GET() {
  try {
    const user = await requireApiRole('doctor')
    const admin = createAdminClient('personalized-chips')

    // Fetch all clinical notes for this doctor (we only need chief_complaint, diagnosis, note_data)
    const { data: notes, error } = await admin
      .from('clinical_notes')
      .select('chief_complaint, diagnosis, note_data')
      .eq('doctor_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500) // Cap to last 500 sessions — enough signal, avoids huge payloads

    if (error) throw error

    const noteCount = notes?.length ?? 0

    // ── Complaints frequency map ──────────────────────────────────────────────
    const complaintFreq: Record<string, number> = {}

    for (const note of notes ?? []) {
      // chief_complaint is stored as string[] in the DB
      const complaints: string[] = Array.isArray(note.chief_complaint)
        ? note.chief_complaint
        : typeof note.chief_complaint === 'string'
          ? [note.chief_complaint]
          : []

      for (const c of complaints) {
        const trimmed = c.trim()
        if (trimmed) complaintFreq[trimmed] = (complaintFreq[trimmed] ?? 0) + 1
      }
    }

    // ── Diagnoses frequency map ───────────────────────────────────────────────
    const diagnosisFreq: Record<string, number> = {}

    for (const note of notes ?? []) {
      // diagnosis column is string[] of "CODE: Description" strings
      const rawDiagnoses: string[] = Array.isArray(note.diagnosis)
        ? note.diagnosis
        : []

      // Also check note_data.diagnosis for older records
      const nd = (note.note_data || {}) as any
      const legacyDx: string[] = typeof nd.diagnosis === 'string'
        ? [nd.diagnosis]
        : Array.isArray(nd.diagnosis)
          ? nd.diagnosis
          : []

      for (const d of [...rawDiagnoses, ...legacyDx]) {
        const trimmed = (d as string).trim()
        if (trimmed) diagnosisFreq[trimmed] = (diagnosisFreq[trimmed] ?? 0) + 1
      }
    }

    // ── Sort by frequency (desc) ──────────────────────────────────────────────
    const sortedComplaints = Object.entries(complaintFreq)
      .sort((a, b) => b[1] - a[1])
      .map(([text]) => text)

    const sortedDiagnoses = Object.entries(diagnosisFreq)
      .sort((a, b) => b[1] - a[1])
      .map(([text]) => text)

    // ── Merge personalised + defaults (personalised first, then fill from defaults) ──
    const complaints = noteCount >= MIN_NOTES_FOR_PERSONALISATION
      ? mergeUnique(sortedComplaints, DEFAULT_COMPLAINTS, 20)
      : DEFAULT_COMPLAINTS

    const diagnoses = noteCount >= MIN_NOTES_FOR_PERSONALISATION
      ? mergeUnique(sortedDiagnoses, DEFAULT_DIAGNOSES, 10)
      : DEFAULT_DIAGNOSES

    return NextResponse.json({ complaints, diagnoses, personalised: noteCount >= MIN_NOTES_FOR_PERSONALISATION })
  } catch (error: any) {
    return toApiErrorResponse(error, 'Failed to load personalised chips')
  }
}

/** Return up to `limit` items from `primary`, then fill remaining slots from `fallback`. */
function mergeUnique(primary: string[], fallback: string[], limit: number): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const item of [...primary, ...fallback]) {
    if (result.length >= limit) break
    if (!seen.has(item)) {
      seen.add(item)
      result.push(item)
    }
  }

  return result
}
