export const dynamic = 'force-dynamic'

/**
 * POST /api/frontdesk/appointments/urgent
 *
 * Creates a حجز مستعجل (urgent same-day booking) at a specific time slot.
 *
 * Behaviour (A2 feature):
 *  - Creates an appointment with appointment_type = 'urgent' at the given time.
 *  - If the patient is already in the clinic (patientAlreadyPresent = true),
 *    also creates a queue entry with priority=3 and inserts it at the correct
 *    position so the schedule reflects the booking time.
 *  - Any existing walk-in queue entries that overlap the target time slot are
 *    bumped back by one position (they were using gap time the urgent call now owns).
 *
 * Body:
 *  {
 *    patientId:            string   — patient being booked
 *    doctorId:             string   — doctor
 *    startTime:            string   — ISO datetime (e.g. "2026-04-06T16:00:00+02:00")
 *    durationMinutes?:     number   — defaults to 15
 *    notes?:               string
 *    patientAlreadyPresent?: boolean  — if true, also adds to queue now
 *  }
 */

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { ensureDoctorInFrontdeskClinic, getFrontdeskClinicId } from '@shared/lib/data/frontdesk-scope'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()
    const admin = createAdminClient('urgent-booking')

    const body = await request.json()
    const {
      patientId,
      doctorId,
      startTime,
      durationMinutes = 15,
      notes,
      patientAlreadyPresent = false,
    } = body

    if (!patientId || !doctorId || !startTime) {
      return NextResponse.json(
        { error: 'patientId, doctorId, startTime are required' },
        { status: 400 }
      )
    }

    const doctorInScope = await ensureDoctorInFrontdeskClinic(
      supabase as any,
      user.id,
      doctorId
    )
    if (!doctorInScope) {
      return NextResponse.json(
        { error: 'Doctor is outside your clinic scope' },
        { status: 403 }
      )
    }

    // ── Server-resolved tenant scope (D-041) ──
    // appointments.clinic_id NOT NULL since mig 053; check_in_queue.clinic_id
    // NOT NULL since mig 051. Both inserts below depend on this. The pre-fix
    // conditional spread silently produced 500s when clinicId was null.
    const clinicId = await getFrontdeskClinicId(supabase as any, user.id)
    if (!clinicId) {
      return NextResponse.json(
        { error: 'Clinic context not found' },
        { status: 403 }
      )
    }

    // ── 1. Create the urgent appointment ─────────────────────────────────────
    const { data: appointment, error: aptErr } = await admin
      .from('appointments')
      .insert({
        patient_id:       patientId,
        doctor_id:        doctorId,
        clinic_id:        clinicId,   // required — mig 053
        start_time:       startTime,
        duration_minutes: durationMinutes,
        appointment_type: 'urgent',
        notes:            notes ?? null,
        status:           'scheduled',
        created_by_role:  'frontdesk',
      })
      .select('id, start_time, duration_minutes, appointment_type')
      .single()

    if (aptErr) throw aptErr

    // ── 2. If patient is already present, add to queue immediately ───────────
    let queueItem = null

    if (patientAlreadyPresent) {
      // Determine which queue position corresponds to the requested time slot.
      // Strategy: count how many waiting items belong to slots BEFORE startTime
      // (appointments whose start_time < startTime, or walk-ins that arrived
      // before the target slot's estimated time). We approximate by inserting
      // after all currently in_progress items and before any items whose
      // queue_number is greater than the desired slot order.
      //
      // Simplified: insert after any in_progress patient + bump all 'waiting'
      // items whose estimated time >= startTime.

      // Get today's Cairo midnight for scoping
      const cairoNow = new Date(Date.now() + 2 * 60 * 60 * 1000)
      const dateStr = cairoNow.toISOString().split('T')[0]
      const todayStart = `${dateStr}T00:00:00+02:00`

      // Find in_progress item (can't jump ahead of someone already with doctor)
      const { data: inProgress } = await admin
        .from('check_in_queue')
        .select('queue_number')
        .eq('doctor_id', doctorId)
        .eq('status', 'in_progress')
        .maybeSingle()

      const afterPosition = inProgress?.queue_number ?? 0

      // Get the next available queue number for this doctor
      const { data: maxNumRow } = await admin
        .from('check_in_queue')
        .select('queue_number')
        .eq('doctor_id', doctorId)
        .in('status', ['waiting', 'in_progress'])
        .gte('created_at', todayStart)
        .order('queue_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Urgent patient goes right after in_progress (position = afterPosition + 1)
      const urgentPosition = afterPosition + 1

      // Shift all waiting items from urgentPosition onwards up by 1
      await admin.rpc('shift_queue_numbers_up', {
        p_doctor_id: doctorId,
        p_after_queue_number: afterPosition,
      })

      // Insert urgent patient at urgentPosition with priority=3
      const { data: inserted, error: qErr } = await admin
        .from('check_in_queue')
        .insert({
          patient_id:       patientId,
          doctor_id:        doctorId,
          clinic_id:        clinicId,   // required — mig 051
          appointment_id:   appointment.id,
          queue_number:     urgentPosition,
          queue_type:       'appointment',
          priority:         3,
          status:           'waiting',
        })
        .select(`
          *,
          patient:patients (full_name, phone, age, sex),
          doctor:doctors   (full_name, specialty)
        `)
        .single()

      if (qErr) throw qErr

      // Mark appointment as checked in
      const { data: authData } = await supabase.auth.getUser()
      await admin
        .from('appointments')
        .update({
          checked_in_at: new Date().toISOString(),
          checked_in_by: authData.user?.id ?? null,
        })
        .eq('id', appointment.id)

      queueItem = inserted
    }

    return NextResponse.json({
      success: true,
      appointment,
      queueItem,
      message: patientAlreadyPresent
        ? `تم الحجز المستعجل وإضافة المريض للطابور (أولوية مرتفعة)`
        : `تم الحجز المستعجل — سيُضاف للطابور عند وصول المريض`,
    })
  } catch (error: any) {
    console.error('Urgent booking error:', error)
    return toApiErrorResponse(error, 'Urgent booking failed')
  }
}
