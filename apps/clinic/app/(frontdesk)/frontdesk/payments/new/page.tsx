'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Check, AlertTriangle, Banknote, CreditCard, Building2, ArrowLeftRight } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface QueuePatient {
  id: string
  patient_id: string
  patient: { full_name: string | null; phone: string }
  doctor: { full_name: string | null }
  doctor_id: string
  queue_type: string
}

// ============================================================================
// NEW PAYMENT PAGE
// ============================================================================

export default function NewPaymentPage() {
  const router = useRouter()

  const [queuePatients, setQueuePatients] = useState<QueuePatient[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [selectedDoctorId, setSelectedDoctorId] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'insurance' | 'transfer'>('cash')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Load today's queue patients for quick selection
  useEffect(() => {
    fetch('/api/frontdesk/queue/today')
      .then(r => r.json())
      .then(data => setQueuePatients(data.queue || []))
      .catch(() => {})
  }, [])

  const handlePatientSelect = (patientId: string) => {
    setSelectedPatientId(patientId)
    const q = queuePatients.find(p => p.patient_id === patientId)
    if (q) setSelectedDoctorId(q.doctor_id)
  }

  const handleSubmit = async () => {
    if (!selectedPatientId) { setError('اختر المريض'); return }
    if (!amount || Number(amount) <= 0) { setError('أدخل المبلغ'); return }

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/frontdesk/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatientId,
          doctorId: selectedDoctorId,
          amount: Number(amount),
          paymentMethod,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل تسجيل الدفع')
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'حدث خطأ')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div dir="rtl">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-[#E5E7EB]">
          <button onClick={() => router.push('/frontdesk/payments')} className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center">
            <ChevronRight className="w-[20px] h-[20px] text-[#030712]" />
          </button>
          <h1 className="font-cairo text-[18px] font-semibold text-[#030712]">تسجيل دفع</h1>
        </div>
        <div className="px-4 pt-10 pb-6 text-center">
          <div className="w-20 h-20 bg-[#F0FDF4] rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-10 h-10 text-[#16A34A]" />
          </div>
          <h2 className="font-cairo text-[20px] font-bold text-[#030712] mb-1">تم تسجيل الدفع بنجاح!</h2>
          <p className="font-cairo text-[14px] text-[#6B7280] mb-6">{Number(amount).toLocaleString('ar-EG')} ج.م</p>
          <div className="space-y-3">
            <button onClick={() => router.push('/frontdesk/payments')} className="w-full h-[48px] bg-[#16A34A] text-white rounded-[12px] font-cairo text-[15px] font-bold">
              عرض المدفوعات
            </button>
            <button onClick={() => { setSuccess(false); setAmount(''); setSelectedPatientId(''); setNotes('') }}
              className="w-full h-[44px] bg-[#F3F4F6] text-[#4B5563] rounded-[12px] font-cairo text-[14px] font-medium">
              تسجيل دفع آخر
            </button>
          </div>
        </div>
      </div>
    )
  }

  const methods = [
    { value: 'cash' as const, label: 'نقد', icon: Banknote, color: 'border-[#16A34A] bg-[#F0FDF4]' },
    { value: 'card' as const, label: 'بطاقة', icon: CreditCard, color: 'border-[#2563EB] bg-[#EFF6FF]' },
    { value: 'insurance' as const, label: 'تأمين', icon: Building2, color: 'border-[#7C3AED] bg-[#F5F3FF]' },
    { value: 'transfer' as const, label: 'تحويل', icon: ArrowLeftRight, color: 'border-[#D97706] bg-[#FFFBEB]' },
  ]

  return (
    <div dir="rtl">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-[#E5E7EB]">
        <button onClick={() => router.back()} className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center">
          <ChevronRight className="w-[20px] h-[20px] text-[#030712]" />
        </button>
        <h1 className="font-cairo text-[18px] font-semibold text-[#030712]">تسجيل دفع</h1>
      </div>

      <div className="px-4 pt-4 pb-6 space-y-5">
        {/* Patient from queue */}
        <div>
          <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">المريض</label>
          <select value={selectedPatientId} onChange={(e) => handlePatientSelect(e.target.value)}
            className="w-full h-[44px] px-4 rounded-[12px] border-[0.8px] border-[#E5E7EB] font-cairo text-[14px] text-[#030712] focus:outline-none focus:border-[#16A34A] bg-[#F9FAFB]">
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
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="١٥٠"
            className="w-full h-[56px] px-4 rounded-[12px] border-[0.8px] border-[#E5E7EB] font-cairo text-[24px] font-bold text-center text-[#030712] placeholder:text-[#D1D5DB] focus:outline-none focus:border-[#16A34A] bg-[#F9FAFB]" />
        </div>

        {/* Payment Method */}
        <div>
          <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">طريقة الدفع</label>
          <div className="flex gap-2">
            {methods.map((m) => {
              const Icon = m.icon
              return (
                <button key={m.value} onClick={() => setPaymentMethod(m.value)}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-[10px] border-[0.8px] font-cairo text-[12px] font-medium transition-colors ${
                    paymentMethod === m.value ? `${m.color} text-[#030712]` : 'border-[#E5E7EB] bg-white text-[#6B7280]'
                  }`}>
                  <Icon className="w-5 h-5" />
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
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظة..." rows={2}
            className="w-full px-4 py-3 rounded-[12px] border-[0.8px] border-[#E5E7EB] font-cairo text-[14px] text-[#030712] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#16A34A] bg-[#F9FAFB] resize-none" />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border-[0.8px] border-red-200 rounded-[12px]">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="font-cairo text-[13px] text-red-700">{error}</p>
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading || !selectedPatientId || !amount}
          className="w-full h-[48px] bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-40 text-white rounded-[12px] font-cairo text-[15px] font-bold transition-colors">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              جاري التسجيل...
            </span>
          ) : 'تسجيل الدفع'}
        </button>
      </div>
    </div>
  )
}
