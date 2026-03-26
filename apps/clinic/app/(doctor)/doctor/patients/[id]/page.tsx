'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowRight,
  Play,
  AlertTriangle,
  Phone,
  User,
  Droplets,
  Calendar,
  Pill,
  FileText,
  Activity,
  ChevronRight,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface PatientData {
  id: string
  name: string
  phone: string
  email?: string
  date_of_birth?: string
  gender?: string
  national_id?: string
  blood_type?: string
  created_at: string
  allergies?: string[]
  chronic_conditions?: string[]
}

interface Medication {
  id: string
  name: string
  dosage?: string
  frequency?: string
  duration?: string
  instructions?: string
  start_date: string
  status: string
  prescribed_by?: string
}

interface Visit {
  id: string
  date: string
  reason: string
  diagnosis?: string
  notes?: string
}

interface ApiResponse {
  patient: PatientData
  medications: Medication[]
  visits: Visit[]
}

// ============================================================================
// HELPERS
// ============================================================================

function sexLabel(gender?: string): string | null {
  if (!gender) return null
  const g = gender.toLowerCase()
  if (g === 'male' || g === 'ذكر') return 'ذكر'
  if (g === 'female' || g === 'أنثى') return 'أنثى'
  return gender
}

function calcAge(dob?: string): number | null {
  if (!dob) return null
  const diff = Date.now() - new Date(dob).getTime()
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ar-EG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Africa/Cairo',
    })
  } catch {
    return iso
  }
}

// ============================================================================
// SKELETON — shown immediately while data loads
// ============================================================================

function PageSkeleton() {
  return (
    <div dir="rtl" className="min-h-screen bg-[#F8FAFC]">
      {/* Header skeleton */}
      <div className="bg-white border-b border-[#F1F5F9] px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#F1F5F9] rounded-lg animate-pulse" />
            <div>
              <div className="w-32 h-5 bg-[#F1F5F9] rounded animate-pulse mb-1.5" />
              <div className="w-24 h-4 bg-[#F1F5F9] rounded animate-pulse" />
            </div>
          </div>
          <div className="w-28 h-10 bg-[#F1F5F9] rounded-[10px] animate-pulse" />
        </div>
      </div>
      {/* Content skeleton */}
      <div className="px-4 py-5 space-y-4">
        <div className="h-[100px] bg-white rounded-[12px] border border-[#F1F5F9] animate-pulse" />
        <div className="h-[80px] bg-white rounded-[12px] border border-[#F1F5F9] animate-pulse" />
        <div className="h-[160px] bg-white rounded-[12px] border border-[#F1F5F9] animate-pulse" />
      </div>
    </div>
  )
}

// ============================================================================
// TABS
// ============================================================================

type TabId = 'overview' | 'visits' | 'medications'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',     label: 'نظرة عامة' },
  { id: 'visits',       label: 'سجل الزيارات' },
  { id: 'medications',  label: 'الأدوية' },
]

// ============================================================================
// OVERVIEW TAB
// ============================================================================

function OverviewTab({
  patient,
  medications,
}: {
  patient: PatientData
  medications: Medication[]
}) {
  const age = calcAge(patient.date_of_birth)
  const sex = sexLabel(patient.gender)
  const activeMeds = medications.filter(m => m.status === 'active').slice(0, 3)
  const hasAllergies = (patient.allergies?.length ?? 0) > 0
  const hasChronic  = (patient.chronic_conditions?.length ?? 0) > 0

  return (
    <div className="space-y-4">

      {/* ── Allergy warning (top priority) ── */}
      {hasAllergies && (
        <div className="flex items-start gap-3 bg-[#FEF2F2] border border-[#FECACA] rounded-[12px] px-4 py-3">
          <AlertTriangle className="w-[18px] h-[18px] text-[#DC2626] flex-shrink-0 mt-0.5" strokeWidth={2} />
          <div>
            <p className="font-cairo font-bold text-[13px] text-[#991B1B] mb-1">حساسية موثّقة</p>
            <div className="flex flex-wrap gap-1.5">
              {patient.allergies!.map((a, i) => (
                <span key={i} className="font-cairo text-[12px] font-semibold text-[#B91C1C] bg-[#FEE2E2] px-2 py-0.5 rounded-full">
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Basic info ── */}
      <div className="bg-white rounded-[12px] border border-[#E2E8F0] divide-y divide-[#F8FAFC]">
        <div className="px-4 py-3">
          <p className="font-cairo font-bold text-[13px] text-[#0F172A] mb-3">المعلومات الأساسية</p>
          <div className="grid grid-cols-2 gap-y-3 gap-x-4">
            <InfoRow icon={<Phone className="w-[13px] h-[13px]" />} label="الهاتف" value={patient.phone || '—'} ltr />
            <InfoRow icon={<User className="w-[13px] h-[13px]" />} label="الجنس" value={sex || '—'} />
            <InfoRow icon={<Activity className="w-[13px] h-[13px]" />} label="العمر" value={age ? `${age} سنة` : '—'} />
            <InfoRow icon={<Droplets className="w-[13px] h-[13px]" />} label="فصيلة الدم" value={patient.blood_type || '—'} />
          </div>
        </div>
      </div>

      {/* ── Chronic conditions ── */}
      {hasChronic && (
        <div className="bg-white rounded-[12px] border border-[#E2E8F0] px-4 py-3">
          <p className="font-cairo font-bold text-[13px] text-[#0F172A] mb-3">الأمراض المزمنة</p>
          <div className="space-y-1.5">
            {patient.chronic_conditions!.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] flex-shrink-0" />
                <span className="font-cairo text-[13px] text-[#1E293B]">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent medications ── */}
      <div className="bg-white rounded-[12px] border border-[#E2E8F0] px-4 py-3">
        <p className="font-cairo font-bold text-[13px] text-[#0F172A] mb-3">الأدوية الحالية</p>
        {activeMeds.length === 0 ? (
          <p className="font-cairo text-[13px] text-[#94A3B8]">لا توجد أدوية نشطة</p>
        ) : (
          <div className="space-y-3">
            {activeMeds.map(med => (
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
        )}
      </div>

    </div>
  )
}

function InfoRow({
  icon, label, value, ltr,
}: {
  icon: React.ReactNode
  label: string
  value: string
  ltr?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[#94A3B8]">{icon}</span>
        <span className="font-cairo text-[11px] text-[#94A3B8]">{label}</span>
      </div>
      <p
        className="font-cairo text-[13px] font-semibold text-[#0F172A]"
        dir={ltr ? 'ltr' : undefined}
      >
        {value}
      </p>
    </div>
  )
}

// ============================================================================
// VISITS TAB
// ============================================================================

function VisitsTab({ visits }: { visits: Visit[] }) {
  if (visits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="w-[32px] h-[32px] text-[#CBD5E1] mb-3" strokeWidth={1.5} />
        <p className="font-cairo text-[14px] text-[#94A3B8]">لا يوجد سجل زيارات</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {visits.map((visit) => (
        <div
          key={visit.id}
          className="bg-white rounded-[12px] border border-[#E2E8F0] px-4 py-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-cairo font-bold text-[13px] text-[#0F172A] mb-1">{visit.reason}</p>
              {visit.diagnosis && (
                <p className="font-cairo text-[12px] text-[#475569]">{visit.diagnosis}</p>
              )}
            </div>
            <span className="shrink-0 font-cairo text-[11px] text-[#94A3B8]">
              {formatDate(visit.date)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// MEDICATIONS TAB
// ============================================================================

function MedicationsTab({ medications }: { medications: Medication[] }) {
  const active  = medications.filter(m => m.status === 'active')
  const past    = medications.filter(m => m.status !== 'active')

  if (medications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Pill className="w-[32px] h-[32px] text-[#CBD5E1] mb-3" strokeWidth={1.5} />
        <p className="font-cairo text-[14px] text-[#94A3B8]">لا توجد أدوية مسجّلة</p>
      </div>
    )
  }

  function MedCard({ med }: { med: Medication }) {
    return (
      <div className="bg-white rounded-[12px] border border-[#E2E8F0] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="font-cairo font-bold text-[13px] text-[#0F172A]">{med.name}</p>
            {(med.dosage || med.frequency) && (
              <p className="font-cairo text-[12px] text-[#64748B] mt-0.5">
                {[med.dosage, med.frequency, med.duration].filter(Boolean).join(' · ')}
              </p>
            )}
            {med.instructions && (
              <p className="font-cairo text-[11px] text-[#94A3B8] mt-0.5">{med.instructions}</p>
            )}
          </div>
          <span className={`shrink-0 font-cairo text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            med.status === 'active'
              ? 'bg-[#F0FDF4] text-[#15803D]'
              : 'bg-[#F1F5F9] text-[#64748B]'
          }`}>
            {med.status === 'active' ? 'نشط' : 'منتهي'}
          </span>
        </div>
        <p className="font-cairo text-[11px] text-[#CBD5E1] mt-2">
          بدأ {formatDate(med.start_date)}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {active.length > 0 && (
        <div>
          <p className="font-cairo text-[11px] font-bold text-[#94A3B8] uppercase tracking-widest mb-3">نشطة</p>
          <div className="space-y-2.5">
            {active.map(m => <MedCard key={m.id} med={m} />)}
          </div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <p className="font-cairo text-[11px] font-bold text-[#94A3B8] uppercase tracking-widest mb-3">سابقة</p>
          <div className="space-y-2.5">
            {past.map(m => <MedCard key={m.id} med={m} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function PatientDetailsPage() {
  const params  = useParams()
  const router  = useRouter()
  const patientId = params?.id as string

  const [data, setData]         = useState<ApiResponse | null>(null)
  const [loading, setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  useEffect(() => {
    fetch(`/api/doctor/patients/${patientId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [patientId])

  // Show skeleton immediately — no full-page spinner
  if (loading) return <PageSkeleton />

  if (!data?.patient) {
    return (
      <div dir="rtl" className="flex items-center justify-center min-h-screen">
        <p className="font-cairo text-[14px] text-[#94A3B8]">لم يتم العثور على المريض</p>
      </div>
    )
  }

  const { patient, medications = [], visits = [] } = data
  const age = calcAge(patient.date_of_birth)
  const sex = sexLabel(patient.gender)
  const hasAllergies = (patient.allergies?.length ?? 0) > 0

  return (
    <div dir="rtl" className="min-h-screen bg-[#F8FAFC]">

      {/* ══ Header ══ */}
      <div className="bg-white border-b border-[#F1F5F9] sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3 gap-3">

          {/* Back + patient identity */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.back()}
              className="w-[36px] h-[36px] flex items-center justify-center rounded-[8px] hover:bg-[#F1F5F9] transition-colors flex-shrink-0"
            >
              <ChevronRight className="w-[18px] h-[18px] text-[#475569]" strokeWidth={2} />
            </button>
            <div className="min-w-0">
              <h1 className="font-cairo font-bold text-[16px] text-[#0F172A] leading-snug truncate">
                {patient.name}
              </h1>
              <div className="flex items-center gap-1.5 text-[#94A3B8]">
                {age && <span className="font-cairo text-[12px]">{age} سنة</span>}
                {age && sex && <span className="text-[11px]">·</span>}
                {sex && <span className="font-cairo text-[12px]">{sex}</span>}
                {(age || sex) && patient.phone && <span className="text-[11px]">·</span>}
                {patient.phone && (
                  <span className="font-cairo text-[12px]" dir="ltr">{patient.phone}</span>
                )}
              </div>
            </div>
          </div>

          {/* Start session */}
          <button
            onClick={() => router.push(`/doctor/session?patientId=${patient.id}`)}
            className="shrink-0 flex items-center gap-1.5 h-[38px] px-4 bg-[#16A34A] text-white rounded-[10px] font-cairo text-[13px] font-semibold hover:bg-[#15803D] transition-colors"
          >
            <Play className="w-[13px] h-[13px] fill-white stroke-none" />
            بدء الجلسة
          </button>
        </div>

        {/* Allergy strip — always visible in header if allergies exist */}
        {hasAllergies && (
          <div className="flex items-center gap-2 bg-[#FEF2F2] border-t border-[#FECACA] px-4 py-2">
            <AlertTriangle className="w-[13px] h-[13px] text-[#DC2626] flex-shrink-0" strokeWidth={2.5} />
            <p className="font-cairo text-[12px] font-semibold text-[#B91C1C]">
              حساسية: {patient.allergies!.join('، ')}
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-t border-[#F1F5F9]">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 font-cairo text-[13px] font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#16A34A] text-[#15803D]'
                  : 'border-transparent text-[#94A3B8] hover:text-[#475569]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══ Tab content ══ */}
      <div className="px-4 py-4">
        {activeTab === 'overview' && (
          <OverviewTab patient={patient} medications={medications} />
        )}
        {activeTab === 'visits' && (
          <VisitsTab visits={visits} />
        )}
        {activeTab === 'medications' && (
          <MedicationsTab medications={medications} />
        )}
        <div className="h-8" />
      </div>

    </div>
  )
}
