'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  StatusLegend,
  HelpIcon,
  APPOINTMENT_STATUS_LEGEND
} from '@shared/components/ui/HelpTooltips'

// ============================================================================
// TYPES
// ============================================================================

interface Appointment {
  id: string
  patient_id: string
  patient_name: string
  patient_phone?: string
  patient_age?: number
  patient_sex?: string
  start_time: string
  duration_minutes: number
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  type?: string
}

interface AppointmentsListProps {
  appointments?: Appointment[]
  showStatusGuide?: boolean
  compact?: boolean
}

// ============================================================================
// APPOINTMENTS LIST COMPONENT
// Enhanced with status legend (UX-D008)
// ============================================================================

export function AppointmentsList({
  appointments: propAppointments,
  showStatusGuide = true,
  compact = false
}: AppointmentsListProps) {
  const router = useRouter()
  const [appointments, setAppointments] = useState<Appointment[]>(propAppointments || [])
  const [loading, setLoading] = useState(!propAppointments)
  const [showLegend, setShowLegend] = useState(false)
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed'>('all')

  useEffect(() => {
    if (propAppointments) {
      setAppointments(propAppointments)
      return
    }

    const loadAppointments = async () => {
      try {
        const today = new Date().toISOString().split('T')[0]
        const res = await fetch(`/api/doctor/appointments?date=${today}`)
        if (res.ok) {
          const data = await res.json()
          setAppointments(data.appointments || [])
        }
      } catch (error) {
        console.error('Failed to load appointments:', error)
      } finally {
        setLoading(false)
      }
    }

    loadAppointments()
  }, [propAppointments])

  // Filter appointments
  const filteredAppointments = appointments.filter(apt => {
    if (filter === 'upcoming') {
      return apt.status === 'scheduled' || apt.status === 'confirmed'
    }
    if (filter === 'completed') {
      return apt.status === 'completed'
    }
    return true
  })

  // Check if appointment is current (within 10 minutes)
  const isCurrentAppointment = (apt: Appointment) => {
    const aptTime = new Date(apt.start_time).getTime()
    const now = Date.now()
    const tenMinutes = 10 * 60 * 1000
    return aptTime <= now + tenMinutes && aptTime >= now - tenMinutes
  }

  // Get status styling
  const getStatusStyle = (status: string, isCurrent: boolean) => {
    if (isCurrent) {
      return 'bg-primary-100 border-primary-400 animate-pulse'
    }

    switch (status) {
      case 'confirmed':
        return 'bg-green-50 border-green-200'
      case 'completed':
        return 'bg-gray-50 border-gray-200'
      case 'cancelled':
        return 'bg-red-50 border-red-200 opacity-60'
      case 'no_show':
        return 'bg-red-50 border-red-200 opacity-60'
      default:
        return 'bg-white border-gray-200'
    }
  }

  // Get status badge
  const getStatusBadge = (status: string) => {
    const styles = {
      scheduled: 'bg-blue-50 text-blue-700',
      confirmed: 'bg-green-50 text-green-700',
      completed: 'bg-gray-50 text-gray-600',
      cancelled: 'bg-red-50 text-red-600',
      no_show: 'bg-red-50 text-red-600'
    }

    const labels = {
      scheduled: 'مجدول',
      confirmed: 'مؤكد',
      completed: 'مكتمل',
      cancelled: 'ملغي',
      no_show: 'لم يحضر'
    }

    return (
      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${styles[status as keyof typeof styles] || styles.scheduled}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    )
  }

  // Handle appointment click
  const handleAppointmentClick = (apt: Appointment) => {
    if (apt.status === 'cancelled' || apt.status === 'no_show') {
      return
    }
    router.push(`/doctor/session?patientId=${apt.patient_id}&appointmentId=${apt.id}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header with Status Guide Toggle (UX-D008) */}
      {showStatusGuide && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">
              مواعيد اليوم
            </h3>
            <HelpIcon
              content="اضغط على الموعد لبدء جلسة سريرية مع المريض"
              position="right"
            />
          </div>
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            دليل الحالة
          </button>
        </div>
      )}

      {/* Status Legend (UX-D008) */}
      {showLegend && (
        <StatusLegend
          items={APPOINTMENT_STATUS_LEGEND}
          title="دليل حالة المواعيد"
        />
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-100 pb-2">
        {[
          { key: 'all', label: 'الكل', count: appointments.length },
          { key: 'upcoming', label: 'قادمة', count: appointments.filter(a => a.status === 'scheduled' || a.status === 'confirmed').length },
          { key: 'completed', label: 'مكتملة', count: appointments.filter(a => a.status === 'completed').length }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as any)}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              filter === tab.key
                ? 'bg-primary-100 text-primary-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Appointments List */}
      {filteredAppointments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p>لا توجد مواعيد</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAppointments.map((apt) => {
            const isCurrent = isCurrentAppointment(apt)
            const isClickable = apt.status !== 'cancelled' && apt.status !== 'no_show'

            return (
              <div
                key={apt.id}
                onClick={() => isClickable && handleAppointmentClick(apt)}
                className={`p-4 rounded-xl border-2 transition-all ${
                  getStatusStyle(apt.status, isCurrent)
                } ${isClickable ? 'cursor-pointer hover:shadow-hover' : 'cursor-not-allowed'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {/* Time */}
                    <div className="text-center min-w-[60px]">
                      <div className={`text-lg font-bold ${isCurrent ? 'text-primary-600' : 'text-gray-900'}`}>
                        {new Date(apt.start_time).toLocaleTimeString('ar-EG', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </div>
                      <div className="text-xs text-gray-500">
                        {apt.duration_minutes} د
                      </div>
                    </div>

                    {/* Patient Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${isCurrent ? 'text-primary-800' : 'text-gray-900'}`}>
                          {apt.patient_name}
                        </span>
                        {isCurrent && (
                          <span className="text-xs bg-primary-600 text-white px-2 py-0.5 rounded-full animate-pulse">
                            الآن
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 mt-0.5">
                        {apt.patient_phone}
                        {apt.patient_age && ` · ${apt.patient_age}y`}
                        {apt.patient_sex && ` · ${apt.patient_sex.charAt(0).toUpperCase()}`}
                      </div>
                      {apt.type && (
                        <div className="text-xs text-gray-400 mt-1">
                          {apt.type}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(apt.status)}
                    {isClickable && (
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Summary Stats */}
      {!compact && appointments.length > 0 && (
        <div className="grid grid-cols-4 gap-2 pt-4 border-t border-gray-100">
          <div className="text-center">
            <div className="text-lg font-bold text-blue-600">
              {appointments.filter(a => a.status === 'scheduled').length}
            </div>
            <div className="text-xs text-gray-500">مجدولة</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">
              {appointments.filter(a => a.status === 'confirmed').length}
            </div>
            <div className="text-xs text-gray-500">مؤكدة</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-gray-600">
              {appointments.filter(a => a.status === 'completed').length}
            </div>
            <div className="text-xs text-gray-500">مكتملة</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-600">
              {appointments.filter(a => a.status === 'cancelled' || a.status === 'no_show').length}
            </div>
            <div className="text-xs text-gray-500">ملغاة</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AppointmentsList
