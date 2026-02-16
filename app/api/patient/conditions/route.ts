import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type ConditionStatus = 'active' | 'resolved'

function normalizeDiagnosisList(input: any): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item: any) => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object') {
        const text = item.text || item.name || item.diagnosis
        return typeof text === 'string' ? text.trim() : ''
      }
      return ''
    })
    .filter(Boolean)
}

function isMissingTableError(error: any, tableName: string) {
  const message = String(error?.message || '').toLowerCase()
  return (
    error?.code === '42P01' ||
    (message.includes('does not exist') && message.includes(tableName)) ||
    (message.includes('schema cache') && message.includes(`public.${tableName}`))
  )
}

function parseConditionStatus(description: string | null): ConditionStatus {
  const text = String(description || '').toLowerCase()
  if (text.includes('status: resolved') || text.includes('status=resolved')) {
    return 'resolved'
  }
  return 'active'
}

export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const admin = createAdminClient()

    const [notesResult, recordsResult, chronicResult] = await Promise.all([
      admin
        .from('clinical_notes')
        .select('id, created_at, diagnosis')
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200),
      admin
        .from('patient_medical_records')
        .select('id, title, description, date')
        .eq('patient_id', user.id)
        .eq('record_type', 'diagnosis')
        .order('date', { ascending: false })
        .limit(200),
      admin
        .from('chronic_conditions')
        .select('id, condition_name, diagnosed_date, status')
        .eq('patient_id', user.id)
        .order('diagnosed_date', { ascending: false })
    ])

    if (notesResult.error) throw notesResult.error
    if (recordsResult.error) throw recordsResult.error
    if (chronicResult.error && !isMissingTableError(chronicResult.error, 'chronic_conditions')) {
      throw chronicResult.error
    }

    const conditionByName = new Map<string, any>()

    ;(notesResult.data || []).forEach((note: any) => {
      const diagnoses = normalizeDiagnosisList(note.diagnosis)
      diagnoses.forEach((name) => {
        const key = name.toLowerCase()
        if (!conditionByName.has(key)) {
          conditionByName.set(key, {
            id: `note-${note.id}-${key}`,
            name,
            diagnosed_date: note.created_at,
            status: 'active',
            source: 'clinical_notes'
          })
        }
      })
    })

    ;(recordsResult.data || []).forEach((record: any) => {
      const name = String(record.title || '').trim()
      if (!name) return
      const key = name.toLowerCase()
      if (!conditionByName.has(key)) {
        conditionByName.set(key, {
          id: `record-${record.id}`,
          name,
          diagnosed_date: record.date,
          status: parseConditionStatus(record.description),
          source: 'patient_record'
        })
      }
    })

    if (!chronicResult.error) {
      ;(chronicResult.data || []).forEach((row: any) => {
        const name = String(row.condition_name || '').trim()
        if (!name) return
        const key = name.toLowerCase()
        if (!conditionByName.has(key)) {
          conditionByName.set(key, {
            id: `chronic-${row.id}`,
            name,
            diagnosed_date: row.diagnosed_date,
            status: row.status === 'resolved' ? 'resolved' : 'active',
            source: 'chronic_conditions'
          })
        }
      })
    }

    const conditions = Array.from(conditionByName.values()).sort((a, b) => {
      const aTime = new Date(a.diagnosed_date || 0).getTime()
      const bTime = new Date(b.diagnosed_date || 0).getTime()
      return bTime - aTime
    })

    return NextResponse.json({ success: true, conditions })
  } catch (error: any) {
    console.error('Patient conditions error:', error)
    return toApiErrorResponse(error, 'Failed to fetch conditions')
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('patient')
    const supabase = await createClient()
    const body = await request.json()

    const name = String(body.name || '').trim()
    const diagnosedDate = String(body.diagnosed_date || '').trim() || new Date().toISOString().split('T')[0]
    const status: ConditionStatus = body.status === 'resolved' ? 'resolved' : 'active'
    const notes = body.notes ? String(body.notes).trim() : ''

    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Condition name must be at least 2 characters' }, { status: 400 })
    }

    const descriptionParts = [`Status: ${status}`]
    if (notes) descriptionParts.push(`Notes: ${notes}`)

    const { data, error } = await supabase
      .from('patient_medical_records')
      .insert({
        patient_id: user.id,
        record_type: 'diagnosis',
        title: name,
        description: descriptionParts.join('\n'),
        date: diagnosedDate
      })
      .select('id, title, description, date')
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      condition: {
        id: `record-${data.id}`,
        name: data.title,
        diagnosed_date: data.date,
        status: parseConditionStatus(data.description),
        source: 'patient_record'
      }
    })
  } catch (error: any) {
    console.error('Create condition error:', error)
    return toApiErrorResponse(error, 'Failed to create condition')
  }
}
