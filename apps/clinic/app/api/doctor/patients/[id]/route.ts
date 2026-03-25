export const dynamic = 'force-dynamic'

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

    // Extract medications, allergies, and chronic diseases from clinical notes
    const medications: any[] = []
    const visits: any[] = []
    // Use the MOST RECENT note to populate allergies and chronic conditions.
    // note_data.allergies / note_data.chronic_diseases were added in the P5 fix —
    // older notes may not have them (graceful fallback to empty).
    let latestAllergies: string[] = []
    let latestChronicDiseases: string[] = []

    for (const note of (notes || [])) {
      const nd = (note.note_data || {}) as any

      // Each note is a visit
      visits.push({
        id: note.id,
        date: note.created_at,
        status: 'completed',
        reason: Array.isArray(note.chief_complaint)
          ? note.chief_complaint.join('، ')
          : (nd.chief_complaint?.[0] || 'Clinical visit'),
        notes: nd.plan || note.plan || '',
        diagnosis: Array.isArray(note.diagnosis)
          ? note.diagnosis.map((d: any) => d?.text || d).filter(Boolean).join('، ')
          : (nd.diagnosis || '')
      })

      // Extract medications — from structured `medications` column (preferred) or note_data
      const medSource = Array.isArray(note.medications) && note.medications.length > 0
        ? note.medications
        : (nd.medications || [])
      for (const med of medSource) {
        const name = med.drug || med.name || 'Unnamed'
        medications.push({
          id: `${note.id}-${name}`,
          name,
          dosage: med.strength || med.dosage || med.dosageCount || '',
          frequency: med.frequency || '',
          duration: med.duration || '',
          instructions: med.instructions || med.notes || '',
          start_date: note.created_at,
          status: 'active',
          prescribed_by: 'You'
        })
      }

      // Collect allergies and chronic diseases from most recent note (first in desc order)
      if (latestAllergies.length === 0 && Array.isArray(nd.allergies) && nd.allergies.length > 0) {
        latestAllergies = nd.allergies
      }
      if (latestChronicDiseases.length === 0 && Array.isArray(nd.chronic_diseases) && nd.chronic_diseases.length > 0) {
        latestChronicDiseases = nd.chronic_diseases
      }
    }

    // FIX 9: Extract pending labs from most recent note
    let pendingLabs: string[] = []
    if (notes && notes.length > 0) {
      const latestNote = notes[0]
      const latestNoteData = (latestNote.note_data || {}) as any
      if (Array.isArray(latestNoteData.labs) && latestNoteData.labs.length > 0) {
        pendingLabs = latestNoteData.labs.map((lab: any) => lab.name || lab)
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

    // P3: Fetch relationship access_level so SessionForm can show upgrade prompt
    const { data: relationship } = await admin
      .from('doctor_patient_relationships')
      .select('access_level')
      .eq('doctor_id', user.id)
      .eq('patient_id', patientId)
      .maybeSingle()

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
        created_at: patient.created_at,
        // P3 fields
        is_registered: patient.registered || false,
        access_level: relationship?.access_level || 'walk_in_limited',
        // Populated from the most recent clinical note saved with this doctor
        allergies: latestAllergies,
        chronic_conditions: latestChronicDiseases,
        // FIX 9: Pending labs from last visit
        pendingLabs,
      },
      conditions: [],
      medications,
      allergies: latestAllergies,
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
