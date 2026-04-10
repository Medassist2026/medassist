'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Calendar,
  Clock,
  MapPin,
  User,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  Phone,
  Stethoscope,
} from 'lucide-react'
import { PatientHeader } from '@ui-clinic/components/patient/PatientHeader'

// ============================================================================
// TYPES
// ============================================================================

interface Appointment {
  id: string
  start_time: string
  duration_minutes: number
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  doctor_name: string
  doctor_specialty: string
  clinic_name: string
}

// ============================================================================
// ARABIC SPECIALTY TRANSLATION
// ============================================================================

const SPECIALTY_AR: Record<string, string> = {
  'general-practitioner': 'طب عام',
  general: 'طب عام',
  'internal-medicine': 'باطنة',
  pediatrics: 'أطفال',
  cardiology: 'قلب وأوعية دموية',
  endocrinology: 'غدد صماء وسكر',
  dermatology: 'جلدية',
  neurology: 'مخ وأعصاب',
  orthopedics: 'عظام',
  ent: 'أنف وأذن وحنجرة',
  ophthalmology: 'عيون',
  dentistry: 'أسنان',
  psychiatry: 'طب نفسي',
  surgery: 'جراحة',
  'general-surgery': 'جراحة عامة',
  'obstetrics-gynecology': 'نساء وتوليد',
  urology: 'مسالك بولية',
  nephrology: 'كلى',
  pulmonology: 'صدر',
  gastroenterology: 'جهاز هضمي',
}

function toArabicSpecialty(slug?: string) {
  if (!slug) return 'طبيب'
  return SPECIALTY_AR[slug] || SPECIALTY_AR[slug.toLowerCase()] || slug
}

// ============================================================================
// ARABIC DATE & TIME HELPERS
// ============================================================================

function formatArabicDate(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatArabicTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return ''
  }
}

function formatRelativeDay(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const diffDays = Math.round(
      (startOfTarget.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24),
    )
    if (diffDays === 0) return 'اليوم'
    if (diffDays === 1) return 'غداً'
    if (diffDays === -1) return 'أمس'
    if (diffDays > 1 && diffDays <= 7) return `بعد ${diffDays} أيام`
    if (diffDays < -1 && diffDays >= -7) return `منذ ${Math.abs(diffDays)} أيام`
    return ''
  } catch {
    return ''
  }
}

// ============================================================================
// STATUS CONFIG
// ============================================================================

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; border: string; text: string }
> = {
  scheduled: {
    label: 'مجدول',
    bg: '#DBEAFE',
    border: '#93C5FD',
    text: '#1D4ED8',
  },
  completed: {
    label: 'مكتمل',
    bg: '#DCFCE7',
    border: '#86EFAC',
    text: '#15803D',
  },
  cancelled: {
    label: 'ملغي',
    bg: '#FEE2E2',
    border: '#FCA5A5',
    text: '#B91C1C',
  },
  no_show: {
    label: 'لم يحضر',
    bg: '#F3F4F6',
    border: '#D1D5DB',
    text: '#4B5563',
  },
}

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.scheduled
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full font-cairo text-[11px] font-medium border-[0.8px]"
      style={{
        backgroundColor: cfg.bg,
        borderColor: cfg.border,
        color: cfg.text,
      }}
    >
      {cfg.label}
    </span>
  )
}

// ============================================================================
// APPOINTMENT CARD
// ============================================================================

function AppointmentCard({
  appointment,
  highlight = false,
}: {
  appointment: Appointment
  highlight?: boolean
}) {
  const relativeLabel = formatRelativeDay(appointment.start_time)
  const specialty = toArabicSpecialty(appointment.doctor_specialty)

  if (highlight) {
    return (
      <div
        dir="rtl"
        className="rounded-[12px] overflow-hidden shadow-[0px_8px_28px_rgba(45,190,92,0.15)]"
        style={{
          background:
            'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
        }}
      >
        <div className="p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-white" strokeWidth={2} />
              </div>
              <span className="font-cairo text-[13px] font-medium text-white/90">
                موعدك القادم
              </span>
            </div>
            {relativeLabel && (
              <span className="font-cairo text-[11px] font-medium text-white bg-white/20 px-2.5 py-1 rounded-full">
                {relativeLabel}
              </span>
            )}
          </div>

          <h3 className="font-cairo text-[18px] font-bold text-white mb-1">
            د. {appointment.doctor_name}
          </h3>
          <p className="font-cairo text-[13px] text-white/80 mb-4">{specialty}</p>

          <div className="space-y-2">
            <div className="flex items-center gap-2 font-cairo text-[13px] text-white/90">
              <Clock className="w-4 h-4 text-white/80" strokeWidth={1.8} />
              <span>
                {formatArabicDate(appointment.start_time)} —{' '}
                {formatArabicTime(appointment.start_time)}
              </span>
            </div>
            <div className="flex items-center gap-2 font-cairo text-[13px] text-white/90">
              <MapPin className="w-4 h-4 text-white/80" strokeWidth={1.8} />
              <span>{appointment.clinic_name}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      dir="rtl"
      className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-4 hover:border-[#D1D5DB] transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-full bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
            <Stethoscope
              className="w-5 h-5 text-[#16A34A]"
              strokeWidth={1.8}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-cairo text-[15px] font-semibold text-[#030712] truncate">
              د. {appointment.doctor_name}
            </h3>
            <p className="font-cairo text-[12px] text-[#6B7280] truncate">
              {specialty}
            </p>
          </div>
        </div>
        <StatusPill status={appointment.status} />
      </div>

      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-2 font-cairo text-[12px] text-[#4B5563]">
          <Calendar className="w-3.5 h-3.5 text-[#9CA3AF]" strokeWidth={2} />
          <span>{formatArabicDate(appointment.start_time)}</span>
        </div>
        <div className="flex items-center gap-2 font-cairo text-[12px] text-[#4B5563]">
          <Clock className="w-3.5 h-3.5 text-[#9CA3AF]" strokeWidth={2} />
          <span>
            {formatArabicTime(appointment.start_time)} · {appointment.duration_minutes}{' '}
            دقيقة
          </span>
        </div>
        <div className="flex items-center gap-2 font-cairo text-[12px] text-[#4B5563]">
          <MapPin className="w-3.5 h-3.5 text-[#9CA3AF]" strokeWidth={2} />
          <span className="truncate">{appointment.clinic_name}</span>
        </div>
      </div>

      {appointment.status === 'scheduled' && (
        <div className="flex gap-2 pt-3 border-t-[0.8px] border-[#F3F4F6]">
          <button
            type="button"
            className="flex-1 h-[36px] rounded-[10px] border-[0.8px] border-[#E5E7EB] bg-white font-cairo text-[12px] font-medium text-[#4B5563] hover:bg-[#F9FAFB] transition-colors"
          >
            إعادة جدولة
          </button>
          <button
            type="button"
            className="flex-1 h-[36px] rounded-[10px] border-[0.8px] border-[#FECACA] bg-white font-cairo text-[12px] font-medium text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors"
          >
            إلغاء
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SECTION HEADER
// ============================================================================

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-cairo text-[15px] font-semibold text-[#030712]">
        {title}
      </h2>
      {typeof count === 'number' && count > 0 && (
        <span className="font-cairo text-[12px] text-[#6B7280]">{count}</span>
      )}
    </div>
  )
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-32 bg-[#F3F4F6] rounded-[12px]" />
      <div className="h-5 w-32 bg-[#F3F4F6] rounded" />
      <div className="h-28 bg-[#F3F4F6] rounded-[12px]" />
      <div className="h-28 bg-[#F3F4F6] rounded-[12px]" />
    </div>
  )
}

// ============================================================================
// ERROR STATE
// ============================================================================

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      dir="rtl"
      className="bg-white rounded-[12px] border-[0.8px] border-[#FECACA] p-5 text-center"
    >
      <div className="w-12 h-12 rounded-full bg-[#FEE2E2] mx-auto mb-3 flex items-center justify-center">
        <AlertCircle className="w-6 h-6 text-[#B91C1C]" strokeWidth={1.8} />
      </div>
      <h3 className="font-cairo text-[15px] font-semibold text-[#030712] mb-1">
        تعذر تحميل المواعيد
      </h3>
      <p className="font-cairo text-[12px] text-[#6B7280] mb-4">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 h-[40px] px-5 rounded-[10px] border-[0.8px] border-[#E5E7EB] bg-white font-cairo text-[13px] font-medium text-[#030712] hover:bg-[#F9FAFB] transition-colors"
      >
        <RefreshCw className="w-4 h-4" strokeWidth={2} />
        إعادة المحاولة
      </button>
    </div>
  )
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyState() {
  return (
    <div
      dir="rtl"
      className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-8 text-center"
    >
      <div className="w-14 h-14 rounded-full bg-[#F0FDF4] mx-auto mb-4 flex items-center justify-center">
        <Calendar className="w-7 h-7 text-[#16A34A]" strokeWidth={1.8} />
      </div>
      <h3 className="font-cairo text-[15px] font-semibold text-[#030712] mb-1">
        لا توجد مواعيد بعد
      </h3>
      <p className="font-cairo text-[12px] text-[#6B7280] mb-5">
        ليس لديك أي مواعيد مجدولة حالياً. تواصل مع العيادة لحجز موعد جديد.
      </p>
      <Link
        href="/patient/dashboard"
        className="inline-flex items-center gap-2 h-[44px] px-6 rounded-[10px] bg-[#16A34A] font-cairo text-[13px] font-semibold text-white hover:bg-[#15803D] transition-colors shadow-[0px_6px_24px_rgba(45,190,92,0.3)]"
      >
        <ChevronLeft className="w-4 h-4" strokeWidth={2} />
        العودة للرئيسية
      </Link>
    </div>
  )
}

// ============================================================================
// FILTER TABS
// ============================================================================

type FilterTab = 'all' | 'upcoming' | 'past'

function FilterTabs({
  active,
  onChange,
  counts,
}: {
  active: FilterTab
  onChange: (tab: FilterTab) => void
  counts: { all: number; upcoming: number; past: number }
}) {
  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'الكل', count: counts.all },
    { key: 'upcoming', label: 'القادمة', count: counts.upcoming },
    { key: 'past', label: 'السابقة', count: counts.past },
  ]

  return (
    <div
      dir="rtl"
      className="flex gap-1.5 p-1 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB]"
    >
      {tabs.map((tab) => {
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`flex-1 h-[38px] rounded-[10px] font-cairo text-[12px] font-medium transition-all ${
              isActive
                ? 'bg-[#16A34A] text-white shadow-[0px_4px_12px_-2px_rgba(45,190,92,0.25)]'
                : 'bg-transparent text-[#6B7280] hover:bg-[#F9FAFB]'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`mr-1 text-[10px] ${
                  isActive ? 'text-white/80' : 'text-[#9CA3AF]'
                }`}
              >
                ({tab.count})
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterTab>('upcoming')

  const loadAppointments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/patient/appointments')
      if (!res.ok) throw new Error('Failed to load appointments')
      const data = await res.json()
      setAppointments(data.appointments || [])
    } catch (err) {
      console.error('Error loading appointments:', err)
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAppointments()
  }, [loadAppointments])

  // Separate into upcoming / past
  const now = new Date()
  const upcoming = appointments
    .filter(
      (apt) =>
        new Date(apt.start_time) >= now && apt.status === 'scheduled',
    )
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    )
  const past = appointments
    .filter(
      (apt) =>
        new Date(apt.start_time) < now || apt.status !== 'scheduled',
    )
    .sort(
      (a, b) =>
        new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
    )

  const nextUp = upcoming[0]
  const counts = {
    all: appointments.length,
    upcoming: upcoming.length,
    past: past.length,
  }

  const filtered: Appointment[] =
    filter === 'all'
      ? [...upcoming, ...past]
      : filter === 'upcoming'
      ? upcoming
      : past

  // Skip hero from list if we show it above
  const listItems =
    filter === 'upcoming' && nextUp
      ? filtered.filter((a) => a.id !== nextUp.id)
      : filtered

  return (
    <>
      <PatientHeader title="مواعيدي" />
      <div dir="rtl" className="px-4 py-5 space-y-5">
        {/* Intro */}
        <div>
          <h2 className="font-cairo text-[20px] font-bold text-[#030712] leading-tight">
            مواعيدك الطبية
          </h2>
          <p className="font-cairo text-[13px] text-[#6B7280] mt-1">
            عرض وإدارة زياراتك القادمة والسابقة
          </p>
        </div>

        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={loadAppointments} />
        ) : appointments.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Filter tabs */}
            <FilterTabs active={filter} onChange={setFilter} counts={counts} />

            {/* Next appointment hero (only on "upcoming" tab) */}
            {filter === 'upcoming' && nextUp && (
              <AppointmentCard appointment={nextUp} highlight />
            )}

            {/* List */}
            {listItems.length > 0 ? (
              <div className="space-y-3">
                <SectionHeader
                  title={
                    filter === 'all'
                      ? 'كل المواعيد'
                      : filter === 'upcoming'
                      ? 'باقي المواعيد القادمة'
                      : 'المواعيد السابقة'
                  }
                  count={listItems.length}
                />
                {listItems.map((apt) => (
                  <AppointmentCard key={apt.id} appointment={apt} />
                ))}
              </div>
            ) : filter === 'upcoming' && nextUp ? null : (
              <div
                className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-6 text-center"
              >
                <p className="font-cairo text-[13px] text-[#6B7280]">
                  {filter === 'upcoming'
                    ? 'لا توجد مواعيد قادمة'
                    : filter === 'past'
                    ? 'لا توجد مواعيد سابقة'
                    : 'لا توجد مواعيد'}
                </p>
              </div>
            )}

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/patient/dashboard"
                className="flex flex-col items-center gap-2 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-4 hover:border-[#16A34A] transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-[#F0FDF4] flex items-center justify-center">
                  <User className="w-5 h-5 text-[#16A34A]" strokeWidth={1.8} />
                </div>
                <span className="font-cairo text-[12px] font-medium text-[#030712]">
                  الرئيسية
                </span>
              </Link>
              <Link
                href="/patient/messages"
                className="flex flex-col items-center gap-2 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-4 hover:border-[#16A34A] transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-[#F0FDF4] flex items-center justify-center">
                  <Phone className="w-5 h-5 text-[#16A34A]" strokeWidth={1.8} />
                </div>
                <span className="font-cairo text-[12px] font-medium text-[#030712]">
                  مراسلة العيادة
                </span>
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  )
}
