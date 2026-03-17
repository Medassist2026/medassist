/**
 * useOfflineStatus — React hook for offline/online state
 *
 * Provides real-time connection state, sync status, and pending write count.
 * Used by ConnectionStatus component and any component that needs offline awareness.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  getConnectionState,
  onConnectionChange,
  detectConnectionState,
} from '@shared/lib/offline/data-service'
import {
  getSyncEngineState,
  onSyncEvent,
  forceSyncNow,
  type SyncEngineState,
  type SyncEvent,
} from '@shared/lib/offline/sync-engine'
import {
  getQueueStats,
  type QueueStats,
} from '@shared/lib/offline/sync-queue'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConnectionStatus = 'online' | 'lan-only' | 'offline'

export interface OfflineStatus {
  /** Current connection state */
  connection: ConnectionStatus
  /** Whether the app can reach the cloud */
  isOnline: boolean
  /** Whether LAN peers are available */
  hasLAN: boolean
  /** Whether completely offline */
  isOffline: boolean
  /** Number of pending writes waiting to sync */
  pendingWrites: number
  /** Number of permanently failed writes */
  failedWrites: number
  /** Number of LAN peers */
  peerCount: number
  /** Last successful cloud sync timestamp */
  lastCloudSync: string | null
  /** Last successful LAN sync timestamp */
  lastLANSync: string | null
  /** Whether sync is currently in progress */
  isSyncing: boolean
  /** Trigger immediate sync */
  syncNow: () => Promise<void>
  /** Arabic status message */
  statusMessage: string
}

// ─── Arabic Status Messages ──────────────────────────────────────────────────

function getArabicStatus(
  connection: ConnectionStatus,
  pendingWrites: number,
  isSyncing: boolean,
  peerCount: number
): string {
  if (isSyncing) {
    return 'جاري المزامنة...'
  }

  if (connection === 'online') {
    if (pendingWrites > 0) {
      return `متصل • ${pendingWrites} تحديث قيد المزامنة`
    }
    return 'متصل بالإنترنت'
  }

  if (connection === 'lan-only') {
    if (peerCount > 0) {
      return `شبكة محلية • ${peerCount} جهاز متصل`
    }
    return 'شبكة محلية فقط'
  }

  // Offline
  if (pendingWrites > 0) {
    return `غير متصل • ${pendingWrites} تحديث محفوظ محلياً`
  }
  return 'غير متصل — البيانات محفوظة محلياً'
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useOfflineStatus(): OfflineStatus {
  const [connection, setConnection] = useState<ConnectionStatus>('online')
  const [pendingWrites, setPendingWrites] = useState(0)
  const [failedWrites, setFailedWrites] = useState(0)
  const [peerCount, setPeerCount] = useState(0)
  const [lastCloudSync, setLastCloudSync] = useState<string | null>(null)
  const [lastLANSync, setLastLANSync] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  // Update state from sync engine
  const refreshState = useCallback(async () => {
    try {
      const state = await getSyncEngineState()
      setConnection(state.connectionState)
      setPendingWrites(state.pendingWrites)
      setFailedWrites(state.failedWrites)
      setPeerCount(state.lanPeerCount)
      setLastCloudSync(state.lastCloudSync)
      setLastLANSync(state.lastLANSync)
    } catch {
      // Sync engine may not be initialized yet
      const connState = getConnectionState()
      setConnection(connState)
    }
  }, [])

  // Subscribe to connection changes
  useEffect(() => {
    const unsubConnection = onConnectionChange((state) => {
      setConnection(state as ConnectionStatus)
    })

    const unsubSync = onSyncEvent((event: SyncEvent) => {
      if (event.type === 'sync_start') {
        setIsSyncing(true)
      }
      if (event.type === 'sync_complete' || event.type === 'sync_error') {
        setIsSyncing(false)
        refreshState()
      }
    })

    // Initial state
    refreshState()

    // Periodic refresh (every 15 seconds)
    const timer = setInterval(refreshState, 15_000)

    // Browser online/offline events
    const handleOnline = () => detectConnectionState()
    const handleOffline = () => {
      setConnection('offline')
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
    }

    return () => {
      unsubConnection()
      unsubSync()
      clearInterval(timer)
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }
  }, [refreshState])

  const syncNow = useCallback(async () => {
    setIsSyncing(true)
    try {
      await forceSyncNow()
    } finally {
      setIsSyncing(false)
      await refreshState()
    }
  }, [refreshState])

  const statusMessage = getArabicStatus(connection, pendingWrites, isSyncing, peerCount)

  return {
    connection,
    isOnline: connection === 'online',
    hasLAN: connection === 'lan-only' || peerCount > 0,
    isOffline: connection === 'offline',
    pendingWrites,
    failedWrites,
    peerCount,
    lastCloudSync,
    lastLANSync,
    isSyncing,
    syncNow,
    statusMessage,
  }
}

export default useOfflineStatus
