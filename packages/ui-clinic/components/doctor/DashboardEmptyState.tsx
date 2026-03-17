'use client'

import { useRouter } from 'next/navigation'
import { Stethoscope, UserPlus, Users } from 'lucide-react'

/**
 * DashboardEmptyState — Enhanced onboarding guidance for new doctors.
 *
 * Shows actionable next steps when no patients are scheduled:
 * 1. Add first patient (primary CTA)
 * 2. Invite front desk staff (secondary CTA)
 *
 * Based on Figma "no patient" card with added onboarding guidance.
 */

export function DashboardEmptyState() {
  const router = useRouter()

  return (
    <div className="px-4 mt-0 flex flex-col gap-4">
      {/* Main empty state card */}
      <div className="w-full border border-[#E5E7EB] rounded-3xl flex flex-col items-center justify-center py-12 px-6 gap-4">
        {/* Stethoscope icon — 48x48, #9CA3AF */}
        <Stethoscope className="w-12 h-12 text-[#9CA3AF]" strokeWidth={1.5} />

        {/* "لا يوجد مرضى لليوم" — Cairo 18px/22px weight 600 #030712 */}
        <h3 className="font-cairo text-[18px] leading-[22px] font-semibold text-[#030712] text-center">
          لا يوجد مرضى لليوم
        </h3>

        {/* Description — Cairo 14px/21px weight 400 #4B5563 */}
        <p className="font-cairo text-[14px] leading-[21px] font-normal text-[#4B5563] text-center">
          ابدأ بإضافة أول مريض أو ادعُ فريق الاستقبال
        </p>

        {/* Primary CTA: Add patient */}
        <button
          onClick={() => router.push('/doctor/session')}
          className="w-[240px] h-[48px] bg-[#16A34A] rounded-lg flex items-center justify-center gap-2"
        >
          <UserPlus className="w-5 h-5 text-white" />
          <span className="font-cairo text-[16px] leading-[24px] font-semibold text-white">
            ابدأ جلسة كشف
          </span>
        </button>
      </div>

      {/* Quick actions row */}
      <div className="flex gap-3">
        {/* Invite team */}
        <button
          onClick={() => router.push('/doctor/clinic-settings/staff')}
          className="flex-1 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-all"
        >
          <div className="w-10 h-10 bg-[#DBEAFE] rounded-xl flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-[#2563EB]" />
          </div>
          <div className="text-right">
            <p className="font-cairo text-[13px] font-semibold text-[#030712]">ادعُ الاستقبال</p>
            <p className="font-cairo text-[11px] text-[#9CA3AF]">شارك كود العيادة</p>
          </div>
        </button>

        {/* Add patient manually */}
        <button
          onClick={() => router.push('/doctor/patients')}
          className="flex-1 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-all"
        >
          <div className="w-10 h-10 bg-[#DCFCE7] rounded-xl flex items-center justify-center flex-shrink-0">
            <UserPlus className="w-5 h-5 text-[#16A34A]" />
          </div>
          <div className="text-right">
            <p className="font-cairo text-[13px] font-semibold text-[#030712]">إضافة مريض</p>
            <p className="font-cairo text-[11px] text-[#9CA3AF]">تسجيل مريض جديد</p>
          </div>
        </button>
      </div>
    </div>
  )
}
