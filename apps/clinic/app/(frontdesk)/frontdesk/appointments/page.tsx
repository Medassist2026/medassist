'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar,
  Plus,
  X,
  UserCheck,
  Pencil,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Clock,
  Stethoscope,
  ChevronLeft,
  ChevronRight,
  UserX,
} from 'lucide-react'
import type { Appointment as SharedAppointment } from '@shared/lib/data/frontdesk'

// ============================================================================
// TYPES
// ============================================================================

type Appointment = SharedAppointment

type StatusFilter = 'all' | 'scheduled' | 'cancelled' | 'no_show'
type PageState = 'loading' | 'loaded' | 'error' | 'empty'

// appointmentId → queue number (set after successful check-in, persists until page refresh)
type CheckedInMap = Record<string, number>

// ============================================================================
// HELPERS
// ============================================================================

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (d.getTime() === today.getTime()) return 'اليوم'
  if (d.getTime() === tomorrow.getTime()) return 'غداً'

  const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  return `${dayNames[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

function getDateStr(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

function generateDateChips(): { date: string; label: string; shortLabel: string }[] {
  const chips = []
  const dayShort = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']

  for (let i = 0; i < 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    const label = i === 0 ? 'اليوم' : i === 1 ? 'غداً' : `${dayShort[d.getDay()]} ${d.getDate()}`
    const shortLabel = i === 0 ? 'اليوم' : i === 1 ? 'غداً' : `${d.getDate()}`
    chips.push({ date: dateStr, label, shortLabel })
  }
  return chips
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'regular':
    case 'consultation':
    case 'walkin':
      return 'كشف'
    case 'followup':
      return 'متابعة'
    case 'emergency':
      return 'طوارئ'
    default:
      return 'كشف'
  }
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'emergency': return 'bg-red-50 text-red-700'
    case 'followup': return 'bg-blue-50 text-blue-700'
    default: return 'bg-[#F3F4F6] text-[#4B5563]'
  }
}

function getStatusBadge(status: string): { label: string; bg: string } {
  switch (status) {
    case 'scheduled': return { label: 'قادم', bg: 'bg-[#FFFBEB] text-[#D97706]' }
    case 'cancelled': return { label: 'ملغي', bg: 'bg-[#FEF2F2] text-[#EF4444]' }
    case 'no_show': return { label: 'لم يحضر', bg: 'bg-[#F5F3FF] text-[#7C3AED]' }
    case 'completed': return { label: 'مكتمل', bg: 'bg-[#F0FDF4] text-[#16A34A]' }
    default: return { label: status, bg: 'bg-[#F3F4F6] text-[#6B7280]' }
  }
}

// ============================================================================
// APPOINTMENT CARD — 3-row layout, 44px touch targets
// ============================================================================

function AppointmentCard({
  appointment,
  onCheckIn,
  onCancel,
  onEdit,
  onNoShow,
  actionLoading,
  queueNumber,
}: {
  appointment: Appointment
  onCheckIn: (appt: Appointment) => void
  onCancel: (appt: Appointment) => void
  onEdit: (appt: Appointment) => void
  onNoShow: (appt: Appointment) => void
  actionLoading: string | null
  queueNumber?: number
}) {
  const isCancelled = appointment.status === 'cancelled'
  const isNoShow = appointment.status === 'no_show'
  const isCompleted = appointment.status === 'completed'
  const isDone = isCancelled || isNoShow || isCompleted
  // isPending: scheduled AND not yet checked into queue this session
  const isPending = appointment.status === 'scheduled' && !queueNumber
  const isInQueue = appointment.status === 'scheduled' && !!queueNumber
  const isLoading = actionLoading === appointment.id
  const statusBadge = getStatusBadge(appointment.status)

  return (
    <div
      className={`bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3.5 transition-all ${
        isDone ? 'opacity-60' : ''
      }`}
    >
      {/* Row 1: Patient Name + Time */}
      <div className="flex items-center justify-between mb-1.5">
        <h4
          className={`font-cairo text-[14px] font-semibold text-[#030712] truncate flex-1 min-w-0 ${
            isCancelled ? 'line-through text-[#9CA3AF]' : ''
          }`}
        >
          {appointment.patient.full_name || 'مريض'}
        </h4>
        <div className="flex items-center gap-1 flex-shrink-0 mr-2">
          <Clock className="w-3.5 h-3.5 text-[#9CA3AF]" />
          <span
            className={`font-cairo text-[13px] font-bold ${
              isCancelled ? 'text-[#D1D5DB] line-through' : 'text-[#030712]'
            }`}
          >
            {formatTime(appointment.start_time)}
          </span>
        </div>
      </div>

      {/* Row 2: Doctor + Type */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <Stethoscope className="w-3.5 h-3.5 text-[#9CA3AF] flex-shrink-0" />
          <span className="font-cairo text-[12px] text-[#6B7280] truncate">
            د. {(appointment.doctor.full_name || '').replace(/^د\.\s*/, '')}
          </span>
        </div>
        <span
          className={`font-cairo text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${getTypeColor(
            appointment.type
          )}`}
        >
          {getTypeLabel(appointment.type)}
        </span>
      </div>

      {/* Row 3: Status + Actions */}
      <div className="flex items-center justify-between">
        {/* Status badge — "في الطابور" overrides "قادم" after check-in */}
        {isInQueue ? (
          <span className="font-cairo text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#F0FDF4] text-[#16A34A] flex items-center gap-1">
            <span className="w-4 h-4 rounded-full bg-[#16A34A] text-white text-[9px] flex items-center justify-center font-black">
              {queueNumber}
            </span>
            في الطابور
          </span>
        ) : (
          <span
            className={`font-cairo text-[11px] font-bold px-2.5 py-1 rounded-full ${statusBadge.bg}`}
          >
            {statusBadge.label}
          </span>
        )}

        {isPending && (
          <div className="flex items-center gap-1">
            {/* Check-In button — 44px touch target */}
            <button
              onClick={() => onCheckIn(appointment)}
              disabled={isLoading}
              className="w-11 h-11 rounded-xl bg-[#F0FDF4] flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
              title="تسجيل وصول"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 text-[#16A34A] animate-spin" />
              ) : (
                <UserCheck className="w-5 h-5 text-[#16A34A]" />
              )}
            </button>

            {/* Edit button — 44px touch target */}
            <button
              onClick={() => onEdit(appointment)}
              disabled={isLoading}
              className="w-11 h-11 rounded-xl bg-[#EFF6FF] flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
              title="تعديل الموعد"
            >
              <Pencil className="w-5 h-5 text-[#2563EB]" />
            </button>

            {/* No-show button — 44px touch target */}
            <button
              onClick={() => onNoShow(appointment)}
              disabled={isLoading}
              className="w-11 h-11 rounded-xl bg-[#F5F3FF] flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
              title="لم يحضر"
            >
              <UserX className="w-5 h-5 text-[#7C3AED]" />
            </button>

            {/* Cancel button — 44px touch target */}
            <button
              onClick={() => onCancel(appointment)}
              disabled={isLoading}
              className="w-11 h-11 rounded-xl bg-[#FEF2F2] flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
              title="إلغاء الموعد"
            >
              <X className="w-5 h-5 text-[#EF4444]" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// CANCEL DIALOG — danger themed with patient data
// ============================================================================

function CancelDialog({
  appointment,
  onConfirm,
  onDismiss,
  loading,
}: {
  appointment: Appointment
  onConfirm: () => void
  onDismiss: () => void
  loading: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-8"
      onClick={() => !loading && onDismiss()}
    >
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-[310px] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Danger icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-[#FEF2F2] flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-[#EF4444]" />
          </div>
        </div>

        <h3 className="font-cairo text-[16px] font-bold text-[#030712] text-center mb-1.5">
          إلغاء الموعد؟
        </h3>

        {/* Patient info */}
        <div className="bg-[#FEF2F2] rounded-xl p-3 mb-4">
          <p className="font-cairo text-[13px] font-bold text-[#030712] text-center truncate">
            {appointment.patient.full_name || 'مريض'}
          </p>
          <p className="font-cairo text-[12px] text-[#6B7280] text-center mt-0.5">
            {formatTime(appointment.start_time)} · د.{' '}
            {(appointment.doctor.full_name || '').replace(/^د\.\s*/, '')}
          </p>
        </div>

        <p className="font-cairo text-[13px] text-[#6B7280] text-center mb-5 leading-relaxed">
          هل أنت متأكد؟ لا يمكن التراجع عن الإلغاء.
        </p>

        {/* Buttons: min 44px */}
        <div className="flex gap-3">
          <button
            onClick={onDismiss}
            disabled={loading}
            className="flex-1 h-11 rounded-xl border-[0.8px] border-[#E5E7EB] font-cairo text-[14px] font-bold text-[#4B5563] active:bg-[#F3F4F6]"
          >
            تراجع
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 h-11 rounded-xl bg-[#EF4444] text-white font-cairo text-[14px] font-bold flex items-center justify-center gap-2 active:bg-[#DC2626]"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إلغاء الموعد'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// SKELETON LOADER
// ============================================================================

function AppointmentSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3.5 animate-pulse"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="h-4 w-28 bg-[#F3F4F6] rounded" />
            <div className="h-4 w-14 bg-[#F3F4F6] rounded" />
          </div>
          <div className="flex items-center gap-2 mb-2.5">
            <div className="h-3 w-24 bg-[#F3F4F6] rounded" />
            <div className="h-5 w-12 bg-[#F3F4F6] rounded-full" />
          </div>
          <div className="flex items-center justify-between">
            <div className="h-6 w-14 bg-[#F3F4F6] rounded-full" />
            <div className="flex gap-1">
              <div className="w-11 h-11 bg-[#F3F4F6] rounded-xl" />
              <div className="w-11 h-11 bg-[#F3F4F6] rounded-xl" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function AppointmentsPage() {
  const router = useRouter()
  const dateChipsRef = useRef<HTMLDivElement>(null)

  // ─── State ───
  const [pageState, setPageState] = useState<PageState>('loading')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [selectedDate, setSelectedDate] = useState(getDateStr(0))
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  // Track which appointments have been checked into the queue this session
  const [checkedInMap, setCheckedInMap] = useState<CheckedInMap>({})

  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false)
  const touchStartY = useRef(0)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const dateChips = generateDateChips()

  // ─── TOAST ───
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── FETCH ───
  const fetchAppointments = useCallback(async (showSkeleton = true) => {
    if (showSkeleton) setPageState('loading')
    try {
      const res = await fetch(`/api/frontdesk/appointments?date=${selectedDate}`)
      if (!res.ok) throw new Error('فشل تحميل المواعيد')
      const data = await res.json()
      const appts = data.appointments || []
      setAppointments(appts)
      setPageState(appts.length === 0 ? 'empty' : 'loaded')
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ')
      setPageState('error')
    }
  }, [selectedDate])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  // ─── PULL TO REFRESH ───
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = async (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientY - touchStartY.current
    const container = scrollContainerRef.current
    if (diff > 80 && container && container.scrollTop <= 0) {
      setRefreshing(true)
      await fetchAppointments(false)
      setRefreshing(false)
    }
  }

  // ─── ACTIONS ───
  const handleCheckIn = async (appt: Appointment) => {
    setActionLoading(appt.id)
    try {
      const res = await fetch('/api/frontdesk/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: appt.patient.id,
          doctorId: appt.doctor.id,
          queueType: 'appointment',
          appointmentId: appt.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'فشل تسجيل الوصول')
      }
      // Record queue number for immediate UI feedback
      const qNum = data.queueItem?.queue_number
      if (qNum) {
        setCheckedInMap((prev) => ({ ...prev, [appt.id]: qNum }))
        showToast(`تم تسجيل وصول ${appt.patient.full_name || 'المريض'} — رقم ${qNum} ✓`, 'success')
      } else {
        showToast(`تم تسجيل وصول ${appt.patient.full_name || 'المريض'} ✓`, 'success')
      }
    } catch (err: any) {
      showToast(err.message || 'فشل تسجيل الوصول', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return
    setCancelLoading(true)
    try {
      const res = await fetch('/api/frontdesk/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: cancelTarget.id, status: 'cancelled' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'فشل إلغاء الموعد')
      }
      showToast('تم إلغاء الموعد ✓', 'success')
      setCancelTarget(null)
      await fetchAppointments(false)
    } catch (err: any) {
      showToast(err.message || 'فشل إلغاء الموعد', 'error')
    } finally {
      setCancelLoading(false)
    }
  }

  const handleEdit = (appt: Appointment) => {
    router.push(`/frontdesk/appointments/${appt.id}/edit`)
  }

  const handleNoShow = async (appt: Appointment) => {
    setActionLoading(appt.id)
    try {
      const res = await fetch('/api/frontdesk/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: appt.id, status: 'no_show' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل تسجيل الغياب')
      showToast(`سُجّل غياب ${appt.patient.full_name || 'المريض'} ✓`, 'success')
      await fetchAppointments(false)
    } catch (err: any) {
      showToast(err.message || 'فشل تسجيل الغياب', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  // ─── FILTERED LIST ───
  const filteredAppointments = appointments.filter((appt) => {
    if (statusFilter === 'all') return true
    return appt.status === statusFilter
  })

  const scheduledCount = appointments.filter((a) => a.status === 'scheduled').length
  const cancelledCount = appointments.filter((a) => a.status === 'cancelled').length
  const noShowCount = appointments.filter((a) => a.status === 'no_show').length

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div dir="rtl" className="min-h-screen bg-[#F9FAFB] font-cairo">
      {/* ─── STICKY HEADER ─── */}
      <div className="sticky top-0 z-40 bg-white border-b-[0.8px] border-[#E5E7EB]">
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="font-cairo text-[17px] font-bold text-[#030712]">المواعيد</h1>
          <div className="flex items-center gap-2">
            <span className="font-cairo text-[12px] text-[#6B7280] bg-[#F3F4F6] px-2.5 py-1 rounded-full">
              {scheduledCount} موعد
            </span>
          </div>
        </div>

        {/* Date chips — horizontal scroll */}
        <div
          ref={dateChipsRef}
          className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {dateChips.map((chip) => (
            <button
              key={chip.date}
              onClick={() => setSelectedDate(chip.date)}
              className={`flex-shrink-0 h-9 px-3.5 rounded-full font-cairo text-[13px] font-medium transition-colors whitespace-nowrap ${
                selectedDate === chip.date
                  ? 'bg-[#16A34A] text-white'
                  : 'bg-[#F3F4F6] text-[#6B7280] active:bg-[#E5E7EB]'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Status filter chips */}
        <div className="flex gap-2 px-4 pb-3">
          <button
            onClick={() => setStatusFilter('all')}
            className={`h-9 px-3 rounded-full font-cairo text-[12px] font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-[#030712] text-white'
                : 'bg-white border-[0.8px] border-[#E5E7EB] text-[#6B7280]'
            }`}
          >
            الكل ({appointments.length})
          </button>
          <button
            onClick={() => setStatusFilter('scheduled')}
            className={`h-9 px-3 rounded-full font-cairo text-[12px] font-medium transition-colors ${
              statusFilter === 'scheduled'
                ? 'bg-[#D97706] text-white'
                : 'bg-white border-[0.8px] border-[#E5E7EB] text-[#D97706]'
            }`}
          >
            قادم ({scheduledCount})
          </button>
          <button
            onClick={() => setStatusFilter('cancelled')}
            className={`h-9 px-3 rounded-full font-cairo text-[12px] font-medium transition-colors ${
              statusFilter === 'cancelled'
                ? 'bg-[#EF4444] text-white'
                : 'bg-white border-[0.8px] border-[#E5E7EB] text-[#EF4444]'
            }`}
          >
            ملغي ({cancelledCount})
          </button>
          {noShowCount > 0 && (
            <button
              onClick={() => setStatusFilter('no_show')}
              className={`h-9 px-3 rounded-full font-cairo text-[12px] font-medium transition-colors ${
                statusFilter === 'no_show'
                  ? 'bg-[#7C3AED] text-white'
                  : 'bg-white border-[0.8px] border-[#E5E7EB] text-[#7C3AED]'
              }`}
            >
              لم يحضر ({noShowCount})
            </button>
          )}
        </div>
      </div>

      {/* ─── TOAST ─── */}
      {toast && (
        <div
          className={`fixed top-4 left-4 right-4 z-50 mx-auto max-w-sm px-4 py-2.5 rounded-xl shadow-lg font-cairo text-[13px] font-bold text-center transition-all ${
            toast.type === 'success'
              ? 'bg-[#F0FDF4] text-[#16A34A] border border-[#16A34A]/20'
              : 'bg-[#FEF2F2] text-[#EF4444] border border-[#EF4444]/20'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* ─── PULL TO REFRESH INDICATOR ─── */}
      {refreshing && (
        <div className="flex justify-center py-3">
          <Loader2 className="w-5 h-5 text-[#16A34A] animate-spin" />
        </div>
      )}

      {/* ─── CONTENT ─── */}
      <div
        ref={scrollContainerRef}
        className="px-4 pt-3 pb-28"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Loading skeleton */}
        {pageState === 'loading' && <AppointmentSkeleton />}

        {/* Error state */}
        {pageState === 'error' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full bg-[#FEF2F2] flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-[#EF4444]" />
            </div>
            <p className="font-cairo text-[14px] text-[#4B5563] text-center">{errorMsg}</p>
            <button
              onClick={() => fetchAppointments()}
              className="flex items-center gap-1.5 font-cairo text-[13px] font-bold text-[#16A34A]"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Empty state */}
        {pageState === 'empty' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full bg-[#F3F4F6] flex items-center justify-center">
              <Calendar className="w-7 h-7 text-[#D1D5DB]" />
            </div>
            <div className="text-center">
              <p className="font-cairo text-[15px] font-semibold text-[#030712] mb-1">
                لا توجد مواعيد
              </p>
              <p className="font-cairo text-[13px] text-[#6B7280]">
                {formatDateLabel(selectedDate)} — أضف موعد جديد
              </p>
            </div>
            <Link
              href="/frontdesk/appointments/new"
              className="flex items-center gap-1.5 h-11 px-5 bg-[#16A34A] text-white rounded-xl font-cairo text-[14px] font-bold active:scale-[0.97] transition-transform"
            >
              <Plus className="w-4 h-4" />
              حجز موعد جديد
            </Link>
          </div>
        )}

        {/* Loaded — appointment cards */}
        {pageState === 'loaded' && (
          <>
            {filteredAppointments.length === 0 ? (
              <div className="text-center py-12">
                <p className="font-cairo text-[14px] text-[#9CA3AF]">
                  لا توجد مواعيد بهذا الفلتر
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAppointments.map((appt) => (
                  <AppointmentCard
                    key={appt.id}
                    appointment={appt}
                    onCheckIn={handleCheckIn}
                    onCancel={setCancelTarget}
                    onEdit={handleEdit}
                    onNoShow={handleNoShow}
                    actionLoading={actionLoading}
                    queueNumber={checkedInMap[appt.id]}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── FAB — 56×56, WhatsApp pattern, thumb zone ─── */}
      <Link
        href="/frontdesk/appointments/new"
        className="fixed bottom-24 left-4 z-30 w-14 h-14 rounded-full bg-[#16A34A] shadow-lg shadow-[#16A34A]/30 flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
      </Link>

      {/* ─── CANCEL DIALOG ─── */}
      {cancelTarget && (
        <CancelDialog
          appointment={cancelTarget}
          onConfirm={handleCancelConfirm}
          onDismiss={() => !cancelLoading && setCancelTarget(null)}
          loading={cancelLoading}
        />
      )}
    </div>
  )
}
