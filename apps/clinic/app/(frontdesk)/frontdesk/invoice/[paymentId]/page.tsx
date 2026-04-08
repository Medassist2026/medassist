'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ChevronRight, Printer, MessageCircle, CheckCircle2,
  Loader2, AlertTriangle, Building2, User, Stethoscope,
  Pill, Receipt, Phone, MapPin, Calendar, CreditCard,
  Banknote, ArrowLeftRight, ShieldCheck
} from 'lucide-react'
import { translateSpecialty } from '@shared/lib/utils/specialty-labels'

// ============================================================================
// TYPES
// ============================================================================

interface InvoiceData {
  invoiceNumber: string
  issuedAt: string
  payment: {
    id: string
    amount: number
    method: string
    status: string
    notes: string | null
    insuranceCompany: string | null
    insurancePolicyNumber: string | null
    date: string
  }
  patient: {
    id: string
    name: string
    age: number | null
    sex: string | null
    phone: string | null
  }
  doctor: {
    name: string
    specialty: string
  }
  clinic: {
    name: string
    address: string
    phone: string
    logoUrl: string | null
  }
  medications: Array<{
    name: string
    dosage: string
    frequency: string
    duration: string
  }>
}

// ============================================================================
// HELPERS
// ============================================================================

const METHOD_LABELS: Record<string, { label: string; icon: typeof Banknote; color: string }> = {
  cash:      { label: 'نقدي',     icon: Banknote,      color: '#16A34A' },
  card:      { label: 'كارت',    icon: CreditCard,    color: '#2563EB' },
  transfer:  { label: 'تحويل',   icon: ArrowLeftRight, color: '#D97706' },
  insurance: { label: 'تأمين',   icon: ShieldCheck,   color: '#7C3AED' },
  other:     { label: 'أخرى',    icon: Receipt,        color: '#6B7280' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Africa/Cairo',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ar-EG', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Africa/Cairo',
  })
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function FrontdeskInvoicePage() {
  const { paymentId } = useParams<{ paymentId: string }>()
  const router = useRouter()

  const [data, setData] = useState<InvoiceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [smsSending, setSmsSending] = useState(false)
  const [smsSent, setSmsSent] = useState(false)
  const [smsError, setSmsError] = useState('')

  // ── Load invoice data ──
  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/frontdesk/invoice/${paymentId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'فشل تحميل الفاتورة')
      }
      setData(await res.json())
    } catch (e: any) {
      setError(e.message || 'خطأ غير متوقع')
    } finally {
      setLoading(false)
    }
  }, [paymentId])

  useEffect(() => { load() }, [load])

  // ── Send SMS ──
  const sendSms = async () => {
    if (!data) return
    setSmsSending(true)
    setSmsError('')
    try {
      const invoiceUrl = `${window.location.origin}/invoice/${paymentId}`
      const msg = `مرحباً ${data.patient.name}،\nيمكنك الاطلاع على فاتورتك من عيادة ${data.clinic.name}:\n${invoiceUrl}\nرقم الفاتورة: ${data.invoiceNumber}`

      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: data.patient.phone,
          message: msg,
          messageType: 'custom',
        }),
      })

      if (!res.ok) throw new Error('فشل إرسال الرسالة')

      // Mark invoice as SMS-sent
      await fetch(`/api/frontdesk/invoice/${paymentId}`, { method: 'POST' })
      setSmsSent(true)
    } catch (e: any) {
      setSmsError(e.message || 'فشل الإرسال')
    } finally {
      setSmsSending(false)
    }
  }

  // ── Print ──
  const handlePrint = () => window.print()

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-[#16A34A]" />
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center gap-4 p-6">
      <AlertTriangle className="w-10 h-10 text-[#EF4444]" />
      <p className="font-cairo text-[15px] text-[#374151]">{error}</p>
      <button onClick={load} className="font-cairo text-[#16A34A] text-[14px]">إعادة المحاولة</button>
    </div>
  )

  if (!data) return null

  const method = METHOD_LABELS[data.payment.method] || METHOD_LABELS.other
  const MethodIcon = method.icon

  return (
    <div className="min-h-screen bg-[#F9FAFB]" dir="rtl">

      {/* ── Top Bar (hidden in print) ── */}
      <div className="print:hidden sticky top-0 bg-white border-b border-[#E5E7EB] z-10 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F3F4F6] transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-[#374151]" />
        </button>
        <h1 className="font-cairo text-[16px] font-bold text-[#030712]">
          فاتورة — {data.invoiceNumber}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#F3F4F6] rounded-[10px] font-cairo text-[13px] text-[#374151] hover:bg-[#E5E7EB] transition-colors"
          >
            <Printer className="w-4 h-4" />
            طباعة
          </button>
        </div>
      </div>

      {/* ── Invoice Body ── */}
      <div className="max-w-2xl mx-auto p-4 sm:p-6 print:p-0 print:max-w-none">
        <div className="bg-white rounded-[16px] shadow-sm border border-[#E5E7EB] overflow-hidden print:rounded-none print:shadow-none print:border-0">

          {/* ── Header Band ── */}
          <div className="bg-[#16A34A] px-6 py-5 text-white">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-cairo text-[22px] font-bold">{data.clinic.name}</h2>
                {data.clinic.address && (
                  <p className="font-cairo text-[12px] opacity-80 mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{data.clinic.address}
                  </p>
                )}
                {data.clinic.phone && (
                  <p className="font-cairo text-[12px] opacity-80 mt-0.5 flex items-center gap-1">
                    <Phone className="w-3 h-3" />{data.clinic.phone}
                  </p>
                )}
              </div>
              <div className="text-left">
                <p className="font-cairo text-[11px] opacity-70">رقم الفاتورة</p>
                <p className="font-cairo text-[16px] font-bold">{data.invoiceNumber}</p>
                <p className="font-cairo text-[11px] opacity-70 mt-1">التاريخ</p>
                <p className="font-cairo text-[13px]">{formatDate(data.payment.date)}</p>
                <p className="font-cairo text-[11px] opacity-70">{formatTime(data.payment.date)}</p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-5">

            {/* ── Patient + Doctor Row ── */}
            <div className="grid grid-cols-2 gap-4">
              {/* Patient */}
              <div className="bg-[#F9FAFB] rounded-[12px] p-4 border border-[#E5E7EB]">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-[#6B7280]" />
                  <span className="font-cairo text-[11px] text-[#9CA3AF] font-semibold uppercase tracking-wide">المريض</span>
                </div>
                <p className="font-cairo text-[15px] font-bold text-[#030712]">{data.patient.name}</p>
                {(data.patient.age || data.patient.sex) && (
                  <p className="font-cairo text-[12px] text-[#6B7280] mt-0.5">
                    {data.patient.age ? `${data.patient.age} سنة` : ''}
                    {data.patient.age && data.patient.sex ? ' · ' : ''}
                    {data.patient.sex === 'Male' ? 'ذكر' : data.patient.sex === 'Female' ? 'أنثى' : ''}
                  </p>
                )}
                {data.patient.phone && (
                  <p className="font-cairo text-[12px] text-[#6B7280] mt-0.5" dir="ltr">{data.patient.phone}</p>
                )}
              </div>

              {/* Doctor */}
              <div className="bg-[#F9FAFB] rounded-[12px] p-4 border border-[#E5E7EB]">
                <div className="flex items-center gap-2 mb-2">
                  <Stethoscope className="w-4 h-4 text-[#6B7280]" />
                  <span className="font-cairo text-[11px] text-[#9CA3AF] font-semibold uppercase tracking-wide">الطبيب</span>
                </div>
                <p className="font-cairo text-[15px] font-bold text-[#030712]">{data.doctor.name}</p>
                {data.doctor.specialty && (
                  <p className="font-cairo text-[12px] text-[#6B7280] mt-0.5">
                    {translateSpecialty(data.doctor.specialty)}
                  </p>
                )}
              </div>
            </div>

            {/* ── Services / Amount ── */}
            <div className="border border-[#E5E7EB] rounded-[12px] overflow-hidden">
              <div className="bg-[#F9FAFB] px-4 py-2.5 border-b border-[#E5E7EB]">
                <span className="font-cairo text-[12px] font-semibold text-[#6B7280]">تفاصيل الفاتورة</span>
              </div>
              <div className="divide-y divide-[#F3F4F6]">
                {/* Main service row */}
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#DCFCE7] flex items-center justify-center">
                      <Stethoscope className="w-4 h-4 text-[#16A34A]" />
                    </div>
                    <div>
                      <p className="font-cairo text-[14px] font-semibold text-[#030712]">كشف طبي</p>
                      <p className="font-cairo text-[12px] text-[#9CA3AF]">
                        د. {data.doctor.name.replace(/^د\.\s*/, '')} — {formatDate(data.payment.date)}
                      </p>
                    </div>
                  </div>
                  <p className="font-cairo text-[15px] font-bold text-[#030712]">
                    {data.payment.amount.toLocaleString('ar-EG')} ج.م
                  </p>
                </div>

                {/* Notes row (if present) */}
                {data.payment.notes && (
                  <div className="px-4 py-3">
                    <p className="font-cairo text-[12px] text-[#6B7280]">ملاحظات: {data.payment.notes}</p>
                  </div>
                )}
              </div>

              {/* Total row */}
              <div className="bg-[#F0FDF4] px-4 py-3 flex items-center justify-between border-t border-[#DCFCE7]">
                <div>
                  <p className="font-cairo text-[13px] font-semibold text-[#16A34A]">الإجمالي المدفوع</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: `${method.color}15` }}>
                      <MethodIcon className="w-3 h-3" style={{ color: method.color }} />
                    </div>
                    <span className="font-cairo text-[12px]" style={{ color: method.color }}>{method.label}</span>
                  </div>
                </div>
                <p className="font-cairo text-[22px] font-bold text-[#16A34A]">
                  {data.payment.amount.toLocaleString('ar-EG')} ج.م
                </p>
              </div>
            </div>

            {/* ── Insurance Info (if applicable) ── */}
            {(data.payment.method === 'insurance' || data.payment.insuranceCompany) && (
              <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-[12px] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-4 h-4 text-[#7C3AED]" />
                  <span className="font-cairo text-[12px] font-semibold text-[#7C3AED]">بيانات التأمين</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="font-cairo text-[11px] text-[#9CA3AF]">شركة التأمين</p>
                    <p className="font-cairo text-[13px] font-semibold text-[#030712]">
                      {data.payment.insuranceCompany || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="font-cairo text-[11px] text-[#9CA3AF]">رقم البوليصة</p>
                    <p className="font-cairo text-[13px] font-semibold text-[#030712]" dir="ltr">
                      {data.payment.insurancePolicyNumber || '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Medications ── */}
            {data.medications.length > 0 && (
              <div className="border border-[#E5E7EB] rounded-[12px] overflow-hidden">
                <div className="bg-[#F9FAFB] px-4 py-2.5 border-b border-[#E5E7EB] flex items-center gap-2">
                  <Pill className="w-4 h-4 text-[#6B7280]" />
                  <span className="font-cairo text-[12px] font-semibold text-[#6B7280]">الأدوية الموصوفة</span>
                </div>
                <div className="divide-y divide-[#F3F4F6]">
                  {data.medications.map((med, i) => (
                    <div key={i} className="px-4 py-3 flex items-start justify-between">
                      <div>
                        <p className="font-cairo text-[14px] font-semibold text-[#030712]">{med.name}</p>
                        <p className="font-cairo text-[12px] text-[#6B7280]">
                          {[med.dosage, med.frequency, med.duration].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Footer ── */}
            <div className="text-center pt-2 border-t border-[#E5E7EB]">
              <p className="font-cairo text-[11px] text-[#9CA3AF]">
                هذه الفاتورة صادرة إلكترونياً من منظومة MedAssist · {data.clinic.name}
              </p>
              <p className="font-cairo text-[11px] text-[#9CA3AF] mt-0.5">
                رقم الفاتورة: {data.invoiceNumber} · {formatDate(data.payment.date)}
              </p>
            </div>

          </div>
        </div>

        {/* ── SMS Action (hidden in print) ── */}
        <div className="print:hidden mt-4 space-y-3">
          {data.patient.phone ? (
            <button
              onClick={sendSms}
              disabled={smsSending || smsSent}
              className={`w-full h-12 rounded-[12px] flex items-center justify-center gap-2 font-cairo text-[15px] font-semibold transition-all ${
                smsSent
                  ? 'bg-[#DCFCE7] text-[#16A34A] border border-[#86EFAC]'
                  : smsSending
                    ? 'bg-[#E5E7EB] text-[#9CA3AF] cursor-wait'
                    : 'bg-[#16A34A] text-white hover:bg-[#15803D] active:scale-[0.98]'
              }`}
            >
              {smsSending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> جاري الإرسال...</>
              ) : smsSent ? (
                <><CheckCircle2 className="w-4 h-4" /> تم إرسال رابط الفاتورة للمريض</>
              ) : (
                <><MessageCircle className="w-4 h-4" /> إرسال رابط الفاتورة للمريض</>
              )}
            </button>
          ) : (
            <p className="font-cairo text-[12px] text-[#9CA3AF] text-center">
              لا يوجد رقم هاتف مسجل للمريض لإرسال الرابط
            </p>
          )}

          {smsError && (
            <p className="font-cairo text-[12px] text-[#EF4444] text-center">{smsError}</p>
          )}
        </div>
      </div>

      {/* Print-only styles */}
      <style jsx global>{`
        @media print {
          @page { margin: 1.5cm; size: A4; }
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}
