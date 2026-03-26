'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, AlertTriangle, ChevronLeft, Play } from 'lucide-react'

// ── Visit type labels ──────────────────────────────────────────────────────

const VISIT_LABEL: Record<string, string> = {
  new:       'كشف جديد',
  followup:  'إعادة كشف',
  emergency: 'طارئ',
}

const VISIT_BADGE: Record<string, { bg: string; text: string }> = {
  new:       { bg: '#EFF6FF', text: '#1D4ED8' },
  followup:  { bg: '#FFFBEB', text: '#B45309' },
  emergency: { bg: '#FEF2F2', text: '#B91C1C' },
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface PatientQuickDrawerProps {
  patientId: string | null
  patientName?: string
  /** Today's appointment context */
  visitType?: 'new' | 'followup' | 'emergency'
  chiefComplaint?: string   // reason / description from appointment
  appointmentTime?: string  // ISO — shown as formatted time
  onClose: () => void
}

interface PatientApiData {
  id: string
  name: string
  phone?: string
  age?: number
  gender?: string
  blood_type?: string
  date_of_birth?: string
  allergies?: string[]
  chronic_conditions?: string[]
}

interface Medication {
  id: string
  name: string
  dosage?: string
  frequency?: string
  duration?: string
  status: string
}

interface Visit {
  id: string
  date: string
  reason: string
  diagnosis?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function calcAge(dob?: string): number | null {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
}

function sexLabel(g?: string) {
  if (!g) return null
  const l = g.toLowerCase()
  if (l === 'male')   return 'ذكر'
  if (l === 'female') return 'أنثى'
  return g
}

function formatTime(iso?: string): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleTimeString('ar-EG', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo',
    })
  } catch { return null }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ar-EG', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo',
    })
  } catch { return iso }
}

// ── Divider ────────────────────────────────────────────────────────────────
function Divider() {
  return <div className="h-[1px] bg-[#F1F5F9] mx-0" />
}

// ── Section heading ────────────────────────────────────────────────────────
function SectionHead({ label }: { label: string }) {
  return (
    <p className="font-cairo text-[10px] font-bold text-[#94A3B8] tracking-widest uppercase mb-2">
      {label}
    </p>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════

export function PatientQuickDrawer({
  patientId,
  patientName,
  visitType,
  chiefComplaint,
  appointmentTime,
  onClose,
}: PatientQuickDrawerProps) {
  const router = useRouter()
  const open = patientId !== null

  const [patient, setPatient]       = useState<PatientApiData | null>(null)
  const [medications, setMedications] = useState<Medication[]>([])
  const [visits, setVisits]         = useState<Visit[]>([])
  const [loading, setLoading]       = useState(false)
  const [failed, setFailed]         = useState(false)

  // Fetch patient data when drawer opens
  const fetchPatient = useCallback(async (id: string) => {
    setLoading(true)
    setFailed(false)
    setPatient(null)
    setMedications([])
    setVisits([])
    try {
      const res = await fetch(`/api/doctor/patients/${id}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setPatient(data.patient || null)
      setMedications((data.medications || []).filter((m: Medication) => m.status === 'active'))
      setVisits(data.visits || [])
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (patientId) fetchPatient(patientId)
  }, [patientId, fetchPatient])

  // Escape key
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  // Derived
  const displayName    = patient?.name || patientName || 'مريض'
  const age            = calcAge(patient?.date_of_birth) ?? patient?.age ?? null
  const sex            = sexLabel(patient?.gender)
  const apptTime       = formatTime(appointmentTime)
  const badge          = visitType ? VISIT_BADGE[visitType] : null
  const visitLabel     = visitType ? VISIT_LABEL[visitType] : null
  const hasAllergies   = (patient?.allergies?.length ?? 0) > 0
  const hasChronic     = (patient?.chronic_conditions?.length ?? 0) > 0
  const lastVisit      = visits[0] ?? null

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-250 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel — slides in from left (RTL = right side of screen) */}
      <div
        className={`fixed top-0 left-0 bottom-0 z-50 w-full max-w-[380px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        dir="rtl"
      >

        {/* ══ HEADER: identity + close ══ */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4">
          <div className="flex-1 min-w-0">
            <h2 className="font-cairo font-bold text-[18px] text-[#0F172A] leading-snug">
              {displayName}
            </h2>
            {/* Age · sex · blood type */}
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {age && <span className="font-cairo text-[12px] text-[#64748B]">{age} سنة</span>}
              {age && sex && <span className="text-[#CBD5E1] text-[10px]">·</span>}
              {sex && <span className="font-cairo text-[12px] text-[#64748B]">{sex}</span>}
              {patient?.blood_type && (age || sex) && <span className="text-[#CBD5E1] text-[10px]">·</span>}
              {patient?.blood_type && (
                <span className="font-cairo text-[12px] font-semibold text-[#DC2626]">{patient.blood_type}</span>
              )}
              {patient?.phone && (
                <>
                  <span className="text-[#CBD5E1] text-[10px]">·</span>
                  <span className="font-cairo text-[12px] text-[#64748B]" dir="ltr">{patient.phone}</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 w-[30px] h-[30px] flex items-center justify-center rounded-[8px] text-[#94A3B8] hover:bg-[#F1F5F9] transition-colors flex-shrink-0"
          >
            <X className="w-[15px] h-[15px]" strokeWidth={2} />
          </button>
        </div>

        {/* ══ TODAY'S VISIT CONTEXT ══ */}
        {(visitLabel || chiefComplaint || apptTime) && (
          <>
            <Divider />
            <div className="px-5 py-4 bg-[#F8FAFC]">
              <SectionHead label="موعد اليوم" />
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  {chiefComplaint ? (
                    <p className="font-cairo font-semibold text-[14px] text-[#0F172A] leading-snug">
                      {chiefComplaint}
                    </p>
                  ) : (
                    <p className="font-cairo text-[13px] text-[#94A3B8]">لم يُحدَّد سبب الزيارة</p>
                  )}
                  {apptTime && (
                    <p className="font-cairo text-[12px] text-[#64748B] mt-1">الموعد: {apptTime}</p>
                  )}
                </div>
                {badge && visitLabel && (
                  <span
                    className="shrink-0 font-cairo text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: badge.bg, color: badge.text }}
                  >
                    {visitLabel}
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {/* ══ SCROLLABLE BODY ══ */}
        <div className="flex-1 overflow-y-auto">

          {loading && (
            <div className="px-5 py-5 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-[60px] bg-[#F8FAFC] rounded-[10px] animate-pulse" />
              ))}
            </div>
          )}

          {failed && !loading && (
            <div className="px-5 py-8 text-center">
              <p className="font-cairo text-[13px] text-[#94A3B8]">تعذّر تحميل البيانات</p>
            </div>
          )}

          {!loading && !failed && (
            <>
              {/* ── ALLERGIES (top priority alert) ── */}
              {hasAllergies && (
                <>
                  <Divider />
                  <div className="px-5 py-4">
                    <div className="flex items-start gap-2.5 bg-[#FEF2F2] border border-[#FECACA] rounded-[10px] px-3 py-3">
                      <AlertTriangle className="w-[15px] h-[15px] text-[#DC2626] flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                      <div>
                        <p className="font-cairo font-bold text-[12px] text-[#991B1B] mb-1.5">حساسية موثّقة</p>
                        <div className="flex flex-wrap gap-1.5">
                          {patient!.allergies!.map((a, i) => (
                            <span key={i} className="font-cairo text-[12px] font-semibold text-[#B91C1C] bg-[#FEE2E2] px-2.5 py-0.5 rounded-full">
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ── CHRONIC CONDITIONS ── */}
              {hasChronic && (
                <>
                  <Divider />
                  <div className="px-5 py-4">
                    <SectionHead label="أمراض مزمنة" />
                    <div className="space-y-1.5">
                      {patient!.chronic_conditions!.map((c, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] flex-shrink-0" />
                          <span className="font-cairo text-[13px] text-[#1E293B]">{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ── CURRENT MEDICATIONS ── */}
              {medications.length > 0 && (
                <>
                  <Divider />
                  <div className="px-5 py-4">
                    <SectionHead label="الأدوية الحالية" />
                    <div className="space-y-3">
                      {medications.slice(0, 5).map((med) => (
                        <div key={med.id} className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] mt-1.5 flex-shrink-0" />
                          <div>
                            <p className="font-cairo font-semibold text-[13px] text-[#0F172A]">{med.name}</p>
                            {(med.dosage || med.frequency) && (
                              <p className="font-cairo text-[11px] text-[#64748B] mt-0.5">
                                {[med.dosage, med.frequency, med.duration].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ── LAST VISIT ── */}
              {lastVisit && (
                <>
                  <Divider />
                  <div className="px-5 py-4">
                    <SectionHead label="آخر زيارة" />
                    <div className="bg-[#F8FAFC] rounded-[10px] px-3 py-3">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-cairo font-semibold text-[13px] text-[#0F172A]">{lastVisit.reason}</p>
                        <span className="font-cairo text-[11px] text-[#94A3B8] shrink-0">{formatDate(lastVisit.date)}</span>
                      </div>
                      {lastVisit.diagnosis && (
                        <p className="font-cairo text-[12px] text-[#475569]">{lastVisit.diagnosis}</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* No medical history at all */}
              {!hasAllergies && !hasChronic && medications.length === 0 && !lastVisit && (
                <>
                  <Divider />
                  <div className="px-5 py-8 text-center">
                    <p className="font-cairo text-[13px] text-[#94A3B8]">
                      لا توجد سجلات طبية سابقة لهذا المريض
                    </p>
                    <p className="font-cairo text-[12px] text-[#CBD5E1] mt-1">
                      ستظهر البيانات بعد الجلسة الأولى
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* ══ FOOTER: two actions ══ */}
        {patientId && (
          <div className="border-t border-[#F1F5F9] px-5 py-4 flex gap-2.5">
            <button
              onClick={() => router.push(`/doctor/session?patientId=${patientId}`)}
              className="flex-1 h-[44px] bg-[#16A34A] text-white rounded-[10px] font-cairo text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-[#15803D] transition-colors"
            >
              <Play className="w-[13px] h-[13px] fill-white stroke-none" />
              بدء الجلسة
            </button>
            <button
              onClick={() => { router.push(`/doctor/patients/${patientId}`); onClose() }}
              className="flex-1 h-[44px] bg-[#F8FAFC] border border-[#E2E8F0] rounded-[10px] font-cairo text-[13px] font-semibold text-[#334155] flex items-center justify-center gap-1.5 hover:bg-[#F1F5F9] transition-colors"
            >
              الملف الكامل
              <ChevronLeft className="w-[13px] h-[13px]" strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
    </>
  )
}
