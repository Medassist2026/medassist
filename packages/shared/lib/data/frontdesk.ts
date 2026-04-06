import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'

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
export type AppointmentType = 'regular' | 'followup' | 'emergency' | 'consultation'

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

  // ── Insert queue entry ───────────────────────────────────────────────────
  const { data, error } = await admin
    .from('check_in_queue')
    .insert({
      patient_id: params.patientId,
      doctor_id: params.doctorId,
      appointment_id: effectiveAppointmentId,
      queue_number: queueNumber,
      queue_type: effectiveQueueType,
      status: 'waiting',
    })
    .select(`
      *,
      patient:patients (full_name, phone, age, sex),
      doctor:doctors  (full_name, specialty)
    `)
    .single()

  if (error) throw new Error(error.message)

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
 * Get available time slots for a doctor on a specific date
 */
export async function getAvailableSlots(
  doctorId: string,
  date: string // YYYY-MM-DD
): Promise<AvailableSlot[]> {
  const supabase = await createClient()
  
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
  
  // Get existing appointments for this date
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)
  
  const { data: appointments } = await supabase
    .from('appointments')
    .select('id, start_time, duration_minutes')
    .eq('doctor_id', doctorId)
    .eq('status', 'scheduled')
    .gte('start_time', startOfDay.toISOString())
    .lte('start_time', endOfDay.toISOString())
  
  // Generate time slots
  const slots: AvailableSlot[] = []
  const slotDuration = availability.slot_duration_minutes
  
  const [startHour, startMinute] = availability.start_time.split(':').map(Number)
  const [endHour, endMinute] = availability.end_time.split(':').map(Number)
  
  let currentTime = new Date(date)
  currentTime.setHours(startHour, startMinute, 0, 0)
  
  const endTime = new Date(date)
  endTime.setHours(endHour, endMinute, 0, 0)
  
  while (currentTime < endTime) {
    const slotStart = new Date(currentTime)
    const slotEnd = new Date(currentTime.getTime() + slotDuration * 60000)
    
    // Check if slot is booked
    const isBooked = appointments?.some(apt => {
      const aptStart = new Date(apt.start_time)
      const aptEnd = new Date(aptStart.getTime() + apt.duration_minutes * 60000)
      return slotStart < aptEnd && slotEnd > aptStart
    }) || false
    
    const bookedAppointment = appointments?.find(apt => {
      const aptStart = new Date(apt.start_time)
      return aptStart.getTime() === slotStart.getTime()
    })
    
    slots.push({
      start_time: slotStart.toISOString(),
      end_time: slotEnd.toISOString(),
      is_booked: isBooked,
      appointment_id: bookedAppointment?.id
    })
    
    currentTime = slotEnd
  }
  
  return slots
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
 * Create payment record
 */
export async function createPayment(params: {
  patientId: string
  doctorId: string
  amount: number
  paymentMethod: 'cash' | 'card' | 'insurance' | 'other'
  appointmentId?: string
  clinicalNoteId?: string
  notes?: string
}): Promise<Payment> {
  const supabase = await createClient()
  
  const user = await supabase.auth.getUser()
  
  const { data, error } = await supabase
    .from('payments')
    .insert({
      patient_id: params.patientId,
      doctor_id: params.doctorId,
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
 * Get today's payments
 */
export async function getTodayPayments(): Promise<Payment[]> {
  const supabase = await createClient()
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .gte('created_at', today.toISOString())
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
