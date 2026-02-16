import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function diagnosisToText(diagnosis: any): string {
  if (!diagnosis) return ''
  if (typeof diagnosis === 'string') return diagnosis
  if (Array.isArray(diagnosis)) {
    return diagnosis
      .map((d) => {
        if (typeof d === 'string') return d
        if (!d) return ''
        const code = d.icd10_code ? `${d.icd10_code}: ` : ''
        return `${code}${d.text || ''}`.trim()
      })
      .filter(Boolean)
      .join(', ')
  }
  return ''
}

function medicationsToUi(medications: any): Array<{
  name: string
  type: string
  frequency: string
  duration: string
  endDate?: string
  notes?: string
  taperingInstructions?: string
}> {
  if (!Array.isArray(medications)) return []
  return medications.map((m) => ({
    name: m?.name || m?.drug || 'Unnamed Medication',
    type: m?.type || 'pill',
    frequency: m?.frequency || '',
    duration: m?.duration || '',
    endDate: m?.endDate,
    notes: m?.notes,
    taperingInstructions: m?.taperingInstructions
  }))
}

export async function GET(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const { searchParams } = new URL(request.url)
    const noteId = searchParams.get('noteId')

    if (!noteId) {
      return NextResponse.json(
        { error: 'Missing noteId parameter' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const admin = createAdminClient()

    // Authorization check first: note must belong to current doctor.
    const { data: note, error: noteError } = await supabase
      .from('clinical_notes')
      .select(`
        id,
        doctor_id,
        patient_id,
        prescription_number,
        prescription_date,
        diagnosis,
        medications,
        chief_complaint,
        created_at,
        doctor:doctors (
          id,
          full_name,
          specialty,
          unique_id
        )
      `)
      .eq('id', noteId)
      .eq('doctor_id', user.id)
      .single()

    if (noteError || !note) {
      return NextResponse.json(
        { error: 'Prescription not found' },
        { status: 404 }
      )
    }

    // Use admin for patient read to avoid RLS null joins on non-appointment notes.
    let patient: any = null
    if (note.patient_id) {
      const { data: patientData } = await admin
        .from('patients')
        .select('id, full_name, age, sex')
        .eq('id', note.patient_id)
        .maybeSingle()
      patient = patientData || null
    }

    const payload = {
      id: note.id,
      prescription_number: note.prescription_number || null,
      prescription_date: note.prescription_date || note.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
      chief_complaints: note.chief_complaint || [],
      diagnosis: diagnosisToText(note.diagnosis),
      medications: medicationsToUi(note.medications),
      patient: {
        id: patient?.id || note.patient_id,
        full_name: patient?.full_name || 'Unknown Patient',
        age: patient?.age ?? undefined,
        sex: patient?.sex ?? undefined
      },
      doctor: {
        id: (note.doctor as any)?.id || user.id,
        full_name: (note.doctor as any)?.full_name || 'Doctor',
        specialty: (note.doctor as any)?.specialty || '',
        license_number: null,
        unique_id: (note.doctor as any)?.unique_id || null
      }
    }

    return NextResponse.json({
      success: true,
      note: payload
    })
  } catch (error: any) {
    console.error('Prescription fetch error:', error)
    return toApiErrorResponse(error, 'Failed to load prescription')
  }
}
