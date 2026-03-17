'use client'

import { useState, useRef, useEffect } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface ClinicInfo {
  id: string
  uniqueId: string
  name: string
  role: string
}

interface ClinicSelectorProps {
  /** Currently active clinic */
  activeClinic: ClinicInfo
  /** All clinics user belongs to */
  allClinics: ClinicInfo[]
  /** Whether user can switch clinics */
  canSwitch: boolean
}

// ============================================================================
// CLINIC SELECTOR (Header component for doctors with multiple clinics)
// ============================================================================

export default function ClinicSelector({
  activeClinic,
  allClinics,
  canSwitch,
}: ClinicSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSwitch = async (clinicId: string) => {
    if (clinicId === activeClinic.id) {
      setIsOpen(false)
      return
    }
    setSwitching(true)
    try {
      const res = await fetch('/api/clinic/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId }),
      })
      if (res.ok) {
        // Reload to apply new clinic context
        window.location.reload()
      }
    } catch (error) {
      console.error('Failed to switch clinic:', error)
    } finally {
      setSwitching(false)
    }
  }

  // Single clinic — just show the name (no dropdown)
  if (!canSwitch || allClinics.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 rounded-lg">
        <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <span className="text-sm font-medium text-primary-700">{activeClinic.name}</span>
      </div>
    )
  }

  // Multiple clinics — show dropdown selector
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={switching}
        className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
      >
        <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <span className="text-sm font-medium text-primary-700">
          {switching ? 'Switching...' : activeClinic.name}
        </span>
        <svg className={`w-3.5 h-3.5 text-primary-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs text-gray-500 font-medium font-cairo">تغيير العيادة</p>
          </div>
          {allClinics.map(clinic => (
            <button
              key={clinic.id}
              onClick={() => handleSwitch(clinic.id)}
              className={`w-full text-right px-3 py-2.5 hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                clinic.id === activeClinic.id ? 'bg-primary-50' : ''
              }`}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                clinic.id === activeClinic.id ? 'bg-primary-500' : 'bg-gray-300'
              }`} />
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-medium block ${
                  clinic.id === activeClinic.id ? 'text-primary-700' : 'text-gray-700'
                }`}>
                  {clinic.name}
                </span>
                <span className="text-xs text-gray-400 font-cairo">
                  {clinic.role === 'owner' ? 'صاحب العيادة' : clinic.role === 'doctor' ? 'طبيب' : clinic.role === 'frontdesk' ? 'استقبال' : clinic.role}
                </span>
              </div>
              {clinic.id === activeClinic.id && (
                <svg className="w-4 h-4 text-primary-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
