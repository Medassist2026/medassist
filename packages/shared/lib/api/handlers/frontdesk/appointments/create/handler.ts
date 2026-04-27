export const dynamic = 'force-dynamic'

import { createAppointment } from '@shared/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { ensureDoctorInFrontdeskClinic, getFrontdeskClinicId } from '@shared/lib/data/frontdesk-scope'
import { validateClinicHours } from '@shared/lib/utils/clinic-hours'
import { sendReminder } from '@shared/lib/sms/reminder-service'
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_APPOINTMENT_TYPES = new Set(['regular', 'followup', 'emergency'])

function normalizeAppointmentType(input: unknown): string | null {
  if (typeof input !== 'string' || input.trim().length === 0) {
    return 'regular'
  }

  const normalized = input.trim().toLowerCase()
  const aliasMap: Record<string, string> = {
    'follow-up': 'followup',
    'follow_up': 'followup',
    'consultation': 'regular',
    'walkin': 'regular',
    'walk-in': 'regular',
    'walk_in': 'regular',
    'procedure': 'regular',
  }
  const mapped = aliasMap[normalized] || normalized

  return ALLOWED_APPOINTMENT_TYPES.has(mapped) ? mapped : null
}

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()

    const body = await request.json()
    const { patientId, doctorId, startTime, durationMinutes, appointmentType, notes, skipHoursCheck } = body

    if (!patientId || !doctorId || !startTime || !durationMinutes) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const doctorInScope = await ensureDoctorInFrontdeskClinic(supabase as any, user.id, doctorId)
    if (!doctorInScope) {
      return NextResponse.json(
        { error: 'Doctor is outside your clinic scope' },
        { status: 403 }
      )
    }

    const normalizedType = normalizeAppointmentType(appointmentType)
    if (!normalizedType) {
      return NextResponse.json(
        { error: 'Invalid appointment type. Allowed: regular, followup, emergency' },
        { status: 400 }
      )
    }

    // ── Double-booking prevention (pre-check) ──
    const requestedStart = new Date(startTime)
    const requestedEnd = new Date(requestedStart.getTime() + durationMinutes * 60000)

    const { data: conflicts } = await supabase
      .from('appointments')
      .select('id, start_time, duration_minutes, patient_id')
      .eq('doctor_id', doctorId)
      .eq('status', 'scheduled')
      .gte('start_time', new Date(requestedStart.getTime() - 24 * 60 * 60000).toISOString())
      .lte('start_time', new Date(requestedEnd.getTime() + 24 * 60 * 60000).toISOString())

    const hasConflict = (conflicts || []).some(apt => {
      const aptStart = new Date(apt.start_time)
      const aptEnd = new Date(aptStart.getTime() + apt.duration_minutes * 60000)
      return requestedStart < aptEnd && requestedEnd > aptStart
    })

    if (hasConflict) {
      return NextResponse.json(
        { error: 'يوجد موعد آخر في نفس الوقت — اختر وقتاً مختلفاً' },
        { status: 409 }
      )
    }

    // ── Validate clinic hours (skip if user explicitly confirmed outside-hours booking) ──
    if (!skipHoursCheck) {
      const hoursCheck = await validateClinicHours(supabase as any, doctorId, startTime, durationMinutes)
      if (!hoursCheck.isValid) {
        return NextResponse.json(
          { error: hoursCheck.errorAr || hoursCheck.error, outsideHours: true },
          { status: 400 }
        )
      }
    }

    // ── Server-resolved tenant scope (D-041) ──
    // appointments.clinic_id has been NOT NULL since mig 053 — required for
    // the INSERT. getFrontdeskClinicId is consistent with the auth gate
    // above (FRONT_DESK/ASSISTANT memberships only). Pre-fix this used
    // getUserClinicId, which on its own was fine for current testers but
    // diverged from the architecture pattern; sticking with
    // getFrontdeskClinicId per ARCHITECTURE.md D-041.
    const clinicId = await getFrontdeskClinicId(supabase as any, user.id)
    if (!clinicId) {
      return NextResponse.json(
        { error: 'Clinic context not found' },
        { status: 403 }
      )
    }

    // ── Create appointment ──
    const appointment = await createAppointment({
      doctorId,
      patientId,
      clinicId,
      startTime,
      durationMinutes,
      appointmentType: normalizedType,
      notes,
    })

    // ── Post-insert verification (concurrent protection) ──
    // If two requests pass the pre-check simultaneously, both will insert.
    // Detect this by checking if another scheduled appointment overlaps ours.
    const { data: postConflicts } = await supabase
      .from('appointments')
      .select('id, start_time, duration_minutes')
      .eq('doctor_id', doctorId)
      .eq('status', 'scheduled')
      .neq('id', appointment.id)
      .gte('start_time', new Date(requestedStart.getTime() - 24 * 60 * 60000).toISOString())
      .lte('start_time', new Date(requestedEnd.getTime() + 24 * 60 * 60000).toISOString())

    const postConflict = (postConflicts || []).some(apt => {
      const aptStart = new Date(apt.start_time)
      const aptEnd = new Date(aptStart.getTime() + apt.duration_minutes * 60000)
      return requestedStart < aptEnd && requestedEnd > aptStart
    })

    if (postConflict) {
      // Roll back: cancel the appointment we just created (the other one wins)
      await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', appointment.id)

      return NextResponse.json(
        { error: 'يوجد موعد آخر في نفس الوقت — حاول مرة أخرى' },
        { status: 409 }
      )
    }

    // ── Send appointment_confirmed SMS (fire-and-forget) ──
    ;(async () => {
      try {
        const { data: details } = await supabase
          .from('appointments')
          .select(`
            id,
            start_time,
            patient:patients!appointments_patient_id_fkey ( id, full_name, phone ),
            doctor:doctors!appointments_doctor_id_fkey ( full_name ),
            clinic:clinics!appointments_clinic_id_fkey ( name )
          `)
          .eq('id', appointment.id)
          .single()

        const patient = Array.isArray(details?.patient) ? details.patient[0] : details?.patient
        const doctor = Array.isArray(details?.doctor) ? details.doctor[0] : details?.doctor
        const clinic = Array.isArray(details?.clinic) ? details.clinic[0] : details?.clinic

        if (patient?.phone && patient?.id) {
          const aptDate = new Date(details!.start_time)
          const dateStr = aptDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
          const timeStr = aptDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })

          await sendReminder({
            patientId: patient.id,
            phoneNumber: patient.phone,
            messageType: 'appointment_confirmed',
            appointmentId: appointment.id,
            clinicId: clinicId || undefined,
            context: {
              patientName: patient.full_name || 'المريض',
              doctorName: doctor?.full_name || 'الطبيب',
              clinicName: clinic?.name || '',
              appointmentDate: dateStr,
              appointmentTime: timeStr,
            },
            language: 'ar',
          })
        }
      } catch (smsErr) {
        console.error('Appointment confirmed SMS failed (non-blocking):', smsErr)
      }
    })()

    return NextResponse.json({
      success: true,
      appointment
    })

  } catch (error: any) {
    console.error('Appointment creation error:', error)
    return toApiErrorResponse(error, 'Failed to create appointment')
  }
}
