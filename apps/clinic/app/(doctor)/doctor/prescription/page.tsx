'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import PrescriptionPrint from '@shared/components/clinical/PrescriptionPrint'
import { ar } from '@shared/lib/i18n/ar'
import { FileText, ArrowRight } from 'lucide-react'

interface PrescriptionData {
  clinicName?: string
  clinicPhone?: string
  clinicAddress?: string
  doctorName: string
  doctorSpecialty: string
  doctorLicense?: string
  patientName: string
  patientAge?: number
  patientSex?: string
  patientPhone?: string
  prescriptionNumber: string
  prescriptionDate: string
  medications: any[]
  diagnosis?: string
  radiology?: any[]
  labs?: any[]
  doctorNotes?: string
  showNotesInPrint?: boolean
  followUpDate?: string
}

export default function PrescriptionPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const noteId = searchParams.get('noteId')
  const mode = searchParams.get('mode') // 'print-only' or null

  const [data, setData] = useState<PrescriptionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [prescriptions, setPrescriptions] = useState<any[]>([]) // FIX 1: Prescriptions list

  // FIX 1: Load prescriptions list when no noteId
  const loadPrescriptionsList = useCallback(async () => {
    try {
      const response = await fetch('/api/doctor/prescriptions')
      const result = await response.json()
      if (result.success) {
        setPrescriptions(result.prescriptions || [])
      }
    } catch (err: any) {
      console.error('Failed to load prescriptions:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load from API (saved note)
  const loadFromApi = useCallback(async () => {
    try {
      const response = await fetch(`/api/clinical/prescription?noteId=${noteId}`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'فشل في تحميل الروشتة')
      }

      const note = result.note
      setData({
        doctorName: note.doctor?.full_name || 'طبيب',
        doctorSpecialty: note.doctor?.specialty || '',
        doctorLicense: note.doctor?.license_number,
        patientName: note.patient?.full_name || 'مريض',
        patientAge: note.patient?.age,
        patientSex: note.patient?.sex,
        prescriptionNumber: note.prescription_number || generateRefNumber(),
        prescriptionDate: note.prescription_date || new Date().toISOString().split('T')[0],
        medications: note.medications || [],
        diagnosis: note.diagnosis,
        radiology: note.radiology,
        labs: note.labs,
        doctorNotes: note.doctor_notes,
        showNotesInPrint: note.show_notes_in_print,
        followUpDate: note.follow_up_date,
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [noteId])

  // Load from sessionStorage (print-only mode)
  const loadFromSession = useCallback(async () => {
    try {
      const stored = sessionStorage.getItem('printOnlyData')
      if (!stored) {
        setError('لا توجد بيانات للطباعة')
        setLoading(false)
        return
      }

      const parsed = JSON.parse(stored)
      sessionStorage.removeItem('printOnlyData') // Clean up

      // Fetch the authenticated doctor's real name and specialty
      let doctorName = 'طبيب'
      let doctorSpecialty = ''
      try {
        const profileRes = await fetch('/api/doctor/profile')
        if (profileRes.ok) {
          const profile = await profileRes.json()
          doctorName = profile.full_name || doctorName
          doctorSpecialty = profile.specialty || doctorSpecialty
        }
      } catch {
        // Non-fatal: fall back to generic name
      }

      // Map medications: sessionStorage uses 'form' field; PrescriptionPrint expects 'type'
      const medications = Array.isArray(parsed.medications)
        ? parsed.medications.map((m: any) => ({
            ...m,
            type: m.type || m.form || 'أقراص',
          }))
        : []

      setData({
        doctorName,
        doctorSpecialty,
        patientName: parsed.patient?.name || 'مريض',
        patientAge: parsed.patient?.age,
        patientSex: parsed.patient?.sex,
        patientPhone: parsed.patient?.phone,
        prescriptionNumber: generateRefNumber(),
        prescriptionDate: new Date().toISOString().split('T')[0],
        medications,
        diagnosis: Array.isArray(parsed.diagnosis) ? parsed.diagnosis.join(', ') : parsed.diagnosis,
        radiology: parsed.radiology,
        labs: parsed.labs,
        doctorNotes: parsed.doctorNotes,
        showNotesInPrint: !!parsed.doctorNotes,
        followUpDate: parsed.followUpDate,
      })
    } catch {
      setError('خطأ في تحميل بيانات الطباعة')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (mode === 'print-only') {
      loadFromSession()
    } else if (noteId) {
      loadFromApi()
    } else {
      // FIX 1: Load prescriptions list
      loadPrescriptionsList()
    }
  }, [mode, noteId, loadFromApi, loadFromSession, loadPrescriptionsList])

  const handlePrint = async () => {
    if (noteId && mode !== 'print-only') {
      try {
        await fetch('/api/clinical/prescription/mark-printed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ noteId }),
        })
      } catch {
        // Silent fail for print tracking
      }
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
    // No session context: show friendly guidance instead of a red error
    const isNoSession = error === 'لا يوجد معرف للجلسة'
    if (isNoSession) {
      return (
        <div className="flex items-center justify-center min-h-[60vh] px-4" dir="rtl">
          <div className="text-center max-w-sm w-full">
            <div className="w-16 h-16 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-[#16A34A]" strokeWidth={1.5} />
            </div>
            <h2 className="font-cairo text-[18px] font-bold text-[#030712] mb-2">
              الوصفات الطبية
            </h2>
            <p className="font-cairo text-[14px] text-[#6B7280] mb-6 leading-relaxed">
              يتم إنشاء الوصفات أثناء جلسة الكشف. ابدأ جلسة مع مريض لإصدار وصفة طبية.
            </p>
            <button
              onClick={() => router.push('/doctor/session')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#16A34A] text-white rounded-xl text-[14px] font-cairo font-medium hover:bg-[#15803D] transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              ابدأ جلسة جديدة
            </button>
          </div>
        </div>
      )
    }

    // Actual errors (bad noteId, network, etc.)
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

  // FIX 1: Show prescriptions list when no noteId
  if (!noteId && !data && prescriptions.length > 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-4">
        <div className="mb-4">
          <h1 className="font-cairo text-[24px] font-bold text-[#030712] mb-1">الوصفات الطبية</h1>
          <p className="font-cairo text-[14px] text-[#6B7280]">الوصفات الأخيرة</p>
        </div>

        <div className="space-y-2 mb-6">
          {prescriptions.map((rx) => (
            <button
              key={rx.id}
              onClick={() => router.push(`?noteId=${rx.id}`)}
              className="w-full text-right px-4 py-3 bg-white border border-[#E5E7EB] rounded-xl hover:border-[#16A34A] hover:bg-[#F0FDF4] transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-cairo text-[#9CA3AF]">
                  {new Date(rx.created_at).toLocaleDateString('ar-EG')}
                </span>
              </div>
              <div className="font-cairo font-bold text-[14px] text-[#030712] mt-1">
                {rx.patient_name}
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[12px]">
                <span className="text-[#4B5563]">{rx.diagnosis || 'بدون تشخيص'}</span>
                {rx.medications_count > 0 && (
                  <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#16A34A] font-cairo font-semibold rounded-full text-[11px]">
                    {rx.medications_count} أدوية
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={() => router.push('/doctor/session')}
          className="w-full py-3 bg-[#16A34A] text-white rounded-xl font-cairo font-bold text-[14px] hover:bg-[#15803d] transition-colors"
        >
          ابدأ جلسة جديدة
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="max-w-md mx-auto py-4">
      <PrescriptionPrint
        clinicName={data.clinicName}
        clinicPhone={data.clinicPhone}
        clinicAddress={data.clinicAddress}
        doctorName={data.doctorName}
        doctorLicense={data.doctorLicense}
        doctorSpecialty={data.doctorSpecialty}
        patientName={data.patientName}
        patientAge={data.patientAge}
        patientSex={data.patientSex}
        patientPhone={data.patientPhone}
        prescriptionNumber={data.prescriptionNumber}
        prescriptionDate={data.prescriptionDate}
        medications={data.medications}
        diagnosis={data.diagnosis}
        radiology={data.radiology}
        labs={data.labs}
        doctorNotes={data.doctorNotes}
        showNotesInPrint={data.showNotesInPrint}
        followUpDate={data.followUpDate}
        onPrint={handlePrint}
      />
    </div>
  )
}

// Generate MED-YY-NNNN reference number
function generateRefNumber(): string {
  const year = new Date().getFullYear().toString().slice(-2)
  const seq = Math.floor(1000 + Math.random() * 9000).toString()
  return `MED-${year}-${seq}`
}
