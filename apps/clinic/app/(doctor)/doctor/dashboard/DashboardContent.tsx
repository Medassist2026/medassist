'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@ui-clinic/components/doctor/DashboardHeader'
import { DashboardEmptyState } from '@ui-clinic/components/doctor/DashboardEmptyState'
import { PatientQueueCard, type VisitType } from '@ui-clinic/components/doctor/PatientQueueCard'
import { PatientQuickDrawer } from '@ui-clinic/components/doctor/PatientQuickDrawer'
import { Clock, RefreshCw, Timer } from 'lucide-react'

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
// QUEUE SECTION
// ============================================================================

interface QueueSectionProps {
  onQueueUpdate?: (count: number) => void
  onViewFile?: (patientId: string, patientName: string, extra?: { visitType?: 'new' | 'followup' | 'emergency'; chiefComplaint?: string; appointmentTime?: string }) => void
  onStartSession?: (patientId: string, appointmentId?: string, queueId?: string) => void
}

function QueueSection({ onQueueUpdate, onViewFile, onStartSession }: QueueSectionProps) {
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
    } catch { /* non-critical */ }
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
        <div className="h-[80px] bg-[#F8FAFC] rounded-[12px] animate-pulse border border-[#F1F5F9]" />
      </div>
    )
  }

  if (queue.length === 0) return null

  return (
    <div className="px-4 mb-5">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-cairo font-bold text-[13px] text-[#0F172A]">قائمة الانتظار</span>
          <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#15803D] text-[10px] font-cairo font-bold rounded-full">
            {queue.length}
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
        </div>
        <button
          onClick={() => fetchQueue(true)}
          disabled={refreshing}
          className="flex items-center gap-1 font-cairo text-[12px] text-[#94A3B8] hover:text-[#475569] transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-[11px] h-[11px] ${refreshing ? 'animate-spin' : ''}`} strokeWidth={2} />
          {lastUpdated && (
            <span>
              {lastUpdated.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })}
            </span>
          )}
        </button>
      </div>

      {/* Queue cards */}
      <div className="space-y-3">
        {queue.map((item) => {
          const isActive = item.status === 'in_progress'
          const patientName = item.patient?.full_name || 'مريض'
          const queueType: VisitType = item.queue_type === 'emergency' ? 'emergency' : 'new'

          // Calculate waiting time in minutes
          const waitMinutes = Math.floor((Date.now() - new Date(item.checked_in_at).getTime()) / 60000)
          const waitLabel = waitMinutes < 1 ? 'الآن' : waitMinutes < 60 ? `${waitMinutes} د` : `${Math.floor(waitMinutes / 60)}س ${waitMinutes % 60}د`
          const waitColor = waitMinutes >= 30 ? 'text-[#EF4444]' : waitMinutes >= 15 ? 'text-[#D97706]' : 'text-[#64748B]'

          return (
            <div
              key={item.id}
              className={`bg-white rounded-[12px] border overflow-hidden transition-all ${
                isActive ? 'border-[#93C5FD]' : 'border-[#E2E8F0]'
              }`}
              style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}
            >
              {/* Accent bar */}
              <div className={`h-[3px] w-full ${isActive ? 'bg-[#3B82F6]' : 'bg-[#22C55E]'} opacity-70`} />

              <div className="px-4 pt-3 pb-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    {/* Queue number */}
                    <span className={`w-[28px] h-[28px] rounded-full flex items-center justify-center font-cairo font-bold text-[12px] flex-shrink-0 ${
                      isActive ? 'bg-[#DBEAFE] text-[#1D4ED8]' : 'bg-[#F1F5F9] text-[#475569]'
                    }`}>
                      {item.queue_number}
                    </span>
                    <div>
                      <p className="font-cairo font-bold text-[14px] text-[#0F172A]">{patientName}</p>
                      {item.patient?.age && (
                        <p className="font-cairo text-[11px] text-[#94A3B8]">
                          {item.patient.age} سنة
                          {item.patient.phone && (
                            <span dir="ltr"> · {item.patient.phone}</span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`shrink-0 font-cairo text-[11px] font-semibold px-2.5 py-0.5 rounded-[4px] ${
                      isActive ? 'bg-[#EFF6FF] text-[#1D4ED8]' : 'bg-[#F0FDF4] text-[#15803D]'
                    }`}>
                      {isActive ? 'مع الطبيب' : 'انتظار'}
                    </span>
                    {/* Waiting time indicator */}
                    <span className={`flex items-center gap-0.5 font-cairo text-[10px] font-medium ${waitColor}`}>
                      <Timer className="w-[9px] h-[9px]" strokeWidth={2} />
                      {waitLabel}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => onViewFile?.(item.patient_id, patientName, { visitType: queueType })}
                    className="flex-1 h-[38px] rounded-[8px] border border-[#E2E8F0] bg-white font-cairo text-[12px] font-semibold text-[#334155] hover:bg-[#F8FAFC] transition-colors active:scale-[0.98]"
                  >
                    عرض الملف
                  </button>
                  <button
                    onClick={() => onStartSession?.(item.patient_id, undefined, item.id)}
                    className={`flex-1 h-[38px] rounded-[8px] font-cairo text-[12px] font-semibold text-white transition-all active:scale-[0.98] ${
                      isActive ? 'bg-[#3B82F6] hover:bg-[#2563EB]' : 'bg-[#16A34A] hover:bg-[#15803D]'
                    }`}
                  >
                    فتح الجلسة
                  </button>
                </div>
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
  return 'new'
}

function SectionLabel({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-4 mb-3">
      {icon}
      <span className="font-cairo font-bold text-[13px] text-[#0F172A]">{label}</span>
      <span className="px-2 py-0.5 bg-[#F1F5F9] text-[#475569] text-[10px] font-cairo font-bold rounded-full">
        {count}
      </span>
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
  const router = useRouter()
  const [waitingCount, setWaitingCount] = useState<number | undefined>(undefined)

  // Drawer state — full context for the quick-view panel
  const [drawer, setDrawer] = useState<{
    patientId: string
    patientName?: string
    visitType?: 'new' | 'followup' | 'emergency'
    chiefComplaint?: string
    appointmentTime?: string
  } | null>(null)

  const openDrawer = useCallback((
    patientId: string,
    patientName: string,
    extra?: { visitType?: 'new' | 'followup' | 'emergency'; chiefComplaint?: string; appointmentTime?: string }
  ) => {
    setDrawer({ patientId, patientName, ...extra })
  }, [])

  const closeDrawer = useCallback(() => setDrawer(null), [])

  const handleStartSession = useCallback((patientId: string, appointmentId?: string, queueId?: string) => {
    const params = new URLSearchParams({ patientId })
    if (appointmentId) params.set('appointmentId', appointmentId)
    if (queueId) params.set('queueId', queueId)
    router.push(`/doctor/session?${params.toString()}`)
  }, [router])

  const activeAppointments = appointments.filter(
    a => a.status !== 'cancelled' && a.status !== 'no_show'
  )

  // Show empty state only when queue is loaded (waitingCount !== undefined) and both queue + appointments are empty
  const showEmptyState = activeAppointments.length === 0 && waitingCount === 0

  return (
    <>
      {/* ── Patient Quick Drawer ── */}
      <PatientQuickDrawer
        patientId={drawer?.patientId ?? null}
        patientName={drawer?.patientName}
        visitType={drawer?.visitType}
        chiefComplaint={drawer?.chiefComplaint}
        appointmentTime={drawer?.appointmentTime}
        onClose={closeDrawer}
      />

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

        {/* Live queue */}
        <QueueSection
          onQueueUpdate={setWaitingCount}
          onViewFile={openDrawer}
          onStartSession={handleStartSession}
        />

        {/* Scheduled appointments */}
        {activeAppointments.length > 0 && (
          <div>
            <SectionLabel
              icon={<Clock className="w-[13px] h-[13px] text-[#94A3B8]" strokeWidth={1.67} />}
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
                  onViewFile={(patientId, patientName) => openDrawer(patientId, patientName, {
                    visitType: deriveVisitType(apt),
                    chiefComplaint: apt.description,
                    appointmentTime: apt.start_time,
                  })}
                  onStartSession={handleStartSession}
                />
              ))}
            </div>
            <div className="h-8" />
          </div>
        )}

        {/* Empty state — only when queue is loaded and both queue + appointments are empty */}
        {showEmptyState && <DashboardEmptyState />}
      </div>
    </>
  )
}
