'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Bell, ChevronDown, ChevronUp, Check, Calendar } from 'lucide-react'

/**
 * DashboardHeader
 *
 * Mobile  : Top bar (logo + search/bell/avatar) + welcome section
 * Desktop : Clean top bar (date + search/bell) — NO logo (sidebar has it)
 *           Welcome section is right-aligned, larger, more prominent
 */

interface ClinicOption {
  id: string
  name: string
}

interface DashboardHeaderProps {
  doctorName: string
  clinicName?: string
  clinicId?: string
  allClinics?: ClinicOption[]
  expectedCount: number
  unreadNotifications?: number
}

function getTodayArabic(): string {
  return new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    year:    'numeric',
  })
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'صباح الخير'
  if (hour < 17) return 'مساء الخير'
  return 'مساء النور'
}

export function DashboardHeader({
  doctorName,
  clinicName,
  clinicId,
  allClinics,
  expectedCount,
  unreadNotifications = 0,
}: DashboardHeaderProps) {
  const router = useRouter()
  const [clinicDropdownOpen, setClinicDropdownOpen] = useState(false)
  const hasMultipleClinics = (allClinics?.length ?? 0) > 1
  const [switching, setSwitching] = useState(false)

  const handleClinicSwitch = async (newClinicId: string) => {
    setClinicDropdownOpen(false)
    if (newClinicId === clinicId) return
    setSwitching(true)
    try {
      const res = await fetch('/api/clinic/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: newClinicId }),
      })
      if (res.ok) router.refresh()
    } catch (error) {
      console.error('Failed to switch clinic:', error)
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="flex flex-col">

      {/* ══════════ MOBILE TOP BAR — logo + actions ══════════ */}
      {/* Hidden on desktop — sidebar handles branding + nav */}
      <div className="lg:hidden flex items-center justify-between h-[56px] px-4">
        {/* RTL: first child = RIGHT = logo */}
        <div className="flex items-center gap-2">
          <div className="w-[30px] h-[30px] bg-[#16A34A] rounded-lg flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
              <path d="M4.5 12.5a7.5 7.5 0 1 0 15 0 7.5 7.5 0 0 0-15 0Z" />
              <path d="M12 8v4l2.5 2.5" />
            </svg>
          </div>
          <span className="font-inter text-[16px] font-semibold text-[#030712]">MedAssist</span>
        </div>
        {/* RTL: second child = LEFT = actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => router.push('/doctor/patients')}
            className="w-[38px] h-[38px] rounded-lg flex items-center justify-center hover:bg-[#F3F4F6] transition-colors"
          >
            <Search className="w-[18px] h-[18px] text-[#4B5563]" strokeWidth={1.67} />
          </button>
          <div className="relative">
            <button
              onClick={() => router.push('/doctor/notifications')}
              className="w-[38px] h-[38px] rounded-lg flex items-center justify-center hover:bg-[#F3F4F6] transition-colors"
            >
              <Bell className="w-[18px] h-[18px] text-[#4B5563]" strokeWidth={1.67} />
            </button>
            {unreadNotifications > 0 && (
              <div className="absolute top-[8px] left-[22px] w-[8px] h-[8px] bg-[#EF4444] border-[1.5px] border-white rounded-full" />
            )}
          </div>
        </div>
      </div>

      {/* ══════════ DESKTOP TOP BAR — date + actions ══════════ */}
      {/* Hidden on mobile — shown on lg+ instead of mobile bar */}
      <div className="hidden lg:flex items-center justify-between h-[60px] px-2 mb-2">
        {/* RTL first child = RIGHT: today's date */}
        <div className="flex items-center gap-2 text-[#6B7280]">
          <Calendar className="w-[16px] h-[16px] flex-shrink-0" strokeWidth={1.5} />
          <span className="font-cairo text-[13px]">{getTodayArabic()}</span>
        </div>
        {/* RTL second child = LEFT: search + bell */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => router.push('/doctor/patients')}
            className="w-[40px] h-[40px] rounded-xl flex items-center justify-center hover:bg-[#F3F4F6] transition-colors"
          >
            <Search className="w-[18px] h-[18px] text-[#4B5563]" strokeWidth={1.67} />
          </button>
          <div className="relative">
            <button
              onClick={() => router.push('/doctor/notifications')}
              className="w-[40px] h-[40px] rounded-xl flex items-center justify-center hover:bg-[#F3F4F6] transition-colors"
            >
              <Bell className="w-[18px] h-[18px] text-[#4B5563]" strokeWidth={1.67} />
            </button>
            {unreadNotifications > 0 && (
              <div className="absolute top-[9px] left-[22px] w-[8px] h-[8px] bg-[#EF4444] border-[1.5px] border-white rounded-full" />
            )}
          </div>
        </div>
      </div>

      {/* ══════════ WELCOME + CLINIC + STATS ══════════ */}
      {/* RTL: items-start = RIGHT-aligned in RTL column */}
      <div className="flex flex-col items-start gap-3 px-4 lg:px-2 pb-4">

        {/* Greeting + name */}
        <div>
          <p className="font-cairo text-[13px] text-[#6B7280] font-normal">
            {getGreeting()}،
          </p>
          <h1 className="font-cairo text-[22px] lg:text-[26px] leading-[32px] lg:leading-[38px] font-bold text-[#030712] mt-0.5">
            د. {doctorName}
          </h1>
        </div>

        {/* Clinic selector pill */}
        {clinicName && (
          <div className="relative">
            <button
              onClick={() => hasMultipleClinics && setClinicDropdownOpen(!clinicDropdownOpen)}
              className={`inline-flex items-center gap-1.5 px-3 bg-[#F0FDF4] border-[0.8px] border-[#86EFAC] rounded-full h-[30px] transition-colors ${
                hasMultipleClinics ? 'hover:bg-[#DCFCE7] cursor-pointer' : 'cursor-default'
              }`}
            >
              <span className="font-cairo text-[12px] leading-[18px] font-semibold text-[#15803D]">
                {clinicName}
              </span>
              {hasMultipleClinics && (
                clinicDropdownOpen
                  ? <ChevronUp className="w-[12px] h-[12px] text-[#15803D]" strokeWidth={2} />
                  : <ChevronDown className="w-[12px] h-[12px] text-[#15803D]" strokeWidth={2} />
              )}
            </button>

            {clinicDropdownOpen && hasMultipleClinics && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setClinicDropdownOpen(false)} />
                <div className="absolute top-[36px] right-0 z-50 bg-white border-[0.8px] border-[#D1D5DB] rounded-[12px] shadow-lg py-1 min-w-[200px]">
                  {allClinics?.map((clinic) => (
                    <button
                      key={clinic.id}
                      onClick={() => handleClinicSwitch(clinic.id)}
                      className="w-full text-right px-4 py-2.5 hover:bg-[#F0FDF4] transition-colors flex items-center justify-between"
                    >
                      <span className="font-cairo text-[13px] font-medium text-[#030712]">{clinic.name}</span>
                      {clinic.id === clinicId && <Check className="w-4 h-4 text-[#16A34A]" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Stats row — desktop gets visual stat cards, mobile stays compact */}
        <div className="w-full">
          {/* Mobile: compact text line */}
          <p className="lg:hidden font-cairo text-[13px] font-normal text-[#6B7280]">
            إجمالي اليوم: <span className="font-semibold text-[#030712]">{expectedCount}</span> مريض
          </p>

          {/* Desktop: stat cards row */}
          <div className="hidden lg:flex gap-3 mt-1">
            <div className="flex flex-col items-center justify-center bg-white border border-[#E5E7EB] rounded-2xl px-6 py-3 min-w-[120px]">
              <span className="font-cairo text-[28px] font-bold text-[#030712] leading-none">{expectedCount}</span>
              <span className="font-cairo text-[12px] text-[#6B7280] mt-1">مرضى اليوم</span>
            </div>
            <div className="flex flex-col items-center justify-center bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl px-6 py-3 min-w-[120px]">
              <span className="font-cairo text-[28px] font-bold text-[#16A34A] leading-none">
                {expectedCount === 0 ? '—' : Math.max(0, expectedCount - 1)}
              </span>
              <span className="font-cairo text-[12px] text-[#15803D] mt-1">في الانتظار</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ SECTION HEADING ══════════ */}
      {expectedCount > 0 && (
        <h2 className="font-cairo text-[16px] lg:text-[18px] font-semibold text-[#030712] px-4 lg:px-2 pb-3">
          المرضى المنتظرون
        </h2>
      )}

    </div>
  )
}
