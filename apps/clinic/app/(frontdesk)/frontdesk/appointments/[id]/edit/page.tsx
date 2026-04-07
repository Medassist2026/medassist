'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowRight,
  Clock,
  Stethoscope,
  FileText,
  Calendar,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Check,
  ChevronDown,
} from 'lucide-react'
import { translateSpecialty } from '@shared/lib/utils/specialty-labels'

// ============================================================================
// TYPES
// ============================================================================

interface Doctor {
  id: string
  full_name: string
  specialty: string
}

interface Appointment {
  id: string
  start_time: string
  duration_minutes: number
  status: string
  type: string
  notes: string | null
  doctor: Doctor
  patient: {
    id: string
    full_name: string
    phone: string
    age: number | null
    sex: string | null
  }
}

interface TimeSlot {
  start_time: string
  end_time: string
  is_booked: boolean
  appointment_id?: string
}

type PageState = 'loading' | 'loaded' | 'saving' | 'error'

// ============================================================================
// HELPERS
// ============================================================================

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })
}

function getDateStr(date: Date): string {
  return date.toISOString().split('T')[0]
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'regular': return 'كشف'
    case 'followup': return 'متابعة'
    case 'emergency': return 'طوارئ'
    case 'consultation': return 'استشارة'
    default: return type
  }
}

// ============================================================================
// EDIT APPOINTMENT PAGE
// ============================================================================

export default function EditAppointmentPage() {
  const router = useRouter()
  const params = useParams()
  const appointmentId = params.id as string

  // ─── State ───
  const [pageState, setPageState] = useState<PageState>('loading')
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Edit fields
  const [selectedDoctorId, setSelectedDoctorId] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [selectedType, setSelectedType] = useState('regular')
  const [notes, setNotes] = useState('')

  // Slots
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  // ─── Toast ───
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── Fetch appointment ───
  const fetchAppointment = useCallback(async () => {
    try {
      // Fetch today + 7 days appointments to find the one
      const today = getDateStr(new Date())
      const weekLater = new Date()
      weekLater.setDate(weekLater.getDate() + 30)
      const endDate = getDateStr(weekLater)

      const [apptRes, doctorsRes] = await Promise.all([
        fetch(`/api/frontdesk/appointments?start=${today}&end=${endDate}`),
        fetch('/api/doctors/list'),
      ])

      if (!apptRes.ok) throw new Error('فشل تحميل بيانات الموعد')

      const apptData = await apptRes.json()
      const found = (apptData.appointments || []).find((a: any) => a.id === appointmentId)

      if (!found) {
        throw new Error('الموعد غير موجود')
      }

      setAppointment(found)
      setSelectedDoctorId(found.doctor.id)
      setSelectedDate(new Date(found.start_time).toISOString().split('T')[0])
      setSelectedSlot(found.start_time)
      setSelectedType(found.type || 'regular')
      setNotes(found.notes || '')

      // Load doctors
      if (doctorsRes.ok) {
        const doctorsData = await doctorsRes.json()
        setDoctors(doctorsData.doctors || [])
      }

      setPageState('loaded')
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ')
      setPageState('error')
    }
  }, [appointmentId])

  useEffect(() => {
    fetchAppointment()
  }, [fetchAppointment])

  // ─── Load slots when date or doctor changes ───
  const loadSlots = useCallback(async () => {
    if (!selectedDoctorId || !selectedDate) return
    setLoadingSlots(true)
    try {
      const res = await fetch(
        `/api/frontdesk/slots?doctorId=${selectedDoctorId}&date=${selectedDate}`
      )
      if (res.ok) {
        const data = await res.json()
        setSlots(data.slots || [])
      }
    } catch {
      // silent
    } finally {
      setLoadingSlots(false)
    }
  }, [selectedDoctorId, selectedDate])

  useEffect(() => {
    if (pageState === 'loaded') {
      loadSlots()
    }
  }, [selectedDoctorId, selectedDate, pageState, loadSlots])

  // ─── Save ───
  const handleSave = async () => {
    if (!appointment) return

    setPageState('saving')
    try {
      const updates: Record<string, any> = { appointmentId }

      // Check what changed
      if (selectedDoctorId !== appointment.doctor.id) {
        updates.doctorId = selectedDoctorId
      }
      if (selectedSlot !== appointment.start_time) {
        updates.startTime = selectedSlot
      }
      if (selectedType !== (appointment.type || 'regular')) {
        updates.appointmentType = selectedType
      }
      if ((notes || '') !== (appointment.notes || '')) {
        updates.notes = notes
      }

      // Nothing changed?
      if (Object.keys(updates).length === 1) {
        showToast('لا توجد تعديلات', 'error')
        setPageState('loaded')
        return
      }

      const res = await fetch('/api/frontdesk/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'فشل حفظ التعديلات')
      }

      showToast('تم حفظ التعديلات ✓', 'success')
      setTimeout(() => router.back(), 800)
    } catch (err: any) {
      showToast(err.message || 'فشل الحفظ', 'error')
      setPageState('loaded')
    }
  }

  // ─── Generate next 7 days ───
  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const dateStr = getDateStr(d)
    const label = i === 0 ? 'اليوم' : i === 1 ? 'غداً' : formatDate(dateStr)
    return { date: dateStr, label }
  })

  const appointmentTypes = [
    { value: 'regular', label: 'كشف' },
    { value: 'followup', label: 'متابعة' },
    { value: 'emergency', label: 'طوارئ' },
    { value: 'consultation', label: 'استشارة' },
  ]

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div dir="rtl" className="min-h-screen bg-[#F9FAFB] font-cairo">
      {/* ─── HEADER ─── */}
      <header className="sticky top-0 z-10 bg-white border-b-[0.8px] border-[#E5E7EB]">
        <div className="flex items-center h-14 px-4 gap-2">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full border-[0.8px] border-[#E5E7EB] flex items-center justify-center flex-shrink-0"
          >
            <ArrowRight className="w-4 h-4 text-[#030712]" />
          </button>
          <h1 className="text-[17px] font-bold text-[#030712] flex-1 truncate">تعديل الموعد</h1>
          {pageState === 'loaded' && (
            <button
              onClick={handleSave}
              className="text-[13px] font-bold text-[#16A34A] flex items-center gap-1 flex-shrink-0"
            >
              <Check className="w-4 h-4" />
              حفظ
            </button>
          )}
          {pageState === 'saving' && (
            <Loader2 className="w-5 h-5 text-[#16A34A] animate-spin flex-shrink-0" />
          )}
        </div>
      </header>

      {/* ─── TOAST ─── */}
      {toast && (
        <div
          className={`fixed top-16 left-4 right-4 z-50 mx-auto max-w-sm px-4 py-2.5 rounded-xl shadow-lg text-[13px] font-bold text-center transition-all ${
            toast.type === 'success'
              ? 'bg-[#F0FDF4] text-[#16A34A] border border-[#16A34A]/20'
              : 'bg-[#FEF2F2] text-[#EF4444] border border-[#EF4444]/20'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* ─── LOADING ─── */}
      {pageState === 'loading' && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#16A34A] animate-spin mb-3" />
          <p className="text-[14px] text-[#6B7280]">جاري التحميل...</p>
        </div>
      )}

      {/* ─── ERROR ─── */}
      {pageState === 'error' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 px-6">
          <div className="w-16 h-16 rounded-full bg-[#FEF2F2] flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-[#EF4444]" />
          </div>
          <p className="text-[14px] text-[#4B5563] text-center">{errorMsg}</p>
          <button
            onClick={() => { setPageState('loading'); fetchAppointment() }}
            className="flex items-center gap-1.5 text-[13px] font-bold text-[#16A34A]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* ─── EDIT FORM ─── */}
      {(pageState === 'loaded' || pageState === 'saving') && appointment && (
        <div className="px-4 py-5 space-y-5">

          {/* Patient info (read-only) */}
          <div className="bg-white rounded-xl border-[0.8px] border-[#E5E7EB] p-3.5">
            <p className="text-[11px] text-[#9CA3AF] mb-1">المريض</p>
            <p className="text-[15px] font-bold text-[#030712] truncate">
              {appointment.patient.full_name || 'مريض'}
            </p>
            <p className="text-[12px] text-[#6B7280] mt-0.5" dir="ltr" style={{ textAlign: 'right' }}>
              {appointment.patient.phone}
            </p>
          </div>

          {/* Doctor selection */}
          <div>
            <label className="text-[13px] font-bold text-[#4B5563] mb-2 flex items-center gap-1.5">
              <Stethoscope className="w-4 h-4" />
              الطبيب
            </label>
            <div className="relative mt-2">
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                disabled={pageState === 'saving'}
                className="w-full h-12 px-3.5 bg-white border-[0.8px] border-[#E5E7EB] rounded-xl text-[14px] font-semibold text-[#030712] appearance-none focus:border-[#16A34A] outline-none"
              >
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    د. {doc.full_name} — {translateSpecialty(doc.specialty)}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF] pointer-events-none" />
            </div>
          </div>

          {/* Date selection */}
          <div>
            <label className="text-[13px] font-bold text-[#4B5563] mb-2 flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              التاريخ
            </label>
            <div className="flex gap-2 mt-2 overflow-x-auto scrollbar-hide pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
              {dateOptions.map((opt) => (
                <button
                  key={opt.date}
                  onClick={() => { setSelectedDate(opt.date); setSelectedSlot('') }}
                  disabled={pageState === 'saving'}
                  className={`flex-shrink-0 h-11 px-4 rounded-xl font-cairo text-[13px] font-medium transition-colors whitespace-nowrap ${
                    selectedDate === opt.date
                      ? 'bg-[#16A34A] text-white'
                      : 'bg-white border-[0.8px] border-[#E5E7EB] text-[#4B5563] active:bg-[#F3F4F6]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time slots */}
          <div>
            <label className="text-[13px] font-bold text-[#4B5563] mb-2 flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              الوقت
            </label>
            <div className="mt-2">
              {loadingSlots ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 text-[#16A34A] animate-spin" />
                  <span className="text-[13px] text-[#6B7280] mr-2">جاري تحميل المواعيد المتاحة...</span>
                </div>
              ) : slots.length === 0 ? (
                <div className="text-center py-6 bg-[#F3F4F6] rounded-xl">
                  <p className="text-[13px] text-[#9CA3AF]">لا توجد مواعيد متاحة في هذا اليوم</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {slots.map((slot) => {
                    const isCurrentSlot = slot.start_time === appointment.start_time
                    const isSelected = selectedSlot === slot.start_time
                    const isBooked = slot.is_booked && !isCurrentSlot
                    return (
                      <button
                        key={slot.start_time}
                        onClick={() => !isBooked && setSelectedSlot(slot.start_time)}
                        disabled={isBooked || pageState === 'saving'}
                        className={`h-11 rounded-xl font-cairo text-[13px] font-medium transition-colors ${
                          isSelected
                            ? 'bg-[#16A34A] text-white'
                            : isBooked
                            ? 'bg-[#F3F4F6] text-[#D1D5DB] cursor-not-allowed'
                            : isCurrentSlot
                            ? 'bg-[#F0FDF4] text-[#16A34A] border-[0.8px] border-[#16A34A]/30'
                            : 'bg-white border-[0.8px] border-[#E5E7EB] text-[#4B5563] active:bg-[#F3F4F6]'
                        }`}
                      >
                        {formatTime(slot.start_time)}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Appointment type */}
          <div>
            <label className="text-[13px] font-bold text-[#4B5563] mb-2 block">نوع الموعد</label>
            <div className="flex gap-2 mt-2">
              {appointmentTypes.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setSelectedType(t.value)}
                  disabled={pageState === 'saving'}
                  className={`flex-1 h-11 rounded-xl font-cairo text-[13px] font-medium transition-colors ${
                    selectedType === t.value
                      ? 'bg-[#16A34A] text-white'
                      : 'bg-white border-[0.8px] border-[#E5E7EB] text-[#4B5563] active:bg-[#F3F4F6]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[13px] font-bold text-[#4B5563] mb-2 flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              ملاحظات
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pageState === 'saving'}
              placeholder="أضف ملاحظات (اختياري)..."
              className="w-full mt-2 h-24 px-3.5 py-3 bg-white border-[0.8px] border-[#E5E7EB] rounded-xl text-[14px] text-[#030712] resize-none outline-none focus:border-[#16A34A] placeholder:text-[#D1D5DB]"
              dir="rtl"
            />
          </div>

          {/* Save button — full width, 48px */}
          <button
            onClick={handleSave}
            disabled={pageState === 'saving' || !selectedSlot}
            className="w-full h-12 rounded-xl bg-[#16A34A] text-white font-cairo text-[15px] font-bold flex items-center justify-center gap-2 active:bg-[#15803D] transition-colors disabled:opacity-50 disabled:active:bg-[#16A34A]"
          >
            {pageState === 'saving' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Check className="w-5 h-5" />
                حفظ التعديلات
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
