/**
 * data-service.ts — Offline-Aware Data Service
 *
 * Replaces direct fetch() calls throughout the app.
 * Strategy: Try network first → fallback to local SQLite → queue writes for later sync.
 *
 * Components call these functions instead of fetch('/api/...').
 * This layer transparently handles offline scenarios.
 */

import {
  // Patients
  searchPatients,
  savePatient,
  getPatientsByClinic,
  getRecord,
  // Appointments
  getTodayAppointments,
  getAppointmentsByDate,
  saveAppointment,
  updateAppointmentStatus,
  // Queue
  getTodayQueue,
  addToQueue,
  updateQueueStatus,
  // Clinical Notes
  getPatientNotes,
  saveClinicalNote,
  // Availability
  getDoctorAvailability,
  getDoctorAvailabilityForDay,
  // Payments
  savePayment,
  getTodayPayments,
  // Reference
  getClinicDoctors,
  // Types
  type LocalPatient,
  type LocalAppointment,
  type LocalCheckInQueue,
  type LocalClinicalNote,
  type LocalDoctorAvailability,
  type LocalPayment,
  type LocalDoctor,
} from './local-db'

import { enqueue } from './sync-queue'

// ─── Connection State ────────────────────────────────────────────────────────

export type ConnectionState = 'online' | 'lan-only' | 'offline'

let currentConnectionState: ConnectionState = 'online'
const connectionListeners: Set<(state: ConnectionState) => void> = new Set()

export function getConnectionState(): ConnectionState {
  return currentConnectionState
}

export function setConnectionState(state: ConnectionState): void {
  const prev = currentConnectionState
  currentConnectionState = state
  if (prev !== state) {
    connectionListeners.forEach((fn) => fn(state))
  }
}

export function onConnectionChange(listener: (state: ConnectionState) => void): () => void {
  connectionListeners.add(listener)
  return () => connectionListeners.delete(listener)
}

/**
 * Detect connection state via navigator + cloud ping.
 */
export async function detectConnectionState(): Promise<ConnectionState> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setConnectionState('offline')
    return 'offline'
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch('/api/health', {
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timeout)

    if (res.ok) {
      setConnectionState('online')
      return 'online'
    }
  } catch {
    // Cloud unreachable — could still have LAN
  }

  // TODO: Check LAN peers (implemented in lan-discovery.ts)
  // For now, treat as offline
  setConnectionState('offline')
  return 'offline'
}

// ─── Network-First Fetch Helper ──────────────────────────────────────────────

interface FetchOptions {
  timeout?: number
  skipOffline?: boolean // Force network only
}

/**
 * Try to fetch from network. Returns null if offline/failed.
 */
async function tryFetch<T>(
  url: string,
  options?: RequestInit & FetchOptions
): Promise<T | null> {
  if (currentConnectionState === 'offline' && !options?.skipOffline) {
    return null
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options?.timeout || 5000)

    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ─── Patient Operations ──────────────────────────────────────────────────────

export async function fetchPatients(clinicId: string): Promise<LocalPatient[]> {
  // Try cloud first
  const cloudData = await tryFetch<{ patients: LocalPatient[] }>(
    `/api/patients?clinicId=${clinicId}`
  )
  if (cloudData?.patients) return cloudData.patients

  // Fallback to local
  return getPatientsByClinic(clinicId)
}

export async function fetchSearchPatients(
  query: string,
  clinicId?: string
): Promise<LocalPatient[]> {
  const cloudData = await tryFetch<{ patients: LocalPatient[] }>(
    `/api/doctor/patients/search?q=${encodeURIComponent(query)}${clinicId ? `&clinicId=${clinicId}` : ''}`
  )
  if (cloudData?.patients) return cloudData.patients

  return searchPatients(query, clinicId)
}

export async function createPatient(
  data: Partial<LocalPatient> & { phone: string }
): Promise<{ id: string; offline: boolean }> {
  // Try cloud
  const cloudResult = await tryFetch<{ id: string }>('/api/patients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (cloudResult?.id) {
    // Also save locally for offline access
    await savePatient({ ...data, id: cloudResult.id, _synced: 1 })
    return { id: cloudResult.id, offline: false }
  }

  // Save locally + queue for sync
  const localId = await savePatient(data)
  await enqueue('INSERT', 'patients', localId, { ...data, id: localId })
  return { id: localId, offline: true }
}

// ─── Appointment Operations ──────────────────────────────────────────────────

export async function fetchTodayAppointments(
  doctorId: string
): Promise<LocalAppointment[]> {
  const cloudData = await tryFetch<{ appointments: LocalAppointment[] }>(
    `/api/doctor/appointments?doctorId=${doctorId}&date=today`
  )
  if (cloudData?.appointments) return cloudData.appointments

  return getTodayAppointments(doctorId)
}

export async function fetchAppointmentsByDate(
  doctorId: string,
  date: string
): Promise<LocalAppointment[]> {
  const cloudData = await tryFetch<{ appointments: LocalAppointment[] }>(
    `/api/doctor/appointments?doctorId=${doctorId}&date=${date}`
  )
  if (cloudData?.appointments) return cloudData.appointments

  return getAppointmentsByDate(doctorId, date)
}

export async function createAppointment(data: {
  doctor_id: string
  patient_id?: string
  clinic_id?: string
  start_time: string
  duration_minutes?: number
  appointment_type?: string
  notes?: string
  created_by_role: string
}): Promise<{ id: string; offline: boolean }> {
  const cloudResult = await tryFetch<{ id: string }>('/api/doctor/appointments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (cloudResult?.id) {
    await saveAppointment({ ...data, id: cloudResult.id, _synced: 1 })
    return { id: cloudResult.id, offline: false }
  }

  const localId = await saveAppointment(data)
  await enqueue('INSERT', 'appointments', localId, { ...data, id: localId })
  return { id: localId, offline: true }
}

export async function changeAppointmentStatus(
  id: string,
  status: string,
  checkedInBy?: string
): Promise<{ offline: boolean }> {
  const cloudResult = await tryFetch<{ success: boolean }>(
    `/api/doctor/appointments/${id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, checked_in_by: checkedInBy }),
    }
  )

  // Always update local
  await updateAppointmentStatus(id, status, checkedInBy)

  if (cloudResult?.success) {
    return { offline: false }
  }

  await enqueue('UPDATE', 'appointments', id, { status, checked_in_by: checkedInBy })
  return { offline: true }
}

// ─── Queue Operations ────────────────────────────────────────────────────────

export async function fetchTodayQueue(
  doctorId: string
): Promise<LocalCheckInQueue[]> {
  const cloudData = await tryFetch<{ queue: LocalCheckInQueue[] }>(
    '/api/frontdesk/queue/today'
  )
  if (cloudData?.queue) return cloudData.queue

  return getTodayQueue(doctorId)
}

export async function checkInPatient(data: {
  patient_id: string
  doctor_id: string
  appointment_id?: string
  queue_type?: string
}): Promise<{ id: string; offline: boolean }> {
  const cloudResult = await tryFetch<{ id: string }>('/api/frontdesk/queue/checkin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (cloudResult?.id) {
    await addToQueue({ ...data, id: cloudResult.id, _synced: 1 })
    return { id: cloudResult.id, offline: false }
  }

  const localId = await addToQueue(data)
  await enqueue('INSERT', 'check_in_queue', localId, { ...data, id: localId })
  return { id: localId, offline: true }
}

export async function changeQueueStatus(
  id: string,
  status: string
): Promise<{ offline: boolean }> {
  const cloudResult = await tryFetch<{ success: boolean }>(
    `/api/frontdesk/queue/${id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }
  )

  await updateQueueStatus(id, status)

  if (cloudResult?.success) {
    return { offline: false }
  }

  await enqueue('UPDATE', 'check_in_queue', id, { status })
  return { offline: true }
}

// ─── Clinical Notes ──────────────────────────────────────────────────────────

export async function fetchPatientNotes(
  patientId: string
): Promise<LocalClinicalNote[]> {
  const cloudData = await tryFetch<{ notes: LocalClinicalNote[] }>(
    `/api/clinical/notes?patientId=${patientId}`
  )
  if (cloudData?.notes) return cloudData.notes

  return getPatientNotes(patientId)
}

export async function createClinicalNote(data: {
  doctor_id: string
  patient_id: string
  appointment_id?: string
  clinic_id?: string
  chief_complaint?: string[]
  diagnosis?: Record<string, unknown>
  medications?: unknown[]
  plan?: string
  prescription_number?: string
  doctor_license_number?: string
  template_id?: string
}): Promise<{ id: string; offline: boolean }> {
  const cloudResult = await tryFetch<{ id: string }>('/api/clinical/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  // Convert arrays/objects to JSON strings for SQLite storage
  const localData = {
    ...data,
    chief_complaint: data.chief_complaint ? JSON.stringify(data.chief_complaint) : '[]',
    diagnosis: data.diagnosis ? JSON.stringify(data.diagnosis) : '{}',
    medications: data.medications ? JSON.stringify(data.medications) : '[]',
  }

  if (cloudResult?.id) {
    await saveClinicalNote({ ...localData, id: cloudResult.id, _synced: 1 })
    return { id: cloudResult.id, offline: false }
  }

  const localId = await saveClinicalNote(localData)
  await enqueue('INSERT', 'clinical_notes', localId, { ...data, id: localId })
  return { id: localId, offline: true }
}

// ─── Doctor Availability ─────────────────────────────────────────────────────

export async function fetchDoctorAvailability(
  doctorId: string
): Promise<LocalDoctorAvailability[]> {
  const cloudData = await tryFetch<{ availability: LocalDoctorAvailability[] }>(
    `/api/doctor/availability?doctorId=${doctorId}`
  )
  if (cloudData?.availability) return cloudData.availability

  return getDoctorAvailability(doctorId)
}

export async function fetchDoctorSlots(
  doctorId: string,
  dayOfWeek: number
): Promise<LocalDoctorAvailability[]> {
  return getDoctorAvailabilityForDay(doctorId, dayOfWeek)
}

// ─── Payments ────────────────────────────────────────────────────────────────

export async function createPayment(data: {
  patient_id: string
  doctor_id: string
  appointment_id?: string
  clinical_note_id?: string
  amount: number
  payment_method: string
  collected_by?: string
  notes?: string
}): Promise<{ id: string; offline: boolean }> {
  const cloudResult = await tryFetch<{ id: string }>('/api/frontdesk/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (cloudResult?.id) {
    await savePayment({ ...data, id: cloudResult.id, _synced: 1 })
    return { id: cloudResult.id, offline: false }
  }

  const localId = await savePayment(data)
  await enqueue('INSERT', 'payments', localId, { ...data, id: localId })
  return { id: localId, offline: true }
}

export async function fetchTodayPayments(
  doctorId: string
): Promise<LocalPayment[]> {
  const cloudData = await tryFetch<{ payments: LocalPayment[] }>(
    `/api/frontdesk/payments?doctorId=${doctorId}&date=today`
  )
  if (cloudData?.payments) return cloudData.payments

  return getTodayPayments(doctorId)
}

// ─── Doctors (Reference Data) ────────────────────────────────────────────────

export async function fetchClinicDoctors(
  clinicId: string
): Promise<LocalDoctor[]> {
  const cloudData = await tryFetch<{ doctors: LocalDoctor[] }>(
    `/api/clinic/doctors?clinicId=${clinicId}`
  )
  if (cloudData?.doctors) return cloudData.doctors

  return getClinicDoctors(clinicId)
}
