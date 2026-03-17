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
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkInResult, setCheckInResult] = useState<{ queueNumber: number } | null>(null)

  // Code verification state
  const [existingPatient, setExistingPatient] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [checkingPhone, setCheckingPhone] = useState(false)

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
    setExistingPatient(false)
    setVerificationCode('')
    setVerified(false)
  }

  // Check if phone belongs to an existing registered patient
  useEffect(() => {
    if (phone.length < 10) {
      setExistingPatient(false)
      setVerified(false)
      setVerificationCode('')
      return
    }

    const checkPhone = async () => {
      setCheckingPhone(true)
      try {
        const res = await fetch(`/api/patients/check-phone?phone=${encodeURIComponent(phone.trim())}`)
        const data = await res.json()
        if (data.exists && data.isRegistered) {
          setExistingPatient(true)
        } else {
          setExistingPatient(false)
        }
      } catch {
        // Ignore — proceed without verification
      } finally {
        setCheckingPhone(false)
      }
    }

    const debounce = setTimeout(checkPhone, 500)
    return () => clearTimeout(debounce)
  }, [phone])

  // Verify patient code
  const handleVerifyCode = async () => {
    if (!verificationCode.trim() || !phone.trim()) return
    setVerifying(true)
    setError('')

    try {
      const res = await fetch('/api/patients/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), code: verificationCode.trim() }),
      })
      const data = await res.json()

      if (res.ok && data.success) {
        setVerified(true)
        // Pre-fill form with verified patient data
        if (data.patient) {
          if (data.patient.full_name) setFullName(data.patient.full_name)
          if (data.patient.age) setAge(String(data.patient.age))
          if (data.patient.sex) setSex(data.patient.sex)
        }
      } else {
        setError(data.error || 'Invalid code. Ask the patient for the correct code from their app.')
      }
    } catch {
      setError('Failed to verify code')
    } finally {
      setVerifying(false)
    }
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

        {/* Existing Patient Code Verification */}
        {existingPatient && !verified && (
          <div className="md:col-span-2 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">This patient has an existing account</p>
                <p className="text-xs text-blue-700 mt-1">
                  Enter their 6-digit code to verify identity and access their records. The patient can find this code in their app under "My Code".
                </p>
                <div className="flex gap-2 mt-3">
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.toUpperCase())}
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                    className="w-40 px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-center font-mono tracking-wider uppercase"
                  />
                  <button
                    onClick={handleVerifyCode}
                    disabled={verifying || verificationCode.length < 6}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                  >
                    {verifying ? 'Verifying...' : 'Verify'}
                  </button>
                </div>
                <button
                  onClick={() => setExistingPatient(false)}
                  className="text-xs text-blue-600 hover:text-blue-800 mt-2 underline"
                >
                  Skip — register as walk-in instead
                </button>
              </div>
            </div>
          </div>
        )}

        {verified && (
          <div className="md:col-span-2 bg-green-50 border border-green-200 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-green-800">Patient verified — records will be linked</span>
            </div>
          </div>
        )}

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

      {result?.success && !checkInResult && (
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
              onClick={async () => {
                if (!result.patient?.id || !doctorId) return
                setCheckingIn(true)
                try {
                  const res = await fetch('/api/frontdesk/checkin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      patientId: result.patient.id,
                      doctorId,
                      queueType: 'walkin',
                    })
                  })
                  const data = await res.json()
                  if (res.ok) {
                    setCheckInResult({ queueNumber: data.queueNumber || data.queue_number || 0 })
                  } else {
                    setError(data.error || 'Check-in failed')
                  }
                } catch {
                  setError('Check-in failed')
                } finally {
                  setCheckingIn(false)
                }
              }}
              disabled={checkingIn || !doctorId}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {checkingIn ? 'Checking In...' : 'Check In This Patient Now'}
            </button>
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

      {checkInResult && (
        <div className="p-6 bg-green-50 border border-green-200 rounded-lg text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="font-bold text-green-900 text-lg mb-1">Registered &amp; Checked In!</div>
          {checkInResult.queueNumber > 0 && (
            <div className="bg-white border-2 border-green-300 rounded-xl p-4 inline-block my-3">
              <p className="text-xs text-green-600 font-medium mb-1">Queue Number</p>
              <p className="text-4xl font-bold text-green-700">{checkInResult.queueNumber}</p>
            </div>
          )}
          <div className="flex gap-2 justify-center mt-3">
            <button
              onClick={() => { resetForm(); setCheckInResult(null) }}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium"
            >
              Register Another Patient
            </button>
            <button
              onClick={() => router.push('/frontdesk/dashboard')}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
            >
              Go to Dashboard
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
