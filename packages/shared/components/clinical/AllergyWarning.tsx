'use client'

// ============================================================================
// ALLERGY CROSS-CHECK WARNING
// Red modal that appears when a prescribed drug conflicts with patient allergies
// ============================================================================

interface AllergyWarningProps {
  drugName: string
  allergyName: string
  familyName: string
  onProceed: () => void
  onCancel: () => void
}

export function AllergyWarning({ drugName, allergyName, familyName, onProceed, onCancel }: AllergyWarningProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-[16px] mx-4 max-w-[360px] w-full shadow-xl overflow-hidden">
        {/* Red header */}
        <div className="bg-[#FEE2E2] px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#DC2626] flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="font-cairo font-bold text-[16px] text-[#DC2626]">تحذير حساسية</h3>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="font-cairo text-[14px] text-[#030712] leading-relaxed">
            المريض لديه <span className="font-bold text-[#DC2626]">حساسية من {allergyName}</span>.
          </p>
          <p className="font-cairo text-[14px] text-[#030712] leading-relaxed mt-2">
            <span className="font-bold">{drugName}</span> ينتمي لعائلة <span className="font-bold text-[#DC2626]">{familyName}</span> وقد يسبب رد فعل تحسسي.
          </p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-[#DC2626] text-white rounded-[10px] font-cairo font-bold text-[14px] hover:bg-red-700 transition-colors"
          >
            إزالة الدواء
          </button>
          <button
            onClick={onProceed}
            className="flex-1 py-3 border border-[#E5E7EB] text-[#4B5563] rounded-[10px] font-cairo font-medium text-[14px] hover:bg-[#F3F4F6] transition-colors"
          >
            متابعة رغم ذلك
          </button>
        </div>
      </div>
    </div>
  )
}
