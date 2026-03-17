'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, Plus, Search, X, Check, AlertTriangle, Loader2,
  Banknote, CreditCard, Building2, ArrowLeftRight, Coins, Clock, User,
  Pencil, Ban, MoreVertical, Share2
} from 'lucide-react'

import type {
  EnrichedPayment,
  PaymentMethod as SharedPaymentMethod,
  CheckInQueueItem,
} from '@shared/lib/data/frontdesk'

// ============================================================================
// TYPES — shared where possible, page-specific otherwise
// ============================================================================

type Payment = EnrichedPayment

interface DoctorInfo {
  id: string
  full_name: string
}

interface DoctorFee {
  id: string
  full_name: string
  consultation_fee_egp: number
  followup_fee_egp: number
}

/** Subset of CheckInQueueItem used in payment recording sheet */
type QueuePatient = Pick<CheckInQueueItem, 'id' | 'patient_id' | 'patient' | 'doctor' | 'doctor_id' | 'queue_type'>

type DateRange = 'today' | 'yesterday'
/** UI-facing payment methods (subset — excludes 'other') */
type PaymentMethod = Extract<SharedPaymentMethod, 'cash' | 'card' | 'insurance' | 'transfer'>

// ============================================================================
// CONSTANTS
// ============================================================================

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote; bgActive: string; borderActive: string; iconColor: string }[] = [
  { value: 'cash', label: 'نقدي', icon: Banknote, bgActive: 'bg-[#F0FDF4]', borderActive: 'border-[#16A34A]', iconColor: 'text-[#16A34A]' },
  { value: 'card', label: 'كارت', icon: CreditCard, bgActive: 'bg-[#EFF6FF]', borderActive: 'border-[#2563EB]', iconColor: 'text-[#2563EB]' },
  { value: 'transfer', label: 'تحويل', icon: ArrowLeftRight, bgActive: 'bg-[#FFFBEB]', borderActive: 'border-[#D97706]', iconColor: 'text-[#D97706]' },
  { value: 'insurance', label: 'تأمين', icon: Building2, bgActive: 'bg-[#F5F3FF]', borderActive: 'border-[#7C3AED]', iconColor: 'text-[#7C3AED]' },
]

// ============================================================================
// PAYMENTS PAGE — Full Rewrite
// Features: Date chips, Method filters, FAB, Search, Bottom Sheet recording,
//           Empty state, Success toast, Doctor filter
// ============================================================================

export default function PaymentsPage() {
  const router = useRouter()

  // ── List State ──
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [totals, setTotals] = useState({ total: 0, count: 0, by_method: {} as Record<string, number> })
  const [clinicDoctors, setClinicDoctors] = useState<DoctorInfo[]>([])

  // ── Filters ──
  const [dateRange, setDateRange] = useState<DateRange>('today')
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | ''>('')
  const [doctorFilter, setDoctorFilter] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // ── Bottom Sheet (Record Payment) ──
  const [showRecordSheet, setShowRecordSheet] = useState(false)
  const [queuePatients, setQueuePatients] = useState<QueuePatient[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [selectedDoctorId, setSelectedDoctorId] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // ── Doctor Fees (for auto-fill) ──
  const [doctorFees, setDoctorFees] = useState<DoctorFee[]>([])

  // ── Void/Edit ──
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null)
  const [voidLoading, setVoidLoading] = useState(false)
  const [editTarget, setEditTarget] = useState<Payment | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editMethod, setEditMethod] = useState<PaymentMethod>('cash')
  const [editNotes, setEditNotes] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // ── Success Toast + Receipt ──
  const [successToast, setSuccessToast] = useState<{
    patientName: string
    amount: number
    method: string
    doctorName?: string
    phone?: string
    date?: string
  } | null>(null)

  // ============================================================================
  // LOAD PAYMENTS
  // ============================================================================

  const loadPayments = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ range: dateRange })
      if (methodFilter) params.set('method', methodFilter)
      if (doctorFilter) params.set('doctorId', doctorFilter)

      const res = await fetch(`/api/frontdesk/payments?${params}`)
      if (res.ok) {
        const data = await res.json()
        setPayments(data.payments || [])
        setTotals(data.totals || { total: 0, count: 0, by_method: {} })
        if (data.doctors) {
          setClinicDoctors(data.doctors)
        }
      }
    } catch (err) {
      console.error('Failed to load payments:', err)
    } finally {
      setLoading(false)
    }
  }, [dateRange, methodFilter, doctorFilter])

  useEffect(() => {
    loadPayments()
  }, [loadPayments])

  // Load doctor fees once
  useEffect(() => {
    fetch('/api/frontdesk/doctors/fees')
      .then(r => r.ok ? r.json() : { doctors: [] })
      .then(d => setDoctorFees(d.doctors || []))
      .catch(() => {})
  }, [])

  // ============================================================================
  // OPEN RECORD SHEET — Load queue patients
  // ============================================================================

  const openRecordSheet = async () => {
    setShowRecordSheet(true)
    setSelectedPatientId('')
    setSelectedDoctorId('')
    setAmount('')
    setPaymentMethod('cash')
    setPaymentNotes('')
    setSubmitError('')

    try {
      const res = await fetch('/api/frontdesk/queue/today')
      if (res.ok) {
        const data = await res.json()
        setQueuePatients(data.queue || [])
      }
    } catch { /* non-blocking */ }
  }

  // ============================================================================
  // RECORD PAYMENT
  // ============================================================================

  const handleRecordPayment = async () => {
    if (!selectedPatientId) { setSubmitError('اختر المريض'); return }
    if (!amount || Number(amount) <= 0) { setSubmitError('أدخل المبلغ'); return }
    if (!selectedDoctorId) { setSubmitError('اختر الطبيب'); return }

    setSubmitting(true)
    setSubmitError('')

    try {
      const res = await fetch('/api/frontdesk/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatientId,
          doctorId: selectedDoctorId,
          amount: Number(amount),
          paymentMethod,
          notes: paymentNotes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل تسجيل الدفع')

      // Close sheet and show toast
      setShowRecordSheet(false)
      const qp = queuePatients.find(q => q.patient_id === selectedPatientId)
      setSuccessToast({
        patientName: qp?.patient?.full_name || 'مريض',
        amount: Number(amount),
        method: paymentMethod,
        doctorName: qp?.doctor?.full_name || undefined,
        phone: qp?.patient?.phone || undefined,
        date: new Date().toISOString(),
      })

      // Auto-dismiss toast after 8s (longer to allow receipt sharing)
      setTimeout(() => setSuccessToast(null), 8000)

      // Reload payments
      loadPayments()

    } catch (err: any) {
      setSubmitError(err.message || 'حدث خطأ')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePatientSelect = (patientId: string) => {
    setSelectedPatientId(patientId)
    setSubmitError('')
    const q = queuePatients.find(p => p.patient_id === patientId)
    if (q) {
      setSelectedDoctorId(q.doctor_id)
      // Auto-fill consultation fee if available
      const fee = doctorFees.find(d => d.id === q.doctor_id)
      if (fee && fee.consultation_fee_egp > 0 && !amount) {
        setAmount(String(fee.consultation_fee_egp))
      }
    }
  }

  // ── Void payment ──
  const handleVoidConfirm = async () => {
    if (!voidTarget) return
    setVoidLoading(true)
    try {
      const res = await fetch('/api/frontdesk/payments/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: voidTarget.id, action: 'void' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل إلغاء الدفعة')
      setVoidTarget(null)
      setSuccessToast({
        patientName: voidTarget.patient?.full_name || 'مريض',
        amount: Number(voidTarget.amount),
        method: 'ملغي',
      })
      setTimeout(() => setSuccessToast(null), 3000)
      loadPayments()
    } catch (err: any) {
      setSubmitError(err.message || 'حدث خطأ')
    } finally {
      setVoidLoading(false)
    }
  }

  // ── Edit payment ──
  const openEditSheet = (pay: Payment) => {
    setEditTarget(pay)
    setEditAmount(String(pay.amount))
    setEditMethod((pay.payment_method as PaymentMethod) || 'cash')
    setEditNotes(pay.notes || '')
    setActionMenuId(null)
  }

  const handleEditConfirm = async () => {
    if (!editTarget) return
    setEditLoading(true)
    setSubmitError('')
    try {
      const updates: Record<string, any> = { paymentId: editTarget.id, action: 'edit' }
      if (Number(editAmount) !== Number(editTarget.amount)) updates.amount = Number(editAmount)
      if (editMethod !== editTarget.payment_method) updates.paymentMethod = editMethod
      if (editNotes !== (editTarget.notes || '')) updates.notes = editNotes

      const res = await fetch('/api/frontdesk/payments/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل تعديل الدفعة')
      setEditTarget(null)
      setSuccessToast({
        patientName: editTarget.patient?.full_name || 'مريض',
        amount: Number(editAmount),
        method: editMethod,
      })
      setTimeout(() => setSuccessToast(null), 3000)
      loadPayments()
    } catch (err: any) {
      setSubmitError(err.message || 'حدث خطأ')
    } finally {
      setEditLoading(false)
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  const getMethodConfig = (method: string) => {
    return PAYMENT_METHODS.find(m => m.value === method) || PAYMENT_METHODS[0]
  }

  const getMethodLabel = (method: string) => {
    switch (method) {
      case 'cash': return 'نقدي'
      case 'card': return 'كارت'
      case 'transfer': return 'تحويل'
      case 'insurance': return 'تأمين'
      default: return method
    }
  }

  // ── Receipt generation ──
  const generateReceiptText = (opts: {
    patientName: string
    amount: number
    method: string
    doctorName?: string
    date?: string
  }) => {
    const dateStr = opts.date
      ? new Date(opts.date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })
    const timeStr = opts.date
      ? new Date(opts.date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })

    return [
      '🏥 إيصال دفع — MedAssist',
      '━━━━━━━━━━━━━━━━━━',
      `👤 المريض: ${opts.patientName}`,
      opts.doctorName ? `🩺 الطبيب: د. ${opts.doctorName.replace(/^د\.\s*/, '')}` : '',
      `💰 المبلغ: ${opts.amount.toLocaleString('ar-EG')} ج.م`,
      `💳 طريقة الدفع: ${getMethodLabel(opts.method)}`,
      `📅 التاريخ: ${dateStr}`,
      `🕐 الوقت: ${timeStr}`,
      '━━━━━━━━━━━━━━━━━━',
      'شكراً لزيارتكم ✨',
    ].filter(Boolean).join('\n')
  }

  const shareViaWhatsApp = (phone?: string, receiptText?: string) => {
    const text = encodeURIComponent(receiptText || '')
    if (phone) {
      // Format Egyptian phone to international
      const intlPhone = phone.startsWith('+') ? phone.replace(/\D/g, '') : `2${phone.replace(/\D/g, '')}`
      window.open(`https://wa.me/${intlPhone}?text=${text}`, '_blank')
    } else {
      // Open WhatsApp with text but no specific number
      window.open(`https://wa.me/?text=${text}`, '_blank')
    }
  }

  // Filter payments by search query (client-side)
  const filteredPayments = searchQuery.trim()
    ? payments.filter(p =>
        (p.patient?.full_name || '').includes(searchQuery) ||
        (p.doctor?.full_name || '').includes(searchQuery) ||
        String(p.amount).includes(searchQuery)
      )
    : payments

  const dateLabel = dateRange === 'today' ? 'اليوم' : 'أمس'

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div dir="rtl" className="min-h-screen bg-[#F9FAFB] pb-24" onClick={() => actionMenuId && setActionMenuId(null)}>

      {/* ── Header ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#E5E7EB]">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.back()}
              className="w-9 h-9 rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center flex-shrink-0"
            >
              <ChevronRight className="w-5 h-5 text-[#030712]" />
            </button>
            <h1 className="font-cairo text-[18px] font-semibold text-[#030712] truncate">
              المدفوعات
            </h1>
          </div>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="w-9 h-9 rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center flex-shrink-0"
          >
            {showSearch ? <X className="w-4 h-4 text-[#6B7280]" /> : <Search className="w-4 h-4 text-[#6B7280]" />}
          </button>
        </div>

        {/* ── Search Bar (expandable) ── */}
        {showSearch && (
          <div className="px-4 pb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث باسم المريض أو المبلغ..."
              autoFocus
              className="w-full h-10 px-4 rounded-[10px] border-[0.8px] border-[#E5E7EB] font-cairo text-[13px] text-[#030712] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#16A34A] bg-[#F9FAFB]"
            />
          </div>
        )}
      </div>

      {/* ── Filter Bar: Date Chips + Method Chips ── */}
      <div className="px-4 pt-3 space-y-2.5">
        {/* Date chips */}
        <div className="flex gap-2">
          {([
            { value: 'today' as const, label: 'اليوم' },
            { value: 'yesterday' as const, label: 'أمس' },
          ]).map((chip) => (
            <button
              key={chip.value}
              onClick={() => setDateRange(chip.value)}
              className={`h-9 px-4 rounded-[8px] font-cairo text-[13px] font-medium transition-colors ${
                dateRange === chip.value
                  ? 'bg-[#16A34A] text-white'
                  : 'bg-white border-[0.8px] border-[#E5E7EB] text-[#6B7280]'
              }`}
            >
              {chip.label}
            </button>
          ))}

          {/* Doctor filter (only show if multiple doctors) */}
          {clinicDoctors.length > 1 && (
            <select
              value={doctorFilter}
              onChange={(e) => setDoctorFilter(e.target.value)}
              className="h-9 px-3 rounded-[8px] border-[0.8px] border-[#E5E7EB] bg-white font-cairo text-[13px] text-[#6B7280] focus:outline-none focus:border-[#16A34A] appearance-none"
            >
              <option value="">كل الأطباء</option>
              {clinicDoctors.map(doc => (
                <option key={doc.id} value={doc.id}>د. {(doc.full_name || '').replace(/^د\.\s*/, '')}</option>
              ))}
            </select>
          )}
        </div>

        {/* Method filter chips */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          <button
            onClick={() => setMethodFilter('')}
            className={`h-8 px-3 rounded-[8px] font-cairo text-[12px] font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
              !methodFilter
                ? 'bg-[#030712] text-white'
                : 'bg-white border-[0.8px] border-[#E5E7EB] text-[#6B7280]'
            }`}
          >
            الكل
          </button>
          {PAYMENT_METHODS.map((m) => {
            const Icon = m.icon
            return (
              <button
                key={m.value}
                onClick={() => setMethodFilter(methodFilter === m.value ? '' : m.value)}
                className={`h-8 px-3 rounded-[8px] font-cairo text-[12px] font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 flex-shrink-0 ${
                  methodFilter === m.value
                    ? `${m.bgActive} ${m.borderActive} border-[0.8px] text-[#030712]`
                    : 'bg-white border-[0.8px] border-[#E5E7EB] text-[#6B7280]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${methodFilter === m.value ? m.iconColor : 'text-[#9CA3AF]'}`} />
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-4 pt-4 space-y-4">
        {loading ? (
          <div className="text-center py-16">
            <Loader2 className="w-8 h-8 text-[#16A34A] animate-spin mx-auto" />
          </div>
        ) : (
          <>
            {/* ── Revenue Summary Card ── */}
            <div className="bg-[#F0FDF4] rounded-[12px] border-[0.8px] border-[#16A34A]/20 p-5">
              <p className="font-cairo text-[12px] text-[#6B7280] mb-1">
                إيرادات {dateLabel}
              </p>
              <p className="font-cairo text-[28px] font-bold text-[#030712] mb-2">
                {totals.total.toLocaleString('ar-EG')} <span className="text-[16px] font-medium text-[#6B7280]">ج.م</span>
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-cairo text-[12px] text-[#4B5563]">
                {PAYMENT_METHODS.map(m => {
                  const val = totals.by_method[m.value] || 0
                  if (val === 0 && totals.total === 0) return null
                  return (
                    <span key={m.value} className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${
                        m.value === 'cash' ? 'bg-[#16A34A]' :
                        m.value === 'card' ? 'bg-[#2563EB]' :
                        m.value === 'transfer' ? 'bg-[#D97706]' :
                        'bg-[#7C3AED]'
                      }`} />
                      {m.label} {val.toLocaleString('ar-EG')}
                    </span>
                  )
                })}
              </div>
              <p className="font-cairo text-[11px] text-[#9CA3AF] mt-2">
                {totals.count} معاملة {dateLabel}
              </p>
            </div>

            {/* ── Payment Log ── */}
            {filteredPayments.length === 0 ? (
              /* ── Empty State ── */
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-[#F3F4F6] rounded-full flex items-center justify-center mx-auto mb-4">
                  <Coins className="w-10 h-10 text-[#D1D5DB]" />
                </div>
                <h3 className="font-cairo text-[16px] font-medium text-[#4B5563] mb-1">
                  {searchQuery ? 'لا توجد نتائج' : 'لا توجد مدفوعات'}
                </h3>
                <p className="font-cairo text-[14px] text-[#9CA3AF] mb-5">
                  {searchQuery
                    ? 'جرب كلمة بحث مختلفة'
                    : dateRange === 'today'
                      ? 'لم يتم تسجيل مدفوعات اليوم بعد'
                      : 'لم يتم تسجيل مدفوعات أمس'
                  }
                </p>
                {!searchQuery && (
                  <button
                    onClick={openRecordSheet}
                    className="inline-flex items-center gap-2 h-11 px-6 bg-[#16A34A] text-white rounded-[12px] font-cairo text-[14px] font-bold"
                  >
                    <Plus className="w-4 h-4" />
                    تسجيل أول دفعة
                  </button>
                )}
              </div>
            ) : (
              <div>
                <h2 className="font-cairo text-[14px] font-semibold text-[#4B5563] mb-2">
                  سجل المدفوعات
                </h2>
                <div className="space-y-2">
                  {filteredPayments.map((pay) => {
                    const methodConf = getMethodConfig(pay.payment_method)
                    const MethodIcon = methodConf.icon
                    const isVoided = pay.payment_status === 'cancelled' || pay.payment_status === 'refunded'
                    const isToday = dateRange === 'today'
                    return (
                      <div
                        key={pay.id}
                        className={`bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3.5 relative ${isVoided ? 'opacity-50' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Method icon */}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${methodConf.bgActive}`}>
                            <MethodIcon className={`w-[18px] h-[18px] ${methodConf.iconColor}`} />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className={`font-cairo text-[14px] font-semibold truncate ${isVoided ? 'line-through text-[#9CA3AF]' : 'text-[#030712]'}`}>
                                {pay.patient?.full_name || 'مريض'}
                              </p>
                              {isVoided && (
                                <span className="font-cairo text-[10px] font-bold bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full flex-shrink-0">ملغي</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 font-cairo text-[12px] text-[#6B7280]">
                              <span className="truncate">د. {(pay.doctor?.full_name || '').replace(/^د\.\s*/, '')}</span>
                              <span className="text-[#D1D5DB]">·</span>
                              <span>{getMethodLabel(pay.payment_method)}</span>
                              <span className="text-[#D1D5DB]">·</span>
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />
                                {new Date(pay.created_at).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>

                          {/* Amount + Actions */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="text-left">
                              <p className={`font-cairo text-[15px] font-bold ${isVoided ? 'line-through text-[#9CA3AF]' : 'text-[#030712]'}`}>
                                {Number(pay.amount).toLocaleString('ar-EG')}
                              </p>
                              <p className="font-cairo text-[11px] text-[#9CA3AF]">ج.م</p>
                            </div>

                            {/* 3-dot menu for today's active payments */}
                            {isToday && !isVoided && (
                              <div className="relative">
                                <button
                                  onClick={() => setActionMenuId(actionMenuId === pay.id ? null : pay.id)}
                                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F3F4F6]"
                                >
                                  <MoreVertical className="w-4 h-4 text-[#9CA3AF]" />
                                </button>
                                {actionMenuId === pay.id && (
                                  <div className="absolute left-0 top-full mt-1 bg-white border-[0.8px] border-[#E5E7EB] rounded-[10px] shadow-lg z-20 w-32 overflow-hidden">
                                    <button
                                      onClick={() => openEditSheet(pay)}
                                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#F9FAFB] font-cairo text-[13px] text-[#030712]"
                                    >
                                      <Pencil className="w-3.5 h-3.5 text-[#6B7280]" />
                                      تعديل
                                    </button>
                                    <button
                                      onClick={() => { setVoidTarget(pay); setActionMenuId(null) }}
                                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-red-50 font-cairo text-[13px] text-[#EF4444]"
                                    >
                                      <Ban className="w-3.5 h-3.5" />
                                      إلغاء
                                    </button>
                                    <button
                                      onClick={() => {
                                        setActionMenuId(null)
                                        const receipt = generateReceiptText({
                                          patientName: pay.patient?.full_name || 'مريض',
                                          amount: Number(pay.amount),
                                          method: pay.payment_method,
                                          doctorName: pay.doctor?.full_name || undefined,
                                          date: pay.created_at,
                                        })
                                        shareViaWhatsApp(undefined, receipt)
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#F0FDF4] font-cairo text-[13px] text-[#25D366]"
                                    >
                                      <Share2 className="w-3.5 h-3.5" />
                                      إيصال واتساب
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── FAB — New Payment ── */}
      <button
        onClick={openRecordSheet}
        className="fixed bottom-20 left-4 z-20 w-14 h-14 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-full shadow-lg flex items-center justify-center transition-colors active:scale-95"
        style={{ boxShadow: '0 4px 12px rgba(22,163,74,0.3)' }}
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* ============================================================================ */}
      {/* RECORD PAYMENT — Bottom Sheet */}
      {/* ============================================================================ */}
      {showRecordSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !submitting && setShowRecordSheet(false)}
          />
          <div className="relative w-full max-w-md bg-white rounded-t-[20px] animate-slide-up max-h-[90vh] overflow-y-auto">
            {/* Drag handle */}
            <div className="sticky top-0 bg-white rounded-t-[20px] pt-3 pb-2 z-10">
              <div className="w-10 h-1 bg-[#D1D5DB] rounded-full mx-auto" />
              <h3 className="font-cairo text-[17px] font-bold text-[#030712] text-center mt-3">
                تسجيل دفع جديد
              </h3>
            </div>

            <div className="px-5 pb-8 space-y-5">

              {/* Patient from queue */}
              <div>
                <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">المريض</label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => handlePatientSelect(e.target.value)}
                  className="w-full h-12 px-4 rounded-[12px] border-[0.8px] border-[#E5E7EB] font-cairo text-[14px] text-[#030712] focus:outline-none focus:border-[#16A34A] bg-[#F9FAFB] appearance-none"
                >
                  <option value="">اختر من قائمة الانتظار</option>
                  {queuePatients.map((q) => (
                    <option key={q.patient_id} value={q.patient_id}>
                      {q.patient?.full_name || 'مريض'} — د. {(q.doctor?.full_name || '').replace(/^د\.\s*/, '')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">المبلغ (ج.م)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^\d.]/g, '')
                    setAmount(val)
                    setSubmitError('')
                  }}
                  placeholder="١٥٠"
                  className="w-full h-14 px-4 rounded-[12px] border-[0.8px] border-[#E5E7EB] font-cairo text-[24px] font-bold text-center text-[#030712] placeholder:text-[#D1D5DB] focus:outline-none focus:border-[#16A34A] bg-[#F9FAFB]"
                />
              </div>

              {/* Payment Method — 4 cards */}
              <div>
                <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">طريقة الدفع</label>
                <div className="grid grid-cols-4 gap-2">
                  {PAYMENT_METHODS.map((m) => {
                    const Icon = m.icon
                    const isSelected = paymentMethod === m.value
                    return (
                      <button
                        key={m.value}
                        onClick={() => setPaymentMethod(m.value)}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-[10px] border-[0.8px] font-cairo text-[11px] font-medium transition-colors ${
                          isSelected
                            ? `${m.bgActive} ${m.borderActive} text-[#030712]`
                            : 'border-[#E5E7EB] bg-white text-[#6B7280]'
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${isSelected ? m.iconColor : 'text-[#9CA3AF]'}`} />
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">
                  ملاحظات <span className="font-normal text-[#9CA3AF]">(اختياري)</span>
                </label>
                <textarea
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="ملاحظة..."
                  rows={2}
                  className="w-full px-4 py-3 rounded-[12px] border-[0.8px] border-[#E5E7EB] font-cairo text-[14px] text-[#030712] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#16A34A] bg-[#F9FAFB] resize-none"
                />
              </div>

              {/* Error */}
              {submitError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border-[0.8px] border-red-200 rounded-[12px]">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <p className="font-cairo text-[13px] text-red-700">{submitError}</p>
                </div>
              )}

              {/* Buttons */}
              <div className="space-y-2.5">
                <button
                  onClick={handleRecordPayment}
                  disabled={submitting || !selectedPatientId || !amount}
                  className="w-full h-12 bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-40 text-white rounded-[12px] font-cairo text-[15px] font-bold transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      جاري التسجيل...
                    </>
                  ) : (
                    <>
                      <Check className="w-[18px] h-[18px]" />
                      تسجيل الدفع
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowRecordSheet(false)}
                  disabled={submitting}
                  className="w-full h-11 bg-[#F3F4F6] text-[#4B5563] rounded-[12px] font-cairo text-[14px] font-medium"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* VOID CONFIRMATION DIALOG */}
      {/* ============================================================================ */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-8"
          onClick={() => !voidLoading && setVoidTarget(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-[310px] shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-[#FEF2F2] flex items-center justify-center">
                <Ban className="w-6 h-6 text-[#EF4444]" />
              </div>
            </div>
            <h3 className="font-cairo text-[16px] font-bold text-[#030712] text-center mb-1.5">إلغاء الدفعة؟</h3>
            <div className="bg-[#FEF2F2] rounded-xl p-3 mb-4 text-center">
              <p className="font-cairo text-[13px] font-bold text-[#030712]">{voidTarget.patient?.full_name || 'مريض'}</p>
              <p className="font-cairo text-[15px] font-bold text-[#EF4444] mt-1">{Number(voidTarget.amount).toLocaleString('ar-EG')} ج.م</p>
            </div>
            <p className="font-cairo text-[13px] text-[#6B7280] text-center mb-5">لا يمكن التراجع عن الإلغاء.</p>
            <div className="flex gap-3">
              <button onClick={() => setVoidTarget(null)} disabled={voidLoading}
                className="flex-1 h-11 rounded-xl border-[0.8px] border-[#E5E7EB] font-cairo text-[14px] font-bold text-[#4B5563]">
                تراجع
              </button>
              <button onClick={handleVoidConfirm} disabled={voidLoading}
                className="flex-1 h-11 rounded-xl bg-[#EF4444] text-white font-cairo text-[14px] font-bold flex items-center justify-center gap-2">
                {voidLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إلغاء الدفعة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* EDIT PAYMENT — Bottom Sheet */}
      {/* ============================================================================ */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !editLoading && setEditTarget(null)} />
          <div className="relative w-full max-w-md bg-white rounded-t-[20px] animate-slide-up max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white rounded-t-[20px] pt-3 pb-2 z-10">
              <div className="w-10 h-1 bg-[#D1D5DB] rounded-full mx-auto" />
              <h3 className="font-cairo text-[17px] font-bold text-[#030712] text-center mt-3">تعديل الدفعة</h3>
            </div>
            <div className="px-5 pb-8 space-y-5">
              {/* Patient (read-only) */}
              <div className="bg-[#F9FAFB] rounded-[12px] p-3 border-[0.8px] border-[#E5E7EB]">
                <p className="font-cairo text-[13px] text-[#6B7280]">المريض</p>
                <p className="font-cairo text-[14px] font-semibold text-[#030712]">{editTarget.patient?.full_name || 'مريض'}</p>
              </div>

              {/* Amount */}
              <div>
                <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">المبلغ (ج.م)</label>
                <input type="text" inputMode="numeric" value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  className="w-full h-14 px-4 rounded-[12px] border-[0.8px] border-[#E5E7EB] font-cairo text-[24px] font-bold text-center text-[#030712] focus:outline-none focus:border-[#16A34A] bg-[#F9FAFB]" />
              </div>

              {/* Method */}
              <div>
                <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">طريقة الدفع</label>
                <div className="grid grid-cols-4 gap-2">
                  {PAYMENT_METHODS.map((m) => {
                    const Icon = m.icon
                    const isSelected = editMethod === m.value
                    return (
                      <button key={m.value} onClick={() => setEditMethod(m.value)}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-[10px] border-[0.8px] font-cairo text-[11px] font-medium transition-colors ${
                          isSelected ? `${m.bgActive} ${m.borderActive} text-[#030712]` : 'border-[#E5E7EB] bg-white text-[#6B7280]'
                        }`}>
                        <Icon className={`w-5 h-5 ${isSelected ? m.iconColor : 'text-[#9CA3AF]'}`} />
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">ملاحظات</label>
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)}
                  rows={2} className="w-full px-4 py-3 rounded-[12px] border-[0.8px] border-[#E5E7EB] font-cairo text-[14px] text-[#030712] focus:outline-none focus:border-[#16A34A] bg-[#F9FAFB] resize-none" />
              </div>

              {submitError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border-[0.8px] border-red-200 rounded-[12px]">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <p className="font-cairo text-[13px] text-red-700">{submitError}</p>
                </div>
              )}

              <div className="space-y-2.5">
                <button onClick={handleEditConfirm} disabled={editLoading || !editAmount || Number(editAmount) <= 0}
                  className="w-full h-12 bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-40 text-white rounded-[12px] font-cairo text-[15px] font-bold transition-colors flex items-center justify-center gap-2">
                  {editLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري الحفظ...</> : <><Check className="w-[18px] h-[18px]" /> حفظ التعديلات</>}
                </button>
                <button onClick={() => setEditTarget(null)} disabled={editLoading}
                  className="w-full h-11 bg-[#F3F4F6] text-[#4B5563] rounded-[12px] font-cairo text-[14px] font-medium">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* SUCCESS TOAST */}
      {/* ============================================================================ */}
      {successToast && (
        <div className="fixed top-4 left-4 right-4 z-50 animate-slide-down">
          <div className="max-w-md mx-auto bg-[#F0FDF4] border-[0.8px] border-[#BBF7D0] rounded-[12px] p-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#16A34A] flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-cairo text-[14px] font-semibold text-[#030712]">
                  تم تسجيل الدفع
                </p>
                <p className="font-cairo text-[12px] text-[#16A34A]">
                  {successToast.patientName} · {Number(successToast.amount).toLocaleString('ar-EG')} ج.م · {getMethodLabel(successToast.method)}
                </p>
              </div>
              <button
                onClick={() => setSuccessToast(null)}
                className="w-8 h-8 flex items-center justify-center flex-shrink-0"
              >
                <X className="w-4 h-4 text-[#6B7280]" />
              </button>
            </div>
            {/* Receipt share button */}
            <button
              onClick={() => {
                const receipt = generateReceiptText({
                  patientName: successToast.patientName,
                  amount: successToast.amount,
                  method: successToast.method,
                  doctorName: successToast.doctorName,
                  date: successToast.date,
                })
                shareViaWhatsApp(successToast.phone, receipt)
              }}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-[8px] bg-[#25D366] text-white font-cairo text-[13px] font-medium"
            >
              <Share2 className="w-4 h-4" />
              إرسال إيصال عبر واتساب
            </button>
          </div>
        </div>
      )}

      {/* ── Animations ── */}
      <style jsx global>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes slide-down {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        .animate-slide-down {
          animation: slide-down 0.3s ease-out;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  )
}
