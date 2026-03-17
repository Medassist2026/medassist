'use client'

import { useState, useEffect } from 'react'
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

export default function PaymentForm() {
  const router = useRouter()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [selectedDoctor, setSelectedDoctor] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'insurance' | 'other'>('cash')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [doctorFee, setDoctorFee] = useState<{ consultation: number; followup: number } | null>(null)

  useEffect(() => {
    loadDoctors()
  }, [])

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

  const loadDoctors = async () => {
    try {
      const response = await fetch('/api/doctors/list')
      const data = await response.json()
      setDoctors(data.doctors || [])
    } catch (error) {
      console.error('Failed to load doctors:', error)
    }
  }

  // Fetch doctor fee when doctor is selected
  useEffect(() => {
    if (!selectedDoctor) {
      setDoctorFee(null)
      return
    }
    const fetchFee = async () => {
      try {
        const res = await fetch(`/api/doctor/public-fee?doctorId=${selectedDoctor}`)
        if (res.ok) {
          const data = await res.json()
          setDoctorFee({
            consultation: data.consultation_fee_egp || 0,
            followup: data.followup_fee_egp || 0,
          })
          // Auto-fill amount with consultation fee if not already set
          if (!amount && data.consultation_fee_egp > 0) {
            setAmount(String(data.consultation_fee_egp))
          }
        }
      } catch { /* ignore */ }
    }
    fetchFee()
  }, [selectedDoctor])

  const handleSubmit = async () => {
    if (!selectedPatient || !selectedDoctor || !amount) {
      setError('Please fill all required fields')
      return
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/frontdesk/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          doctorId: selectedDoctor,
          amount: amountNum,
          paymentMethod,
          notes
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Payment recording failed')
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
          Search Patient <span className="text-red-500">*</span>
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
          <div className="mt-2 border border-gray-200 rounded-lg divide-y">
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
      </div>

      {selectedPatient && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex justify-between items-center">
          <div>
            <div className="font-semibold text-green-900">Selected Patient</div>
            <div className="text-sm text-green-800">{selectedPatient.full_name}</div>
            <div className="text-sm text-green-700">{selectedPatient.phone}</div>
          </div>
          <button
            onClick={() => setSelectedPatient(null)}
            className="text-green-600 hover:text-green-700 text-sm font-medium"
          >
            Change
          </button>
        </div>
      )}

      {/* Doctor Selection */}
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

      {/* Fee Hint */}
      {doctorFee && (doctorFee.consultation > 0 || doctorFee.followup > 0) && (
        <div className="flex gap-2 flex-wrap">
          {doctorFee.consultation > 0 && (
            <button
              type="button"
              onClick={() => setAmount(String(doctorFee.consultation))}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                amount === String(doctorFee.consultation)
                  ? 'bg-primary-100 text-primary-800 border border-primary-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
              }`}
            >
              Consultation: {doctorFee.consultation} EGP
            </button>
          )}
          {doctorFee.followup > 0 && (
            <button
              type="button"
              onClick={() => setAmount(String(doctorFee.followup))}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                amount === String(doctorFee.followup)
                  ? 'bg-primary-100 text-primary-800 border border-primary-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
              }`}
            >
              Follow-up: {doctorFee.followup} EGP
            </button>
          )}
          {doctorFee.followup === 0 && doctorFee.consultation > 0 && (
            <span className="px-3 py-1.5 text-sm text-green-700">Follow-up: Free</span>
          )}
        </div>
      )}

      {/* Amount */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Amount (EGP) <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-gray-500 text-lg">£</span>
          </div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            step="0.01"
            min="0"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>
      </div>

      {/* Payment Method */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Payment Method <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {(['cash', 'card', 'insurance', 'other'] as const).map((method) => (
            <button
              key={method}
              onClick={() => setPaymentMethod(method)}
              className={`px-4 py-3 rounded-lg border-2 transition-colors ${
                paymentMethod === method
                  ? 'border-green-600 bg-green-50 text-green-900'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="font-medium capitalize">{method}</div>
              <div className="text-xs mt-1">
                {method === 'cash' && 'Cash payment'}
                {method === 'card' && 'Credit/Debit card'}
                {method === 'insurance' && 'Insurance claim'}
                {method === 'other' && 'Other method'}
              </div>
            </button>
          ))}
        </div>
      </div>

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
          placeholder="Additional payment notes..."
        />
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Receipt Preview */}
      {selectedPatient && selectedDoctor && amount && (
        <div className="p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <div className="text-sm font-medium text-gray-700 mb-2">Receipt Preview</div>
          <div className="text-xs text-gray-600 space-y-1">
            <div>Patient: {selectedPatient.full_name}</div>
            <div>Doctor: {doctors.find(d => d.id === selectedDoctor)?.full_name}</div>
            <div>Amount: {parseFloat(amount).toFixed(2)} EGP</div>
            <div>Method: {paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)}</div>
            <div>Date: {new Date().toLocaleDateString()}</div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={handleSubmit}
          disabled={loading || !selectedPatient || !selectedDoctor || !amount}
          className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
        >
          {loading ? 'Recording...' : 'Record Payment'}
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
