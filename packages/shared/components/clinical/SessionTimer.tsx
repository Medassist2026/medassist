'use client'

import { useState, useEffect } from 'react'

interface SessionTimerProps {
  startTime: number
  keystrokeCount: number
}

export default function SessionTimer({ startTime, keystrokeCount }: SessionTimerProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [startTime])

  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60

  // Color coding: green under 45s, amber 45-90s, red over 90s
  let timerColor = 'text-success-600'
  let timerBg = 'bg-success-50'
  let statusText = 'On target'

  if (elapsed > 90) {
    timerColor = 'text-red-600'
    timerBg = 'bg-red-50'
    statusText = 'Over time'
  } else if (elapsed > 45) {
    timerColor = 'text-amber-600'
    timerBg = 'bg-amber-50'
    statusText = 'Approaching limit'
  }

  return (
    <div className="flex items-center gap-4">
      {/* Timer Display */}
      <div className={`flex flex-col items-end gap-2 px-4 py-3 ${timerBg} rounded-lg border border-gray-200`}>
        <div className={`text-4xl font-mono font-bold tracking-tight ${timerColor}`}>
          {minutes}:{seconds.toString().padStart(2, '0')}
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block px-2 py-1 bg-white border border-gray-200 rounded text-xs font-medium text-gray-700">
            Target: 45s
          </span>
          <span className="text-xs font-medium text-gray-600">
            {statusText}
          </span>
        </div>
      </div>
    </div>
  )
}
