export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { NextResponse } from 'next/server'

function isMissingTableError(error: any, tableName: string) {
  const message = String(error?.message || '').toLowerCase()
  return (
    error?.code === '42P01' ||
    (message.includes('does not exist') && message.includes(tableName)) ||
    (message.includes('schema cache') && message.includes(`public.${tableName}`))
  )
}

function parseImmunizationFromRecord(record: any) {
  const title = String(record.title || '').trim()
  const description = String(record.description || '')

  if (!title.toLowerCase().startsWith('immunization:') && !title.toLowerCase().startsWith('vaccine:')) {
    return null
  }

  const vaccineName = title.includes(':') ? title.split(':').slice(1).join(':').trim() : title
  const doseMatch = description.match(/dose:\s*(.+)/i)
  const lotMatch = description.match(/lot:\s*(.+)/i)
  const notesMatch = description.match(/notes:\s*(.+)/i)

  return {
    id: `record-${record.id}`,
    vaccine_name: vaccineName,
    administered_date: record.date,
    provider_name: record.provider_name || null,
    facility_name: record.facility_name || null,
    dose: doseMatch?.[1]?.trim() || null,
    lot_number: lotMatch?.[1]?.trim() || null,
    notes: notesMatch?.[1]?.trim() || null,
    source: 'patient_record'
  }
}

export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const supabase = await createClient()

    const [recordsResult, tableResult] = await Promise.all([
      supabase
        .from('patient_medical_records')
        .select('id, title, description, date, provider_name, facility_name')
        .eq('patient_id', user.id)
        .eq('record_type', 'procedure')
        .order('date', { ascending: false }),
      supabase
        .from('immunizations')
        .select('id, vaccine_name, administered_date, provider_name, facility_name, dose, lot_number, notes')
        .eq('patient_id', user.id)
        .order('administered_date', { ascending: false })
    ])

    if (recordsResult.error) throw recordsResult.error
    if (tableResult.error && !isMissingTableError(tableResult.error, 'immunizations')) {
      throw tableResult.error
    }

    const recordImmunizations = (recordsResult.data || [])
      .map(parseImmunizationFromRecord)
      .filter((item): item is NonNullable<typeof item> => !!item)

    const tableImmunizations = tableResult.error
      ? []
      : (tableResult.data || []).map((row: any) => ({
          id: `table-${row.id}`,
          vaccine_name: row.vaccine_name,
          administered_date: row.administered_date,
          provider_name: row.provider_name || null,
          facility_name: row.facility_name || null,
          dose: row.dose || null,
          lot_number: row.lot_number || null,
          notes: row.notes || null,
          source: 'immunizations'
        }))

    const byVaccineDate = new Map<string, any>()
    ;[...tableImmunizations, ...recordImmunizations].forEach((item) => {
      const key = `${String(item.vaccine_name || '').toLowerCase().trim()}::${String(item.administered_date || '')}`
      if (!key.startsWith('::') && !byVaccineDate.has(key)) {
        byVaccineDate.set(key, item)
      }
    })

    const immunizations = Array.from(byVaccineDate.values()).sort((a, b) => {
      const aTime = new Date(a.administered_date || 0).getTime()
      const bTime = new Date(b.administered_date || 0).getTime()
      return bTime - aTime
    })

    return NextResponse.json({ success: true, immunizations })
  } catch (error: any) {
    console.error('Patient immunizations error:', error)
    return toApiErrorResponse(error, 'Failed to fetch immunizations')
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('patient')
    const supabase = await createClient()
    const body = await request.json()

    const vaccineName = String(body.vaccine_name || '').trim()
    const administeredDate = String(body.administered_date || '').trim() || new Date().toISOString().split('T')[0]
    const providerName = body.provider_name ? String(body.provider_name).trim() : null
    const facilityName = body.facility_name ? String(body.facility_name).trim() : null
    const dose = body.dose ? String(body.dose).trim() : null
    const lotNumber = body.lot_number ? String(body.lot_number).trim() : null
    const notes = body.notes ? String(body.notes).trim() : null

    if (!vaccineName || vaccineName.length < 2) {
      return NextResponse.json({ error: 'vaccine_name must be at least 2 characters' }, { status: 400 })
    }

    const descriptionParts: string[] = []
    if (dose) descriptionParts.push(`Dose: ${dose}`)
    if (lotNumber) descriptionParts.push(`Lot: ${lotNumber}`)
    if (notes) descriptionParts.push(`Notes: ${notes}`)

    const { data, error } = await supabase
      .from('patient_medical_records')
      .insert({
        patient_id: user.id,
        record_type: 'procedure',
        title: `Immunization: ${vaccineName}`,
        description: descriptionParts.join('\n') || null,
        date: administeredDate,
        provider_name: providerName,
        facility_name: facilityName
      })
      .select('id, title, description, date, provider_name, facility_name')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, immunization: parseImmunizationFromRecord(data) })
  } catch (error: any) {
    console.error('Create immunization error:', error)
    return toApiErrorResponse(error, 'Failed to create immunization')
  }
}
