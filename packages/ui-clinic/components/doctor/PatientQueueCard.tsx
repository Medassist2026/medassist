'use client'

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
  /** Called when "عرض الملف" is tapped — opens quick drawer instead of navigating */
  onViewFile?: (patientId: string, patientName: string, extra?: { visitType?: 'new' | 'followup' | 'emergency'; chiefComplaint?: string; appointmentTime?: string }) => void
  /** Called when "بدء الجلسة" is tapped */
  onStartSession?: (patientId: string, appointmentId?: string) => void
}

// ─── Visit type config ───────────────────────────────────────────────────────

const visitConfig: Record<VisitType, {
  label: string
  badgeBg: string
  badgeText: string
  accentColor: string   // left border accent
}> = {
  new: {
    label: ar.newVisit,
    badgeBg: '#EFF6FF',
    badgeText: '#1D4ED8',
    accentColor: '#3B82F6',
  },
  followup: {
    label: ar.followUp,
    badgeBg: '#FFFBEB',
    badgeText: '#B45309',
    accentColor: '#F59E0B',
  },
  emergency: {
    label: ar.emergency,
    badgeBg: '#FEF2F2',
    badgeText: '#B91C1C',
    accentColor: '#EF4444',
  },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format time in Cairo timezone */
function formatTime(isoTime?: string): { display: string; isLate: boolean } | null {
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

function sexLabel(sex?: string) {
  if (!sex) return null
  if (sex === 'male' || sex === 'Male') return 'ذكر'
  if (sex === 'female' || sex === 'Female') return 'أنثى'
  return sex
}

// ─── Component ───────────────────────────────────────────────────────────────

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
  onViewFile,
  onStartSession,
}: PatientQueueCardProps) {
  const cfg = visitConfig[visitType] ?? visitConfig.new
  const timeInfo = formatTime(appointmentTime)
  const sex = sexLabel(patientSex)

  return (
    <div
      className="bg-white rounded-[12px] border border-[#E2E8F0] overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)' }}
    >
      {/* ── Visit type accent bar (top) ── */}
      <div
        className="h-[3px] w-full"
        style={{ backgroundColor: cfg.accentColor, opacity: 0.7 }}
      />

      <div className="px-4 pt-3 pb-4">
        {/* ── Row 1: Name + badge ── */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="font-cairo font-bold text-[15px] text-[#0F172A] leading-snug">
            {patientName}
          </h3>
          <span
            className="shrink-0 font-cairo text-[11px] font-semibold px-2.5 py-0.5 rounded-[4px] leading-5"
            style={{ backgroundColor: cfg.badgeBg, color: cfg.badgeText }}
          >
            {cfg.label}
          </span>
        </div>

        {/* ── Row 2: Demographics + time ── */}
        <div className="flex items-center justify-between gap-2 mb-3">
          {/* Left: age · sex */}
          <div className="flex items-center gap-1.5 font-cairo text-[12px] text-[#64748B]">
            {patientAge && <span>{patientAge} سنة</span>}
            {patientAge && sex && <span className="text-[#CBD5E1]">·</span>}
            {sex && <span>{sex}</span>}
            {!patientAge && !sex && <span className="text-[#CBD5E1]">—</span>}
          </div>

          {/* Right: appointment time */}
          {timeInfo && (
            <span
              className="font-cairo text-[12px] font-medium tabular-nums"
              style={{ color: timeInfo.isLate ? '#EF4444' : '#94A3B8' }}
            >
              {timeInfo.display}
              {timeInfo.isLate && <span className="mr-1 text-[11px]">متأخر</span>}
            </span>
          )}
        </div>

        {/* ── Row 3: Complaint (if any) ── */}
        {description && (
          <div className="mb-3 px-3 py-2 bg-[#F8FAFC] rounded-[8px] border-r-2" style={{ borderColor: cfg.accentColor }}>
            <p className="font-cairo text-[13px] text-[#475569] leading-relaxed">
              {description}
            </p>
          </div>
        )}

        {/* ── Row 4: Actions ── */}
        <div className="flex gap-2">
          {/* View file — ghost button */}
          <button
            onClick={() => onViewFile?.(patientId, patientName)}
            className="flex-1 h-[40px] rounded-[8px] border border-[#E2E8F0] bg-white font-cairo text-[13px] font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC] active:scale-[0.98]"
          >
            {ar.viewFile}
          </button>

          {/* Start session — filled */}
          <button
            onClick={() => onStartSession?.(patientId, appointmentId)}
            className="flex-1 h-[40px] rounded-[8px] font-cairo text-[13px] font-semibold text-white transition-all active:scale-[0.98]"
            style={{
              backgroundColor: visitType === 'emergency' ? '#EF4444' : '#16A34A',
            }}
          >
            {ar.startSession}
          </button>
        </div>
      </div>
    </div>
  )
}
