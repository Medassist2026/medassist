'use client'
import { useState, useEffect, useCallback } from 'react'
import QueueList from './QueueList'
import { subscribeToQueue } from '@shared/lib/realtime/queue-subscription'

interface RealtimeQueueWrapperProps {
  initialQueue: any[]
  clinicId: string
}

export default function RealtimeQueueWrapper({ initialQueue, clinicId }: RealtimeQueueWrapperProps) {
  const [queue, setQueue] = useState(initialQueue)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  const refreshQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/frontdesk/queue/today')
      if (res.ok) {
        const data = await res.json()
        setQueue(data.queue || [])
        setLastUpdate(new Date())
      }
    } catch (err) {
      console.error('Failed to refresh queue:', err)
    }
  }, [])

  useEffect(() => {
    if (!clinicId) return

    const unsubscribe = subscribeToQueue(clinicId, () => {
      refreshQueue()
    })

    return unsubscribe
  }, [clinicId, refreshQueue])

  // Also poll every 30 seconds as fallback
  useEffect(() => {
    const interval = setInterval(refreshQueue, 30000)
    return () => clearInterval(interval)
  }, [refreshQueue])

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs text-gray-500">
            Live • Updated {lastUpdate.toLocaleTimeString()}
          </span>
        </div>
        <button
          onClick={refreshQueue}
          className="text-xs text-primary-600 hover:text-primary-700 font-medium"
        >
          Refresh
        </button>
      </div>
      <QueueList queue={queue} />
    </div>
  )
}
