'use client'

import { useState } from 'react'
import { ar } from '@shared/lib/i18n/ar'

// ============================================================================
// TYPES
// ============================================================================

interface Medication {
  name: string
  type?: string
  frequency: string
  duration: string
  endDate?: string
  notes?: string
  taperingInstructions?: string
}

interface RadiologyItem {
  name: string
  timing: string[]
}

interface LabItem {
  name: string
  timing: string[]
}

interface PrescriptionPrintProps {
  // Clinic
  clinicName?: string
  clinicPhone?: string
  clinicAddress?: string
  // Doctor
  doctorName: string
  doctorLicense?: string
  doctorSpecialty: string
  // Patient
  patientName: string
  patientAge?: number
  patientSex?: string
  patientPhone?: string
  // Prescription
  prescriptionNumber: string
  prescriptionDate: string
  medications: Medication[]
  diagnosis?: string
  // New Figma fields
  radiology?: RadiologyItem[]
  labs?: LabItem[]
  doctorNotes?: string
  showNotesInPrint?: boolean
  followUpDate?: string
  // Callbacks
  onPrint?: () => void
}

// ============================================================================
// TIMING BADGE LABELS
// ============================================================================

const timingLabels: Record<string, string> = {
  morning: 'صباحاً',
  after_food: 'بعد الأكل',
  fasting: 'صائم',
  evening: 'مساءً',
  before_food: 'قبل الأكل',
}

// ============================================================================
// PRESCRIPTION PRINT COMPONENT - Figma Design Match
// ============================================================================

export default function PrescriptionPrint({
  clinicName,
  clinicPhone,
  clinicAddress,
  doctorName,
  doctorLicense,
  doctorSpecialty,
  patientName,
  patientAge,
  patientSex,
  patientPhone,
  prescriptionNumber,
  prescriptionDate,
  medications,
  diagnosis,
  radiology,
  labs,
  doctorNotes,
  showNotesInPrint,
  followUpDate,
  onPrint,
}: PrescriptionPrintProps) {
  const [isPrinting, setIsPrinting] = useState(false)

  const handlePrint = () => {
    setIsPrinting(true)
    if (onPrint) onPrint()
    setTimeout(() => {
      window.print()
      setIsPrinting(false)
    }, 100)
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('ar-EG', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    } catch {
      return dateString
    }
  }

  const sexLabel = patientSex === 'male' ? 'ذكر' : patientSex === 'female' ? 'أنثى' : ''

  return (
    <div className="bg-white" dir="rtl">
      {/* Print / Close Buttons (hidden when printing) */}
      <div className="mb-4 print:hidden flex gap-3 px-4">
        <button
          onClick={handlePrint}
          disabled={isPrinting}
          className="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          {isPrinting ? ar.loading : ar.printPrescription}
        </button>
        <button
          onClick={() => window.history.back()}
          className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium text-sm"
        >
          {ar.close}
        </button>
      </div>

      {/* ================================================================ */}
      {/* PRESCRIPTION DOCUMENT                                            */}
      {/* ================================================================ */}
      <div
        className="prescription-document bg-white border border-gray-200 rounded-xl mx-4 p-6 print:border-0 print:rounded-none print:p-0 print:mx-0 print:bg-white relative overflow-hidden"
        style={{ fontFamily: 'Cairo, Tajawal, sans-serif' }}
      >
        {/* MEDA Watermark (diagonal, semi-transparent) */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
          style={{ zIndex: 0 }}
        >
          <div
            className="text-[120px] font-black text-gray-100 opacity-30 tracking-widest"
            style={{ transform: 'rotate(-35deg)' }}
          >
            MEDA
          </div>
        </div>

        {/* Content (above watermark) */}
        <div className="relative" style={{ zIndex: 1 }}>
          {/* ===== CLINIC HEADER BAR ===== */}
          <div className="bg-primary-600 text-white rounded-xl p-4 mb-4 print:rounded-none">
            <h1 className="text-lg font-bold text-center">
              {clinicName || 'عيادة'}
            </h1>
            <div className="flex items-center justify-center gap-4 mt-1 text-xs opacity-90">
              {clinicPhone && <span>{clinicPhone}</span>}
              {clinicAddress && <span>{clinicAddress}</span>}
            </div>
          </div>

          {/* ===== DOCTOR + REF NUMBER ===== */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">{doctorName}</h2>
              <p className="text-sm text-gray-600">{doctorSpecialty}</p>
              {doctorLicense && (
                <p className="text-xs text-gray-500 mt-0.5">ترخيص: {doctorLicense}</p>
              )}
            </div>
            <div className="text-left">
              <div className="text-xs text-gray-500">{ar.referenceNumber}</div>
              <div className="text-sm font-bold text-primary-700 font-mono">{prescriptionNumber}</div>
            </div>
          </div>

          {/* ===== PATIENT INFO BOX ===== */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-gray-500">{ar.patientName}</span>
                <div className="font-bold text-gray-900">{patientName}</div>
              </div>
              <div>
                <span className="text-xs text-gray-500">{ar.age}</span>
                <div className="font-medium text-gray-900">
                  {patientAge ? `${patientAge} سنة` : '—'} {sexLabel && `/ ${sexLabel}`}
                </div>
              </div>
              {patientPhone && (
                <div>
                  <span className="text-xs text-gray-500">{ar.phone}</span>
                  <div className="font-medium text-gray-900" dir="ltr">{patientPhone}</div>
                </div>
              )}
              <div>
                <span className="text-xs text-gray-500">{ar.date}</span>
                <div className="font-medium text-gray-900">{formatDate(prescriptionDate)}</div>
              </div>
            </div>

            {diagnosis && (
              <div className="mt-2 pt-2 border-t border-gray-200">
                <span className="text-xs text-gray-500">{ar.diagnosis}</span>
                <div className="text-sm font-medium text-gray-900">{diagnosis}</div>
              </div>
            )}
          </div>

          {/* ===== MEDICATIONS LIST ===== */}
          {medications.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                <span className="text-xl" style={{ fontFamily: 'Georgia, serif' }}>℞</span>
                {ar.medications}
              </h3>
              <div className="space-y-2">
                {medications.map((med, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-gray-900">{med.name}</div>
                        <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                          {med.frequency && <div>{ar.frequency}: {med.frequency}</div>}
                          {med.duration && <div>{ar.duration}: {med.duration}</div>}
                          {med.notes && <div className="text-gray-500 italic">{med.notes}</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===== LABS SECTION ===== */}
          {labs && labs.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-bold text-gray-900 mb-2">{ar.labsSection}</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
                {labs.map((lab, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-gray-900">{lab.name}</span>
                    {lab.timing && lab.timing.length > 0 && (
                      <div className="flex gap-1">
                        {lab.timing.map((t) => (
                          <span key={t} className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                            {timingLabels[t] || t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===== RADIOLOGY SECTION ===== */}
          {radiology && radiology.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-bold text-gray-900 mb-2">{ar.radiologySection}</h3>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-2">
                {radiology.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-gray-900">{item.name}</span>
                    {item.timing && item.timing.length > 0 && (
                      <div className="flex gap-1">
                        {item.timing.map((t) => (
                          <span key={t} className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                            {timingLabels[t] || t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===== DOCTOR NOTES (only if showNotesInPrint) ===== */}
          {showNotesInPrint && doctorNotes && (
            <div className="mb-4">
              <h3 className="text-sm font-bold text-gray-900 mb-2">{ar.doctorNotes}</h3>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-gray-800 whitespace-pre-wrap">
                {doctorNotes}
              </div>
            </div>
          )}

          {/* ===== FOLLOW-UP DATE ===== */}
          {followUpDate && (
            <div className="mb-4 text-sm">
              <span className="font-bold text-gray-900">{ar.followUpDate}: </span>
              <span className="text-gray-700">{formatDate(followUpDate)}</span>
            </div>
          )}

          {/* ===== SIGNATURE LINE ===== */}
          <div className="mt-8 pt-4 border-t border-gray-300">
            <div className="flex items-end justify-between">
              <div className="text-xs text-gray-500">
                <p>هذه الروشتة صالحة لمدة ٣٠ يوماً من تاريخ الإصدار</p>
              </div>
              <div className="text-center">
                <div className="h-12 mb-1" />
                <div className="border-t-2 border-gray-800 pt-1 min-w-[140px]">
                  <p className="text-xs font-bold text-gray-900">{doctorName}</p>
                  <p className="text-[10px] text-gray-600">توقيع الطبيب</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* PRINT STYLES                                                     */}
      {/* ================================================================ */}
      <style jsx global>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
            background: white;
            direction: rtl;
          }

          .prescription-document {
            margin: 0;
            padding: 12mm;
            box-shadow: none;
            border: none;
            border-radius: 0;
          }

          @page {
            size: A5;
            margin: 8mm;
          }

          button, [class*="print:hidden"] {
            display: none !important;
          }

          /* Ensure watermark prints */
          .pointer-events-none {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  )
}
