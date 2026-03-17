import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const adminClient = createAdminClient('patient-appointments')

    // Query appointments table for patient
    const { data: appointmentsData, error: appointmentsError } = await adminClient
      .from('appointments')
      .select(`
        id,
        start_time,
        duration_minutes,
        status,
        doctor:doctors (
          id,
          specialty,
          users (
            full_name
          )
        ),
        clinic:clinics (
          name
        )
      `)
      .eq('patient_id', user.id)
      .order('start_time', { ascending: false })

    if (appointmentsError) {
      throw appointmentsError
    }

    const appointments = (appointmentsData || []).map((apt: any) => {
      // Get doctor name - handle nested structure
      const doctorName = apt.doctor?.users?.full_name ||
                        apt.doctor?.full_name ||
                        'Unknown Doctor'

      // Get doctor specialty
      const doctorSpecialty = apt.doctor?.specialty || ''

      // Get clinic name
      const clinicName = apt.clinic?.name || 'Clinic'

      return {
        id: apt.id,
        start_time: apt.start_time,
        duration_minutes: apt.duration_minutes || 30,
        status: apt.status || 'scheduled',
        doctor_name: doctorName,
        doctor_specialty: doctorSpecialty,
        clinic_name: clinicName
      }
    })

    return NextResponse.json({
      success: true,
      appointments
    })
  } catch (error: any) {
    console.error('Appointments fetch error:', error)
    return toApiErrorResponse(error, 'Failed to load appointments')
  }
}
