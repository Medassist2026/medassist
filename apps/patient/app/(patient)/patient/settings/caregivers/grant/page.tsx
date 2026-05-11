'use client'

/**
 * /patient/settings/caregivers/grant — B07 Phase F.5 (Section 5).
 *
 * Hosts the DelegationGrantForm for the principal-side grant flow.
 * Reverses Phase F Decision 6 (which deferred the grant form entirely).
 *
 * Flow:
 *   1. Phone lookup via POST /api/patient/lookup-by-phone
 *   2. Capability + expiry selection via POST /api/patient/delegations
 *
 * Success: toast + redirect to /patient/settings/caregivers (list view).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { PatientHeader } from '@ui-clinic/components/patient/PatientHeader'
import { AccountSwitcher } from '@patient/components/AccountSwitcher'
import { DelegationGrantForm } from '@patient/components/delegations/DelegationGrantForm'

export default function CaregiverGrantPage() {
  const router = useRouter()
  const [toast, setToast] = useState<string | null>(null)

  return (
    <div className="font-cairo">
      <PatientHeader
        title="إضافة مقدم رعاية"
        showBack
        leadingAction={<AccountSwitcher />}
      />

      <div className="px-4 pt-4 pb-24 max-w-md mx-auto">
        <div className="mb-4">
          <h2 className="font-cairo text-[18px] font-bold text-[#030712]">
            دعوة مقدم رعاية جديد
          </h2>
          <p className="font-cairo text-[12px] text-[#6B7280] mt-0.5 leading-[18px]">
            بعد التأكد، ستظهر دعوتك في حساب مقدم الرعاية لقبولها. يمكنك
            إلغاء التفويض في أي وقت من قائمة مقدمي الرعاية.
          </p>
        </div>

        <DelegationGrantForm
          onSuccess={({ delegateDisplayName }) => {
            const name = delegateDisplayName?.trim() || 'مقدم الرعاية'
            setToast(
              `تم إنشاء التفويض. سيستلم ${name} الدعوة عند فتح التطبيق.`
            )
            setTimeout(() => {
              router.push('/patient/settings/caregivers')
            }, 1200)
          }}
          onCancel={() => router.push('/patient/settings/caregivers')}
        />
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#16A34A] text-white px-4 py-2.5 rounded-full font-cairo text-[13px] font-medium flex items-center gap-2 shadow-lg z-50">
          <CheckCircle2 className="w-4 h-4" strokeWidth={2.5} />
          {toast}
        </div>
      )}
    </div>
  )
}
