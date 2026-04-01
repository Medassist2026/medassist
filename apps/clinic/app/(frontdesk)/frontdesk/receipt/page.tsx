'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Printer, ChevronRight, Building2, Receipt } from 'lucide-react'

// ============================================================================
// RECEIPT PAGE — Printable Arabic patient receipt
// URL params: patientName, doctorName, clinicName, amount, method, date, invoiceNum
// Opened after successful payment in check-in or payments flow.
// ============================================================================

const METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي',
  card: 'بطاقة بنكية',
  transfer: 'تحويل بنكي',
  insurance: 'تأمين طبي',
}

function ReceiptContent() {
  const router = useRouter()
  const params = useSearchParams()

  const patientName = params.get('patientName') || 'المريض'
  const doctorName = params.get('doctorName') || ''
  const clinicName = params.get('clinicName') || 'العيادة'
  const amount = params.get('amount') || '0'
  const method = params.get('method') || 'cash'
  const dateParam = params.get('date') || new Date().toISOString()
  const invoiceNum = params.get('invoiceNum') || `${Date.now().toString().slice(-6)}`
  const insuranceInfo = params.get('insuranceInfo') || ''

  const formattedDate = new Date(dateParam).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Africa/Cairo',
  })
  const formattedTime = new Date(dateParam).toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Cairo',
  })

  return (
    <div dir="rtl" className="min-h-screen bg-[#F9FAFB] font-cairo">
      {/* ── Navigation bar (hidden on print) ── */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-[#E5E7EB] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full border border-[#E5E7EB] flex items-center justify-center"
          >
            <ChevronRight className="w-5 h-5 text-[#374151]" />
          </button>
          <h1 className="font-cairo text-[17px] font-bold text-[#030712]">إيصال الدفع</h1>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 h-9 px-4 rounded-[8px] bg-[#16A34A] text-white font-cairo text-[13px] font-bold"
        >
          <Printer className="w-4 h-4" />
          طباعة
        </button>
      </div>

      {/* ── Receipt card ── */}
      <div className="max-w-sm mx-auto p-4 pt-6 print:p-0 print:pt-0 print:max-w-none">
        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden print:rounded-none print:border-0 print:shadow-none"
             style={{ boxShadow: '0 4px 24px rgba(15,23,42,0.08)' }}>

          {/* Header strip */}
          <div className="bg-[#16A34A] px-6 py-5 text-center">
            <div className="flex justify-center mb-2">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Receipt className="w-6 h-6 text-white" />
              </div>
            </div>
            <h2 className="font-cairo text-[18px] font-bold text-white">{clinicName}</h2>
            {doctorName && (
              <p className="font-cairo text-[13px] text-green-100 mt-0.5">د. {doctorName.replace(/^د\.\s*/, '')}</p>
            )}
          </div>

          {/* Invoice meta */}
          <div className="px-5 py-3 bg-[#F9FAFB] border-b border-dashed border-[#D1FAE5] flex items-center justify-between">
            <div>
              <p className="font-cairo text-[11px] text-[#9CA3AF]">رقم الإيصال</p>
              <p className="font-cairo text-[13px] font-bold text-[#374151]">#{invoiceNum}</p>
            </div>
            <div className="text-left">
              <p className="font-cairo text-[11px] text-[#9CA3AF]">{formattedDate}</p>
              <p className="font-cairo text-[12px] text-[#6B7280]">{formattedTime}</p>
            </div>
          </div>

          {/* Patient + payment details */}
          <div className="px-5 py-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-cairo text-[13px] text-[#6B7280]">اسم المريض</span>
              <span className="font-cairo text-[14px] font-bold text-[#030712]">{patientName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-cairo text-[13px] text-[#6B7280]">طريقة الدفع</span>
              <span className="font-cairo text-[13px] font-semibold text-[#374151]">
                {METHOD_LABELS[method] || method}
              </span>
            </div>
            {insuranceInfo && (
              <div className="flex justify-between items-start">
                <span className="font-cairo text-[13px] text-[#6B7280]">بيانات التأمين</span>
                <span className="font-cairo text-[12px] text-[#7C3AED] text-left max-w-[55%]">{insuranceInfo}</span>
              </div>
            )}
            <div className="h-px bg-dashed border-t border-dashed border-[#E5E7EB]" />
            <div className="flex justify-between items-center">
              <span className="font-cairo text-[15px] font-bold text-[#030712]">الإجمالي</span>
              <span className="font-cairo text-[22px] font-black text-[#16A34A]">
                {Number(amount).toLocaleString('ar-EG')} ج.م
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 pt-1 text-center">
            <div className="bg-[#F0FDF4] rounded-xl py-3 px-4">
              <p className="font-cairo text-[12px] text-[#16A34A] font-medium">✓ تم استلام المبلغ بالكامل</p>
              <p className="font-cairo text-[11px] text-[#6B7280] mt-1">شكراً لزيارتكم — نتمنى لكم الشفاء العاجل</p>
            </div>
          </div>
        </div>

        {/* Print-only separator line */}
        <div className="hidden print:block mt-8 pt-4 border-t border-dashed border-[#9CA3AF] text-center">
          <p className="font-cairo text-[11px] text-[#9CA3AF]">هذا الإيصال دليل على الدفع — يُرجى الاحتفاظ به</p>
        </div>
      </div>
    </div>
  )
}

export default function ReceiptPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <p className="font-cairo text-[14px] text-[#6B7280]">جاري التحميل...</p>
      </div>
    }>
      <ReceiptContent />
    </Suspense>
  )
}
