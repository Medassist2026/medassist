/**
 * morning-sync.ts — Morning Sync Protocol
 *
 * Full data prefetch on app launch to ensure the clinic can operate
 * all day even if internet drops. Downloads today's appointments,
 * queue, patient data, doctor schedules, and recent clinical notes.
 *
 * Runs once on app startup, can be triggered manually.
 * Shows progress to user via callback.
 */

import {
  bulkUpsert,
  clearTable,
  updateSyncMeta,
  saveDoctor,
  saveClinic,
  getDatabaseStats,
  now,
} from './local-db'

import { pullFromAllPeers } from './lan-sync'
import { hasLANPeers } from './lan-discovery'
import { getConnectionState } from './data-service'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MorningSyncProgress {
  phase: string         // Arabic-friendly phase name
  phaseKey: string      // Machine key
  current: number
  total: number
  message: string       // Arabic status message
}

export interface MorningSyncResult {
  success: boolean
  source: 'cloud' | 'lan' | 'cache'
  duration: number
  recordsFetched: number
  errors: string[]
  phases: Record<string, { records: number; duration: number }>
}

type ProgressCallback = (progress: MorningSyncProgress) => void

// ─── Sync Phases ─────────────────────────────────────────────────────────────

const SYNC_PHASES = [
  { key: 'clinic', label: 'بيانات العيادة', endpoint: '/api/clinic/details' },
  { key: 'doctors', label: 'بيانات الأطباء', endpoint: '/api/clinic/doctors' },
  { key: 'availability', label: 'مواعيد العمل', endpoint: '/api/doctor/availability' },
  { key: 'appointments', label: 'مواعيد اليوم', endpoint: '/api/doctor/appointments?date=today' },
  { key: 'queue', label: 'قائمة الانتظار', endpoint: '/api/frontdesk/queue/today' },
  { key: 'patients', label: 'بيانات المرضى', endpoint: '/api/patients?recent=true&limit=200' },
  { key: 'medications', label: 'الأدوية النشطة', endpoint: '/api/patients/medications?active=true' },
  { key: 'notes', label: 'الجلسات الأخيرة', endpoint: '/api/clinical/notes?days=7&limit=100' },
]

// ─── Cloud Fetch Helper ──────────────────────────────────────────────────────

async function fetchFromCloud<T>(endpoint: string): Promise<T | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    const res = await fetch(endpoint, {
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timeout)

    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ─── Morning Sync Implementation ─────────────────────────────────────────────

/**
 * Run the full morning sync.
 * Attempts cloud first, falls back to LAN peers.
 */
export async function runMorningSync(
  onProgress?: ProgressCallback
): Promise<MorningSyncResult> {
  const startTime = Date.now()
  const errors: string[] = []
  const phases: Record<string, { records: number; duration: number }> = {}
  let totalRecords = 0
  let source: 'cloud' | 'lan' | 'cache' = 'cache'

  const connectionState = getConnectionState()

  const report = (
    phaseKey: string,
    phaseLabel: string,
    current: number,
    total: number,
    message: string
  ) => {
    onProgress?.({
      phase: phaseLabel,
      phaseKey,
      current,
      total,
      message,
    })
  }

  const totalPhases = SYNC_PHASES.length

  // ─── Try Cloud Sync ──────────────────────────────────────────────────

  if (connectionState === 'online') {
    source = 'cloud'
    console.log('[Morning Sync] Starting cloud sync...')

    for (let i = 0; i < SYNC_PHASES.length; i++) {
      const phase = SYNC_PHASES[i]
      const phaseStart = Date.now()
      report(phase.key, phase.label, i + 1, totalPhases, `جاري تحميل ${phase.label}...`)

      try {
        const data = await fetchFromCloud<Record<string, unknown[]>>(phase.endpoint)

        if (data) {
          const records = extractRecords(phase.key, data)
          if (records.length > 0) {
            await storePhaseData(phase.key, records)
            totalRecords += records.length
            await updateSyncMeta(getTableName(phase.key), 'cloud')
          }
          phases[phase.key] = { records: records.length, duration: Date.now() - phaseStart }
        } else {
          errors.push(`فشل تحميل ${phase.label}`)
          phases[phase.key] = { records: 0, duration: Date.now() - phaseStart }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error'
        errors.push(`${phase.label}: ${msg}`)
        phases[phase.key] = { records: 0, duration: Date.now() - phaseStart }
      }
    }
  }

  // ─── Try LAN Sync (fallback or supplement) ───────────────────────────

  if ((connectionState !== 'online' || errors.length > 0) && hasLANPeers()) {
    if (source === 'cache') source = 'lan'
    console.log('[Morning Sync] Attempting LAN sync...')

    report('lan', 'مزامنة الشبكة المحلية', totalPhases, totalPhases + 1, 'جاري المزامنة مع الأجهزة المجاورة...')

    try {
      const lanResults = await pullFromAllPeers()
      const lanPulled = lanResults.reduce((sum, r) => sum + r.pulled, 0)
      totalRecords += lanPulled

      if (lanPulled > 0) {
        console.log(`[Morning Sync] LAN: pulled ${lanPulled} records from peers`)
      }
    } catch (err) {
      errors.push(`LAN sync: ${err instanceof Error ? err.message : 'Error'}`)
    }
  }

  // ─── Finalize ────────────────────────────────────────────────────────

  const duration = Date.now() - startTime

  report(
    'done',
    'اكتملت المزامنة',
    totalPhases + 1,
    totalPhases + 1,
    errors.length === 0
      ? `تم تحميل ${totalRecords} سجل في ${Math.round(duration / 1000)} ثانية`
      : `تم مع ${errors.length} أخطاء`
  )

  const result: MorningSyncResult = {
    success: errors.length === 0,
    source,
    duration,
    recordsFetched: totalRecords,
    errors,
    phases,
  }

  console.log(`[Morning Sync] Complete: ${totalRecords} records from ${source} in ${duration}ms`)

  return result
}

// ─── Data Extraction & Storage Helpers ───────────────────────────────────────

/**
 * Extract record arrays from API response based on phase key.
 */
function extractRecords(
  phaseKey: string,
  data: Record<string, unknown>
): Record<string, unknown>[] {
  // API responses may use different keys
  const keyMap: Record<string, string[]> = {
    clinic: ['clinic'],
    doctors: ['doctors', 'staff'],
    availability: ['availability', 'slots'],
    appointments: ['appointments'],
    queue: ['queue', 'check_in_queue'],
    patients: ['patients'],
    medications: ['medications', 'patient_medications'],
    notes: ['notes', 'clinical_notes'],
  }

  const possibleKeys = keyMap[phaseKey] || [phaseKey]
  for (const key of possibleKeys) {
    if (Array.isArray(data[key])) {
      return data[key] as Record<string, unknown>[]
    }
    // Single object (e.g. clinic details) → wrap in array
    if (data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])) {
      return [data[key] as Record<string, unknown>]
    }
  }

  // Try the data itself if it's an array
  if (Array.isArray(data)) {
    return data as Record<string, unknown>[]
  }

  return []
}

/**
 * Get SQLite table name from phase key.
 */
function getTableName(phaseKey: string): string {
  const map: Record<string, string> = {
    clinic: 'clinics',
    doctors: 'doctors',
    availability: 'doctor_availability',
    appointments: 'appointments',
    queue: 'check_in_queue',
    patients: 'patients',
    medications: 'patient_medications',
    notes: 'clinical_notes',
  }
  return map[phaseKey] || phaseKey
}

/**
 * Store fetched data in the appropriate local table.
 */
async function storePhaseData(
  phaseKey: string,
  records: Record<string, unknown>[]
): Promise<void> {
  const tableName = getTableName(phaseKey)

  // Add sync metadata to each record
  const enrichedRecords = records.map((r) => ({
    ...r,
    _synced: 1,
    _modified_at: now(),
    // Convert JSON arrays/objects to strings for SQLite
    ...(r.chief_complaint && typeof r.chief_complaint !== 'string'
      ? { chief_complaint: JSON.stringify(r.chief_complaint) }
      : {}),
    ...(r.diagnosis && typeof r.diagnosis !== 'string'
      ? { diagnosis: JSON.stringify(r.diagnosis) }
      : {}),
    ...(r.medications && typeof r.medications !== 'string'
      ? { medications: JSON.stringify(r.medications) }
      : {}),
    // Convert booleans to integers for SQLite
    ...(typeof r.is_active === 'boolean' ? { is_active: r.is_active ? 1 : 0 } : {}),
    ...(typeof r.registered === 'boolean' ? { registered: r.registered ? 1 : 0 } : {}),
    ...(typeof r.is_dependent === 'boolean' ? { is_dependent: r.is_dependent ? 1 : 0 } : {}),
    ...(typeof r.synced_to_patient === 'boolean'
      ? { synced_to_patient: r.synced_to_patient ? 1 : 0 }
      : {}),
  }))

  // Special handling for reference data: clinic + doctors get full replace
  if (phaseKey === 'clinic') {
    for (const record of enrichedRecords) {
      await saveClinic(record as Parameters<typeof saveClinic>[0])
    }
    return
  }

  if (phaseKey === 'doctors') {
    for (const record of enrichedRecords) {
      await saveDoctor(record as Parameters<typeof saveDoctor>[0])
    }
    return
  }

  // For other tables, use bulk upsert
  await bulkUpsert(tableName, enrichedRecords)
}

// ─── Manual Sync Triggers ────────────────────────────────────────────────────

/**
 * Sync just today's schedule data (lightweight).
 * Useful for quick refresh during the day.
 */
export async function syncTodaySchedule(
  onProgress?: ProgressCallback
): Promise<MorningSyncResult> {
  const startTime = Date.now()
  const errors: string[] = []
  let totalRecords = 0

  const quickPhases = SYNC_PHASES.filter((p) =>
    ['appointments', 'queue'].includes(p.key)
  )

  for (let i = 0; i < quickPhases.length; i++) {
    const phase = quickPhases[i]
    onProgress?.({
      phase: phase.label,
      phaseKey: phase.key,
      current: i + 1,
      total: quickPhases.length,
      message: `جاري تحديث ${phase.label}...`,
    })

    const data = await fetchFromCloud<Record<string, unknown[]>>(phase.endpoint)
    if (data) {
      const records = extractRecords(phase.key, data)
      if (records.length > 0) {
        await storePhaseData(phase.key, records)
        totalRecords += records.length
      }
    } else {
      errors.push(`فشل تحديث ${phase.label}`)
    }
  }

  return {
    success: errors.length === 0,
    source: getConnectionState() === 'online' ? 'cloud' : 'lan',
    duration: Date.now() - startTime,
    recordsFetched: totalRecords,
    errors,
    phases: {},
  }
}

/**
 * Check if morning sync has been run today.
 */
export function hasRunToday(): boolean {
  if (typeof localStorage === 'undefined') return false
  const lastRun = localStorage.getItem('medassist_last_morning_sync')
  if (!lastRun) return false

  const lastRunDate = new Date(lastRun).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]
  return lastRunDate === today
}

/**
 * Mark morning sync as completed for today.
 */
export function markSyncComplete(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('medassist_last_morning_sync', new Date().toISOString())
  }
}
