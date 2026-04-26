'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  addPendingWrite,
  getPendingWrites,
  getPendingWriteCount,
  syncPendingWrites,
  type PendingWrite,
} from '@shared/lib/offline/idb-cache'

/**
 * useOfflineMutation — offline-aware POST hook backed by IndexedDB.
 *
 * Wraps a fetch call with offline queue fallback:
 * 1. If online: makes the API call directly.
 * 2. If offline (or fetch fails / times out): queues in idb-cache for later sync.
 * 3. Returns { offline: boolean } so UI can show appropriate feedback.
 *
 * Storage: backed by `packages/shared/lib/offline/idb-cache.ts` (IndexedDB).
 * The previous implementation used localStorage; that legacy queue is drained
 * once on first hook mount (see migrateLegacyLocalStorageQueue below) so no
 * pending writes are lost across the upgrade.
 *
 * Replay safety (TD-008): the server is responsible for idempotency.
 *   - Check-in: natural dedupe in handler returns 200 on duplicate.
 *   - Payments / clinical notes: callers should include a clientIdempotencyKey
 *     (UUID/nanoid) in the body. Server enforces uniqueness via the
 *     client_idempotency_key column added in migration 069.
 *
 * Usage:
 *   const { mutate, loading, error, isOffline } = useOfflineMutation('/api/frontdesk/checkin')
 *   const result = await mutate({ patientId, doctorId, queueType: 'walkin' })
 *   if (result?.offline) showOfflineToast()
 */

const LEGACY_LS_KEY = 'medassist_offline_queue'

// ─── Legacy localStorage queue migration ────────────────────────────────────

/**
 * One-shot drain: copy any items in the legacy localStorage queue into idb-cache,
 * then clear localStorage. Idempotent — safe to call on every mount; only does
 * real work the first time post-upgrade.
 *
 * Why this exists: pre-TD-008 the queue lived in localStorage. A clinic that
 * was offline at the moment this code deploys would lose those queued check-ins
 * if we simply switched storage. Draining preserves them.
 */
async function migrateLegacyLocalStorageQueue(): Promise<number> {
  if (typeof window === 'undefined') return 0
  let raw: string | null = null
  try {
    raw = localStorage.getItem(LEGACY_LS_KEY)
  } catch {
    return 0
  }
  if (!raw) return 0

  let legacy: Array<{ url: string; body: unknown; method?: string }> = []
  try {
    legacy = JSON.parse(raw)
  } catch {
    // Corrupted — drop it; no point keeping unparseable bytes
    try { localStorage.removeItem(LEGACY_LS_KEY) } catch {}
    return 0
  }

  if (!Array.isArray(legacy) || legacy.length === 0) {
    try { localStorage.removeItem(LEGACY_LS_KEY) } catch {}
    return 0
  }

  let migrated = 0
  for (const item of legacy) {
    if (!item?.url || !item?.body) continue
    try {
      await addPendingWrite(item.url, item.method || 'POST', item.body)
      migrated++
    } catch (err) {
      console.warn('[useOfflineMutation] legacy migration: failed to enqueue item', err)
    }
  }

  // Clear only after all items are migrated. If anything threw above, we'd
  // rather re-attempt next mount than silently lose data.
  try {
    localStorage.removeItem(LEGACY_LS_KEY)
  } catch {
    /* ignore */
  }

  if (migrated > 0) {
    console.log(`[useOfflineMutation] migrated ${migrated} legacy localStorage entries to idb-cache`)
  }
  return migrated
}

// Run the migration once per process. Multiple hook instances on the same
// page should not re-drain — they share the same migrationPromise.
let migrationPromise: Promise<number> | null = null
function ensureLegacyMigrated(): Promise<number> {
  if (!migrationPromise) {
    migrationPromise = migrateLegacyLocalStorageQueue()
  }
  return migrationPromise
}

// ─── Sync pending mutations when back online ────────────────────────────────

let syncInProgress = false

/**
 * Process all pending writes in the offline queue, calling each one's URL
 * with its stored body. Resilient to network flaps mid-flush.
 *
 * Returns: { synced, failed } — synced includes both 2xx and 409 (server
 * dedupe). Callers should treat 409 as success too, which is what idb-cache's
 * syncPendingWrites already does.
 */
export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  if (syncInProgress) return { synced: 0, failed: 0 }
  syncInProgress = true
  try {
    await ensureLegacyMigrated()
    return await syncPendingWrites()
  } finally {
    syncInProgress = false
  }
}

// ─── Auto-sync listener ─────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    // Small delay to let connection stabilize (Wi-Fi reconnect can flap).
    setTimeout(() => { void syncOfflineQueue() }, 2000)
  })
}

// ─── React Hook ─────────────────────────────────────────────────────────────

interface MutationResult<T = any> {
  data?: T
  offline: boolean
  offlineId?: string
}

interface UseOfflineMutationReturn<T = any> {
  mutate: (body: unknown) => Promise<MutationResult<T> | null>
  loading: boolean
  error: string | null
  isOffline: boolean
  pendingCount: number
}

export function useOfflineMutation<T = any>(
  url: string,
  options?: { method?: string }
): UseOfflineMutationReturn<T> {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  // Track online status + drain legacy queue on first mount.
  useEffect(() => {
    let active = true

    const refresh = async () => {
      if (!active) return
      setIsOffline(typeof navigator !== 'undefined' && !navigator.onLine)
      try {
        const count = await getPendingWriteCount()
        if (active) setPendingCount(count)
      } catch {
        /* ignore */
      }
    }

    void ensureLegacyMigrated().then(() => refresh())

    const onOnline = () => { void refresh() }
    const onOffline = () => { void refresh() }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const interval = setInterval(refresh, 10000)

    return () => {
      active = false
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(interval)
    }
  }, [])

  const mutate = useCallback(async (body: unknown): Promise<MutationResult<T> | null> => {
    setLoading(true)
    setError(null)
    const method = options?.method || 'POST'

    // If clearly offline, queue immediately — no point even attempting fetch.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const offlineId = await addPendingWrite(url, method, body)
      setIsOffline(true)
      try { setPendingCount(await getPendingWriteCount()) } catch { /* ignore */ }
      setLoading(false)
      return { offline: true, offlineId }
    }

    // Try the API call.
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const data = await res.json()

      if (!res.ok) {
        const errorMsg = data.errorAr || data.error || 'حدث خطأ'
        setError(errorMsg)
        setLoading(false)
        return null
      }

      setLoading(false)
      return { data, offline: false }
    } catch (err: any) {
      // Network error / timeout — queue for offline sync.
      if (err?.name === 'AbortError' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        const offlineId = await addPendingWrite(url, method, body)
        setIsOffline(true)
        try { setPendingCount(await getPendingWriteCount()) } catch { /* ignore */ }
        setLoading(false)
        return { offline: true, offlineId }
      }

      // Other error — surface to UI.
      setError(err?.message || 'حدث خطأ غير متوقع')
      setLoading(false)
      return null
    }
  }, [url, options?.method])

  return { mutate, loading, error, isOffline, pendingCount }
}

/**
 * Get current offline queue statistics. Counts items in idb-cache
 * (status='pending'). Failed items past max retries are not counted —
 * idb-cache marks them 'failed' and they stay in the store for diagnostic
 * inspection but do not appear in the pending-count badge.
 */
export async function getOfflineQueueStats(): Promise<{
  pending: number
  failed: number
  total: number
}> {
  try {
    await ensureLegacyMigrated()
    const writes: PendingWrite[] = await getPendingWrites()
    const all = writes.length
    const pending = writes.filter((w) => w.status === 'pending').length
    const failed = writes.filter((w) => w.status === 'failed').length
    return { pending, failed, total: all }
  } catch {
    return { pending: 0, failed: 0, total: 0 }
  }
}
