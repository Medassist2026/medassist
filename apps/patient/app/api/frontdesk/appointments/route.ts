import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { getClinicDoctorIds, getFrontdeskClinicId } from '@shared/lib/data/frontdesk-scope'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const startDate = searchParams.get('start')
    const endDate = searchParams.get('end')
    const doctorId = searchParams.get('doctorId')

    const clinicId = await getFrontdeskClinicId(supabase as any, user.id)
    if (!clinicId) {
      return NextResponse.json({ success: true, appointments: [] })
    }

    const clinicDoctorIds = await getClinicDoctorIds(supabase as any, clinicId)
    if (clinicDoctorIds.length === 0) {
      return NextResponse.json({ success: true, appointments: [] })
    }

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
      `)
      .in('doctor_id', clinicDoctorIds)
      .order('start_time', { ascending: true })

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

    const { data, error } = await query
    if (error) throw error

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

    return NextResponse.json({ success: true, appointments })
  } catch (error: any) {
    console.error('Frontdesk appointments fetch error:', error)
    return toApiErrorResponse(error, 'Failed to fetch appointments')
  }
}
