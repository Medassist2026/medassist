export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'

type ImagingModality = 'xray' | 'ct' | 'mri' | 'ultrasound' | 'other'
type ImagingPriority = 'routine' | 'urgent' | 'stat'
type ImagingStatus = 'requested' | 'scheduled' | 'completed' | 'cancelled'

const VALID_MODALITIES: ImagingModality[] = ['xray', 'ct', 'mri', 'ultrasound', 'other']
const VALID_PRIORITIES: ImagingPriority[] = ['routine', 'urgent', 'stat']
const VALID_STATUSES: ImagingStatus[] = ['requested', 'scheduled', 'completed', 'cancelled']

const MODALITY_LABELS: Record<ImagingModality, string> = {
  xray: 'X-ray',
  ct: 'CT',
  mri: 'MRI',
  ultrasound: 'Ultrasound',
  other: 'Other'
}

function isMissingTableError(error: any, tableName: string) {
  const message = String(error?.message || '').toLowerCase()
  return (
    error?.code === '42P01' ||
    (message.includes('does not exist') && message.includes(tableName)) ||
    (message.includes('schema cache') && message.includes(`public.${tableName}`))
  )
}

function parseLegacyMetadata(description: string | null) {
  const metadata: Record<string, string> = {}
  if (!description) return metadata

  const lines = description.split('\n').map((line) => line.trim()).filter(Boolean)
  lines.forEach((line) => {
    const idx = line.indexOf('=')
    if (idx > 0) {
      const key = line.slice(0, idx).trim().toLowerCase()
      const value = line.slice(idx + 1).trim()
      metadata[key] = value
    }
  })
  return metadata
}

function detectModality(studyName: string, fallback?: string): ImagingModality {
  const candidate = (fallback || studyName).toLowerCase()
  if (candidate.includes('x-ray') || candidate.includes('xray')) return 'xray'
  if (candidate.includes('ct')) return 'ct'
  if (candidate.includes('mri')) return 'mri'
  if (candidate.includes('ultrasound') || candidate.includes('us')) return 'ultrasound'
  return 'other'
}

function normalizeLegacyOrder(record: any) {
  const metadata = parseLegacyMetadata(record.description)
  const modality = VALID_MODALITIES.includes(metadata.modality as ImagingModality)
    ? (metadata.modality as ImagingModality)
    : detectModality(record.title || '', metadata.modality)

  const status = VALID_STATUSES.includes(metadata.status as ImagingStatus)
    ? (metadata.status as ImagingStatus)
    : 'requested'
  const priority = VALID_PRIORITIES.includes(metadata.priority as ImagingPriority)
    ? (metadata.priority as ImagingPriority)
    : 'routine'

  return {
    id: record.id,
    patient_id: record.patient_id,
    doctor_id: null,
    modality,
    study_name: record.title || `${MODALITY_LABELS[modality]} Study`,
    clinical_indication: metadata.indication || record.description || null,
    priority,
    status,
    facility_name: record.facility_name || null,
    ordered_at: record.created_at,
    scheduled_for: record.date ? `${record.date}T09:00:00.000Z` : null,
    completed_at: status === 'completed' ? record.updated_at : null,
    source: 'legacy_record',
    patient: record.patient || null,
    doctor: record.provider_name ? { full_name: record.provider_name } : null
  }
}

async function doctorHasPatientAccess(admin: ReturnType<typeof createAdminClient>, doctorId: string, patientId: string) {
  const [relationshipResult, appointmentResult, noteResult] = await Promise.all([
    admin
      .from('doctor_patient_relationships')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .limit(1),
    admin
      .from('appointments')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .limit(1),
    admin
      .from('clinical_notes')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .limit(1)
  ])

  if (relationshipResult.error) throw relationshipResult.error
  if (appointmentResult.error) throw appointmentResult.error
  if (noteResult.error) throw noteResult.error

  return (
    (relationshipResult.data || []).length > 0 ||
    (appointmentResult.data || []).length > 0 ||
    (noteResult.data || []).length > 0
  )
}

async function fetchLegacyOrders(admin: ReturnType<typeof createAdminClient>, doctorId: string, patientId?: string, status?: string) {
  const [relationshipsResult, appointmentsResult, notesResult] = await Promise.all([
    admin
      .from('doctor_patient_relationships')
      .select('patient_id')
      .eq('doctor_id', doctorId),
    admin
      .from('appointments')
      .select('patient_id')
      .eq('doctor_id', doctorId),
    admin
      .from('clinical_notes')
      .select('patient_id')
      .eq('doctor_id', doctorId)
  ])

  if (relationshipsResult.error) throw relationshipsResult.error
  if (appointmentsResult.error) throw appointmentsResult.error
  if (notesResult.error) throw notesResult.error

  const patientIds = new Set<string>()
  ;(relationshipsResult.data || []).forEach((row: any) => row.patient_id && patientIds.add(row.patient_id))
  ;(appointmentsResult.data || []).forEach((row: any) => row.patient_id && patientIds.add(row.patient_id))
  ;(notesResult.data || []).forEach((row: any) => row.patient_id && patientIds.add(row.patient_id))

  if (patientId) {
    if (!patientIds.has(patientId)) return []
  } else if (patientIds.size === 0) {
    return []
  }

  let query = admin
    .from('patient_medical_records')
    .select(`
      id,
      patient_id,
      title,
      description,
      date,
      provider_name,
      facility_name,
      created_at,
      updated_at,
      patient:patients (id, full_name, phone, sex, age)
    `)
    .eq('record_type', 'imaging')
    .order('date', { ascending: false })

  if (patientId) {
    query = query.eq('patient_id', patientId)
  } else {
    query = query.in('patient_id', Array.from(patientIds))
  }

  const { data: records, error } = await query
  if (error) throw error

  const normalized = (records || []).map(normalizeLegacyOrder)
  if (status && VALID_STATUSES.includes(status as ImagingStatus)) {
    return normalized.filter((order) => order.status === status)
  }
  return normalized
}

export async function GET(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const admin = createAdminClient('patient-privacy-checks')
    const { searchParams } = new URL(request.url)
    const patientId = searchParams.get('patientId') || undefined
    const status = searchParams.get('status') || undefined

    let query = admin
      .from('imaging_orders')
      .select(`
        id,
        patient_id,
        doctor_id,
        modality,
        study_name,
        clinical_indication,
        priority,
        status,
        facility_name,
        ordered_at,
        scheduled_for,
        completed_at,
        created_at,
        patient:patients (id, full_name, phone, sex, age),
        doctor:doctors (id, full_name, specialty)
      `)
      .eq('doctor_id', user.id)
      .order('ordered_at', { ascending: false })

    if (patientId) query = query.eq('patient_id', patientId)
    if (status && VALID_STATUSES.includes(status as ImagingStatus)) {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) {
      if (isMissingTableError(error, 'imaging_orders')) {
        const orders = await fetchLegacyOrders(admin, user.id, patientId, status)
        return NextResponse.json({ success: true, orders, source: 'legacy_records' })
      }
      throw error
    }

    return NextResponse.json({ success: true, orders: data || [], source: 'imaging_orders' })
  } catch (error: any) {
    console.error('Get imaging orders error:', error)
    return toApiErrorResponse(error, 'Failed to fetch imaging orders')
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const admin = createAdminClient('patient-privacy-checks')
    const body = await request.json()

    const patientId = String(body.patient_id || '').trim()
    const modality = String(body.modality || '').trim().toLowerCase() as ImagingModality
    const studyName = String(body.study_name || '').trim()
    const clinicalIndication = body.clinical_indication ? String(body.clinical_indication).trim() : null
    const facilityName = body.facility_name ? String(body.facility_name).trim() : null
    const priority = String(body.priority || 'routine').trim().toLowerCase() as ImagingPriority
    const scheduledFor = body.scheduled_for ? String(body.scheduled_for).trim() : null

    if (!patientId) {
      return NextResponse.json({ error: 'patient_id is required' }, { status: 400 })
    }
    if (!VALID_MODALITIES.includes(modality)) {
      return NextResponse.json({ error: 'Invalid modality' }, { status: 400 })
    }
    if (!studyName || studyName.length < 3) {
      return NextResponse.json({ error: 'study_name must be at least 3 characters' }, { status: 400 })
    }
    if (!VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
    }

    const { data: patient, error: patientError } = await admin
      .from('patients')
      .select('id, full_name, phone, sex, age')
      .eq('id', patientId)
      .single()
    if (patientError) throw patientError

    const canAccess = await doctorHasPatientAccess(admin, user.id, patientId)
    if (!canAccess) {
      return NextResponse.json(
        { error: 'Patient is not linked to this doctor. Add patient relationship first.' },
        { status: 403 }
      )
    }

    const { data: doctor, error: doctorError } = await admin
      .from('doctors')
      .select('id, full_name, specialty')
      .eq('id', user.id)
      .single()
    if (doctorError) throw doctorError

    const payload = {
      doctor_id: user.id,
      patient_id: patientId,
      modality,
      study_name: studyName,
      clinical_indication: clinicalIndication,
      priority,
      status: 'requested',
      facility_name: facilityName,
      scheduled_for: scheduledFor || null
    }

    const { data: order, error: orderError } = await admin
      .from('imaging_orders')
      .insert(payload)
      .select(`
        id,
        patient_id,
        doctor_id,
        modality,
        study_name,
        clinical_indication,
        priority,
        status,
        facility_name,
        ordered_at,
        scheduled_for,
        completed_at,
        created_at
      `)
      .single()

    if (!orderError) {
      return NextResponse.json({
        success: true,
        order: {
          ...order,
          patient,
          doctor
        }
      })
    }

    if (!isMissingTableError(orderError, 'imaging_orders')) {
      throw orderError
    }

    // Fallback for environments where imaging_orders migration isn't applied yet:
    // persist order semantics inside patient_medical_records (record_type=imaging).
    const today = new Date().toISOString().split('T')[0]
    const metadataLines = [
      '[IMAGING_ORDER]',
      'status=requested',
      `priority=${priority}`,
      `modality=${modality}`,
      clinicalIndication ? `indication=${clinicalIndication}` : null
    ].filter(Boolean)

    const { data: legacyRecord, error: legacyError } = await admin
      .from('patient_medical_records')
      .insert({
        patient_id: patientId,
        record_type: 'imaging',
        title: `${MODALITY_LABELS[modality]}: ${studyName}`,
        description: metadataLines.join('\n'),
        date: scheduledFor ? scheduledFor.split('T')[0] : today,
        provider_name: doctor.full_name || 'Doctor',
        facility_name: facilityName
      })
      .select(`
        id,
        patient_id,
        title,
        description,
        date,
        provider_name,
        facility_name,
        created_at,
        updated_at
      `)
      .single()

    if (legacyError) throw legacyError

    return NextResponse.json({
      success: true,
      order: {
        ...normalizeLegacyOrder({
          ...legacyRecord,
          patient
        }),
        patient,
        doctor
      },
      source: 'legacy_record'
    })
  } catch (error: any) {
    console.error('Create imaging order error:', error)
    return toApiErrorResponse(error, 'Failed to create imaging order')
  }
}
