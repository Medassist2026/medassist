'use client'

import { useState, useRef, useEffect } from 'react'

interface AssignedDoctor {
  id: string
  name: string
  specialty?: string
}

interface AssistantDoctorSelectorProps {
  assignedDoctors: AssignedDoctor[]
  activeDoctorId?: string
}

export default function AssistantDoctorSelector({
  assignedDoctors,
  activeDoctorId
}: AssistantDoctorSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeId, setActiveId] = useState(activeDoctorId || assignedDoctors[0]?.id)
  const [isSwitching, setIsSwitching] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const activeDoctor = assignedDoctors.find(d => d.id === activeId) || assignedDoctors[0]

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!assignedDoctors.length) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-sm">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span>No doctor assigned</span>
      </div>
    )
  }

  if (assignedDoctors.length === 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 text-primary-700 rounded-lg text-sm font-medium">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span>Working for: {activeDoctor?.name}</span>
      </div>
    )
  }

  async function handleSwitch(doctorId: string) {
    if (doctorId === activeId) {
      setIsOpen(false)
      return
    }
    setIsSwitching(true)
    try {
      await fetch('/api/clinic/set-active-doctor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId })
      })
      setActiveId(doctorId)
      setIsOpen(false)
      window.location.reload()
    } catch (err) {
      console.error('Failed to switch doctor:', err)
    } finally {
      setIsSwitching(false)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSwitching}
        className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-lg text-sm font-medium transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span>{isSwitching ? 'Switching...' : `Working for: ${activeDoctor?.name}`}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-64 bg-white rounded-xl shadow-modal border border-gray-200 py-1 z-50">
          <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100">
            Assigned Doctors
          </div>
          {assignedDoctors.map(doctor => (
            <button
              key={doctor.id}
              onClick={() => handleSwitch(doctor.id)}
              disabled={isSwitching}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                doctor.id === activeId
                  ? 'bg-primary-50 text-primary-700'
                  : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-xs">
                {doctor.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{doctor.name}</div>
                {doctor.specialty && (
                  <div className="text-xs text-gray-500 capitalize">{doctor.specialty.replace('-', ' ')}</div>
                )}
              </div>
              {doctor.id === activeId && (
                <svg className="w-4 h-4 text-primary-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
