'use client'

import { useState, useCallback, useEffect } from 'react'

/**
 * Offline-aware mutation hook for frontdesk operations.
 *
 * Wraps a fetch call with offline queue fallback:
 * 1. If online: makes the API call directly
 * 2. If offline: queues the mutation in IndexedDB/localStorage for later sync
 * 3. Returns { offline: boolean } so UI can show appropriate feedback
 *
 * Usage:
 *   const { mutate, loading, error, isOffline } = useOfflineMutation('/api/frontdesk/checkin')
 *   const result = await mutate({ patientId, doctorId, queueType: 'walkin' })
 *   if (result?.offline) showOfflineToast()
 */

const OFFLINE_QUEUE_KEY = 'medassist_offline_queue'

interface QueuedMutation {
  id: string
  url: string
  body: any
  createdAt: string
  retries: number
  status: 'pending' | 'syncing' | 'failed'
}

// ── Offline Queue Storage (localStorage-based for simplicity) ──

function getQueue(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveQueue(queue: QueuedMutation[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // Storage full — drop oldest
    const trimmed = queue.slice(-50)
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(trimmed))
  }
}

function addToQueue(url: string, body: any): string {
  const id = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const queue = getQueue()
  queue.push({
    id,
    url,
    body,
    createdAt: new Date().toISOString(),
    retries: 0,
    status: 'pending',
  })
  saveQueue(queue)
  return id
}

function removeFromQueue(id: string): void {
  const queue = getQueue().filter(q => q.id !== id)
  saveQueue(queue)
}

// ── Sync pending mutations when back online ──

let syncInProgress = false

export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  if (syncInProgress) return { synced: 0, failed: 0 }
  syncInProgress = true

  let synced = 0
  let failed = 0

  // Process one item at a time, always re-reading from storage for consistency
  const processNext = async (): Promise<boolean> => {
    const queue = getQueue()
    const item = queue.find(q => q.status === 'pending' || q.status === 'failed')
    if (!item) return false

    try {
      // Mark as syncing
      item.status = 'syncing'
      saveQueue(queue)

      const res = await fetch(item.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
      })

      if (res.ok || res.status === 409) {
        // Success or conflict (duplicate/already processed) — remove
        removeFromQueue(item.id)
        synced++
      } else {
        // Server error — mark failed with incremented retry
        const freshQueue = getQueue()
        const freshItem = freshQueue.find(q => q.id === item.id)
        if (freshItem) {
          freshItem.status = 'failed'
          freshItem.retries = (freshItem.retries || 0) + 1
          if (freshItem.retries >= 5) {
            removeFromQueue(item.id)
            failed++
          } else {
            saveQueue(freshQueue)
          }
        }
      }
    } catch {
      // Network error — mark failed
      const freshQueue = getQueue()
      const freshItem = freshQueue.find(q => q.id === item.id)
      if (freshItem) {
        freshItem.status = 'failed'
        freshItem.retries = (freshItem.retries || 0) + 1
        saveQueue(freshQueue)
      }
      failed++
      return false // Stop processing if network is down
    }

    return true
  }

  // Process all pending items sequentially
  while (await processNext()) {
    // Continue until no more pending items or network fails
  }

  syncInProgress = false
  return { synced, failed }
}

// ── Auto-sync listener ──

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    // Small delay to let connection stabilize
    setTimeout(() => syncOfflineQueue(), 2000)
  })
}

// ── React Hook ──

interface MutationResult<T = any> {
  data?: T
  offline: boolean
  offlineId?: string
}

interface UseOfflineMutationReturn<T = any> {
  mutate: (body: any) => Promise<MutationResult<T> | null>
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

  // Track online status
  useEffect(() => {
    const checkOnline = () => {
      setIsOffline(!navigator.onLine)
      setPendingCount(getQueue().filter(q => q.status !== 'syncing').length)
    }
    checkOnline()

    window.addEventListener('online', checkOnline)
    window.addEventListener('offline', checkOnline)
    const interval = setInterval(checkOnline, 10000)

    return () => {
      window.removeEventListener('online', checkOnline)
      window.removeEventListener('offline', checkOnline)
      clearInterval(interval)
    }
  }, [])

  const mutate = useCallback(async (body: any): Promise<MutationResult<T> | null> => {
    setLoading(true)
    setError(null)

    // If clearly offline, queue immediately
    if (!navigator.onLine) {
      const offlineId = addToQueue(url, body)
      setIsOffline(true)
      setPendingCount(prev => prev + 1)
      setLoading(false)
      return { offline: true, offlineId }
    }

    // Try the API call
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)

      const res = await fetch(url, {
        method: options?.method || 'POST',
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
      // Network error — queue for offline sync
      if (err.name === 'AbortError' || !navigator.onLine) {
        const offlineId = addToQueue(url, body)
        setIsOffline(true)
        setPendingCount(prev => prev + 1)
        setLoading(false)
        return { offline: true, offlineId }
      }

      // Other error
      setError(err.message || 'حدث خطأ غير متوقع')
      setLoading(false)
      return null
    }
  }, [url, options?.method])

  return { mutate, loading, error, isOffline, pendingCount }
}

/**
 * Get current offline queue statistics
 */
export function getOfflineQueueStats(): {
  pending: number
  failed: number
  total: number
} {
  const queue = getQueue()
  return {
    pending: queue.filter(q => q.status === 'pending').length,
    failed: queue.filter(q => q.status === 'failed').length,
    total: queue.length,
  }
}
