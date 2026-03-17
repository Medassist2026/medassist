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

interface CheckInSuccess {
  queueNumber: number
  patientName: string
  doctorName: string
  queueType: string
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
  const [ghostMode, setGhostMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkInSuccess, setCheckInSuccess] = useState<CheckInSuccess | null>(null)

  // Load doctors on mount
  useEffect(() => {
    loadDoctors()
  }, [])

  const loadDoctors = async () => {
    try {
      const response = await fetch('/api/doctors/list')
      const data = await response.json()
      const doctorsList = data.doctors || []
      setDoctors(doctorsList)

      // Auto-select doctor if only one exists
      if (doctorsList.length === 1) {
        setSelectedDoctor(doctorsList[0].id)
      }
    } catch (error) {
      console.error('Failed to load doctors:', error)
    }
  }

  // Search patients
  useEffect(() => {
    if (searchQuery.length < 1) {
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
    if (!selectedPatient) {
      setError('Please select a patient')
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
          queueType,
          ghostMode,
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Check-in failed')
      }

      // Show success confirmation with queue number
      const doctorObj = doctors.find(d => d.id === selectedDoctor)
      setCheckInSuccess({
        queueNumber: data.queueNumber || data.queue_number || 0,
        patientName: selectedPatient.full_name || 'Patient',
        doctorName: doctorObj?.full_name || 'Doctor',
        queueType,
      })
    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCheckInAnother = () => {
    setCheckInSuccess(null)
    setSelectedPatient(null)
    setSearchQuery('')
    setSearchResults([])
    setSelectedDoctor(doctors.length === 1 ? doctors[0].id : '')
    setQueueType('walkin')
    setGhostMode(false)
    setError('')
  }

  // Success confirmation screen
  if (checkInSuccess) {
    return (
      <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-8 text-center space-y-6">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Check-In Successful!</h2>
          <p className="text-gray-600">{checkInSuccess.patientName} has been added to the queue.</p>
        </div>

        {checkInSuccess.queueNumber > 0 && (
          <div className="bg-primary-50 border-2 border-primary-200 rounded-2xl p-6 inline-block">
            <p className="text-sm text-primary-600 font-medium mb-1">Queue Number</p>
            <p className="text-5xl font-bold text-primary-700">{checkInSuccess.queueNumber}</p>
          </div>
        )}

        <div className="text-sm text-gray-500 space-y-1">
          <p>Doctor: <span className="font-medium text-gray-700">{checkInSuccess.doctorName}</span></p>
          <p>Type: <span className="font-medium text-gray-700 capitalize">{checkInSuccess.queueType}</span></p>
          {ghostMode && (
            <p className="text-amber-700 font-medium">Ghost Mode — No records saved</p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleCheckInAnother}
            className="flex-1 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
          >
            Check In Another Patient
          </button>
          <button
            onClick={() => router.push('/frontdesk/dashboard')}
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-6 space-y-6">
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
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          disabled={!!selectedPatient}
        />

        {/* Search Results */}
        {searchResults.length > 0 && !selectedPatient && (
          <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100">
            {searchResults.map((patient) => (
              <button
                key={patient.id}
                onClick={() => {
                  setSelectedPatient(patient)
                  setSearchQuery('')
                  setSearchResults([])
                }}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
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
        <div className="p-4 bg-primary-50 border border-primary-200 rounded-xl">
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
          Select Doctor <span className="text-gray-400 text-xs">(optional)</span>
        </label>
        <select
          value={selectedDoctor}
          onChange={(e) => setSelectedDoctor(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
            className={`px-4 py-3 rounded-xl border-2 transition-colors ${
              queueType === 'walkin'
                ? 'border-primary-600 bg-primary-50 text-primary-900'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className="font-medium">Walk-In</div>
            <div className="text-xs mt-1">No appointment</div>
          </button>

          <button
            onClick={() => setQueueType('appointment')}
            className={`px-4 py-3 rounded-xl border-2 transition-colors ${
              queueType === 'appointment'
                ? 'border-primary-600 bg-primary-50 text-primary-900'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className="font-medium">Appointment</div>
            <div className="text-xs mt-1">Scheduled visit</div>
          </button>

          <button
            onClick={() => setQueueType('emergency')}
            className={`px-4 py-3 rounded-xl border-2 transition-colors ${
              queueType === 'emergency'
                ? 'border-red-600 bg-red-50 text-red-900'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className="font-medium">Emergency</div>
            <div className="text-xs mt-1">Urgent case</div>
          </button>
        </div>
      </div>

      {/* Ghost Mode Toggle */}
      <div className="border border-gray-200 rounded-xl p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={ghostMode}
            onChange={(e) => setGhostMode(e.target.checked)}
            className="mt-1 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">Ghost Mode</span>
              <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Privacy</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              No clinical records will be saved for this visit. Use for sensitive consultations where the patient prefers full privacy.
            </p>
          </div>
        </label>
      </div>

      {ghostMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
          <strong>Ghost mode active:</strong> This visit will appear in the queue but no clinical notes, prescriptions, or lab orders will be linked to this patient's record.
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={handleCheckIn}
          disabled={loading || !selectedPatient}
          className="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >
          {loading ? 'Checking In...' : 'Check In Patient'}
        </button>

        <button
          onClick={() => router.push('/frontdesk/patients/register')}
          className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium min-h-[44px]"
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
