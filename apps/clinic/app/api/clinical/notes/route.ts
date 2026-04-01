export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClinicalNote, createMedicationReminders } from '@shared/lib/data/clinical-notes'
import { getActiveClinicIdFromCookies } from '@shared/lib/data/clinic-context'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { trackSessionCompletion } from '@shared/lib/analytics/tracking'
import { logAuditEvent } from '@shared/lib/data/audit'
import { sendPrescriptionSMS } from '@shared/lib/sms/prescription-sms'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('doctor')

    const { patientId, queueId, noteData, keystrokeCount, durationSeconds, syncToPatient, sendPrescriptionSMS: sendSMS, clinicId: bodyClinicId } = await request.json()

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
    
    // ── Close the queue loop (Bug 2/3/4 fix) ────────────────────────────────
    // If this session was started from the walk-in queue, mark the queue item
    // as completed and sync any linked appointment to 'completed' as well.
    if (queueId) {
      ;(async () => {
        try {
          const admin = createAdminClient('session-queue-completion')
          const now = new Date().toISOString()

          // 1. Mark queue item completed
          const { data: queueItem } = await admin
            .from('check_in_queue')
            .update({ status: 'completed', completed_at: now })
            .eq('id', queueId)
            .eq('doctor_id', user.id) // scope to this doctor for safety
            .select('appointment_id')
            .maybeSingle()

          // 2. If queue item had a linked appointment, mark it completed too
          if (queueItem?.appointment_id) {
            await admin
              .from('appointments')
              .update({ status: 'completed' })
              .eq('id', queueItem.appointment_id)
          }
        } catch (queueErr) {
          // Never block the session save response
          console.error('[queue-completion] Failed to update queue/appointment status:', queueErr)
        }
      })()
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

    // ── Prescription SMS (Feature 4) ────────────────────────────────────────
    // Fire-and-forget: SMS failure must NEVER block the save response.
    // Only sends when the doctor explicitly enables the toggle (sendSMS=true)
    // and the session contains at least one medication.
    if (sendSMS && noteData.medications && noteData.medications.length > 0) {
      ;(async () => {
        try {
          const admin = createAdminClient('prescription-sms-lookup')

          // Fetch patient phone + doctor name in parallel
          const [patientRes, doctorRes] = await Promise.all([
            admin.from('patients').select('phone, full_name').eq('id', patientId).single(),
            admin.from('doctors').select('full_name, clinic_id').eq('id', user.id).single(),
          ])

          const phone      = patientRes.data?.phone
          const doctorName = doctorRes.data?.full_name || 'طبيبك'

          // Also fetch clinic name if available
          let clinicName: string | undefined
          const resolvedClinicId = clinicId || doctorRes.data?.clinic_id
          if (resolvedClinicId) {
            const clinicRes = await admin.from('clinics').select('name').eq('id', resolvedClinicId).single()
            clinicName = clinicRes.data?.name
          }

          if (!phone) {
            console.warn('[prescription-sms] Patient has no phone number — SMS skipped')
            return
          }

          await sendPrescriptionSMS({
            patientId,
            phoneNumber: phone,
            medications: noteData.medications,
            doctorName,
            clinicName,
            followUpDate:  noteData.follow_up_date  || null,
            followUpNotes: noteData.follow_up_notes || null,
            clinicId:      resolvedClinicId || undefined,
            noteId:        note.id,
          })
        } catch (smsError) {
          // Log but never rethrow — session is already saved
          console.error('[prescription-sms] Background send failed:', smsError)
        }
      })()
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
