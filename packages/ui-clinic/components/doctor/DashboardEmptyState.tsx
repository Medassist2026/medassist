'use client'

import { useRouter } from 'next/navigation'
import { UserPlus, Users, Stethoscope, ArrowLeft } from 'lucide-react'
import { motion } from 'framer-motion'

/**
 * DashboardEmptyState — Shown when no patients are scheduled today.
 *
 * Mobile  : stacked, centered, 240px CTA
 * Desktop : wider card, full-width CTA (up to 400px), better visual weight
 */
export function DashboardEmptyState() {
  const router = useRouter()

  return (
    <div className="px-4 lg:px-2 mt-2 flex flex-col gap-3">

      {/* ── Main empty state card ─────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
        className="w-full border border-[#E5E7EB] bg-white rounded-3xl flex flex-col items-center justify-center py-10 lg:py-14 px-6 gap-5"
      >
        {/* Icon — softened with green tint on desktop */}
        <div className="w-[64px] h-[64px] lg:w-[72px] lg:h-[72px] bg-[#F0FDF4] rounded-2xl flex items-center justify-center">
          <Stethoscope className="w-8 h-8 lg:w-9 lg:h-9 text-[#22C55E]" strokeWidth={1.5} />
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <h3 className="font-cairo text-[18px] lg:text-[20px] font-bold text-[#030712]">
            لا يوجد مرضى لليوم
          </h3>
          <p className="font-cairo text-[13px] lg:text-[14px] text-[#6B7280] max-w-[280px]">
            ابدأ بإضافة أول مريض أو ادعُ فريق الاستقبال للمساعدة
          </p>
        </div>

        {/* Primary CTA — full width up to 400px on desktop */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push('/doctor/session')}
          className="w-full max-w-[280px] lg:max-w-[400px] h-[50px] bg-[#16A34A] hover:bg-[#15803D] rounded-xl flex items-center justify-center gap-2 transition-colors shadow-md shadow-green-200"
        >
          <UserPlus className="w-5 h-5 text-white" strokeWidth={2} />
          <span className="font-cairo text-[15px] lg:text-[16px] font-semibold text-white">
            ابدأ جلسة كشف
          </span>
        </motion.button>
      </motion.div>

      {/* ── Quick action cards ──────────────────────────────── */}
      <div className="flex gap-3">

        {/* Invite reception */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, type: 'spring', stiffness: 280, damping: 24 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push('/doctor/clinic-settings/staff')}
          className="flex-1 bg-white border border-[#E5E7EB] rounded-2xl p-4 flex items-center gap-3 transition-all"
        >
          <div className="w-10 h-10 bg-[#DBEAFE] rounded-xl flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-[#2563EB]" strokeWidth={1.8} />
          </div>
          <div className="text-right flex-1 min-w-0">
            <p className="font-cairo text-[13px] font-semibold text-[#030712]">ادعُ الاستقبال</p>
            <p className="font-cairo text-[11px] text-[#9CA3AF] mt-0.5">شارك كود العيادة</p>
          </div>
          <ArrowLeft className="w-4 h-4 text-[#D1D5DB] flex-shrink-0" />
        </motion.button>

        {/* Add patient */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, type: 'spring', stiffness: 280, damping: 24 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push('/doctor/patients')}
          className="flex-1 bg-white border border-[#E5E7EB] rounded-2xl p-4 flex items-center gap-3 transition-all"
        >
          <div className="w-10 h-10 bg-[#DCFCE7] rounded-xl flex items-center justify-center flex-shrink-0">
            <UserPlus className="w-5 h-5 text-[#16A34A]" strokeWidth={1.8} />
          </div>
          <div className="text-right flex-1 min-w-0">
            <p className="font-cairo text-[13px] font-semibold text-[#030712]">إضافة مريض</p>
            <p className="font-cairo text-[11px] text-[#9CA3AF] mt-0.5">تسجيل مريض جديد</p>
          </div>
          <ArrowLeft className="w-4 h-4 text-[#D1D5DB] flex-shrink-0" />
        </motion.button>

      </div>
    </div>
  )
}
