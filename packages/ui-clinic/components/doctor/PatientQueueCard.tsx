'use client'

import { useRouter } from 'next/navigation'
import { ar } from '@shared/lib/i18n/ar'
import { Clock } from 'lucide-react'

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
const visitTypeBadge: Record<VisitType, { label: string; bg: string; text: string; dot: string }> = {
  new:       { label: ar.newVisit,   bg: 'bg-[#E0F2FE]', text: 'text-[#082F49]', dot: 'bg-[#3B82F6]' },
  followup:  { label: ar.followUp,  bg: 'bg-[#FEF3C7]', text: 'text-[#78350F]', dot: 'bg-[#F59E0B]' },
  emergency: { label: ar.emergency, bg: 'bg-[#FEE2E2]', text: 'text-[#991B1B]', dot: 'bg-[#EF4444]' },
}

/** Derive 1–2 letter Arabic initials from a full name */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0)
  return parts[0].charAt(0) + parts[1].charAt(0)
}

/** Avatar background palette — cycles by first char code */
const avatarColors = [
  { bg: '#DBEAFE', text: '#1D4ED8' },
  { bg: '#D1FAE5', text: '#065F46' },
  { bg: '#EDE9FE', text: '#5B21B6' },
  { bg: '#FEF3C7', text: '#92400E' },
  { bg: '#FCE7F3', text: '#9D174D' },
  { bg: '#E0F2FE', text: '#0369A1' },
]

function getAvatarColor(name: string) {
  const code = name.charCodeAt(0) || 0
  return avatarColors[code % avatarColors.length]
}

/** Format appointment time with Cairo timezone, return display string + isLate flag */
function formatAppointmentTime(isoTime?: string): { display: string; isLate: boolean } | null {
  if (!isoTime) return null
  try {
    const date = new Date(isoTime)
    const now = new Date()
    const isLate = date < now
    const display = date.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Cairo',
    })
    return { display, isLate }
  } catch {
    return null
  }
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
  const initials = getInitials(patientName)
  const avatarColor = getAvatarColor(patientName)
  const timeInfo = formatAppointmentTime(appointmentTime)
  const isEmergency = visitType === 'emergency'

  return (
    <div className={`bg-white border-[0.8px] rounded-[14px] p-4 shadow-[0px_1px_3px_rgba(0,0,0,0.06)] transition-all ${
      isEmergency
        ? 'border-[#FCA5A5] ring-1 ring-[#FEE2E2]'
        : 'border-[#E5E7EB] hover:border-[#D1D5DB] hover:shadow-[0px_2px_6px_rgba(0,0,0,0.08)]'
    }`}>

      {/* ── Top row: Avatar + Info + Badge ── */}
      <div className="flex items-start gap-3 mb-4">

        {/* Patient initials avatar */}
        <div
          className="w-[42px] h-[42px] rounded-full flex items-center justify-center font-cairo font-bold text-[15px] flex-shrink-0 select-none"
          style={{ backgroundColor: avatarColor.bg, color: avatarColor.text }}
        >
          {initials}
        </div>

        {/* Patient details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-cairo text-[15px] leading-[22px] font-semibold text-[#111827] truncate">
              {patientName}
            </h3>
            {/* Visit type badge */}
            <span className={`shrink-0 font-cairo text-[11px] leading-[16px] font-semibold px-2.5 py-1 rounded-full ${badge.bg} ${badge.text}`}>
              {badge.label}
            </span>
          </div>

          {/* Sub-line: age · sex · time */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {patientAge && (
              <span className="font-cairo text-[12px] text-[#6B7280]">{patientAge} سنة</span>
            )}
            {patientSex && patientAge && (
              <span className="text-[#D1D5DB] text-[10px]">·</span>
            )}
            {patientSex && (
              <span className="font-cairo text-[12px] text-[#6B7280]">
                {patientSex === 'male' ? 'ذكر' : patientSex === 'female' ? 'أنثى' : patientSex}
              </span>
            )}
            {timeInfo && (patientAge || patientSex) && (
              <span className="text-[#D1D5DB] text-[10px]">·</span>
            )}
            {timeInfo && (
              <span className={`flex items-center gap-1 font-cairo text-[12px] font-medium ${
                timeInfo.isLate ? 'text-[#EF4444]' : 'text-[#6B7280]'
              }`}>
                <Clock className="w-[11px] h-[11px]" strokeWidth={2} />
                {timeInfo.display}
                {timeInfo.isLate && <span className="text-[10px]">(متأخر)</span>}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Description / complaint */}
      {description && (
        <p className="font-cairo text-[13px] leading-[20px] font-normal text-[#4B5563] text-right mb-4 pr-[54px] border-r-2 border-[#F3F4F6]">
          {description}
        </p>
      )}

      {/* ── Action buttons ── */}
      <div className="flex gap-2.5">
        <button
          onClick={() => router.push(`/doctor/patients/${patientId}`)}
          className="flex-1 h-[44px] bg-[#F9FAFB] border-[0.8px] border-[#E5E7EB] rounded-[10px] font-cairo text-[13px] font-semibold text-[#374151] text-center transition-all hover:bg-[#F3F4F6] hover:border-[#D1D5DB] active:scale-[0.98]"
        >
          {ar.viewFile}
        </button>

        <button
          onClick={() => router.push(`/doctor/session?patientId=${patientId}${appointmentId ? `&appointmentId=${appointmentId}` : ''}`)}
          className={`flex-1 h-[44px] rounded-[10px] font-cairo text-[13px] font-semibold text-white text-center transition-all active:scale-[0.98] shadow-sm ${
            isEmergency
              ? 'bg-[#EF4444] hover:bg-[#DC2626] shadow-red-100'
              : 'bg-[#16A34A] hover:bg-[#15803D] shadow-green-100'
          }`}
        >
          {ar.startSession}
        </button>
      </div>
    </div>
  )
}
