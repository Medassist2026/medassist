'use client'

import { useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight, Calendar, Clock, UserPlus, Search } from 'lucide-react'
import { ar } from '@shared/lib/i18n/ar'

// ============================================================================
// TIME OPTIONS HELPER
// ============================================================================

function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let h = 8; h <= 23; h++) {
    for (let m = 0; m < 60; m += 15) {
      slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
    }
  }
  return slots
}

function formatTimeArabic(time24: string): string {
  const [hours, minutes] = time24.split(':')
  const h = parseInt(hours, 10)
  const period = h >= 12 ? 'م' : 'ص'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${minutes} ${period}`
}

const TIME_SLOTS = generateTimeSlots()

// ============================================================================
// APPOINTMENT TYPE CONFIG
// ============================================================================

const APPOINTMENT_TYPES = [
  { key: 'consultation', label: ar.newVisit, bg: 'bg-[#E0F2FE]', text: 'text-[#082F49]', activeBg: 'bg-[#082F49]', activeText: 'text-white' },
  { key: 'followup', label: ar.followUp, bg: 'bg-[#FEF3C7]', text: 'text-[#78350F]', activeBg: 'bg-[#78350F]', activeText: 'text-white' },
  { key: 'emergency', label: ar.emergency, bg: 'bg-[#FEE2E2]', text: 'text-[#991B1B]', activeBg: 'bg-[#991B1B]', activeText: 'text-white' },
]

// ============================================================================
// PAGE CONTENT
// ============================================================================

function NewAppointmentContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultDate = searchParams.get('date') || new Date().toISOString().split('T')[0]

  // Patient state
  const [patientTab, setPatientTab] = useState<'search' | 'new'>('search')
  const [patientSearch, setPatientSearch] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [searching, setSearching] = useState(false)
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)

  // New patient fields
  const [newPatientName, setNewPatientName] = useState('')
  const [newPatientPhone, setNewPatientPhone] = useState('')

  // Appointment state
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState('16:00')
  const [appointmentType, setAppointmentType] = useState('consultation')
  const [reason, setReason] = useState('')
  const [duration, setDuration] = useState(15)

  // UI state
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // ============ PATIENT SEARCH ============
  const handleSearch = (query: string) => {
    setPatientSearch(query)
    setSelectedPatient(null)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (query.trim().length < 2) { setSearchResults([]); return }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/doctor/patients/search?q=${encodeURIComponent(query.trim())}`)
        if (res.ok) {
          const data = await res.json()
          setSearchResults(data.patients || [])
        }
      } catch { /* ignore */ }
      finally { setSearching(false) }
    }, 300)
  }

  const selectPatient = (patient: any) => {
    setSelectedPatient(patient)
    setSearchResults([])
    setPatientSearch('')
  }

  // ============ CREATE NEW PATIENT ============
  const createAndSelectPatient = async () => {
    if (!newPatientName.trim() || !newPatientPhone.trim()) {
      setError('يرجى إدخال اسم ورقم هاتف المريض')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/doctor/patients/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: newPatientName.trim(),
          phone: newPatientPhone.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'فشل في إنشاء المريض'); setSubmitting(false); return }

      setSelectedPatient({
        id: data.patient?.id || data.id,
        name: newPatientName.trim(),
        phone: newPatientPhone.trim(),
      })
      setPatientTab('search')
    } catch {
      setError('فشل في إنشاء المريض')
    }
    setSubmitting(false)
  }

  // ============ SUBMIT APPOINTMENT ============
  const handleSubmit = async () => {
    if (!selectedPatient) {
      setError('يرجى اختيار مريض')
      return
    }
    if (!date || !time) {
      setError('يرجى اختيار التاريخ والوقت')
      return
    }

    setSubmitting(true)
    setError('')
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
          notes: reason.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'فشل في إنشاء الموعد')
        setSubmitting(false)
        return
      }

      // Success — go back to dashboard or schedule
      router.push('/doctor/dashboard')
    } catch {
      setError('فشل في إنشاء الموعد')
    }
    setSubmitting(false)
  }

  const canSubmit = !!selectedPatient && !!date && !!time && !submitting

  return (
    <div className="min-h-screen bg-[#F9FAFB]" dir="rtl">
      <div className="max-w-md mx-auto">
        {/* ===== PAGE HEADER ===== */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <button
            onClick={() => router.back()}
            className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center flex-shrink-0"
          >
            <ChevronRight className="w-[20px] h-[20px] text-[#030712]" />
          </button>
          <h1 className="font-cairo text-[18px] leading-[22px] font-semibold text-[#030712]">
            {ar.addAppointment}
          </h1>
        </div>

        <div className="px-4 space-y-4 pb-32">
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-[12px] font-cairo text-[14px]">
              {error}
            </div>
          )}

          {/* ===== DATE & TIME SECTION ===== */}
          <div className="bg-white rounded-[12px] border-[0.8px] border-[#D1D5DB] p-5 space-y-4">
            <h3 className="font-cairo text-[16px] leading-[24px] font-semibold text-[#030712]">
              التاريخ والوقت
            </h3>

            {/* Date Picker */}
            <div>
              <label className="font-cairo text-[13px] text-[#4B5563] mb-1.5 block">التاريخ</label>
              <div className="relative">
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#9CA3AF]" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full pr-10 pl-4 py-3 border-[0.8px] border-[#D1D5DB] rounded-[8px] font-cairo text-[14px] text-[#030712] focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-[#16A34A]"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Time Picker */}
            <div>
              <label className="font-cairo text-[13px] text-[#4B5563] mb-1.5 block">الوقت</label>
              <div className="relative">
                <Clock className="absolute right-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#9CA3AF]" />
                <select
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full pr-10 pl-4 py-3 border-[0.8px] border-[#D1D5DB] rounded-[8px] font-cairo text-[14px] text-[#030712] focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-[#16A34A] appearance-none bg-white"
                >
                  {TIME_SLOTS.map(t => (
                    <option key={t} value={t}>{formatTimeArabic(t)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="font-cairo text-[13px] text-[#4B5563] mb-1.5 block">مدة الموعد</label>
              <div className="flex gap-2">
                {[10, 15, 20, 30].map(d => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`flex-1 py-2 rounded-[8px] font-cairo text-[13px] font-medium border-[0.8px] transition-colors ${
                      duration === d
                        ? 'bg-[#16A34A] text-white border-[#16A34A]'
                        : 'bg-white text-[#4B5563] border-[#D1D5DB]'
                    }`}
                  >
                    {d} د
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ===== APPOINTMENT TYPE ===== */}
          <div className="bg-white rounded-[12px] border-[0.8px] border-[#D1D5DB] p-5 space-y-3">
            <h3 className="font-cairo text-[16px] leading-[24px] font-semibold text-[#030712]">
              نوع الموعد
            </h3>
            <div className="flex gap-2">
              {APPOINTMENT_TYPES.map(type => (
                <button
                  key={type.key}
                  onClick={() => setAppointmentType(type.key)}
                  className={`flex-1 py-2.5 rounded-[4px] font-cairo text-[12px] leading-[18px] font-medium transition-colors ${
                    appointmentType === type.key
                      ? `${type.activeBg} ${type.activeText}`
                      : `${type.bg} ${type.text}`
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* ===== PATIENT SELECTION ===== */}
          <div className="bg-white rounded-[12px] border-[0.8px] border-[#D1D5DB] p-5 space-y-4">
            <h3 className="font-cairo text-[16px] leading-[24px] font-semibold text-[#030712]">
              المريض
            </h3>

            {/* Patient Tabs — matching Figma "مريض جديد" / "من السجل" */}
            {!selectedPatient && (
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setPatientTab('search')}
                  className={`flex-1 py-2.5 rounded-[8px] font-cairo text-[13px] font-medium border-[0.8px] transition-colors ${
                    patientTab === 'search'
                      ? 'bg-[#16A34A] text-white border-[#16A34A]'
                      : 'bg-white text-[#4B5563] border-[#D1D5DB]'
                  }`}
                >
                  من السجل
                </button>
                <button
                  onClick={() => setPatientTab('new')}
                  className={`flex-1 py-2.5 rounded-[8px] font-cairo text-[13px] font-medium border-[0.8px] transition-colors ${
                    patientTab === 'new'
                      ? 'bg-[#16A34A] text-white border-[#16A34A]'
                      : 'bg-white text-[#4B5563] border-[#D1D5DB]'
                  }`}
                >
                  مريض جديد
                </button>
              </div>
            )}

            {/* Selected Patient Card */}
            {selectedPatient ? (
              <div className="bg-[#F0FDF4] border-[0.8px] border-[#BBF7D0] rounded-[8px] p-4 flex items-center justify-between">
                <div>
                  <div className="font-cairo text-[14px] font-semibold text-[#030712]">{selectedPatient.name || selectedPatient.full_name}</div>
                  <div className="font-cairo text-[12px] text-[#4B5563] mt-0.5">
                    {selectedPatient.phone}
                    {selectedPatient.age && ` · ${selectedPatient.age} سنة`}
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedPatient(null); setPatientSearch('') }}
                  className="font-cairo text-[13px] font-medium text-[#16A34A]"
                >
                  تغيير
                </button>
              </div>
            ) : patientTab === 'search' ? (
              /* Search existing patient */
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#9CA3AF]" />
                <input
                  type="text"
                  value={patientSearch}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="بحث بالاسم أو الهاتف..."
                  className="w-full pr-10 pl-4 py-3 border-[0.8px] border-[#D1D5DB] rounded-[8px] font-cairo text-[14px] text-[#030712] focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-[#16A34A]"
                />
                {searching && (
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#16A34A]"></div>
                  </div>
                )}

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="absolute z-30 w-full mt-1 bg-white border-[0.8px] border-[#D1D5DB] rounded-[8px] shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => selectPatient(p)}
                        className="w-full text-right px-4 py-3 hover:bg-[#F0FDF4] transition-colors border-b-[0.8px] border-[#E5E7EB] last:border-0"
                      >
                        <div className="font-cairo text-[14px] font-medium text-[#030712]">{p.name || p.full_name}</div>
                        <div className="font-cairo text-[12px] text-[#4B5563]">{p.phone} {p.age && `· ${p.age} سنة`}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* New patient form */
              <div className="space-y-3">
                <div>
                  <label className="font-cairo text-[13px] text-[#4B5563] mb-1.5 block">اسم المريض</label>
                  <input
                    type="text"
                    value={newPatientName}
                    onChange={(e) => setNewPatientName(e.target.value)}
                    placeholder="الاسم الكامل"
                    className="w-full px-4 py-3 border-[0.8px] border-[#D1D5DB] rounded-[8px] font-cairo text-[14px] text-[#030712] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                  />
                </div>
                <div>
                  <label className="font-cairo text-[13px] text-[#4B5563] mb-1.5 block">رقم الهاتف</label>
                  <input
                    type="tel"
                    value={newPatientPhone}
                    onChange={(e) => setNewPatientPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    className="w-full px-4 py-3 border-[0.8px] border-[#D1D5DB] rounded-[8px] font-cairo text-[14px] text-[#030712] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                    dir="ltr"
                  />
                </div>
                <button
                  onClick={createAndSelectPatient}
                  disabled={submitting || !newPatientName.trim() || !newPatientPhone.trim()}
                  className="w-full py-3 bg-[#16A34A] text-white rounded-[8px] font-cairo text-[14px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <UserPlus className="w-4 h-4 inline-block ml-2" />
                  تسجيل وتحديد المريض
                </button>
              </div>
            )}
          </div>

          {/* ===== REASON / DESCRIPTION ===== */}
          <div className="bg-white rounded-[12px] border-[0.8px] border-[#D1D5DB] p-5 space-y-3">
            <h3 className="font-cairo text-[16px] leading-[24px] font-semibold text-[#030712]">
              سبب الزيارة
            </h3>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: متابعة ضغط، كشف عام..."
              className="w-full px-4 py-3 border-[0.8px] border-[#D1D5DB] rounded-[8px] font-cairo text-[14px] text-[#030712] focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-[#16A34A]"
            />
          </div>
        </div>

        {/* ===== FIXED BOTTOM CTA ===== */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t-[0.8px] border-[#E5E7EB] p-4">
          <div className="max-w-md mx-auto">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`w-full h-[48px] rounded-[8px] font-cairo text-[14px] leading-[21px] font-semibold text-center transition-colors ${
                canSubmit
                  ? 'bg-[#16A34A] text-white hover:bg-[#15803D]'
                  : 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'
              }`}
            >
              {submitting ? ar.loading : 'حفظ الموعد'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// PAGE WRAPPER WITH SUSPENSE
// ============================================================================

export default function NewAppointmentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center" dir="rtl">
        <p className="font-cairo text-[14px] text-[#4B5563]">{ar.loading}</p>
      </div>
    }>
      <NewAppointmentContent />
    </Suspense>
  )
}
