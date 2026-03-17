'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Patient {
  id: string
  full_name: string | null
  phone: string
}

interface Doctor {
  id: string
  full_name: string | null
  specialty: string
}

interface TimeSlot {
  start_time: string
  end_time: string
  is_booked: boolean
}

export default function AppointmentBookingForm() {
  const router = useRouter()

  const [step, setStep] = useState(1) // 1: Patient + Doctor + Date, 2: Time + Confirm
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [selectedDoctor, setSelectedDoctor] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [appointmentType, setAppointmentType] = useState<'regular' | 'followup' | 'consultation'>('regular')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load doctors
  useEffect(() => {
    loadDoctors()
  }, [])

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

  // Load slots when doctor and date selected
  const loadDoctors = async () => {
    try {
      const response = await fetch('/api/doctors/list')
      const data = await response.json()
      setDoctors(data.doctors || [])
    } catch (error) {
      console.error('Failed to load doctors:', error)
    }
  }

  const loadSlots = useCallback(async () => {
    try {
      const response = await fetch(`/api/frontdesk/slots?doctorId=${selectedDoctor}&date=${selectedDate}`)
      const data = await response.json()
      setSlots(data.slots || [])
    } catch (error) {
      console.error('Failed to load slots:', error)
      setSlots([])
    }
  }, [selectedDate, selectedDoctor])

  useEffect(() => {
    if (selectedDoctor && selectedDate) {
      loadSlots()
    }
  }, [selectedDoctor, selectedDate, loadSlots])

  const handleBookAppointment = async () => {
    if (!selectedPatient || !selectedDoctor || !selectedSlot) {
      setError('Please complete all steps')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/frontdesk/appointments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          doctorId: selectedDoctor,
          startTime: selectedSlot.start_time,
          durationMinutes: 15,
          appointmentType,
          notes
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Booking failed')
      }

      // Success
      router.push('/frontdesk/dashboard')
      router.refresh()
    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // Get minimum date (today)
  const today = new Date().toISOString().split('T')[0]
  const maxDate = new Date()
  maxDate.setDate(maxDate.getDate() + 30) // 30 days from now
  const maxDateString = maxDate.toISOString().split('T')[0]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Progress Steps */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium ${
                step >= s ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {s}
              </div>
              {s < 2 && (
                <div className={`w-16 h-1 mx-2 ${step > s ? 'bg-primary-600' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-600">
          <span>Patient, Doctor & Date</span>
          <span>Time Slot & Confirm</span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Step 1: Patient Selection + Doctor & Date (Combined) */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg text-gray-900">Book an Appointment</h3>

            {/* Patient Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Patient <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or phone..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                disabled={!!selectedPatient}
              />

              {searchResults.length > 0 && !selectedPatient && (
                <div className="mt-2 border border-gray-200 rounded-lg divide-y max-h-48 overflow-y-auto">
                  {searchResults.map((patient) => (
                    <button
                      key={patient.id}
                      onClick={() => {
                        setSelectedPatient(patient)
                        setSearchQuery('')
                        setSearchResults([])
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50"
                    >
                      <div className="font-medium">{patient.full_name || 'Unnamed Patient'}</div>
                      <div className="text-sm text-gray-600">📞 {patient.phone}</div>
                    </button>
                  ))}
                </div>
              )}

              {selectedPatient && (
                <div className="mt-2 p-4 bg-primary-50 border border-primary-200 rounded-lg flex justify-between items-center">
                  <div>
                    <div className="font-medium text-primary-900">{selectedPatient.full_name}</div>
                    <div className="text-sm text-primary-700">{selectedPatient.phone}</div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedPatient(null)
                      setSearchQuery('')
                    }}
                    className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>

            {/* Doctor Selection */}
            {selectedPatient && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Doctor <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedDoctor}
                  onChange={(e) => setSelectedDoctor(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  <option value="">-- Choose Doctor --</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.full_name || 'Dr. Unknown'} ({doctor.specialty})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Appointment Type Selection */}
            {selectedPatient && selectedDoctor && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Appointment Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['regular', 'followup', 'consultation'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setAppointmentType(type)}
                      className={`px-4 py-2 rounded-lg border-2 text-sm ${
                        appointmentType === type
                          ? 'border-primary-600 bg-primary-50 text-primary-900'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Date Selection */}
            {selectedPatient && selectedDoctor && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={today}
                  max={maxDateString}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
            )}

            {/* Proceed to Time Selection */}
            {selectedPatient && selectedDoctor && selectedDate && (
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setSelectedPatient(null)
                    setSelectedDoctor('')
                    setSelectedDate('')
                    setAppointmentType('regular')
                  }}
                  className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium"
                >
                  Reset
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={!selectedDoctor || !selectedDate}
                  className="flex-1 px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  Next: Choose Time & Confirm
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Time Slot Selection + Confirmation */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg text-gray-900">
              Select Time & Confirm
            </h3>

            {/* Appointment Summary */}
            <div className="p-4 bg-gray-50 rounded-lg space-y-2 text-sm border border-gray-200">
              <div className="flex justify-between">
                <span className="text-gray-600">Patient:</span>
                <span className="font-medium">{selectedPatient?.full_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Doctor:</span>
                <span className="font-medium">
                  {doctors.find(d => d.id === selectedDoctor)?.full_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Date:</span>
                <span className="font-medium">{selectedDate && formatDate(selectedDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Type:</span>
                <span className="font-medium">{appointmentType.charAt(0).toUpperCase() + appointmentType.slice(1)}</span>
              </div>
            </div>

            {/* Time Slot Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Available Time Slots - {selectedDate && formatDate(selectedDate)}
              </label>

              {slots.length === 0 ? (
                <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                  No available slots for this day
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {slots.map((slot, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        if (!slot.is_booked) {
                          setSelectedSlot(slot)
                        }
                      }}
                      disabled={slot.is_booked}
                      className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                        slot.is_booked
                          ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                          : selectedSlot?.start_time === slot.start_time
                          ? 'border-primary-600 bg-primary-50 text-primary-900'
                          : 'border-gray-200 hover:border-primary-400 hover:bg-primary-50'
                      }`}
                    >
                      {formatTime(slot.start_time)}
                      {slot.is_booked && (
                        <div className="text-xs mt-1">Booked</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedSlot && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                <span className="text-green-700">✓</span>
                <span className="text-green-700 font-medium">
                  Time selected: {formatTime(selectedSlot.start_time)}
                </span>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="Any special notes for this appointment..."
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setStep(1)
                  setSelectedSlot(null)
                }}
                className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium"
              >
                Back
              </button>
              <button
                onClick={handleBookAppointment}
                disabled={loading || !selectedSlot}
                className="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {loading ? 'Booking...' : 'Confirm & Book Appointment'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
