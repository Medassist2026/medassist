'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * OfflineIndicator — Shows a banner when the app is offline
 * and a sync badge when there are pending writes.
 *
 * Automatically detects online/offline state and syncs pending
 * writes when connectivity is restored.
 */
export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [showRestored, setShowRestored] = useState(false)

  // Check pending write count
  const checkPending = useCallback(async () => {
    try {
      const { getPendingWriteCount } = await import('@shared/lib/offline/idb-cache')
      const count = await getPendingWriteCount()
      setPendingCount(count)
    } catch {
      // IDB not available — ignore
    }
  }, [])

  // Sync pending writes when back online
  const syncWrites = useCallback(async () => {
    if (pendingCount === 0) return
    setSyncing(true)
    try {
      const { syncPendingWrites } = await import('@shared/lib/offline/idb-cache')
      await syncPendingWrites()
      await checkPending()
    } catch {
      // Will retry on next online event
    } finally {
      setSyncing(false)
    }
  }, [pendingCount, checkPending])

  useEffect(() => {
    // Initial state
    setIsOnline(navigator.onLine)
    checkPending()

    const handleOnline = () => {
      setIsOnline(true)
      setShowRestored(true)
      setTimeout(() => setShowRestored(false), 3000)
      syncWrites()
    }

    const handleOffline = () => {
      setIsOnline(false)
      setShowRestored(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Poll pending count every 30s
    const interval = setInterval(checkPending, 30000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [checkPending, syncWrites])

  // Nothing to show when online and no pending writes
  if (isOnline && !showRestored && pendingCount === 0) {
    return null
  }

  return (
    <>
      {/* Offline banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-[#FEF2F2] border-b border-[#FECACA] px-4 py-2.5">
          <div className="max-w-md mx-auto flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
            <p className="font-cairo text-[13px] font-medium text-[#991B1B]">
              غير متصل — البيانات المحفوظة متاحة
            </p>
            {pendingCount > 0 && (
              <span className="bg-[#EF4444] text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Connection restored toast */}
      {showRestored && isOnline && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-[#F0FDF4] border-b border-[#BBF7D0] px-4 py-2.5">
          <div className="max-w-md mx-auto flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#16A34A]" />
            <p className="font-cairo text-[13px] font-medium text-[#166534]">
              {syncing ? 'جارٍ مزامنة البيانات...' : 'تم استعادة الاتصال'}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
