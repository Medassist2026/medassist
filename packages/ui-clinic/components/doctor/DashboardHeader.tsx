'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Bell, ChevronDown, ChevronUp, Check, Calendar, Users, Clock } from 'lucide-react'

interface ClinicOption {
  id: string
  name: string
}

interface DashboardHeaderProps {
  doctorName: string
  clinicName?: string
  clinicId?: string
  allClinics?: ClinicOption[]
  /** Total scheduled appointments for today */
  expectedCount: number
  /** Patients currently waiting (from live queue + pending appointments) */
  waitingCount?: number
  unreadNotifications?: number
}

function getTodayArabic(): string {
  return new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    timeZone: 'Africa/Cairo',
  })
}

function getGreeting(): string {
  const hour = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' })).getHours()
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
  waitingCount,
  unreadNotifications = 0,
}: DashboardHeaderProps) {
  const router = useRouter()
  const [clinicDropdownOpen, setClinicDropdownOpen] = useState(false)
  const hasMultipleClinics = (allClinics?.length ?? 0) > 1
  const [switching, setSwitching] = useState(false)

  const displayWaiting = waitingCount ?? 0

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
    } catch {
      // clinic switch failed silently — user can retry
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="flex flex-col">

      {/* ══════════ MOBILE TOP BAR ══════════ */}
      <div className="lg:hidden flex items-center justify-between h-[56px] px-4">
        {/* Logo + brand */}
        <div className="flex items-center gap-2">
          <div className="w-[30px] h-[30px] bg-[#16A34A] rounded-lg flex items-center justify-center shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
              <path d="M4.5 12.5a7.5 7.5 0 1 0 15 0 7.5 7.5 0 0 0-15 0Z" />
              <path d="M12 8v4l2.5 2.5" />
            </svg>
          </div>
          <span className="font-inter text-[16px] font-semibold text-[#030712]">MedAssist</span>
        </div>

        {/* Actions */}
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

      {/* ══════════ DESKTOP TOP BAR ══════════ */}
      <div className="hidden lg:flex items-center justify-between h-[60px] px-2 mb-2">
        <div className="flex items-center gap-2 text-[#6B7280]">
          <Calendar className="w-[16px] h-[16px] flex-shrink-0" strokeWidth={1.5} />
          <span className="font-cairo text-[13px]">{getTodayArabic()}</span>
        </div>
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
      <div className="flex flex-col items-start gap-3 px-4 lg:px-2 pb-5">

        {/* Greeting + name */}
        <div>
          <p className="font-cairo text-[12px] text-[#9CA3AF] font-normal tracking-wide">
            {getGreeting()}،
          </p>
          <h1 className="font-cairo text-[22px] lg:text-[26px] leading-[32px] lg:leading-[38px] font-bold text-[#111827] mt-0.5">
            د. {doctorName}
          </h1>
        </div>

        {/* Today's date — mobile only */}
        <div className="lg:hidden flex items-center gap-1.5">
          <Calendar className="w-[13px] h-[13px] text-[#9CA3AF]" strokeWidth={1.5} />
          <span className="font-cairo text-[12px] text-[#9CA3AF]">{getTodayArabic()}</span>
        </div>

        {/* Clinic selector pill */}
        {clinicName && (
          <div className="relative">
            <button
              onClick={() => hasMultipleClinics && setClinicDropdownOpen(!clinicDropdownOpen)}
              className={`inline-flex items-center gap-1.5 px-3 bg-[#F0FDF4] border-[0.8px] border-[#86EFAC] rounded-full h-[28px] transition-colors ${
                hasMultipleClinics ? 'hover:bg-[#DCFCE7] cursor-pointer' : 'cursor-default'
              }`}
            >
              <span className="w-[6px] h-[6px] rounded-full bg-[#22C55E] flex-shrink-0" />
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

        {/* ── Stats mini-cards row (both mobile + desktop) ── */}
        <div className="w-full flex gap-3">

          {/* Total patients today */}
          <div className="flex-1 bg-white border-[0.8px] border-[#E5E7EB] rounded-[12px] px-4 py-3 flex items-center gap-3">
            <div className="w-[36px] h-[36px] rounded-[8px] bg-[#F3F4F6] flex items-center justify-center flex-shrink-0">
              <Users className="w-[16px] h-[16px] text-[#4B5563]" strokeWidth={1.67} />
            </div>
            <div>
              <div className="font-cairo text-[22px] font-bold text-[#111827] leading-none">{expectedCount}</div>
              <div className="font-cairo text-[11px] text-[#6B7280] mt-0.5">مرضى اليوم</div>
            </div>
          </div>

          {/* Waiting */}
          <div className={`flex-1 border-[0.8px] rounded-[12px] px-4 py-3 flex items-center gap-3 ${
            displayWaiting > 0
              ? 'bg-[#F0FDF4] border-[#BBF7D0]'
              : 'bg-white border-[#E5E7EB]'
          }`}>
            <div className={`w-[36px] h-[36px] rounded-[8px] flex items-center justify-center flex-shrink-0 ${
              displayWaiting > 0 ? 'bg-[#DCFCE7]' : 'bg-[#F3F4F6]'
            }`}>
              <Clock className={`w-[16px] h-[16px] ${displayWaiting > 0 ? 'text-[#16A34A]' : 'text-[#4B5563]'}`} strokeWidth={1.67} />
            </div>
            <div>
              <div className={`font-cairo text-[22px] font-bold leading-none ${
                displayWaiting > 0 ? 'text-[#16A34A]' : 'text-[#111827]'
              }`}>{displayWaiting}</div>
              <div className={`font-cairo text-[11px] mt-0.5 ${
                displayWaiting > 0 ? 'text-[#15803D]' : 'text-[#6B7280]'
              }`}>في الانتظار</div>
            </div>
          </div>

        </div>
      </div>

      {/* ══════════ SECTION HEADING ══════════ */}
      {expectedCount > 0 && (
        <h2 className="font-cairo text-[15px] lg:text-[17px] font-bold text-[#111827] px-4 lg:px-2 pb-3">
          المرضى المنتظرون
        </h2>
      )}

    </div>
  )
}
