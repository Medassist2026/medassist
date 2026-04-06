export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@shared/lib/supabase/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { validateClinicHours } from '@shared/lib/utils/clinic-hours'
import { sendReminder } from '@shared/lib/sms/reminder-service'

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
    // Use admin client to bypass RLS — access is explicitly scoped to doctor_id = user.id below
    const supabase = createAdminClient('patient-appointments')

    const searchParams = request.nextUrl.searchParams
    const date = searchParams.get('date')
    const startDate = searchParams.get('start')
    const endDate = searchParams.get('end')
    const clinicId = searchParams.get('clinicId')

    let query = supabase
      .from('appointments')
      .select(`
        id,
        start_time,
        duration_minutes,
        status,
        appointment_type,
        reason,
        notes,
        clinic_id,
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

    // Scope by clinic if provided
    if (clinicId) {
      query = query.eq('clinic_id', clinicId)
    }

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

    let { data, error }: { data: any; error: any } = await query

    // Graceful fallback: if query fails (e.g. reason/notes columns missing from DB),
    // retry without the optional columns added in migration 025
    if (error && (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist'))) {
      console.warn('Appointments query: optional columns missing, retrying without reason/notes:', error.message)
      const fallback = supabase
        .from('appointments')
        .select(`
          id,
          start_time,
          duration_minutes,
          status,
          appointment_type,
          clinic_id,
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

      // Re-apply filters
      if (clinicId) fallback.eq('clinic_id', clinicId)
      const todayStr = new Date().toISOString().split('T')[0]
      if (date) {
        fallback.gte('start_time', `${date}T00:00:00`).lte('start_time', `${date}T23:59:59`)
      } else if (startDate && endDate) {
        fallback.gte('start_time', `${startDate}T00:00:00`).lte('start_time', `${endDate}T23:59:59`)
      } else {
        fallback.gte('start_time', `${todayStr}T00:00:00`).lte('start_time', `${todayStr}T23:59:59`)
      }

      const fb = await fallback
      data = fb.data
      error = fb.error
    }

    if (error) {
      console.error('Error fetching appointments:', error)
      return NextResponse.json(
        { error: 'Failed to fetch appointments' },
        { status: 500 }
      )
    }

    // Transform data for frontend
    const appointments = (data || []).map((apt: any) => {
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
      type: apt.appointment_type || 'regular',
      description: (apt as any).reason || (apt as any).notes || undefined,
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

    const { patientId, startTime, durationMinutes, appointmentType, notes, reason, clinicId, skipHoursCheck } = body

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

    // Normalize appointment type
    const typeAliases: Record<string, string> = {
      'consultation': 'regular',
      'walkin': 'regular',
      'walk-in': 'regular',
      'walk_in': 'regular',
      'procedure': 'regular',
    }
    const normalizedType = typeAliases[appointmentType] || appointmentType || 'regular'
    const validTypes = ['regular', 'followup', 'emergency']
    if (!validTypes.includes(normalizedType)) {
      return NextResponse.json({ error: 'Invalid appointment type' }, { status: 400 })
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

    // Validate clinic hours — warn if outside working hours (skip if user explicitly confirmed)
    if (!skipHoursCheck) {
      const hoursCheck = await validateClinicHours(supabase, user.id, startTime, duration)
      if (!hoursCheck.isValid) {
        return NextResponse.json(
          { error: hoursCheck.errorAr || hoursCheck.error, outsideHours: true },
          { status: 400 }
        )
      }
    }

    // Resolve clinic_id: use provided or auto-resolve from doctor's membership
    let resolvedClinicId = clinicId || null
    if (!resolvedClinicId) {
      const { data: membership } = await supabase
        .from('clinic_memberships')
        .select('clinic_id')
        .eq('user_id', user.id)
        .in('role', ['OWNER', 'DOCTOR'])
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      resolvedClinicId = membership?.clinic_id || null
    }

    // Create appointment
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        doctor_id: user.id,
        patient_id: patientId,
        clinic_id: resolvedClinicId,
        start_time: startTime,
        duration_minutes: duration,
        appointment_type: normalizedType,
        notes: notes || null,
        reason: reason || notes || null,
        status: 'scheduled',
        created_by_role: 'doctor',
      })
      .select()
      .single()

    if (error) {
      console.error('Appointment creation error:', error)
      return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 })
    }

    // ── Send appointment_confirmed SMS (fire-and-forget) ──
    ;(async () => {
      try {
        // Fetch patient phone (not in the earlier query)
        const { data: patientDetails } = await supabase
          .from('patients')
          .select('phone')
          .eq('id', patientId)
          .maybeSingle()

        if (!patientDetails?.phone) return

        // Fetch doctor full_name
        const { data: doctorDetails } = await supabase
          .from('doctors')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle()

        // Fetch clinic name if we have a clinic
        let clinicName = ''
        if (resolvedClinicId) {
          const { data: clinicDetails } = await supabase
            .from('clinics')
            .select('name')
            .eq('id', resolvedClinicId)
            .maybeSingle()
          clinicName = clinicDetails?.name || ''
        }

        const aptDate = new Date(startTime)
        const dateStr = aptDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
        const timeStr = aptDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })

        await sendReminder({
          patientId,
          phoneNumber: patientDetails.phone,
          messageType: 'appointment_confirmed',
          appointmentId: data.id,
          clinicId: resolvedClinicId || undefined,
          context: {
            patientName: patient.full_name || 'المريض',
            doctorName: doctorDetails?.full_name || 'الطبيب',
            clinicName,
            appointmentDate: dateStr,
            appointmentTime: timeStr,
          },
          language: 'ar',
        })
      } catch (smsErr) {
        console.error('Appointment confirmed SMS failed (non-blocking):', smsErr)
      }
    })()

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

// ============================================================================
// PATCH /api/doctor/appointments
// Update an appointment: cancel OR reschedule.
//
// Cancel:     { appointmentId, status: 'cancelled' }
// Reschedule: { appointmentId, startTime, durationMinutes?, appointmentType?, notes? }
// ============================================================================

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireApiRole('doctor')
    const body = await request.json()
    const { appointmentId, status, startTime, durationMinutes, appointmentType, notes } = body

    if (!appointmentId) {
      return NextResponse.json({ error: 'Appointment ID is required' }, { status: 400 })
    }

    const supabase = createAdminClient('doctor-appointments')

    // Verify appointment belongs to this doctor
    const { data: existing } = await supabase
      .from('appointments')
      .select('id, status, patient_id, start_time')
      .eq('id', appointmentId)
      .eq('doctor_id', user.id)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    // ── Cancellation ──────────────────────────────────────────────────────────
    if (status === 'cancelled') {
      if (existing.status === 'cancelled') {
        return NextResponse.json({ error: 'Appointment is already cancelled' }, { status: 400 })
      }
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', appointmentId)

      if (updateError) {
        return NextResponse.json({ error: 'Failed to cancel appointment' }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    // ── Reschedule ────────────────────────────────────────────────────────────
    if (startTime) {
      if (!['scheduled', 'confirmed'].includes(existing.status)) {
        return NextResponse.json({ error: 'Only scheduled or confirmed appointments can be rescheduled' }, { status: 400 })
      }

      const duration = durationMinutes ?? 15
      if (typeof duration !== 'number' || duration < 5 || duration > 120) {
        return NextResponse.json({ error: 'Duration must be 5-120 minutes' }, { status: 400 })
      }

      const typeAliases: Record<string, string> = { consultation: 'regular', walkin: 'regular' }
      const normalizedType = typeAliases[appointmentType] || appointmentType || undefined
      const validTypes = ['regular', 'followup', 'emergency']
      if (normalizedType && !validTypes.includes(normalizedType)) {
        return NextResponse.json({ error: 'Invalid appointment type' }, { status: 400 })
      }

      const updatePayload: Record<string, unknown> = {
        start_time: startTime,
        duration_minutes: duration,
        status: 'scheduled', // re-open if it was already confirmed
      }
      if (normalizedType) updatePayload.appointment_type = normalizedType
      if (notes !== undefined) { updatePayload.notes = notes; updatePayload.reason = notes }

      const { error: updateError } = await supabase
        .from('appointments')
        .update(updatePayload)
        .eq('id', appointmentId)

      if (updateError) {
        return NextResponse.json({ error: 'Failed to reschedule appointment' }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Provide either status or startTime to update' }, { status: 400 })

  } catch (error) {
    console.error('Appointment update error:', error)
    return toApiErrorResponse(error, 'Failed to update appointment')
  }
}
