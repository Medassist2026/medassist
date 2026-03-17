'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, useCallback, Suspense } from 'react'
import PrescriptionPrint from '@shared/components/clinical/PrescriptionPrint'
import { ar } from '@shared/lib/i18n/ar'

interface ClinicalNote {
  id: string
  prescription_number: string
  prescription_date: string
  chief_complaints: string[]
  diagnosis: string
  medications: any[]
  radiology?: any[]
  labs?: any[]
  doctor_notes?: string
  show_notes_in_print?: boolean
  follow_up_date?: string
  patient: {
    full_name: string
    age: number
    sex: string
    phone?: string
  }
  doctor: {
    full_name: string
    specialty: string
    license_number?: string
  }
}

export default function PrescriptionPrintPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" /></div>}>
      <PrescriptionPrintPageInner />
    </Suspense>
  )
}

function PrescriptionPrintPageInner() {
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
        throw new Error(data.error || 'فشل في تحميل الروشتة')
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
    } else {
      setError('لا يوجد معرف للجلسة')
      setLoading(false)
    }
  }, [noteId, loadPrescription])

  const handlePrint = async () => {
    try {
      await fetch('/api/clinical/prescription/mark-printed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId })
      })
    } catch {
      // Silent fail for print tracking
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" dir="rtl">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">{ar.loading}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto p-6" dir="rtl">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <h2 className="text-lg font-bold text-red-900 mb-2">خطأ</h2>
          <p className="text-sm text-red-700 mb-4">{error}</p>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700"
          >
            {ar.goBack}
          </button>
        </div>
      </div>
    )
  }

  if (!note) return null

  return (
    <div className="max-w-md mx-auto py-4">
      <PrescriptionPrint
        patientName={note.patient?.full_name || 'مريض'}
        patientAge={note.patient?.age}
        patientSex={note.patient?.sex}
        patientPhone={note.patient?.phone}
        doctorName={note.doctor?.full_name || 'طبيب'}
        doctorLicense={note.doctor?.license_number}
        doctorSpecialty={note.doctor?.specialty || ''}
        prescriptionNumber={note.prescription_number}
        prescriptionDate={note.prescription_date}
        medications={note.medications}
        diagnosis={note.diagnosis}
        radiology={note.radiology}
        labs={note.labs}
        doctorNotes={note.doctor_notes}
        showNotesInPrint={note.show_notes_in_print}
        followUpDate={note.follow_up_date}
        onPrint={handlePrint}
      />
    </div>
  )
}
