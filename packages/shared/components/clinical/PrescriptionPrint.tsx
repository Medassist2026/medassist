'use client'

import { useState } from 'react'
import { ar } from '@shared/lib/i18n/ar'

// ============================================================================
// TYPES
// ============================================================================

interface Medication {
  name: string
  type?: string           // form: أقراص / شراب / حقن / etc.
  dosageCount?: string    // "1", "2", "5ml", etc.
  frequency: string       // "مرة يومياً", "مرتين يومياً", etc.
  duration: string        // "٧ أيام", "شهر", etc.
  endDate?: string
  notes?: string
  taperingInstructions?: string
}

interface RadiologyItem {
  name: string
  timing?: string[]
  notes?: string
}

interface LabItem {
  name: string
  timing?: string[]
  notes?: string
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
  doctorQualification?: string   // e.g. "بكالوريوس طب وجراحة"
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
  // Optional sections
  radiology?: RadiologyItem[]
  labs?: LabItem[]
  doctorNotes?: string
  showNotesInPrint?: boolean
  followUpDate?: string
  // Callbacks
  onPrint?: () => void
}

// ============================================================================
// SPECIALTY TRANSLATION MAP (English slugs → Arabic display)
// ============================================================================

const SPECIALTY_AR: Record<string, string> = {
  'general': 'طب عام',
  'general-practitioner': 'طب عام',
  'general practitioner': 'طب عام',
  'internal-medicine': 'باطنة',
  'باطنة': 'باطنة',
  'pediatrics': 'أطفال',
  'cardiology': 'قلب وأوعية دموية',
  'obstetrics-gynecology': 'نساء وتوليد',
  'orthopedics': 'عظام',
  'dermatology': 'جلدية',
  'ophthalmology': 'عيون',
  'ent': 'أنف وأذن وحنجرة',
  'neurology': 'مخ وأعصاب',
  'psychiatry': 'نفسية',
  'urology': 'مسالك بولية',
  'surgery': 'جراحة عامة',
  'dentistry': 'أسنان',
  'radiology': 'أشعة',
  'laboratory': 'تحاليل',
  'physiotherapy': 'علاج طبيعي',
  'nutrition': 'تغذية',
  'endocrinology': 'غدد صماء',
}

function toArabicSpecialty(slug?: string): string {
  if (!slug) return ''
  return SPECIALTY_AR[slug] ?? SPECIALTY_AR[slug.toLowerCase()] ?? slug
}

/** Ensure doctor name has the proper Arabic title prefix */
function formatDoctorName(name: string): string {
  if (!name) return name
  if (name.startsWith('د.') || name.startsWith('دكتور') || name.startsWith('دكتورة')) return name
  return `د. ${name}`
}

// ============================================================================
// HELPERS
// ============================================================================

/** Build a single-line dosage string matching Egyptian Rx conventions */
function buildDosageString(med: Medication): string {
  const parts: string[] = []

  // Form first: أقراص / شراب / حقن / etc.
  if (med.type) parts.push(med.type)

  // Dose amount
  if (med.dosageCount) {
    const isFluid = med.type === 'شراب' || (med.dosageCount && med.dosageCount.includes('ml'))
    if (isFluid) {
      parts.push(med.dosageCount)
    } else {
      const num = parseFloat(med.dosageCount)
      if (!isNaN(num)) {
        parts.push(toArabicNum(med.dosageCount))
      } else {
        parts.push(med.dosageCount)
      }
    }
  }

  // Frequency
  if (med.frequency) parts.push(med.frequency)

  // Duration
  if (med.duration) parts.push(`لمدة ${med.duration}`)

  return parts.join(' — ')
}

/** Convert Western numerals to Eastern Arabic numerals */
function toArabicNum(s: string): string {
  return s.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)])
}

/** Format a date string as Arabic long date.
 *  Parses YYYY-MM-DD as a LOCAL date (not UTC midnight) to avoid timezone-induced day shifts. */
function formatDate(dateString: string): string {
  try {
    // For ISO date strings (YYYY-MM-DD), construct using local year/month/day
    // so the date doesn't roll back by one day in UTC+ timezones.
    const isoMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/)
    const date = isoMatch
      ? new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]))
      : new Date(dateString)
    return date.toLocaleDateString('ar-EG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return dateString
  }
}

// ============================================================================
// PRESCRIPTION PRINT — Egyptian روشتة طبية format
// ============================================================================

export default function PrescriptionPrint({
  clinicName,
  clinicPhone,
  clinicAddress,
  doctorName,
  doctorLicense,
  doctorSpecialty,
  doctorQualification,
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

  const sexLabel =
    patientSex === 'Male' || patientSex === 'male'
      ? 'ذكر'
      : patientSex === 'Female' || patientSex === 'female'
      ? 'أنثى'
      : ''

  const hasLabs = labs && labs.length > 0
  const hasRadiology = radiology && radiology.length > 0

  return (
    <div className="bg-white" dir="rtl">
      {/* ---------------------------------------------------------------- */}
      {/* Action Buttons — hidden when printing                            */}
      {/* ---------------------------------------------------------------- */}
      <div className="mb-4 print:hidden flex gap-3 px-4">
        <button
          onClick={handlePrint}
          disabled={isPrinting}
          className="flex-1 px-6 py-3 bg-[#16A34A] hover:bg-[#15803d] text-white rounded-xl font-bold text-sm font-cairo disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          {isPrinting ? ar.loading : ar.printPrescription}
        </button>
        <button
          onClick={() => window.history.back()}
          className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium text-sm font-cairo"
        >
          {ar.close}
        </button>
      </div>

      {/* ================================================================ */}
      {/* PRESCRIPTION DOCUMENT — A5, Egyptian Rx layout                  */}
      {/* ================================================================ */}
      <div
        className="prescription-document bg-white border border-gray-300 mx-4 print:border-0 print:mx-0 print:bg-white"
        style={{ fontFamily: 'Cairo, Tajawal, sans-serif', maxWidth: '148mm', minHeight: '210mm', position: 'relative', padding: '10mm 12mm 8mm 12mm' }}
      >
        {/* ============================================================ */}
        {/* HEADER — Doctor & Clinic Identity                            */}
        {/* ============================================================ */}
        <div className="flex items-start justify-between pb-3 mb-3" style={{ borderBottom: '2px solid #16A34A' }}>
          {/* Right: Doctor info */}
          <div className="text-right">
            <div className="font-bold text-[18px] text-[#0f172a] leading-tight">
              {formatDoctorName(doctorName)}
            </div>
            {doctorQualification ? (
              <div className="text-[11px] text-[#475569] mt-0.5">{doctorQualification}</div>
            ) : (
              <div className="text-[11px] text-[#475569] mt-0.5">بكالوريوس طب وجراحة</div>
            )}
            <div className="text-[13px] font-semibold text-[#16A34A] mt-1">{toArabicSpecialty(doctorSpecialty)}</div>
            {doctorLicense && (
              <div className="text-[10px] text-[#94a3b8] mt-0.5">رقم النقابة: {doctorLicense}</div>
            )}
          </div>

          {/* Left: Clinic name + contact */}
          <div className="text-left">
            {clinicName && (
              <div className="font-bold text-[15px] text-[#0f172a] leading-tight text-left">{clinicName}</div>
            )}
            {clinicAddress && (
              <div className="text-[11px] text-[#64748b] mt-0.5 text-left">{clinicAddress}</div>
            )}
            {clinicPhone && (
              <div className="text-[11px] text-[#64748b] mt-0.5 text-left" dir="ltr">{clinicPhone}</div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* PATIENT + DATE ROW                                           */}
        {/* ============================================================ */}
        <div className="flex items-center gap-4 mb-3 text-[12px]" style={{ borderBottom: '1px dashed #cbd5e1', paddingBottom: '8px' }}>
          <div className="flex items-center gap-1 flex-1">
            <span className="text-[#64748b] font-medium">اسم المريض:</span>
            <span className="font-bold text-[#0f172a]">{patientName}</span>
          </div>
          {(patientAge || sexLabel) && (
            <div className="flex items-center gap-1">
              <span className="text-[#64748b] font-medium">السن:</span>
              <span className="font-medium text-[#0f172a]">
                {patientAge ? `${patientAge} سنة` : '—'}
                {sexLabel ? ` (${sexLabel})` : ''}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="text-[#64748b] font-medium">التاريخ:</span>
            <span className="font-medium text-[#0f172a]">{formatDate(prescriptionDate)}</span>
          </div>
        </div>

        {/* Diagnosis */}
        {diagnosis && (
          <div className="mb-3 text-[12px] flex items-start gap-1">
            <span className="text-[#64748b] font-medium flex-shrink-0">التشخيص:</span>
            <span className="font-semibold text-[#0f172a]">{diagnosis}</span>
          </div>
        )}

        {/* ============================================================ */}
        {/* ℞ MEDICATIONS                                                */}
        {/* ============================================================ */}
        <div className="mb-4">
          {/* ℞ symbol header */}
          <div className="flex items-center gap-2 mb-2">
            <span style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '22px', fontWeight: 'bold', color: '#0f172a', lineHeight: 1 }}>℞</span>
            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
          </div>

          {medications.length === 0 ? (
            <div className="text-[12px] text-[#64748b] italic py-1">
              لم يتم وصف أدوية في هذه الجلسة
            </div>
          ) : (
            <div className="space-y-2">
              {medications.map((med, i) => (
                <div key={i} className="flex items-start gap-2">
                  {/* Number */}
                  <span
                    className="flex-shrink-0 font-bold text-[#16A34A]"
                    style={{ fontSize: '13px', width: '18px', paddingTop: '1px' }}
                  >
                    {toArabicNum(String(i + 1))}.
                  </span>

                  <div className="flex-1">
                    {/* Drug name — bold underlined, Egyptian style */}
                    <span
                      className="font-bold text-[#0f172a]"
                      style={{ fontSize: '13px', textDecoration: 'underline', textDecorationColor: '#94a3b8' }}
                    >
                      {med.name}
                    </span>

                    {/* Dosage / frequency line */}
                    <div className="text-[12px] text-[#334155] mt-0.5">
                      {buildDosageString(med)}
                    </div>

                    {/* Notes */}
                    {med.notes && (
                      <div className="text-[11px] text-[#64748b] mt-0.5 italic">
                        {med.notes}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* LABS                                                         */}
        {/* ============================================================ */}
        {hasLabs && (
          <div className="mb-3">
            <div className="text-[12px] font-bold text-[#0f172a] mb-1 flex items-center gap-2">
              <span>تحاليل مطلوبة</span>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
            </div>
            <div className="space-y-1">
              {labs!.map((lab, i) => (
                <div key={i} className="flex items-start gap-2 text-[12px]">
                  <span className="text-[#16A34A] font-bold flex-shrink-0" style={{ width: '18px' }}>
                    {toArabicNum(String(i + 1))}.
                  </span>
                  <span className="text-[#334155]">
                    {lab.name}
                    {lab.notes && <span className="text-[#64748b] italic"> — {lab.notes}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* RADIOLOGY                                                    */}
        {/* ============================================================ */}
        {hasRadiology && (
          <div className="mb-3">
            <div className="text-[12px] font-bold text-[#0f172a] mb-1 flex items-center gap-2">
              <span>أشعة مطلوبة</span>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
            </div>
            <div className="space-y-1">
              {radiology!.map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-[12px]">
                  <span className="text-[#16A34A] font-bold flex-shrink-0" style={{ width: '18px' }}>
                    {toArabicNum(String(i + 1))}.
                  </span>
                  <span className="text-[#334155]">
                    {item.name}
                    {item.notes && <span className="text-[#64748b] italic"> — {item.notes}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Doctor notes (only if opted-in) */}
        {showNotesInPrint && doctorNotes && (
          <div className="mb-3">
            <div className="text-[12px] font-bold text-[#0f172a] mb-1 flex items-center gap-2">
              <span>تعليمات</span>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
            </div>
            <div className="text-[12px] text-[#334155] whitespace-pre-wrap">{doctorNotes}</div>
          </div>
        )}

        {/* Follow-up */}
        {followUpDate && (
          <div className="mb-3 text-[12px]">
            <span className="font-bold text-[#0f172a]">موعد المتابعة: </span>
            <span className="text-[#334155]">{formatDate(followUpDate)}</span>
          </div>
        )}

        {/* ============================================================ */}
        {/* FOOTER — Signature + Stamp                                   */}
        {/* ============================================================ */}
        <div
          className="flex items-end justify-between"
          style={{
            position: 'absolute',
            bottom: '10mm',
            right: '12mm',
            left: '12mm',
            borderTop: '1px solid #e2e8f0',
            paddingTop: '8px',
          }}
        >
          {/* Left: validity note */}
          <div className="text-[10px] text-[#94a3b8]" style={{ maxWidth: '45%' }}>
            <div>الروشتة صالحة لمدة شهر</div>
            <div>من تاريخ الإصدار</div>
          </div>

          {/* Right: Stamp box */}
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '90px',
                height: '70px',
                border: '1px dashed #94a3b8',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>خاتم الطبيب</span>
            </div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', fontWeight: '600' }}>
              {formatDoctorName(doctorName)}
            </div>
          </div>
        </div>

        {/* Ref number — small, top-left corner */}
        <div
          style={{
            position: 'absolute',
            top: '10mm',
            left: '12mm',
            fontSize: '9px',
            color: '#94a3b8',
            fontFamily: 'monospace',
          }}
        >
          #{prescriptionNumber}
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
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }

          @page {
            size: A5 portrait;
            margin: 0;
          }

          [class*="print:hidden"],
          button {
            display: none !important;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  )
}
