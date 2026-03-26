'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, Phone, User, Calendar, Pill, AlertCircle, ChevronLeft } from 'lucide-react'

interface PatientQuickDrawerProps {
  patientId: string | null
  patientName?: string
  onClose: () => void
}

interface PatientData {
  id: string
  full_name?: string
  phone?: string
  age?: number
  sex?: string
  blood_type?: string
  allergies?: string[]
  chronic_diseases?: string[]
  visits?: Array<{
    id: string
    date: string
    reason: string
    diagnosis: string
  }>
  medications?: Array<{
    id: string
    name: string
    dosage?: string
    frequency?: string
    duration?: string
  }>
}

/** Arabic month/day short format */
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ar-EG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Africa/Cairo',
    })
  } catch {
    return ''
  }
}

function sexLabel(sex?: string) {
  if (sex === 'male' || sex === 'Male') return 'ذكر'
  if (sex === 'female' || sex === 'Female') return 'أنثى'
  return sex || '—'
}

export function PatientQuickDrawer({ patientId, patientName, onClose }: PatientQuickDrawerProps) {
  const router = useRouter()
  const [patient, setPatient] = useState<PatientData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const open = patientId !== null

  const fetchPatient = useCallback(async (id: string) => {
    setLoading(true)
    setError(false)
    setPatient(null)
    try {
      const res = await fetch(`/api/doctor/patients/${id}`)
      if (!res.ok) throw new Error('not found')
      const data = await res.json()
      setPatient(data.patient || data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (patientId) fetchPatient(patientId)
  }, [patientId, fetchPatient])

  // Trap Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const displayName = patient?.full_name || patientName || 'مريض'
  const lastVisit = patient?.visits?.[0]
  const meds = patient?.medications?.slice(0, 4) || []

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* ── Drawer panel (slides in from left in RTL — which is the right side visually) ── */}
      <div
        className={`fixed top-0 left-0 bottom-0 z-50 w-full max-w-[400px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F3F4F6] bg-white sticky top-0">
          <div className="flex items-center gap-3">
            <div className="w-[38px] h-[38px] rounded-full bg-[#F1F5F9] flex items-center justify-center">
              <User className="w-[18px] h-[18px] text-[#64748B]" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="font-cairo font-bold text-[15px] text-[#0F172A]">{displayName}</h2>
              {patient?.age && (
                <p className="font-cairo text-[12px] text-[#64748B]">
                  {patient.age} سنة{patient.sex ? ` · ${sexLabel(patient.sex)}` : ''}
                  {patient.blood_type ? ` · ${patient.blood_type}` : ''}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-[32px] h-[32px] rounded-lg flex items-center justify-center hover:bg-[#F1F5F9] transition-colors text-[#94A3B8]"
          >
            <X className="w-[16px] h-[16px]" strokeWidth={2} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-[72px] bg-[#F8FAFC] rounded-[12px] animate-pulse" />
              ))}
            </div>
          )}

          {error && !loading && (
            <div className="p-6 flex flex-col items-center gap-3 text-center">
              <AlertCircle className="w-[32px] h-[32px] text-[#CBD5E1]" strokeWidth={1.5} />
              <p className="font-cairo text-[14px] text-[#94A3B8]">تعذّر تحميل بيانات المريض</p>
            </div>
          )}

          {patient && !loading && (
            <div className="divide-y divide-[#F1F5F9]">

              {/* Contact */}
              {patient.phone && (
                <div className="px-5 py-4 flex items-center gap-3">
                  <div className="w-[34px] h-[34px] rounded-lg bg-[#F1F5F9] flex items-center justify-center flex-shrink-0">
                    <Phone className="w-[15px] h-[15px] text-[#475569]" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="font-cairo text-[11px] text-[#94A3B8] mb-0.5">رقم الهاتف</p>
                    <p className="font-cairo text-[14px] font-semibold text-[#0F172A]" dir="ltr">{patient.phone}</p>
                  </div>
                </div>
              )}

              {/* Chronic diseases */}
              {(patient.chronic_diseases?.length ?? 0) > 0 && (
                <div className="px-5 py-4">
                  <p className="font-cairo text-[11px] text-[#94A3B8] mb-2">أمراض مزمنة</p>
                  <div className="flex flex-wrap gap-1.5">
                    {patient.chronic_diseases!.map((d, i) => (
                      <span key={i} className="px-2.5 py-1 bg-[#FEF3C7] text-[#92400E] font-cairo text-[12px] font-medium rounded-full">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Allergies */}
              {(patient.allergies?.length ?? 0) > 0 && (
                <div className="px-5 py-4">
                  <p className="font-cairo text-[11px] text-[#94A3B8] mb-2">حساسية</p>
                  <div className="flex flex-wrap gap-1.5">
                    {patient.allergies!.map((a, i) => (
                      <span key={i} className="px-2.5 py-1 bg-[#FEE2E2] text-[#991B1B] font-cairo text-[12px] font-medium rounded-full">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Last visit */}
              {lastVisit && (
                <div className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="w-[13px] h-[13px] text-[#94A3B8]" strokeWidth={1.5} />
                    <p className="font-cairo text-[11px] text-[#94A3B8]">آخر زيارة</p>
                  </div>
                  <div className="bg-[#F8FAFC] rounded-[10px] p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-cairo text-[13px] font-semibold text-[#1E293B]">{lastVisit.reason}</p>
                      <span className="font-cairo text-[11px] text-[#94A3B8]">{formatDate(lastVisit.date)}</span>
                    </div>
                    {lastVisit.diagnosis && (
                      <p className="font-cairo text-[12px] text-[#475569]">{lastVisit.diagnosis}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Current medications */}
              {meds.length > 0 && (
                <div className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Pill className="w-[13px] h-[13px] text-[#94A3B8]" strokeWidth={1.5} />
                    <p className="font-cairo text-[11px] text-[#94A3B8]">الأدوية الحالية</p>
                  </div>
                  <div className="space-y-2">
                    {meds.map((med) => (
                      <div key={med.id} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="font-cairo text-[13px] font-semibold text-[#1E293B]">{med.name}</p>
                          {(med.dosage || med.frequency) && (
                            <p className="font-cairo text-[11px] text-[#94A3B8]">
                              {[med.dosage, med.frequency, med.duration].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No history */}
              {!lastVisit && meds.length === 0 && !loading && (
                <div className="px-5 py-8 text-center">
                  <p className="font-cairo text-[13px] text-[#94A3B8]">لا توجد سجلات سابقة لهذا المريض</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — go to full profile */}
        {patientId && (
          <div className="px-5 py-4 border-t border-[#F1F5F9] bg-white">
            <button
              onClick={() => { router.push(`/doctor/patients/${patientId}`); onClose() }}
              className="w-full h-[44px] bg-[#F8FAFC] border border-[#E2E8F0] rounded-[10px] flex items-center justify-center gap-2 font-cairo text-[13px] font-semibold text-[#334155] hover:bg-[#F1F5F9] transition-colors"
            >
              <span>عرض الملف الكامل</span>
              <ChevronLeft className="w-[14px] h-[14px]" strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
    </>
  )
}
