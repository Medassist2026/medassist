/**
 * local-db.ts — SQLite Local Database Layer
 *
 * Mirrors critical Supabase tables locally using @capacitor-community/sqlite.
 * Provides CRUD operations for offline clinic operations.
 *
 * Tables stored locally:
 * - patients, appointments, check_in_queue, clinical_notes
 * - doctor_availability, payments, doctors, clinics, users
 * - patient_medications
 * - _sync_queue (internal — tracks pending writes)
 * - _sync_meta (internal — tracks last sync timestamps)
 */

import { Capacitor } from '@capacitor/core'
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LocalPatient {
  id: string
  phone: string
  full_name: string | null
  age: number | null
  sex: string | null
  email: string | null
  clinic_id: string | null
  created_by_doctor_id: string | null
  patient_code: string | null
  national_id_last4: string | null
  account_status: string | null
  registered: boolean | null
  is_dependent: boolean | null
  parent_phone: string | null
  created_at: string | null
  last_activity_at: string | null
  unique_id: string
  _synced: number // 0 = local only, 1 = synced with cloud
  _modified_at: string // local modification timestamp
}

export interface LocalAppointment {
  id: string
  doctor_id: string
  patient_id: string | null
  clinic_id: string | null
  start_time: string
  duration_minutes: number | null
  appointment_type: string | null
  status: string | null
  notes: string | null
  created_by_role: string
  checked_in_at: string | null
  checked_in_by: string | null
  created_at: string | null
  _synced: number
  _modified_at: string
}

export interface LocalCheckInQueue {
  id: string
  patient_id: string
  doctor_id: string
  appointment_id: string | null
  queue_number: number
  queue_type: string | null
  status: string | null
  checked_in_at: string | null
  called_at: string | null
  completed_at: string | null
  created_at: string | null
  _synced: number
  _modified_at: string
}

export interface LocalClinicalNote {
  id: string
  doctor_id: string
  patient_id: string
  appointment_id: string | null
  clinic_id: string | null
  chief_complaint: string // JSON array stored as text
  diagnosis: string // JSON stored as text
  medications: string // JSON stored as text
  plan: string
  prescription_number: string | null
  prescription_date: string | null
  prescription_printed_at: string | null
  doctor_license_number: string | null
  duration_seconds: number | null
  keystroke_count: number | null
  template_id: string | null
  synced_to_patient: boolean | null
  created_at: string | null
  modified_at: string | null
  _synced: number
  _modified_at: string
}

export interface LocalDoctorAvailability {
  id: string
  doctor_id: string
  day_of_week: number
  start_time: string
  end_time: string
  slot_duration_minutes: number | null
  is_active: boolean | null
  created_at: string | null
  _synced: number
  _modified_at: string
}

export interface LocalPayment {
  id: string
  patient_id: string
  doctor_id: string
  appointment_id: string | null
  clinical_note_id: string | null
  amount: number
  payment_method: string
  payment_status: string | null
  collected_by: string | null
  notes: string | null
  created_at: string | null
  _synced: number
  _modified_at: string
}

export interface LocalDoctor {
  id: string
  full_name: string | null
  specialty: string
  unique_id: string
  default_template_id: string | null
  created_at: string | null
  _synced: number
  _modified_at: string
}

export interface LocalClinic {
  id: string
  name: string
  unique_id: string
  default_visibility: string | null
  created_at: string | null
  _synced: number
  _modified_at: string
}

export interface LocalUser {
  id: string
  phone: string
  email: string | null
  role: string
  created_at: string | null
  _synced: number
  _modified_at: string
}

export interface LocalPatientMedication {
  id: string
  patient_id: string
  medication_name: string
  dosage: string
  frequency: string
  route: string | null
  start_date: string
  end_date: string | null
  is_active: boolean | null
  prescriber_name: string | null
  purpose: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
  _synced: number
  _modified_at: string
}

export interface SyncMeta {
  table_name: string
  last_synced_at: string
  last_cloud_sync_at: string | null
  last_lan_sync_at: string | null
  record_count: number
}

// ─── Database Schema ─────────────────────────────────────────────────────────

const DB_NAME = 'medassist_offline'
const DB_VERSION = 1

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  full_name TEXT,
  age INTEGER,
  sex TEXT,
  email TEXT,
  clinic_id TEXT,
  created_by_doctor_id TEXT,
  patient_code TEXT,
  national_id_last4 TEXT,
  account_status TEXT DEFAULT 'active',
  registered INTEGER DEFAULT 0,
  is_dependent INTEGER DEFAULT 0,
  parent_phone TEXT,
  created_at TEXT,
  last_activity_at TEXT,
  unique_id TEXT NOT NULL,
  _synced INTEGER DEFAULT 0,
  _modified_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_clinic ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_doctor ON patients(created_by_doctor_id);
CREATE INDEX IF NOT EXISTS idx_patients_synced ON patients(_synced);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  doctor_id TEXT NOT NULL,
  patient_id TEXT,
  clinic_id TEXT,
  start_time TEXT NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  appointment_type TEXT,
  status TEXT DEFAULT 'scheduled',
  notes TEXT,
  created_by_role TEXT NOT NULL,
  checked_in_at TEXT,
  checked_in_by TEXT,
  created_at TEXT,
  _synced INTEGER DEFAULT 0,
  _modified_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_synced ON appointments(_synced);

CREATE TABLE IF NOT EXISTS check_in_queue (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  doctor_id TEXT NOT NULL,
  appointment_id TEXT,
  queue_number INTEGER NOT NULL,
  queue_type TEXT DEFAULT 'walk_in',
  status TEXT DEFAULT 'waiting',
  checked_in_at TEXT,
  called_at TEXT,
  completed_at TEXT,
  created_at TEXT,
  _synced INTEGER DEFAULT 0,
  _modified_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_doctor ON check_in_queue(doctor_id);
CREATE INDEX IF NOT EXISTS idx_queue_status ON check_in_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_synced ON check_in_queue(_synced);

CREATE TABLE IF NOT EXISTS clinical_notes (
  id TEXT PRIMARY KEY,
  doctor_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  appointment_id TEXT,
  clinic_id TEXT,
  chief_complaint TEXT DEFAULT '[]',
  diagnosis TEXT DEFAULT '{}',
  medications TEXT DEFAULT '[]',
  plan TEXT DEFAULT '',
  prescription_number TEXT,
  prescription_date TEXT,
  prescription_printed_at TEXT,
  doctor_license_number TEXT,
  duration_seconds INTEGER,
  keystroke_count INTEGER,
  template_id TEXT,
  synced_to_patient INTEGER DEFAULT 0,
  created_at TEXT,
  modified_at TEXT,
  _synced INTEGER DEFAULT 0,
  _modified_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_doctor ON clinical_notes(doctor_id);
CREATE INDEX IF NOT EXISTS idx_notes_patient ON clinical_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_notes_synced ON clinical_notes(_synced);

CREATE TABLE IF NOT EXISTS doctor_availability (
  id TEXT PRIMARY KEY,
  doctor_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  slot_duration_minutes INTEGER DEFAULT 30,
  is_active INTEGER DEFAULT 1,
  created_at TEXT,
  _synced INTEGER DEFAULT 0,
  _modified_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_avail_doctor ON doctor_availability(doctor_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  doctor_id TEXT NOT NULL,
  appointment_id TEXT,
  clinical_note_id TEXT,
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT DEFAULT 'completed',
  collected_by TEXT,
  notes TEXT,
  created_at TEXT,
  _synced INTEGER DEFAULT 0,
  _modified_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_doctor ON payments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient ON payments(patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_synced ON payments(_synced);

CREATE TABLE IF NOT EXISTS doctors (
  id TEXT PRIMARY KEY,
  full_name TEXT,
  specialty TEXT NOT NULL,
  unique_id TEXT NOT NULL,
  default_template_id TEXT,
  created_at TEXT,
  _synced INTEGER DEFAULT 0,
  _modified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clinics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unique_id TEXT NOT NULL,
  default_visibility TEXT DEFAULT 'doctor_scoped',
  created_at TEXT,
  _synced INTEGER DEFAULT 0,
  _modified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL,
  created_at TEXT,
  _synced INTEGER DEFAULT 0,
  _modified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patient_medications (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  medication_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  route TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_active INTEGER DEFAULT 1,
  prescriber_name TEXT,
  purpose TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT,
  _synced INTEGER DEFAULT 0,
  _modified_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meds_patient ON patient_medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_meds_active ON patient_medications(is_active);

CREATE TABLE IF NOT EXISTS _sync_meta (
  table_name TEXT PRIMARY KEY,
  last_synced_at TEXT NOT NULL,
  last_cloud_sync_at TEXT,
  last_lan_sync_at TEXT,
  record_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS _sync_queue (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  retries INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  error_message TEXT,
  created_at TEXT NOT NULL,
  attempted_at TEXT,
  synced_at TEXT,
  source TEXT DEFAULT 'local'
);

CREATE INDEX IF NOT EXISTS idx_sync_status ON _sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_table ON _sync_queue(table_name);
CREATE INDEX IF NOT EXISTS idx_sync_created ON _sync_queue(created_at);
`

// ─── Database Connection ─────────────────────────────────────────────────────

let sqlite: SQLiteConnection | null = null
let db: SQLiteDBConnection | null = null

function now(): string {
  return new Date().toISOString()
}

function generateId(): string {
  // UUID v4 compatible
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Check if we're running on a native platform (Capacitor)
 * Falls back to in-memory for web/SSR
 */
function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/**
 * Initialize the local SQLite database.
 * Call once on app startup (before morning sync).
 */
export async function initLocalDB(): Promise<void> {
  if (db) return // Already initialized

  if (!isNativePlatform()) {
    console.warn('[LocalDB] Not on native platform — using web fallback (IndexedDB via sql.js)')
    await initWebFallback()
    return
  }

  sqlite = new SQLiteConnection(CapacitorSQLite)

  // Check connection consistency
  const retCC = await sqlite.checkConnectionsConsistency()
  const isConn = (await sqlite.isConnection(DB_NAME, false)).result

  if (retCC.result && isConn) {
    db = await sqlite.retrieveConnection(DB_NAME, false)
  } else {
    db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false)
  }

  await db.open()
  await db.execute(SCHEMA_SQL)

  console.log('[LocalDB] Database initialized successfully')
}

/**
 * Web fallback using sql.js (for PWA / desktop browser usage)
 * This stores data in IndexedDB via sql.js WASM
 */
async function initWebFallback(): Promise<void> {
  // Web fallback: IndexedDB-based cache for API responses + pending writes queue.
  // Dynamic import avoids bundling for native builds.
  try {
    const { cacheGet, cacheSet } = await import('./idb-cache')
    await cacheSet('__idb_healthcheck', { ok: true }, 60000)
    const check = await cacheGet('__idb_healthcheck')
    if (check) {
      console.log('[LocalDB] Web fallback mode — IndexedDB cache active')
    } else {
      console.warn('[LocalDB] Web fallback mode — IndexedDB check failed, limited offline support')
    }
  } catch (err) {
    console.warn('[LocalDB] Web fallback init failed:', err)
  }
}

/**
 * Get the database connection. Throws if not initialized.
 */
function getDB(): SQLiteDBConnection {
  if (!db) {
    throw new Error('[LocalDB] Database not initialized. Call initLocalDB() first.')
  }
  return db
}

/**
 * Close the database connection gracefully.
 */
export async function closeLocalDB(): Promise<void> {
  if (db) {
    await db.close()
    db = null
  }
  if (sqlite) {
    await sqlite.closeConnection(DB_NAME, false)
    sqlite = null
  }
}

// ─── Generic CRUD Operations ─────────────────────────────────────────────────

/**
 * Update specific fields on a record by ID.
 */
export async function updateFields(
  table: string,
  id: string,
  fields: Record<string, unknown>
): Promise<void> {
  const conn = getDB()
  const keys = Object.keys(fields)
  if (keys.length === 0) return

  const setClauses = keys.map((k) => `${k} = ?`).join(', ')
  const values = keys.map((k) => {
    const v = fields[k]
    if (v === null || v === undefined) return null
    if (typeof v === 'boolean') return v ? 1 : 0
    if (typeof v === 'object') return JSON.stringify(v)
    return v
  })
  values.push(id)

  await conn.run(`UPDATE ${table} SET ${setClauses} WHERE id = ?`, values)
}

/**
 * Insert or replace a record in any table.
 * Uses INSERT OR REPLACE (upsert by primary key).
 */
export async function upsertRecord<T extends Record<string, unknown>>(
  table: string,
  record: T
): Promise<void> {
  const conn = getDB()
  const keys = Object.keys(record)
  const placeholders = keys.map(() => '?').join(', ')
  const values = keys.map((k) => {
    const v = record[k]
    if (v === null || v === undefined) return null
    if (typeof v === 'boolean') return v ? 1 : 0
    if (typeof v === 'object') return JSON.stringify(v)
    return v
  })

  const sql = `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`
  await conn.run(sql, values)
}

/**
 * Bulk upsert records (batched for performance).
 */
export async function bulkUpsert<T extends Record<string, unknown>>(
  table: string,
  records: T[]
): Promise<void> {
  if (records.length === 0) return

  const conn = getDB()
  const BATCH_SIZE = 50

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    const statements = batch.map((record) => {
      const keys = Object.keys(record)
      const placeholders = keys.map(() => '?').join(', ')
      const values = keys.map((k) => {
        const v = record[k]
        if (v === null || v === undefined) return null
        if (typeof v === 'boolean') return v ? 1 : 0
        if (typeof v === 'object') return JSON.stringify(v)
        return v
      })
      return {
        statement: `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
        values,
      }
    })

    await conn.executeSet(statements)
  }
}

/**
 * Query records from a table with optional WHERE clause.
 */
export async function queryRecords<T>(
  table: string,
  where?: string,
  params?: unknown[]
): Promise<T[]> {
  const conn = getDB()
  const sql = where
    ? `SELECT * FROM ${table} WHERE ${where}`
    : `SELECT * FROM ${table}`
  const result = await conn.query(sql, params || [])
  return (result.values || []) as T[]
}

/**
 * Get a single record by ID.
 */
export async function getRecord<T>(table: string, id: string): Promise<T | null> {
  const results = await queryRecords<T>(table, 'id = ?', [id])
  return results.length > 0 ? results[0] : null
}

/**
 * Delete a record by ID.
 */
export async function deleteRecord(table: string, id: string): Promise<void> {
  const conn = getDB()
  await conn.run(`DELETE FROM ${table} WHERE id = ?`, [id])
}

/**
 * Count records in a table with optional WHERE.
 */
export async function countRecords(table: string, where?: string, params?: unknown[]): Promise<number> {
  const conn = getDB()
  const sql = where
    ? `SELECT COUNT(*) as count FROM ${table} WHERE ${where}`
    : `SELECT COUNT(*) as count FROM ${table}`
  const result = await conn.query(sql, params || [])
  return result.values?.[0]?.count || 0
}

/**
 * Get all unsynced records from a table.
 */
export async function getUnsyncedRecords<T>(table: string): Promise<T[]> {
  return queryRecords<T>(table, '_synced = 0')
}

/**
 * Mark a record as synced.
 */
export async function markRecordSynced(table: string, id: string): Promise<void> {
  const conn = getDB()
  await conn.run(
    `UPDATE ${table} SET _synced = 1, _modified_at = ? WHERE id = ?`,
    [now(), id]
  )
}

/**
 * Mark multiple records as synced.
 */
export async function markRecordsSynced(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const conn = getDB()
  const placeholders = ids.map(() => '?').join(', ')
  await conn.run(
    `UPDATE ${table} SET _synced = 1, _modified_at = ? WHERE id IN (${placeholders})`,
    [now(), ...ids]
  )
}

// ─── Table-Specific Operations ───────────────────────────────────────────────

// --- Patients ---

export async function getPatientsByClinic(clinicId: string): Promise<LocalPatient[]> {
  return queryRecords<LocalPatient>('patients', 'clinic_id = ?', [clinicId])
}

export async function searchPatients(query: string, clinicId?: string): Promise<LocalPatient[]> {
  const conn = getDB()
  const likeTerm = `%${query}%`
  let sql = `SELECT * FROM patients WHERE (phone LIKE ? OR full_name LIKE ? OR patient_code LIKE ?)`
  const params: unknown[] = [likeTerm, likeTerm, likeTerm]

  if (clinicId) {
    sql += ` AND clinic_id = ?`
    params.push(clinicId)
  }

  sql += ` ORDER BY last_activity_at DESC LIMIT 20`
  const result = await conn.query(sql, params)
  return (result.values || []) as LocalPatient[]
}

export async function savePatient(patient: Partial<LocalPatient> & { phone: string }): Promise<string> {
  const id = patient.id || generateId()
  await upsertRecord('patients', {
    ...patient,
    id,
    unique_id: patient.unique_id || id,
    _synced: patient._synced ?? 0,
    _modified_at: now(),
  })
  return id
}

// --- Appointments ---

export async function getTodayAppointments(doctorId: string): Promise<LocalAppointment[]> {
  const today = new Date().toISOString().split('T')[0]
  return queryRecords<LocalAppointment>(
    'appointments',
    `doctor_id = ? AND date(start_time) = ? ORDER BY start_time ASC`,
    [doctorId, today]
  )
}

export async function getAppointmentsByDate(
  doctorId: string,
  date: string
): Promise<LocalAppointment[]> {
  return queryRecords<LocalAppointment>(
    'appointments',
    `doctor_id = ? AND date(start_time) = ? ORDER BY start_time ASC`,
    [doctorId, date]
  )
}

export async function saveAppointment(
  appt: Partial<LocalAppointment> & { doctor_id: string; start_time: string; created_by_role: string }
): Promise<string> {
  const id = appt.id || generateId()
  await upsertRecord('appointments', {
    ...appt,
    id,
    status: appt.status || 'scheduled',
    _synced: appt._synced ?? 0,
    _modified_at: now(),
  })
  return id
}

export async function updateAppointmentStatus(
  id: string,
  status: string,
  checkedInBy?: string
): Promise<void> {
  const conn = getDB()
  const updates: string[] = ['status = ?', '_synced = 0', '_modified_at = ?']
  const params: unknown[] = [status, now()]

  if (status === 'checked_in') {
    updates.push('checked_in_at = ?')
    params.push(now())
    if (checkedInBy) {
      updates.push('checked_in_by = ?')
      params.push(checkedInBy)
    }
  }

  params.push(id)
  await conn.run(`UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`, params)
}

// --- Check-In Queue ---

export async function getTodayQueue(doctorId: string): Promise<LocalCheckInQueue[]> {
  const today = new Date().toISOString().split('T')[0]
  return queryRecords<LocalCheckInQueue>(
    'check_in_queue',
    `doctor_id = ? AND date(checked_in_at) = ? AND status != 'completed' ORDER BY queue_number ASC`,
    [doctorId, today]
  )
}

export async function getNextQueueNumber(doctorId: string): Promise<number> {
  const conn = getDB()
  const today = new Date().toISOString().split('T')[0]
  const result = await conn.query(
    `SELECT MAX(queue_number) as max_num FROM check_in_queue WHERE doctor_id = ? AND date(checked_in_at) = ?`,
    [doctorId, today]
  )
  return (result.values?.[0]?.max_num || 0) + 1
}

export async function addToQueue(
  entry: Partial<LocalCheckInQueue> & { patient_id: string; doctor_id: string }
): Promise<string> {
  const id = entry.id || generateId()
  const queueNumber = entry.queue_number || await getNextQueueNumber(entry.doctor_id)
  await upsertRecord('check_in_queue', {
    ...entry,
    id,
    queue_number: queueNumber,
    status: entry.status || 'waiting',
    checked_in_at: entry.checked_in_at || now(),
    _synced: entry._synced ?? 0,
    _modified_at: now(),
  })
  return id
}

export async function updateQueueStatus(id: string, status: string): Promise<void> {
  const conn = getDB()
  const updates: string[] = ['status = ?', '_synced = 0', '_modified_at = ?']
  const params: unknown[] = [status, now()]

  if (status === 'called') {
    updates.push('called_at = ?')
    params.push(now())
  } else if (status === 'completed') {
    updates.push('completed_at = ?')
    params.push(now())
  }

  params.push(id)
  await conn.run(`UPDATE check_in_queue SET ${updates.join(', ')} WHERE id = ?`, params)
}

// --- Clinical Notes ---

export async function getPatientNotes(patientId: string): Promise<LocalClinicalNote[]> {
  return queryRecords<LocalClinicalNote>(
    'clinical_notes',
    `patient_id = ? ORDER BY created_at DESC`,
    [patientId]
  )
}

export async function saveClinicalNote(
  note: Partial<LocalClinicalNote> & { doctor_id: string; patient_id: string }
): Promise<string> {
  const id = note.id || generateId()
  await upsertRecord('clinical_notes', {
    ...note,
    id,
    chief_complaint: typeof note.chief_complaint === 'string'
      ? note.chief_complaint
      : JSON.stringify(note.chief_complaint || []),
    diagnosis: typeof note.diagnosis === 'string'
      ? note.diagnosis
      : JSON.stringify(note.diagnosis || {}),
    medications: typeof note.medications === 'string'
      ? note.medications
      : JSON.stringify(note.medications || []),
    plan: note.plan || '',
    created_at: note.created_at || now(),
    _synced: note._synced ?? 0,
    _modified_at: now(),
  })
  return id
}

// --- Doctor Availability ---

export async function getDoctorAvailability(doctorId: string): Promise<LocalDoctorAvailability[]> {
  return queryRecords<LocalDoctorAvailability>(
    'doctor_availability',
    `doctor_id = ? AND is_active = 1 ORDER BY day_of_week ASC, start_time ASC`,
    [doctorId]
  )
}

export async function getDoctorAvailabilityForDay(
  doctorId: string,
  dayOfWeek: number
): Promise<LocalDoctorAvailability[]> {
  return queryRecords<LocalDoctorAvailability>(
    'doctor_availability',
    `doctor_id = ? AND day_of_week = ? AND is_active = 1`,
    [doctorId, dayOfWeek]
  )
}

// --- Payments ---

export async function savePayment(
  payment: Partial<LocalPayment> & {
    patient_id: string
    doctor_id: string
    amount: number
    payment_method: string
  }
): Promise<string> {
  const id = payment.id || generateId()
  await upsertRecord('payments', {
    ...payment,
    id,
    payment_status: payment.payment_status || 'completed',
    created_at: payment.created_at || now(),
    _synced: payment._synced ?? 0,
    _modified_at: now(),
  })
  return id
}

export async function getTodayPayments(doctorId: string): Promise<LocalPayment[]> {
  const today = new Date().toISOString().split('T')[0]
  return queryRecords<LocalPayment>(
    'payments',
    `doctor_id = ? AND date(created_at) = ?`,
    [doctorId, today]
  )
}

// --- Doctors & Clinics (reference data) ---

export async function saveDoctor(doctor: Partial<LocalDoctor> & { id: string; specialty: string; unique_id: string }): Promise<void> {
  await upsertRecord('doctors', {
    ...doctor,
    _synced: 1,
    _modified_at: now(),
  })
}

export async function saveClinic(clinic: Partial<LocalClinic> & { id: string; name: string; unique_id: string }): Promise<void> {
  await upsertRecord('clinics', {
    ...clinic,
    _synced: 1,
    _modified_at: now(),
  })
}

export async function getClinicDoctors(clinicId?: string): Promise<LocalDoctor[]> {
  if (clinicId) {
    // In a full impl, this would JOIN with a clinic_doctors table
    // For now, return all doctors (single-clinic assumption)
    return queryRecords<LocalDoctor>('doctors')
  }
  return queryRecords<LocalDoctor>('doctors')
}

// ─── Sync Metadata ───────────────────────────────────────────────────────────

export async function getSyncMeta(tableName: string): Promise<SyncMeta | null> {
  return getRecord<SyncMeta>('_sync_meta', tableName)
}

export async function updateSyncMeta(
  tableName: string,
  source: 'cloud' | 'lan'
): Promise<void> {
  const timestamp = now()
  const count = await countRecords(tableName)
  const existing = await getSyncMeta(tableName)

  await upsertRecord('_sync_meta', {
    table_name: tableName,
    last_synced_at: timestamp,
    last_cloud_sync_at: source === 'cloud' ? timestamp : (existing?.last_cloud_sync_at || null),
    last_lan_sync_at: source === 'lan' ? timestamp : (existing?.last_lan_sync_at || null),
    record_count: count,
  })
}

export async function getAllSyncMeta(): Promise<SyncMeta[]> {
  return queryRecords<SyncMeta>('_sync_meta')
}

// ─── Database Utilities ──────────────────────────────────────────────────────

/**
 * Clear all data from a specific table (used during full re-sync).
 */
export async function clearTable(table: string): Promise<void> {
  const conn = getDB()
  await conn.run(`DELETE FROM ${table}`)
}

/**
 * Clear ALL local data (factory reset).
 */
export async function clearAllData(): Promise<void> {
  const tables = [
    'patients', 'appointments', 'check_in_queue', 'clinical_notes',
    'doctor_availability', 'payments', 'doctors', 'clinics', 'users',
    'patient_medications', '_sync_meta', '_sync_queue',
  ]
  for (const table of tables) {
    await clearTable(table)
  }
  console.log('[LocalDB] All data cleared')
}

/**
 * Get database stats for diagnostics.
 */
export async function getDatabaseStats(): Promise<Record<string, number>> {
  const tables = [
    'patients', 'appointments', 'check_in_queue', 'clinical_notes',
    'doctor_availability', 'payments', 'doctors', 'clinics', 'users',
    'patient_medications', '_sync_queue',
  ]
  const stats: Record<string, number> = {}
  for (const table of tables) {
    stats[table] = await countRecords(table)
  }
  stats['_unsynced_total'] = 0
  for (const table of tables.filter((t) => !t.startsWith('_'))) {
    const unsynced = await countRecords(table, '_synced = 0')
    stats[`${table}_unsynced`] = unsynced
    stats['_unsynced_total'] += unsynced
  }
  return stats
}

export { generateId, now, DB_NAME }
