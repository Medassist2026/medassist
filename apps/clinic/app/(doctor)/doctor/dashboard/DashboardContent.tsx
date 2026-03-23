'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@ui-clinic/components/doctor/DashboardHeader'
import { DashboardEmptyState } from '@ui-clinic/components/doctor/DashboardEmptyState'
import { PatientQueueCard, type VisitType } from '@ui-clinic/components/doctor/PatientQueueCard'

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
// P4: Frontdesk checks in a patient → doctor sees them here → taps "فتح الجلسة"
// ============================================================================

function QueueSection() {
  const router = useRouter()
  const [queue, setQueue] = useState<QueuePatient[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/doctor/queue/today')
      if (res.ok) {
        const data = await res.json()
        setQueue((data.queue || []) as QueuePatient[])
        setLastUpdated(new Date())
      }
    } catch { /* non-critical — silent fail */ }
    finally { setLoading(false) }
  }, [])

  // Initial fetch
  useEffect(() => { fetchQueue() }, [fetchQueue])

  // Poll every 30 seconds — picks up new frontdesk check-ins automatically
  useEffect(() => {
    const interval = setInterval(fetchQueue, 30_000)
    return () => clearInterval(interval)
  }, [fetchQueue])

  if (loading) {
    return (
      <div className="px-4 mb-2">
        <div className="h-[60px] bg-[#F3F4F6] rounded-[12px] animate-pulse" />
      </div>
    )
  }

  if (queue.length === 0) return null

  return (
    <div className="px-4 mb-4">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-cairo font-bold text-[14px] text-[#030712]">قائمة الانتظار</span>
          <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#16A34A] text-[11px] font-cairo font-bold rounded-full">
            {queue.length} مريض
          </span>
          {/* Pulse dot — live indicator */}
          <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
        </div>
        <button
          onClick={fetchQueue}
          className="font-cairo text-[12px] text-[#4B5563] hover:text-[#030712] transition-colors"
          title="تحديث القائمة"
        >
          تحديث
          {lastUpdated && (
            <span className="mr-1 text-[10px] text-[#9CA3AF]">
              {lastUpdated.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
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
          const queueType = item.queue_type === 'emergency' ? 'emergency' : 'new'

          return (
            <div
              key={item.id}
              className={`bg-white rounded-[12px] border-[0.8px] p-4 shadow-sm ${
                isActive
                  ? 'border-[#3B82F6] ring-1 ring-[#BFDBFE]'
                  : 'border-[#D1D5DB]'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  {/* Queue number badge */}
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-cairo font-bold text-[13px] flex-shrink-0 ${
                    isActive ? 'bg-[#3B82F6] text-white' : 'bg-[#F3F4F6] text-[#030712]'
                  }`}>
                    {item.queue_number}
                  </span>
                  <div>
                    <div className="font-cairo font-semibold text-[14px] text-[#030712]">{patientName}</div>
                    <div className="font-cairo text-[11px] text-[#4B5563]" dir="ltr">
                      {patientPhone}
                      {patientAge && ` · ${patientAge} سنة`}
                    </div>
                  </div>
                </div>
                {/* Status badge */}
                <span className={`px-2 py-0.5 text-[11px] font-cairo font-semibold rounded-full ${
                  isActive
                    ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                    : 'bg-[#FEF3C7] text-[#92400E]'
                }`}>
                  {isActive ? 'مع الطبيب' : 'انتظار'}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/doctor/patients/${item.patient_id}`)}
                  className="flex-1 h-[40px] bg-white border-[0.8px] border-[#D1D5DB] rounded-[8px] font-cairo text-[13px] font-semibold text-[#1F2937] hover:bg-[#F9FAFB] transition-colors"
                >
                  عرض الملف
                </button>
                <button
                  onClick={() => router.push(`/doctor/session?patientId=${item.patient_id}`)}
                  className={`flex-1 h-[40px] rounded-[8px] font-cairo text-[13px] font-semibold text-white transition-colors ${
                    isActive
                      ? 'bg-[#3B82F6] hover:bg-[#2563EB]'
                      : 'bg-[#16A34A] hover:bg-[#15803D]'
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
        unreadNotifications={unreadNotifications}
      />

      {/* ===== P4: LIVE QUEUE SECTION ===== */}
      {/* Walk-in patients checked in by frontdesk appear here in real-time */}
      <QueueSection />

      {/* ===== SCHEDULED APPOINTMENTS ===== */}
      {activeAppointments.length === 0 ? (
        <DashboardEmptyState />
      ) : (
        <div className="px-4">
          {activeAppointments.length > 0 && (
            <p className="font-cairo text-[12px] font-semibold text-[#6B7280] mb-3">المواعيد المجدولة</p>
          )}
          {activeAppointments.map((apt, index) => (
            <div key={apt.id}>
              <PatientQueueCard
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
              {/* Divider between cards — 1px #E5E7EB, matching Figma */}
              {index < activeAppointments.length - 1 && (
                <div className="h-[1px] bg-[#E5E7EB] my-3" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
