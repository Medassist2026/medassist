import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type AllergySeverity = 'mild' | 'moderate' | 'severe'

function isMissingTableError(error: any, tableName: string) {
  const message = String(error?.message || '').toLowerCase()
  return (
    error?.code === '42P01' ||
    (message.includes('does not exist') && message.includes(tableName)) ||
    (message.includes('schema cache') && message.includes(`public.${tableName}`))
  )
}

function normalizeSeverity(value: string | null | undefined): AllergySeverity {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'mild' || normalized === 'moderate' || normalized === 'severe') {
    return normalized
  }
  return 'moderate'
}

function parseAllergyFromRecord(record: any) {
  const title = String(record.title || '').trim()
  const description = String(record.description || '')

  const allergenFromTitle = title.toLowerCase().startsWith('allergy:')
    ? title.slice(8).trim()
    : ''
  const allergenMatch = description.match(/allergen:\s*(.+)/i)
  const reactionMatch = description.match(/reaction:\s*(.+)/i)
  const severityMatch = description.match(/severity:\s*(.+)/i)
  const notesMatch = description.match(/notes:\s*(.+)/i)

  const allergen = allergenFromTitle || allergenMatch?.[1]?.trim() || title
  if (!allergen) return null

  return {
    id: `record-${record.id}`,
    allergen,
    reaction: reactionMatch?.[1]?.trim() || 'Not specified',
    severity: normalizeSeverity(severityMatch?.[1]),
    recorded_date: record.date,
    notes: notesMatch?.[1]?.trim() || null,
    source: 'patient_record'
  }
}

export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const admin = createAdminClient()

    const [recordsResult, tableResult] = await Promise.all([
      admin
        .from('patient_medical_records')
        .select('id, title, description, date')
        .eq('patient_id', user.id)
        .eq('record_type', 'other')
        .order('date', { ascending: false }),
      admin
        .from('patient_allergies')
        .select('id, allergen, reaction, severity, recorded_date, notes')
        .eq('patient_id', user.id)
        .order('recorded_date', { ascending: false })
    ])

    if (recordsResult.error) throw recordsResult.error
    if (tableResult.error && !isMissingTableError(tableResult.error, 'patient_allergies')) {
      throw tableResult.error
    }

    const recordAllergies = (recordsResult.data || [])
      .map(parseAllergyFromRecord)
      .filter((item): item is NonNullable<typeof item> => !!item)
      .filter((item) => item.allergen.length > 0)
      .filter((item) => String(item.id).length > 0)
      .filter((item) => item.allergen.toLowerCase() !== 'other')
      .filter((item) => item.allergen.toLowerCase() !== 'misc')
      .filter((item) => item.allergen.toLowerCase() !== 'none')
      .filter((item) => item.allergen.toLowerCase() !== 'n/a')
      .filter((item) => item.allergen.toLowerCase() !== 'na')

    const tableAllergies = tableResult.error
      ? []
      : (tableResult.data || []).map((row: any) => ({
          id: `table-${row.id}`,
          allergen: row.allergen,
          reaction: row.reaction || 'Not specified',
          severity: normalizeSeverity(row.severity),
          recorded_date: row.recorded_date,
          notes: row.notes || null,
          source: 'patient_allergies'
        }))

    const byAllergen = new Map<string, any>()
    ;[...tableAllergies, ...recordAllergies].forEach((item) => {
      const key = String(item.allergen || '').toLowerCase().trim()
      if (!key) return
      if (!byAllergen.has(key)) byAllergen.set(key, item)
    })

    const allergies = Array.from(byAllergen.values()).sort((a, b) => {
      const aTime = new Date(a.recorded_date || 0).getTime()
      const bTime = new Date(b.recorded_date || 0).getTime()
      return bTime - aTime
    })

    return NextResponse.json({ success: true, allergies })
  } catch (error: any) {
    console.error('Patient allergies error:', error)
    return toApiErrorResponse(error, 'Failed to fetch allergies')
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('patient')
    const supabase = await createClient()
    const body = await request.json()

    const allergen = String(body.allergen || '').trim()
    const reaction = String(body.reaction || '').trim()
    const severity = normalizeSeverity(body.severity)
    const notes = body.notes ? String(body.notes).trim() : ''
    const recordedDate = String(body.recorded_date || '').trim() || new Date().toISOString().split('T')[0]

    if (!allergen || allergen.length < 2) {
      return NextResponse.json({ error: 'Allergen must be at least 2 characters' }, { status: 400 })
    }

    const descriptionParts = [
      `Reaction: ${reaction || 'Not specified'}`,
      `Severity: ${severity}`
    ]
    if (notes) descriptionParts.push(`Notes: ${notes}`)

    const { data, error } = await supabase
      .from('patient_medical_records')
      .insert({
        patient_id: user.id,
        record_type: 'other',
        title: `Allergy: ${allergen}`,
        description: descriptionParts.join('\n'),
        date: recordedDate
      })
      .select('id, title, description, date')
      .single()

    if (error) throw error

    const parsed = parseAllergyFromRecord(data)
    return NextResponse.json({ success: true, allergy: parsed })
  } catch (error: any) {
    console.error('Create allergy error:', error)
    return toApiErrorResponse(error, 'Failed to create allergy')
  }
}
