import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { cairoTodayEnd, cairoTodayStart } from '@shared/lib/date/cairo-date'

// translateSpecialty lives in a client-safe utility so Client Components
// can import it without pulling in next/headers via this file.
export { translateSpecialty } from '@shared/lib/utils/specialty-labels'

// ============================================================================
// TYPES — Shared across all frontdesk, doctor, and API consumers
// ============================================================================

// ── Embedded sub-objects ──

export interface PatientSummary {
  full_name: string | null
  phone: string
  age: number | null
  sex: string | null
}

export interface PatientWithId extends PatientSummary {
  id: string
}

export interface DoctorSummary {
  full_name: string | null
  specialty: string
}

export interface DoctorWithId extends DoctorSummary {
  id: string
}

// ── Queue ──

export type QueueType = 'appointment' | 'walkin' | 'emergency'
export type QueueStatus = 'waiting' | 'in_progress' | 'completed' | 'cancelled'
export type WindowStatus = 'none' | 'open' | 'expired'

export interface CheckInQueueItem {
  id: string
  patient_id: string
  doctor_id: string
  appointment_id: string | null
  queue_number: number
  queue_type: QueueType
  // Priority: 9=emergency, 3=urgent booking, 2=appointment on-time, 1=walk-in, 0=late
  priority: number
  status: QueueStatus
  checked_in_at: string
  called_at: string | null
  completed_at: string | null
  // Window state — set when this item was swapped in for a deferred appointment
  apt_window_status: WindowStatus
  swapped_appointment_id: string | null
  swapped_patient_name: string | null
  patient: PatientSummary
  doctor: DoctorSummary
}

// Result returned after completing a queue session
export interface SessionCompleteResult {
  completed: true
  // A new window was opened: next walk-in is now carrying an appointment window
  windowOpened: boolean
  swappedAppointmentId?: string
  swappedPatientName?: string
  // A previously open window has now expired → appointment auto-marked no_show
  windowExpired: boolean
  expiredAppointmentId?: string
  expiredPatientName?: string
}

// ── Payments ──

export type PaymentMethod = 'cash' | 'card' | 'insurance' | 'transfer' | 'other'
export type PaymentStatus = 'pending' | 'completed' | 'refunded' | 'cancelled'

export interface Payment {
  id: string
  patient_id: string
  doctor_id: string
  appointment_id: string | null
  clinical_note_id: string | null
  amount: number
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  notes: string | null
  collected_by: string | null
  created_at: string
  updated_at?: string
}

/** Enriched payment returned by the payments GET API (includes names) */
export interface EnrichedPayment extends Payment {
  patient?: { full_name: string | null }
  doctor?: { full_name: string | null }
}

// ── Appointments ──

export type AppointmentStatus = 'scheduled' | 'cancelled' | 'completed' | 'no_show'
export type AppointmentType = 'regular' | 'followup' | 'emergency' | 'consultation' | 'urgent'

export interface Appointment {
  id: string
  start_time: string
  duration_minutes: number
  status: AppointmentStatus
  type: AppointmentType
  notes: string | null
  // Window tracking — set when this appointment's slot is being held open
  window_status?: WindowStatus
  window_queue_id?: string | null
  doctor: DoctorWithId
  patient: PatientWithId
}

// ── Doctor Availability ──

export interface DoctorAvailability {
  id: string
  doctor_id: string
  day_of_week: number // 0 = Sunday, 6 = Saturday
  start_time: string
  end_time: string
  slot_duration_minutes: number
  is_active: boolean
}

export interface AvailableSlot {
  start_time: string
  end_time: string
  is_booked: boolean
  appointment_id?: string
}

// ── Gap-aware schedule types ──

/** A single block on the doctor's timeline */
export interface ScheduleBlock {
  start_time: string           // ISO timestamp
  end_time: string             // ISO timestamp
  block_type: 'appointment' | 'walkin' | 'urgent' | 'free'
  patient_name?: string
  queue_number?: number
  minutes_free?: number        // only set on 'free' blocks
}

/**
 * Full gap-aware schedule for a doctor on a given date.
 * Used by WalkInSheet to show estimated slot time before confirming check-in.
 */
export interface GapAwareSchedule {
  /** ISO timestamp of the next free slot for a new walk-in, or null if none */
  nextAvailableSlot: string | null
  /** Human-readable time like "15:30", null if none */
  nextAvailableSlotDisplay: string | null
  /** Minutes from now until the walk-in will be seen */
  estimatedWaitMinutes: number
  /** True when the next free gap is smaller than slot_duration_minutes */
  gapTooSmall: boolean
  /** Size of the next available gap in minutes */
  availableGapMinutes: number
  /** Doctor's configured slot duration for walk-ins */
  slotDurationMinutes: number
  /** Full ordered timeline: appointments + walk-in slots + free blocks */
  blocks: ScheduleBlock[]
}

// ── Pagination ──

export interface PaginationParams {
  page?: number
  limit?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

async function hydrateQueueDoctors<T extends { doctor_id: string; doctor?: any }>(
  rows: T[]
): Promise<T[]> {
  const missingDoctorIds = Array.from(
    new Set(rows.filter((row) => !row.doctor).map((row) => row.doctor_id))
  )

  if (missingDoctorIds.length === 0) {
    return rows
  }

  const adminSupabase = createAdminClient('patient-privacy-checks')
  const { data: doctors } = await adminSupabase
    .from('doctors')
    .select('id, full_name, specialty')
    .in('id', missingDoctorIds)

  const doctorMap = new Map((doctors || []).map((doctor: any) => [doctor.id, doctor]))
  return rows.map((row) => ({
    ...row,
    doctor: row.doctor || doctorMap.get(row.doctor_id) || { full_name: 'Unknown Doctor', specialty: '' }
  }))
}

// ============================================================================
// CHECK-IN QUEUE
// ============================================================================

/**
 * Get today's queue for all doctors or specific doctor
 */
export async function getTodayQueue(doctorId?: string | string[]): Promise<CheckInQueueItem[]> {
  // Use admin client so RLS on patients/doctors tables never blocks the join.
  // The queue API is already role-gated at the HTTP layer (requireApiRole).
  const adminSupabase = createAdminClient('queue-with-patient-names')

  // Use Cairo midnight (UTC+3) so the "today" boundary is correct for Egypt
  const nowCairo = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const dateStr = nowCairo.toISOString().split('T')[0]
  const cairoMidnight = `${dateStr}T00:00:00+03:00`

  let query = adminSupabase
    .from('check_in_queue')
    .select(`
      *,
      patient:patients (
        full_name,
        phone,
        age,
        sex
      ),
      doctor:doctors (
        full_name,
        specialty
      )
    `)
    .gte('created_at', cairoMidnight)
    .in('status', ['waiting', 'in_progress'])
    .order('priority', { ascending: false })
    .order('queue_number', { ascending: true })
    .limit(200)

  if (Array.isArray(doctorId)) {
    query = query.in('doctor_id', doctorId)
  } else if (doctorId) {
    query = query.eq('doctor_id', doctorId)
  }

  const { data, error } = await query

  if (error) throw new Error(error.message)

  const normalized = await hydrateQueueDoctors((data || []) as any[])
  return normalized as unknown as CheckInQueueItem[]
}

/**
 * Get queue items for a date range (all statuses — for reports)
 */
export async function getQueueByDateRange(
  doctorIds: string[],
  dateFrom: Date,
  dateTo: Date
): Promise<CheckInQueueItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('check_in_queue')
    .select(`
      *,
      patient:patients (
        full_name,
        phone,
        age,
        sex
      ),
      doctor:doctors (
        full_name,
        specialty
      )
    `)
    .in('doctor_id', doctorIds)
    .gte('created_at', dateFrom.toISOString())
    .lte('created_at', dateTo.toISOString())
    .order('queue_number', { ascending: true })
    .limit(500)

  if (error) throw new Error(error.message)

  const normalized = await hydrateQueueDoctors((data || []) as any[])
  return normalized as unknown as CheckInQueueItem[]
}

/**
 * Check in a patient — window-aware.
 *
 * If the patient has a booked appointment whose window_status = 'open',
 * they are inserted IMMEDIATELY AFTER the currently in-progress patient
 * rather than at the back of the queue.
 *
 * If the appointment has already been auto-marked no_show (window expired),
 * the patient is downgraded to a walk-in.
 */
export async function checkInPatient(params: {
  patientId: string
  doctorId: string
  appointmentId?: string
  queueType: 'appointment' | 'walkin' | 'emergency'
}): Promise<CheckInQueueItem> {
  const supabase = await createClient()
  const admin = createAdminClient('window-aware-checkin')

  let effectiveQueueType: QueueType = params.queueType
  let effectiveAppointmentId: string | null = params.appointmentId ?? null
  let insertAfterQueueNumber: number | null = null

  // ── Window-aware logic (only for appointment check-ins) ──────────────────
  if (params.appointmentId && params.queueType === 'appointment') {
    const { data: apt } = await admin
      .from('appointments')
      .select('id, status, window_status, window_queue_id')
      .eq('id', params.appointmentId)
      .maybeSingle()

    if (apt) {
      if (apt.status === 'no_show') {
        // Window already expired — downgrade to walk-in
        effectiveQueueType = 'walkin'
        effectiveAppointmentId = null
      } else if (apt.window_status === 'open') {
        // Window is open — find the in-progress session (the window carrier)
        const { data: inProgress } = await admin
          .from('check_in_queue')
          .select('id, queue_number')
          .eq('doctor_id', params.doctorId)
          .eq('status', 'in_progress')
          .maybeSingle()

        if (inProgress) {
          insertAfterQueueNumber = inProgress.queue_number

          // Close the window on the appointment
          await admin
            .from('appointments')
            .update({ window_status: 'expired' })
            .eq('id', params.appointmentId)

          // Close the window on the carrier queue item
          if (apt.window_queue_id) {
            await admin
              .from('check_in_queue')
              .update({ apt_window_status: 'expired' })
              .eq('id', apt.window_queue_id)
          }
        }
      }
    }
  }

  // ── Determine queue position ─────────────────────────────────────────────
  let queueNumber: number

  if (insertAfterQueueNumber !== null) {
    // Atomically shift everything after the in-progress patient up by 1
    await admin.rpc('shift_queue_numbers_up', {
      p_doctor_id: params.doctorId,
      p_after_queue_number: insertAfterQueueNumber,
    })
    queueNumber = insertAfterQueueNumber + 1
  } else {
    const { data: nextNum } = await supabase
      .rpc('get_next_queue_number', { p_doctor_id: params.doctorId })
    queueNumber = nextNum || 1
  }

  // ── Derive priority from queue type ─────────────────────────────────────
  const priorityMap: Record<QueueType, number> = {
    emergency:   9,
    appointment: insertAfterQueueNumber !== null ? 2 : 2, // window arrival same as on-time
    walkin:      1,
  }
  const itemPriority = priorityMap[effectiveQueueType]

  // ── Insert queue entry ───────────────────────────────────────────────────
  const { data, error } = await admin
    .from('check_in_queue')
    .insert({
      patient_id: params.patientId,
      doctor_id: params.doctorId,
      appointment_id: effectiveAppointmentId,
      queue_number: queueNumber,
      queue_type: effectiveQueueType,
      priority: itemPriority,
      status: 'waiting',
    })
    .select(`
      *,
      patient:patients (full_name, phone, age, sex),
      doctor:doctors  (full_name, specialty)
    `)
    .single()

  if (error) throw new Error(error.message)

  // ── For walk-ins, assign an estimated slot time (gap-aware) ──────────────
  if (effectiveQueueType === 'walkin') {
    // Fire-and-forget: if RPC fails, check-in still succeeds
    assignWalkinSlot(params.doctorId, data.id).catch((e) =>
      console.error('assignWalkinSlot failed (non-fatal):', e)
    )
  }

  // Mark appointment as checked-in
  if (effectiveAppointmentId) {
    const { data: authData } = await supabase.auth.getUser()
    await admin
      .from('appointments')
      .update({
        checked_in_at: new Date().toISOString(),
        checked_in_by: authData.user?.id ?? null,
      })
      .eq('id', effectiveAppointmentId)
  }

  const [normalized] = await hydrateQueueDoctors([data as any])
  return normalized as unknown as CheckInQueueItem
}

/**
 * Update queue item status (non-completion transitions: waiting → in_progress, cancelled)
 */
export async function updateQueueStatus(
  queueId: string,
  status: 'waiting' | 'in_progress' | 'cancelled'
): Promise<void> {
  const supabase = await createClient()

  const updates: Record<string, unknown> = { status }
  if (status === 'in_progress') updates.called_at = new Date().toISOString()
  if (status === 'cancelled')   updates.completed_at = new Date().toISOString()

  const { error } = await supabase
    .from('check_in_queue')
    .update(updates)
    .eq('id', queueId)

  if (error) throw new Error(error.message)
}

/**
 * Complete a queue session — the primary completion path.
 *
 * Beyond marking the item completed it drives the window state machine:
 *
 * 1. If the completing item WAS a window carrier (apt_window_status = 'open'):
 *    - If appointment patient arrived during the window → silently expire the window.
 *    - If appointment patient never arrived → mark appointment as no_show and expire.
 *
 * 2. After completion, check whether the NEXT waiting item should open a new window:
 *    - Look for a scheduled appointment whose start_time has passed and whose
 *      patient has not yet checked in (window_status = 'none').
 *    - If found, mark the next queue item as the window carrier and set the
 *      appointment's window_status = 'open'.
 */
export async function completeQueueSession(queueId: string): Promise<SessionCompleteResult> {
  const admin = createAdminClient('complete-queue-session')

  const result: SessionCompleteResult = {
    completed: true,
    windowOpened: false,
    windowExpired: false,
  }

  // ── 1. Fetch the item being completed ────────────────────────────────────
  const { data: item, error: fetchErr } = await admin
    .from('check_in_queue')
    .select('id, doctor_id, queue_number, apt_window_status, swapped_appointment_id')
    .eq('id', queueId)
    .single()

  if (fetchErr || !item) throw new Error('Queue item not found')

  const now = new Date().toISOString()

  // ── 2. Mark completed (expire any open window on this item) ──────────────
  await admin
    .from('check_in_queue')
    .update({
      status: 'completed',
      completed_at: now,
      ...(item.apt_window_status === 'open' ? { apt_window_status: 'expired' } : {}),
    })
    .eq('id', queueId)

  // ── 3. Handle window expiry for the appointment that was deferred ─────────
  if (item.apt_window_status === 'open' && item.swapped_appointment_id) {
    // Did the appointment patient check in during the window?
    const { data: aptQueue } = await admin
      .from('check_in_queue')
      .select('id')
      .eq('appointment_id', item.swapped_appointment_id)
      .neq('status', 'cancelled')
      .maybeSingle()

    if (!aptQueue) {
      // Patient never came — auto no_show
      const { data: apt } = await admin
        .from('appointments')
        .select('id, patient_id, patient:patients(full_name)')
        .eq('id', item.swapped_appointment_id)
        .maybeSingle() as { data: { id: string; patient_id: string; patient: { full_name: string | null } | null } | null }

      await admin
        .from('appointments')
        .update({ status: 'no_show', window_status: 'expired' })
        .eq('id', item.swapped_appointment_id)

      result.windowExpired = true
      result.expiredAppointmentId = item.swapped_appointment_id
      result.expiredPatientName = apt?.patient?.full_name ?? 'مريض'
    } else {
      // Patient arrived during window — just close the window flag
      await admin
        .from('appointments')
        .update({ window_status: 'expired' })
        .eq('id', item.swapped_appointment_id)
    }
  }

  // ── 4. Check if the NEXT waiting item should open a new window ───────────
  // Cairo = UTC+2
  const cairoNow = new Date(Date.now() + 2 * 60 * 60 * 1000)

  const { data: nextItem } = await admin
    .from('check_in_queue')
    .select('id, queue_type, queue_number')
    .eq('doctor_id', item.doctor_id)
    .eq('status', 'waiting')
    .order('queue_number', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (nextItem) {
    // Look for a scheduled appointment that should have started and hasn't arrived
    const { data: pendingApt } = await admin
      .from('appointments')
      .select('id, start_time, patient_id, patient:patients(full_name)')
      .eq('doctor_id', item.doctor_id)
      .eq('status', 'scheduled')
      .eq('window_status', 'none')
      .lte('start_time', cairoNow.toISOString())
      .is('checked_in_at', null)
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle() as { data: { id: string; start_time: string; patient_id: string; patient: { full_name: string | null } | null } | null }

    if (pendingApt) {
      const patientName = pendingApt.patient?.full_name ?? 'مريض'

      // Mark next queue item as the window carrier
      await admin
        .from('check_in_queue')
        .update({
          apt_window_status: 'open',
          swapped_appointment_id: pendingApt.id,
          swapped_patient_name: patientName,
        })
        .eq('id', nextItem.id)

      // Mark appointment as having an open window
      await admin
        .from('appointments')
        .update({
          window_status: 'open',
          window_queue_id: nextItem.id,
        })
        .eq('id', pendingApt.id)

      result.windowOpened = true
      result.swappedAppointmentId = pendingApt.id
      result.swappedPatientName = patientName
    }
  }

  return result
}

// ============================================================================
// APPOINTMENTS
// ============================================================================

/**
 * Get available time slots for a doctor on a specific date.
 *
 * Gap-aware: merges both scheduled appointments AND active walk-in queue
 * entries (those with estimated_slot_time) so that gaps used by walk-ins
 * are not offered again for new bookings.
 */
export async function getAvailableSlots(
  doctorId: string,
  date: string // YYYY-MM-DD
): Promise<AvailableSlot[]> {
  const supabase = await createClient()
  const admin = createAdminClient('available-slots-gap-aware')

  // Get day of week (0 = Sunday)
  const dayOfWeek = new Date(date).getDay()

  // Get doctor's availability for this day
  const { data: availability } = await supabase
    .from('doctor_availability')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)
    .single()

  if (!availability) {
    return [] // Doctor not available on this day
  }

  // Date range in Cairo timezone (UTC+2)
  const startOfDay = `${date}T00:00:00+02:00`
  const endOfDay   = `${date}T23:59:59+02:00`

  // Fetch scheduled appointments (not cancelled / no_show)
  const { data: appointments } = await admin
    .from('appointments')
    .select('id, start_time, duration_minutes')
    .eq('doctor_id', doctorId)
    .not('status', 'in', '("cancelled","no_show")')
    .gte('start_time', startOfDay)
    .lte('start_time', endOfDay)

  // Fetch active walk-in slots already assigned (gap-aware)
  const { data: walkinSlots } = await admin
    .from('check_in_queue')
    .select('estimated_slot_time')
    .eq('doctor_id', doctorId)
    .eq('queue_type', 'walkin')
    .in('status', ['waiting', 'in_progress'])
    .gte('estimated_slot_time', startOfDay)
    .lte('estimated_slot_time', endOfDay)
    .not('estimated_slot_time', 'is', null)

  const slotDuration = availability.slot_duration_minutes

  const [startHour, startMinute] = (availability.start_time as string).split(':').map(Number)
  const [endHour, endMinute]     = (availability.end_time   as string).split(':').map(Number)

  // Build slot times using Cairo timezone (UTC+2) to avoid server-UTC offset bugs
  const pad = (n: number) => String(n).padStart(2, '0')
  let currentTime = new Date(`${date}T${pad(startHour)}:${pad(startMinute)}:00+02:00`)

  const endTime = new Date(`${date}T${pad(endHour)}:${pad(endMinute)}:00+02:00`)

  const slots: AvailableSlot[] = []

  while (currentTime < endTime) {
    const slotStart = new Date(currentTime)
    const slotEnd   = new Date(currentTime.getTime() + slotDuration * 60000)

    // Occupied by a scheduled appointment?
    const isAppointmentBooked = appointments?.some(apt => {
      const aptStart = new Date(apt.start_time)
      const aptEnd   = new Date(aptStart.getTime() + apt.duration_minutes * 60000)
      return slotStart < aptEnd && slotEnd > aptStart
    }) ?? false

    // Occupied by an existing walk-in queue slot?
    const isWalkinBooked = walkinSlots?.some(ws => {
      if (!ws.estimated_slot_time) return false
      const wsStart = new Date(ws.estimated_slot_time)
      const wsEnd   = new Date(wsStart.getTime() + slotDuration * 60000)
      return slotStart < wsEnd && slotEnd > wsStart
    }) ?? false

    const isBooked = isAppointmentBooked || isWalkinBooked

    const bookedAppointment = appointments?.find(apt => {
      const aptStart = new Date(apt.start_time)
      return aptStart.getTime() === slotStart.getTime()
    })

    slots.push({
      start_time: slotStart.toISOString(),
      end_time:   slotEnd.toISOString(),
      is_booked:  isBooked,
      appointment_id: bookedAppointment?.id,
    })

    currentTime = slotEnd
  }

  return slots
}

/**
 * Get the gap-aware schedule for a doctor on a given date.
 *
 * Merges appointments + active queue walk-in slots into a full timeline,
 * then finds the next free gap for a new walk-in patient.
 *
 * Used by WalkInSheet to:
 *   - Show the estimated check-in time before confirming arrival
 *   - Warn when the only available gap is < slot_duration_minutes
 *   - Render a visual timeline of the doctor's day
 */
export async function getGapAwareSchedule(
  doctorId: string,
  date?: string // YYYY-MM-DD, defaults to today (Cairo)
): Promise<GapAwareSchedule> {
  const admin = createAdminClient('gap-aware-schedule')

  // ── Resolve date in Cairo timezone (UTC+2) ────────────────────────────────
  const cairoNow  = new Date(Date.now() + 2 * 60 * 60 * 1000)
  const targetDate = date ?? cairoNow.toISOString().split('T')[0]
  const dayOfWeek  = new Date(targetDate).getDay()

  // ── Doctor availability for this day ─────────────────────────────────────
  const { data: avail } = await admin
    .from('doctor_availability')
    .select('start_time, end_time, slot_duration_minutes')
    .eq('doctor_id', doctorId)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true)
    .maybeSingle()

  const slotDuration = (avail?.slot_duration_minutes as number | null) ?? 15

  if (!avail) {
    return {
      nextAvailableSlot:        null,
      nextAvailableSlotDisplay: null,
      estimatedWaitMinutes:     0,
      gapTooSmall:              false,
      availableGapMinutes:      0,
      slotDurationMinutes:      slotDuration,
      blocks:                   [],
    }
  }

  // ── Build day boundaries (Cairo UTC+2) ───────────────────────────────────
  const [sh, sm] = (avail.start_time as string).split(':').map(Number)
  const [eh, em] = (avail.end_time   as string).split(':').map(Number)

  const dayStart = new Date(`${targetDate}T${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}:00+02:00`)
  const dayEnd   = new Date(`${targetDate}T${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}:00+02:00`)

  // ── Fetch scheduled appointments ─────────────────────────────────────────
  const { data: apts } = await admin
    .from('appointments')
    .select('id, start_time, duration_minutes, appointment_type, patient:patients(full_name)')
    .eq('doctor_id', doctorId)
    .not('status', 'in', '("cancelled","no_show")')
    .gte('start_time', dayStart.toISOString())
    .lt('start_time', dayEnd.toISOString())
    .order('start_time', { ascending: true })

  // ── Fetch walk-in queue entries with estimated_slot_time ─────────────────
  const { data: walkins } = await admin
    .from('check_in_queue')
    .select('queue_number, estimated_slot_time, patient:patients(full_name)')
    .eq('doctor_id', doctorId)
    .eq('queue_type', 'walkin')
    .in('status', ['waiting', 'in_progress'])
    .gte('estimated_slot_time', dayStart.toISOString())
    .lt('estimated_slot_time', dayEnd.toISOString())
    .not('estimated_slot_time', 'is', null)
    .order('estimated_slot_time', { ascending: true })

  // ── Build occupied blocks list ────────────────────────────────────────────
  type OccupiedBlock = { start: Date; end: Date }
  const occupied: OccupiedBlock[] = []

  const blocks: ScheduleBlock[] = []

  for (const apt of (apts ?? [])) {
    const s = new Date(apt.start_time)
    const e = new Date(s.getTime() + apt.duration_minutes * 60000)
    const patientObj = (apt as any).patient
    occupied.push({ start: s, end: e })
    blocks.push({
      start_time:   s.toISOString(),
      end_time:     e.toISOString(),
      block_type:   apt.appointment_type === 'urgent' ? 'urgent' : 'appointment',
      patient_name: patientObj?.full_name ?? undefined,
    })
  }

  for (const wk of (walkins ?? [])) {
    if (!wk.estimated_slot_time) continue
    const s = new Date(wk.estimated_slot_time)
    const e = new Date(s.getTime() + slotDuration * 60000)
    const patientObj = (wk as any).patient
    occupied.push({ start: s, end: e })
    blocks.push({
      start_time:   s.toISOString(),
      end_time:     e.toISOString(),
      block_type:   'walkin',
      patient_name: patientObj?.full_name ?? undefined,
      queue_number: wk.queue_number,
    })
  }

  // Sort occupied by start time
  occupied.sort((a, b) => a.start.getTime() - b.start.getTime())
  blocks.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  // ── Find free gaps and insert them into blocks ────────────────────────────
  let cursor = new Date(Math.max(dayStart.getTime(), cairoNow.getTime()))
  // Snap cursor forward to next slot-duration boundary
  const msPerSlot = slotDuration * 60000
  const snapped = Math.ceil(cursor.getTime() / msPerSlot) * msPerSlot
  cursor = new Date(snapped)

  let nextAvailableSlot: string | null = null
  let availableGapMinutes = 0
  let gapTooSmall = false

  const tempFreeBlocks: ScheduleBlock[] = []

  while (cursor < dayEnd) {
    const slotEnd = new Date(cursor.getTime() + slotDuration * 60000)
    if (slotEnd > dayEnd) break

    // Check conflict with any occupied block
    const conflict = occupied.some(
      (o) => cursor < o.end && slotEnd > o.start
    )

    if (!conflict) {
      // Free gap found — measure how large it is
      const nextOccupied = occupied
        .filter((o) => o.start >= cursor)
        .sort((a, b) => a.start.getTime() - b.start.getTime())[0]

      const gapEnd   = nextOccupied ? new Date(Math.min(nextOccupied.start.getTime(), dayEnd.getTime())) : dayEnd
      const gapMins  = Math.floor((gapEnd.getTime() - cursor.getTime()) / 60000)

      if (!nextAvailableSlot) {
        nextAvailableSlot    = cursor.toISOString()
        availableGapMinutes  = gapMins
        gapTooSmall          = gapMins < slotDuration

        tempFreeBlocks.push({
          start_time:   cursor.toISOString(),
          end_time:     gapEnd.toISOString(),
          block_type:   'free',
          minutes_free: gapMins,
        })
      }

      // Jump cursor past this whole free gap to find the next occupied block
      cursor = gapEnd
    } else {
      // Advance past all overlapping occupied blocks
      const overlap = occupied.filter((o) => o.start < slotEnd && o.end > cursor)
      const furthest = overlap.reduce((max, o) => (o.end > max ? o.end : max), cursor)
      // Snap to next slot boundary
      const snappedFurthest = new Date(Math.ceil(furthest.getTime() / msPerSlot) * msPerSlot)
      cursor = snappedFurthest
    }
  }

  // Merge free blocks into the timeline
  blocks.push(...tempFreeBlocks)
  blocks.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  // ── Compute estimated wait minutes ────────────────────────────────────────
  let estimatedWaitMinutes = 0
  if (nextAvailableSlot) {
    estimatedWaitMinutes = Math.max(
      0,
      Math.round((new Date(nextAvailableSlot).getTime() - cairoNow.getTime()) / 60000)
    )
  }

  // ── Format display time (Cairo HH:MM) ────────────────────────────────────
  let nextAvailableSlotDisplay: string | null = null
  if (nextAvailableSlot) {
    const slotDate = new Date(nextAvailableSlot)
    const cairoSlot = new Date(slotDate.getTime() + 2 * 60 * 60 * 1000)
    nextAvailableSlotDisplay = cairoSlot.toISOString().substring(11, 16)
  }

  return {
    nextAvailableSlot,
    nextAvailableSlotDisplay,
    estimatedWaitMinutes,
    gapTooSmall,
    availableGapMinutes,
    slotDurationMinutes: slotDuration,
    blocks,
  }
}

/**
 * Compute and store estimated_slot_time for a new walk-in check-in.
 * Calls get_next_walkin_slot Postgres RPC which is gap-aware.
 *
 * Returns the ISO slot time assigned, or null if no gap available.
 */
export async function assignWalkinSlot(
  doctorId: string,
  queueItemId: string,
  slotDurationMinutes?: number
): Promise<string | null> {
  const admin = createAdminClient('assign-walkin-slot')

  const { data: slotTime, error } = await admin.rpc('get_next_walkin_slot', {
    p_doctor_id:     doctorId,
    p_slot_duration: slotDurationMinutes ?? 15,
  })

  if (error) {
    console.error('assignWalkinSlot RPC error:', error)
    return null
  }

  if (!slotTime) return null

  await admin
    .from('check_in_queue')
    .update({ estimated_slot_time: slotTime })
    .eq('id', queueItemId)

  return slotTime as string
}

/**
 * Create new appointment
 */
export async function createAppointment(params: {
  doctorId: string
  patientId: string
  startTime: string
  durationMinutes: number
  appointmentType?: string
  notes?: string
  clinicId?: string | null
}): Promise<any> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      doctor_id: params.doctorId,
      patient_id: params.patientId,
      start_time: params.startTime,
      duration_minutes: params.durationMinutes,
      appointment_type: params.appointmentType || 'regular',
      notes: params.notes,
      status: 'scheduled',
      created_by_role: 'frontdesk',
      ...(params.clinicId && { clinic_id: params.clinicId })
    })
    .select()
    .single()
  
  if (error) throw new Error(error.message)
  
  return data
}

/**
 * Cancel appointment
 */
export async function cancelAppointment(appointmentId: string): Promise<void> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appointmentId)
  
  if (error) throw new Error(error.message)
}

/**
 * Reschedule appointment
 */
export async function rescheduleAppointment(
  appointmentId: string,
  newStartTime: string
): Promise<void> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('appointments')
    .update({ start_time: newStartTime })
    .eq('id', appointmentId)
  
  if (error) throw new Error(error.message)
}

// ============================================================================
// PAYMENTS
// ============================================================================

/**
 * Create payment record.
 *
 * `clinicId` is REQUIRED — every payment is scoped to a clinic. The frontdesk
 * handler should resolve via getFrontdeskClinicId() before calling. Schema
 * enforces NOT NULL since migration 047. See doctor analytics scoping in
 * commit ed5aa2a for why this matters.
 */
export async function createPayment(params: {
  patientId: string
  doctorId: string
  clinicId: string
  amount: number
  paymentMethod: 'cash' | 'card' | 'insurance' | 'other'
  appointmentId?: string
  clinicalNoteId?: string
  notes?: string
}): Promise<Payment> {
  // Defense-in-depth: TS already requires clinicId, runtime guard catches
  // `as any` callers and stale JS bundles. Migration 047 documents the
  // historical orphan rows that motivated this guard.
  if (!params.clinicId) {
    throw new Error('createPayment: clinicId is required (no orphan payments)')
  }

  const supabase = await createClient()

  const user = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('payments')
    .insert({
      patient_id: params.patientId,
      doctor_id: params.doctorId,
      clinic_id: params.clinicId,   // required — see params doc + mig 047
      amount: params.amount,
      payment_method: params.paymentMethod,
      appointment_id: params.appointmentId,
      clinical_note_id: params.clinicalNoteId,
      notes: params.notes,
      payment_status: 'completed',
      collected_by: user.data.user?.id
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  return data as Payment
}

/**
 * Get today's payments — "today" is the Cairo wall-clock day, so the
 * window flips at 00:00 Cairo (not 02:00–03:00 Cairo, which is what
 * server-local UTC midnight would yield).
 */
export async function getTodayPayments(): Promise<Payment[]> {
  const supabase = await createClient()

  const todayStart = cairoTodayStart()
  const todayEnd   = cairoTodayEnd()

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .gte('created_at', todayStart.toISOString())
    .lte('created_at', todayEnd.toISOString())
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return data as Payment[]
}

/**
 * Get payment statistics
 */
export async function getPaymentStats(startDate?: string, endDate?: string) {
  const supabase = await createClient()
  
  let query = supabase
    .from('payments')
    .select('amount, payment_method, payment_status, created_at')
    .eq('payment_status', 'completed')
  
  if (startDate) {
    query = query.gte('created_at', startDate)
  }
  if (endDate) {
    query = query.lte('created_at', endDate)
  }
  
  const { data, error } = await query
  
  if (error) throw new Error(error.message)
  
  const payments = data as Payment[]
  
  return {
    total: payments.reduce((sum, p) => sum + Number(p.amount), 0),
    count: payments.length,
    by_method: {
      cash: payments.filter(p => p.payment_method === 'cash').reduce((sum, p) => sum + Number(p.amount), 0),
      card: payments.filter(p => p.payment_method === 'card').reduce((sum, p) => sum + Number(p.amount), 0),
      insurance: payments.filter(p => p.payment_method === 'insurance').reduce((sum, p) => sum + Number(p.amount), 0),
      other: payments.filter(p => p.payment_method === 'other').reduce((sum, p) => sum + Number(p.amount), 0)
    }
  }
}
