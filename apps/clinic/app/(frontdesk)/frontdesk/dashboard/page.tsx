'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  User,
  Clock,
  Stethoscope,
  Search,
  X,
  Loader2,
  UserCheck,
  Zap,
  ArrowUp,
} from 'lucide-react'
import { DoctorStatusCard } from '@ui-clinic/components/frontdesk/DoctorStatusCard'
import { DoctorTabStrip } from '@ui-clinic/components/frontdesk/DoctorTabStrip'
import { QueuePatientCard } from '@ui-clinic/components/frontdesk/QueuePatientCard'
import { EmptyQueueState } from '@ui-clinic/components/frontdesk/EmptyQueueState'
import { FrontdeskDashboardStats } from '@ui-clinic/components/frontdesk/FrontdeskDashboardStats'
import { subscribeToQueue } from '@shared/lib/realtime/queue-subscription'
import type { CheckInQueueItem } from '@shared/lib/data/frontdesk'
import { translateSpecialty } from '@shared/lib/utils/specialty-labels'

// ============================================================================
// TYPES
// ============================================================================

type QueueItem = CheckInQueueItem

interface DoctorStatusDerived {
  doctorId: string
  doctorName: string
  status: 'in_session' | 'available' | 'away'
  currentPatient?: {
    name: string
    queueNumber: number
  }
  sessionStartedAt?: string
  waitingCount: number
  nextPatientName?: string
  isActive: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

function deriveDoctorStatuses(queue: QueueItem[]): DoctorStatusDerived[] {
  const doctorMap = new Map<
    string,
    DoctorStatusDerived
  >()

  for (const item of queue) {
    const doctorId = item.doctor_id
    if (!doctorMap.has(doctorId)) {
      doctorMap.set(doctorId, {
        doctorId,
        doctorName: `د. ${(item.doctor?.full_name || 'طبيب').replace(/^د\.\s*/, '')}`,
        status: 'available',
        waitingCount: 0,
        isActive: false,
      })
    }

    const doc = doctorMap.get(doctorId)!

    if (item.status === 'in_progress') {
      doc.status = 'in_session'
      doc.currentPatient = {
        name: item.patient?.full_name || 'مريض',
        queueNumber: item.queue_number,
      }
      doc.sessionStartedAt = item.called_at || item.checked_in_at
      doc.isActive = true
    } else if (item.status === 'waiting') {
      doc.waitingCount++
      doc.isActive = true
      if (!doc.nextPatientName) {
        doc.nextPatientName = item.patient?.full_name || 'مريض'
      }
    }
  }

  return Array.from(doctorMap.values())
}

function sortQueueEntries(entries: QueueItem[]): QueueItem[] {
  const statusOrder: Record<string, number> = {
    in_progress: 0,
    waiting: 1,
    completed: 2,
    no_show: 3,
    cancelled: 4,
  }

  return [...entries].sort((a, b) => {
    const aOrder = statusOrder[a.status] ?? 99
    const bOrder = statusOrder[b.status] ?? 99
    if (aOrder !== bOrder) return aOrder - bOrder

    // Within waiting: by effective time
    if (a.status === 'waiting' && b.status === 'waiting') {
      const aTime = a.queue_type === 'appointment' && a.appointment_id
        ? a.checked_in_at
        : a.checked_in_at
      const bTime = b.queue_type === 'appointment' && b.appointment_id
        ? b.checked_in_at
        : b.checked_in_at
      // Priority first (emergency > appointment > walkin)
      if (a.priority !== b.priority) return b.priority - a.priority
      return new Date(aTime).getTime() - new Date(bTime).getTime()
    }

    return 0
  })
}

function computeAvgWaitMinutes(queue: QueueItem[]): number | null {
  const waitingItems = queue.filter((q) => q.status === 'waiting')
  if (waitingItems.length === 0) return null
  const now = Date.now()
  const totalMs = waitingItems.reduce(
    (sum, q) => sum + (now - new Date(q.checked_in_at).getTime()),
    0
  )
  return Math.round(totalMs / waitingItems.length / 60000)
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
  const [gapSchedule, setGapSchedule] = useState<GapSchedule | null>(null)
  const [loadingGap, setLoadingGap] = useState(false)
  const searchTimer = useRef<NodeJS.Timeout>()

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
      onSuccess(data.queueItem?.queue_number || 0, selectedPatient.full_name || 'المريض')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'حدث خطأ'
      setError(msg)
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
                  className="w-full h-11 pe-9 ps-3 rounded-xl border-[0.8px] border-[#E5E7EB] bg-[#F9FAFB] font-cairo text-[14px] outline-none focus:border-[#16A34A]"
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

        {/* Gap-aware slot preview (walk-in only) */}
        {queueType === 'walkin' && (
          <div className="mb-4">
            {loadingGap ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#F9FAFB] border-[0.8px] border-[#E5E7EB]">
                <Loader2 className="w-4 h-4 text-[#9CA3AF] animate-spin flex-shrink-0" />
                <p className="font-cairo text-[12px] text-[#9CA3AF]">جاري حساب الوقت المتاح…</p>
              </div>
            ) : gapSchedule ? (
              gapSchedule.nextAvailableSlot === null ? (
                <div className="px-3 py-2.5 rounded-xl bg-[#FEF2F2] border-[0.8px] border-[#EF4444]/30">
                  <p className="font-cairo text-[13px] font-semibold text-[#EF4444]">لا توجد فترات متاحة اليوم</p>
                  <p className="font-cairo text-[11px] text-[#9CA3AF] mt-0.5">الجدول ممتلئ — يمكنك إضافة المريض آخر الطابور</p>
                </div>
              ) : gapSchedule.gapTooSmall ? (
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

        {error && (
          <p className="font-cairo text-[12px] text-[#EF4444] text-center mb-3">{error}</p>
        )}

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
// PULL-UP SHEET
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'حدث خطأ'
      setError(msg)
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

        <div className="bg-[#F9FAFB] rounded-xl px-3 py-2.5 mb-4 border-[0.8px] border-[#E5E7EB]">
          <p className="font-cairo text-[13px] font-bold text-[#030712]">{item.patient?.full_name || 'مريض'}</p>
          <p className="font-cairo text-[12px] text-[#6B7280]">الترتيب الحالي: #{item.queue_number}</p>
        </div>

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
// URGENT BOOKING SHEET
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
    const now = new Date(Date.now() + 2 * 60 * 60 * 1000)
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'حدث خطأ'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

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
                  className="w-full h-11 pe-9 ps-3 rounded-xl border-[0.8px] border-[#E5E7EB] bg-[#F9FAFB] font-cairo text-[14px] outline-none focus:border-[#D97706]" />
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
// WINDOW ALERT BANNER
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
  const [revenue, setRevenue] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [isLive, setIsLive] = useState(true)
  const [clinicId, setClinicId] = useState<string | null>(null)
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | 'all'>('all')

  // Appointments state
  const [todayAppointments, setTodayAppointments] = useState<Array<{
    id: string
    start_time: string
    patient: { full_name: string | null }
    doctor_id: string
    status: string
  }>>([])

  // Sheet states
  const [showWalkIn, setShowWalkIn] = useState(false)
  const [walkInToast, setWalkInToast] = useState<string | null>(null)
  const [windowToast, setWindowToast] = useState<{
    type: 'opened' | 'expired'
    patientName: string
  } | null>(null)
  const [pullUpItem, setPullUpItem] = useState<QueueItem | null>(null)
  const [showUrgent, setShowUrgent] = useState(false)

  // ── Data fetching ──

  const refreshQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/frontdesk/queue/today')
      if (res.ok) {
        const data = await res.json()
        setQueue(data.queue || [])
        if (data.clinicId) setClinicId(data.clinicId)
      }
    } catch (err) {
      console.error('Queue refresh error:', err)
    }
  }, [])

  const refreshRevenue = useCallback(async () => {
    try {
      const res = await fetch('/api/frontdesk/payments?today=true')
      if (res.ok) {
        const data = await res.json()
        setRevenue(data.totals?.total ?? 0)
      }
    } catch {
      // non-critical
    }
  }, [])

  const refreshAppointments = useCallback(async () => {
    try {
      const res = await fetch('/api/frontdesk/appointments?today=true&limit=10')
      if (res.ok) {
        const data = await res.json()
        setTodayAppointments(data.appointments || [])
      }
    } catch { /* non-critical */ }
  }, [])

  const refreshData = useCallback(async () => {
    try {
      await Promise.all([refreshQueue(), refreshRevenue()])
    } finally {
      setLoading(false)
    }
  }, [refreshQueue, refreshRevenue])

  // Initial load
  useEffect(() => {
    refreshData()
    refreshAppointments()
  }, [refreshData, refreshAppointments])

  // Realtime subscription for queue
  useEffect(() => {
    if (!clinicId) return

    const unsubscribe = subscribeToQueue(clinicId, () => {
      refreshQueue()
    })

    setIsLive(true)

    return () => {
      unsubscribe()
      setIsLive(false)
    }
  }, [clinicId, refreshQueue])

  // Polling fallback when not live — 5 second interval
  useEffect(() => {
    if (isLive) return
    const interval = setInterval(refreshQueue, 5000)
    return () => clearInterval(interval)
  }, [isLive, refreshQueue])

  // Revenue polling — every 60 seconds
  useEffect(() => {
    const interval = setInterval(refreshRevenue, 60000)
    return () => clearInterval(interval)
  }, [refreshRevenue])

  // ── Derived data ──

  const doctorStatuses = deriveDoctorStatuses(queue)
  const waitingCount = queue.filter(q => q.status === 'waiting').length
  const arrivedToday = queue.filter(q => q.status !== 'cancelled').length
  const avgWaitMinutes = computeAvgWaitMinutes(queue)

  // Filter queue by selected doctor
  const filteredQueue = selectedDoctorId === 'all'
    ? queue
    : queue.filter(q => q.doctor_id === selectedDoctorId)

  const sortedQueue = sortQueueEntries(filteredQueue)

  // Find first waiting entry for isNextInQueue
  const firstWaitingId = sortedQueue.find(q => q.status === 'waiting')?.id

  // Next waiting item per doctor (for onCallNext in DoctorStatusCard)
  const nextWaitingByDoctor = new Map<string, QueueItem>()
  for (const item of sortedQueue) {
    if (item.status === 'waiting' && !nextWaitingByDoctor.has(item.doctor_id)) {
      nextWaitingByDoctor.set(item.doctor_id, item)
    }
  }

  // Today's appointments grouped by doctor
  const appointmentsByDoctor = new Map<string, Array<{
    id: string
    startTime: string
    patientName: string
    status: string
  }>>()
  for (const apt of todayAppointments) {
    if (!appointmentsByDoctor.has(apt.doctor_id)) {
      appointmentsByDoctor.set(apt.doctor_id, [])
    }
    appointmentsByDoctor.get(apt.doctor_id)!.push({
      id: apt.id,
      startTime: apt.start_time,
      patientName: apt.patient?.full_name || 'مريض',
      status: apt.status,
    })
  }

  // Doctor tab strip data
  const doctorTabData = doctorStatuses.map(d => ({
    id: d.doctorId,
    name: d.doctorName,
    isActive: d.isActive,
  }))

  // ── Actions ──

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

      if (status === 'completed') {
        if (data.windowOpened && data.swappedPatientName) {
          showWindowToast('opened', data.swappedPatientName)
        } else if (data.windowExpired && data.expiredPatientName) {
          showWindowToast('expired', data.expiredPatientName)
        }
      }

      refreshQueue()
    } catch (err) {
      console.error('Update error:', err)
    } finally {
      setUpdating(null)
    }
  }

  const handleWalkInSuccess = (queueNumber: number, patientName: string) => {
    setShowWalkIn(false)
    setWalkInToast(`✓ ${patientName} — رقم ${queueNumber}`)
    setTimeout(() => setWalkInToast(null), 4000)
    refreshData()
  }

  const handlePullUpSuccess = (patientName: string, from: number, to: number) => {
    setPullUpItem(null)
    setWalkInToast(`↑ ${patientName} — من #${from} إلى #${to}`)
    setTimeout(() => setWalkInToast(null), 4000)
    refreshQueue()
  }

  const handleUrgentSuccess = (msg: string) => {
    setShowUrgent(false)
    setWalkInToast(`⚡ ${msg}`)
    setTimeout(() => setWalkInToast(null), 5000)
    refreshData()
  }

  // ── Render ──

  return (
    <div dir="rtl">
      {/* Sheets */}
      {showWalkIn && (
        <WalkInSheet onClose={() => setShowWalkIn(false)} onSuccess={handleWalkInSuccess} />
      )}
      {pullUpItem && (
        <PullUpSheet
          item={pullUpItem}
          maxPosition={queue.filter(q => q.status === 'waiting').length}
          onClose={() => setPullUpItem(null)}
          onSuccess={handlePullUpSuccess}
        />
      )}
      {showUrgent && (
        <UrgentBookingSheet onClose={() => setShowUrgent(false)} onSuccess={handleUrgentSuccess} />
      )}

      {/* Toast notifications */}
      {walkInToast && (
        <div className="fixed top-4 left-4 right-4 z-50 mx-auto max-w-sm px-4 py-2.5 rounded-xl shadow-lg font-cairo text-[13px] font-bold text-center bg-[#F0FDF4] text-[#16A34A] border border-[#16A34A]/20">
          {walkInToast}
        </div>
      )}
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

      {/* ═══ TOP APP BAR ═══ */}
      <div className="sticky top-0 z-40 bg-white border-b-[0.8px] border-[#E5E7EB]">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="font-cairo text-[17px] font-bold text-[#030712]">MedAssist</h1>
            <p className="font-cairo text-[12px] text-[#6B7280]">استقبال</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Live/Disconnected indicator */}
            <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
              isLive ? 'bg-[#F0FDF4]' : 'bg-[#F3F4F6]'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                isLive ? 'bg-[#16A34A] animate-pulse' : 'bg-[#9CA3AF]'
              }`} />
              <span className={`font-cairo text-[11px] font-medium ${
                isLive ? 'text-[#16A34A]' : 'text-[#9CA3AF]'
              }`}>
                {isLive ? 'مباشر' : 'غير متصل'}
              </span>
            </div>
            <Link
              href="/frontdesk/profile"
              className="w-[36px] h-[36px] rounded-full bg-[#16A34A] flex items-center justify-center"
            >
              <User className="w-[18px] h-[18px] text-white" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </div>

      {/* ═══ DOCTOR TAB STRIP ═══ */}
      <DoctorTabStrip
        doctors={doctorTabData}
        selectedDoctorId={selectedDoctorId}
        onSelect={setSelectedDoctorId}
      />

      {/* ═══ QUICK ACTIONS ═══ */}
      <div className="bg-white border-b-[0.8px] border-[#E5E7EB] px-4 py-2.5">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setShowWalkIn(true)}
            className="flex items-center gap-1.5 h-[38px] px-4 rounded-full bg-[#16A34A] text-white font-cairo text-[12px] font-bold whitespace-nowrap flex-shrink-0"
          >
            <span className="text-[15px]">+</span> تسجيل وصول
          </button>
          <button
            onClick={() => router.push('/frontdesk/appointments/new')}
            className="flex items-center gap-1.5 h-[38px] px-4 rounded-full bg-[#EFF6FF] text-[#1D4ED8] border border-[#1D4ED8] font-cairo text-[12px] font-bold whitespace-nowrap flex-shrink-0"
          >
            📅 موعد جديد
          </button>
          <button
            onClick={() => router.push('/frontdesk/patients/register')}
            className="flex items-center gap-1.5 h-[38px] px-4 rounded-full bg-white text-[#030712] border border-[#E5E7EB] font-cairo text-[12px] font-medium whitespace-nowrap flex-shrink-0"
          >
            👤 مريض جديد
          </button>
          <button
            onClick={() => setShowUrgent(true)}
            className="flex items-center gap-1.5 h-[38px] px-4 rounded-full bg-[#FFF7ED] text-[#EA580C] border border-[#EA580C] font-cairo text-[12px] font-bold whitespace-nowrap flex-shrink-0"
          >
            ⚡ مستعجل
          </button>
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="px-4 pt-2 pb-6 space-y-4">
        {loading ? (
          <EmptyQueueState variant="loading" />
        ) : (
          <>
            {/* Doctor Status Cards */}
            {doctorStatuses.length > 0 ? (
              <div className="space-y-3">
                {doctorStatuses
                  .filter(d => selectedDoctorId === 'all' || d.doctorId === selectedDoctorId)
                  .map((doc) => {
                    const nextItem = nextWaitingByDoctor.get(doc.doctorId)
                    const nextWaitMinutes = nextItem
                      ? Math.max(0, Math.floor((Date.now() - new Date(nextItem.checked_in_at).getTime()) / 60000))
                      : undefined
                    const docAppointments = appointmentsByDoctor.get(doc.doctorId)

                    return (
                      <DoctorStatusCard
                        key={doc.doctorId}
                        doctorName={doc.doctorName}
                        status={doc.status}
                        currentPatient={doc.currentPatient}
                        sessionStartedAt={doc.sessionStartedAt}
                        waitingCount={doc.waitingCount}
                        nextPatientName={doc.nextPatientName}
                        nextWaitMinutes={nextWaitMinutes}
                        onCallNext={
                          nextItem
                            ? () => updateStatus(nextItem.id, 'in_progress')
                            : undefined
                        }
                        appointments={docAppointments}
                      />
                    )
                  })}
              </div>
            ) : (
              <EmptyQueueState
                variant="no_doctors"
                onCheckIn={() => router.push('/frontdesk/checkin')}
              />
            )}

            {/* Stats Grid */}
            <FrontdeskDashboardStats
              waitingCount={waitingCount}
              arrivedToday={arrivedToday}
              avgWaitMinutes={avgWaitMinutes}
              revenueToday={revenue}
              isLoading={loading}
            />

            {/* Window Alert Banners */}
            {queue
              .filter(q => q.apt_window_status === 'open' && q.swapped_patient_name)
              .map(q => (
                <WindowAlertBanner key={q.id} patientName={q.swapped_patient_name!} />
              ))}

            {/* Queue List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-cairo text-[14px] font-semibold text-[#4B5563]">قائمة الانتظار</h2>
                {sortedQueue.length > 0 && (
                  <span className="font-cairo text-[11px] font-bold text-[#9CA3AF] bg-[#F3F4F6] px-2 py-0.5 rounded-full">
                    {sortedQueue.length.toLocaleString('ar-EG')} مرضى
                  </span>
                )}
              </div>

              {sortedQueue.length === 0 ? (
                <EmptyQueueState variant="no_patients" />
              ) : (
                <div className="space-y-2">
                  {sortedQueue.map((item) => (
                    <QueuePatientCard
                      key={item.id}
                      queueNumber={item.queue_number}
                      patientName={item.patient?.full_name || 'مريض'}
                      doctorName={
                        selectedDoctorId === 'all'
                          ? `د. ${(item.doctor?.full_name || '').replace(/^د\.\s*/, '')}`
                          : undefined
                      }
                      status={
                        item.status === 'cancelled'
                          ? 'no_show'
                          : item.status === 'completed'
                            ? 'completed'
                            : item.status === 'in_progress'
                              ? 'in_progress'
                              : 'waiting'
                      }
                      visitType={item.queue_type === 'walkin' || item.queue_type === 'emergency' ? 'walk_in' : 'appointment'}
                      appointmentTime={item.queue_type === 'appointment' ? item.checked_in_at : undefined}
                      checkedInAt={item.checked_in_at}
                      onCallPatient={() => updateStatus(item.id, 'in_progress')}
                      onCollectPayment={() => router.push(`/frontdesk/payments/new?patientId=${item.patient_id}&doctorId=${item.doctor_id}`)}
                      onMarkNoShow={() => updateStatus(item.id, 'cancelled')}
                      onReschedule={() => {
                        if (item.appointment_id) {
                          router.push(`/frontdesk/appointments/${item.appointment_id}/edit`)
                        } else {
                          router.push('/frontdesk/appointments/new')
                        }
                      }}
                      isNextInQueue={item.id === firstWaitingId}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
