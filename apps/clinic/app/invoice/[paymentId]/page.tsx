'use client'

/**
 * Public invoice page — no authentication required.
 * Patients access this via SMS link to view and print their invoice.
 * URL: /invoice/[paymentId]
 */

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import {
  Loader2, AlertTriangle, Stethoscope, User, Pill,
  MapPin, Phone, Printer, ShieldCheck,
  Banknote, CreditCard, ArrowLeftRight, Receipt
} from 'lucide-react'
import { translateSpecialty } from '@shared/lib/utils/specialty-labels'

// ── Types ─────────────────────────────────────────────────────────────────────

interface InvoiceData {
  invoiceNumber: string
  issuedAt: string
  payment: {
    id: string
    amount: number
    method: string
    notes: string | null
    insuranceCompany: string | null
    insurancePolicyNumber: string | null
    date: string
  }
  patient: { name: string; age: number | null; sex: string | null }
  doctor: { name: string; specialty: string }
  clinic: { name: string; address: string; phone: string }
  medications: Array<{ name: string; dosage: string; frequency: string; duration: string }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, { label: string; icon: typeof Banknote; color: string }> = {
  cash:      { label: 'نقدي',   icon: Banknote,       color: '#16A34A' },
  card:      { label: 'كارت',  icon: CreditCard,     color: '#2563EB' },
  transfer:  { label: 'تحويل', icon: ArrowLeftRight,  color: '#D97706' },
  insurance: { label: 'تأمين', icon: ShieldCheck,    color: '#7C3AED' },
  other:     { label: 'أخرى',  icon: Receipt,         color: '#6B7280' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Africa/Cairo',
  })
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ar-EG', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo',
  })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PublicInvoicePage() {
  const { paymentId } = useParams<{ paymentId: string }>()
  const [data, setData] = useState<InvoiceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/public/invoice/${paymentId}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d) })
      .catch(() => setError('خطأ في تحميل الفاتورة'))
      .finally(() => setLoading(false))
  }, [paymentId])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
      <Loader2 className="w-6 h-6 animate-spin text-[#16A34A]" />
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 bg-[#F9FAFB]" dir="rtl">
      <AlertTriangle className="w-10 h-10 text-[#EF4444]" />
      <p className="font-cairo text-[15px] text-[#374151]">{error || 'الفاتورة غير موجودة'}</p>
    </div>
  )

  const method = METHOD_LABELS[data.payment.method] || METHOD_LABELS.other
  const MethodIcon = method.icon

  return (
    <div className="min-h-screen bg-[#F9FAFB]" dir="rtl">

      {/* Print button (hidden in print) */}
      <div className="print:hidden sticky top-0 bg-white border-b border-[#E5E7EB] z-10 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-cairo text-[15px] font-bold text-[#030712]">{data.clinic.name}</h1>
          <p className="font-cairo text-[11px] text-[#9CA3AF]">فاتورة طبية</p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#F3F4F6] rounded-[10px] font-cairo text-[13px] text-[#374151] hover:bg-[#E5E7EB] transition-colors"
        >
          <Printer className="w-4 h-4" />
          طباعة / PDF
        </button>
      </div>

      <div className="max-w-lg mx-auto p-4 print:p-0 print:max-w-none">
        <div className="bg-white rounded-[16px] shadow-sm border border-[#E5E7EB] overflow-hidden print:rounded-none print:shadow-none print:border-0">

          {/* Green header */}
          <div className="bg-[#16A34A] px-5 py-5 text-white">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-cairo text-[20px] font-bold">{data.clinic.name}</h2>
                {data.clinic.address && (
                  <p className="font-cairo text-[11px] opacity-80 mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{data.clinic.address}
                  </p>
                )}
                {data.clinic.phone && (
                  <p className="font-cairo text-[11px] opacity-80 mt-0.5 flex items-center gap-1">
                    <Phone className="w-3 h-3" />{data.clinic.phone}
                  </p>
                )}
              </div>
              <div className="text-left">
                <p className="font-cairo text-[10px] opacity-70">رقم الفاتورة</p>
                <p className="font-cairo text-[14px] font-bold">{data.invoiceNumber}</p>
                <p className="font-cairo text-[10px] opacity-70 mt-1">{formatDate(data.payment.date)}</p>
                <p className="font-cairo text-[10px] opacity-70">{formatTime(data.payment.date)}</p>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-4">

            {/* Patient + Doctor */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#F9FAFB] rounded-[10px] p-3 border border-[#E5E7EB]">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <User className="w-3.5 h-3.5 text-[#9CA3AF]" />
                  <span className="font-cairo text-[10px] text-[#9CA3AF] font-semibold">المريض</span>
                </div>
                <p className="font-cairo text-[14px] font-bold text-[#030712]">{data.patient.name}</p>
                {(data.patient.age || data.patient.sex) && (
                  <p className="font-cairo text-[11px] text-[#6B7280]">
                    {data.patient.age ? `${data.patient.age} سنة` : ''}
                    {data.patient.age && data.patient.sex ? ' · ' : ''}
                    {data.patient.sex === 'Male' ? 'ذكر' : data.patient.sex === 'Female' ? 'أنثى' : ''}
                  </p>
                )}
              </div>
              <div className="bg-[#F9FAFB] rounded-[10px] p-3 border border-[#E5E7EB]">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Stethoscope className="w-3.5 h-3.5 text-[#9CA3AF]" />
                  <span className="font-cairo text-[10px] text-[#9CA3AF] font-semibold">الطبيب</span>
                </div>
                <p className="font-cairo text-[14px] font-bold text-[#030712]">{data.doctor.name}</p>
                {data.doctor.specialty && (
                  <p className="font-cairo text-[11px] text-[#6B7280]">{translateSpecialty(data.doctor.specialty)}</p>
                )}
              </div>
            </div>

            {/* Services + Total */}
            <div className="border border-[#E5E7EB] rounded-[12px] overflow-hidden">
              <div className="bg-[#F9FAFB] px-4 py-2 border-b border-[#E5E7EB]">
                <span className="font-cairo text-[11px] font-semibold text-[#6B7280]">تفاصيل الفاتورة</span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#DCFCE7] flex items-center justify-center">
                    <Stethoscope className="w-3.5 h-3.5 text-[#16A34A]" />
                  </div>
                  <p className="font-cairo text-[13px] font-semibold text-[#030712]">كشف طبي</p>
                </div>
                <p className="font-cairo text-[14px] font-bold text-[#030712]">
                  {data.payment.amount.toLocaleString('ar-EG')} ج.م
                </p>
              </div>
              {data.payment.notes && (
                <div className="px-4 pb-2">
                  <p className="font-cairo text-[11px] text-[#9CA3AF]">ملاحظات: {data.payment.notes}</p>
                </div>
              )}
              {/* Total */}
              <div className="bg-[#F0FDF4] px-4 py-3 flex items-center justify-between border-t border-[#DCFCE7]">
                <div>
                  <p className="font-cairo text-[12px] font-semibold text-[#16A34A]">الإجمالي المدفوع</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <MethodIcon className="w-3 h-3" style={{ color: method.color }} />
                    <span className="font-cairo text-[11px]" style={{ color: method.color }}>{method.label}</span>
                  </div>
                </div>
                <p className="font-cairo text-[20px] font-bold text-[#16A34A]">
                  {data.payment.amount.toLocaleString('ar-EG')} ج.م
                </p>
              </div>
            </div>

            {/* Insurance */}
            {(data.payment.method === 'insurance' || data.payment.insuranceCompany) && (
              <div className="bg-[#F5F3FF] border border-[#DDD6FE] rounded-[12px] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-4 h-4 text-[#7C3AED]" />
                  <span className="font-cairo text-[12px] font-semibold text-[#7C3AED]">بيانات التأمين</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="font-cairo text-[11px] text-[#9CA3AF]">شركة التأمين</p>
                    <p className="font-cairo text-[13px] font-semibold text-[#030712]">{data.payment.insuranceCompany || '—'}</p>
                  </div>
                  <div>
                    <p className="font-cairo text-[11px] text-[#9CA3AF]">رقم البوليصة</p>
                    <p className="font-cairo text-[13px] font-semibold text-[#030712]" dir="ltr">{data.payment.insurancePolicyNumber || '—'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Medications */}
            {data.medications.length > 0 && (
              <div className="border border-[#E5E7EB] rounded-[12px] overflow-hidden">
                <div className="bg-[#F9FAFB] px-4 py-2 border-b border-[#E5E7EB] flex items-center gap-2">
                  <Pill className="w-3.5 h-3.5 text-[#6B7280]" />
                  <span className="font-cairo text-[11px] font-semibold text-[#6B7280]">الأدوية الموصوفة</span>
                </div>
                {data.medications.map((med, i) => (
                  <div key={i} className="px-4 py-2.5 border-b border-[#F3F4F6] last:border-0">
                    <p className="font-cairo text-[13px] font-semibold text-[#030712]">{med.name}</p>
                    <p className="font-cairo text-[11px] text-[#9CA3AF]">
                      {[med.dosage, med.frequency, med.duration].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="text-center pt-1 border-t border-[#E5E7EB]">
              <p className="font-cairo text-[10px] text-[#9CA3AF]">
                فاتورة رقم {data.invoiceNumber} · {data.clinic.name} · {formatDate(data.payment.date)}
              </p>
              <p className="font-cairo text-[10px] text-[#9CA3AF] mt-0.5">
                صادرة إلكترونياً من منظومة MedAssist
              </p>
            </div>
          </div>
        </div>
      </div>

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
