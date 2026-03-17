import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireApiRole('doctor')
    const { id: patientId } = await params
    const admin = createAdminClient('patient-details')

    // Fetch patient info
    const { data: patient, error: patientError } = await admin
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .single()

    if (patientError || !patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    // Fetch clinical notes by this doctor for this patient (this is the visit history + medications)
    const { data: notes } = await admin
      .from('clinical_notes')
      .select('*')
      .eq('patient_id', patientId)
      .eq('doctor_id', user.id)
      .order('created_at', { ascending: false })

    // Extract medications from clinical notes
    const medications: any[] = []
    const visits: any[] = []

    for (const note of (notes || [])) {
      // Each note is a visit
      visits.push({
        id: note.id,
        date: note.created_at,
        status: 'completed',
        reason: note.note_data?.chiefComplaint || 'Clinical visit',
        notes: note.note_data?.plan || '',
        diagnosis: note.note_data?.diagnosis || ''
      })

      // Extract medications from note_data
      if (note.note_data?.medications) {
        for (const med of note.note_data.medications) {
          medications.push({
            id: `${note.id}-${med.name}`,
            name: med.name,
            dosage: med.strength || med.dosage || '',
            frequency: med.frequency || '',
            duration: med.duration || '',
            instructions: med.instructions || '',
            start_date: note.created_at,
            status: 'active',
            prescribed_by: 'You'
          })
        }
      }
    }

    // Fetch appointments
    const { data: appointments } = await admin
      .from('appointments')
      .select('*')
      .eq('patient_id', patientId)
      .eq('doctor_id', user.id)
      .order('start_time', { ascending: false })
      .limit(20)

    // Fetch medication reminders (patient's current meds from intake)
    const { data: reminders } = await admin
      .from('patient_medication_reminders')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })

    // Build timeline from all data sources
    const timeline: any[] = []

    for (const visit of visits) {
      timeline.push({
        id: `visit-${visit.id}`,
        date: visit.date,
        type: 'visit',
        title: visit.reason,
        description: visit.diagnosis || visit.notes || ''
      })
    }

    for (const med of medications) {
      timeline.push({
        id: `med-${med.id}`,
        date: med.start_date,
        type: 'medication',
        title: `Prescribed ${med.name} ${med.dosage}`.trim(),
        description: `${med.frequency} ${med.duration}`.trim()
      })
    }

    // Sort timeline by date descending
    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({
      patient: {
        id: patient.id,
        name: patient.full_name,
        phone: patient.phone || '',
        email: patient.email || '',
        date_of_birth: patient.date_of_birth || '',
        gender: patient.sex || patient.gender || '',
        national_id: patient.national_id || '',
        blood_type: patient.blood_type || '',
        created_at: patient.created_at
      },
      conditions: [], // Will be populated when conditions table is created
      medications,
      allergies: [], // Will be populated when allergies tracking is added
      labs: [],
      appointments: (appointments || []).map((apt: any) => ({
        id: apt.id,
        date: apt.start_time,
        time: new Date(apt.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        status: apt.status,
        reason: apt.reason || apt.notes || 'Appointment'
      })),
      visits,
      timeline
    })
  } catch (error: any) {
    return toApiErrorResponse(error, 'Failed to load patient details')
  }
}
