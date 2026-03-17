import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@shared/lib/supabase/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'

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

// ============================================================================
// POST /api/doctor/appointments
// Create appointment from the doctor side
// Body: { patientId, startTime, durationMinutes, appointmentType?, notes? }
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiRole('doctor')
    const body = await request.json()

    const { patientId, startTime, durationMinutes, appointmentType, notes } = body

    // Validate required fields
    if (!patientId || typeof patientId !== 'string') {
      return NextResponse.json({ error: 'Patient is required' }, { status: 400 })
    }
    if (!startTime || typeof startTime !== 'string') {
      return NextResponse.json({ error: 'Start time is required' }, { status: 400 })
    }

    const duration = durationMinutes || 15
    if (typeof duration !== 'number' || duration < 5 || duration > 120) {
      return NextResponse.json({ error: 'Duration must be 5-120 minutes' }, { status: 400 })
    }

    // Validate start time is not in the past (allow same-day)
    const appointmentDate = new Date(startTime)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (appointmentDate < today) {
      return NextResponse.json({ error: 'Cannot create appointments in the past' }, { status: 400 })
    }

    const supabase = createAdminClient('doctor-appointments')

    // Verify patient exists
    const { data: patient } = await supabase
      .from('patients')
      .select('id, full_name')
      .eq('id', patientId)
      .maybeSingle()

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    // Check for time conflicts
    const aptStart = new Date(startTime)
    const aptEnd = new Date(aptStart.getTime() + duration * 60000)

    const { data: conflicts } = await supabase
      .from('appointments')
      .select('id, start_time, duration_minutes')
      .eq('doctor_id', user.id)
      .in('status', ['scheduled', 'confirmed'])
      .gte('start_time', aptStart.toISOString().split('T')[0] + 'T00:00:00')
      .lte('start_time', aptStart.toISOString().split('T')[0] + 'T23:59:59')

    const hasConflict = (conflicts || []).some(c => {
      const cStart = new Date(c.start_time)
      const cEnd = new Date(cStart.getTime() + (c.duration_minutes || 15) * 60000)
      return aptStart < cEnd && aptEnd > cStart
    })

    if (hasConflict) {
      return NextResponse.json({ error: 'Time slot conflicts with an existing appointment' }, { status: 409 })
    }

    // Create appointment
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        doctor_id: user.id,
        patient_id: patientId,
        start_time: startTime,
        duration_minutes: duration,
        appointment_type: appointmentType || 'consultation',
        notes: notes || null,
        status: 'scheduled',
        created_by_role: 'doctor',
      })
      .select()
      .single()

    if (error) {
      console.error('Appointment creation error:', error)
      return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      appointment: {
        id: data.id,
        patient_id: patientId,
        patient_name: patient.full_name || 'Unknown Patient',
        start_time: data.start_time,
        duration_minutes: data.duration_minutes,
        status: data.status,
        type: data.appointment_type,
      }
    })

  } catch (error) {
    console.error('Appointment creation error:', error)
    return toApiErrorResponse(error, 'Failed to create appointment')
  }
}
