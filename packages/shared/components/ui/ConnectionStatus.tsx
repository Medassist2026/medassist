'use client'

import { useState } from 'react'
import { useOfflineStatus } from '@shared/hooks/useOfflineStatus'
import { useClinicPeers } from '@shared/hooks/useClinicPeers'

/**
 * ConnectionStatus — Arabic connection status bar
 *
 * Shows at the top of the app:
 * - Green dot + "متصل بالإنترنت" when online
 * - Blue dot + "شبكة محلية" when LAN only
 * - Red dot + "غير متصل" when offline
 * - Pending writes count
 * - Expandable peer list
 */

export default function ConnectionStatus() {
  const {
    connection,
    isOnline,
    isOffline,
    pendingWrites,
    failedWrites,
    peerCount,
    isSyncing,
    syncNow,
    statusMessage,
  } = useOfflineStatus()

  const { peers, doctors, frontDesk } = useClinicPeers()
  const [expanded, setExpanded] = useState(false)

  // Color scheme based on connection state
  const colors = {
    online: {
      dot: 'bg-green-500',
      bg: 'bg-green-50 border-green-200',
      text: 'text-green-700',
      icon: 'text-green-500',
    },
    'lan-only': {
      dot: 'bg-blue-500',
      bg: 'bg-blue-50 border-blue-200',
      text: 'text-blue-700',
      icon: 'text-blue-500',
    },
    offline: {
      dot: 'bg-red-500',
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-700',
      icon: 'text-red-500',
    },
  }

  const c = colors[connection]

  // Don't show when fully online with no pending writes
  if (isOnline && pendingWrites === 0 && !isSyncing && failedWrites === 0) {
    return null
  }

  return (
    <div dir="rtl" className={`${c.bg} border-b px-4 py-2`}>
      {/* Main Status Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Connection Dot */}
          <div className={`w-2 h-2 rounded-full ${c.dot} ${isSyncing ? 'animate-pulse' : ''}`} />

          {/* Status Message */}
          <span className={`text-xs font-medium ${c.text}`}>
            {statusMessage}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Pending Writes Badge */}
          {pendingWrites > 0 && (
            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
              {pendingWrites} معلق
            </span>
          )}

          {/* Failed Writes Badge */}
          {failedWrites > 0 && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
              {failedWrites} فشل
            </span>
          )}

          {/* Sync Button */}
          {!isOffline && pendingWrites > 0 && (
            <button
              onClick={syncNow}
              disabled={isSyncing}
              className={`text-xs font-medium px-2 py-0.5 rounded ${
                isSyncing
                  ? 'text-gray-400 cursor-not-allowed'
                  : `${c.text} hover:underline`
              }`}
            >
              {isSyncing ? 'جاري...' : 'مزامنة'}
            </button>
          )}

          {/* Expand Peers Button */}
          {peerCount > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={`text-xs ${c.icon}`}
            >
              {peerCount} جهاز
              <span className="mr-1">{expanded ? '▲' : '▼'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded Peer List */}
      {expanded && peers.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
          <p className="text-xs text-gray-500 font-medium mb-1">
            الأجهزة المتصلة على الشبكة المحلية:
          </p>
          {peers.map((peer) => (
            <div
              key={peer.deviceId}
              className="flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  peer.isOnline ? 'bg-green-400' : 'bg-gray-300'
                }`} />
                <span className="text-gray-700">{peer.name}</span>
                <span className="text-gray-400">({peer.roleLabel})</span>
              </div>
              <span className="text-gray-400">{peer.lastSeenLabel}</span>
            </div>
          ))}

          {/* Summary by role */}
          <div className="flex gap-3 mt-1 pt-1 border-t border-gray-100 text-xs text-gray-400">
            {doctors.length > 0 && (
              <span>{doctors.length} طبيب</span>
            )}
            {frontDesk.length > 0 && (
              <span>{frontDesk.length} استقبال</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
