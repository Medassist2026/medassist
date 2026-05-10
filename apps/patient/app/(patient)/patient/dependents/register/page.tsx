'use client'

/**
 * /patient/dependents/register — B07 Phase F (Section 4).
 *
 * Page that hosts the DependentRegistrationForm. Top-level layout uses
 * PatientHeader in showBack mode + AccountSwitcher in the action slot
 * (Phase F MVP only renders the switcher on Phase F-new pages and the
 * dashboard; see Phase F finding #8).
 *
 * After success: the form auto-switches active context to the new minor's
 * gp via the AccountProvider, and we redirect to /patient/dashboard with
 * `?as=<minorGpId>`.
 */

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PatientHeader } from '@ui-clinic/components/patient/PatientHeader'
import { AccountSwitcher } from '@patient/components/AccountSwitcher'
import { DependentRegistrationForm } from '@patient/components/dependents/DependentRegistrationForm'

export default function DependentRegisterPage() {
  const router = useRouter()
  const [toast, setToast] = useState<string | null>(null)

  const handleSuccess = useCallback(
    ({ minorGlobalPatientId, displayName }: {
      minorGlobalPatientId: string
      displayName: string
    }) => {
      setToast(`تم تسجيل ${displayName} بنجاح`)
      // Brief toast then redirect with new context active
      setTimeout(() => {
        router.push(`/patient/dashboard?as=${minorGlobalPatientId}`)
      }, 900)
    },
    [router]
  )

  return (
    <div className="font-cairo">
      <PatientHeader
        title="تسجيل تابع"
        showBack
        action={<AccountSwitcher />}
      />

      <div className="px-4 pt-4 pb-24">
        <div className="mb-4">
          <h2 className="font-cairo text-[18px] font-bold text-[#030712] mb-1">
            تسجيل تابع جديد
          </h2>
          <p className="font-cairo text-[12px] text-[#6B7280] leading-[18px]">
            سجّل طفلك ليتم إدارة رعايته الصحية معك. يمكنك بعد التسجيل تبديل
            الحساب من أعلى الشاشة لعرض سجلاته.
          </p>
        </div>

        <DependentRegistrationForm onSuccess={handleSuccess} />
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#16A34A] text-white font-cairo text-[13px] font-medium px-4 py-2.5 rounded-[10px] shadow-lg z-50"
        >
          {toast}
        </div>
      )}
    </div>
  )
}
