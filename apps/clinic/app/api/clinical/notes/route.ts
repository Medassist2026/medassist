export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClinicalNote, createMedicationReminders } from '@shared/lib/data/clinical-notes'
import { getActiveClinicIdFromCookies } from '@shared/lib/data/clinic-context'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { trackSessionCompletion } from '@shared/lib/analytics/tracking'
import { logAuditEvent } from '@shared/lib/data/audit'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('doctor')

    const { patientId, noteData, keystrokeCount, durationSeconds, syncToPatient, clinicId: bodyClinicId } = await request.json()

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

    // Resolve clinic: prefer body param → cookie → membership fallback
    let clinicId = bodyClinicId || await getActiveClinicIdFromCookies()
    if (!clinicId) {
      try {
        const admin = createAdminClient('clinical-notes-clinic')
        const { data: membership } = await admin
          .from('clinic_memberships')
          .select('clinic_id')
          .eq('user_id', user.id)
          .in('role', ['OWNER', 'DOCTOR'])
          .eq('status', 'ACTIVE')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        clinicId = membership?.clinic_id || null
      } catch {
        // Membership lookup failed — proceed without clinic_id
      }
    }

    // Create clinical note
    const note = await createClinicalNote({
      doctorId: user.id,
      patientId,
      clinicId: clinicId || undefined,
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
    
    // Audit log
    logAuditEvent({
      clinicId: clinicId || undefined,
      actorUserId: user.id,
      action: 'CREATE_CLINICAL_NOTE',
      entityType: 'clinical_note',
      entityId: note.id,
      metadata: { patientId, chiefComplaints: noteData.chief_complaint?.length || 0 }
    })

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
