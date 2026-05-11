export const dynamic = 'force-dynamic'

/**
 * GET /api/patient/appointments — B07 Phase F.5 cross-context extension.
 *
 * Accepts optional `?gpId=<id>` to view appointments for a dependent or
 * delegated principal. Minor gps return empty (Decision 2); adult cross-
 * context resolves via `claimed_user_id` (Decision 3).
 */

import {
  requireApiRole,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'
import {
  emptyForCrossContext,
  resolvePatientContext,
} from '@shared/lib/auth/patient-context'

export async function GET(request: Request) {
  try {
    const user = await requireApiRole('patient')
    const ctx = await resolvePatientContext({
      request,
      userId: user.id,
    })

    if (ctx.resolvedPatientId === null) {
      return NextResponse.json(
        emptyForCrossContext({ appointments: [] })
      )
    }

    const adminClient = createAdminClient('patient-appointments')

    // Query appointments table for patient
    const { data: appointmentsData, error: appointmentsError } =
      await adminClient
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
        .eq('patient_id', ctx.resolvedPatientId)
        .order('start_time', { ascending: false })

    if (appointmentsError) {
      throw appointmentsError
    }

    const appointments = (appointmentsData || []).map((apt: any) => {
      // Get doctor name - handle nested structure
      const doctorName =
        apt.doctor?.users?.full_name ||
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
        clinic_name: clinicName,
      }
    })

    return NextResponse.json({
      success: true,
      appointments,
    })
  } catch (error: any) {
    console.error('Appointments fetch error:', error)
    return toApiErrorResponse(error, 'Failed to load appointments')
  }
}
