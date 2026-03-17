import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { getClinicDoctorIds, getFrontdeskClinicId, ensureDoctorInFrontdeskClinic } from '@shared/lib/data/frontdesk-scope'
import { sendReminder } from '@shared/lib/sms/reminder-service'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/frontdesk/appointments
 * Query params: date, start, end, doctorId, page (default 1), limit (default 50, max 100)
 */
export async function GET(request: Request) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const startDate = searchParams.get('start')
    const endDate = searchParams.get('end')
    const doctorId = searchParams.get('doctorId')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))

    const clinicId = await getFrontdeskClinicId(supabase as any, user.id)
    if (!clinicId) {
      return NextResponse.json({ success: true, appointments: [] })
    }

    const clinicDoctorIds = await getClinicDoctorIds(supabase as any, clinicId)
    if (clinicDoctorIds.length === 0) {
      return NextResponse.json({ success: true, appointments: [] })
    }

    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
      .from('appointments')
      .select(`
        id,
        start_time,
        duration_minutes,
        status,
        appointment_type,
        notes,
        doctor:doctors!appointments_doctor_id_fkey (
          id,
          full_name,
          specialty
        ),
        patient:patients!appointments_patient_id_fkey (
          id,
          full_name,
          phone,
          age,
          sex
        )
      `, { count: 'exact' })
      .in('doctor_id', clinicDoctorIds)
      .order('start_time', { ascending: true })
      .range(from, to)

    if (doctorId) {
      query = query.eq('doctor_id', doctorId)
    }

    if (date) {
      const dayStart = `${date}T00:00:00`
      const dayEnd = `${date}T23:59:59`
      query = query.gte('start_time', dayStart).lte('start_time', dayEnd)
    } else if (startDate && endDate) {
      const rangeStart = `${startDate}T00:00:00`
      const rangeEnd = `${endDate}T23:59:59`
      query = query.gte('start_time', rangeStart).lte('start_time', rangeEnd)
    } else {
      const today = new Date().toISOString().split('T')[0]
      const dayStart = `${today}T00:00:00`
      const dayEnd = `${today}T23:59:59`
      query = query.gte('start_time', dayStart).lte('start_time', dayEnd)
    }

    const { data, error, count } = await query
    if (error) throw error
    const total = count ?? (data || []).length

    const appointments = (data || []).map((appointment: any) => {
      const patient = Array.isArray(appointment.patient) ? appointment.patient[0] : appointment.patient
      const doctor = Array.isArray(appointment.doctor) ? appointment.doctor[0] : appointment.doctor
      return {
        id: appointment.id,
        start_time: appointment.start_time,
        duration_minutes: appointment.duration_minutes,
        status: appointment.status,
        type: appointment.appointment_type || 'regular',
        notes: appointment.notes || null,
        doctor: {
          id: doctor?.id,
          full_name: doctor?.full_name || 'Unknown Doctor',
          specialty: doctor?.specialty || ''
        },
        patient: {
          id: patient?.id,
          full_name: patient?.full_name || 'Unknown Patient',
          phone: patient?.phone || '',
          age: patient?.age ?? null,
          sex: patient?.sex ?? null
        }
      }
    })

    return NextResponse.json({
      success: true,
      appointments,
      pagination: {
        page,
        limit,
        total,
        hasMore: from + appointments.length < total,
      },
    })
  } catch (error: any) {
    console.error('Frontdesk appointments fetch error:', error)
    return toApiErrorResponse(error, 'Failed to fetch appointments')
  }
}

/**
 * PATCH /api/frontdesk/appointments
 * Update appointment: cancel, reschedule, or edit details
 * Body: { appointmentId, status?, startTime?, doctorId?, appointmentType?, notes? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()
    const body = await request.json()
    const { appointmentId, status, startTime, doctorId, appointmentType, notes } = body

    if (!appointmentId) {
      return NextResponse.json(
        { error: 'معرّف الموعد مطلوب' },
        { status: 400 }
      )
    }

    // Verify this appointment belongs to the frontdesk's clinic
    const clinicId = await getFrontdeskClinicId(supabase as any, user.id)
    if (!clinicId) {
      return NextResponse.json(
        { error: 'لا توجد عيادة مرتبطة' },
        { status: 403 }
      )
    }

    const clinicDoctorIds = await getClinicDoctorIds(supabase as any, clinicId)

    // Get the appointment to verify it belongs to a clinic doctor
    const { data: existing, error: fetchError } = await supabase
      .from('appointments')
      .select('id, doctor_id, status')
      .eq('id', appointmentId)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'الموعد غير موجود' },
        { status: 404 }
      )
    }

    if (!clinicDoctorIds.includes(existing.doctor_id)) {
      return NextResponse.json(
        { error: 'ليس لديك صلاحية على هذا الموعد' },
        { status: 403 }
      )
    }

    // Build the update object
    const updates: Record<string, any> = {}

    // Cancel
    if (status === 'cancelled') {
      if (existing.status === 'cancelled') {
        return NextResponse.json(
          { error: 'الموعد ملغي بالفعل' },
          { status: 400 }
        )
      }
      updates.status = 'cancelled'
    }

    // Reschedule — new start time
    if (startTime) {
      const parsed = new Date(startTime)
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: 'وقت غير صحيح' },
          { status: 400 }
        )
      }
      updates.start_time = parsed.toISOString()
    }

    // Change doctor — verify new doctor is in clinic scope
    if (doctorId && doctorId !== existing.doctor_id) {
      if (!clinicDoctorIds.includes(doctorId)) {
        return NextResponse.json(
          { error: 'الطبيب المحدد خارج نطاق العيادة' },
          { status: 403 }
        )
      }
      updates.doctor_id = doctorId
    }

    // Update appointment type
    if (appointmentType) {
      const validTypes = ['regular', 'followup', 'emergency', 'consultation']
      if (!validTypes.includes(appointmentType)) {
        return NextResponse.json(
          { error: 'نوع موعد غير صحيح' },
          { status: 400 }
        )
      }
      updates.appointment_type = appointmentType
    }

    // Update notes
    if (notes !== undefined) {
      updates.notes = notes || null
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'لا توجد تعديلات' },
        { status: 400 }
      )
    }

    const { data: updated, error: updateError } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', appointmentId)
      .select()
      .single()

    if (updateError) throw updateError

    // ── Send cancellation SMS (fire-and-forget) ──
    if (updates.status === 'cancelled') {
      ;(async () => {
        try {
          // Fetch full appointment details for SMS context
          const { data: aptDetails } = await supabase
            .from('appointments')
            .select(`
              id,
              start_time,
              patient:patients!appointments_patient_id_fkey ( id, full_name, phone ),
              doctor:doctors!appointments_doctor_id_fkey ( full_name )
            `)
            .eq('id', appointmentId)
            .single()

          const patient = Array.isArray(aptDetails?.patient) ? aptDetails.patient[0] : aptDetails?.patient
          const doctor = Array.isArray(aptDetails?.doctor) ? aptDetails.doctor[0] : aptDetails?.doctor

          if (patient?.phone && patient?.id) {
            const startTime = new Date(aptDetails!.start_time)
            const dateStr = startTime.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
            const timeStr = startTime.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })

            // Fetch clinic name
            const { data: clinicData } = await supabase
              .from('clinics')
              .select('name')
              .eq('id', clinicId)
              .single()

            await sendReminder({
              patientId: patient.id,
              phoneNumber: patient.phone,
              messageType: 'appointment_cancelled',
              appointmentId,
              clinicId: clinicId!,
              context: {
                patientName: patient.full_name || 'المريض',
                doctorName: doctor?.full_name || 'الطبيب',
                clinicName: clinicData?.name || '',
                appointmentDate: dateStr,
                appointmentTime: timeStr,
              },
              language: 'ar',
            })
          }
        } catch (smsErr) {
          console.error('Cancellation SMS failed (non-blocking):', smsErr)
        }
      })()
    }

    return NextResponse.json({ success: true, appointment: updated })
  } catch (error: any) {
    console.error('Frontdesk appointment update error:', error)
    return toApiErrorResponse(error, 'فشل تعديل الموعد')
  }
}
