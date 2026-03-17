'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { SessionForm } from '@shared/components/clinical/SessionForm'
import { ar } from '@shared/lib/i18n/ar'
import { Suspense } from 'react'

function SessionPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedPatientId = searchParams.get('patientId') || undefined

  return (
    <div className="max-w-md mx-auto pb-4" dir="rtl">
      {/* ===== PAGE HEADER — Back arrow + title + clinic pill ===== */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        {/* Right side (RTL): Back arrow + Title */}
        <div className="flex items-center gap-3">
          {/* Back button — matches Figma back arrow pattern */}
          <button
            onClick={() => router.back()}
            className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center"
          >
            <ChevronRight className="w-[20px] h-[20px] text-[#030712]" />
          </button>
          {/* Title — Cairo 18px/22px weight 600 */}
          <h1 className="font-cairo text-[18px] leading-[22px] font-semibold text-[#030712]">
            {ar.newSession}
          </h1>
        </div>
      </div>

      {/* ===== SESSION FORM ===== */}
      <SessionForm preselectedPatientId={preselectedPatientId} />
    </div>
  )
}

export default function ClinicalSessionPage() {
  return (
    <Suspense fallback={
      <div className="max-w-md mx-auto p-4 text-center" dir="rtl">
        <p className="font-cairo text-[14px] text-[#4B5563]">{ar.loading}</p>
      </div>
    }>
      <SessionPageContent />
    </Suspense>
  )
}
