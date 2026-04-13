'use client'

import { useState, useEffect } from 'react'

// ============================================================================
// TYPES
// ============================================================================

type QueueStatus = 'waiting' | 'in_progress' | 'completed' | 'no_show'
type VisitType = 'walk_in' | 'appointment'

interface QueuePatientCardProps {
  queueNumber: number
  patientName: string
  doctorName?: string
  status: QueueStatus
  visitType: VisitType
  appointmentTime?: string
  checkedInAt: string
  onCallPatient: () => void
  onCollectPayment: () => void
  onMarkNoShow: () => void
  onReschedule: () => void
  isNextInQueue: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

function formatArabicTime(isoDate: string): string {
  const d = new Date(isoDate)
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}

function useWaitTime(checkedInAt: string): { text: string; colorClass: string } {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(interval)
  }, [])

  const diffMs = now - new Date(checkedInAt).getTime()
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60000))

  let text: string
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60)
    const mins = totalMinutes % 60
    text = `${hours.toLocaleString('ar-EG')} ساعة ${mins.toLocaleString('ar-EG')} دقيقة`
  } else {
    text = `${totalMinutes.toLocaleString('ar-EG')} دقيقة`
  }

  let colorClass = 'text-[#4B5563]'
  if (totalMinutes >= 40) {
    colorClass = 'text-[#DC2626]'
  } else if (totalMinutes >= 20) {
    colorClass = 'text-[#F59E0B]'
  }

  return { text, colorClass }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function QueuePatientCard({
  queueNumber,
  patientName,
  doctorName,
  status,
  visitType,
  appointmentTime,
  checkedInAt,
  onCallPatient,
  onCollectPayment,
  onMarkNoShow,
  onReschedule,
  isNextInQueue,
}: QueuePatientCardProps) {
  const { text: waitTimeText, colorClass: waitTimeColor } = useWaitTime(checkedInAt)
  const [confirmNoShow, setConfirmNoShow] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // --- Status-specific rendering ---

  if (status === 'completed') {
    return (
      <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3.5 opacity-40">
        <div className="flex items-center gap-3">
          <span className="font-cairo text-[14px] font-bold text-[#030712]">
            #{queueNumber.toLocaleString('ar-EG')}
          </span>
          <span className="font-cairo text-[14px] text-[#030712] flex-1 truncate">
            {patientName}
          </span>
          <span className="font-cairo text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#16A34A]">
            تم ✓
          </span>
        </div>
      </div>
    )
  }

  if (status === 'no_show') {
    return (
      <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3.5 opacity-40">
        <div className="flex items-center gap-3">
          <span className="font-cairo text-[14px] font-bold text-[#030712]">
            #{queueNumber.toLocaleString('ar-EG')}
          </span>
          <span className="font-cairo text-[14px] text-[#030712] flex-1 truncate line-through">
            {patientName}
          </span>
          <span className="font-cairo text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#F3F4F6] text-[#9CA3AF]">
            لم يحضر
          </span>
        </div>
      </div>
    )
  }

  if (status === 'in_progress') {
    return (
      <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3.5 opacity-60">
        <div className="flex items-center gap-3">
          <span className="font-cairo text-[14px] font-bold text-[#030712]">
            #{queueNumber.toLocaleString('ar-EG')}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-cairo text-[14px] font-semibold text-[#030712] truncate">
                {patientName}
              </span>
              {visitType === 'appointment' && appointmentTime && (
                <span className="font-cairo text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] flex-shrink-0">
                  موعد {formatArabicTime(appointmentTime)}
                </span>
              )}
              {visitType === 'walk_in' && (
                <span className="font-cairo text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#F3F4F6] text-[#4B5563] flex-shrink-0">
                  زيارة حرة
                </span>
              )}
            </div>
            {doctorName && (
              <p className="font-cairo text-[12px] text-[#9CA3AF] mt-0.5">{doctorName}</p>
            )}
          </div>
          <span className="font-cairo text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#16A34A] flex-shrink-0">
            مع الطبيب
          </span>
        </div>
      </div>
    )
  }

  // --- Waiting status (default, with actions) ---

  const handleNoShow = async () => {
    if (!confirmNoShow) {
      setConfirmNoShow(true)
      return
    }
    setIsSubmitting(true)
    try {
      await onMarkNoShow()
    } finally {
      setIsSubmitting(false)
      setConfirmNoShow(false)
    }
  }

  return (
    <div
      className={`bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3.5 ${
        isNextInQueue ? 'border-s-4 border-s-[#16A34A]' : ''
      }`}
    >
      {/* Row 1: Queue# + Name + Visit type badge */}
      <div className="flex items-center gap-3">
        <span className="font-cairo text-[14px] font-bold text-[#030712]">
          #{queueNumber.toLocaleString('ar-EG')}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-cairo text-[14px] font-semibold text-[#030712] truncate">
              {patientName}
            </span>
            {visitType === 'appointment' && appointmentTime && (
              <span className="font-cairo text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] flex-shrink-0">
                موعد {formatArabicTime(appointmentTime)}
              </span>
            )}
            {visitType === 'walk_in' && (
              <span className="font-cairo text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#F3F4F6] text-[#4B5563] flex-shrink-0">
                زيارة حرة
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Doctor name + Wait time */}
      <div className="flex items-center gap-2 mt-1.5">
        {doctorName && (
          <>
            <span className="font-cairo text-[12px] text-[#9CA3AF]">{doctorName}</span>
            <span className="text-[#D1D5DB]">·</span>
          </>
        )}
        <span className={`font-cairo text-[12px] ${waitTimeColor}`}>
          {waitTimeText} ⏱
        </span>
      </div>

      {/* Row 3: Action buttons */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={onCallPatient}
          className="h-[36px] px-3 rounded-[8px] bg-[#16A34A] text-white font-cairo text-sm font-medium"
        >
          استدعاء
        </button>
        <button
          onClick={onCollectPayment}
          className="h-[36px] px-3 rounded-[8px] bg-white border border-[#E5E7EB] text-[#030712] font-cairo text-sm font-medium"
        >
          دفع
        </button>
        <button
          onClick={onReschedule}
          className="h-[36px] px-3 rounded-[8px] bg-white border border-[#E5E7EB] text-[#030712] font-cairo text-sm font-medium"
        >
          تأجيل
        </button>
        <button
          onClick={handleNoShow}
          disabled={isSubmitting}
          className="h-[36px] px-3 rounded-[8px] bg-white border border-[#DC2626] text-[#DC2626] font-cairo text-sm font-medium disabled:opacity-40"
        >
          {confirmNoShow ? 'تأكيد؟' : 'لم يحضر'}
        </button>
      </div>
    </div>
  )
}
