export const dynamic = 'force-dynamic'

/**
 * /api/patient/diary — B07 Phase F.5 cross-context extension.
 *
 * GET: read diary entries for active gp. Minor → empty.
 * POST: add diary entry. Delegates rejected (no MVP capability —
 *       diary is a personal-tracking surface, not a coordination one).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import {
  requireApiRole,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import {
  emptyForCrossContext,
  resolvePatientContext,
} from '@shared/lib/auth/patient-context'

type DiaryRow = {
  id: string
  entry_date: string
  mood_score: number | null
  severity: number | null
  content: string | null
  tags: string[] | null
  created_at: string
}

function clampScale(value: unknown, fallback: 3): 1 | 2 | 3 | 4 | 5 {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback as 1 | 2 | 3 | 4 | 5
  if (num <= 1) return 1
  if (num >= 5) return 5
  return Math.round(num) as 1 | 2 | 3 | 4 | 5
}

function parseContent(content: string | null): Record<string, any> {
  if (!content) return {}
  try {
    const parsed = JSON.parse(content)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function mapDiaryRowToUi(row: DiaryRow) {
  const parsed = parseContent(row.content)
  const symptoms = Array.isArray(parsed.symptoms)
    ? parsed.symptoms.filter((s: any) => typeof s === 'string')
    : Array.isArray(row.tags)
      ? row.tags.filter((s) => typeof s === 'string')
      : []

  const fallbackNotes =
    row.content && row.content.trim().startsWith('{')
      ? ''
      : row.content || ''

  return {
    id: row.id,
    date: row.entry_date,
    mood: clampScale(row.mood_score, 3),
    energy: clampScale(parsed.energy, 3),
    sleep_quality: clampScale(parsed.sleep_quality, 3),
    sleep_hours: Number.isFinite(Number(parsed.sleep_hours))
      ? Number(parsed.sleep_hours)
      : 0,
    symptoms,
    notes: typeof parsed.notes === 'string' ? parsed.notes : fallbackNotes,
    created_at: row.created_at,
  }
}

// GET /api/patient/diary
export async function GET(request: Request) {
  try {
    const user = await requireApiRole('patient')
    const ctx = await resolvePatientContext({
      request,
      userId: user.id,
    })

    if (ctx.resolvedPatientId === null) {
      return NextResponse.json(emptyForCrossContext({ entries: [] }))
    }

    const supabase = createAdminClient('patient-diary')

    const { data, error } = await supabase
      .from('patient_diary')
      .select(
        'id, entry_date, mood_score, severity, content, tags, created_at'
      )
      .eq('patient_id', ctx.resolvedPatientId)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) throw error

    const entries = (data || []).map((row) =>
      mapDiaryRowToUi(row as DiaryRow)
    )
    return NextResponse.json({ entries })
  } catch (error: any) {
    console.error('Diary fetch error:', error)
    return toApiErrorResponse(error, 'Failed to fetch diary entries')
  }
}

// POST /api/patient/diary
export async function POST(request: NextRequest) {
  try {
    const user = await requireApiRole('patient')
    const ctx = await resolvePatientContext({
      request,
      userId: user.id,
      denyDelegates: true,
    })

    if (ctx.resolvedPatientId === null) {
      return NextResponse.json(
        { error: 'Cannot create diary entries for this account context' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient('patient-diary-create')
    const body = await request.json()

    const { date, mood, energy, sleep_quality, sleep_hours, symptoms, notes } =
      body

    // Validate required fields
    if (!date || !mood || !energy || !sleep_quality) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Check if entry for this date already exists
    const { data: existing } = await supabase
      .from('patient_diary')
      .select('id')
      .eq('patient_id', ctx.resolvedPatientId)
      .eq('entry_date', date)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'Entry for this date already exists' },
        { status: 409 }
      )
    }

    const mappedMood = clampScale(mood, 3)
    const normalizedSymptoms = Array.isArray(symptoms)
      ? symptoms.filter((s: any) => typeof s === 'string')
      : []

    const { data, error } = await supabase
      .from('patient_diary')
      .insert({
        patient_id: ctx.resolvedPatientId,
        entry_date: date,
        entry_type: 'mood',
        title: 'Daily Check-in',
        mood_score: mappedMood,
        severity: clampScale(energy, 3),
        tags: normalizedSymptoms,
        content: JSON.stringify({
          notes: typeof notes === 'string' ? notes : '',
          symptoms: normalizedSymptoms,
          energy: clampScale(energy, 3),
          sleep_quality: clampScale(sleep_quality, 3),
          sleep_hours: Number.isFinite(Number(sleep_hours))
            ? Number(sleep_hours)
            : 0,
        }),
      })
      .select(
        'id, entry_date, mood_score, severity, content, tags, created_at'
      )
      .single()

    if (error) throw error

    return NextResponse.json(
      { entry: mapDiaryRowToUi(data as DiaryRow) },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Diary create error:', error)
    return toApiErrorResponse(error, 'Failed to create diary entry')
  }
}
