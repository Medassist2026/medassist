import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'

// ============================================================================
// GET /api/doctor/appointments
// Fetch doctor's appointments with optional date range filtering
// Query params:
//   - date: specific date (YYYY-MM-DD)
//   - start: start date for range (YYYY-MM-DD)
//   - end: end date for range (YYYY-MM-DD)
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiRole('doctor')
    const supabase = await createClient()
    
    const searchParams = request.nextUrl.searchParams
    const date = searchParams.get('date')
    const startDate = searchParams.get('start')
    const endDate = searchParams.get('end')

    let query = supabase
      .from('appointments')
      .select(`
        id,
        start_time,
        duration_minutes,
        status,
        appointment_type,
        patient:patients!appointments_patient_id_fkey (
          id,
          full_name,
          phone,
          age,
          sex
        )
      `)
      .eq('doctor_id', user.id)
      .order('start_time', { ascending: true })

    // Apply date filtering
    if (date) {
      // Single date
      const dayStart = `${date}T00:00:00`
      const dayEnd = `${date}T23:59:59`
      query = query.gte('start_time', dayStart).lte('start_time', dayEnd)
    } else if (startDate && endDate) {
      // Date range
      const rangeStart = `${startDate}T00:00:00`
      const rangeEnd = `${endDate}T23:59:59`
      query = query.gte('start_time', rangeStart).lte('start_time', rangeEnd)
    } else {
      // Default: today
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]
      const dayStart = `${todayStr}T00:00:00`
      const dayEnd = `${todayStr}T23:59:59`
      query = query.gte('start_time', dayStart).lte('start_time', dayEnd)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching appointments:', error)
      return NextResponse.json(
        { error: 'Failed to fetch appointments' },
        { status: 500 }
      )
    }

    // Transform data for frontend
    const appointments = (data || []).map(apt => {
      const patient = Array.isArray(apt.patient) ? apt.patient[0] : apt.patient

      return {
      id: apt.id,
      patient_id: patient?.id,
      patient_name: patient?.full_name || 'Unknown Patient',
      patient_phone: patient?.phone,
      patient_age: patient?.age ?? null,
      patient_sex: patient?.sex,
      start_time: apt.start_time,
      duration_minutes: apt.duration_minutes,
      status: apt.status,
      type: apt.appointment_type || 'regular'
      }
    })

    return NextResponse.json({ appointments })

  } catch (error) {
    console.error('Appointments fetch error:', error)
    return toApiErrorResponse(error, 'Failed to fetch appointments')
  }
}
