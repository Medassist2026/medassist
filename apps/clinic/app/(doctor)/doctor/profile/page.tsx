'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, ChevronDown, ChevronLeft, User, Stethoscope, Phone, Mail, Building2, Hash, Users, FileText, Banknote, TrendingUp } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface DoctorStats {
  doctor: {
    id: string
    fullName: string
    specialty: string
    uniqueId: string
    consultationFee: number
    followupFee: number
  }
  stats: {
    totalPatients: number
    totalSessions: number
    patientsThisMonth: number
    sessionsThisMonth: number
    feesThisMonth: number
    totalFees: number
  }
  clinic: {
    name: string
    uniqueId: string
    allClinics: Array<{ id: string; name: string; uniqueId: string; role: string }>
  } | null
  phone: string
  email: string | null
}

// Specialty Arabic labels
const SPECIALTY_LABELS: Record<string, string> = {
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

// ============================================================================
// COLLAPSIBLE SECTION COMPONENT
// ============================================================================

function AccordionSection({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-right"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[8px] bg-[#F0FDF4] flex items-center justify-center text-[#16A34A]">
            {icon}
          </div>
          <span className="font-cairo text-[15px] font-semibold text-[#030712]">{title}</span>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-[#9CA3AF] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-5 pb-4 border-t border-[#F3F4F6]">
          {children}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// INFO ROW COMPONENT
// ============================================================================

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[#F3F4F6] last:border-b-0">
      <div className="w-8 h-8 rounded-full bg-[#F9FAFB] flex items-center justify-center text-[#6B7280] flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-cairo text-[12px] text-[#9CA3AF]">{label}</p>
        <p className="font-cairo text-[14px] font-medium text-[#030712] truncate">{value}</p>
      </div>
    </div>
  )
}

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

function StatCard({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode
  value: string | number
  label: string
  color: string
}) {
  return (
    <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-4 flex-1 min-w-[100px]">
      <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center mb-3 ${color}`}>
        {icon}
      </div>
      <p className="font-cairo text-[22px] font-bold text-[#030712] leading-tight">{value}</p>
      <p className="font-cairo text-[12px] text-[#6B7280] mt-0.5">{label}</p>
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function ProfilePage() {
  const router = useRouter()
  const [data, setData] = useState<DoctorStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/doctor/stats')
      if (res.ok) {
        const json = await res.json()
        if (json.success) setData(json)
        else setLoadError('فشل تحميل البيانات')
      } else {
        setLoadError('فشل الاتصال بالخادم')
      }
    } catch {
      setLoadError('خطأ في الاتصال. تحقق من الإنترنت')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const formatNumber = (n: number) => n.toLocaleString('ar-EG')

  return (
    <div className="min-h-screen bg-[#F9FAFB]" dir="rtl">
      {/* Responsive container: mobile = narrow, desktop = full DoctorShell width */}
      <div className="max-w-md mx-auto lg:max-w-none lg:mx-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 lg:px-0 lg:pt-6 lg:pb-4">
          <button
            onClick={() => router.back()}
            className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center lg:hidden"
          >
            <ChevronRight className="w-[20px] h-[20px] text-[#030712]" />
          </button>
          <h1 className="font-cairo text-[18px] lg:text-[22px] leading-[22px] font-semibold text-[#030712]">
            الملف الشخصي
          </h1>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="w-10 h-10 border-2 border-[#16A34A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="font-cairo text-[14px] text-[#6B7280]">جاري التحميل...</p>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 px-4">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <User className="w-6 h-6 text-red-400" />
            </div>
            <p className="font-cairo text-[14px] text-[#6B7280] text-center">{loadError}</p>
            <button
              onClick={load}
              className="px-5 py-2 bg-[#16A34A] text-white rounded-xl font-cairo text-[14px] font-medium hover:bg-[#15803D] transition-colors"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : !data ? null : (
          <div className="px-4 pb-24 lg:px-0 lg:pb-10 lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 lg:items-start">
            {/* LEFT column on desktop (main info) — on mobile this is just a stack */}
            <div className="space-y-4">
            {/* Profile Header Card */}
            <div className="bg-white rounded-[16px] border-[0.8px] border-[#E5E7EB] p-5 flex items-center gap-4">
              {/* Avatar — no initials: Egyptian users don't use name abbreviations */}
              <div className="w-16 h-16 rounded-full bg-[#DCFCE7] flex items-center justify-center flex-shrink-0">
                <User className="w-8 h-8 text-[#16A34A]" strokeWidth={1.5} />
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="font-cairo text-[18px] font-bold text-[#030712] truncate">
                  د. {data.doctor.fullName}
                </h2>
                <p className="font-cairo text-[14px] text-[#6B7280] mt-0.5">
                  {SPECIALTY_LABELS[data.doctor.specialty] || data.doctor.specialty}
                </p>
                {data.clinic && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Building2 className="w-3.5 h-3.5 text-[#9CA3AF]" />
                    <p className="font-cairo text-[12px] text-[#9CA3AF]">{data.clinic.name}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Accordion Sections */}
            <AccordionSection
              title="البيانات الطبية"
              icon={<Stethoscope className="w-4 h-4" />}
              defaultOpen={true}
            >
              <InfoRow
                icon={<Stethoscope className="w-4 h-4" />}
                label="التخصص"
                value={SPECIALTY_LABELS[data.doctor.specialty] || data.doctor.specialty}
              />
              <InfoRow
                icon={<Hash className="w-4 h-4" />}
                label="المعرف الفريد"
                value={data.doctor.uniqueId}
              />
              {data.clinic && (
                <InfoRow
                  icon={<Building2 className="w-4 h-4" />}
                  label="العيادة"
                  value={data.clinic.name}
                />
              )}
              {data.doctor.consultationFee > 0 && (
                <InfoRow
                  icon={<Banknote className="w-4 h-4" />}
                  label="سعر الكشف"
                  value={`${formatNumber(data.doctor.consultationFee)} ج.م`}
                />
              )}
              {data.doctor.followupFee > 0 && (
                <InfoRow
                  icon={<Banknote className="w-4 h-4" />}
                  label="سعر المتابعة"
                  value={`${formatNumber(data.doctor.followupFee)} ج.م`}
                />
              )}
            </AccordionSection>

            <AccordionSection
              title="بيانات التواصل"
              icon={<Phone className="w-4 h-4" />}
            >
              <InfoRow
                icon={<Phone className="w-4 h-4" />}
                label="رقم الهاتف"
                value={data.phone || 'غير متوفر'}
              />
              {data.email && (
                <InfoRow
                  icon={<Mail className="w-4 h-4" />}
                  label="البريد الإلكتروني"
                  value={data.email}
                />
              )}
            </AccordionSection>

            <AccordionSection
              title="العيادات"
              icon={<Building2 className="w-4 h-4" />}
            >
              {data.clinic?.allClinics && data.clinic.allClinics.length > 0 ? (
                data.clinic.allClinics.map((c, i) => (
                  <div key={c.id} className={`flex items-center gap-3 py-3 ${i < data.clinic!.allClinics.length - 1 ? 'border-b border-[#F3F4F6]' : ''}`}>
                    <div className="w-8 h-8 rounded-full bg-[#DCFCE7] flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-[#16A34A]" />
                    </div>
                    <div className="flex-1">
                      <p className="font-cairo text-[14px] font-medium text-[#030712]">{c.name}</p>
                      <p className="font-cairo text-[12px] text-[#9CA3AF]">{c.role === 'owner' ? 'مالك' : 'طبيب'}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="font-cairo text-[13px] text-[#9CA3AF] py-3">لا توجد عيادات</p>
              )}
            </AccordionSection>
            </div>{/* end left column */}

            {/* RIGHT column on desktop / stacks below on mobile */}
            <div className="space-y-4 mt-4 lg:mt-0">
              {/* Stats Section */}
              <div>
                <p className="font-cairo text-[14px] font-semibold text-[#4B5563] mb-3 px-1">
                  ملخص هذا الشهر
                </p>
                <div className="flex gap-3">
                  <StatCard
                    icon={<Users className="w-5 h-5 text-[#16A34A]" />}
                    value={formatNumber(data.stats.patientsThisMonth)}
                    label="مريض جديد"
                    color="bg-[#DCFCE7]"
                  />
                  <StatCard
                    icon={<FileText className="w-5 h-5 text-[#3B82F6]" />}
                    value={formatNumber(data.stats.sessionsThisMonth)}
                    label="جلسة"
                    color="bg-[#DBEAFE]"
                  />
                </div>
              </div>

              {/* Fee Summary */}
              {data.stats.totalFees > 0 && (
                <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-[10px] bg-[#FEF9C3] flex items-center justify-center">
                      <Banknote className="w-5 h-5 text-[#A16207]" />
                    </div>
                    <div>
                      <p className="font-cairo text-[22px] font-bold text-[#030712]">
                        {formatNumber(data.stats.totalFees)}
                      </p>
                      <p className="font-cairo text-[12px] text-[#6B7280]">إجمالي الإيرادات (ج.م)</p>
                    </div>
                  </div>
                </div>
              )}
              {/* Analytics Link */}
              <Link
                href="/doctor/analytics"
                className="flex items-center justify-between bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-4 hover:bg-[#F9FAFB] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[8px] bg-[#F0FDF4] flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-[#16A34A]" />
                  </div>
                  <div>
                    <p className="font-cairo text-[14px] font-medium text-[#030712]">الإحصائيات التفصيلية</p>
                    <p className="font-cairo text-[11px] text-[#9CA3AF]">الإيرادات والزيارات يومياً وشهرياً</p>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-[#9CA3AF]" />
              </Link>
            </div>{/* end right column */}
          </div>
        )}
      </div>
    </div>
  )
}
