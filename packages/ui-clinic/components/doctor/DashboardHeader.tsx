'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Bell, ChevronDown, ChevronUp, Stethoscope, User, Check } from 'lucide-react'

/**
 * DashboardHeader — Matches Figma "dashboard with patients" screen.
 *
 * Layout (RTL, top to bottom):
 * 1. Top bar: Logo (32x32 #16A34A) + "MedAssist" Cairo 18px | Search 40x40 | Bell 40x40 (red dot) | User 32x32 circle
 * 2. Welcome: "مرحبًا د. أحمد" Cairo 24px/29px weight 600 #030712
 * 3. Clinic selector pill: bg white, border 0.8px #E5E7EB, rounded-full, ChevronDown + text Cairo 12px #15803D
 * 4. Patient count: "الاجمالي اليوم: X مريضًا" Cairo 14px/21px weight 400 #4B5563
 * 5. Section heading: "المرضى المنتظرون" Cairo 18px/22px weight 600 #030712
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
      // Use the secure API endpoint that validates membership before setting httpOnly cookie
      const res = await fetch('/api/clinic/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: newClinicId }),
      })
      if (res.ok) {
        router.refresh()
      }
    } catch (error) {
      console.error('Failed to switch clinic:', error)
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="flex flex-col px-4 pt-4 gap-[12px] pb-4">
      {/* ===== TOP BAR ===== */}
      <div className="flex items-center justify-between h-[56px]">
        {/* Right side (RTL): Logo + brand name */}
        <div className="flex items-center gap-2">
          <div className="w-[32px] h-[32px] bg-[#16A34A] rounded-lg flex items-center justify-center">
            <Stethoscope className="w-[18px] h-[18px] text-white" strokeWidth={1.5} />
          </div>
          <span className="font-cairo text-[18px] leading-[22px] font-semibold text-[#030712]">
            MedAssist
          </span>
        </div>

        {/* Left side (RTL): Search + Bell + User avatar */}
        <div className="flex items-center gap-2">
          {/* Search button */}
          <button
            onClick={() => router.push('/doctor/patients')}
            className="w-[40px] h-[40px] rounded-lg flex items-center justify-center hover:bg-[#F3F4F6] transition-colors"
          >
            <Search className="w-[20px] h-[20px] text-[#4B5563]" strokeWidth={1.67} />
          </button>

          {/* Bell button with notification dot */}
          <div className="relative">
            <button
              onClick={() => router.push('/doctor/notifications')}
              className="w-[40px] h-[40px] rounded-lg flex items-center justify-center hover:bg-[#F3F4F6] transition-colors"
            >
              <Bell className="w-[20px] h-[20px] text-[#4B5563]" strokeWidth={1.67} />
            </button>
            {/* Red notification dot — only show when there are unread notifications */}
            {unreadNotifications > 0 && (
              <div className="absolute top-[8px] left-[24px] w-[8px] h-[8px] bg-[#EF4444] border-[1.2px] border-white rounded-full" />
            )}
          </div>

          {/* User avatar circle */}
          <button className="w-[32px] h-[32px] rounded-full bg-[#F9FAFB] border-[0.8px] border-[#E5E7EB] flex items-center justify-center hover:bg-[#F3F4F6] transition-colors">
            <User className="w-[16px] h-[16px] text-[#4B5563]" strokeWidth={1.33} />
          </button>
        </div>
      </div>

      {/* ===== WELCOME + CLINIC + COUNT SECTION ===== */}
      <div className="flex flex-col items-end gap-[12px] px-2">
        {/* Welcome — Cairo 24px/29px weight 600 #030712 */}
        <h1 className="font-cairo text-[24px] leading-[29px] font-semibold text-[#030712] text-right">
          مرحبًا د. {doctorName}
        </h1>

        {/* Clinic selector pill — bg white, border 0.8px #E5E7EB, rounded-full */}
        {clinicName && (
          <div className="relative">
            <button
              onClick={() => hasMultipleClinics && setClinicDropdownOpen(!clinicDropdownOpen)}
              className={`inline-flex items-center gap-1 px-3 bg-white border-[0.8px] border-[#E5E7EB] rounded-full h-[32px] transition-colors ${
                hasMultipleClinics ? 'hover:bg-[#F9FAFB] cursor-pointer' : 'cursor-default'
              }`}
            >
              {hasMultipleClinics && (
                clinicDropdownOpen
                  ? <ChevronUp className="w-[13px] h-[13px] text-[#4B5563]" strokeWidth={1.35} />
                  : <ChevronDown className="w-[13px] h-[13px] text-[#4B5563]" strokeWidth={1.35} />
              )}
              <span className="font-cairo text-[12px] leading-[18px] font-semibold text-[#15803D] text-center">
                {clinicName}
              </span>
            </button>

            {/* Clinic dropdown */}
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
                      <span className="font-cairo text-[13px] font-medium text-[#030712]">
                        {clinic.name}
                      </span>
                      {clinic.id === clinicId && (
                        <Check className="w-4 h-4 text-[#16A34A]" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Patient count — Cairo 14px/21px weight 400 #4B5563 */}
        <p className="font-cairo text-[14px] leading-[21px] font-normal text-[#4B5563] text-right">
          الاجمالي اليوم: {expectedCount} مريضًا
        </p>
      </div>

      {/* ===== SECTION HEADING ===== */}
      {expectedCount > 0 && (
        <h2 className="font-cairo text-[18px] leading-[22px] font-semibold text-[#030712] text-right px-2">
          المرضى المنتظرون
        </h2>
      )}
    </div>
  )
}
