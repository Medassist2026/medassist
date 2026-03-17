import { createAppointment } from '@shared/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { ensureDoctorInFrontdeskClinic } from '@shared/lib/data/frontdesk-scope'
import { NextResponse } from 'next/server'

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

    const appointment = await createAppointment({
      doctorId,
      patientId,
      startTime,
      durationMinutes,
      appointmentType: normalizedType,
      notes
    })

    return NextResponse.json({
      success: true,
      appointment
    })

  } catch (error: any) {
    console.error('Appointment creation error:', error)
    return toApiErrorResponse(error, 'Failed to create appointment')
  }
}
