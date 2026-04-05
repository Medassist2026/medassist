'use client'

// ============================================================================
// DRUG–DRUG INTERACTION WARNING MODAL
// B16: Orange blocking modal for major DDI — shown when a newly prescribed drug
// has a major/contraindicated interaction with an existing medication.
// Design mirrors AllergyWarning.tsx but with orange colour scheme.
// ============================================================================

import type { DDISeverityUI } from '../../lib/data/drug-interactions'

interface InteractionWarningProps {
  /** Display name of the drug being added */
  drugA: string
  /** Display name of the existing drug it conflicts with */
  drugB: string
  /** Severity — 'major' shows this modal; 'moderate' uses the inline banner instead */
  severity: DDISeverityUI
  /** Arabic message explaining the interaction */
  messageAr: string
  /** Doctor chose to proceed anyway — drug stays, modal closes */
  onProceed: () => void
  /** Doctor removes the new drug — modal closes, last med is removed by parent */
  onCancel: () => void
}

export function InteractionWarning({
  drugA,
  drugB,
  messageAr,
  onProceed,
  onCancel,
}: InteractionWarningProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-[16px] mx-4 max-w-[380px] w-full shadow-xl overflow-hidden">

        {/* ── Orange header ─────────────────────────────────────────────── */}
        <div className="bg-[#FFF7ED] px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#EA580C] flex items-center justify-center flex-shrink-0">
            {/* Warning triangle icon */}
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="font-cairo font-bold text-[16px] text-[#C2410C]">تحذير تفاعل دوائي</h3>
            <p className="font-cairo text-[12px] text-[#9A3412] mt-0.5">Drug–Drug Interaction</p>
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="px-5 py-4 space-y-2">
          {/* Drug pair */}
          <p className="font-cairo text-[14px] text-[#030712] leading-relaxed">
            <span className="font-bold text-[#C2410C]">{drugA}</span>
            {' '}و{' '}
            <span className="font-bold text-[#C2410C]">{drugB}</span>
            {' '}لا يُنصح بوصفهما معاً.
          </p>
          {/* Arabic explanation */}
          <p className="font-cairo text-[13px] text-[#374151] leading-relaxed bg-[#FFF7ED] rounded-[8px] px-3 py-2 border border-[#FED7AA]">
            {messageAr}
          </p>
        </div>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-[#EA580C] text-white rounded-[10px] font-cairo font-bold text-[14px] hover:bg-[#C2410C] transition-colors"
          >
            إزالة الدواء الجديد
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
