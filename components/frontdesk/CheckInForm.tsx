'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Patient {
  id: string
  full_name: string | null
  phone: string
  age: number | null
  sex: string | null
}

interface Doctor {
  id: string
  full_name: string | null
  specialty: string
}

export default function CheckInForm() {
  const router = useRouter()
  
  // State
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [selectedDoctor, setSelectedDoctor] = useState('')
  const [queueType, setQueueType] = useState<'appointment' | 'walkin' | 'emergency'>('walkin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load doctors on mount
  useEffect(() => {
    loadDoctors()
  }, [])

  const loadDoctors = async () => {
    try {
      const response = await fetch('/api/doctors/list')
      const data = await response.json()
      setDoctors(data.doctors || [])
    } catch (error) {
      console.error('Failed to load doctors:', error)
    }
  }

  // Search patients
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults([])
      return
    }

    const search = async () => {
      try {
        const response = await fetch(`/api/patients/search?q=${encodeURIComponent(searchQuery)}`)
        const data = await response.json()
        setSearchResults(data.patients || [])
      } catch (error) {
        console.error('Search error:', error)
      }
    }

    const debounce = setTimeout(search, 300)
    return () => clearTimeout(debounce)
  }, [searchQuery])

  const handleCheckIn = async () => {
    if (!selectedPatient || !selectedDoctor) {
      setError('Please select both patient and doctor')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/frontdesk/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          doctorId: selectedDoctor,
          queueType
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Check-in failed')
      }

      // Success - redirect to dashboard
      router.push('/frontdesk/dashboard')
      router.refresh()
    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
      {/* Patient Search */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Search Patient (by name or phone)
        </label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or phone..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          disabled={!!selectedPatient}
        />

        {/* Search Results */}
        {searchResults.length > 0 && !selectedPatient && (
          <div className="mt-2 border border-gray-200 rounded-lg divide-y">
            {searchResults.map((patient) => (
              <button
                key={patient.id}
                onClick={() => {
                  setSelectedPatient(patient)
                  setSearchQuery('')
                  setSearchResults([])
                }}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium text-gray-900">
                  {patient.full_name || 'Unnamed Patient'}
                </div>
                <div className="text-sm text-gray-600">
                  📞 {patient.phone} {patient.age && `• 🎂 ${patient.age}y`} {patient.sex && `• 👤 ${patient.sex}`}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Patient */}
      {selectedPatient && (
        <div className="p-4 bg-primary-50 border border-primary-200 rounded-lg">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-semibold text-primary-900 mb-1">
                Selected Patient
              </div>
              <div className="text-sm text-primary-800">
                {selectedPatient.full_name || 'Unnamed Patient'}
              </div>
              <div className="text-sm text-primary-700">
                📞 {selectedPatient.phone} {selectedPatient.age && `• 🎂 ${selectedPatient.age}y`} {selectedPatient.sex && `• 👤 ${selectedPatient.sex}`}
              </div>
            </div>
            <button
              onClick={() => setSelectedPatient(null)}
              className="text-primary-600 hover:text-primary-700 font-medium text-sm"
            >
              Change
            </button>
          </div>
        </div>
      )}

      {/* Doctor Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Doctor <span className="text-red-500">*</span>
        </label>
        <select
          value={selectedDoctor}
          onChange={(e) => setSelectedDoctor(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          required
        >
          <option value="">-- Choose Doctor --</option>
          {doctors.map((doctor) => (
            <option key={doctor.id} value={doctor.id}>
              {doctor.full_name || 'Dr. Unknown'} ({doctor.specialty.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')})
            </option>
          ))}
        </select>
      </div>

      {/* Queue Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Queue Type <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setQueueType('walkin')}
            className={`px-4 py-3 rounded-lg border-2 transition-colors ${
              queueType === 'walkin'
                ? 'border-purple-600 bg-purple-50 text-purple-900'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="font-medium">Walk-In</div>
            <div className="text-xs mt-1">No appointment</div>
          </button>

          <button
            onClick={() => setQueueType('appointment')}
            className={`px-4 py-3 rounded-lg border-2 transition-colors ${
              queueType === 'appointment'
                ? 'border-primary-600 bg-primary-50 text-primary-900'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="font-medium">Appointment</div>
            <div className="text-xs mt-1">Scheduled visit</div>
          </button>

          <button
            onClick={() => setQueueType('emergency')}
            className={`px-4 py-3 rounded-lg border-2 transition-colors ${
              queueType === 'emergency'
                ? 'border-red-600 bg-red-50 text-red-900'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="font-medium">Emergency</div>
            <div className="text-xs mt-1">Urgent case</div>
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={handleCheckIn}
          disabled={loading || !selectedPatient || !selectedDoctor}
          className="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Checking In...' : 'Check In Patient'}
        </button>

        <button
          onClick={() => router.push('/frontdesk/patients/register')}
          className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium"
        >
          Register New Patient
        </button>
      </div>

      {/* Quick Tip */}
      <div className="text-xs text-gray-500 text-center pt-2">
        💡 Tip: Search patient by phone number for fastest check-in
      </div>
    </div>
  )
}
