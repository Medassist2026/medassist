/**
 * sync-queue.ts — Offline Write Queue
 *
 * Buffers all write operations (POST/PUT/DELETE) when offline.
 * Operations are stored in SQLite _sync_queue table and processed
 * when connectivity is restored (cloud or LAN).
 *
 * Status flow: pending → syncing → synced | failed
 * Failed operations retry up to max_retries (default 5) with exponential backoff.
 *
 * Priority order: clinical_notes > appointments > check_in_queue > payments > patients > other
 */

import {
  queryRecords,
  upsertRecord,
  updateFields,
  deleteRecord,
  countRecords,
  generateId,
  now,
} from './local-db'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict'

export type SyncAction = 'INSERT' | 'UPDATE' | 'DELETE'

export interface SyncQueueEntry {
  id: string
  action: SyncAction
  table_name: string
  record_id: string
  endpoint: string
  method: string
  payload: string // JSON stringified
  status: SyncStatus
  retries: number
  max_retries: number
  error_message: string | null
  created_at: string
  attempted_at: string | null
  synced_at: string | null
  source: 'local' | 'lan' // where the write originated
}

export interface QueueStats {
  pending: number
  syncing: number
  failed: number
  synced: number
  total: number
  oldestPending: string | null
}

export interface SyncResult {
  success: boolean
  entryId: string
  error?: string
  statusCode?: number
  conflict?: boolean
}

// ─── Priority Map ────────────────────────────────────────────────────────────

const TABLE_PRIORITY: Record<string, number> = {
  clinical_notes: 1,    // Most critical — doctor's work
  appointments: 2,      // Schedule changes
  check_in_queue: 3,    // Queue management
  payments: 4,          // Financial records
  patients: 5,          // Patient data
  patient_medications: 6,
  doctor_availability: 7,
  doctors: 8,
  clinics: 9,
  users: 10,
}

// ─── Endpoint Mapping ────────────────────────────────────────────────────────

/**
 * Maps table + action to API endpoint and HTTP method.
 * This allows the sync engine to replay offline writes against the cloud API.
 */
const ENDPOINT_MAP: Record<string, { endpoint: string; method: string }> = {
  // Patients
  'patients:INSERT': { endpoint: '/api/patients', method: 'POST' },
  'patients:UPDATE': { endpoint: '/api/patients/{id}', method: 'PUT' },

  // Appointments
  'appointments:INSERT': { endpoint: '/api/doctor/appointments', method: 'POST' },
  'appointments:UPDATE': { endpoint: '/api/doctor/appointments/{id}', method: 'PUT' },
  'appointments:DELETE': { endpoint: '/api/doctor/appointments/{id}', method: 'DELETE' },

  // Check-in Queue
  'check_in_queue:INSERT': { endpoint: '/api/frontdesk/queue/checkin', method: 'POST' },
  'check_in_queue:UPDATE': { endpoint: '/api/frontdesk/queue/{id}', method: 'PUT' },

  // Clinical Notes
  'clinical_notes:INSERT': { endpoint: '/api/clinical/notes', method: 'POST' },
  'clinical_notes:UPDATE': { endpoint: '/api/clinical/notes/{id}', method: 'PUT' },

  // Payments
  'payments:INSERT': { endpoint: '/api/frontdesk/payments', method: 'POST' },
  'payments:UPDATE': { endpoint: '/api/frontdesk/payments/{id}', method: 'PUT' },

  // Patient Medications
  'patient_medications:INSERT': { endpoint: '/api/patients/{patientId}/medications', method: 'POST' },
  'patient_medications:UPDATE': { endpoint: '/api/patients/{patientId}/medications/{id}', method: 'PUT' },

  // Doctor Availability
  'doctor_availability:INSERT': { endpoint: '/api/doctor/availability', method: 'POST' },
  'doctor_availability:UPDATE': { endpoint: '/api/doctor/availability/{id}', method: 'PUT' },
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function asRecord(obj: Record<string, unknown> | Partial<SyncQueueEntry>): Record<string, unknown> {
  return obj as unknown as Record<string, unknown>
}

// ─── Queue Operations ────────────────────────────────────────────────────────

/**
 * Add a write operation to the sync queue.
 * Call this whenever a local write happens while offline.
 */
export async function enqueue(
  action: SyncAction,
  tableName: string,
  recordId: string,
  payload: Record<string, unknown>,
  source: 'local' | 'lan' = 'local'
): Promise<string> {
  const mapKey = `${tableName}:${action}`
  const mapping = ENDPOINT_MAP[mapKey]

  if (!mapping) {
    console.warn(`[SyncQueue] No endpoint mapping for ${mapKey}, using generic`)
  }

  const endpoint = mapping
    ? mapping.endpoint.replace('{id}', recordId).replace('{patientId}', String(payload.patient_id || ''))
    : `/api/sync/${tableName}`
  const method = mapping?.method || (action === 'DELETE' ? 'DELETE' : 'POST')

  const entry: SyncQueueEntry = {
    id: generateId(),
    action,
    table_name: tableName,
    record_id: recordId,
    endpoint,
    method,
    payload: JSON.stringify(payload),
    status: 'pending',
    retries: 0,
    max_retries: 5,
    error_message: null,
    created_at: now(),
    attempted_at: null,
    synced_at: null,
    source,
  }

  await upsertRecord('_sync_queue', asRecord(entry))
  console.log(`[SyncQueue] Enqueued ${action} ${tableName}/${recordId}`)
  return entry.id
}

/**
 * Get all pending entries, ordered by priority (critical tables first).
 */
export async function getPendingEntries(): Promise<SyncQueueEntry[]> {
  const entries = await queryRecords<SyncQueueEntry>(
    '_sync_queue',
    `status = 'pending' OR (status = 'failed' AND retries < max_retries) ORDER BY created_at ASC`
  )

  // Sort by table priority
  return entries.sort((a, b) => {
    const priorityA = TABLE_PRIORITY[a.table_name] || 99
    const priorityB = TABLE_PRIORITY[b.table_name] || 99
    if (priorityA !== priorityB) return priorityA - priorityB
    // Same priority → FIFO
    return a.created_at.localeCompare(b.created_at)
  })
}

/**
 * Get entries that are currently syncing (in case of crash recovery).
 */
export async function getStaleEntries(olderThanMinutes: number = 5): Promise<SyncQueueEntry[]> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString()
  return queryRecords<SyncQueueEntry>(
    '_sync_queue',
    `status = 'syncing' AND attempted_at < ?`,
    [cutoff]
  )
}

/**
 * Mark an entry as "syncing" (lock before processing).
 */
export async function markSyncing(entryId: string): Promise<void> {
  await updateFields('_sync_queue', entryId, {
    status: 'syncing',
    attempted_at: now(),
  })
}

/**
 * Mark an entry as successfully synced.
 */
export async function markSynced(entryId: string): Promise<void> {
  await updateFields('_sync_queue', entryId, {
    status: 'synced',
    synced_at: now(),
    error_message: null,
  })
}

/**
 * Mark an entry as failed, incrementing retries.
 */
export async function markFailed(entryId: string, error: string): Promise<void> {
  const entry = (await queryRecords<SyncQueueEntry>('_sync_queue', 'id = ?', [entryId]))[0]
  if (!entry) return

  const newRetries = entry.retries + 1
  const newStatus: SyncStatus = newRetries >= entry.max_retries ? 'failed' : 'pending'

  await updateFields('_sync_queue', entryId, {
    status: newStatus,
    retries: newRetries,
    error_message: error,
    attempted_at: now(),
  })

  if (newRetries >= entry.max_retries) {
    console.error(`[SyncQueue] Entry ${entryId} exhausted retries: ${error}`)
  }
}

/**
 * Mark an entry as having a conflict (needs manual resolution).
 */
export async function markConflict(entryId: string, error: string): Promise<void> {
  await updateFields('_sync_queue', entryId, {
    status: 'conflict',
    error_message: error,
    attempted_at: now(),
  })
}

/**
 * Remove successfully synced entries older than the given hours.
 */
export async function cleanupSyncedEntries(olderThanHours: number = 24): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString()
  const entries = await queryRecords<SyncQueueEntry>(
    '_sync_queue',
    `status = 'synced' AND synced_at < ?`,
    [cutoff]
  )
  for (const entry of entries) {
    await deleteRecord('_sync_queue', entry.id)
  }
  return entries.length
}

/**
 * Reset stale "syncing" entries back to "pending" (crash recovery).
 */
export async function recoverStaleEntries(): Promise<number> {
  const stale = await getStaleEntries()
  for (const entry of stale) {
    await updateFields('_sync_queue', entry.id, {
      status: 'pending',
      error_message: 'Recovered from stale syncing state',
    })
  }
  return stale.length
}

// ─── Queue Statistics ────────────────────────────────────────────────────────

/**
 * Get queue statistics for the status bar UI.
 */
export async function getQueueStats(): Promise<QueueStats> {
  const pending = await countRecords('_sync_queue', `status = 'pending'`)
  const syncing = await countRecords('_sync_queue', `status = 'syncing'`)
  const failed = await countRecords('_sync_queue', `status = 'failed' AND retries >= max_retries`)
  const synced = await countRecords('_sync_queue', `status = 'synced'`)

  // Get oldest pending entry
  const oldestPending = await queryRecords<SyncQueueEntry>(
    '_sync_queue',
    `status = 'pending' ORDER BY created_at ASC LIMIT 1`
  )

  return {
    pending,
    syncing,
    failed,
    synced,
    total: pending + syncing + failed + synced,
    oldestPending: oldestPending[0]?.created_at || null,
  }
}

/**
 * Check if there are pending writes that need syncing.
 */
export async function hasPendingWrites(): Promise<boolean> {
  const count = await countRecords(
    '_sync_queue',
    `status = 'pending' OR (status = 'failed' AND retries < max_retries)`
  )
  return count > 0
}

/**
 * Get entries by table for diagnostic purposes.
 */
export async function getEntriesByTable(): Promise<Record<string, number>> {
  const tables = Object.keys(TABLE_PRIORITY)
  const result: Record<string, number> = {}
  for (const table of tables) {
    result[table] = await countRecords(
      '_sync_queue',
      `table_name = ? AND status != 'synced'`,
      [table]
    )
  }
  return result
}

// ─── Conflict Resolution ─────────────────────────────────────────────────────

export type ConflictStrategy = 'local_wins' | 'remote_wins' | 'latest_wins' | 'manual'

/**
 * Get all entries in conflict state.
 */
export async function getConflicts(): Promise<SyncQueueEntry[]> {
  return queryRecords<SyncQueueEntry>('_sync_queue', `status = 'conflict'`)
}

/**
 * Resolve a conflict by choosing a strategy.
 * - local_wins: re-enqueue as pending (will overwrite remote)
 * - remote_wins: discard local change (delete queue entry)
 * - manual: keep in conflict state for user resolution
 */
export async function resolveConflict(
  entryId: string,
  strategy: ConflictStrategy
): Promise<void> {
  if (strategy === 'local_wins') {
    await updateFields('_sync_queue', entryId, {
      status: 'pending',
      retries: 0,
      error_message: 'Conflict resolved: local wins',
    })
  } else if (strategy === 'remote_wins') {
    await deleteRecord('_sync_queue', entryId)
  }
  // 'manual' and 'latest_wins' require external handling
}

// ─── Batch Processing ────────────────────────────────────────────────────────

/**
 * Process the sync queue — called by the sync engine.
 * Takes a processor function that handles individual entries.
 *
 * @param processor — async function that sends data to cloud/LAN and returns result
 * @param batchSize — max entries to process in one batch
 * @returns number of successfully synced entries
 */
export async function processQueue(
  processor: (entry: SyncQueueEntry) => Promise<SyncResult>,
  batchSize: number = 10
): Promise<{ synced: number; failed: number; conflicts: number }> {
  // First, recover any stale entries
  await recoverStaleEntries()

  const entries = await getPendingEntries()
  const batch = entries.slice(0, batchSize)

  let synced = 0
  let failed = 0
  let conflicts = 0

  for (const entry of batch) {
    try {
      await markSyncing(entry.id)
      const result = await processor(entry)

      if (result.success) {
        await markSynced(entry.id)
        synced++
      } else if (result.conflict) {
        await markConflict(entry.id, result.error || 'Conflict detected')
        conflicts++
      } else {
        await markFailed(entry.id, result.error || 'Unknown error')
        failed++
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Processing error'
      await markFailed(entry.id, errorMsg)
      failed++
    }
  }

  // Cleanup old synced entries
  await cleanupSyncedEntries(48)

  return { synced, failed, conflicts }
}

/**
 * Deduplicate queue entries — if multiple updates to same record,
 * keep only the latest one.
 */
export async function deduplicateQueue(): Promise<number> {
  const pending = await getPendingEntries()
  const seen = new Map<string, SyncQueueEntry>()
  const toRemove: string[] = []

  for (const entry of pending) {
    const key = `${entry.table_name}:${entry.record_id}:${entry.action}`
    const existing = seen.get(key)

    if (existing) {
      // Keep the newer one (later created_at), remove older
      if (entry.created_at > existing.created_at) {
        toRemove.push(existing.id)
        seen.set(key, entry)
      } else {
        toRemove.push(entry.id)
      }
    } else {
      seen.set(key, entry)
    }
  }

  for (const id of toRemove) {
    await deleteRecord('_sync_queue', id)
  }

  if (toRemove.length > 0) {
    console.log(`[SyncQueue] Deduplicated ${toRemove.length} entries`)
  }

  return toRemove.length
}

// ─── Export for LAN Sync ─────────────────────────────────────────────────────

/**
 * Export pending entries as a JSON payload for LAN broadcast.
 * Used by lan-sync.ts to send to peer devices.
 */
export async function exportForLAN(): Promise<{
  entries: SyncQueueEntry[]
  exportedAt: string
}> {
  const entries = await getPendingEntries()
  return {
    entries: entries.map((e) => ({ ...e, source: 'lan' as const })),
    exportedAt: now(),
  }
}

/**
 * Import entries received from a LAN peer.
 * Deduplicates against existing entries.
 */
export async function importFromLAN(
  entries: SyncQueueEntry[]
): Promise<{ imported: number; skipped: number }> {
  let imported = 0
  let skipped = 0

  for (const entry of entries) {
    // Check if we already have this exact operation
    const existing = await queryRecords<SyncQueueEntry>(
      '_sync_queue',
      `table_name = ? AND record_id = ? AND action = ? AND created_at = ?`,
      [entry.table_name, entry.record_id, entry.action, entry.created_at]
    )

    if (existing.length > 0) {
      skipped++
      continue
    }

    // Import with new local ID but preserve original data
    await upsertRecord('_sync_queue', asRecord({
      ...entry,
      id: generateId(), // New local ID
      source: 'lan',
      status: 'pending' as SyncStatus,
      retries: 0,
    }))
    imported++
  }

  console.log(`[SyncQueue] LAN import: ${imported} imported, ${skipped} skipped`)
  return { imported, skipped }
}
