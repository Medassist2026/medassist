'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Doctor {
  id: string
  full_name: string | null
  specialty: string
}

interface RegistrationResult {
  success: boolean
  message?: string
  patient?: {
    id: string
    full_name?: string | null
    phone?: string
    unique_id?: string
  }
  isExisting?: boolean
}

export default function PatientRegistrationForm() {
  const router = useRouter()
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<'Male' | 'Female' | 'Other'>('Male')
  const [doctorId, setDoctorId] = useState('')
  const [isDependent, setIsDependent] = useState(false)
  const [parentPhone, setParentPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<RegistrationResult | null>(null)

  useEffect(() => {
    const loadDoctors = async () => {
      try {
        const response = await fetch('/api/doctors/list')
        const data = await response.json()
        setDoctors(data.doctors || [])
      } catch (loadError) {
        console.error('Failed to load doctors:', loadError)
      }
    }
    loadDoctors()
  }, [])

  const resetForm = () => {
    setFullName('')
    setPhone('')
    setAge('')
    setSex('Male')
    setDoctorId('')
    setIsDependent(false)
    setParentPhone('')
    setError('')
    setResult(null)
  }

  const handleSubmit = async () => {
    if (!fullName.trim() || !phone.trim() || !age || !doctorId) {
      setError('Please fill all required fields')
      return
    }
    if (isDependent && !parentPhone.trim()) {
      setError('Parent phone is required for dependent patients')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('/api/patients/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          fullName: fullName.trim(),
          age: parseInt(age, 10),
          sex,
          doctorId,
          isDependent,
          parentPhone: isDependent ? parentPhone.trim() : undefined
        })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to register patient')
      }

      setResult({
        success: true,
        message: data.message,
        patient: data.patient,
        isExisting: data.isExisting
      })
    } catch (submitError: any) {
      setError(submitError.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Patient full name"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Age <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="0"
            max="120"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="Age"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sex <span className="text-red-500">*</span>
          </label>
          <select
            value={sex}
            onChange={(e) => setSex(e.target.value as 'Male' | 'Female' | 'Other')}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          >
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Assign Doctor <span className="text-red-500">*</span>
        </label>
        <select
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
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

      <div className="space-y-3">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isDependent}
            onChange={(e) => setIsDependent(e.target.checked)}
            className="rounded border-gray-300"
          />
          Dependent patient (child)
        </label>

        {isDependent && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Parent Phone <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={parentPhone}
              onChange={(e) => setParentPhone(e.target.value)}
              placeholder="Parent phone number"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {result?.success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="font-medium text-green-800 mb-1">
            {result.isExisting ? 'Existing patient linked' : 'Patient registered successfully'}
          </div>
          <div className="text-sm text-green-700">
            {result.message || 'Patient is ready for check-in.'}
          </div>
          {result.patient?.unique_id && (
            <div className="text-xs text-green-700 mt-1">
              Patient code: {result.patient.unique_id}
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => router.push('/frontdesk/checkin')}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium"
            >
              Go To Check-In
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium"
            >
              Register Another
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50"
        >
          {loading ? 'Registering...' : 'Register Patient'}
        </button>
        <button
          onClick={() => router.push('/frontdesk/dashboard')}
          className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
