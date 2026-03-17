/**
 * sync-engine.ts — 3-Layer Sync Engine
 *
 * Orchestrates data synchronization across three layers:
 * 1. Local SQLite (always available)
 * 2. LAN peers (available on clinic WiFi)
 * 3. Cloud / Supabase (available with internet)
 *
 * Sync strategy:
 * - Every 10s: Check connectivity
 * - Every 30s: LAN sync (if peers available)
 * - Every 60s: Cloud sync (if internet available)
 * - On reconnect: Full sync burst
 *
 * Priority: Clinical notes > Appointments > Queue > Payments > Patients
 */

import {
  processQueue,
  hasPendingWrites,
  getQueueStats,
  deduplicateQueue,
  type SyncQueueEntry,
  type SyncResult,
} from './sync-queue'

import {
  detectConnectionState,
  getConnectionState,
  setConnectionState,
  onConnectionChange,
  type ConnectionState,
} from './data-service' // Re-export from data-service where state lives

import {
  syncWithAllPeers,
  type LANSyncResult,
} from './lan-sync'

import {
  hasLANPeers,
  getOnlinePeers,
} from './lan-discovery'

import {
  markRecordSynced,
  getDatabaseStats,
} from './local-db'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SyncEngineConfig {
  cloudSyncIntervalMs: number
  lanSyncIntervalMs: number
  connectivityCheckMs: number
  maxBatchSize: number
  enableLAN: boolean
  enableCloud: boolean
}

export interface SyncEngineState {
  isRunning: boolean
  lastCloudSync: string | null
  lastLANSync: string | null
  connectionState: ConnectionState
  pendingWrites: number
  failedWrites: number
  lanPeerCount: number
}

export type SyncEventType =
  | 'sync_start'
  | 'sync_complete'
  | 'sync_error'
  | 'connection_change'
  | 'conflict_detected'
  | 'queue_empty'

export interface SyncEvent {
  type: SyncEventType
  timestamp: string
  details: Record<string, unknown>
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SyncEngineConfig = {
  cloudSyncIntervalMs: 60_000,    // 1 minute
  lanSyncIntervalMs: 30_000,      // 30 seconds
  connectivityCheckMs: 10_000,    // 10 seconds
  maxBatchSize: 20,
  enableLAN: true,
  enableCloud: true,
}

// ─── State ───────────────────────────────────────────────────────────────────

let config: SyncEngineConfig = { ...DEFAULT_CONFIG }
let isRunning = false
let connectivityTimer: ReturnType<typeof setInterval> | null = null
let cloudSyncTimer: ReturnType<typeof setInterval> | null = null
let lanSyncTimer: ReturnType<typeof setInterval> | null = null

let lastCloudSync: string | null = null
let lastLANSync: string | null = null

const eventListeners = new Set<(event: SyncEvent) => void>()

// ─── Event System ────────────────────────────────────────────────────────────

function emitEvent(type: SyncEventType, details: Record<string, unknown> = {}): void {
  const event: SyncEvent = {
    type,
    timestamp: new Date().toISOString(),
    details,
  }
  eventListeners.forEach((fn) => fn(event))
}

export function onSyncEvent(listener: (event: SyncEvent) => void): () => void {
  eventListeners.add(listener)
  return () => eventListeners.delete(listener)
}

// ─── Cloud Sync Processor ────────────────────────────────────────────────────

/**
 * Process a single sync queue entry against the cloud API.
 */
async function cloudProcessor(entry: SyncQueueEntry): Promise<SyncResult> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    const res = await fetch(entry.endpoint, {
      method: entry.method,
      headers: { 'Content-Type': 'application/json' },
      body: entry.method !== 'DELETE' ? entry.payload : undefined,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (res.ok) {
      // Mark the original record as synced
      await markRecordSynced(entry.table_name, entry.record_id)
      return { success: true, entryId: entry.id, statusCode: res.status }
    }

    // Handle specific error codes
    if (res.status === 409) {
      // Conflict — server has a different version
      return {
        success: false,
        entryId: entry.id,
        statusCode: 409,
        conflict: true,
        error: 'Server conflict: record was modified by another device',
      }
    }

    if (res.status === 401 || res.status === 403) {
      // Auth issue — don't retry
      return {
        success: false,
        entryId: entry.id,
        statusCode: res.status,
        error: `Authentication error: ${res.status}`,
      }
    }

    const errorText = await res.text().catch(() => 'Unknown error')
    return {
      success: false,
      entryId: entry.id,
      statusCode: res.status,
      error: `Server error ${res.status}: ${errorText.slice(0, 200)}`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error'
    return {
      success: false,
      entryId: entry.id,
      error: msg,
    }
  }
}

// ─── Sync Cycles ─────────────────────────────────────────────────────────────

/**
 * Run a cloud sync cycle.
 */
async function runCloudSync(): Promise<void> {
  if (getConnectionState() !== 'online') return
  if (!(await hasPendingWrites())) return

  emitEvent('sync_start', { layer: 'cloud' })

  try {
    // Deduplicate before processing
    await deduplicateQueue()

    const result = await processQueue(cloudProcessor, config.maxBatchSize)

    lastCloudSync = new Date().toISOString()

    emitEvent('sync_complete', {
      layer: 'cloud',
      ...result,
    })

    if (result.conflicts > 0) {
      emitEvent('conflict_detected', { count: result.conflicts })
    }

    if (result.synced > 0) {
      console.log(
        `[Sync Engine] Cloud: ${result.synced} synced, ${result.failed} failed, ${result.conflicts} conflicts`
      )
    }
  } catch (err) {
    emitEvent('sync_error', {
      layer: 'cloud',
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}

/**
 * Run a LAN sync cycle.
 */
async function runLANSync(): Promise<void> {
  if (!config.enableLAN) return
  if (!hasLANPeers()) return

  emitEvent('sync_start', { layer: 'lan' })

  try {
    const results = await syncWithAllPeers()

    lastLANSync = new Date().toISOString()

    const totalPushed = results.reduce((sum, r) => sum + r.pushed, 0)
    const totalPulled = results.reduce((sum, r) => sum + r.pulled, 0)
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0)

    emitEvent('sync_complete', {
      layer: 'lan',
      peers: results.length,
      pushed: totalPushed,
      pulled: totalPulled,
      errors: totalErrors,
    })

    if (totalPushed > 0 || totalPulled > 0) {
      console.log(
        `[Sync Engine] LAN: ${totalPushed} pushed, ${totalPulled} pulled across ${results.length} peers`
      )
    }
  } catch (err) {
    emitEvent('sync_error', {
      layer: 'lan',
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}

/**
 * Check connectivity and update state.
 */
async function runConnectivityCheck(): Promise<void> {
  const prevState = getConnectionState()
  const newState = await detectConnectionState()

  // Also check LAN peers
  if (newState === 'offline' && hasLANPeers()) {
    setConnectionState('lan-only')
    if (prevState !== 'lan-only') {
      emitEvent('connection_change', { from: prevState, to: 'lan-only' })
    }
    return
  }

  if (prevState !== newState) {
    emitEvent('connection_change', { from: prevState, to: newState })

    // If we just came online, trigger immediate sync
    if (newState === 'online' && prevState !== 'online') {
      console.log('[Sync Engine] Back online — triggering sync burst')
      setTimeout(runCloudSync, 1000)
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Start the sync engine.
 */
export function startSyncEngine(customConfig?: Partial<SyncEngineConfig>): void {
  if (isRunning) return

  config = { ...DEFAULT_CONFIG, ...customConfig }
  isRunning = true

  console.log('[Sync Engine] Starting with config:', {
    cloud: config.enableCloud ? `${config.cloudSyncIntervalMs}ms` : 'disabled',
    lan: config.enableLAN ? `${config.lanSyncIntervalMs}ms` : 'disabled',
  })

  // Listen for connection changes
  onConnectionChange((state) => {
    console.log(`[Sync Engine] Connection state: ${state}`)
  })

  // Start timers
  connectivityTimer = setInterval(runConnectivityCheck, config.connectivityCheckMs)

  if (config.enableCloud) {
    cloudSyncTimer = setInterval(runCloudSync, config.cloudSyncIntervalMs)
  }

  if (config.enableLAN) {
    lanSyncTimer = setInterval(runLANSync, config.lanSyncIntervalMs)
  }

  // Initial connectivity check
  runConnectivityCheck()
}

/**
 * Stop the sync engine.
 */
export function stopSyncEngine(): void {
  if (!isRunning) return

  if (connectivityTimer) {
    clearInterval(connectivityTimer)
    connectivityTimer = null
  }
  if (cloudSyncTimer) {
    clearInterval(cloudSyncTimer)
    cloudSyncTimer = null
  }
  if (lanSyncTimer) {
    clearInterval(lanSyncTimer)
    lanSyncTimer = null
  }

  isRunning = false
  console.log('[Sync Engine] Stopped')
}

/**
 * Force an immediate sync cycle (all layers).
 */
export async function forceSyncNow(): Promise<{
  cloud: boolean
  lan: LANSyncResult[]
}> {
  console.log('[Sync Engine] Force sync triggered')

  const lanResults = config.enableLAN ? await syncWithAllPeers() : []

  let cloudSuccess = false
  if (config.enableCloud && getConnectionState() === 'online') {
    await runCloudSync()
    cloudSuccess = true
  }

  return { cloud: cloudSuccess, lan: lanResults }
}

/**
 * Get the current state of the sync engine.
 */
export async function getSyncEngineState(): Promise<SyncEngineState> {
  const stats = await getQueueStats()
  return {
    isRunning,
    lastCloudSync,
    lastLANSync,
    connectionState: getConnectionState(),
    pendingWrites: stats.pending + stats.syncing,
    failedWrites: stats.failed,
    lanPeerCount: getOnlinePeers().length,
  }
}

/**
 * Get comprehensive sync diagnostics.
 */
export async function getSyncDiagnostics(): Promise<Record<string, unknown>> {
  const engineState = await getSyncEngineState()
  const queueStats = await getQueueStats()
  const dbStats = await getDatabaseStats()

  return {
    engine: engineState,
    queue: queueStats,
    database: dbStats,
    config: {
      cloudInterval: config.cloudSyncIntervalMs,
      lanInterval: config.lanSyncIntervalMs,
      enableCloud: config.enableCloud,
      enableLAN: config.enableLAN,
    },
    peers: getOnlinePeers().map((p) => ({
      name: p.userName,
      role: p.role,
      ip: p.ipAddress,
      lastSeen: p.lastSeen,
    })),
  }
}
