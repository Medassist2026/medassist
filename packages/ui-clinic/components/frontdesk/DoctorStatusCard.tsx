'use client'

import { useEffect, useState } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface DoctorStatusCardProps {
  doctorName: string
  status: 'in_session' | 'available' | 'away'
  currentPatient?: {
    name: string
    queueNumber: number
  }
  sessionStartedAt?: string
  waitingCount: number
  nextPatientName?: string
}

// Re-export old interface for backward compat with dashboard deriveDoctorStatuses
interface DoctorStatus {
  doctorId: string
  doctorName: string
  specialty: string
  currentPatient?: {
    name: string
    queueNumber: number
    startedAt: string
  }
  waitingCount: number
  nextPatient?: {
    name: string
    queueNumber: number
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function formatSecondsArabic(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  const mStr = mins.toLocaleString('ar-EG').padStart(2, '٠')
  const sStr = secs.toLocaleString('ar-EG').padStart(2, '٠')
  return `${mStr}:${sStr}`
}

function getProgressColor(seconds: number): string {
  if (seconds > 1200) return '#DC2626'    // over 20 min → red
  if (seconds >= 900) return '#F59E0B'    // 15–20 min → orange
  return '#16A34A'                         // under 15 min → green
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DoctorStatusCard({
  doctorName,
  status,
  currentPatient,
  sessionStartedAt,
  waitingCount,
  nextPatientName,
}: DoctorStatusCardProps) {
  const [elapsed, setElapsed] = useState(0)

  // Live session timer — updates every second
  useEffect(() => {
    if (status !== 'in_session' || !sessionStartedAt) return

    const started = new Date(sessionStartedAt).getTime()
    const update = () => {
      const secs = Math.max(0, Math.floor((Date.now() - started) / 1000))
      setElapsed(secs)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [status, sessionStartedAt])

  const progressPercent = Math.min((elapsed / 1200) * 100, 100)
  const progressColor = getProgressColor(elapsed)

  const isAway = status === 'away'
  const cardOpacity = isAway ? 'opacity-60' : ''

  return (
    <div className={`bg-white rounded-[12px] shadow-sm p-4 ${cardOpacity}`}>
      {/* Row 1: Doctor name + Status badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              status === 'away' ? 'bg-[#9CA3AF]' : 'bg-[#16A34A]'
            }`}
          />
          <span className="font-cairo text-[15px] font-bold text-[#030712]">
            {doctorName}
          </span>
        </div>
        {status === 'in_session' && (
          <span className="font-cairo text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#16A34A]">
            في جلسة
          </span>
        )}
        {status === 'available' && (
          <span className="font-cairo text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#16A34A]">
            متاح
          </span>
        )}
        {status === 'away' && (
          <span className="font-cairo text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#F3F4F6] text-[#9CA3AF]">
            غير متاح
          </span>
        )}
      </div>

      {/* Row 2: Current patient + Timer (in_session only) */}
      {status === 'in_session' && currentPatient && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="font-cairo text-[13px] text-[#4B5563]">
              {currentPatient.name} · #{currentPatient.queueNumber.toLocaleString('ar-EG')}
            </span>
            <span className="font-cairo text-[13px] font-medium text-[#030712]">
              {formatSecondsArabic(elapsed)} ⏱
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-[#E5E7EB] mb-2">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: progressColor,
              }}
            />
          </div>
        </>
      )}

      {/* Footer: Waiting count + Next patient */}
      <div className="flex items-center justify-between">
        <span className="font-cairo text-[12px] text-[#9CA3AF]">
          {waitingCount.toLocaleString('ar-EG')} في الانتظار
        </span>
        {nextPatientName && (
          <span className="font-cairo text-[12px] text-[#9CA3AF]">
            التالي: {nextPatientName}
          </span>
        )}
      </div>
    </div>
  )
}

// Legacy adapter — keeps existing dashboard import working during transition
export function DoctorStatusCardLegacy({ doctor }: { doctor: DoctorStatus }) {
  const isBusy = !!doctor.currentPatient
  const derivedStatus: 'in_session' | 'available' | 'away' = isBusy ? 'in_session' : 'available'

  return (
    <DoctorStatusCard
      doctorName={`د. ${doctor.doctorName}`}
      status={derivedStatus}
      currentPatient={
        doctor.currentPatient
          ? { name: doctor.currentPatient.name, queueNumber: doctor.currentPatient.queueNumber }
          : undefined
      }
      sessionStartedAt={doctor.currentPatient?.startedAt}
      waitingCount={doctor.waitingCount}
      nextPatientName={doctor.nextPatient?.name}
    />
  )
}
