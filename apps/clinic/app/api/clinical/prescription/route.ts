export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
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
  dosageCount?: string
  frequency: string
  duration: string
  endDate?: string
  notes?: string
  taperingInstructions?: string
}> {
  if (!Array.isArray(medications)) return []
  return medications.map((m) => ({
    name: m?.name || m?.drug || 'دواء',
    type: m?.form || m?.type || 'أقراص',
    dosageCount: m?.dosageCount || '',
    frequency: buildFrequencyString(m),
    duration: m?.duration || '',
    endDate: m?.endDate,
    notes: m?.notes,
    taperingInstructions: m?.taperingInstructions
  }))
}

/** Combine frequency + timings + instructions into a readable frequency string */
function buildFrequencyString(m: any): string {
  let freq = m?.frequency || ''
  if (Array.isArray(m?.timings) && m.timings.length > 0) {
    freq += (freq ? ' · ' : '') + m.timings.join(' + ')
  }
  if (m?.instructions) {
    freq += (freq ? ' · ' : '') + m.instructions
  }
  return freq
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

    // Use admin client to bypass RLS — doctor ownership is enforced by .eq('doctor_id', user.id)
    const admin = createAdminClient('prescription-fetch')

    const { data: note, error: noteError } = await admin
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
        note_data,
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
      console.error('Prescription fetch error:', noteError?.message, { noteId, doctorId: user.id })
      return NextResponse.json(
        { error: 'Prescription not found' },
        { status: 404 }
      )
    }

    // Fetch patient info via admin client (same client, bypasses patient RLS)
    let patient: any = null
    if (note.patient_id) {
      const { data: patientData } = await admin
        .from('patients')
        .select('id, full_name, age, sex, phone')
        .eq('id', note.patient_id)
        .maybeSingle()
      patient = patientData || null
    }

    // Extract extra fields from note_data JSONB
    // note_data stores the full session payload (radiology, labs, follow-up, notes, full med data)
    const noteData = (note as any).note_data || {}

    // Prefer note_data.medications (has form, dosageCount, timings, instructions)
    // Fall back to the main medications column (stored as {drug, frequency, duration, notes})
    const medsSource = Array.isArray(noteData.medications) && noteData.medications.length > 0
      ? noteData.medications
      : note.medications

    const payload = {
      id: note.id,
      prescription_number: note.prescription_number || null,
      prescription_date: note.prescription_date || note.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
      chief_complaints: note.chief_complaint || [],
      diagnosis: diagnosisToText(note.diagnosis),
      medications: medicationsToUi(medsSource),
      radiology: noteData.radiology || [],
      labs: noteData.labs || [],
      doctor_notes: noteData.plan || '',
      show_notes_in_print: noteData.show_notes_in_print !== false,
      follow_up_date: noteData.follow_up_date || null,
      patient: {
        id: patient?.id || note.patient_id,
        full_name: patient?.full_name || 'مريض',
        age: patient?.age ?? undefined,
        sex: patient?.sex ?? undefined,
        phone: patient?.phone ?? undefined
      },
      doctor: {
        id: (note.doctor as any)?.id || user.id,
        full_name: (note.doctor as any)?.full_name || 'طبيب',
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
