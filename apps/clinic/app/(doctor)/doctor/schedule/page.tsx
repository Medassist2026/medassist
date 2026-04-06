'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

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
  patient_age?: number
  patient_sex?: string
  start_time: string
  duration_minutes: number
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  type?: string
  description?: string
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
 * Returns a Date whose year/month/day reflects Cairo local time (UTC+3).
 * Using new Date() alone returns UTC which is 3 hours behind — this causes
 * "today" to appear as yesterday until 03:00 Cairo time.
 */
function getCairoToday(): Date {
  const nowCairo = new Date(Date.now() + 3 * 60 * 60 * 1000)
  return new Date(nowCairo.getUTCFullYear(), nowCairo.getUTCMonth(), nowCairo.getUTCDate())
}

/** Returns today's date string as YYYY-MM-DD in Cairo time */
function getCairoTodayStr(): string {
  const nowCairo = new Date(Date.now() + 3 * 60 * 60 * 1000)
  return nowCairo.toISOString().split('T')[0]
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
                    <div key={slotIdx} className="flex items-center gap-2">
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

// 2 pixels per minute → 1 hour = 120px, 15 min = 30px (readable), 30 min = 60px
const PPM = 2

interface DayViewProps {
  date: Date
  appointments: Appointment[]
  availability: WeeklyAvailability
  onAppointmentClick: (apt: Appointment) => void
  onCellClick?: (date: Date, hour: number, minute: number) => void
}

function DayView({ date, appointments, availability, onAppointmentClick, onCellClick }: DayViewProps) {
  const dayName = DAY_NAMES[date.getDay()]
  const dayAvailability = availability[dayName]

  const dayAppointments = useMemo(
    () => appointments.filter(apt => isSameDay(new Date(apt.start_time), date)),
    [appointments, date]
  )
  const overlappingIds = useMemo(() => detectOverlaps(dayAppointments), [dayAppointments])
  const hasOverlaps = overlappingIds.size > 0

  // ── Smart range: clip to working hours ± appointments, pad ±1 hour ─────────
  const { startHour, endHour } = useMemo(() => {
    let sh = 23, eh = 1
    if (dayAvailability.enabled && dayAvailability.slots.length > 0) {
      for (const slot of dayAvailability.slots) {
        sh = Math.min(sh, parseInt(slot.start.split(':')[0], 10))
        eh = Math.max(eh, parseInt(slot.end.split(':')[0], 10))
      }
    } else {
      sh = 8; eh = 20
    }
    for (const apt of dayAppointments) {
      const aptDt = new Date(apt.start_time)
      const h = parseInt(aptDt.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Africa/Cairo' }), 10)
      const m = parseInt(aptDt.toLocaleString('en-US', { minute: '2-digit', timeZone: 'Africa/Cairo' }), 10)
      sh = Math.min(sh, h)
      eh = Math.max(eh, Math.ceil((h * 60 + m + apt.duration_minutes) / 60))
    }
    if (sh >= eh) { sh = 8; eh = 22 }
    return { startHour: Math.max(0, sh - 1), endHour: Math.min(24, eh + 1) }
  }, [dayAvailability, dayAppointments])

  const hours = Array.from({ length: endHour - startHour }, (_, i) => i + startHour)
  const totalHeight = (endHour - startHour) * 60 * PPM

  // ── Canvas click: snap to 15-min grid ────────────────────────────────────
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!onCellClick) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const totalMin = Math.floor(y / PPM)
    const snapped = Math.floor(totalMin / 15) * 15
    const h = startHour + Math.floor(snapped / 60)
    const m = snapped % 60
    if (h >= endHour) return
    onCellClick(date, h, m)
  }, [onCellClick, date, startHour, endHour])

  return (
    <div className="bg-white rounded-xl shadow-soft border border-gray-100 overflow-hidden" dir="rtl">
      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-900">
          {date.toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric' })}
        </h3>
        {!dayAvailability.enabled && <p className="text-sm text-gray-500 mt-1">يوم إجازة</p>}
      </div>

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

      {/* ── Proportional time canvas ─────────────────────────────────────────── */}
      <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
        <div className="relative flex select-none" style={{ height: totalHeight }}>

          {/* Time label column */}
          <div className="w-16 flex-shrink-0 relative">
            {hours.map(hour => (
              <div
                key={hour}
                className="absolute w-full flex items-start justify-end pr-2 pt-0.5"
                style={{ top: (hour - startHour) * 60 * PPM }}
              >
                <span className="text-[11px] text-gray-400 leading-none tabular-nums">
                  {formatTime(`${hour.toString().padStart(2, '0')}:00`)}
                </span>
              </div>
            ))}
          </div>

          {/* Canvas: backgrounds, grid lines, appointment blocks, click target */}
          <div
            className="flex-1 relative"
            style={{ cursor: onCellClick ? 'cell' : 'default' }}
            onClick={handleCanvasClick}
          >
            {/* Hour background bands + top border */}
            {hours.map(hour => {
              const isWorkingHour = dayAvailability.enabled && dayAvailability.slots.some(slot => {
                const sh = parseInt(slot.start.split(':')[0], 10)
                const eh = parseInt(slot.end.split(':')[0], 10)
                return hour >= sh && hour < eh
              })
              return (
                <div
                  key={hour}
                  className={`absolute w-full border-t border-gray-100 ${!isWorkingHour ? 'bg-gray-50/70' : ''}`}
                  style={{ top: (hour - startHour) * 60 * PPM, height: 60 * PPM }}
                />
              )
            })}

            {/* Half-hour dashed dividers */}
            {hours.map(hour => (
              <div
                key={`h-${hour}`}
                className="absolute w-full border-t border-dashed border-gray-100"
                style={{ top: (hour - startHour) * 60 * PPM + 30 * PPM }}
              />
            ))}

            {/* Appointment blocks — absolutely positioned by real time */}
            {dayAppointments.map(apt => {
              const aptDt = new Date(apt.start_time)
              const aptH = parseInt(aptDt.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Africa/Cairo' }), 10)
              const aptM = parseInt(aptDt.toLocaleString('en-US', { minute: '2-digit', timeZone: 'Africa/Cairo' }), 10)
              const top = ((aptH - startHour) * 60 + aptM) * PPM
              const height = Math.max(apt.duration_minutes * PPM, 28)
              const isOverlapping = overlappingIds.has(apt.id)

              return (
                <button
                  key={apt.id}
                  onClick={(e) => { e.stopPropagation(); onAppointmentClick(apt) }}
                  className={`absolute right-1 left-1 rounded-lg px-2 py-0.5 text-right overflow-hidden hover:opacity-90 transition-opacity z-10 ${
                    isOverlapping
                      ? 'bg-amber-50 text-amber-900 border-2 border-amber-400'
                      : apt.status === 'completed'
                      ? 'bg-green-100 text-green-800 border border-green-200'
                      : apt.status === 'cancelled'
                      ? 'bg-gray-100 text-gray-500 border border-gray-200 line-through'
                      : 'bg-primary-100 text-primary-800 border border-primary-200 hover:bg-primary-200'
                  }`}
                  style={{ top, height, cursor: 'pointer' }}
                >
                  <div className="font-medium text-xs flex items-center gap-1 flex-row-reverse leading-tight">
                    {isOverlapping && (
                      <svg className="w-3 h-3 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    )}
                    <span className="truncate">{apt.patient_name}</span>
                  </div>
                  {height >= 36 && (
                    <div className="text-[10px] opacity-75 leading-tight">
                      {new Date(apt.start_time).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Cairo' })}
                      {' · '}{apt.duration_minutes}د
                      {isOverlapping && ' ⚠️'}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
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
  const today = getCairoToday()

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
                {/* Full name on ≥sm screens, short on mobile */}
                <span className="hidden sm:inline">{DAY_LABELS_FULL[date.getDay()]}</span>
                <span className="sm:hidden">{DAY_LABELS[date.getDay()]}</span>
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
  defaultTime?: string
  defaultPatientId?: string
  defaultType?: string
  appointments?: Appointment[]
}

function NewAppointmentModal({ onClose, onCreated, defaultDate, defaultTime, defaultPatientId, defaultType, appointments }: NewAppointmentModalProps) {
  const [patientSearch, setPatientSearch] = useState('')
  const [patients, setPatients] = useState<any[]>([])
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [searching, setSearching] = useState(false)
  const [date, setDate] = useState(defaultDate ? defaultDate.toISOString().split('T')[0] : getCairoTodayStr())
  const [time, setTime] = useState(defaultTime || '16:00')
  const [duration, setDuration] = useState(15)
  const [appointmentType, setAppointmentType] = useState(defaultType || 'regular')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [outsideHoursWarning, setOutsideHoursWarning] = useState(false)
  const [pastTimeWarning, setPastTimeWarning] = useState(false)
  const [clashWarning, setClashWarning] = useState<Appointment | null>(null)
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)

  // Auto-load default patient when coming from session end (follow-up booking)
  useEffect(() => {
    if (!defaultPatientId) return
    fetch(`/api/doctor/patients/${defaultPatientId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.patient) setSelectedPatient({ id: data.patient.id, full_name: data.patient.full_name || data.patient.name, phone: data.patient.phone })
        else if (data?.id) setSelectedPatient(data)
      })
      .catch(() => {})
  }, [defaultPatientId])

  const handlePatientSearch = (query: string) => {
    setPatientSearch(query)
    setSelectedPatient(null)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    // Normalize Arabic-Indic digits (٠١٢…٩) → Latin (012…9) so phone search
    // works when the user types numerals from an Arabic keyboard.
    const normalized = query.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    if (normalized.trim().length < 2) { setPatients([]); return }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/doctor/patients/search?q=${encodeURIComponent(normalized.trim())}`)
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
      // Construct ISO string with explicit Cairo offset (+02:00) so the time is
      // never mis-converted regardless of the server/browser timezone.
      const startTime = `${date}T${time}:00+02:00`
      const selectedMs = new Date(startTime).getTime()

      // --- Past-time check ---
      if (!pastTimeWarning && selectedMs < Date.now()) {
        setPastTimeWarning(true)
        setSubmitting(false)
        return
      }

      // --- Clash check against already-loaded appointments ---
      if (!clashWarning && appointments) {
        const selectedEnd = selectedMs + duration * 60_000
        const clash = appointments.find(apt => {
          if (apt.status === 'cancelled' || apt.status === 'no_show') return false
          const aptStart = new Date(apt.start_time).getTime()
          const aptEnd = aptStart + apt.duration_minutes * 60_000
          return selectedMs < aptEnd && aptStart < selectedEnd
        })
        if (clash) {
          setClashWarning(clash)
          setSubmitting(false)
          return
        }
      }

      const res = await fetch('/api/doctor/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          startTime,
          durationMinutes: duration,
          appointmentType,
          notes: notes.trim() || undefined,
          skipHoursCheck: outsideHoursWarning ? true : undefined,
        })
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.outsideHours && !outsideHoursWarning) {
          setOutsideHoursWarning(true)
          setSubmitting(false)
          return
        }
        setModalError(data.error || 'فشل في إنشاء الموعد')
        return
      }
      onCreated()
    } catch { setModalError('فشل في إنشاء الموعد') } finally { setSubmitting(false) }
  }

  // Step size matches the selected duration so doctors can book at :00, :15, :30, :45 etc.
  const timeOptions = useMemo(() => {
    const step = duration <= 10 ? 10 : duration <= 20 ? 15 : 30
    const opts: string[] = []
    for (let h = 8; h <= 23; h++) {
      for (let m = 0; m < 60; m += step) {
        opts.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
      }
    }
    return opts
  }, [duration])

  // When duration changes, snap the current time to the nearest valid step
  useEffect(() => {
    const step = duration <= 10 ? 10 : duration <= 20 ? 15 : 30
    const [hStr, mStr] = time.split(':')
    const h = parseInt(hStr, 10)
    const m = parseInt(mStr, 10)
    const snapped = Math.round(m / step) * step
    const newM = snapped >= 60 ? 0 : snapped
    const newH = snapped >= 60 ? Math.min(h + 1, 23) : h
    const newTime = `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`
    if (newTime !== time) setTime(newTime)
  }, [duration]) // eslint-disable-line react-hooks/exhaustive-deps

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
          {outsideHoursWarning && !modalError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">⚠️</span>
              <div>
                <p className="font-medium">الموعد خارج ساعات العمل</p>
                <p className="text-amber-700 mt-0.5">هذا الموعد خارج ساعات العمل المعتادة. اضغط &quot;حجز الموعد&quot; مرة أخرى للتأكيد.</p>
              </div>
            </div>
          )}
          {pastTimeWarning && !modalError && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
              <span className="mt-0.5">🕐</span>
              <div>
                <p className="font-medium">هذا الموعد في الماضي</p>
                <p className="text-red-700 mt-0.5">الوقت المختار قد مضى. اضغط &quot;حجز الموعد&quot; مرة أخرى للتأكيد.</p>
              </div>
            </div>
          )}
          {clashWarning && !modalError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">⚠️</span>
              <div>
                <p className="font-medium">تعارض مع موعد آخر</p>
                <p className="text-amber-700 mt-0.5">
                  يوجد تعارض مع موعد {clashWarning.patient_name} في{' '}
                  {new Date(clashWarning.start_time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })}.
                  اضغط &quot;حجز الموعد&quot; مرة أخرى للتأكيد.
                </p>
              </div>
            </div>
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
              <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setOutsideHoursWarning(false); setPastTimeWarning(false); setClashWarning(null) }} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الوقت</label>
              <select value={time} onChange={(e) => { setTime(e.target.value); setOutsideHoursWarning(false); setPastTimeWarning(false); setClashWarning(null) }} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none">
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
                <option value="regular">كشف</option>
                <option value="followup">متابعة</option>
                <option value="emergency">طارئ</option>
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
            {submitting ? 'جاري الحجز...' : (outsideHoursWarning || pastTimeWarning || clashWarning) ? 'تأكيد الحجز رغم ذلك' : 'حجز الموعد'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// EDIT APPOINTMENT MODAL
// ============================================================================

interface EditAppointmentModalProps {
  appointment: Appointment
  onClose: () => void
  onSaved: (updated: Partial<Appointment>) => void
}

function EditAppointmentModal({ appointment, onClose, onSaved }: EditAppointmentModalProps) {
  // Parse existing start_time into Cairo date + time strings
  const aptDt = new Date(appointment.start_time)
  const initDate = aptDt.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) // YYYY-MM-DD
  const initHour = parseInt(aptDt.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Africa/Cairo' }), 10)
  const initMin  = parseInt(aptDt.toLocaleString('en-US', { minute: '2-digit', timeZone: 'Africa/Cairo' }), 10)
  const initTime = `${initHour.toString().padStart(2,'0')}:${initMin.toString().padStart(2,'0')}`

  const [date, setDate] = useState(initDate)
  const [time, setTime] = useState(initTime)
  const [duration, setDuration] = useState(appointment.duration_minutes)
  const [aptType, setAptType] = useState(appointment.type || 'regular')
  const [notes, setNotes] = useState(appointment.description || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Time options — step follows duration
  const timeOptions = useMemo(() => {
    const step = duration <= 10 ? 10 : duration <= 20 ? 15 : 30
    const opts: string[] = []
    for (let h = 0; h <= 23; h++)
      for (let m = 0; m < 60; m += step)
        opts.push(`${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`)
    return opts
  }, [duration])

  const handleSave = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const startTime = `${date}T${time}:00+02:00`
      const res = await fetch('/api/doctor/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: appointment.id,
          startTime,
          durationMinutes: duration,
          appointmentType: aptType,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'فشل في تعديل الموعد'); return }
      onSaved({ start_time: startTime, duration_minutes: duration, type: aptType, description: notes.trim() || undefined })
    } catch { setError('فشل في تعديل الموعد') } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-row-reverse">
          <h2 className="text-lg font-bold text-gray-900">تعديل الموعد</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

          {/* Patient — display only */}
          <div className="bg-gray-50 rounded-lg p-3 text-right">
            <p className="text-xs text-gray-500 mb-0.5">المريض</p>
            <p className="font-semibold text-gray-900">{appointment.patient_name}</p>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الوقت</label>
              <select value={time} onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm">
                {timeOptions.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
              </select>
            </div>
          </div>

          {/* Duration + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">المدة</label>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm">
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
              <select value={aptType} onChange={(e) => setAptType(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm">
                <option value="regular">كشف</option>
                <option value="followup">متابعة</option>
                <option value="emergency">طارئ</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none text-right text-sm" />
          </div>
        </div>
        <div className="p-5 border-t border-gray-100 flex justify-start gap-3 flex-row-reverse">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm" disabled={submitting}>إلغاء</button>
          <button onClick={handleSave} disabled={submitting}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium text-sm">
            {submitting ? 'جاري الحفظ...' : 'حفظ التغييرات'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// APPOINTMENT DETAIL BOTTOM SHEET
// ============================================================================

function getTypeLabelAr(type?: string): string {
  switch (type) {
    case 'followup': return 'متابعة'
    case 'emergency': return 'طوارئ'
    default: return 'كشف'
  }
}

function getTypeColorAr(type?: string): string {
  switch (type) {
    case 'emergency': return 'bg-red-50 text-red-700'
    case 'followup': return 'bg-blue-50 text-blue-700'
    default: return 'bg-[#F3F4F6] text-[#4B5563]'
  }
}

interface AppointmentDetailSheetProps {
  appointment: Appointment | null
  onClose: () => void
  onStartSession: (apt: Appointment) => void
  onCancel: (apt: Appointment) => void
  onEdit: (apt: Appointment) => void
  cancelling: boolean
}

function AppointmentDetailSheet({
  appointment,
  onClose,
  onStartSession,
  onCancel,
  onEdit,
  cancelling,
}: AppointmentDetailSheetProps) {
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  if (!appointment) return null

  const aptDate = new Date(appointment.start_time)
  const dateStr = aptDate.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = aptDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  const isActionable = appointment.status === 'scheduled' || appointment.status === 'confirmed'

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end"
      onClick={onClose}
    >
      <div
        className="w-full bg-white rounded-t-2xl pt-4 pb-8 px-4 max-w-md mx-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Handle bar */}
        <div className="w-10 h-1 bg-[#E5E7EB] rounded-full mx-auto mb-4" />

        {/* Patient name + type badge */}
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-cairo text-[18px] font-bold text-[#030712] truncate flex-1 min-w-0">
            {appointment.patient_name}
          </h3>
          <span className={`font-cairo text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 mr-2 ${getTypeColorAr(appointment.type)}`}>
            {getTypeLabelAr(appointment.type)}
          </span>
        </div>

        {/* Patient meta */}
        {(appointment.patient_age || appointment.patient_sex) && (
          <p className="font-cairo text-[12px] text-[#6B7280] mb-3">
            {[
              appointment.patient_age ? `${appointment.patient_age} سنة` : null,
              appointment.patient_sex === 'male' ? 'ذكر' : appointment.patient_sex === 'female' ? 'أنثى' : null,
            ].filter(Boolean).join(' · ')}
          </p>
        )}

        {/* Date + time */}
        <div className="bg-[#F9FAFB] rounded-xl p-3 mb-3">
          <p className="font-cairo text-[13px] font-semibold text-[#030712]">{dateStr}</p>
          <p className="font-cairo text-[12px] text-[#6B7280] mt-0.5">
            {timeStr} · مدة {appointment.duration_minutes} دقيقة
          </p>
        </div>

        {/* Reason/notes */}
        {appointment.description && (
          <div className="bg-[#F9FAFB] rounded-xl p-3 mb-4">
            <p className="font-cairo text-[11px] text-[#9CA3AF] mb-0.5">سبب الزيارة</p>
            <p className="font-cairo text-[13px] text-[#4B5563]">{appointment.description}</p>
          </div>
        )}

        {/* Actions */}
        {isActionable ? (
          <div className="flex gap-2 mt-2">
            {confirmingCancel ? (
              /* Second tap: confirm or go back */
              <>
                <button
                  onClick={() => { onCancel(appointment); setConfirmingCancel(false) }}
                  disabled={cancelling}
                  className="h-[50px] px-4 rounded-xl border-[0.8px] border-[#FCA5A5] bg-[#FEF2F2] font-cairo text-[13px] font-bold text-[#EF4444] flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-[0.97] transition-transform"
                >
                  {cancelling ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : null}
                  تأكيد الإلغاء
                </button>
                <button
                  onClick={() => setConfirmingCancel(false)}
                  disabled={cancelling}
                  className="flex-1 h-[50px] rounded-xl border-[0.8px] border-[#D1D5DB] bg-[#F9FAFB] font-cairo text-[13px] font-bold text-[#374151] flex items-center justify-center disabled:opacity-40 active:scale-[0.97] transition-transform"
                >
                  رجوع
                </button>
              </>
            ) : (
              /* First tap: show cancel + start session */
              <>
                <button
                  onClick={() => setConfirmingCancel(true)}
                  disabled={cancelling}
                  className="h-[50px] px-4 rounded-xl border-[0.8px] border-[#FCA5A5] bg-[#FEF2F2] font-cairo text-[13px] font-bold text-[#EF4444] flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-[0.97] transition-transform"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  إلغاء الموعد
                </button>
                {/* Edit appointment */}
                <button
                  onClick={() => onEdit(appointment)}
                  className="h-[50px] px-4 rounded-xl border-[0.8px] border-[#93C5FD] bg-[#EFF6FF] font-cairo text-[13px] font-bold text-[#1D4ED8] flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  تعديل
                </button>
                {/* Start session */}
                <button
                  onClick={() => onStartSession(appointment)}
                  className="flex-1 h-[50px] rounded-xl bg-[#16A34A] text-white font-cairo text-[14px] font-bold flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                  </svg>
                  بدء الجلسة
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="text-center py-2">
            <span className={`font-cairo text-[13px] font-bold px-3 py-1.5 rounded-full ${
              appointment.status === 'cancelled'
                ? 'bg-[#FEF2F2] text-[#EF4444]'
                : appointment.status === 'completed'
                ? 'bg-[#F0FDF4] text-[#16A34A]'
                : 'bg-[#F3F4F6] text-[#6B7280]'
            }`}>
              {appointment.status === 'cancelled' ? 'ملغي' : appointment.status === 'completed' ? 'مكتمل' : appointment.status}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN SCHEDULE PAGE
// ============================================================================

function SchedulePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // State
  const [view, setView] = useState<'day' | 'week'>('week')
  const [selectedDate, setSelectedDate] = useState(getCairoToday())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [availability, setAvailability] = useState<WeeklyAvailability>(DEFAULT_AVAILABILITY)
  const [showWorkingHoursEditor, setShowWorkingHoursEditor] = useState(false)
  const [showNewAppointment, setShowNewAppointment] = useState(false)
  const [newAptDefaultDate, setNewAptDefaultDate] = useState<Date | undefined>(undefined)
  const [newAptDefaultTime, setNewAptDefaultTime] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Appointment detail sheet
  const [detailApt, setDetailApt] = useState<Appointment | null>(null)
  const [editingApt, setEditingApt] = useState<Appointment | null>(null)

  // Deep-link: auto-open new appointment modal (from follow-up button at session end)
  const autoOpenPatientId = searchParams.get('patientId') || undefined
  const autoOpenType = searchParams.get('type') || undefined
  useEffect(() => {
    if (searchParams.get('autoOpen') === '1') {
      setShowNewAppointment(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [cancelling, setCancelling] = useState(false)

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
      void err
      setError('فشل في تحميل الجدول')
    } finally {
      setLoading(false)
    }
  }, [weekRange.endDate, weekRange.startDate])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Navigation
  const goToToday = () => setSelectedDate(getCairoToday())

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

  // Handle appointment click — open detail sheet
  const handleAppointmentClick = (apt: Appointment) => {
    setDetailApt(apt)
  }

  // Open edit modal from detail sheet
  const handleEditAppointment = (apt: Appointment) => {
    setDetailApt(null)
    setEditingApt(apt)
  }

  // Handle edit saved — update local state then reload
  const handleEditSaved = (updated: Partial<Appointment>) => {
    setAppointments(prev => prev.map(a => a.id === editingApt?.id ? { ...a, ...updated } : a))
    setEditingApt(null)
    loadData()
  }

  // Handle cell click — pre-fill modal with clicked date + hour:minute
  const handleCellClick = (date: Date, hour: number, minute: number = 0) => {
    setNewAptDefaultDate(date)
    setNewAptDefaultTime(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`)
    setShowNewAppointment(true)
  }

  // Start session from detail sheet
  const handleStartSession = (apt: Appointment) => {
    setDetailApt(null)
    if (apt.patient_id) {
      router.push(`/doctor/session?patientId=${apt.patient_id}&appointmentId=${apt.id}`)
    } else {
      router.push(`/doctor/session?appointmentId=${apt.id}`)
    }
  }

  // Cancel appointment from detail sheet
  const handleCancelAppointment = async (apt: Appointment) => {
    setCancelling(true)
    try {
      const res = await fetch('/api/doctor/appointments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: apt.id, status: 'cancelled' }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'فشل إلغاء الموعد')
        return
      }
      // Update local state immediately
      setAppointments((prev) =>
        prev.map((a) => (a.id === apt.id ? { ...a, status: 'cancelled' as const } : a))
      )
      setDetailApt(null)
    } catch {
      setError('فشل إلغاء الموعد')
    } finally {
      setCancelling(false)
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
      void err
      setError('فشل في حفظ ساعات العمل')
    } finally {
      setSaving(false)
    }
  }

  // True when the current view already shows today — used to grey-out اليوم button
  const isOnToday = useMemo(() => {
    const today = getCairoToday()
    return view === 'day'
      ? isSameDay(selectedDate, today)
      : weekDates.some(d => isSameDay(d, today))
  }, [view, selectedDate, weekDates])

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
    <div className="space-y-6 max-w-md mx-auto px-4 py-4 md:max-w-full md:px-0 md:py-0 relative" dir="rtl">
      {/* Appointment detail bottom sheet */}
      <AppointmentDetailSheet
        appointment={detailApt}
        onClose={() => setDetailApt(null)}
        onStartSession={handleStartSession}
        onCancel={handleCancelAppointment}
        onEdit={handleEditAppointment}
        cancelling={cancelling}
      />

      {/* Edit appointment modal */}
      {editingApt && (
        <EditAppointmentModal
          appointment={editingApt}
          onClose={() => setEditingApt(null)}
          onSaved={handleEditSaved}
        />
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 flex-col-reverse">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الجدول</h1>
          <p className="text-gray-600 mt-1">إدارة مواعيدك وأوقات العمل</p>
        </div>

        <div className="flex gap-3 flex-row-reverse">
          <button
            onClick={() => { setNewAptDefaultDate(undefined); setNewAptDefaultTime(undefined); setShowNewAppointment(true) }}
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
          onClose={() => { setShowNewAppointment(false); setNewAptDefaultDate(undefined); setNewAptDefaultTime(undefined) }}
          onCreated={() => {
            setShowNewAppointment(false)
            setNewAptDefaultDate(undefined)
            setNewAptDefaultTime(undefined)
            loadData()
          }}
          defaultDate={newAptDefaultDate ?? selectedDate}
          defaultTime={newAptDefaultTime}
          defaultPatientId={autoOpenPatientId}
          defaultType={autoOpenType}
          appointments={appointments}
        />
      )}

      {/* Navigation & View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white rounded-xl shadow-soft border border-gray-100 p-4 flex-col-reverse" dir="rtl">
        <div className="flex items-center gap-2 flex-row-reverse">
          {/* RTL fix: < (left-pointing) = next day (future is left in Arabic) */}
          <button
            onClick={goToNext}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title={view === 'day' ? 'اليوم التالي' : 'الأسبوع التالي'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={goToToday}
            disabled={isOnToday}
            title="انتقل إلى اليوم الحالي"
            className={`px-3 py-1 text-sm font-medium rounded-lg transition-opacity ${
              isOnToday
                ? 'text-gray-400 opacity-50 cursor-default'
                : 'text-primary-600 hover:bg-primary-50'
            }`}
          >
            اليوم
          </button>
          {/* RTL fix: > (right-pointing) = previous day (past is right in Arabic) */}
          <button
            onClick={goToPrevious}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title={view === 'day' ? 'اليوم السابق' : 'الأسبوع السابق'}
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
          onCellClick={handleCellClick}
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

export default function SchedulePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]" dir="rtl">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    }>
      <SchedulePageInner />
    </Suspense>
  )
}
