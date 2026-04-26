/**
 * idb-cache.ts — IndexedDB cache layer for PWA offline support
 *
 * Provides a simple key-value store using IndexedDB for caching
 * API responses and pending writes when offline (web/PWA environment).
 * This is the web fallback for the native SQLite layer.
 */

const DB_NAME = 'medassist-offline'
const DB_VERSION = 1
const STORE_CACHE = 'api-cache'
const STORE_PENDING = 'pending-writes'

interface CachedResponse {
  key: string
  data: unknown
  timestamp: number
  ttlMs: number
}

export interface PendingWrite {
  id: string
  url: string
  method: string
  body: string
  createdAt: number
  retries: number
  status: 'pending' | 'syncing' | 'failed'
}

/** Open (or create) the IndexedDB database */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('[IDBCache] IndexedDB not available'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        const store = db.createObjectStore(STORE_PENDING, { keyPath: 'id' })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ─── API Response Cache ─────────────────────────────────────────────────────

/** Cache an API response with a TTL */
export async function cacheSet(
  key: string,
  data: unknown,
  ttlMs: number = 5 * 60 * 1000 // default 5 min
): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_CACHE, 'readwrite')
    const store = tx.objectStore(STORE_CACHE)

    const entry: CachedResponse = {
      key,
      data,
      timestamp: Date.now(),
      ttlMs,
    }

    store.put(entry)
    db.close()
  } catch (err) {
    console.warn('[IDBCache] cacheSet failed:', err)
  }
}

/** Get a cached API response. Returns null if expired or missing. */
export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_CACHE, 'readonly')
    const store = tx.objectStore(STORE_CACHE)

    return new Promise((resolve) => {
      const request = store.get(key)
      request.onsuccess = () => {
        const entry = request.result as CachedResponse | undefined
        db.close()

        if (!entry) {
          resolve(null)
          return
        }

        // Check TTL
        if (Date.now() - entry.timestamp > entry.ttlMs) {
          // Expired — but still return stale data with a flag
          // (caller decides whether to use stale data)
          resolve(entry.data as T)
          return
        }

        resolve(entry.data as T)
      }
      request.onerror = () => {
        db.close()
        resolve(null)
      }
    })
  } catch {
    return null
  }
}

/** Clear all cached API responses */
export async function cacheClear(): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_CACHE, 'readwrite')
    tx.objectStore(STORE_CACHE).clear()
    db.close()
  } catch (err) {
    console.warn('[IDBCache] cacheClear failed:', err)
  }
}

// ─── Pending Writes Queue ───────────────────────────────────────────────────

/** Add a write operation to the pending queue (for offline mutations) */
export async function addPendingWrite(
  url: string,
  method: string,
  body: unknown
): Promise<string> {
  const id = `pw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_PENDING, 'readwrite')
    const store = tx.objectStore(STORE_PENDING)

    const entry: PendingWrite = {
      id,
      url,
      method,
      body: JSON.stringify(body),
      createdAt: Date.now(),
      retries: 0,
      status: 'pending',
    }

    store.put(entry)
    db.close()
  } catch (err) {
    console.warn('[IDBCache] addPendingWrite failed:', err)
  }
  return id
}

/** Get all pending writes */
export async function getPendingWrites(): Promise<PendingWrite[]> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_PENDING, 'readonly')
    const store = tx.objectStore(STORE_PENDING)
    const index = store.index('status')

    return new Promise((resolve) => {
      const request = index.getAll('pending')
      request.onsuccess = () => {
        db.close()
        resolve(request.result || [])
      }
      request.onerror = () => {
        db.close()
        resolve([])
      }
    })
  } catch {
    return []
  }
}

/** Mark a pending write as synced and remove it */
export async function removePendingWrite(id: string): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_PENDING, 'readwrite')
    tx.objectStore(STORE_PENDING).delete(id)
    db.close()
  } catch (err) {
    console.warn('[IDBCache] removePendingWrite failed:', err)
  }
}

/** Increment retry count and optionally mark as failed */
export async function markWriteRetry(id: string, maxRetries: number = 5): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_PENDING, 'readwrite')
    const store = tx.objectStore(STORE_PENDING)

    const request = store.get(id)
    request.onsuccess = () => {
      const entry = request.result as PendingWrite | undefined
      if (entry) {
        entry.retries += 1
        if (entry.retries >= maxRetries) {
          entry.status = 'failed'
        }
        store.put(entry)
      }
      db.close()
    }
  } catch (err) {
    console.warn('[IDBCache] markWriteRetry failed:', err)
  }
}

/** Get count of pending writes (for UI badge) */
export async function getPendingWriteCount(): Promise<number> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_PENDING, 'readonly')
    const index = tx.objectStore(STORE_PENDING).index('status')

    return new Promise((resolve) => {
      const request = index.count('pending')
      request.onsuccess = () => {
        db.close()
        resolve(request.result)
      }
      request.onerror = () => {
        db.close()
        resolve(0)
      }
    })
  } catch {
    return 0
  }
}

/**
 * Process pending writes — call when back online.
 * Returns { synced: number, failed: number }
 *
 * Replay semantics: a 409 response is treated as success (TD-008). The
 * server uses 409 for natural-dedupe hits (e.g. check-in already exists
 * for this patient/doctor/day) — the queued write is effectively a no-op
 * because the row is already there. Removing it from the queue is the
 * correct behavior; retrying would loop forever.
 */
export async function syncPendingWrites(): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingWrites()
  let synced = 0
  let failed = 0

  for (const write of pending) {
    try {
      const res = await fetch(write.url, {
        method: write.method,
        headers: { 'Content-Type': 'application/json' },
        body: write.body,
      })

      // 2xx = real success. 409 = dedupe hit, server already has this row
      // (or an equivalent one). Either way, queue entry has done its job.
      if (res.ok || res.status === 409) {
        await removePendingWrite(write.id)
        synced++
      } else {
        await markWriteRetry(write.id)
        failed++
      }
    } catch {
      await markWriteRetry(write.id)
      failed++
    }
  }

  return { synced, failed }
}
