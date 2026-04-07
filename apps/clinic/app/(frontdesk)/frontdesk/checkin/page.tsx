'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Search, UserPlus, Check, AlertTriangle, ChevronDown, Banknote, CreditCard, Building2, ArrowLeftRight, WifiOff } from 'lucide-react'
import { syncOfflineQueue, getOfflineQueueStats } from '@shared/hooks/useOfflineMutation'
import { translateSpecialty } from '@shared/lib/data/frontdesk'

// ============================================================================
// TYPES
// ============================================================================

interface Patient {
  id: string
  full_name: string | null
  phone: string
  age: number | null
  sex: string | null
}

interface Doctor {
  id: string
  full_name: string | null
  specialty: string
}

interface DoctorQueueInfo extends Doctor {
  waitingCount: number
  estimatedWait: number
}

// ============================================================================
// CHECK-IN PAGE
// ============================================================================

export default function CheckInPage() {
  const router = useRouter()

  // ===== Speed metrics ("faster than paper") =====
  const [pageStartTime] = useState(() => Date.now())

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Patient[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [doctors, setDoctors] = useState<DoctorQueueInfo[]>([])
  const [selectedDoctor, setSelectedDoctor] = useState('')
  const [queueType, setQueueType] = useState<'walkin' | 'appointment' | 'emergency'>('walkin')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{
    queueNumber: number | string
    patientName: string
    doctorName: string
    paymentRecorded?: boolean
    paymentAmount?: number
    offline?: boolean
  } | null>(null)

  // ── Payment Capture (optional) ──
  const [showPayment, setShowPayment] = useState(false) // Default closed — payment collected after visit, not at check-in
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'insurance'>('cash')
  const [skipPayment, setSkipPayment] = useState(false)
  // Insurance-specific fields (shown when paymentMethod === 'insurance')
  const [insuranceCompany, setInsuranceCompany] = useState('')
  const [insurancePolicyNumber, setInsurancePolicyNumber] = useState('')

  useEffect(() => {
    loadDoctorsWithStats()
  }, [])

  const loadDoctorsWithStats = async () => {
    try {
      const [doctorsRes, queueRes] = await Promise.all([
        fetch('/api/doctors/list'),
        fetch('/api/frontdesk/queue/today'),
      ])
      const doctorsData = await doctorsRes.json()
      const queueData = queueRes.ok ? await queueRes.json() : { queue: [] }
      const queue = queueData.queue || []
      const doctorsList = doctorsData.doctors || []

      const enriched: DoctorQueueInfo[] = doctorsList.map((doc: Doctor) => {
        const docQueue = queue.filter((q: any) => q.doctor_id === doc.id && q.status === 'waiting')
        return { ...doc, waitingCount: docQueue.length, estimatedWait: docQueue.length * 15 }
      })

      setDoctors(enriched)
      if (enriched.length === 1) setSelectedDoctor(enriched[0].id)
    } catch (err) {
      console.error('Failed to load doctors:', err)
    }
  }

  useEffect(() => {
    if (searchQuery.length < 1) { setSearchResults([]); return }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(searchQuery)}`)
        const data = await res.json()
        setSearchResults(data.patients || [])
      } catch { /* silent */ } finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleCheckIn = async () => {
    if (!selectedPatient || !selectedDoctor) {
      setError(!selectedPatient ? 'اختر مريض أولاً' : 'اختر الطبيب')
      return
    }
    setLoading(true)
    setError('')
    try {
      // Step 1: Check in
      const checkinBody = {
        patientId: selectedPatient.id,
        doctorId: selectedDoctor,
        queueType,
        notes: notes.trim() || undefined,
      }

      let data: any
      let wasOffline = false

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 8000)
        const res = await fetch('/api/frontdesk/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(checkinBody),
          signal: controller.signal,
        })
        clearTimeout(timeout)
        data = await res.json()
        if (!res.ok) throw new Error(data.error || 'فشل تسجيل الوصول')
      } catch (fetchErr: any) {
        // If network error (offline/timeout), queue for later
        if (fetchErr.name === 'AbortError' || !navigator.onLine) {
          // Store in localStorage offline queue
          const offlineQueue = JSON.parse(localStorage.getItem('medassist_offline_queue') || '[]')
          offlineQueue.push({
            id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            url: '/api/frontdesk/checkin',
            body: checkinBody,
            createdAt: new Date().toISOString(),
            retries: 0,
            status: 'pending',
          })
          localStorage.setItem('medassist_offline_queue', JSON.stringify(offlineQueue))

          data = { queueNumber: '—', offline: true }
          wasOffline = true
        } else {
          throw fetchErr
        }
      }

      // Step 2: Record payment (if not skipped and amount provided) — skip if offline
      let paymentRecorded = false
      const pAmount = Number(paymentAmount)
      if (!wasOffline && !skipPayment && pAmount > 0) {
        try {
          // Build insurance notes string if applicable
          const insuranceNotes = paymentMethod === 'insurance' && (insuranceCompany || insurancePolicyNumber)
            ? `تأمين: ${[insuranceCompany, insurancePolicyNumber].filter(Boolean).join(' — ')}`
            : undefined

          const payRes = await fetch('/api/frontdesk/payments/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patientId: selectedPatient.id,
              doctorId: selectedDoctor,
              amount: pAmount,
              paymentMethod,
              notes: insuranceNotes,
            }),
          })
          if (payRes.ok) paymentRecorded = true
        } catch {
          // Payment failure is non-blocking — check-in already succeeded
        }
      }

      const doc = doctors.find(d => d.id === selectedDoctor)
      const checkinDurationMs = Date.now() - pageStartTime
      setSuccess({
        queueNumber: data.queueNumber || data.queue_number || 0,
        patientName: selectedPatient.full_name || 'مريض',
        doctorName: doc?.full_name || 'طبيب',
        paymentRecorded,
        paymentAmount: paymentRecorded ? pAmount : undefined,
        offline: wasOffline,
      })

      // Log check-in speed metric (fire-and-forget)
      fetch('/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: 'frontdesk_checkin_completed',
          properties: {
            duration_ms: checkinDurationMs,
            duration_seconds: Math.floor(checkinDurationMs / 1000),
            met_30s_target: checkinDurationMs <= 30000,
            queue_type: queueType,
            payment_included: paymentRecorded,
          },
        }),
      }).catch(() => { /* non-blocking */ })
    } catch (err: any) {
      setError(err.message || 'حدث خطأ')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setSuccess(null)
    setSelectedPatient(null)
    setSearchQuery('')
    setSearchResults([])
    setSelectedDoctor(doctors.length === 1 ? doctors[0].id : '')
    setQueueType('walkin')
    setNotes('')
    setError('')
    setPaymentAmount('')
    setPaymentMethod('cash')
    setSkipPayment(false)
    setShowPayment(true)
    setInsuranceCompany('')
    setInsurancePolicyNumber('')
  }

  // ── Success Screen ──
  if (success) {
    return (
      <div dir="rtl">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-[#E5E7EB]">
          <button onClick={() => router.push('/frontdesk/dashboard')} className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center">
            <ChevronRight className="w-[20px] h-[20px] text-[#030712]" />
          </button>
          <h1 className="font-cairo text-[18px] font-semibold text-[#030712]">تسجيل الوصول</h1>
        </div>
        <div className="px-4 pt-10 pb-6 text-center">
          <div className="w-20 h-20 bg-[#F0FDF4] rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-10 h-10 text-[#16A34A]" />
          </div>
          <h2 className="font-cairo text-[20px] font-bold text-[#030712] mb-1">
            {success.offline ? 'تم حفظ تسجيل الوصول (بدون إنترنت)' : 'تم تسجيل الوصول بنجاح!'}
          </h2>
          <p className="font-cairo text-[14px] text-[#6B7280] mb-2">{success.patientName} · د. {success.doctorName}</p>
          {success.offline && (
            <div className="flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 rounded-[10px] px-3 py-2 mb-3 mx-auto max-w-[280px]">
              <WifiOff className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="font-cairo text-[12px] text-amber-800">سيتم المزامنة عند عودة الإنترنت</p>
            </div>
          )}
          {success.paymentRecorded && success.paymentAmount && (
            <p className="font-cairo text-[13px] text-[#16A34A] font-medium mb-4">
              💰 تم تسجيل الدفع: {success.paymentAmount.toLocaleString('ar-EG')} ج.م
            </p>
          )}
          {Number(success.queueNumber) > 0 && (
            <div className="inline-block bg-[#F0FDF4] border-2 border-[#16A34A] rounded-[16px] px-8 py-5 mb-8">
              <p className="font-cairo text-[13px] text-[#16A34A] font-medium mb-1">رقم الانتظار</p>
              <p className="font-cairo text-[48px] font-bold text-[#16A34A] leading-none">{success.queueNumber}</p>
            </div>
          )}
          <div className="space-y-3">
            <button onClick={resetForm} className="w-full h-[48px] bg-[#16A34A] hover:bg-[#15803D] text-white rounded-[12px] font-cairo text-[15px] font-bold transition-colors">
              تسجيل وصول مريض آخر
            </button>
            {success.paymentRecorded && success.paymentAmount && (
              <button
                onClick={() => {
                  const doc = doctors.find(d => d.id === selectedDoctor)
                  const p = new URLSearchParams({
                    patientName: success.patientName,
                    doctorName: success.doctorName,
                    amount: String(success.paymentAmount),
                    method: paymentMethod,
                    date: new Date().toISOString(),
                    invoiceNum: `${Date.now().toString().slice(-6)}`,
                    ...(insuranceCompany || insurancePolicyNumber
                      ? { insuranceInfo: [insuranceCompany, insurancePolicyNumber].filter(Boolean).join(' — ') }
                      : {}),
                  })
                  router.push(`/frontdesk/receipt?${p.toString()}`)
                }}
                className="w-full h-[44px] bg-[#F5F3FF] text-[#7C3AED] rounded-[12px] font-cairo text-[14px] font-medium border border-[#DDD6FE]"
              >
                🧾 طباعة إيصال
              </button>
            )}
            <button onClick={() => router.push('/frontdesk/dashboard')} className="w-full h-[44px] bg-[#F3F4F6] text-[#4B5563] rounded-[12px] font-cairo text-[14px] font-medium">
              العودة للرئيسية
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main Form ──
  return (
    <div dir="rtl">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-[#E5E7EB]">
        <button onClick={() => router.back()} className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center">
          <ChevronRight className="w-[20px] h-[20px] text-[#030712]" />
        </button>
        <h1 className="font-cairo text-[18px] font-semibold text-[#030712]">تسجيل الوصول</h1>
      </div>

      <div className="px-4 pt-4 pb-6 space-y-5">
        {/* Patient Search */}
        <div>
          <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">بحث عن المريض</label>
          {selectedPatient ? (
            <div className="bg-[#F0FDF4] border-[0.8px] border-[#16A34A]/30 rounded-[12px] p-3.5 flex items-center justify-between">
              <div>
                <p className="font-cairo text-[14px] font-semibold text-[#030712]">{selectedPatient.full_name || 'مريض'}</p>
                <p className="font-cairo text-[12px] text-[#6B7280]" dir="ltr">
                  {selectedPatient.phone}{selectedPatient.age ? ` · ${selectedPatient.age} سنة` : ''}
                </p>
              </div>
              <button onClick={() => setSelectedPatient(null)} className="font-cairo text-[13px] font-medium text-[#16A34A]">تغيير</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#9CA3AF]" />
                <input
                  type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="الاسم أو رقم الهاتف..."
                  className="w-full h-[44px] pr-10 pl-4 rounded-[12px] border-[0.8px] border-[#E5E7EB] font-cairo text-[14px] text-[#030712] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#16A34A] bg-[#F9FAFB]"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="mt-2 bg-white border-[0.8px] border-[#E5E7EB] rounded-[12px] overflow-hidden divide-y divide-[#F3F4F6]">
                  {searchResults.slice(0, 5).map((patient) => (
                    <button key={patient.id} onClick={() => { setSelectedPatient(patient); setSearchQuery(''); setSearchResults([]) }}
                      className="w-full text-right px-4 py-3 hover:bg-[#F9FAFB] transition-colors">
                      <p className="font-cairo text-[14px] font-medium text-[#030712]">{patient.full_name || 'مريض'}</p>
                      <p className="font-cairo text-[12px] text-[#6B7280]" dir="ltr">
                        {patient.phone}{patient.age ? ` · ${patient.age} سنة` : ''}{patient.sex ? ` · ${patient.sex === 'male' ? 'ذكر' : 'أنثى'}` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {searching && searchQuery.length >= 1 && <p className="font-cairo text-[12px] text-[#9CA3AF] mt-2 text-center">جاري البحث...</p>}
              {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                <div className="mt-3 text-center">
                  <p className="font-cairo text-[13px] text-[#6B7280] mb-2">لم يتم العثور على المريض</p>
                  <Link href="/frontdesk/patients/register" className="inline-flex items-center gap-1.5 font-cairo text-[13px] font-medium text-[#16A34A]">
                    <UserPlus className="w-4 h-4" />تسجيل مريض جديد
                  </Link>
                </div>
              )}
            </>
          )}
        </div>

        {/* Doctor Selector */}
        <div>
          <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">اختر الطبيب</label>
          <div className="space-y-2">
            {doctors.map((doc) => (
              <button key={doc.id} onClick={() => setSelectedDoctor(doc.id)}
                className={`w-full flex items-center justify-between p-3.5 rounded-[12px] border-[0.8px] transition-colors text-right ${
                  selectedDoctor === doc.id ? 'border-[#16A34A] bg-[#F0FDF4]' : 'border-[#E5E7EB] bg-white'
                }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedDoctor === doc.id ? 'border-[#16A34A]' : 'border-[#D1D5DB]'}`}>
                    {selectedDoctor === doc.id && <div className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" />}
                  </div>
                  <div>
                    <p className="font-cairo text-[14px] font-medium text-[#030712]">د. {(doc.full_name || '').replace(/^د\.\s*/, '')}</p>
                    <p className="font-cairo text-[12px] text-[#6B7280]">{translateSpecialty(doc.specialty)}</p>
                  </div>
                </div>
                <div className="text-left">
                  <p className="font-cairo text-[12px] text-[#6B7280]">{doc.waitingCount} انتظار</p>
                  {doc.estimatedWait > 0 && <p className="font-cairo text-[11px] text-[#9CA3AF]">~{doc.estimatedWait} دقيقة</p>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Visit Type */}
        <div>
          <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">نوع الزيارة</label>
          <div className="flex gap-2">
            {([
              { value: 'walkin' as const, label: 'حضور', active: 'border-[#16A34A] bg-[#F0FDF4]' },
              { value: 'appointment' as const, label: 'موعد', active: 'border-[#2563EB] bg-[#EFF6FF]' },
              { value: 'emergency' as const, label: 'طوارئ', active: 'border-[#EF4444] bg-[#FEF2F2]' },
            ]).map((type) => (
              <button key={type.value} onClick={() => setQueueType(type.value)}
                className={`flex-1 h-[42px] rounded-[10px] border-[0.8px] font-cairo text-[13px] font-medium transition-colors ${
                  queueType === type.value ? `${type.active} text-[#030712]` : 'border-[#E5E7EB] bg-white text-[#6B7280]'
                }`}>
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">
            ملاحظات <span className="font-normal text-[#9CA3AF]">(اختياري)</span>
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظة للطبيب..." rows={2}
            className="w-full px-4 py-3 rounded-[12px] border-[0.8px] border-[#E5E7EB] font-cairo text-[14px] text-[#030712] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#16A34A] bg-[#F9FAFB] resize-none" />
        </div>

        {/* ── Payment Capture (Optional) ── */}
        <div className="rounded-[12px] border-[0.8px] border-[#E5E7EB] bg-white overflow-hidden">
          {/* Collapsible header */}
          <button
            onClick={() => setShowPayment(!showPayment)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F9FAFB] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Banknote className="w-[18px] h-[18px] text-[#16A34A]" />
              <span className="font-cairo text-[14px] font-semibold text-[#030712]">تحصيل الدفع</span>
              <span className="font-cairo text-[11px] text-[#9CA3AF] font-normal">(اختياري — بعد الكشف)</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-[#6B7280] transition-transform ${showPayment ? 'rotate-180' : ''}`} />
          </button>

          {showPayment && (
            <div className="px-4 pb-4 space-y-3 border-t border-[#F3F4F6]">
              {/* Skip payment checkbox */}
              <label className="flex items-center gap-2.5 pt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipPayment}
                  onChange={(e) => setSkipPayment(e.target.checked)}
                  className="w-4.5 h-4.5 rounded border-[#D1D5DB] text-[#16A34A] focus:ring-[#16A34A] accent-[#16A34A]"
                />
                <span className="font-cairo text-[13px] text-[#6B7280]">دفع لاحق</span>
              </label>

              {!skipPayment && (
                <>
                  {/* Amount */}
                  <div>
                    <label className="font-cairo text-[12px] text-[#6B7280] mb-1.5 block">المبلغ (ج.م)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value.replace(/[^\d.]/g, ''))}
                      placeholder="٣٠٠"
                      className="w-full h-12 px-4 rounded-[10px] border-[0.8px] border-[#E5E7EB] font-cairo text-[20px] font-bold text-center text-[#030712] placeholder:text-[#D1D5DB] focus:outline-none focus:border-[#16A34A] bg-[#F9FAFB]"
                    />
                  </div>

                  {/* Payment method chips */}
                  <div>
                    <label className="font-cairo text-[12px] text-[#6B7280] mb-1.5 block">طريقة الدفع</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {([
                        { value: 'cash' as const, label: 'نقدي', Icon: Banknote, bg: 'bg-[#F0FDF4]', border: 'border-[#16A34A]', iconClr: 'text-[#16A34A]' },
                        { value: 'card' as const, label: 'كارت', Icon: CreditCard, bg: 'bg-[#EFF6FF]', border: 'border-[#2563EB]', iconClr: 'text-[#2563EB]' },
                        { value: 'transfer' as const, label: 'تحويل', Icon: ArrowLeftRight, bg: 'bg-[#FFFBEB]', border: 'border-[#D97706]', iconClr: 'text-[#D97706]' },
                        { value: 'insurance' as const, label: 'تأمين', Icon: Building2, bg: 'bg-[#F5F3FF]', border: 'border-[#7C3AED]', iconClr: 'text-[#7C3AED]' },
                      ]).map((m) => (
                        <button
                          key={m.value}
                          onClick={() => setPaymentMethod(m.value)}
                          className={`flex flex-col items-center gap-1 py-2 rounded-[8px] border-[0.8px] font-cairo text-[11px] font-medium transition-colors ${
                            paymentMethod === m.value
                              ? `${m.bg} ${m.border} text-[#030712]`
                              : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#9CA3AF]'
                          }`}
                        >
                          <m.Icon className={`w-4 h-4 ${paymentMethod === m.value ? m.iconClr : 'text-[#D1D5DB]'}`} />
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Insurance fields — shown only when insurance payment is selected */}
                  {paymentMethod === 'insurance' && (
                    <div className="mt-3 space-y-2 border-t border-[#EDE9FE] pt-3">
                      <label className="font-cairo text-[12px] text-[#7C3AED] font-medium block">بيانات التأمين</label>
                      <input
                        type="text"
                        value={insuranceCompany}
                        onChange={(e) => setInsuranceCompany(e.target.value)}
                        placeholder="شركة التأمين (مثال: بوبا، ميدنت)"
                        className="w-full h-10 px-3 rounded-[8px] border-[0.8px] border-[#DDD6FE] font-cairo text-[13px] text-[#030712] placeholder:text-[#C4B5FD] focus:outline-none focus:border-[#7C3AED] bg-white"
                      />
                      <input
                        type="text"
                        value={insurancePolicyNumber}
                        onChange={(e) => setInsurancePolicyNumber(e.target.value)}
                        placeholder="رقم البوليصة / رقم العضوية"
                        className="w-full h-10 px-3 rounded-[8px] border-[0.8px] border-[#DDD6FE] font-cairo text-[13px] text-[#030712] placeholder:text-[#C4B5FD] focus:outline-none focus:border-[#7C3AED] bg-white"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border-[0.8px] border-red-200 rounded-[12px]">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="font-cairo text-[13px] text-red-700">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button onClick={handleCheckIn} disabled={loading || !selectedPatient || !selectedDoctor}
          className="w-full h-[48px] bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-40 text-white rounded-[12px] font-cairo text-[15px] font-bold transition-colors">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              جاري التسجيل...
            </span>
          ) : 'تسجيل وصول المريض'}
        </button>
      </div>
    </div>
  )
}
