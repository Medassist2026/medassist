'use client'

import { useState, useEffect } from 'react'
import type { MedicationEntry } from './MedicationChips'

// ============================================================================
// TYPES
// ============================================================================

export interface PrescriptionTemplate {
  id: string
  name: string
  medications: MedicationEntry[]
  createdBy?: string
}

interface TemplateModalProps {
  onApply: (template: PrescriptionTemplate) => void
  onClose: () => void
  currentMedications?: MedicationEntry[]  // passed from session to allow saving
}

// ============================================================================
// DEFAULT TEMPLATES (common Egyptian prescriptions)
// ============================================================================

export const DEFAULT_TEMPLATES: PrescriptionTemplate[] = [
  {
    id: 'tpl_cold',
    name: 'نزلة برد',
    medications: [
      {
        name: 'باراسيتامول 500 مجم',
        genericName: 'Paracetamol',
        strength: '500mg',
        form: 'قرص',
        dosageCount: '1',
        frequency: 'كل 8 ساعات',
        timings: ['صباح', 'ظهر', 'مساء'],
        instructions: 'بعد الأكل',
      },
      {
        name: 'كونجستال',
        genericName: 'Pseudoephedrine + Chlorpheniramine',
        form: 'قرص',
        dosageCount: '1',
        frequency: 'كل 8 ساعات',
        timings: ['صباح', 'ظهر', 'مساء'],
      },
      {
        name: 'بروسبان شراب',
        genericName: 'Ivy leaf extract',
        form: 'شراب',
        dosageCount: '1',
        frequency: 'كل 8 ساعات',
        timings: ['صباح', 'ظهر', 'مساء'],
      },
    ],
  },
  {
    id: 'tpl_backpain',
    name: 'ألم ظهر',
    medications: [
      {
        name: 'كيتوفان 200 مجم',
        genericName: 'Ketoprofen',
        strength: '200mg',
        form: 'كبسولة',
        dosageCount: '1',
        frequency: 'كل 12 ساعة',
        timings: ['صباح', 'مساء'],
        instructions: 'بعد الأكل',
      },
      {
        name: 'ميوفين',
        genericName: 'Ibuprofen + Orphenadrine',
        form: 'كبسولة',
        dosageCount: '1',
        frequency: 'كل 12 ساعة',
        timings: ['صباح', 'مساء'],
        instructions: 'بعد الأكل',
      },
    ],
  },
  {
    id: 'tpl_uti',
    name: 'التهاب مسالك بولية',
    medications: [
      {
        name: 'سيبروفلوكساسين 500 مجم',
        genericName: 'Ciprofloxacin',
        strength: '500mg',
        form: 'قرص',
        dosageCount: '1',
        frequency: 'كل 12 ساعة',
        timings: ['صباح', 'مساء'],
        instructions: 'قبل الأكل',
      },
      {
        name: 'يوفامين ريتارد',
        genericName: 'Nitrofurantoin',
        form: 'كبسولة',
        dosageCount: '1',
        frequency: 'كل 12 ساعة',
        timings: ['صباح', 'مساء'],
        instructions: 'بعد الأكل',
      },
    ],
  },
  {
    id: 'tpl_bp',
    name: 'ضغط الدم',
    medications: [
      {
        name: 'كونكور 5 مجم',
        genericName: 'Bisoprolol',
        strength: '5mg',
        form: 'قرص',
        dosageCount: '1',
        frequency: 'يومياً',
        timings: ['صباح'],
      },
      {
        name: 'إكسفورج 5/160',
        genericName: 'Amlodipine + Valsartan',
        form: 'قرص',
        dosageCount: '1',
        frequency: 'يومياً',
        timings: ['صباح'],
      },
    ],
  },
  {
    id: 'tpl_diabetes',
    name: 'السكري',
    medications: [
      {
        name: 'جلوكوفاج 1000 مجم',
        genericName: 'Metformin',
        strength: '1000mg',
        form: 'قرص',
        dosageCount: '1',
        frequency: 'كل 12 ساعة',
        timings: ['صباح', 'مساء'],
        instructions: 'بعد الأكل',
      },
      {
        name: 'أماريل 2 مجم',
        genericName: 'Glimepiride',
        strength: '2mg',
        form: 'قرص',
        dosageCount: '1',
        frequency: 'يومياً',
        timings: ['صباح'],
        instructions: 'قبل الأكل',
      },
    ],
  },
  {
    id: 'tpl_painkillers',
    name: 'مسكنات',
    medications: [
      {
        name: 'بروفين 600 مجم',
        genericName: 'Ibuprofen',
        strength: '600mg',
        form: 'قرص',
        dosageCount: '1',
        frequency: 'كل 8 ساعات',
        timings: ['صباح', 'ظهر', 'مساء'],
        instructions: 'بعد الأكل',
      },
    ],
  },
]

// ============================================================================
// TEMPLATE MODAL COMPONENT
// ============================================================================

const ONBOARDING_KEY    = 'medassist_templates_hint_dismissed'
const HIDDEN_DEFAULTS_KEY = 'medassist_hidden_defaults'

export function TemplateModal({ onApply, onClose, currentMedications }: TemplateModalProps) {
  const [search, setSearch]                 = useState('')
  const [doctorTemplates, setDoctorTemplates] = useState<PrescriptionTemplate[]>([])
  const [hiddenDefaultIds, setHiddenDefaultIds] = useState<string[]>([])

  // Save-as-template state
  const [saveName, setSaveName]   = useState('')
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // One-time onboarding hint — dismissed permanently via localStorage
  const [showHint, setShowHint] = useState(false)
  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARDING_KEY)) setShowHint(true)
      // Load hidden default template IDs set from the templates settings page
      const hidden = JSON.parse(localStorage.getItem(HIDDEN_DEFAULTS_KEY) || '[]')
      setHiddenDefaultIds(Array.isArray(hidden) ? hidden : [])
    } catch { /* SSR / private browsing — skip */ }
  }, [])
  const dismissHint = () => {
    setShowHint(false)
    try { localStorage.setItem(ONBOARDING_KEY, '1') } catch { /* ignore */ }
  }

  // Load doctor's custom templates
  useEffect(() => {
    loadTemplates()
  }, [])

  async function loadTemplates() {
    try {
      const res = await fetch('/api/clinical/templates')
      if (res.ok) {
        const data = await res.json()
        setDoctorTemplates(data.templates || [])
      }
    } catch { /* use defaults only */ }
  }

  async function saveCurrentAsTemplate() {
    if (!saveName.trim()) { setSaveError('أدخل اسماً للقالب'); return }
    if (!currentMedications || currentMedications.length === 0) { setSaveError('لا توجد أدوية لحفظها'); return }
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch('/api/clinical/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveName.trim(), medications: currentMedications }),
      })
      if (!res.ok) {
        const d = await res.json()
        setSaveError(d.error || 'فشل الحفظ')
      } else {
        setSaveSuccess(true)
        setSaveName('')
        await loadTemplates()
        setTimeout(() => setSaveSuccess(false), 2000)
      }
    } catch {
      setSaveError('حدث خطأ. حاول مرة أخرى')
    } finally {
      setSaving(false)
    }
  }

  async function deleteTemplate(id: string) {
    setDeletingId(id)
    try {
      await fetch(`/api/clinical/templates?id=${id}`, { method: 'DELETE' })
      setDoctorTemplates(prev => prev.filter(t => t.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  // Deduplicate — doctor templates take priority; hidden defaults are excluded
  const doctorNames = new Set(doctorTemplates.map(t => t.name))
  const visibleDefaults = DEFAULT_TEMPLATES.filter(
    t => !doctorNames.has(t.name) && !hiddenDefaultIds.includes(t.id)
  )
  const deduped = [...doctorTemplates, ...visibleDefaults]
  const filtered = search
    ? deduped.filter(t => t.name.includes(search))
    : deduped

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="bg-white rounded-t-[20px] w-full max-w-md max-h-[80vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <h3 className="font-cairo font-bold text-[16px] text-[#030712]">قوالب الروشتة</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center">
            <svg className="w-4 h-4 text-[#4B5563]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* One-time onboarding hint */}
        {showHint && (
          <div className="mx-5 mt-3 mb-1 flex items-start gap-2 bg-[#EFF6FF] border border-[#BFDBFE] rounded-[10px] px-3 py-2.5">
            <svg className="w-4 h-4 text-[#3B82F6] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="font-cairo text-[12px] font-semibold text-[#1E40AF]">كيف تستخدم القوالب؟</p>
              <p className="font-cairo text-[11px] text-[#3B82F6] mt-0.5 leading-relaxed">
                أضف أدوية للروشتة ثم افتح هذه النافذة لحفظها كقالب باسم مخصص.
                لحذف قالب خاص بك، مرر عليه وستظهر علامة الحذف.
              </p>
            </div>
            <button onClick={dismissHint} className="text-[#93C5FD] hover:text-[#3B82F6] flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Save current prescription as template */}
        {currentMedications && currentMedications.length > 0 && (
          <div className="px-5 pt-4 pb-3 bg-[#F0FDF4] border-b border-[#BBF7D0]">
            <p className="font-cairo text-[12px] font-semibold text-[#166534] mb-2">
              💾 احفظ الروشتة الحالية كقالب ({currentMedications.length} {currentMedications.length === 1 ? 'دواء' : 'أدوية'})
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={saveName}
                onChange={(e) => { setSaveName(e.target.value); setSaveError(''); setSaveSuccess(false) }}
                onKeyDown={(e) => e.key === 'Enter' && saveCurrentAsTemplate()}
                placeholder="اسم القالب مثلاً: نزلة برد شتوية"
                className="flex-1 px-3 py-2 border border-[#BBF7D0] rounded-[8px] text-[13px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E] bg-white"
              />
              <button
                onClick={saveCurrentAsTemplate}
                disabled={saving || !saveName.trim()}
                className="px-3 py-2 bg-[#16A34A] text-white text-[12px] font-cairo font-semibold rounded-[8px] disabled:opacity-50 hover:bg-[#15803d] transition-colors whitespace-nowrap"
              >
                {saving ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : saveSuccess ? '✓ تم' : 'حفظ'}
              </button>
            </div>
            {saveError && <p className="mt-1 font-cairo text-[11px] text-[#DC2626]">{saveError}</p>}
          </div>
        )}

        {/* Search */}
        <div className="px-5 py-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث عن قالب..."
            className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[14px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E] bg-[#F9FAFB]"
          />
        </div>

        {/* Template List */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">

          {/* Doctor custom templates section header */}
          {doctorTemplates.length > 0 && (
            <p className="font-cairo text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide pb-1">قوالبك</p>
          )}
          {doctorTemplates
            .filter(t => !search || t.name.includes(search))
            .map((template) => (
            <div key={template.id} className="group relative">
              <button
                onClick={() => onApply(template)}
                className="w-full text-right p-3.5 bg-[#F0FDF4] rounded-[12px] hover:bg-[#DCFCE7] transition-colors border border-[#BBF7D0] hover:border-[#86EFAC] pr-10"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#16A34A] flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-cairo font-bold text-[14px] text-[#030712]">{template.name}</div>
                    <div className="font-cairo text-[11px] text-[#4B5563]">{template.medications.length} أدوية</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {template.medications.slice(0, 3).map((m, j) => (
                    <span key={j} className="px-2 py-0.5 bg-white border border-[#BBF7D0] rounded-full font-cairo text-[10px] text-[#4B5563]">
                      {m.name.split(' ')[0]}
                    </span>
                  ))}
                  {template.medications.length > 3 && (
                    <span className="px-2 py-0.5 bg-white border border-[#E5E7EB] rounded-full font-cairo text-[10px] text-[#9CA3AF]">
                      +{template.medications.length - 3}
                    </span>
                  )}
                </div>
              </button>
              {/* Delete button — absolute positioned */}
              <button
                onClick={() => deleteTemplate(template.id)}
                disabled={deletingId === template.id}
                className="absolute top-3 left-3 w-6 h-6 rounded-full bg-white border border-[#FCA5A5] text-[#DC2626] flex items-center justify-center hover:bg-[#FEE2E2] transition-colors opacity-0 group-hover:opacity-100"
                title="حذف القالب"
              >
                {deletingId === template.id ? (
                  <span className="inline-block w-3 h-3 border border-[#DC2626] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          ))}

          {/* Default templates section */}
          {DEFAULT_TEMPLATES.filter(t => !doctorNames.has(t.name) && (!search || t.name.includes(search))).length > 0 && (
            <p className="font-cairo text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide pb-1 pt-2">قوالب افتراضية</p>
          )}
          {DEFAULT_TEMPLATES
            .filter(t => !doctorNames.has(t.name) && (!search || t.name.includes(search)))
            .map((template) => (
            <button
              key={template.id}
              onClick={() => onApply(template)}
              className="w-full text-right p-3.5 bg-[#F9FAFB] rounded-[12px] hover:bg-[#F3F4F6] transition-colors border border-transparent hover:border-[#E5E7EB]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#DCFCE7] flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-[#16A34A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-cairo font-bold text-[14px] text-[#030712]">{template.name}</div>
                    <div className="font-cairo text-[11px] text-[#4B5563]">{template.medications.length} أدوية</div>
                  </div>
                </div>
                <span className="font-cairo text-[11px] font-medium text-[#9CA3AF]">تطبيق</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {template.medications.slice(0, 3).map((m, j) => (
                  <span key={j} className="px-2 py-0.5 bg-white border border-[#E5E7EB] rounded-full font-cairo text-[10px] text-[#4B5563]">
                    {m.name.split(' ')[0]}
                  </span>
                ))}
              </div>
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="py-8 text-center">
              <p className="font-cairo text-[14px] text-[#4B5563]">لا توجد قوالب مطابقة</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
