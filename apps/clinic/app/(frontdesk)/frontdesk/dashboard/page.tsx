'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Bell,
  ChevronRight,
  RefreshCw,
  UserCheck,
  CalendarPlus,
  Banknote,
  UserPlus,
  Users,
  User,
  Clock,
  Stethoscope,
  Search,
  X,
  Loader2,
  Plus,
  ArrowUp,
  Zap,
} from 'lucide-react'
import { DoctorStatusCard } from '@ui-clinic/components/frontdesk/DoctorStatusCard'
import type { CheckInQueueItem } from '@shared/lib/data/frontdesk'
import { translateSpecialty } from '@shared/lib/utils/specialty-labels'

// ============================================================================
// TYPES
// ============================================================================

type QueueItem = CheckInQueueItem

interface DoctorStatus {
  doctorId: string
  doctorName: string
  specialty: string
  currentPatient?: {
    name: string
    queueNumber: number
    startedAt: string
  }
  waitingCount: number
  nextPatient?: {
    name: string
    queueNumber: number
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function deriveDoctorStatuses(queue: QueueItem[]): DoctorStatus[] {
  const doctorMap = new Map<string, DoctorStatus>()

  for (const item of queue) {
    const doctorId = item.doctor_id
    if (!doctorMap.has(doctorId)) {
      doctorMap.set(doctorId, {
        doctorId,
        doctorName: item.doctor?.full_name || 'طبيب',
        specialty: translateSpecialty(item.doctor?.specialty) || '',
        waitingCount: 0,
      })
    }

    const doc = doctorMap.get(doctorId)!

    if ((item as QueueItem).status === 'in_progress') {
      doc.currentPatient = {
        name: item.patient?.full_name || 'مريض',
        queueNumber: item.queue_number,
        startedAt: item.called_at || item.checked_in_at,
      }
    } else if (item.status === 'waiting') {
      doc.waitingCount++
      // First waiting patient = next patient
      if (!doc.nextPatient) {
        doc.nextPatient = {
          name: item.patient?.full_name || 'مريض',
          queueNumber: item.queue_number,
        }
      }
    }
  }

  return Array.from(doctorMap.values())
}

function getStatusConfig(status: string) {
  switch (status) {
    case 'in_progress':
      return { label: 'مع الطبيب', dot: 'bg-blue-500', bg: 'bg-blue-50 text-blue-700' }
    case 'waiting':
      return { label: 'انتظار', dot: 'bg-yellow-500', bg: 'bg-yellow-50 text-yellow-700' }
    case 'completed':
      return { label: 'مكتمل', dot: 'bg-green-500', bg: 'bg-green-50 text-green-700' }
    default:
      return { label: status, dot: 'bg-gray-400', bg: 'bg-gray-50 text-gray-700' }
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'walkin': return 'حضور'
    case 'appointment': return 'موعد'
    case 'emergency': return 'طوارئ'
    default: return type
  }
}

function formatElapsedMinutes(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.max(0, Math.floor(diff / 60000))
}

// ============================================================================
// WALK-IN CHECK-IN BOTTOM SHEET
// ============================================================================

interface WalkInPatient { id: string; full_name: string | null; phone: string; age: number | null }
interface WalkInDoctor { id: string; full_name: string | null; specialty: string }

interface WalkInSheetProps {
  onClose: () => void
  onSuccess: (queueNumber: number, patientName: string) => void
}

interface GapSchedule {
  nextAvailableSlot: string | null
  nextAvailableSlotDisplay: string | null
  estimatedWaitMinutes: number
  gapTooSmall: boolean
  availableGapMinutes: number
  slotDurationMinutes: number
}

function WalkInSheet({ onClose, onSuccess }: WalkInSheetProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WalkInPatient[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<WalkInPatient | null>(null)
  const [doctors, setDoctors] = useState<WalkInDoctor[]>([])
  const [selectedDoctorId, setSelectedDoctorId] = useState('')
  const [queueType, setQueueType] = useState<'walkin' | 'emergency'>('walkin')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // Gap-aware schedule state
  const [gapSchedule, setGapSchedule] = useState<GapSchedule | null>(null)
  const [loadingGap, setLoadingGap] = useState(false)
  const searchTimer = useRef<NodeJS.Timeout>()

  // Load clinic doctors once
  useEffect(() => {
    fetch('/api/doctors/list')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.doctors?.length) {
          setDoctors(data.doctors)
          setSelectedDoctorId(data.doctors[0]?.id || '')
        }
      })
      .catch(() => {})
  }, [])

  // Fetch gap schedule when doctor changes or walk-in type selected
  useEffect(() => {
    if (!selectedDoctorId || queueType !== 'walkin') {
      setGapSchedule(null)
      return
    }
    setLoadingGap(true)
    fetch(`/api/frontdesk/schedule/gaps?doctorId=${selectedDoctorId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setGapSchedule(data as GapSchedule)
      })
      .catch(() => {})
      .finally(() => setLoadingGap(false))
  }, [selectedDoctorId, queueType])

  // Debounced patient search
  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (!query.trim() || selectedPatient) return
    if (query.trim().length < 2) { setResults([]); return }

    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(query)}`)
        if (res.ok) {
          const data = await res.json()
          setResults(data.patients || [])
        }
      } catch { /* non-critical */ }
      finally { setSearching(false) }
    }, 300)

    return () => clearTimeout(searchTimer.current)
  }, [query, selectedPatient])

  const handleSubmit = async () => {
    if (!selectedPatient || !selectedDoctorId) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/frontdesk/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          doctorId: selectedDoctorId,
          queueType,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل تسجيل الوصول')
      onSuccess(data.queueItem?.queue_number || '?', selectedPatient.full_name || 'المريض')
    } catch (e: any) {
      setError(e.message || 'حدث خطأ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-2xl pt-4 px-4 pb-8 max-w-md mx-auto shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Handle + header */}
        <div className="w-10 h-1 bg-[#E5E7EB] rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-cairo text-[17px] font-bold text-[#030712]">تسجيل وصول مريض</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center">
            <X className="w-4 h-4 text-[#6B7280]" />
          </button>
        </div>

        {/* Patient search */}
        <div className="mb-3">
          <label className="font-cairo text-[12px] text-[#6B7280] mb-1 block">المريض</label>
          {selectedPatient ? (
            <div className="flex items-center justify-between bg-[#F0FDF4] rounded-xl px-3 py-2.5 border-[0.8px] border-[#16A34A]/30">
              <div>
                <p className="font-cairo text-[14px] font-semibold text-[#030712]">{selectedPatient.full_name}</p>
                <p className="font-cairo text-[12px] text-[#6B7280]">{selectedPatient.phone}</p>
              </div>
              <button
                onClick={() => { setSelectedPatient(null); setQuery(''); setResults([]) }}
                className="w-8 h-8 rounded-full bg-white flex items-center justify-center"
              >
                <X className="w-4 h-4 text-[#9CA3AF]" />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="الاسم أو رقم الهاتف..."
                  className="w-full h-11 pr-9 pl-3 rounded-xl border-[0.8px] border-[#E5E7EB] bg-[#F9FAFB] font-cairo text-[14px] outline-none focus:border-[#16A34A]"
                  autoFocus
                />
                {searching && (
                  <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF] animate-spin" />
                )}
              </div>
              {results.length > 0 && (
                <div className="mt-1.5 bg-white rounded-xl border-[0.8px] border-[#E5E7EB] overflow-hidden max-h-[160px] overflow-y-auto">
                  {results.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedPatient(p); setResults([]); setQuery('') }}
                      className="w-full px-3 py-2.5 text-right hover:bg-[#F9FAFB] border-b-[0.8px] last:border-b-0 border-[#E5E7EB]"
                    >
                      <p className="font-cairo text-[13px] font-semibold text-[#030712]">{p.full_name}</p>
                      <p className="font-cairo text-[11px] text-[#6B7280]">{p.phone}{p.age ? ` · ${p.age} سنة` : ''}</p>
                    </button>
                  ))}
                </div>
              )}
              {query.length >= 2 && !searching && results.length === 0 && (
                <p className="font-cairo text-[12px] text-[#9CA3AF] mt-1.5 text-center">
                  لا توجد نتائج — <Link href="/frontdesk/patients/register" className="text-[#16A34A] font-semibold">سجل مريض جديد</Link>
                </p>
              )}
            </>
          )}
        </div>

        {/* Doctor selector */}
        {doctors.length > 1 && (
          <div className="mb-3">
            <label className="font-cairo text-[12px] text-[#6B7280] mb-1 block">الطبيب</label>
            <div className="flex gap-2 flex-wrap">
              {doctors.map(d => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDoctorId(d.id)}
                  className={`h-9 px-3.5 rounded-full font-cairo text-[12px] font-medium transition-colors ${
                    selectedDoctorId === d.id
                      ? 'bg-[#16A34A] text-white'
                      : 'bg-[#F3F4F6] text-[#4B5563]'
                  }`}
                >
                  {(d.full_name || '').replace(/^د\.\s*/, 'د. ')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Queue type */}
        <div className="mb-3">
          <label className="font-cairo text-[12px] text-[#6B7280] mb-1 block">نوع الزيارة</label>
          <div className="flex gap-2">
            <button
              onClick={() => setQueueType('walkin')}
              className={`flex-1 h-10 rounded-xl font-cairo text-[13px] font-medium transition-colors ${
                queueType === 'walkin' ? 'bg-[#16A34A] text-white' : 'bg-[#F3F4F6] text-[#4B5563]'
              }`}
            >
              حضور مباشر
            </button>
            <button
              onClick={() => setQueueType('emergency')}
              className={`flex-1 h-10 rounded-xl font-cairo text-[13px] font-medium transition-colors ${
                queueType === 'emergency' ? 'bg-[#EF4444] text-white' : 'bg-[#FEF2F2] text-[#EF4444]'
              }`}
            >
              طوارئ
            </button>
          </div>
        </div>

        {/* ── Gap-aware slot preview (walk-in only) ─────────────────────────── */}
        {queueType === 'walkin' && (
          <div className="mb-4">
            {loadingGap ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#F9FAFB] border-[0.8px] border-[#E5E7EB]">
                <Loader2 className="w-4 h-4 text-[#9CA3AF] animate-spin flex-shrink-0" />
                <p className="font-cairo text-[12px] text-[#9CA3AF]">جاري حساب الوقت المتاح…</p>
              </div>
            ) : gapSchedule ? (
              gapSchedule.nextAvailableSlot === null ? (
                /* No free slot today */
                <div className="px-3 py-2.5 rounded-xl bg-[#FEF2F2] border-[0.8px] border-[#EF4444]/30">
                  <p className="font-cairo text-[13px] font-semibold text-[#EF4444]">لا توجد فترات متاحة اليوم</p>
                  <p className="font-cairo text-[11px] text-[#9CA3AF] mt-0.5">الجدول ممتلئ — يمكنك إضافة المريض آخر الطابور</p>
                </div>
              ) : gapSchedule.gapTooSmall ? (
                /* Gap exists but smaller than slot duration */
                <div className="px-3 py-2.5 rounded-xl bg-[#FFFBEB] border-[0.8px] border-[#F59E0B]/40">
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-[#F59E0B] flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-cairo text-[13px] font-semibold text-[#92400E]">
                        الفترة المتاحة صغيرة ({gapSchedule.availableGapMinutes} د)
                      </p>
                      <p className="font-cairo text-[11px] text-[#92400E]/70 mt-0.5">
                        الموعد المقدّر: {gapSchedule.nextAvailableSlotDisplay} · الوقت اللازم: {gapSchedule.slotDurationMinutes} د
                      </p>
                      <p className="font-cairo text-[11px] text-[#9CA3AF] mt-0.5">
                        سيُضاف المريض للطابور — قد يكون الانتظار أطول
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Normal: free slot found */
                <div className="px-3 py-2.5 rounded-xl bg-[#F0FDF4] border-[0.8px] border-[#16A34A]/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-[#16A34A] flex-shrink-0" />
                      <div>
                        <p className="font-cairo text-[13px] font-semibold text-[#15803D]">
                          الوقت المتوقع: {gapSchedule.nextAvailableSlotDisplay}
                        </p>
                        <p className="font-cairo text-[11px] text-[#6B7280] mt-0.5">
                          {gapSchedule.estimatedWaitMinutes === 0
                            ? 'يمكن دخوله الآن'
                            : `انتظار ~${gapSchedule.estimatedWaitMinutes} دقيقة`}
                        </p>
                      </div>
                    </div>
                    <span className="font-cairo text-[11px] font-bold text-[#16A34A] bg-[#DCFCE7] px-2 py-0.5 rounded-full">
                      {gapSchedule.availableGapMinutes} د متاح
                    </span>
                  </div>
                </div>
              )
            ) : null}
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="font-cairo text-[12px] text-[#EF4444] text-center mb-3">{error}</p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!selectedPatient || !selectedDoctorId || submitting}
          className="w-full h-[50px] rounded-xl bg-[#16A34A] text-white font-cairo text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-transform"
        >
          {submitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <UserCheck className="w-5 h-5" />
              تسجيل الوصول
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// PULL-UP SHEET — manually move a patient earlier in the queue (A1)
// ============================================================================

interface PullUpSheetProps {
  item: QueueItem
  maxPosition: number
  onClose: () => void
  onSuccess: (patientName: string, from: number, to: number) => void
}

function PullUpSheet({ item, maxPosition, onClose, onSuccess }: PullUpSheetProps) {
  const [targetPosition, setTargetPosition] = useState(Math.max(1, item.queue_number - 1))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (targetPosition === item.queue_number) { onClose(); return }
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/frontdesk/queue/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId: item.id, targetPosition }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل إعادة الترتيب')
      onSuccess(item.patient?.full_name || 'المريض', item.queue_number, targetPosition)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div className="w-full bg-white rounded-t-2xl pt-4 px-4 pb-8 max-w-md mx-auto shadow-xl"
        onClick={e => e.stopPropagation()} dir="rtl">
        <div className="w-10 h-1 bg-[#E5E7EB] rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-cairo text-[17px] font-bold text-[#030712]">تقديم في الترتيب</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center">
            <X className="w-4 h-4 text-[#6B7280]" />
          </button>
        </div>

        {/* Patient info */}
        <div className="bg-[#F9FAFB] rounded-xl px-3 py-2.5 mb-4 border-[0.8px] border-[#E5E7EB]">
          <p className="font-cairo text-[13px] font-bold text-[#030712]">{item.patient?.full_name || 'مريض'}</p>
          <p className="font-cairo text-[12px] text-[#6B7280]">الترتيب الحالي: #{item.queue_number}</p>
        </div>

        {/* Position picker */}
        <label className="font-cairo text-[12px] text-[#6B7280] mb-2 block">الترتيب الجديد</label>
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => setTargetPosition(p => Math.max(1, p - 1))}
            className="w-11 h-11 rounded-xl bg-[#F3F4F6] flex items-center justify-center font-bold text-[18px] text-[#030712]"
          >−</button>
          <div className="flex-1 h-12 rounded-xl border-[0.8px] border-[#16A34A] bg-[#F0FDF4] flex items-center justify-center">
            <span className="font-cairo text-[24px] font-bold text-[#16A34A]">#{targetPosition}</span>
          </div>
          <button
            onClick={() => setTargetPosition(p => Math.min(maxPosition, p + 1))}
            className="w-11 h-11 rounded-xl bg-[#F3F4F6] flex items-center justify-center font-bold text-[18px] text-[#030712]"
          >+</button>
        </div>

        {targetPosition < item.queue_number && (
          <p className="font-cairo text-[12px] text-[#16A34A] text-center mb-4">
            سيتقدم {item.queue_number - targetPosition} {item.queue_number - targetPosition === 1 ? 'مركز' : 'مراكز'}
          </p>
        )}
        {targetPosition > item.queue_number && (
          <p className="font-cairo text-[12px] text-[#D97706] text-center mb-4">
            سيتأخر {targetPosition - item.queue_number} {targetPosition - item.queue_number === 1 ? 'مركز' : 'مراكز'}
          </p>
        )}

        {error && <p className="font-cairo text-[12px] text-[#EF4444] text-center mb-3">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || targetPosition === item.queue_number}
          className="w-full h-[50px] rounded-xl bg-[#16A34A] text-white font-cairo text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ArrowUp className="w-5 h-5" />تأكيد الترتيب الجديد</>}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// URGENT BOOKING SHEET — حجز مستعجل at specific time (A2)
// ============================================================================

interface UrgentBookingSheetProps {
  onClose: () => void
  onSuccess: (msg: string) => void
}

function UrgentBookingSheet({ onClose, onSuccess }: UrgentBookingSheetProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: string; full_name: string | null; phone: string }>>([])
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; full_name: string | null; phone: string } | null>(null)
  const [doctors, setDoctors] = useState<Array<{ id: string; full_name: string | null; specialty: string }>>([])
  const [selectedDoctorId, setSelectedDoctorId] = useState('')
  const [time, setTime] = useState(() => {
    const now = new Date(Date.now() + 2 * 60 * 60 * 1000) // Cairo
    const h = now.getHours().toString().padStart(2, '0')
    const m = (Math.ceil(now.getMinutes() / 15) * 15 % 60).toString().padStart(2, '0')
    return `${h}:${m}`
  })
  const [duration, setDuration] = useState(15)
  const [patientPresent, setPatientPresent] = useState(false)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const searchTimer = useRef<NodeJS.Timeout>()

  useEffect(() => {
    fetch('/api/doctors/list').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.doctors?.length) { setDoctors(d.doctors); setSelectedDoctorId(d.doctors[0]?.id || '') }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (!query.trim() || selectedPatient || query.length < 2) { setResults([]); return }
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(query)}`).catch(() => null)
      if (res?.ok) { const d = await res.json(); setResults(d.patients || []) }
    }, 300)
    return () => clearTimeout(searchTimer.current)
  }, [query, selectedPatient])

  const handleSubmit = async () => {
    if (!selectedPatient || !selectedDoctorId) { setError('اختر المريض والطبيب'); return }
    setSubmitting(true); setError('')
    try {
      const today = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().split('T')[0]
      const startTime = `${today}T${time}:00+02:00`
      const res = await fetch('/api/frontdesk/appointments/urgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          doctorId: selectedDoctorId,
          startTime,
          durationMinutes: duration,
          notes: notes.trim() || undefined,
          patientAlreadyPresent: patientPresent,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل الحجز')
      onSuccess(data.message || `حجز مستعجل: ${selectedPatient.full_name} — ${time}`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Generate 15-min time slots from 8am to 10pm
  const timeSlots = Array.from({ length: 57 }, (_, i) => {
    const totalMin = 8 * 60 + i * 15
    const h = Math.floor(totalMin / 60).toString().padStart(2, '0')
    const m = (totalMin % 60).toString().padStart(2, '0')
    return `${h}:${m}`
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div className="w-full bg-white rounded-t-2xl pt-4 px-4 pb-8 max-w-md mx-auto shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()} dir="rtl">
        <div className="w-10 h-1 bg-[#E5E7EB] rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#FEF3C7] flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-[#D97706]" />
            </div>
            <h3 className="font-cairo text-[17px] font-bold text-[#030712]">حجز مستعجل</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center">
            <X className="w-4 h-4 text-[#6B7280]" />
          </button>
        </div>

        {/* Patient search */}
        <div className="mb-3">
          <label className="font-cairo text-[12px] text-[#6B7280] mb-1 block">المريض</label>
          {selectedPatient ? (
            <div className="flex items-center justify-between bg-[#FFFBEB] rounded-xl px-3 py-2.5 border-[0.8px] border-[#D97706]/30">
              <div>
                <p className="font-cairo text-[14px] font-semibold">{selectedPatient.full_name}</p>
                <p className="font-cairo text-[12px] text-[#6B7280]">{selectedPatient.phone}</p>
              </div>
              <button onClick={() => { setSelectedPatient(null); setQuery(''); setResults([]) }}
                className="w-7 h-7 rounded-full bg-white flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-[#9CA3AF]" />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
                <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="الاسم أو الهاتف..." autoFocus
                  className="w-full h-11 pr-9 pl-3 rounded-xl border-[0.8px] border-[#E5E7EB] bg-[#F9FAFB] font-cairo text-[14px] outline-none focus:border-[#D97706]" />
              </div>
              {results.length > 0 && (
                <div className="mt-1.5 bg-white rounded-xl border-[0.8px] border-[#E5E7EB] overflow-hidden max-h-[140px] overflow-y-auto">
                  {results.map(p => (
                    <button key={p.id} onClick={() => { setSelectedPatient(p); setResults([]); setQuery('') }}
                      className="w-full px-3 py-2.5 text-right hover:bg-[#F9FAFB] border-b-[0.8px] last:border-b-0 border-[#E5E7EB]">
                      <p className="font-cairo text-[13px] font-semibold">{p.full_name}</p>
                      <p className="font-cairo text-[11px] text-[#6B7280]">{p.phone}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Doctor selector */}
        {doctors.length > 1 && (
          <div className="mb-3">
            <label className="font-cairo text-[12px] text-[#6B7280] mb-1 block">الطبيب</label>
            <div className="flex gap-2 flex-wrap">
              {doctors.map(d => (
                <button key={d.id} onClick={() => setSelectedDoctorId(d.id)}
                  className={`h-9 px-3.5 rounded-full font-cairo text-[12px] font-medium transition-colors ${selectedDoctorId === d.id ? 'bg-[#D97706] text-white' : 'bg-[#F3F4F6] text-[#4B5563]'}`}>
                  {(d.full_name || '').replace(/^د\.\s*/, 'د. ')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Time picker */}
        <div className="mb-3">
          <label className="font-cairo text-[12px] text-[#6B7280] mb-1 block">وقت الموعد</label>
          <select value={time} onChange={e => setTime(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border-[0.8px] border-[#E5E7EB] bg-[#F9FAFB] font-cairo text-[14px] font-bold text-[#030712] outline-none focus:border-[#D97706] text-center">
            {timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Duration */}
        <div className="mb-4">
          <label className="font-cairo text-[12px] text-[#6B7280] mb-1 block">المدة (دقيقة)</label>
          <div className="flex gap-2">
            {[10, 15, 20, 30].map(d => (
              <button key={d} onClick={() => setDuration(d)}
                className={`flex-1 h-9 rounded-xl font-cairo text-[12px] font-medium transition-colors ${duration === d ? 'bg-[#D97706] text-white' : 'bg-[#F3F4F6] text-[#4B5563]'}`}>
                {d}د
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="mb-4">
          <label className="font-cairo text-[12px] text-[#6B7280] mb-1 block">سبب الاستعجال <span className="font-normal text-[#9CA3AF]">(اختياري)</span></label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="مثال: متابعة نتيجة تحليل..."
            className="w-full h-10 px-3 rounded-xl border-[0.8px] border-[#E5E7EB] bg-[#F9FAFB] font-cairo text-[13px] outline-none focus:border-[#D97706]" />
        </div>

        {/* Patient present toggle */}
        <label className="flex items-center gap-3 mb-5 cursor-pointer">
          <div onClick={() => setPatientPresent(p => !p)}
            className={`w-11 h-6 rounded-full transition-colors relative ${patientPresent ? 'bg-[#D97706]' : 'bg-[#E5E7EB]'}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${patientPresent ? 'translate-x-0.5' : 'translate-x-5'}`} />
          </div>
          <span className="font-cairo text-[13px] text-[#4B5563]">المريض موجود الآن في العيادة</span>
        </label>

        {patientPresent && (
          <div className="bg-[#FFFBEB] border-[0.8px] border-[#D97706]/30 rounded-xl px-3 py-2.5 mb-4">
            <p className="font-cairo text-[12px] text-[#92400E]">
              <span className="font-bold">سيُضاف فوراً للطابور بأولوية مرتفعة</span> — بعد المريض الحالي مباشرةً
            </p>
          </div>
        )}

        {error && <p className="font-cairo text-[12px] text-[#EF4444] text-center mb-3">{error}</p>}

        <button onClick={handleSubmit} disabled={!selectedPatient || !selectedDoctorId || submitting}
          className="w-full h-[50px] rounded-xl bg-[#D97706] text-white font-cairo text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-transform">
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Zap className="w-5 h-5" />تأكيد الحجز المستعجل</>}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// QUICK ACTIONS GRID
// ============================================================================

function QuickActionsGrid() {
  const actions = [
    { href: '/frontdesk/checkin', label: 'تسجيل وصول', icon: UserCheck, color: 'text-[#16A34A]', bg: 'bg-[#F0FDF4]' },
    { href: '/frontdesk/appointments/new', label: 'حجز موعد', icon: CalendarPlus, color: 'text-[#2563EB]', bg: 'bg-[#EFF6FF]' },
    { href: '/frontdesk/payments/new', label: 'تحصيل دفع', icon: Banknote, color: 'text-[#D97706]', bg: 'bg-[#FFFBEB]' },
    { href: '/frontdesk/patients/register', label: 'تسجيل مريض', icon: UserPlus, color: 'text-[#7C3AED]', bg: 'bg-[#F5F3FF]' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <Link
            key={action.href}
            href={action.href}
            className="flex flex-col items-center gap-2 py-4 px-3 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] active:scale-[0.97] transition-transform"
          >
            <div className={`w-11 h-11 rounded-full flex items-center justify-center ${action.bg}`}>
              <Icon className={`w-5 h-5 ${action.color}`} />
            </div>
            <span className="font-cairo text-[13px] font-semibold text-[#030712]">
              {action.label}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

// ============================================================================
// TODAY STATS ROW
// ============================================================================

function TodayStatsRow({
  arrivals,
  waiting,
  revenue,
}: {
  arrivals: number
  waiting: number
  revenue: number
}) {
  return (
    <div className="flex gap-3">
      <div className="flex-1 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3 text-center">
        <p className="font-cairo text-[20px] font-bold text-[#030712]">{arrivals}</p>
        <p className="font-cairo text-[11px] text-[#6B7280]">وصول</p>
      </div>
      <div className="flex-1 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3 text-center">
        <p className="font-cairo text-[20px] font-bold text-[#D97706]">{waiting}</p>
        <p className="font-cairo text-[11px] text-[#6B7280]">انتظار</p>
      </div>
      <div className="flex-1 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3 text-center">
        <p className="font-cairo text-[20px] font-bold text-[#16A34A]">{(revenue ?? 0).toLocaleString('ar-EG')}</p>
        <p className="font-cairo text-[11px] text-[#6B7280]">ج.م</p>
      </div>
    </div>
  )
}

// ============================================================================
// QUEUE LIST (Mobile)
// ============================================================================

function MobileQueueList({
  queue,
  onUpdateStatus,
  onPullUp,
  updating,
}: {
  queue: QueueItem[]
  onUpdateStatus: (id: string, status: string) => void
  onPullUp: (item: QueueItem) => void
  updating: string | null
}) {
  const activeQueue = queue.filter(q => q.status === 'waiting' || q.status === 'in_progress')

  if (activeQueue.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="w-14 h-14 rounded-full bg-[#F3F4F6] flex items-center justify-center mx-auto mb-3">
          <Users className="w-7 h-7 text-[#D1D5DB]" />
        </div>
        <p className="font-cairo text-[15px] font-semibold text-[#030712] mb-1">
          لا يوجد مرضى في الانتظار
        </p>
        <p className="font-cairo text-[13px] text-[#6B7280]">
          سجل وصول المرضى لإضافتهم للقائمة
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {activeQueue.map((item) => {
        const statusConfig = getStatusConfig(item.status)
        const elapsed = formatElapsedMinutes(item.called_at || item.checked_in_at)

        return (
          <div
            key={item.id}
            className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3.5"
          >
            <div className="flex items-center gap-3">
              {/* Queue Number */}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                item.status === 'in_progress' ? 'bg-blue-500 text-white' : 'bg-[#F3F4F6] text-[#030712]'
              }`}>
                <span className="font-cairo text-[14px] font-bold">#{item.queue_number}</span>
              </div>

              {/* Patient Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-cairo text-[14px] font-semibold text-[#030712] truncate">
                    {item.patient?.full_name || 'مريض'}
                  </h4>
                  {item.queue_type === 'emergency' && (
                    <span className="font-cairo text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                      🔴 طوارئ
                    </span>
                  )}
                  {item.priority === 3 && item.queue_type !== 'emergency' && (
                    <span className="font-cairo text-[10px] font-bold bg-[#FEF3C7] text-[#92400E] px-1.5 py-0.5 rounded-full">
                      ⚡ مستعجل
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-cairo text-[12px] text-[#6B7280]">
                    د. {(item.doctor?.full_name || '').replace(/^د\.\s*/, '')}
                  </span>
                  <span className="text-[#D1D5DB]">·</span>
                  <span className="font-cairo text-[12px] text-[#9CA3AF]">
                    {elapsed} د
                  </span>
                </div>
              </div>

              {/* Status + Action */}
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span className={`font-cairo text-[11px] font-medium px-2 py-0.5 rounded-full ${statusConfig.bg}`}>
                  {statusConfig.label}
                </span>

                {item.status === 'waiting' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onPullUp(item)}
                      className="font-cairo text-[11px] font-medium text-[#6B7280]"
                      title="تقديم في الترتيب"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onUpdateStatus(item.id, 'in_progress')}
                      disabled={updating === item.id}
                      className="font-cairo text-[11px] font-medium text-[#16A34A] disabled:opacity-40"
                    >
                      {updating === item.id ? '...' : 'استدعاء'}
                    </button>
                  </div>
                )}
                {item.status === 'in_progress' && (
                  <button
                    onClick={() => onUpdateStatus(item.id, 'completed')}
                    disabled={updating === item.id}
                    className="font-cairo text-[11px] font-medium text-[#2563EB] disabled:opacity-40"
                  >
                    {updating === item.id ? '...' : 'إنهاء'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// WINDOW ALERT BANNER — shown when a walk-in is carrying an open apt window
// ============================================================================

function WindowAlertBanner({ patientName }: { patientName: string }) {
  return (
    <div className="flex items-start gap-3 bg-[#FFFBEB] border-[0.8px] border-[#D97706] rounded-[12px] px-3.5 py-3">
      <div className="w-8 h-8 rounded-full bg-[#FEF3C7] flex items-center justify-center flex-shrink-0 mt-0.5">
        <Clock className="w-4 h-4 text-[#D97706]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-cairo text-[13px] font-bold text-[#92400E]">
          نافذة موعد مفتوحة
        </p>
        <p className="font-cairo text-[12px] text-[#B45309] mt-0.5 leading-relaxed">
          <span className="font-semibold">{patientName}</span> لم يصل بعد — إذا وصل الآن سيُدرج مباشرةً بعد المريض الحالي
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN DASHBOARD PAGE
// ============================================================================

export default function FrontDeskDashboardPage() {
  const router = useRouter()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [revenue, setRevenue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [pendingInviteCount, setPendingInviteCount] = useState(0)
  const [showWalkIn, setShowWalkIn] = useState(false)
  const [walkInToast, setWalkInToast] = useState<string | null>(null)
  // Window event toasts
  const [windowToast, setWindowToast] = useState<{
    type: 'opened' | 'expired'
    patientName: string
  } | null>(null)
  // Pull-up sheet
  const [pullUpItem, setPullUpItem] = useState<QueueItem | null>(null)
  // Urgent booking sheet
  const [showUrgent, setShowUrgent] = useState(false)

  const refreshData = useCallback(async () => {
    try {
      const [queueRes, paymentsRes] = await Promise.all([
        fetch('/api/frontdesk/queue/today'),
        fetch('/api/frontdesk/payments?today=true').catch(() => null),
      ])

      if (queueRes.ok) {
        const queueData = await queueRes.json()
        setQueue(queueData.queue || [])
      }

      if (paymentsRes?.ok) {
        const payData = await paymentsRes.json()
        const total = (payData.payments || []).reduce(
          (sum: number, p: any) => sum + Number(p.amount || 0),
          0
        )
        setRevenue(total)
      }

      setLastUpdate(new Date())
    } catch (err) {
      console.error('Dashboard refresh error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    refreshData()

    // Check for pending invites — abort on cleanup to prevent stale state updates
    fetch('/api/frontdesk/invite', { signal: controller.signal })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelled && data?.invites) setPendingInviteCount(data.invites.length)
      })
      .catch(() => {})

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [refreshData])

  // Poll every 30 seconds
  useEffect(() => {
    const interval = setInterval(refreshData, 30000)
    return () => clearInterval(interval)
  }, [refreshData])

  const showWindowToast = (type: 'opened' | 'expired', patientName: string) => {
    setWindowToast({ type, patientName })
    setTimeout(() => setWindowToast(null), 5000)
  }

  const updateStatus = async (queueId: string, status: string) => {
    setUpdating(queueId)
    try {
      const res = await fetch('/api/frontdesk/queue/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId, status }),
      })
      if (!res.ok) throw new Error('فشل التحديث')
      const data = await res.json()

      // Handle window state events returned from session completion
      if (status === 'completed') {
        if (data.windowOpened && data.swappedPatientName) {
          showWindowToast('opened', data.swappedPatientName)
        } else if (data.windowExpired && data.expiredPatientName) {
          showWindowToast('expired', data.expiredPatientName)
        }
      }

      refreshData()
    } catch (err) {
      console.error('Update error:', err)
    } finally {
      setUpdating(null)
    }
  }

  // Derive doctor statuses from queue
  const doctorStatuses = deriveDoctorStatuses(queue)
  const totalArrivals = queue.length
  const waitingCount = queue.filter(q => q.status === 'waiting').length

  const handleWalkInSuccess = (queueNumber: number | string, patientName: string) => {
    setShowWalkIn(false)
    setWalkInToast(`✓ ${patientName} — رقم ${queueNumber}`)
    setTimeout(() => setWalkInToast(null), 4000)
    refreshData()
  }

  const handlePullUpSuccess = (patientName: string, from: number, to: number) => {
    setPullUpItem(null)
    setWalkInToast(`↑ ${patientName} — من #${from} إلى #${to}`)
    setTimeout(() => setWalkInToast(null), 4000)
    refreshData()
  }

  const handleUrgentSuccess = (msg: string) => {
    setShowUrgent(false)
    setWalkInToast(`⚡ ${msg}`)
    setTimeout(() => setWalkInToast(null), 5000)
    refreshData()
  }


  return (
    <div dir="rtl">
      {/* Walk-in sheet */}
      {showWalkIn && (
        <WalkInSheet
          onClose={() => setShowWalkIn(false)}
          onSuccess={handleWalkInSuccess}
        />
      )}

      {/* Walk-in success toast */}
      {walkInToast && (
        <div className="fixed top-4 left-4 right-4 z-50 mx-auto max-w-sm px-4 py-2.5 rounded-xl shadow-lg font-cairo text-[13px] font-bold text-center bg-[#F0FDF4] text-[#16A34A] border border-[#16A34A]/20">
          {walkInToast}
        </div>
      )}

      {/* Window event toast */}
      {windowToast && (
        <div className={`fixed top-4 left-4 right-4 z-50 mx-auto max-w-sm px-4 py-2.5 rounded-xl shadow-lg font-cairo text-[13px] font-bold text-center border ${
          windowToast.type === 'opened'
            ? 'bg-[#FFFBEB] text-[#92400E] border-[#D97706]/30'
            : 'bg-[#FEF2F2] text-[#991B1B] border-[#EF4444]/20'
        }`}>
          {windowToast.type === 'opened'
            ? `⏳ نافذة مفتوحة لـ ${windowToast.patientName} — يمكنه الوصول الآن`
            : `✗ ${windowToast.patientName} — سُجّل غيابه تلقائياً`}
        </div>
      )}

      {/* Sticky Header */}
      <div className="sticky top-0 z-40 bg-white border-b-[0.8px] border-[#E5E7EB]">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="font-cairo text-[17px] font-bold text-[#030712]">MedAssist</h1>
            <p className="font-cairo text-[12px] text-[#6B7280]">استقبال</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Live indicator */}
            <div className="flex items-center gap-1.5 bg-[#F0FDF4] rounded-full px-2.5 py-1">
              <div className="w-1.5 h-1.5 bg-[#16A34A] rounded-full animate-pulse" />
              <span className="font-cairo text-[11px] text-[#16A34A] font-medium">مباشر</span>
            </div>
            <button
              onClick={refreshData}
              className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center"
            >
              <RefreshCw className="w-[18px] h-[18px] text-[#6B7280]" />
            </button>
            <Link
              href="/frontdesk/profile"
              className="w-[36px] h-[36px] rounded-full bg-[#16A34A] flex items-center justify-center"
              title="الملف الشخصي"
            >
              <User className="w-[18px] h-[18px] text-white" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </div>

      {/* Pull-up sheet */}
      {pullUpItem && (
        <PullUpSheet
          item={pullUpItem}
          maxPosition={queue.filter(q => q.status === 'waiting').length}
          onClose={() => setPullUpItem(null)}
          onSuccess={handlePullUpSuccess}
        />
      )}

      {/* Urgent booking sheet */}
      {showUrgent && (
        <UrgentBookingSheet
          onClose={() => setShowUrgent(false)}
          onSuccess={handleUrgentSuccess}
        />
      )}

      {/* Walk-in FAB — bottom right, above nav bar */}
      <button
        onClick={() => setShowWalkIn(true)}
        className="fixed bottom-24 left-4 z-30 w-14 h-14 rounded-full bg-[#16A34A] shadow-lg shadow-[#16A34A]/30 flex items-center justify-center active:scale-95 transition-transform"
        title="تسجيل وصول مريض"
      >
        <UserCheck className="w-6 h-6 text-white" strokeWidth={2} />
      </button>

      {/* Urgent booking FAB — above walk-in FAB */}
      <button
        onClick={() => setShowUrgent(true)}
        className="fixed bottom-40 left-4 z-30 w-12 h-12 rounded-full bg-[#D97706] shadow-lg shadow-[#D97706]/30 flex items-center justify-center active:scale-95 transition-transform"
        title="حجز مستعجل"
      >
        <Zap className="w-5 h-5 text-white" strokeWidth={2} />
      </button>

      {/* Content */}
      <div className="px-4 pt-4 pb-6 space-y-5">
        {loading ? (
          <div className="text-center py-16">
            <div className="w-10 h-10 border-2 border-[#16A34A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="font-cairo text-[14px] text-[#6B7280]">جاري التحميل...</p>
          </div>
        ) : (
          <>
            {/* Pending Invitations Banner */}
            {pendingInviteCount > 0 && (
              <Link
                href="/frontdesk/invitations"
                className="flex items-center gap-3 bg-[#EFF6FF] rounded-[12px] border-[0.8px] border-[#BFDBFE] p-3.5 active:scale-[0.98] transition-transform"
              >
                <div className="w-10 h-10 rounded-full bg-[#DBEAFE] flex items-center justify-center flex-shrink-0">
                  <Bell className="w-5 h-5 text-[#2563EB]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-cairo text-[14px] font-semibold text-[#1E40AF]">
                    لديك {pendingInviteCount} {pendingInviteCount === 1 ? 'دعوة' : 'دعوات'} معلقة
                  </p>
                  <p className="font-cairo text-[12px] text-[#3B82F6]">اضغط للمراجعة والقبول</p>
                </div>
                <ChevronRight className="w-5 h-5 text-[#93C5FD] rotate-180 flex-shrink-0" />
              </Link>
            )}

            {/* Doctor Status Cards */}
            {doctorStatuses.length > 0 ? (
              <div className="space-y-3">
                {doctorStatuses.map((doc) => (
                  <DoctorStatusCard key={doc.doctorId} doctor={doc} />
                ))}
              </div>
            ) : (
              <div className="bg-[#F0FDF4] rounded-[12px] p-4 text-center">
                <Stethoscope className="w-8 h-8 text-[#16A34A] mx-auto mb-2" />
                <p className="font-cairo text-[14px] font-medium text-[#030712]">
                  لا يوجد أطباء نشطون حالياً
                </p>
                <p className="font-cairo text-[12px] text-[#6B7280] mt-1">
                  سيظهر حالة الأطباء عند تسجيل وصول المرضى
                </p>
              </div>
            )}

            {/* Today Stats */}
            <div>
              <h2 className="font-cairo text-[14px] font-semibold text-[#4B5563] mb-2">
                إحصائيات اليوم
              </h2>
              <TodayStatsRow
                arrivals={totalArrivals}
                waiting={waitingCount}
                revenue={revenue}
              />
            </div>

            {/* Quick Actions */}
            <div>
              <h2 className="font-cairo text-[14px] font-semibold text-[#4B5563] mb-2">
                إجراءات سريعة
              </h2>
              <QuickActionsGrid />
            </div>

            {/* Window Alert Banners — one per open window in active queue */}
            {queue
              .filter(q => q.apt_window_status === 'open' && q.swapped_patient_name)
              .map(q => (
                <WindowAlertBanner
                  key={q.id}
                  patientName={q.swapped_patient_name!}
                />
              ))}

            {/* Live Queue List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-cairo text-[14px] font-semibold text-[#4B5563]">
                  قائمة الانتظار
                </h2>
                <span className="font-cairo text-[11px] text-[#9CA3AF]">
                  آخر تحديث {lastUpdate.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              <MobileQueueList
                queue={queue}
                onUpdateStatus={updateStatus}
                onPullUp={setPullUpItem}
                updating={updating}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
