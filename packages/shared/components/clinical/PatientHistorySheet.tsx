'use client'

import { useState, useEffect } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface VisitRecord {
  id: string
  date: string
  chiefComplaint?: string
  medications: Array<{ name: string; frequency?: string }>
  labs: Array<{ name: string }>
  doctorNotes?: string
}

interface PatientHistorySheetProps {
  patientId: string
  patientName: string
  onClose: () => void
}

// ============================================================================
// PATIENT HISTORY BOTTOM SHEET (80% height, read-only timeline)
// ============================================================================

export function PatientHistorySheet({ patientId, patientName, onClose }: PatientHistorySheetProps) {
  const [visits, setVisits] = useState<VisitRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`/api/doctor/patients/${patientId}`)
        if (res.ok) {
          const data = await res.json()
          // API returns visits at root level — not nested inside data.patient
          const visitsList = data.visits || data.patient?.visits
          if (visitsList && visitsList.length > 0) {
            setVisits(visitsList.map((v: any) => ({
              id: v.id,
              date: v.created_at || v.date,
              chiefComplaint: Array.isArray(v.chief_complaint)
                ? v.chief_complaint.join('، ')
                : (v.chief_complaint || v.chiefComplaint || v.reason || ''),
              medications: v.medications || [],
              labs: v.labs || [],
              doctorNotes: v.plan || v.notes || v.doctorNotes || '',
            })))
          }
        }
      } catch { /* ignore */ }
      finally { setLoading(false) }
    }
    loadHistory()
  }, [patientId])

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Bottom sheet — 80% height */}
      <div className="absolute bottom-0 left-0 right-0 h-[80vh] bg-white rounded-t-[20px] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-[#E5E7EB]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E5E7EB]">
          <h3 className="font-cairo font-bold text-[16px] text-[#030712]">ملف المريض</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center">
            <svg className="w-4 h-4 text-[#4B5563]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Patient summary */}
        <div className="px-5 py-3 bg-[#F9FAFB] border-b border-[#E5E7EB]">
          <div className="font-cairo font-bold text-[14px] text-[#030712]">{patientName}</div>
        </div>

        {/* Visit timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && (
            <div className="py-12 text-center">
              <p className="font-cairo text-[14px] text-[#4B5563]">جاري التحميل...</p>
            </div>
          )}

          {!loading && visits.length === 0 && (
            <div className="py-12 text-center">
              <p className="font-cairo text-[14px] text-[#4B5563]">لا توجد زيارات سابقة</p>
            </div>
          )}

          {visits.map((visit, i) => (
            <div key={visit.id || i} className="border border-[#E5E7EB] rounded-[12px] overflow-hidden">
              {/* Visit header */}
              <div className="px-4 py-3 bg-[#F9FAFB] border-b border-[#E5E7EB] flex items-center justify-between">
                <div className="font-cairo text-[13px] font-semibold text-[#030712]">
                  {visit.date ? new Date(visit.date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : 'بدون تاريخ'}
                </div>
                {visit.chiefComplaint && (
                  <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#16A34A] text-[11px] font-cairo font-medium rounded-full">
                    {visit.chiefComplaint}
                  </span>
                )}
              </div>

              <div className="p-4 space-y-3">
                {/* Medications */}
                {visit.medications.length > 0 && (
                  <div>
                    <label className="font-cairo text-[11px] font-semibold text-[#4B5563] mb-1 block">الأدوية</label>
                    <div className="flex flex-wrap gap-1">
                      {visit.medications.map((m, j) => (
                        <span key={j} className="px-2 py-0.5 bg-[#F3F4F6] text-[#030712] text-[11px] font-cairo rounded-full border border-[#E5E7EB]">
                          {m.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Labs */}
                {visit.labs.length > 0 && (
                  <div>
                    <label className="font-cairo text-[11px] font-semibold text-[#4B5563] mb-1 block">التحاليل</label>
                    <div className="flex flex-wrap gap-1">
                      {visit.labs.map((l, j) => (
                        <span key={j} className="px-2 py-0.5 bg-[#E0F2FE] text-[#0369A1] text-[11px] font-cairo rounded-full border border-[#BAE6FD]">
                          {l.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {visit.doctorNotes && (
                  <div>
                    <label className="font-cairo text-[11px] font-semibold text-[#4B5563] mb-1 block">ملاحظات</label>
                    <p className="font-cairo text-[12px] text-[#4B5563] leading-relaxed">{visit.doctorNotes}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
