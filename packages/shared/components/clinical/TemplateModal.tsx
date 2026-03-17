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
}

// ============================================================================
// DEFAULT TEMPLATES (common Egyptian prescriptions)
// ============================================================================

const DEFAULT_TEMPLATES: PrescriptionTemplate[] = [
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
        frequency: '3×',
        timings: ['صباح', 'ظهر', 'مساء'],
        instructions: 'بعد الأكل',
      },
      {
        name: 'كونجستال',
        genericName: 'Pseudoephedrine + Chlorpheniramine',
        form: 'قرص',
        dosageCount: '1',
        frequency: '3×',
        timings: ['صباح', 'ظهر', 'مساء'],
      },
      {
        name: 'بروسبان شراب',
        genericName: 'Ivy leaf extract',
        form: 'شراب',
        dosageCount: '1',
        frequency: '3×',
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
        frequency: '2×',
        timings: ['صباح', 'مساء'],
        instructions: 'بعد الأكل',
      },
      {
        name: 'ميوفين',
        genericName: 'Ibuprofen + Orphenadrine',
        form: 'كبسولة',
        dosageCount: '1',
        frequency: '2×',
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
        frequency: '2×',
        timings: ['صباح', 'مساء'],
        instructions: 'قبل الأكل',
      },
      {
        name: 'يوفامين ريتارد',
        genericName: 'Nitrofurantoin',
        form: 'كبسولة',
        dosageCount: '1',
        frequency: '2×',
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
        frequency: '1×',
        timings: ['صباح'],
      },
      {
        name: 'إكسفورج 5/160',
        genericName: 'Amlodipine + Valsartan',
        form: 'قرص',
        dosageCount: '1',
        frequency: '1×',
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
        frequency: '2×',
        timings: ['صباح', 'مساء'],
        instructions: 'بعد الأكل',
      },
      {
        name: 'أماريل 2 مجم',
        genericName: 'Glimepiride',
        strength: '2mg',
        form: 'قرص',
        dosageCount: '1',
        frequency: '1×',
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
        frequency: '3×',
        timings: ['صباح', 'ظهر', 'مساء'],
        instructions: 'بعد الأكل',
      },
    ],
  },
]

// ============================================================================
// TEMPLATE MODAL COMPONENT
// ============================================================================

export function TemplateModal({ onApply, onClose }: TemplateModalProps) {
  const [search, setSearch] = useState('')
  const [doctorTemplates, setDoctorTemplates] = useState<PrescriptionTemplate[]>([])

  // Load doctor's custom templates
  useEffect(() => {
    async function loadTemplates() {
      try {
        const res = await fetch('/api/clinical/templates')
        if (res.ok) {
          const data = await res.json()
          setDoctorTemplates(data.templates || [])
        }
      } catch { /* use defaults only */ }
    }
    loadTemplates()
  }, [])

  // B10: Deduplicate — doctor templates override defaults with same name
  const doctorNames = new Set(doctorTemplates.map(t => t.name))
  const deduped = [...doctorTemplates, ...DEFAULT_TEMPLATES.filter(t => !doctorNames.has(t.name))]
  const filtered = search
    ? deduped.filter(t => t.name.includes(search))
    : deduped

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="bg-white rounded-t-[20px] w-full max-w-md max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <h3 className="font-cairo font-bold text-[16px] text-[#030712]">قوالب الروشتة</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center">
            <svg className="w-4 h-4 text-[#4B5563]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

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

        {/* Help text */}
        <div className="px-5 pb-2">
          <p className="font-cairo text-[11px] text-[#4B5563]">
            تطبيق القالب يُضيف أدوية متعددة إلى قائمة الوصفة الحالية
          </p>
        </div>

        {/* Template List */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
          {filtered.map((template) => (
            <button
              key={template.id}
              onClick={() => onApply(template)}
              className="w-full text-right p-4 bg-[#F9FAFB] rounded-[12px] hover:bg-[#F3F4F6] transition-colors border border-transparent hover:border-[#E5E7EB]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#DCFCE7] flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#16A34A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-cairo font-bold text-[14px] text-[#030712]">{template.name}</div>
                    <div className="font-cairo text-[11px] text-[#4B5563]">{template.medications.length} أدوية</div>
                  </div>
                </div>
                <span className="font-cairo text-[12px] font-medium text-[#16A34A]">تطبيق القالب</span>
              </div>
              {/* Preview medication names */}
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
