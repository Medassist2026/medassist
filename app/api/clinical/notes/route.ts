import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { createClinicalNote, createMedicationReminders } from '@/lib/data/clinical-notes'
import { trackSessionCompletion } from '@/lib/analytics/tracking'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    
    const { patientId, noteData, keystrokeCount, durationSeconds, syncToPatient } = await request.json()
    
    // Validation
    if (!patientId || !noteData) {
      return NextResponse.json(
        { error: 'Patient ID and note data are required' },
        { status: 400 }
      )
    }
    
    if (!noteData.chief_complaint || noteData.chief_complaint.length === 0) {
      return NextResponse.json(
        { error: 'At least one chief complaint is required' },
        { status: 400 }
      )
    }
    
    // Create clinical note
    const note = await createClinicalNote({
      doctorId: user.id,
      patientId,
      noteData,
      keystrokeCount: keystrokeCount || 0,
      durationSeconds: durationSeconds || 0,
      syncToPatient: syncToPatient || false
    })
    
    // Create medication reminders if syncing to patient
    let reminderWarning: string | null = null
    if (syncToPatient && noteData.medications && noteData.medications.length > 0) {
      try {
        await createMedicationReminders(note.id, patientId, noteData.medications)
      } catch (reminderError: any) {
        console.error('Medication reminder creation warning:', reminderError)
        reminderWarning = reminderError?.message || 'Failed to create medication reminders'
      }
    }
    
    // Track analytics
    await trackSessionCompletion({
      doctorId: user.id,
      patientId,
      durationSeconds: durationSeconds || 0,
      keystrokeCount: keystrokeCount || 0,
      templateUsed: 'default', // TODO: Get actual template
      chiefComplaintsCount: noteData.chief_complaint.length,
      medicationsCount: noteData.medications?.length || 0
    })
    
    return NextResponse.json({
      success: true,
      noteId: note.id,
      message: 'Clinical note saved successfully',
      reminderWarning
    })
    
  } catch (error: any) {
    console.error('Save clinical note error:', error)
    return toApiErrorResponse(error, 'Failed to save note')
  }
}
