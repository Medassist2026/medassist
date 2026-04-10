'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Calendar,
  HeartPulse,
  MessageCircle,
  Pill,
  FlaskConical,
  FileText,
  ChevronLeft,
  RefreshCw,
} from 'lucide-react'
import { PatientHeader } from '@ui-clinic/components/patient/PatientHeader'
import { ar } from '@shared/lib/i18n/ar'

// ============================================================================
// TYPES — mirror the /api/patient/health-summary response
// ============================================================================

interface HealthSummary {
  medications: {
    active: number
    pending: number
    total: number
    recent: Array<{ id: string; name: string; dosage: string; status: string }>
  }
  labs: {
    total: number
    abnormal: number
    recent: Array<{ id: string; name: string; date: string; status: string }>
  }
  visits: {
    total: number
    recent: Array<{ id: string; doctor_name: string; date: string; reason: string }>
  }
  vitals: {
    lastUpdated?: string
    blood_pressure?: string
    heart_rate?: number
    weight?: number
    height?: number
  }
  conditions: Array<{ id: string; name: string; diagnosed_date: string; status: string }>
}

interface Appointment {
  id: string
  start_time: string
  status: string
  doctor_name: string
  doctor_specialty: string
  clinic_name: string
}

// ============================================================================
// ARABIC SPECIALTY TRANSLATION (subset)
// ============================================================================

const SPECIALTY_AR: Record<string, string> = {
  'general-practitioner': 'طب عام',
  general: 'طب عام',
  'internal-medicine': 'باطنة',
  pediatrics: 'أطفال',
  cardiology: 'قلب',
  dermatology: 'جلدية',
  neurology: 'مخ وأعصاب',
  orthopedics: 'عظام',
  ent: 'أنف وأذن وحنجرة',
  ophthalmology: 'عيون',
  dentistry: 'أسنان',
  psychiatry: 'نفسية',
  surgery: 'جراحة',
}

function toArabicSpecialty(slug?: string) {
  if (!slug) return 'طبيب'
  return SPECIALTY_AR[slug] || SPECIALTY_AR[slug.toLowerCase()] || slug
}

// ============================================================================
// HELPERS
// ============================================================================

function formatArabicDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ar-EG', {
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
    return new Date(iso).toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'صباح الخير'
  if (hour < 18) return 'مساء الخير'
  return 'مساء النور'
}

// ============================================================================
// DASHBOARD PAGE
// ============================================================================

export default function PatientDashboardPage() {
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [upcomingAppointment, setUpcomingAppointment] = useState<Appointment | null>(null)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const loadDashboard = useCallback(async () => {
    setLoadError('')
    try {
      const [summaryRes, appointmentsRes, unreadRes] = await Promise.all([
        fetch('/api/patient/health-summary'),
        fetch('/api/patient/appointments'),
        fetch('/api/patient/messages/unread-count'),
      ])

      if (!summaryRes.ok) throw new Error('summary')
      const summaryJson = await summaryRes.json()
      setSummary(summaryJson.summary || null)

      if (appointmentsRes.ok) {
        const { appointments = [] } = await appointmentsRes.json()
        const now = Date.now()
        const upcoming = appointments
          .filter(
            (a: Appointment) =>
              new Date(a.start_time).getTime() > now &&
              (a.status === 'scheduled' || a.status === 'confirmed')
          )
          .sort(
            (a: Appointment, b: Appointment) =>
              new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
          )[0]
        setUpcomingAppointment(upcoming || null)
      }

      if (unreadRes.ok) {
        const { total_unread = 0 } = await unreadRes.json()
        setUnreadMessages(total_unread)
      }
    } catch (err) {
      setLoadError('فشل تحميل لوحة التحكم، تحقق من الاتصال بالإنترنت')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  // ==========================================================================
  // DERIVED DATA
  // ==========================================================================

  const activeMedsCount = summary?.medications.active ?? 0
  const pendingMedsCount = summary?.medications.pending ?? 0
  const abnormalLabsCount = summary?.labs.abnormal ?? 0
  const pendingActionsCount = pendingMedsCount + abnormalLabsCount + unreadMessages

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="font-cairo">
      <PatientHeader title="MedAssist" />

      <div className="px-4 pt-4 pb-8">
        {/* Greeting */}
        <div className="mb-5">
          <p className="font-cairo text-[13px] text-[#6B7280]">{getGreeting()}</p>
          <h1 className="font-cairo text-[22px] leading-[28px] font-bold text-[#030712]">
            كيف تشعر اليوم؟
          </h1>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4">
            <div className="h-24 bg-[#E5E7EB] rounded-[12px] animate-pulse" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-28 bg-[#E5E7EB] rounded-[12px] animate-pulse" />
              <div className="h-28 bg-[#E5E7EB] rounded-[12px] animate-pulse" />
              <div className="h-28 bg-[#E5E7EB] rounded-[12px] animate-pulse" />
              <div className="h-28 bg-[#E5E7EB] rounded-[12px] animate-pulse" />
            </div>
            <div className="h-48 bg-[#E5E7EB] rounded-[12px] animate-pulse" />
          </div>
        )}

        {/* Error + retry */}
        {!loading && loadError && (
          <div className="text-center py-12 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB]">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <p className="font-cairo text-[14px] text-red-700 mb-3 px-4">{loadError}</p>
            <button
              onClick={() => {
                setLoading(true)
                loadDashboard()
              }}
              className="inline-flex items-center gap-2 h-[44px] px-5 bg-[#16A34A] hover:bg-[#15803D] text-white font-cairo text-[14px] font-semibold rounded-[12px] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Content */}
        {!loading && !loadError && (
          <>
            {/* Upcoming appointment hero */}
            {upcomingAppointment ? (
              <Link
                href="/patient/appointments"
                className="block bg-gradient-to-br from-[#16A34A] to-[#15803D] rounded-[12px] p-5 mb-5 text-white shadow-green-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-cairo text-[12px] opacity-80 mb-1">موعدك القادم</p>
                    <h2 className="font-cairo text-[18px] font-bold mb-1 truncate">
                      د. {upcomingAppointment.doctor_name}
                    </h2>
                    <p className="font-cairo text-[12px] opacity-90 mb-3">
                      {toArabicSpecialty(upcomingAppointment.doctor_specialty)}
                    </p>
                    <div className="flex items-center gap-3 text-[12px] font-cairo">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatArabicDate(upcomingAppointment.start_time)}
                      </span>
                      <span>{formatArabicTime(upcomingAppointment.start_time)}</span>
                    </div>
                  </div>
                  <ChevronLeft className="w-5 h-5 flex-shrink-0" />
                </div>
              </Link>
            ) : (
              <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-5 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-[#16A34A]" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-cairo text-[14px] font-semibold text-[#030712]">
                      لا توجد مواعيد قادمة
                    </p>
                    <p className="font-cairo text-[12px] text-[#6B7280]">
                      يمكنك الاطلاع على سجل زياراتك السابقة
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Pending actions banner */}
            {pendingActionsCount > 0 && (
              <Link
                href={
                  pendingMedsCount > 0
                    ? '/patient/prescriptions'
                    : unreadMessages > 0
                      ? '/patient/messages'
                      : '/patient/health'
                }
                className="block bg-[#FEF3C7] border-[0.8px] border-[#FCD34D] rounded-[12px] p-4 mb-5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#FEF3C7] border-[0.8px] border-[#F59E0B] flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-[#B45309]" strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-cairo text-[14px] font-semibold text-[#78350F]">
                      {pendingActionsCount === 1
                        ? 'لديك إجراء واحد يحتاج انتباهك'
                        : `لديك ${pendingActionsCount} إجراءات تحتاج انتباهك`}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] font-cairo text-[#92400E]">
                      {pendingMedsCount > 0 && (
                        <span>{pendingMedsCount} وصفة للمراجعة</span>
                      )}
                      {abnormalLabsCount > 0 && (
                        <span>{abnormalLabsCount} نتيجة غير طبيعية</span>
                      )}
                      {unreadMessages > 0 && (
                        <span>{unreadMessages} رسالة جديدة</span>
                      )}
                    </div>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-[#92400E] flex-shrink-0" />
                </div>
              </Link>
            )}

            {/* Stat cards — 2x2 grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <StatCard
                icon={<Pill className="w-5 h-5" strokeWidth={1.8} />}
                iconBg="bg-[#F0FDF4]"
                iconColor="text-[#16A34A]"
                label="الأدوية النشطة"
                value={activeMedsCount}
                href="/patient/prescriptions"
              />
              <StatCard
                icon={<FlaskConical className="w-5 h-5" strokeWidth={1.8} />}
                iconBg="bg-[#E0F2FE]"
                iconColor="text-[#0369A1]"
                label="التحاليل"
                value={summary?.labs.total ?? 0}
                highlight={abnormalLabsCount > 0 ? `${abnormalLabsCount} غير طبيعي` : undefined}
                href="/patient/health"
              />
              <StatCard
                icon={<FileText className="w-5 h-5" strokeWidth={1.8} />}
                iconBg="bg-[#FEF3C7]"
                iconColor="text-[#B45309]"
                label="الزيارات"
                value={summary?.visits.total ?? 0}
                href="/patient/health"
              />
              <StatCard
                icon={<MessageCircle className="w-5 h-5" strokeWidth={1.8} />}
                iconBg="bg-[#F0FDF4]"
                iconColor="text-[#16A34A]"
                label="الرسائل"
                value={unreadMessages}
                highlight={unreadMessages > 0 ? 'غير مقروء' : undefined}
                href="/patient/messages"
              />
            </div>

            {/* Recent medications */}
            {summary && summary.medications.recent.length > 0 && (
              <Section title="أدويتي" actionHref="/patient/prescriptions" actionLabel="عرض الكل">
                <div className="space-y-2">
                  {summary.medications.recent.slice(0, 3).map((med) => (
                    <div
                      key={med.id}
                      className="bg-white border-[0.8px] border-[#E5E7EB] rounded-[12px] p-3 flex items-center gap-3"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
                        <Pill className="w-4 h-4 text-[#16A34A]" strokeWidth={1.8} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-cairo text-[14px] font-semibold text-[#030712] truncate">
                          {med.name}
                        </p>
                        {med.dosage && (
                          <p className="font-cairo text-[12px] text-[#6B7280] truncate">
                            {med.dosage}
                          </p>
                        )}
                      </div>
                      <StatusPill status={med.status} />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Recent visits */}
            {summary && summary.visits.recent.length > 0 && (
              <Section title="زياراتي الأخيرة" actionHref="/patient/health" actionLabel="عرض الكل">
                <div className="space-y-2">
                  {summary.visits.recent.slice(0, 3).map((visit) => (
                    <div
                      key={visit.id}
                      className="bg-white border-[0.8px] border-[#E5E7EB] rounded-[12px] p-3 flex items-center gap-3"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#E0F2FE] flex items-center justify-center flex-shrink-0">
                        <HeartPulse className="w-4 h-4 text-[#0369A1]" strokeWidth={1.8} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-cairo text-[14px] font-semibold text-[#030712] truncate">
                          د. {visit.doctor_name}
                        </p>
                        <p className="font-cairo text-[12px] text-[#6B7280] truncate">
                          {visit.reason}
                        </p>
                      </div>
                      <span className="font-cairo text-[11px] text-[#9CA3AF] flex-shrink-0">
                        {formatArabicDate(visit.date)}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Empty state — no data anywhere */}
            {summary &&
              summary.medications.recent.length === 0 &&
              summary.visits.recent.length === 0 &&
              summary.labs.total === 0 && (
                <div className="text-center py-10 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB]">
                  <div className="w-12 h-12 bg-[#F3F4F6] rounded-full flex items-center justify-center mx-auto mb-3">
                    <HeartPulse className="w-6 h-6 text-[#9CA3AF]" />
                  </div>
                  <p className="font-cairo text-[14px] font-semibold text-[#030712] mb-1">
                    لا توجد بيانات صحية بعد
                  </p>
                  <p className="font-cairo text-[12px] text-[#6B7280] px-6">
                    ستظهر أدويتك ونتائج تحاليلك وزياراتك هنا بعد زيارتك الأولى للطبيب
                  </p>
                </div>
              )}
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  highlight,
  href,
}: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  value: number
  highlight?: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="bg-white border-[0.8px] border-[#E5E7EB] rounded-[12px] p-4 hover:border-[#16A34A] transition-colors"
    >
      <div className={`w-10 h-10 rounded-full ${iconBg} ${iconColor} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="font-cairo text-[12px] text-[#6B7280] mb-0.5">{label}</p>
      <p className="font-cairo text-[22px] font-bold text-[#030712] leading-tight">{value}</p>
      {highlight && (
        <p className="font-cairo text-[10px] text-[#DC2626] mt-1 font-medium">{highlight}</p>
      )}
    </Link>
  )
}

function Section({
  title,
  actionHref,
  actionLabel,
  children,
}: {
  title: string
  actionHref?: string
  actionLabel?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-cairo text-[16px] font-semibold text-[#030712]">{title}</h2>
        {actionHref && actionLabel && (
          <Link
            href={actionHref}
            className="font-cairo text-[12px] font-medium text-[#16A34A]"
          >
            {actionLabel}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    active: { label: 'نشط', bg: 'bg-[#F0FDF4]', text: 'text-[#16A34A]' },
    pending: { label: 'معلق', bg: 'bg-[#FEF3C7]', text: 'text-[#B45309]' },
    inactive: { label: 'منتهي', bg: 'bg-[#F3F4F6]', text: 'text-[#6B7280]' },
    declined: { label: 'مرفوض', bg: 'bg-[#FEE2E2]', text: 'text-[#991B1B]' },
    expired: { label: 'منتهي', bg: 'bg-[#F3F4F6]', text: 'text-[#6B7280]' },
  }
  const conf = map[status] || map.active
  return (
    <span
      className={`font-cairo text-[10px] font-semibold px-2 py-0.5 rounded-full ${conf.bg} ${conf.text} flex-shrink-0`}
    >
      {conf.label}
    </span>
  )
}
