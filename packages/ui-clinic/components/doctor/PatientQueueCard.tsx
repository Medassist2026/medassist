'use client'

import { useRouter } from 'next/navigation'
import { ar } from '@shared/lib/i18n/ar'

export type VisitType = 'new' | 'followup' | 'emergency'

interface PatientQueueCardProps {
  patientId: string
  patientName: string
  patientPhone?: string
  patientAge?: number
  patientSex?: string
  visitType: VisitType
  appointmentId?: string
  appointmentTime?: string
  description?: string
}

/**
 * Visit type badge colors — from Figma CSS:
 *   "كشف جديد" (new):     bg #E0F2FE, text #082F49 (blue)
 *   "إعادة كشف" (followup): bg #FEF3C7, text #78350F (amber)
 *   "طارئ" (emergency):    bg #FEE2E2, text #991B1B (red)
 */
const visitTypeBadge: Record<VisitType, { label: string; bg: string; text: string }> = {
  new: { label: ar.newVisit, bg: 'bg-[#E0F2FE]', text: 'text-[#082F49]' },
  followup: { label: ar.followUp, bg: 'bg-[#FEF3C7]', text: 'text-[#78350F]' },
  emergency: { label: ar.emergency, bg: 'bg-[#FEE2E2]', text: 'text-[#991B1B]' },
}

export function PatientQueueCard({
  patientId,
  patientName,
  patientPhone,
  patientAge,
  patientSex,
  visitType,
  appointmentId,
  appointmentTime,
  description,
}: PatientQueueCardProps) {
  const router = useRouter()
  const badge = visitTypeBadge[visitType] || visitTypeBadge.new

  return (
    <div className="bg-[#F9FAFB] border-[0.8px] border-[#D1D5DB] rounded-[12px] p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.1),0px_1px_2px_rgba(0,0,0,0.06)]">
      {/* Patient Info Row */}
      <div className="flex items-center justify-between mb-3">
        {/* Patient name — Cairo 16px/24px weight 600 #030712 */}
        <h3 className="font-cairo text-[16px] leading-[24px] font-semibold text-[#030712]">
          {patientName}
        </h3>

        {/* Visit Type Badge — rounded-[4px], Cairo 12px/18px weight 500 */}
        <span className={`font-cairo text-[12px] leading-[18px] font-medium px-2 py-1 rounded-[4px] ${badge.bg} ${badge.text}`}>
          {badge.label}
        </span>
      </div>

      {/* Description / sub-text — Cairo 14px/21px weight 400 #4B5563 */}
      {description && (
        <p className="font-cairo text-[14px] leading-[21px] font-normal text-[#4B5563] text-right mb-3">
          {description}
        </p>
      )}

      {/* Patient details (age, sex) — fallback if no description */}
      {!description && (patientAge || patientSex) && (
        <p className="font-cairo text-[14px] leading-[21px] font-normal text-[#4B5563] text-right mb-3">
          {patientAge && `${patientAge} سنة`}
          {patientSex && patientAge && ' · '}
          {patientSex === 'male' ? 'ذكر' : patientSex === 'female' ? 'أنثى' : patientSex}
        </p>
      )}

      {/* Action Buttons — two equal buttons, 48px height, gap 12px */}
      <div className="flex gap-3">
        {/* "عرض الملف" — bg white, border 0.8px #D1D5DB, rounded-8px, Cairo 14px/21px weight 600 #1F2937 */}
        <button
          onClick={() => router.push(`/doctor/patients/${patientId}`)}
          className="flex-1 h-[48px] bg-white border-[0.8px] border-[#D1D5DB] rounded-[8px] font-cairo text-[14px] leading-[21px] font-semibold text-[#1F2937] text-center transition-colors hover:bg-[#F9FAFB]"
        >
          {ar.viewFile}
        </button>

        {/* "بدء الجلسة" — bg #16A34A, rounded-8px, Cairo 14px/21px weight 600 white */}
        <button
          onClick={() => router.push(`/doctor/session?patientId=${patientId}${appointmentId ? `&appointmentId=${appointmentId}` : ''}`)}
          className="flex-1 h-[48px] bg-[#16A34A] rounded-[8px] font-cairo text-[14px] leading-[21px] font-semibold text-white text-center transition-colors hover:bg-[#15803D]"
        >
          {ar.startSession}
        </button>
      </div>
    </div>
  )
}
