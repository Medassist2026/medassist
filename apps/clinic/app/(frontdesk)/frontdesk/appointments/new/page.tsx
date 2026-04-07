'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Search,
  X,
  Check,
  AlertTriangle,
  Loader2,
  Clock,
  Stethoscope,
  Calendar,
  FileText,
  MapPin,
  ChevronDown,
  UserPlus,
} from 'lucide-react'

import type {
  PatientWithId,
  DoctorWithId,
  AvailableSlot,
  AppointmentType,
} from '@shared/lib/data/frontdesk'
import { translateSpecialty } from '@shared/lib/data/frontdesk'

// ============================================================================
// TYPES — using shared where possible, local only for page-specific shapes
// ============================================================================

type Patient = PatientWithId
type Doctor = DoctorWithId
type TimeSlot = AvailableSlot

interface ClinicInfo {
  id: string
  name: string
  uniqueId: string
}

interface ConflictInfo {
  id: string
  start_time: string
  doctor_name: string
}

// ============================================================================
// HELPERS
// ============================================================================

function getDateStr(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })
}

function formatDateArabic(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })
}

const DATE_CHIPS = (() => {
  const dayShort = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    const label = i === 0 ? 'اليوم' : i === 1 ? 'غداً' : `${dayShort[d.getDay()]} ${d.getDate()}`
    return { date: dateStr, label }
  })
})()

const APPOINTMENT_TYPES: { value: AppointmentType; label: string }[] = [
  { value: 'regular', label: 'كشف' },
  { value: 'followup', label: 'متابعة' },
  { value: 'emergency', label: 'طوارئ' },
]

// ============================================================================
// MAIN PAGE — Add New Appointment (5 Figma states)
// ============================================================================

export default function NewAppointmentPage() {
  const router = useRouter()
  const formRef = useRef<HTMLDivElement>(null)

  // ─── Core form fields ───
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [clinicInfo, setClinicInfo] = useState<ClinicInfo | null>(null)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [selectedDoctorId, setSelectedDoctorId] = useState('')
  const [selectedDate, setSelectedDate] = useState(getDateStr(0))
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [selectedSlot, setSelectedSlot] = useState('')
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('regular')
  const [notes, setNotes] = useState('')

  // ─── Patient search ───
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Patient[]>([])
  const [searching, setSearching] = useState(false)

  // ─── Validation errors ───
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // ─── Conflict warning ───
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)
  const [conflictDismissed, setConflictDismissed] = useState(false)

  // ─── Loading / submit ───
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [submitting, setSubmitting] = useState<'save' | 'save-start' | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // ─── Free-form time entry (when no slots available) ───
  const [customTime, setCustomTime] = useState('') // HH:MM format e.g. "17:30"
  const [outsideHoursWarning, setOutsideHoursWarning] = useState(false)

  // ─── Back confirmation ───
  const [showBackConfirm, setShowBackConfirm] = useState(false)

  // ─── Has any field been filled? (for back confirmation) ───
  const hasData = !!(selectedPatient || selectedSlot || notes.trim())

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  // Load clinic info + doctors on mount
  useEffect(() => {
    // Load doctors (pre-filtered by clinic scope on server)
    fetch('/api/doctors/list')
      .then((r) => r.json())
      .then((data) => {
        const list = data.doctors || []
        setDoctors(list)
        // Auto-select if single doctor (solo clinic)
        if (list.length === 1) setSelectedDoctorId(list[0].id)
      })
      .catch(() => {})

    // Load clinic info for display
    fetch('/api/frontdesk/profile')
      .then((r) => r.json())
      .then((data) => {
        const memberships = data.memberships || []
        const active = memberships.find((m: any) => m.status === 'ACTIVE')
        if (active?.clinic) {
          setClinicInfo({
            id: active.clinicId,
            name: active.clinic.name,
            uniqueId: active.clinic.uniqueId,
          })
        }
      })
      .catch(() => {})
  }, [])

  // ─── Patient search (typeahead after 3 chars) ───
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults([])
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(searchQuery)}`)
        const data = await res.json()
        setSearchResults(data.patients || [])
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // ─── Load slots when doctor or date changes ───
  useEffect(() => {
    if (!selectedDoctorId || !selectedDate) {
      setSlots([])
      return
    }
    setSlotsLoading(true)
    setSelectedSlot('')
    setCustomTime('')
    setOutsideHoursWarning(false)
    fetch(`/api/frontdesk/slots?doctorId=${selectedDoctorId}&date=${selectedDate}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false))
  }, [selectedDoctorId, selectedDate])

  // ─── Conflict check: same-day appointment for this patient ───
  useEffect(() => {
    if (!selectedPatient || !selectedDate) {
      setConflict(null)
      setConflictDismissed(false)
      return
    }

    // Check if patient has existing appointments on selected date
    fetch(`/api/frontdesk/appointments?date=${selectedDate}`)
      .then((r) => r.json())
      .then((data) => {
        const existing = (data.appointments || []).find(
          (a: any) => a.patient?.id === selectedPatient.id && a.status === 'scheduled'
        )
        if (existing) {
          setConflict({
            id: existing.id,
            start_time: existing.start_time,
            doctor_name: existing.doctor?.full_name || 'طبيب',
          })
          setConflictDismissed(false)
        } else {
          setConflict(null)
        }
      })
      .catch(() => {})
  }, [selectedPatient, selectedDate])

  // ============================================================================
  // TOAST
  // ============================================================================

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  // ============================================================================
  // VALIDATION
  // ============================================================================

  // Resolve the effective start time (from grid slot or free-form)
  const effectiveStartTime = selectedSlot || (customTime && selectedDate
    ? new Date(`${selectedDate}T${customTime}:00`).toISOString()
    : '')

  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    if (!selectedPatient) errors.patient = 'يجب اختيار المريض'
    if (!selectedDoctorId) errors.doctor = 'يجب اختيار الطبيب'
    if (!selectedDate) errors.date = 'التاريخ مطلوب'
    if (!effectiveStartTime) errors.time = 'الوقت مطلوب'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  // ============================================================================
  // SUBMIT — Save Only / Save & Start Session
  // ============================================================================

  const handleSubmit = async (mode: 'save' | 'save-start') => {
    if (!validate()) return

    setSubmitting(mode)
    try {
      // Create appointment
      const createRes = await fetch('/api/frontdesk/appointments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient!.id,
          doctorId: selectedDoctorId,
          startTime: effectiveStartTime,
          durationMinutes: 30,
          appointmentType,
          notes: notes.trim() || undefined,
          // On retry after outside-hours warning, bypass hours check
          skipHoursCheck: outsideHoursWarning ? true : undefined,
        }),
      })

      const createData = await createRes.json()
      if (!createRes.ok) {
        // First time outside-hours error: show warning, let user confirm and retry
        if (createData.outsideHours && !outsideHoursWarning) {
          setOutsideHoursWarning(true)
          setSubmitting(null)
          return
        }
        throw new Error(createData.error || 'فشل حجز الموعد')
      }

      // If "Save & Start Session" — also check in
      if (mode === 'save-start' && createData.appointment?.id) {
        const checkinRes = await fetch('/api/frontdesk/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId: selectedPatient!.id,
            doctorId: selectedDoctorId,
            queueType: 'appointment',
            appointmentId: createData.appointment.id,
          }),
        })

        if (!checkinRes.ok) {
          // Appointment saved but check-in failed — still show success with note
          showToast('تم حفظ الموعد — فشل بدء الجلسة', 'error')
          setTimeout(() => router.push('/frontdesk/appointments'), 1500)
          return
        }
      }

      // Success toast with appointment details
      const patientName = selectedPatient!.full_name || 'المريض'
      const time = effectiveStartTime ? formatTime(effectiveStartTime) : ''
      const successMsg =
        mode === 'save-start'
          ? `تم حفظ الموعد وبدء الجلسة ✓\n${patientName} · ${time}`
          : `تم حفظ الموعد بنجاح ✓\n${patientName} · ${time}`

      showToast(successMsg, 'success')

      setTimeout(() => {
        if (mode === 'save-start') {
          router.push('/frontdesk/dashboard')
        } else {
          router.push('/frontdesk/appointments')
        }
      }, 1200)
    } catch (err: any) {
      showToast(err.message || 'حدث خطأ', 'error')
      setSubmitting(null)
    }
  }

  // ============================================================================
  // BACK HANDLER
  // ============================================================================

  const handleBack = () => {
    if (hasData) {
      setShowBackConfirm(true)
    } else {
      router.back()
    }
  }

  // ============================================================================
  // COMPUTED
  // ============================================================================

  const isFormReady = !!(selectedPatient && selectedDoctorId && selectedDate && effectiveStartTime)
  const availableSlots = slots.filter((s) => !s.is_booked)

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div dir="rtl" className="min-h-screen bg-[#F9FAFB] font-cairo">
      {/* ─── HEADER — 56px ─── */}
      <header className="sticky top-0 z-10 bg-white border-b-[0.8px] border-[#E5E7EB]">
        <div className="flex items-center h-14 px-4 gap-2">
          <button
            onClick={handleBack}
            className="w-9 h-9 rounded-full border-[0.8px] border-[#E5E7EB] flex items-center justify-center flex-shrink-0"
          >
            <ArrowRight className="w-4 h-4 text-[#030712]" />
          </button>
          <h1 className="text-[17px] font-bold text-[#030712] flex-1 truncate">إضافة موعد جديد</h1>
          <button
            onClick={handleBack}
            className="text-[13px] font-bold text-[#6B7280] flex-shrink-0"
          >
            إلغاء
          </button>
        </div>
      </header>

      {/* ─── TOAST ─── */}
      {toast && (
        <div
          className={`fixed top-16 left-4 right-4 z-50 mx-auto max-w-sm px-4 py-3 rounded-xl shadow-lg text-[13px] font-bold text-center transition-all whitespace-pre-line ${
            toast.type === 'success'
              ? 'bg-[#F0FDF4] text-[#16A34A] border border-[#16A34A]/20'
              : 'bg-[#FEF2F2] text-[#EF4444] border border-[#EF4444]/20'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* ─── FORM BODY ─── */}
      <div ref={formRef} className="px-4 pt-5 pb-40 space-y-5">
        {/* ════════════════════════════════════════════════════ */}
        {/* FIELD 1: Patient Search */}
        {/* ════════════════════════════════════════════════════ */}
        <div>
          <label className="text-[13px] font-bold text-[#4B5563] mb-2 flex items-center gap-1.5">
            <Search className="w-4 h-4" />
            المريض
            <span className="text-[#EF4444]">*</span>
          </label>

          {selectedPatient ? (
            /* Patient chip — selected state */
            <div className="mt-2 bg-[#F0FDF4] border-[1.5px] border-[#16A34A]/30 rounded-xl p-3.5 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-[#030712] truncate">
                  {selectedPatient.full_name || 'مريض'}
                </p>
                <p className="text-[12px] text-[#6B7280] mt-0.5" dir="ltr" style={{ textAlign: 'right' }}>
                  {selectedPatient.phone}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedPatient(null)
                  setSearchQuery('')
                  setConflict(null)
                }}
                className="h-9 px-3 rounded-lg bg-white border-[0.8px] border-[#E5E7EB] text-[12px] font-bold text-[#16A34A] flex-shrink-0 mr-3"
              >
                تغيير
              </button>
            </div>
          ) : (
            /* Search input */
            <div className="mt-2">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#9CA3AF]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث بالاسم أو رقم الموبايل..."
                  className={`w-full h-12 pr-10 pl-4 rounded-xl border-[0.8px] text-[14px] text-[#030712] placeholder:text-[#9CA3AF] bg-[#F9FAFB] outline-none transition-colors ${
                    fieldErrors.patient
                      ? 'border-[#EF4444] focus:border-[#EF4444]'
                      : 'border-[#E5E7EB] focus:border-[#16A34A]'
                  }`}
                />
                {searching && (
                  <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF] animate-spin" />
                )}
              </div>

              {/* Validation error */}
              {fieldErrors.patient && (
                <p className="text-[11px] text-[#EF4444] mt-1 font-bold">{fieldErrors.patient}</p>
              )}

              {/* Search results dropdown */}
              {searchResults.length > 0 && (
                <div className="mt-2 bg-white border-[0.8px] border-[#E5E7EB] rounded-xl overflow-hidden shadow-sm">
                  {searchResults.slice(0, 5).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPatient(p)
                        setSearchQuery('')
                        setSearchResults([])
                        setFieldErrors((prev) => ({ ...prev, patient: '' }))
                      }}
                      className="w-full text-right px-4 py-3 border-b-[0.8px] border-[#F3F4F6] last:border-b-0 active:bg-[#F9FAFB]"
                    >
                      <p className="text-[14px] font-semibold text-[#030712]">{p.full_name || 'بدون اسم'}</p>
                      <p className="text-[12px] text-[#6B7280]" dir="ltr" style={{ textAlign: 'right' }}>
                        {p.phone}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {/* No results + add patient link */}
              {searchQuery.length >= 3 && !searching && searchResults.length === 0 && (
                <div className="mt-2 text-center py-4 bg-white border-[0.8px] border-[#E5E7EB] rounded-xl">
                  <p className="text-[13px] text-[#9CA3AF] mb-2">لا توجد نتائج</p>
                  <button
                    onClick={() => router.push('/frontdesk/patients/register')}
                    className="text-[13px] font-bold text-[#16A34A] flex items-center gap-1 mx-auto"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    تسجيل مريض جديد
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════════════════ */}
        {/* CONFLICT WARNING (same-day) */}
        {/* ════════════════════════════════════════════════════ */}
        {conflict && !conflictDismissed && (
          <div className="bg-[#FFFBEB] border-[1.5px] border-[#D97706]/30 rounded-xl p-3.5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-[#D97706] flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-[#92400E]">
                  المريض لديه موعد سابق في نفس اليوم
                </p>
                <p className="text-[12px] text-[#92400E]/70 mt-0.5">
                  {formatTime(conflict.start_time)} · د. {conflict.doctor_name}
                </p>
              </div>
              <button
                onClick={() => setConflictDismissed(true)}
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 active:bg-[#D97706]/10"
              >
                <X className="w-4 h-4 text-[#D97706]" />
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════ */}
        {/* FIELD 2: Clinic (auto-select, disabled if single) */}
        {/* ════════════════════════════════════════════════════ */}
        <div>
          <label className="text-[13px] font-bold text-[#4B5563] mb-2 flex items-center gap-1.5">
            <MapPin className="w-4 h-4" />
            العيادة
          </label>
          <div className="mt-2 relative">
            <div className="w-full h-12 px-3.5 bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-xl flex items-center text-[14px] font-semibold text-[#4B5563]">
              {clinicInfo ? (
                <span className="truncate">{clinicInfo.name}</span>
              ) : (
                <span className="text-[#9CA3AF]">جاري التحميل...</span>
              )}
            </div>
            {/* Visual indicator that it's auto-selected */}
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <Check className="w-4 h-4 text-[#16A34A]" />
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════ */}
        {/* FIELD 3: Doctor */}
        {/* ════════════════════════════════════════════════════ */}
        <div>
          <label className="text-[13px] font-bold text-[#4B5563] mb-2 flex items-center gap-1.5">
            <Stethoscope className="w-4 h-4" />
            الطبيب
            <span className="text-[#EF4444]">*</span>
          </label>
          <div className="mt-2 relative">
            <select
              value={selectedDoctorId}
              onChange={(e) => {
                setSelectedDoctorId(e.target.value)
                setFieldErrors((prev) => ({ ...prev, doctor: '' }))
              }}
              className={`w-full h-12 px-3.5 bg-[#F9FAFB] border-[0.8px] rounded-xl text-[14px] font-semibold text-[#030712] appearance-none outline-none transition-colors ${
                fieldErrors.doctor
                  ? 'border-[#EF4444]'
                  : 'border-[#E5E7EB] focus:border-[#16A34A]'
              }`}
            >
              <option value="">اختر الطبيب</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  د. {(d.full_name || '').replace(/^د\.\s*/, '')} — {translateSpecialty(d.specialty)}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF] pointer-events-none" />
          </div>
          {fieldErrors.doctor && (
            <p className="text-[11px] text-[#EF4444] mt-1 font-bold">{fieldErrors.doctor}</p>
          )}
        </div>

        {/* ════════════════════════════════════════════════════ */}
        {/* FIELD 4: Date — quick chips */}
        {/* ════════════════════════════════════════════════════ */}
        <div>
          <label className="text-[13px] font-bold text-[#4B5563] mb-2 flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            التاريخ
            <span className="text-[#EF4444]">*</span>
          </label>
          <div
            className="mt-2 flex gap-2 overflow-x-auto scrollbar-hide pb-1"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {DATE_CHIPS.map((chip) => (
              <button
                key={chip.date}
                onClick={() => {
                  setSelectedDate(chip.date)
                  setFieldErrors((prev) => ({ ...prev, date: '' }))
                }}
                className={`flex-shrink-0 h-9 px-3.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap ${
                  selectedDate === chip.date
                    ? 'bg-[#16A34A] text-white'
                    : 'bg-white border-[0.8px] border-[#E5E7EB] text-[#4B5563] active:bg-[#F3F4F6]'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
          {fieldErrors.date && (
            <p className="text-[11px] text-[#EF4444] mt-1 font-bold">{fieldErrors.date}</p>
          )}
        </div>

        {/* ════════════════════════════════════════════════════ */}
        {/* FIELD 5: Time slots — 30-min intervals */}
        {/* ════════════════════════════════════════════════════ */}
        <div>
          <label className="text-[13px] font-bold text-[#4B5563] mb-2 flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            الوقت
            <span className="text-[#EF4444]">*</span>
          </label>

          <div className="mt-2">
            {slotsLoading ? (
              <div className="flex items-center justify-center py-8 bg-white border-[0.8px] border-[#E5E7EB] rounded-xl">
                <Loader2 className="w-5 h-5 text-[#16A34A] animate-spin" />
                <span className="text-[13px] text-[#6B7280] mr-2">جاري تحميل المواعيد...</span>
              </div>
            ) : !selectedDoctorId ? (
              <div className="text-center py-6 bg-[#F3F4F6] rounded-xl">
                <p className="text-[13px] text-[#9CA3AF]">اختر الطبيب أولاً لعرض المواعيد المتاحة</p>
              </div>
            ) : availableSlots.length > 0 ? (
              /* Grid of available slots */
              <div className="grid grid-cols-3 gap-2">
                {slots.map((slot) => {
                  const isBooked = slot.is_booked
                  const isSelected = selectedSlot === slot.start_time
                  return (
                    <button
                      key={slot.start_time}
                      onClick={() => {
                        if (!isBooked) {
                          setSelectedSlot(slot.start_time)
                          setCustomTime('')
                          setOutsideHoursWarning(false)
                          setFieldErrors((prev) => ({ ...prev, time: '' }))
                        }
                      }}
                      disabled={isBooked}
                      className={`h-11 rounded-xl text-[13px] font-medium transition-colors ${
                        isSelected
                          ? 'bg-[#16A34A] text-white'
                          : isBooked
                          ? 'bg-[#F3F4F6] text-[#D1D5DB] line-through cursor-not-allowed'
                          : 'bg-white border-[0.8px] border-[#E5E7EB] text-[#030712] active:bg-[#F3F4F6]'
                      }`}
                    >
                      {formatTime(slot.start_time)}
                    </button>
                  )
                })}
              </div>
            ) : (
              /* Free-form time input (no configured slots, or outside hours) */
              <div>
                <div className="bg-[#FFFBEB] border-[0.8px] border-[#D97706]/30 rounded-xl px-3 py-2.5 mb-2.5 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#D97706] flex-shrink-0 mt-0.5" />
                  <p className="font-cairo text-[12px] text-[#92400E] leading-relaxed">
                    لم يتم تحديد ساعات عمل لهذا اليوم — يمكنك إدخال الوقت يدوياً
                  </p>
                </div>
                <div className="relative">
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => {
                      const val = e.target.value
                      setCustomTime(val)
                      setSelectedSlot('')
                      setOutsideHoursWarning(false)
                      setFieldErrors((prev) => ({ ...prev, time: '' }))
                    }}
                    className={`w-full h-12 px-3.5 bg-[#F9FAFB] border-[0.8px] rounded-xl text-[15px] font-semibold text-[#030712] outline-none focus:border-[#16A34A] transition-colors ${
                      fieldErrors.time ? 'border-[#EF4444]' : 'border-[#E5E7EB]'
                    }`}
                    dir="ltr"
                  />
                </div>
                {outsideHoursWarning && (
                  <p className="font-cairo text-[11px] text-[#D97706] mt-1 font-medium">
                    ⚠ الوقت خارج ساعات العمل المحددة — سيتم حجز الموعد على أي حال
                  </p>
                )}
              </div>
            )}
          </div>
          {fieldErrors.time && (
            <p className="text-[11px] text-[#EF4444] mt-1 font-bold">{fieldErrors.time}</p>
          )}
        </div>

        {/* ════════════════════════════════════════════════════ */}
        {/* FIELD 6: Visit Type — chips */}
        {/* ════════════════════════════════════════════════════ */}
        <div>
          <label className="text-[13px] font-bold text-[#4B5563] mb-2 block">
            نوع الكشف <span className="font-normal text-[#9CA3AF]">(اختياري)</span>
          </label>
          <div className="mt-2 flex gap-2">
            {APPOINTMENT_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setAppointmentType(t.value)}
                className={`flex-1 h-9 rounded-full text-[12px] font-medium transition-colors ${
                  appointmentType === t.value
                    ? 'bg-[#16A34A] text-white'
                    : 'bg-white border-[0.8px] border-[#E5E7EB] text-[#4B5563] active:bg-[#F3F4F6]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════ */}
        {/* FIELD 7: Reason / Notes */}
        {/* ════════════════════════════════════════════════════ */}
        <div>
          <label className="text-[13px] font-bold text-[#4B5563] mb-2 flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            سبب الزيارة <span className="font-normal text-[#9CA3AF]">(اختياري)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="أدخل سبب الزيارة..."
            rows={2}
            className="mt-2 w-full px-3.5 py-3 bg-[#F9FAFB] border-[0.8px] border-[#E5E7EB] rounded-xl text-[14px] text-[#030712] placeholder:text-[#D1D5DB] outline-none focus:border-[#16A34A] resize-none"
            dir="rtl"
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* STICKY FOOTER — Dual CTA (72px) + 120px clearance */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t-[0.8px] border-[#E5E7EB] px-4 py-3 safe-area-bottom">
        <div className="flex gap-3 max-w-md mx-auto">
          {/* Save Only — outlined */}
          <button
            onClick={() => handleSubmit('save')}
            disabled={!isFormReady || !!submitting}
            className="flex-1 h-12 rounded-xl border-[1.5px] border-[#16A34A] text-[#16A34A] text-[14px] font-bold flex items-center justify-center gap-1.5 active:bg-[#F0FDF4] transition-colors disabled:opacity-40 disabled:border-[#D1D5DB] disabled:text-[#D1D5DB]"
          >
            {submitting === 'save' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'حفظ فقط'
            )}
          </button>

          {/* Save & Start Session — filled primary */}
          <button
            onClick={() => handleSubmit('save-start')}
            disabled={!isFormReady || !!submitting}
            className="flex-1 h-12 rounded-xl bg-[#16A34A] text-white text-[14px] font-bold flex items-center justify-center gap-1.5 active:bg-[#15803D] transition-colors disabled:opacity-40"
          >
            {submitting === 'save-start' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'تأكيد الحجز'
            )}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* BACK CONFIRMATION DIALOG */}
      {/* ═══════════════════════════════════════════════════════ */}
      {showBackConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-8"
          onClick={() => setShowBackConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-[310px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-[#FFFBEB] flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-[#D97706]" />
              </div>
            </div>
            <h3 className="text-[16px] font-bold text-[#030712] text-center mb-1.5">
              هل تريد المغادرة؟
            </h3>
            <p className="text-[13px] text-[#6B7280] text-center mb-5 leading-relaxed">
              لديك بيانات غير محفوظة. هل تريد المغادرة بدون حفظ؟
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBackConfirm(false)}
                className="flex-1 h-11 rounded-xl border-[0.8px] border-[#E5E7EB] text-[14px] font-bold text-[#4B5563] active:bg-[#F3F4F6]"
              >
                البقاء
              </button>
              <button
                onClick={() => router.back()}
                className="flex-1 h-11 rounded-xl bg-[#EF4444] text-white text-[14px] font-bold active:bg-[#DC2626]"
              >
                مغادرة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
