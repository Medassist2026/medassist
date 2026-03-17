/**
 * lan-sync.ts — LAN Peer-to-Peer Sync
 *
 * Handles HTTP-based data synchronization between clinic devices on the same WiFi.
 * Each device runs a lightweight HTTP server (via Capacitor) that exposes sync endpoints.
 *
 * Push: Send local changes to peers
 * Pull: Request data from peers
 *
 * This enables front desk ↔ doctor sync even without internet.
 */

import {
  getOnlinePeers,
  getPeerUrl,
  type PeerDevice,
} from './lan-discovery'

import {
  exportForLAN,
  importFromLAN,
  type SyncQueueEntry,
} from './sync-queue'

import {
  queryRecords,
  bulkUpsert,
  now,
  updateSyncMeta,
} from './local-db'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LANSyncRequest {
  deviceId: string
  clinicId: string
  tables: string[]
  since?: string // ISO timestamp — only send records modified after this
}

export interface LANSyncResponse {
  deviceId: string
  clinicId: string
  data: Record<string, unknown[]> // { patients: [...], appointments: [...], ... }
  queueEntries: SyncQueueEntry[]
  timestamp: string
  recordCount: number
}

export interface LANSyncResult {
  peerId: string
  peerName: string
  pushed: number
  pulled: number
  errors: string[]
  duration: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SYNC_TABLES = [
  'patients',
  'appointments',
  'check_in_queue',
  'clinical_notes',
  'doctor_availability',
  'payments',
  'patient_medications',
]

const LAN_SYNC_TIMEOUT = 10_000 // 10 seconds

// ─── Push: Send Data to Peers ────────────────────────────────────────────────

/**
 * Push local unsynced data + queue entries to a specific peer.
 */
async function pushToPeer(peer: PeerDevice): Promise<LANSyncResult> {
  const startTime = Date.now()
  const errors: string[] = []
  let pushed = 0
  let pulled = 0

  const peerUrl = getPeerUrl(peer.deviceId)
  if (!peerUrl) {
    return {
      peerId: peer.deviceId,
      peerName: peer.userName,
      pushed: 0,
      pulled: 0,
      errors: ['Peer URL not available'],
      duration: 0,
    }
  }

  try {
    // Gather local data to push
    const dataPayload: Record<string, unknown[]> = {}
    for (const table of SYNC_TABLES) {
      const unsyncedRecords = await queryRecords(table, '_synced = 0')
      if (unsyncedRecords.length > 0) {
        dataPayload[table] = unsyncedRecords
        pushed += unsyncedRecords.length
      }
    }

    // Also include queue entries
    const { entries: queueEntries } = await exportForLAN()

    const payload: LANSyncResponse = {
      deviceId: peer.deviceId, // target
      clinicId: peer.clinicId,
      data: dataPayload,
      queueEntries,
      timestamp: now(),
      recordCount: pushed + queueEntries.length,
    }

    // Send to peer
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LAN_SYNC_TIMEOUT)

    const res = await fetch(`${peerUrl}/api/lan/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      errors.push(`Peer responded with ${res.status}`)
    } else {
      // Peer responds with their data for us
      const peerResponse = (await res.json()) as LANSyncResponse
      pulled = await processPeerData(peerResponse)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    errors.push(msg)
  }

  return {
    peerId: peer.deviceId,
    peerName: peer.userName,
    pushed,
    pulled,
    errors,
    duration: Date.now() - startTime,
  }
}

/**
 * Process data received from a peer.
 */
async function processPeerData(response: LANSyncResponse): Promise<number> {
  let totalImported = 0

  // Import table data
  for (const [table, records] of Object.entries(response.data)) {
    if (!SYNC_TABLES.includes(table)) continue
    if (!Array.isArray(records) || records.length === 0) continue

    // Merge strategy: upsert with _modified_at comparison
    const toUpsert = []
    for (const record of records as Record<string, unknown>[]) {
      const existing = await queryRecords(
        table,
        'id = ?',
        [record.id as string]
      )

      if (existing.length === 0) {
        // New record — insert
        toUpsert.push({ ...record, _synced: 0, _modified_at: now() })
      } else {
        // Existing record — check if peer's version is newer
        const local = existing[0] as Record<string, unknown>
        const localModified = local._modified_at as string
        const peerModified = record._modified_at as string

        if (peerModified && localModified && peerModified > localModified) {
          toUpsert.push({ ...record, _synced: 0, _modified_at: now() })
        }
        // If local is newer, skip (local wins for same-time conflicts)
      }
    }

    if (toUpsert.length > 0) {
      await bulkUpsert(table, toUpsert)
      totalImported += toUpsert.length
      await updateSyncMeta(table, 'lan')
    }
  }

  // Import queue entries
  if (response.queueEntries?.length > 0) {
    const { imported } = await importFromLAN(response.queueEntries)
    totalImported += imported
  }

  return totalImported
}

// ─── Pull: Request Data from Peers ───────────────────────────────────────────

/**
 * Pull specific tables from a peer.
 */
async function pullFromPeer(
  peer: PeerDevice,
  tables: string[] = SYNC_TABLES,
  since?: string
): Promise<LANSyncResult> {
  const startTime = Date.now()
  const errors: string[] = []
  let pulled = 0

  const peerUrl = getPeerUrl(peer.deviceId)
  if (!peerUrl) {
    return {
      peerId: peer.deviceId,
      peerName: peer.userName,
      pushed: 0,
      pulled: 0,
      errors: ['Peer URL not available'],
      duration: 0,
    }
  }

  try {
    const request: LANSyncRequest = {
      deviceId: peer.deviceId,
      clinicId: peer.clinicId,
      tables,
      since,
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LAN_SYNC_TIMEOUT)

    const res = await fetch(`${peerUrl}/api/lan/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      errors.push(`Peer responded with ${res.status}`)
    } else {
      const peerData = (await res.json()) as LANSyncResponse
      pulled = await processPeerData(peerData)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    errors.push(msg)
  }

  return {
    peerId: peer.deviceId,
    peerName: peer.userName,
    pushed: 0,
    pulled,
    errors,
    duration: Date.now() - startTime,
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Sync with all online peers (push + pull).
 * Called periodically by the sync engine.
 */
export async function syncWithAllPeers(): Promise<LANSyncResult[]> {
  const peers = getOnlinePeers()
  if (peers.length === 0) {
    return []
  }

  console.log(`[LAN Sync] Starting sync with ${peers.length} peer(s)`)

  const results: LANSyncResult[] = []
  for (const peer of peers) {
    const result = await pushToPeer(peer)
    results.push(result)

    if (result.errors.length > 0) {
      console.warn(`[LAN Sync] Errors with ${peer.userName}:`, result.errors)
    } else {
      console.log(
        `[LAN Sync] ${peer.userName}: pushed ${result.pushed}, pulled ${result.pulled} (${result.duration}ms)`
      )
    }
  }

  return results
}

/**
 * Sync with a specific peer (targeted sync).
 */
export async function syncWithPeer(deviceId: string): Promise<LANSyncResult | null> {
  const peers = getOnlinePeers()
  const peer = peers.find((p) => p.deviceId === deviceId)
  if (!peer) return null

  return pushToPeer(peer)
}

/**
 * Pull fresh data from all peers (used during morning sync).
 */
export async function pullFromAllPeers(
  tables?: string[],
  since?: string
): Promise<LANSyncResult[]> {
  const peers = getOnlinePeers()
  const results: LANSyncResult[] = []

  for (const peer of peers) {
    const result = await pullFromPeer(peer, tables, since)
    results.push(result)
  }

  return results
}

/**
 * Handle an incoming sync request from a peer.
 * Called by the LAN HTTP server endpoint.
 */
export async function handleIncomingSyncRequest(
  incomingData: LANSyncResponse
): Promise<LANSyncResponse> {
  // Process incoming data from peer
  await processPeerData(incomingData)

  // Respond with our data
  const responseData: Record<string, unknown[]> = {}
  for (const table of SYNC_TABLES) {
    const records = await queryRecords(table, '_synced = 0')
    if (records.length > 0) {
      responseData[table] = records
    }
  }

  const { entries: queueEntries } = await exportForLAN()

  return {
    deviceId: incomingData.deviceId,
    clinicId: incomingData.clinicId,
    data: responseData,
    queueEntries,
    timestamp: now(),
    recordCount: Object.values(responseData).reduce((sum, arr) => sum + arr.length, 0),
  }
}

/**
 * Handle an incoming pull request from a peer.
 * Returns requested table data.
 */
export async function handleIncomingPullRequest(
  request: LANSyncRequest
): Promise<LANSyncResponse> {
  const responseData: Record<string, unknown[]> = {}

  for (const table of request.tables) {
    if (!SYNC_TABLES.includes(table)) continue

    let records: unknown[]
    if (request.since) {
      records = await queryRecords(table, '_modified_at > ?', [request.since])
    } else {
      records = await queryRecords(table)
    }

    if (records.length > 0) {
      responseData[table] = records
    }
  }

  const { entries: queueEntries } = await exportForLAN()

  return {
    deviceId: request.deviceId,
    clinicId: request.clinicId,
    data: responseData,
    queueEntries,
    timestamp: now(),
    recordCount: Object.values(responseData).reduce((sum, arr) => sum + arr.length, 0),
  }
}

export { SYNC_TABLES }
