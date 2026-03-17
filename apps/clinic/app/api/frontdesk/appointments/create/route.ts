import { createAppointment } from '@shared/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { ensureDoctorInFrontdeskClinic, getUserClinicId } from '@shared/lib/data/frontdesk-scope'
import { validateClinicHours } from '@shared/lib/utils/clinic-hours'
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_APPOINTMENT_TYPES = new Set(['regular', 'followup', 'emergency', 'consultation'])

function normalizeAppointmentType(input: unknown): string | null {
  if (typeof input !== 'string' || input.trim().length === 0) {
    return 'regular'
  }

  const normalized = input.trim().toLowerCase()
  const aliasMap: Record<string, string> = {
    'follow-up': 'followup',
    'follow_up': 'followup'
  }
  const mapped = aliasMap[normalized] || normalized

  return ALLOWED_APPOINTMENT_TYPES.has(mapped) ? mapped : null
}

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()

    const body = await request.json()
    const { patientId, doctorId, startTime, durationMinutes, appointmentType, notes } = body

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
        { error: 'Invalid appointment type. Allowed: regular, followup, emergency, consultation' },
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

    // ── Validate clinic hours ──
    const hoursCheck = await validateClinicHours(supabase as any, doctorId, startTime, durationMinutes)
    if (!hoursCheck.isValid) {
      return NextResponse.json(
        { error: hoursCheck.errorAr || hoursCheck.error, outsideHours: true },
        { status: 400 }
      )
    }

    // ── Resolve frontdesk's clinic for appointment scoping ──
    const clinicId = await getUserClinicId(user.id)

    // ── Create appointment ──
    const appointment = await createAppointment({
      doctorId,
      patientId,
      startTime,
      durationMinutes,
      appointmentType: normalizedType,
      notes,
      clinicId
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

    return NextResponse.json({
      success: true,
      appointment
    })

  } catch (error: any) {
    console.error('Appointment creation error:', error)
    return toApiErrorResponse(error, 'Failed to create appointment')
  }
}
