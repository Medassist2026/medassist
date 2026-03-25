'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ============================================================================
// TYPES
// ============================================================================

interface TimeSlot {
  start: string  // "09:00"
  end: string    // "17:00"
}

interface DayAvailability {
  enabled: boolean
  slots: TimeSlot[]
}

interface WeeklyAvailability {
  sunday: DayAvailability
  monday: DayAvailability
  tuesday: DayAvailability
  wednesday: DayAvailability
  thursday: DayAvailability
  friday: DayAvailability
  saturday: DayAvailability
}

interface Appointment {
  id: string
  patient_id?: string
  patient_name: string
  patient_phone?: string
  start_time: string
  duration_minutes: number
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  type?: string
}

// ============================================================================
// DEFAULT AVAILABILITY (Egypt working days: Sun-Thu)
// ============================================================================

const DEFAULT_AVAILABILITY: WeeklyAvailability = {
  sunday: { enabled: true, slots: [{ start: '16:00', end: '22:00' }] },
  monday: { enabled: true, slots: [{ start: '16:00', end: '22:00' }] },
  tuesday: { enabled: true, slots: [{ start: '16:00', end: '22:00' }] },
  wednesday: { enabled: true, slots: [{ start: '16:00', end: '22:00' }] },
  thursday: { enabled: true, slots: [{ start: '16:00', end: '22:00' }] },
  friday: { enabled: false, slots: [] },
  saturday: { enabled: true, slots: [{ start: '16:00', end: '22:00' }] },
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const DAY_LABELS = ['أحد', 'إثن', 'ثلا', 'أربع', 'خمي', 'جمع', 'سبت']
const DAY_LABELS_FULL = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatTime(time24: string): string {
  const [hours, minutes] = time24.split(':')
  const h = parseInt(hours, 10)
  const h24 = parseInt(hours, 10)
  const m = parseInt(minutes, 10)

  // Format in Arabic (24-hour format)
  const paddedHours = h24.toString().padStart(2, '0')
  const paddedMinutes = m.toString().padStart(2, '0')

  return `${paddedHours}:${paddedMinutes}`
}

function getWeekDates(date: Date): Date[] {
  const startOfWeek = new Date(date)
  const day = startOfWeek.getDay()
  startOfWeek.setDate(startOfWeek.getDate() - day)

  const dates: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek)
    d.setDate(startOfWeek.getDate() + i)
    dates.push(d)
  }
  return dates
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate()
}

/**
 * Detect overlapping appointments — returns a Set of appointment IDs that overlap
 */
function detectOverlaps(appointments: Appointment[]): Set<string> {
  const overlapping = new Set<string>()
  const active = appointments.filter(a => a.status !== 'cancelled' && a.status !== 'no_show')

  for (let i = 0; i < active.length; i++) {
    const a = active[i]
    const aStart = new Date(a.start_time).getTime()
    const aEnd = aStart + a.duration_minutes * 60_000

    for (let j = i + 1; j < active.length; j++) {
      const b = active[j]
      const bStart = new Date(b.start_time).getTime()
      const bEnd = bStart + b.duration_minutes * 60_000

      // Overlap: one starts before the other ends
      if (aStart < bEnd && bStart < aEnd) {
        overlapping.add(a.id)
        overlapping.add(b.id)
      }
    }
  }

  return overlapping
}

// ============================================================================
// COMPONENTS
// ============================================================================

interface ViewToggleProps {
  view: 'day' | 'week'
  onViewChange: (view: 'day' | 'week') => void
}

function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="inline-flex rounded-lg border border-gray-300 p-1 bg-gray-100" dir="rtl">
      <button
        onClick={() => onViewChange('day')}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
          view === 'day'
            ? 'bg-white text-primary-700 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        يوم
      </button>
      <button
        onClick={() => onViewChange('week')}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
          view === 'week'
            ? 'bg-white text-primary-700 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        أسبوع
      </button>
    </div>
  )
}

interface WorkingHoursEditorProps {
  availability: WeeklyAvailability
  onSave: (availability: WeeklyAvailability) => void
  onCancel: () => void
  saving: boolean
}

function WorkingHoursEditor({ availability, onSave, onCancel, saving }: WorkingHoursEditorProps) {
  const [localAvailability, setLocalAvailability] = useState<WeeklyAvailability>(availability)

  const toggleDay = (day: keyof WeeklyAvailability) => {
    setLocalAvailability(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        enabled: !prev[day].enabled,
        slots: !prev[day].enabled ? [{ start: '16:00', end: '22:00' }] : []
      }
    }))
  }

  const updateSlot = (day: keyof WeeklyAvailability, slotIndex: number, field: 'start' | 'end', value: string) => {
    setLocalAvailability(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: prev[day].slots.map((slot, i) =>
          i === slotIndex ? { ...slot, [field]: value } : slot
        )
      }
    }))
  }

  const addSlot = (day: keyof WeeklyAvailability) => {
    setLocalAvailability(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: [...prev[day].slots, { start: '14:00', end: '18:00' }]
      }
    }))
  }

  const removeSlot = (day: keyof WeeklyAvailability, slotIndex: number) => {
    setLocalAvailability(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: prev[day].slots.filter((_, i) => i !== slotIndex)
      }
    }))
  }

  // Generate time options (30-minute intervals)
  const timeOptions: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
      timeOptions.push(time)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-6" dir="rtl">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">تعديل ساعات العمل</h3>

      <div className="space-y-4">
        {DAY_NAMES.map((day, idx) => (
          <div key={day} className="flex items-start gap-4 py-3 border-b border-gray-100 last:border-0 flex-row-reverse">
            <div className="w-24 flex items-center gap-2 flex-row-reverse">
              <input
                type="checkbox"
                id={`day-${day}`}
                checked={localAvailability[day].enabled}
                onChange={() => toggleDay(day)}
                className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
              />
              <label htmlFor={`day-${day}`} className="font-medium text-gray-700">
                {DAY_LABELS_FULL[idx]}
              </label>
            </div>

            <div className="flex-1">
              {localAvailability[day].enabled ? (
                <div className="space-y-2">
                  {localAvailability[day].slots.map((slot, slotIdx) => (
                    <div key={slotIdx} className="flex items-center gap-2 flex-row-reverse">
                      <select
                        value={slot.start}
                        onChange={(e) => updateSlot(day, slotIdx, 'start', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      >
                        {timeOptions.map(t => (
                          <option key={t} value={t}>{formatTime(t)}</option>
                        ))}
                      </select>
                      <span className="text-gray-500">إلى</span>
                      <select
                        value={slot.end}
                        onChange={(e) => updateSlot(day, slotIdx, 'end', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      >
                        {timeOptions.map(t => (
                          <option key={t} value={t}>{formatTime(t)}</option>
                        ))}
                      </select>
                      {localAvailability[day].slots.length > 1 && (
                        <button
                          onClick={() => removeSlot(day, slotIdx)}
                          className="p-1 text-red-500 hover:text-red-700"
                          title="إزالة فترة زمنية"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => addSlot(day)}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    + إضافة فترة
                  </button>
                </div>
              ) : (
                <span className="text-gray-400 text-sm">غير متاح</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-start gap-3 flex-row-reverse">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          disabled={saving}
        >
          إلغاء
        </button>
        <button
          onClick={() => onSave(localAvailability)}
          disabled={saving}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
        </button>
      </div>
    </div>
  )
}

interface DayViewProps {
  date: Date
  appointments: Appointment[]
  availability: WeeklyAvailability
  onAppointmentClick: (apt: Appointment) => void
}

function DayView({ date, appointments, availability, onAppointmentClick }: DayViewProps) {
  const dayName = DAY_NAMES[date.getDay()]
  const dayAvailability = availability[dayName]

  // Generate hours for the day view (6 AM to 10 PM)
  const hours = Array.from({ length: 17 }, (_, i) => i + 6)

  // Filter appointments for this day (memoized for stable reference)
  const dayAppointments = useMemo(
    () => appointments.filter(apt => isSameDay(new Date(apt.start_time), date)),
    [appointments, date]
  )

  // Detect overlapping appointments
  const overlappingIds = useMemo(() => detectOverlaps(dayAppointments), [dayAppointments])
  const hasOverlaps = overlappingIds.size > 0

  return (
    <div className="bg-white rounded-xl shadow-soft border border-gray-100 overflow-hidden" dir="rtl">
      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-900">
          {date.toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric' })}
        </h3>
        {!dayAvailability.enabled && (
          <p className="text-sm text-gray-500 mt-1">يوم إجازة</p>
        )}
      </div>

      {/* Overlap Warning Banner */}
      {hasOverlaps && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2 flex-row-reverse">
          <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span className="font-cairo text-[13px] font-medium text-amber-800">
            تحذير: يوجد {overlappingIds.size} مواعيد متداخلة في هذا اليوم
          </span>
        </div>
      )}

      <div className="divide-y divide-gray-100 border-t border-gray-100">
        {hours.map(hour => {
          const hourStr = `${hour.toString().padStart(2, '0')}:00`
          const hourAppointments = dayAppointments.filter(apt => {
            // Use Cairo timezone for column bucketing
            const aptHour = parseInt(
              new Date(apt.start_time).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Africa/Cairo' }),
              10
            )
            return aptHour === hour
          })

          const isWorkingHour = dayAvailability.enabled && dayAvailability.slots.some(slot => {
            const startHour = parseInt(slot.start.split(':')[0], 10)
            const endHour = parseInt(slot.end.split(':')[0], 10)
            return hour >= startHour && hour < endHour
          })

          return (
            <div
              key={hour}
              className={`flex min-h-[60px] ${!isWorkingHour ? 'bg-gray-50' : ''}`}
            >
              <div className="w-20 flex-shrink-0 p-2 text-sm text-gray-500 border-l border-gray-100">
                {formatTime(hourStr)}
              </div>
              <div className="flex-1 p-2">
                {hourAppointments.map(apt => {
                  const isOverlapping = overlappingIds.has(apt.id)
                  return (
                    <button
                      key={apt.id}
                      onClick={() => onAppointmentClick(apt)}
                      className={`w-full text-right p-2 rounded-lg mb-1 ${
                        isOverlapping
                          ? 'bg-amber-50 text-amber-900 border-2 border-amber-400 ring-1 ring-amber-200'
                          : apt.status === 'completed'
                          ? 'bg-green-100 text-green-800 border border-green-200'
                          : apt.status === 'cancelled'
                          ? 'bg-gray-100 text-gray-500 border border-gray-200 line-through'
                          : 'bg-primary-100 text-primary-800 border border-primary-200 hover:bg-primary-200'
                      }`}
                    >
                      <div className="font-medium text-sm flex items-center gap-1.5 flex-row-reverse">
                        {isOverlapping && (
                          <svg className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                        )}
                        <span>{apt.patient_name}</span>
                      </div>
                      <div className="text-xs opacity-75">
                        {new Date(apt.start_time).toLocaleTimeString('ar-EG', {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: 'Africa/Cairo'
                        })}
                        {' · '}
                        {apt.duration_minutes} د
                        {isOverlapping && ' · تداخل ⚠️'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface WeekViewProps {
  weekDates: Date[]
  appointments: Appointment[]
  availability: WeeklyAvailability
  onAppointmentClick: (apt: Appointment) => void
  onDayClick: (date: Date) => void
}

function WeekView({ weekDates, appointments, availability, onAppointmentClick, onDayClick }: WeekViewProps) {
  const today = new Date()

  return (
    <div className="bg-white rounded-xl shadow-soft border border-gray-100 overflow-hidden" dir="rtl">
      <div className="grid grid-cols-7 border-b border-gray-100">
        {weekDates.map((date, idx) => {
          const dayName = DAY_NAMES[date.getDay()]
          const dayAvailability = availability[dayName]
          const isToday = isSameDay(date, today)

          return (
            <button
              key={idx}
              onClick={() => onDayClick(date)}
              className={`p-3 text-center border-l border-gray-100 first:border-l-0 hover:bg-gray-50 transition-colors ${
                !dayAvailability.enabled ? 'bg-gray-100' : ''
              }`}
            >
              <div className={`text-xs font-medium ${isToday ? 'text-primary-600' : 'text-gray-500'}`}>
                {DAY_LABELS[idx]}
              </div>
              <div className={`mt-1 w-8 h-8 mx-auto rounded-full flex items-center justify-center ${
                isToday
                  ? 'bg-primary-600 text-white font-bold'
                  : 'text-gray-900'
              }`}>
                {date.getDate()}
              </div>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-7 divide-x divide-gray-100 min-h-[400px]">
        {weekDates.map((date, idx) => {
          const dayName = DAY_NAMES[date.getDay()]
          const dayAvailability = availability[dayName]
          const dayAppointments = appointments.filter(apt => {
            const aptDate = new Date(apt.start_time)
            return isSameDay(aptDate, date)
          })

          return (
            <div
              key={idx}
              className={`p-2 ${!dayAvailability.enabled ? 'bg-gray-50' : ''}`}
            >
              {dayAppointments.length === 0 ? (
                <div className="text-center text-gray-400 text-xs mt-4" dir="rtl">
                  {dayAvailability.enabled ? 'لا مواعيد' : 'يوم إجازة'}
                </div>
              ) : (
                <div className="space-y-1">
                  {dayAppointments.slice(0, 5).map(apt => (
                    <button
                      key={apt.id}
                      onClick={() => onAppointmentClick(apt)}
                      className={`w-full text-right p-1.5 rounded text-xs ${
                        apt.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : apt.status === 'cancelled'
                          ? 'bg-gray-100 text-gray-500'
                          : 'bg-primary-100 text-primary-800 hover:bg-primary-200'
                      }`}
                    >
                      <div className="font-medium truncate">{apt.patient_name}</div>
                      <div className="opacity-75">
                        {new Date(apt.start_time).toLocaleTimeString('ar-EG', {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: 'Africa/Cairo'
                        })}
                      </div>
                    </button>
                  ))}
                  {dayAppointments.length > 5 && (
                    <div className="text-xs text-gray-500 text-center">
                      +{dayAppointments.length - 5} آخر
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// NEW APPOINTMENT MODAL
// ============================================================================

interface NewAppointmentModalProps {
  onClose: () => void
  onCreated: () => void
  defaultDate?: Date
}

function NewAppointmentModal({ onClose, onCreated, defaultDate }: NewAppointmentModalProps) {
  const [patientSearch, setPatientSearch] = useState('')
  const [patients, setPatients] = useState<any[]>([])
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [searching, setSearching] = useState(false)
  const [date, setDate] = useState(defaultDate ? defaultDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0])
  const [time, setTime] = useState('16:00')
  const [duration, setDuration] = useState(15)
  const [appointmentType, setAppointmentType] = useState('consultation')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)

  const handlePatientSearch = (query: string) => {
    setPatientSearch(query)
    setSelectedPatient(null)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (query.trim().length < 2) { setPatients([]); return }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/doctor/patients/search?q=${encodeURIComponent(query.trim())}`)
        if (res.ok) {
          const data = await res.json()
          setPatients(data.patients || [])
        }
      } catch { /* ignore */ } finally { setSearching(false) }
    }, 300)
  }

  const handleSubmit = async () => {
    if (!selectedPatient) { setModalError('يرجى اختيار مريض'); return }
    if (!date || !time) { setModalError('يرجى اختيار التاريخ والوقت'); return }

    setSubmitting(true)
    setModalError(null)
    try {
      const startTime = new Date(`${date}T${time}:00`).toISOString()
      const res = await fetch('/api/doctor/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          startTime,
          durationMinutes: duration,
          appointmentType,
          notes: notes.trim() || undefined,
        })
      })
      const data = await res.json()
      if (!res.ok) { setModalError(data.error || 'فشل في إنشاء الموعد'); return }
      onCreated()
    } catch { setModalError('فشل في إنشاء الموعد') } finally { setSubmitting(false) }
  }

  const timeOptions: string[] = []
  for (let h = 8; h <= 23; h++) {
    for (let m = 0; m < 60; m += 30) {
      timeOptions.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto max-w-md mx-auto">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between flex-row-reverse">
          <h2 className="text-xl font-bold text-gray-900">موعد جديد</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-5">
          {modalError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{modalError}</div>
          )}
          {/* Patient Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">المريض</label>
            {selectedPatient ? (
              <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-lg p-3 flex-row-reverse">
                <div className="text-right">
                  <p className="font-medium text-primary-900">{selectedPatient.name}</p>
                  <p className="text-xs text-primary-700">{selectedPatient.phone}</p>
                </div>
                <button onClick={() => { setSelectedPatient(null); setPatientSearch('') }} className="text-primary-600 hover:text-primary-800 text-sm font-medium">تغيير</button>
              </div>
            ) : (
              <div className="relative">
                <input type="text" value={patientSearch} onChange={(e) => handlePatientSearch(e.target.value)} placeholder="بحث بالاسم أو الهاتف..." className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-right" />
                {searching && <div className="absolute left-3 top-3"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div></div>}
                {patients.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {patients.map((p) => (
                      <button key={p.id} onClick={() => { setSelectedPatient(p); setPatients([]); setPatientSearch(p.name) }} className="w-full text-right px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                        <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                        <p className="text-xs text-gray-500">{p.phone}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الوقت</label>
              <select value={time} onChange={(e) => setTime(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none">
                {timeOptions.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
              </select>
            </div>
          </div>
          {/* Duration & Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">المدة</label>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none">
                <option value={10}>١٠ دقائق</option>
                <option value={15}>١٥ دقيقة</option>
                <option value={20}>٢٠ دقيقة</option>
                <option value={30}>٣٠ دقيقة</option>
                <option value={45}>٤٥ دقيقة</option>
                <option value={60}>٦٠ دقيقة</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">النوع</label>
              <select value={appointmentType} onChange={(e) => setAppointmentType(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none">
                <option value="consultation">كشف</option>
                <option value="followup">متابعة</option>
                <option value="procedure">إجراء</option>
                <option value="emergency">طوارئ</option>
              </select>
            </div>
          </div>
          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات (اختياري)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي ملاحظات عن الموعد..." rows={2} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none text-right" />
          </div>
        </div>
        <div className="p-6 border-t border-gray-100 flex justify-start gap-3 flex-row-reverse">
          <button onClick={onClose} className="px-5 py-2.5 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50" disabled={submitting}>إلغاء</button>
          <button onClick={handleSubmit} disabled={submitting || !selectedPatient} className="px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium">
            {submitting ? 'جاري الإنشاء...' : 'إنشاء موعد'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN SCHEDULE PAGE
// ============================================================================

export default function SchedulePage() {
  const router = useRouter()

  // State
  const [view, setView] = useState<'day' | 'week'>('week')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [availability, setAvailability] = useState<WeeklyAvailability>(DEFAULT_AVAILABILITY)
  const [showWorkingHoursEditor, setShowWorkingHoursEditor] = useState(false)
  const [showNewAppointment, setShowNewAppointment] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Calculate week dates
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate])
  const weekRange = useMemo(() => ({
    startDate: weekDates[0].toISOString().split('T')[0],
    endDate: weekDates[6].toISOString().split('T')[0]
  }), [weekDates])

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Load availability
      const availRes = await fetch('/api/doctor/availability')
      if (availRes.ok) {
        const data = await availRes.json()
        if (data.availability) {
          setAvailability(data.availability)
        }
      }

      // Load appointments for the week
      const aptRes = await fetch(`/api/doctor/appointments?start=${weekRange.startDate}&end=${weekRange.endDate}`)
      if (aptRes.ok) {
        const data = await aptRes.json()
        setAppointments(data.appointments || [])
      }
    } catch (err) {
      console.error('Failed to load schedule data:', err)
      setError('فشل في تحميل الجدول')
    } finally {
      setLoading(false)
    }
  }, [weekRange.endDate, weekRange.startDate])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Navigation
  const goToToday = () => setSelectedDate(new Date())

  const goToPrevious = () => {
    const newDate = new Date(selectedDate)
    if (view === 'day') {
      newDate.setDate(newDate.getDate() - 1)
    } else {
      newDate.setDate(newDate.getDate() - 7)
    }
    setSelectedDate(newDate)
  }

  const goToNext = () => {
    const newDate = new Date(selectedDate)
    if (view === 'day') {
      newDate.setDate(newDate.getDate() + 1)
    } else {
      newDate.setDate(newDate.getDate() + 7)
    }
    setSelectedDate(newDate)
  }

  // Handle view change (BUG-005 FIX)
  const handleViewChange = (newView: 'day' | 'week') => {
    setView(newView)
  }

  // Handle day click (switch to day view)
  const handleDayClick = (date: Date) => {
    setSelectedDate(date)
    setView('day')
  }

  // Handle appointment click
  const handleAppointmentClick = (apt: Appointment) => {
    // Navigate to session with this patient
    if (apt.patient_id) {
      router.push(`/doctor/session?patientId=${apt.patient_id}&appointmentId=${apt.id}`)
    } else {
      router.push(`/doctor/session?appointmentId=${apt.id}`)
    }
  }

  // Save working hours (BUG-004 FIX)
  const handleSaveWorkingHours = async (newAvailability: WeeklyAvailability) => {
    try {
      setSaving(true)
      setError(null)

      const res = await fetch('/api/doctor/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability: newAvailability })
      })

      if (!res.ok) {
        throw new Error('Failed to save working hours')
      }

      setAvailability(newAvailability)
      setShowWorkingHoursEditor(false)
    } catch (err) {
      console.error('Failed to save working hours:', err)
      setError('فشل في حفظ ساعات العمل')
    } finally {
      setSaving(false)
    }
  }

  // Get current period label
  const getPeriodLabel = () => {
    if (view === 'day') {
      return selectedDate.toLocaleDateString('ar-EG', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    } else {
      const start = weekDates[0]
      const end = weekDates[6]
      if (start.getMonth() === end.getMonth()) {
        return `${start.toLocaleDateString('ar-EG', { month: 'long' })} ${start.getDate()} - ${end.getDate()}, ${end.getFullYear()}`
      } else {
        return `${start.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', year: 'numeric' })}`
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-md mx-auto px-4 py-4 md:max-w-full md:px-0 md:py-0" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 flex-col-reverse">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الجدول</h1>
          <p className="text-gray-600 mt-1">إدارة مواعيدك وأوقات العمل</p>
        </div>

        <div className="flex gap-3 flex-row-reverse">
          <button
            onClick={() => setShowNewAppointment(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium flex-row-reverse"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            موعد جديد
          </button>
          <button
            onClick={() => setShowWorkingHoursEditor(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex-row-reverse"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            ساعات العمل
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg" dir="rtl">
          {error}
        </div>
      )}

      {/* Working Hours Editor Modal */}
      {showWorkingHoursEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <WorkingHoursEditor
              availability={availability}
              onSave={handleSaveWorkingHours}
              onCancel={() => setShowWorkingHoursEditor(false)}
              saving={saving}
            />
          </div>
        </div>
      )}

      {/* New Appointment Modal */}
      {showNewAppointment && (
        <NewAppointmentModal
          onClose={() => setShowNewAppointment(false)}
          onCreated={() => {
            setShowNewAppointment(false)
            loadData()
          }}
          defaultDate={selectedDate}
        />
      )}

      {/* Navigation & View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white rounded-xl shadow-soft border border-gray-100 p-4 flex-col-reverse" dir="rtl">
        <div className="flex items-center gap-2 flex-row-reverse">
          <button
            onClick={goToPrevious}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title={view === 'day' ? 'اليوم السابق' : 'الأسبوع السابق'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg"
          >
            اليوم
          </button>
          <button
            onClick={goToNext}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title={view === 'day' ? 'اليوم التالي' : 'الأسبوع التالي'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <h2 className="text-lg font-semibold text-gray-900 ml-4">
            {getPeriodLabel()}
          </h2>
        </div>

        {/* View Toggle - BUG-005 FIX */}
        <ViewToggle view={view} onViewChange={handleViewChange} />
      </div>

      {/* Calendar View */}
      {view === 'day' ? (
        <DayView
          date={selectedDate}
          appointments={appointments}
          availability={availability}
          onAppointmentClick={handleAppointmentClick}
        />
      ) : (
        <WeekView
          weekDates={weekDates}
          appointments={appointments}
          availability={availability}
          onAppointmentClick={handleAppointmentClick}
          onDayClick={handleDayClick}
        />
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-4 text-center" dir="rtl">
          <div className="text-2xl font-bold text-primary-600">
            {appointments.filter(a => a.status === 'scheduled' || a.status === 'confirmed').length}
          </div>
          <div className="text-sm text-gray-600">قادمة</div>
        </div>
        <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-4 text-center" dir="rtl">
          <div className="text-2xl font-bold text-green-600">
            {appointments.filter(a => a.status === 'completed').length}
          </div>
          <div className="text-sm text-gray-600">مكتملة</div>
        </div>
        <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-4 text-center" dir="rtl">
          <div className="text-2xl font-bold text-red-600">
            {appointments.filter(a => a.status === 'cancelled' || a.status === 'no_show').length}
          </div>
          <div className="text-sm text-gray-600">ملغاة</div>
        </div>
        <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-4 text-center" dir="rtl">
          <div className="text-2xl font-bold text-gray-600">
            {appointments.length}
          </div>
          <div className="text-sm text-gray-600">إجمالي الأسبوع</div>
        </div>
      </div>
    </div>
  )
}
