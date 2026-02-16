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
  
  const isUnderTarget = elapsed <= 45
  const keystrokesUnderTarget = keystrokeCount <= 10
  
  return (
    <div className="flex items-center gap-6">
      {/* Timer */}
      <div className="text-right">
        <div className={`text-3xl font-mono font-bold ${
          isUnderTarget ? 'text-success-600' : 'text-warning-600'
        }`}>
          {minutes}:{seconds.toString().padStart(2, '0')}
        </div>
        <div className="text-xs text-gray-600 mt-1">
          {isUnderTarget ? '✓ Under 45s target' : '⚠️ Over 45s target'}
        </div>
      </div>
      
      {/* Keystroke Counter */}
      <div className="text-right border-l border-gray-300 pl-6">
        <div className={`text-3xl font-mono font-bold ${
          keystrokesUnderTarget ? 'text-success-600' : 'text-warning-600'
        }`}>
          {keystrokeCount}
        </div>
        <div className="text-xs text-gray-600 mt-1">
          {keystrokesUnderTarget ? '✓ Under 10 keystrokes' : '⚠️ Over 10 keystrokes'}
        </div>
      </div>
    </div>
  )
}
