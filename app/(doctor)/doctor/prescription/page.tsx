'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import PrescriptionPrint from '@/components/clinical/PrescriptionPrint'

interface ClinicalNote {
  id: string
  prescription_number: string
  prescription_date: string
  chief_complaints: string[]
  diagnosis: string
  medications: any[]
  patient: {
    full_name: string
    age: number
    sex: string
  }
  doctor: {
    full_name: string
    specialty: string
    license_number?: string
  }
}

export default function PrescriptionPage() {
  const searchParams = useSearchParams()
  const noteId = searchParams.get('noteId')
  
  const [note, setNote] = useState<ClinicalNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadPrescription = useCallback(async () => {
    try {
      const response = await fetch(`/api/clinical/prescription?noteId=${noteId}`)
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load prescription')
      }
      
      setNote(data.note)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [noteId])

  useEffect(() => {
    if (noteId) {
      loadPrescription()
    }
  }, [noteId, loadPrescription])

  const handlePrint = async () => {
    // Mark prescription as printed
    try {
      await fetch('/api/clinical/prescription/mark-printed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId })
      })
    } catch (err) {
      console.error('Failed to mark prescription as printed:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Error Loading Prescription</h2>
          <p className="text-red-700">{error}</p>
          <button
            onClick={() => window.history.back()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  if (!note) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No Prescription Found</h2>
          <p className="text-gray-600">The requested prescription could not be found.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <PrescriptionPrint
        patientName={note.patient?.full_name || 'Unknown Patient'}
        patientAge={note.patient?.age}
        patientSex={note.patient?.sex}
        doctorName={note.doctor?.full_name || 'Doctor'}
        doctorLicense={note.doctor?.license_number}
        doctorSpecialty={note.doctor?.specialty || ''}
        prescriptionNumber={note.prescription_number}
        prescriptionDate={note.prescription_date}
        medications={note.medications}
        diagnosis={note.diagnosis}
        onPrint={handlePrint}
      />
    </div>
  )
}
