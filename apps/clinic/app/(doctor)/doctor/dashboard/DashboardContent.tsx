'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@ui-clinic/components/doctor/DashboardHeader'
import { DashboardEmptyState } from '@ui-clinic/components/doctor/DashboardEmptyState'
import { PatientQueueCard, type VisitType } from '@ui-clinic/components/doctor/PatientQueueCard'
import { Clock, RefreshCw } from 'lucide-react'

interface Appointment {
  id: string
  patient_id: string
  patient_name: string
  patient_phone?: string
  patient_age?: number
  patient_sex?: string
  start_time: string
  duration_minutes: number
  status: string
  type?: string
  description?: string
}

interface ClinicOption {
  id: string
  name: string
}

interface DashboardContentProps {
  doctorName: string
  clinicName?: string
  clinicId?: string
  allClinics?: ClinicOption[]
  appointments: Appointment[]
  unreadNotifications?: number
}

// ============================================================================
// QUEUE ITEM (frontdesk check-in)
// ============================================================================

interface QueuePatient {
  id: string
  patient_id: string
  queue_number: number
  queue_type: string
  status: 'waiting' | 'in_progress'
  checked_in_at: string
  patient?: {
    full_name?: string
    phone?: string
    age?: number
    sex?: string
  }
}

// ============================================================================
// QUEUE SECTION — polls /api/doctor/queue/today every 30 seconds
// ============================================================================

interface QueueSectionProps {
  onQueueUpdate?: (count: number) => void
}

function QueueSection({ onQueueUpdate }: QueueSectionProps) {
  const router = useRouter()
  const [queue, setQueue] = useState<QueuePatient[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchQueue = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    try {
      const res = await fetch('/api/doctor/queue/today')
      if (res.ok) {
        const data = await res.json()
        const q = (data.queue || []) as QueuePatient[]
        setQueue(q)
        setLastUpdated(new Date())
        onQueueUpdate?.(q.filter(p => p.status === 'waiting').length)
      }
    } catch { /* non-critical — silent fail */ }
    finally {
      setLoading(false)
      if (isManual) setRefreshing(false)
    }
  }, [onQueueUpdate])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  useEffect(() => {
    const interval = setInterval(() => fetchQueue(), 30_000)
    return () => clearInterval(interval)
  }, [fetchQueue])

  if (loading) {
    return (
      <div className="px-4 mb-4">
        <div className="h-[72px] bg-[#F9FAFB] rounded-[14px] animate-pulse border border-[#F3F4F6]" />
      </div>
    )
  }

  if (queue.length === 0) return null

  return (
    <div className="px-4 mb-5">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-cairo font-bold text-[14px] text-[#111827]">قائمة الانتظار</span>
          <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#15803D] text-[11px] font-cairo font-bold rounded-full">
            {queue.length} مريض
          </span>
          {/* Live pulse dot */}
          <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
        </div>
        <button
          onClick={() => fetchQueue(true)}
          disabled={refreshing}
          className="flex items-center gap-1 font-cairo text-[12px] text-[#6B7280] hover:text-[#111827] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-[12px] h-[12px] ${refreshing ? 'animate-spin' : ''}`} strokeWidth={2} />
          {lastUpdated && (
            <span className="text-[11px] text-[#9CA3AF]">
              {lastUpdated.toLocaleTimeString('ar-EG', {
                hour: '2-digit', minute: '2-digit',
                timeZone: 'Africa/Cairo',
              })}
            </span>
          )}
        </button>
      </div>

      {/* Queue cards */}
      <div className="space-y-3">
        {queue.map((item) => {
          const isActive = item.status === 'in_progress'
          const patientName = item.patient?.full_name || 'مريض'
          const patientPhone = item.patient?.phone || ''
          const patientAge = item.patient?.age
          const queueType: VisitType = item.queue_type === 'emergency' ? 'emergency' : 'new'

          return (
            <div
              key={item.id}
              className={`bg-white rounded-[14px] border-[0.8px] p-4 shadow-sm transition-all ${
                isActive
                  ? 'border-[#93C5FD] ring-1 ring-[#DBEAFE]'
                  : 'border-[#E5E7EB]'
              }`}
            >
              <div className="flex items-start justify-between mb-3 gap-3">
                <div className="flex items-center gap-3">
                  {/* Queue number badge */}
                  <span className={`w-[34px] h-[34px] rounded-full flex items-center justify-center font-cairo font-bold text-[13px] flex-shrink-0 ${
                    isActive ? 'bg-[#3B82F6] text-white' : 'bg-[#F3F4F6] text-[#374151]'
                  }`}>
                    {item.queue_number}
                  </span>
                  <div>
                    <div className="font-cairo font-semibold text-[14px] text-[#111827]">{patientName}</div>
                    <div className="font-cairo text-[11px] text-[#6B7280] mt-0.5" dir="ltr">
                      {patientPhone}
                      {patientAge && ` · ${patientAge} سنة`}
                    </div>
                  </div>
                </div>
                {/* Status badge */}
                <span className={`shrink-0 px-2.5 py-1 text-[11px] font-cairo font-semibold rounded-full ${
                  isActive
                    ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                    : 'bg-[#FEF9C3] text-[#854D0E]'
                }`}>
                  {isActive ? 'مع الطبيب' : 'انتظار'}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2.5">
                <button
                  onClick={() => router.push(`/doctor/patients/${item.patient_id}`)}
                  className="flex-1 h-[40px] bg-[#F9FAFB] border-[0.8px] border-[#E5E7EB] rounded-[9px] font-cairo text-[13px] font-semibold text-[#374151] hover:bg-[#F3F4F6] transition-all active:scale-[0.98]"
                >
                  عرض الملف
                </button>
                <button
                  onClick={() => router.push(`/doctor/session?patientId=${item.patient_id}`)}
                  className={`flex-1 h-[40px] rounded-[9px] font-cairo text-[13px] font-semibold text-white transition-all active:scale-[0.98] shadow-sm ${
                    isActive
                      ? 'bg-[#3B82F6] hover:bg-[#2563EB] shadow-blue-100'
                      : 'bg-[#16A34A] hover:bg-[#15803D] shadow-green-100'
                  }`}
                >
                  فتح الجلسة
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// HELPERS
// ============================================================================

function deriveVisitType(apt: Appointment): VisitType {
  if (apt.type === 'emergency' || apt.type === 'طارئ') return 'emergency'
  if (apt.type === 'followup' || apt.type === 'follow_up' || apt.type === 'إعادة كشف') return 'followup'
  if (apt.type === 'new' || apt.type === 'كشف جديد') return 'new'
  return 'new'
}

/** Section label pill */
function SectionLabel({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex items-center justify-between px-4 mb-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-cairo font-bold text-[14px] text-[#111827]">{label}</span>
        <span className="px-2 py-0.5 bg-[#F3F4F6] text-[#4B5563] text-[11px] font-cairo font-bold rounded-full">
          {count}
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DashboardContent({
  doctorName,
  clinicName,
  clinicId,
  allClinics,
  appointments,
  unreadNotifications,
}: DashboardContentProps) {
  const [waitingCount, setWaitingCount] = useState<number | undefined>(undefined)

  const activeAppointments = appointments.filter(
    a => a.status !== 'cancelled' && a.status !== 'no_show'
  )

  return (
    <div>
      <DashboardHeader
        doctorName={doctorName}
        clinicName={clinicName}
        clinicId={clinicId}
        allClinics={allClinics}
        expectedCount={activeAppointments.length}
        waitingCount={waitingCount}
        unreadNotifications={unreadNotifications}
      />

      {/* ===== P4: LIVE QUEUE SECTION ===== */}
      <QueueSection onQueueUpdate={setWaitingCount} />

      {/* ===== SCHEDULED APPOINTMENTS ===== */}
      {activeAppointments.length === 0 ? (
        <DashboardEmptyState />
      ) : (
        <div>
          <SectionLabel
            icon={<Clock className="w-[14px] h-[14px] text-[#6B7280]" strokeWidth={1.67} />}
            label="المواعيد المجدولة"
            count={activeAppointments.length}
          />
          <div className="px-4 space-y-3">
            {activeAppointments.map((apt) => (
              <PatientQueueCard
                key={apt.id}
                patientId={apt.patient_id}
                patientName={apt.patient_name}
                patientPhone={apt.patient_phone}
                patientAge={apt.patient_age}
                patientSex={apt.patient_sex}
                visitType={deriveVisitType(apt)}
                appointmentId={apt.id}
                appointmentTime={apt.start_time}
                description={apt.description}
              />
            ))}
          </div>
          {/* Bottom breathing room */}
          <div className="h-6" />
        </div>
      )}
    </div>
  )
}
