'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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
  sunday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] },
  monday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] },
  tuesday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] },
  wednesday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] },
  thursday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] },
  friday: { enabled: false, slots: [] },
  saturday: { enabled: false, slots: [] },
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_LABELS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatTime(time24: string): string {
  const [hours, minutes] = time24.split(':')
  const h = parseInt(hours, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${minutes} ${ampm}`
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

// ============================================================================
// COMPONENTS
// ============================================================================

interface ViewToggleProps {
  view: 'day' | 'week'
  onViewChange: (view: 'day' | 'week') => void
}

function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="inline-flex rounded-lg border border-gray-300 p-1 bg-gray-100">
      <button
        onClick={() => onViewChange('day')}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
          view === 'day'
            ? 'bg-white text-primary-700 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        Day
      </button>
      <button
        onClick={() => onViewChange('week')}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
          view === 'week'
            ? 'bg-white text-primary-700 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        Week
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
        slots: !prev[day].enabled ? [{ start: '09:00', end: '17:00' }] : []
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
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Working Hours</h3>
      
      <div className="space-y-4">
        {DAY_NAMES.map((day, idx) => (
          <div key={day} className="flex items-start gap-4 py-3 border-b border-gray-100 last:border-0">
            <div className="w-24 flex items-center gap-2">
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
                      <span className="text-gray-500">to</span>
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
                          title="Remove time slot"
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
                    + Add time slot
                  </button>
                </div>
              ) : (
                <span className="text-gray-400 text-sm">Not available</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          disabled={saving}
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(localAvailability)}
          disabled={saving}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
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
  
  // Filter appointments for this day
  const dayAppointments = appointments.filter(apt => {
    const aptDate = new Date(apt.start_time)
    return isSameDay(aptDate, date)
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-900">
          {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </h3>
        {!dayAvailability.enabled && (
          <p className="text-sm text-gray-500 mt-1">Day off</p>
        )}
      </div>
      
      <div className="divide-y divide-gray-100">
        {hours.map(hour => {
          const hourStr = `${hour.toString().padStart(2, '0')}:00`
          const hourAppointments = dayAppointments.filter(apt => {
            const aptHour = new Date(apt.start_time).getHours()
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
              <div className="w-20 flex-shrink-0 p-2 text-sm text-gray-500 border-r border-gray-100">
                {formatTime(hourStr)}
              </div>
              <div className="flex-1 p-2">
                {hourAppointments.map(apt => (
                  <button
                    key={apt.id}
                    onClick={() => onAppointmentClick(apt)}
                    className={`w-full text-left p-2 rounded-lg mb-1 ${
                      apt.status === 'completed' 
                        ? 'bg-green-100 text-green-800 border border-green-200'
                        : apt.status === 'cancelled'
                        ? 'bg-gray-100 text-gray-500 border border-gray-200 line-through'
                        : 'bg-primary-100 text-primary-800 border border-primary-200 hover:bg-primary-200'
                    }`}
                  >
                    <div className="font-medium text-sm">{apt.patient_name}</div>
                    <div className="text-xs opacity-75">
                      {new Date(apt.start_time).toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit' 
                      })}
                      {' · '}
                      {apt.duration_minutes} min
                    </div>
                  </button>
                ))}
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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-200">
        {weekDates.map((date, idx) => {
          const dayName = DAY_NAMES[date.getDay()]
          const dayAvailability = availability[dayName]
          const isToday = isSameDay(date, today)
          
          return (
            <button
              key={idx}
              onClick={() => onDayClick(date)}
              className={`p-3 text-center border-r border-gray-200 last:border-r-0 hover:bg-gray-50 ${
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
      
      <div className="grid grid-cols-7 divide-x divide-gray-200 min-h-[400px]">
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
                <div className="text-center text-gray-400 text-xs mt-4">
                  {dayAvailability.enabled ? 'No appointments' : 'Day off'}
                </div>
              ) : (
                <div className="space-y-1">
                  {dayAppointments.slice(0, 5).map(apt => (
                    <button
                      key={apt.id}
                      onClick={() => onAppointmentClick(apt)}
                      className={`w-full text-left p-1.5 rounded text-xs ${
                        apt.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : apt.status === 'cancelled'
                          ? 'bg-gray-100 text-gray-500'
                          : 'bg-primary-100 text-primary-800 hover:bg-primary-200'
                      }`}
                    >
                      <div className="font-medium truncate">{apt.patient_name}</div>
                      <div className="opacity-75">
                        {new Date(apt.start_time).toLocaleTimeString('en-US', { 
                          hour: 'numeric', 
                          minute: '2-digit' 
                        })}
                      </div>
                    </button>
                  ))}
                  {dayAppointments.length > 5 && (
                    <div className="text-xs text-gray-500 text-center">
                      +{dayAppointments.length - 5} more
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
      setError('Failed to load schedule')
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
      setError('Failed to save working hours')
    } finally {
      setSaving(false)
    }
  }

  // Get current period label
  const getPeriodLabel = () => {
    if (view === 'day') {
      return selectedDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
      })
    } else {
      const start = weekDates[0]
      const end = weekDates[6]
      if (start.getMonth() === end.getMonth()) {
        return `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()} - ${end.getDate()}, ${end.getFullYear()}`
      } else {
        return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <p className="text-gray-600 mt-1">Manage your appointments and availability</p>
        </div>
        
        <button
          onClick={() => setShowWorkingHoursEditor(true)}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Working Hours
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Working Hours Editor Modal */}
      {showWorkingHoursEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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

      {/* Navigation & View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevious}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title={view === 'day' ? 'Previous day' : 'Previous week'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg"
          >
            Today
          </button>
          <button
            onClick={goToNext}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title={view === 'day' ? 'Next day' : 'Next week'}
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
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-primary-600">
            {appointments.filter(a => a.status === 'scheduled' || a.status === 'confirmed').length}
          </div>
          <div className="text-sm text-gray-600">Upcoming</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-green-600">
            {appointments.filter(a => a.status === 'completed').length}
          </div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-red-600">
            {appointments.filter(a => a.status === 'cancelled' || a.status === 'no_show').length}
          </div>
          <div className="text-sm text-gray-600">Cancelled</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-600">
            {appointments.length}
          </div>
          <div className="text-sm text-gray-600">Total This Week</div>
        </div>
      </div>
    </div>
  )
}
