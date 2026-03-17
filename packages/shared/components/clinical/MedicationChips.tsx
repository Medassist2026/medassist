'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

// ============================================================================
// TYPES
// ============================================================================

export interface MedicationEntry {
  name: string
  genericName?: string
  strength?: string
  form?: string
  dosageCount?: string     // "½", "1", "2"
  frequency?: string       // "1×", "2×", "3×", "4×"
  timings?: string[]       // ["صباح", "مساء"]
  instructions?: string    // "قبل الأكل", "بعد الأكل", "عند اللزوم"
  duration?: string        // "3 أيام", "7 أيام", "مستمر" — B01 fix
  notes?: string
  isExpanded?: boolean
}

interface DrugSearchResult {
  id: string
  name: string
  nameAr?: string
  genericName?: string
  strength?: string
  strengthVariants?: string[]
  form?: string
  category?: string
  defaults?: {
    type: string
    frequency: string
    duration: string
    instructions?: string
  }
}

interface MedicationChipsProps {
  medications: MedicationEntry[]
  onChange: (medications: MedicationEntry[]) => void
  allergies?: string[]
  onAllergyWarning?: (drugName: string, allergyName: string, familyName: string) => void
  onOpenTemplates?: () => void
}

// ============================================================================
// ALLERGY-DRUG FAMILY MAP (for cross-check)
// ============================================================================

// B14: Expanded to 8 families (was 3)
const ALLERGY_DRUG_FAMILIES: Record<string, string[]> = {
  'بنسلين': ['amoxicillin', 'ampicillin', 'penicillin', 'augmentin', 'أموكسيسيلين', 'أوجمنتين', 'أمبيسيلين', 'فلوموكس', 'هاى بيوتك', 'ميجاموكس', 'كلاموكس', 'يوناسين'],
  'سلفا': ['sulfamethoxazole', 'trimethoprim', 'septrin', 'سبترين'],
  'أسبرين': ['aspirin', 'أسبرين', 'أسبوسيد', 'جوسبرين', 'ريفو'],
  'مضادات الالتهاب': ['ibuprofen', 'diclofenac', 'ketoprofen', 'naproxen', 'بروفين', 'كيتوفان', 'فولتارين', 'نابروكسين', 'كاتافلام', 'بريكسين', 'فيلدين', 'موبيك'],
  'سيفالوسبورين': ['cephalexin', 'cefaclor', 'ceftriaxone', 'cefotaxime', 'سيفازولين', 'سيفاكلور', 'سيفترياكسون', 'سيبروكس', 'كيفلكس', 'سيفوتاكس', 'زيناسيف'],
  'ماكروليد': ['azithromycin', 'clarithromycin', 'erythromycin', 'أزيثروميسين', 'زيثروماكس', 'كلاريثروميسين', 'كلاسيد', 'إريثرومايسين'],
  'فلوروكينولون': ['ciprofloxacin', 'levofloxacin', 'moxifloxacin', 'سيبروفلوكساسين', 'سيبرو', 'تافانيك', 'ليفوفلوكساسين', 'أفالوكس'],
  'مثبطات ACE': ['captopril', 'enalapril', 'ramipril', 'lisinopril', 'كابتوبريل', 'كابوتين', 'إنالابريل', 'راميبريل', 'تريتاس', 'زيستريل'],
}

// B06: Arabic text normalization for accurate allergy matching
function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '') // Remove tashkeel
    .replace(/[إأآ]/g, 'ا')               // Normalize alef
    .replace(/ة/g, 'ه')                   // Normalize taa marbuta
    .replace(/ى/g, 'ي')                   // Normalize alef maqsura
    .trim()
}

// ============================================================================
// CONSTANTS — Figma-matching chips
// ============================================================================

const DOSAGE_OPTIONS = ['½', '1', '2', '3']
const FORM_OPTIONS = [
  { value: 'كبسولة', label: 'كبسولة' },
  { value: 'كبسولات', label: 'كبسولات' },
  { value: 'قرص', label: 'قرص' },
  { value: 'أقراص', label: 'أقراص' },
  { value: 'شراب', label: 'شراب' },
  { value: 'حقن', label: 'حقن' },
  { value: 'كريم', label: 'كريم' },
  { value: 'نقط', label: 'نقط' },
  { value: 'بخاخ', label: 'بخاخ' },
  { value: 'لبوس', label: 'لبوس' },
  { value: 'بخة', label: 'بخة' },
]
const FREQUENCY_OPTIONS = ['1×', '2×', '3×', '4×']
const TIMING_OPTIONS = ['صباح', 'ظهر', 'مساء', 'قبل النوم']
const INSTRUCTION_OPTIONS = ['قبل الأكل', 'بعد الأكل', 'عند اللزوم']
const DURATION_OPTIONS = ['3 أيام', '5 أيام', '7 أيام', '10 أيام', '14 يوم', 'شهر', 'مستمر']

// ============================================================================
// MEDICATION CHIPS COMPONENT
// ============================================================================

export function MedicationChips({
  medications,
  onChange,
  allergies = [],
  onAllergyWarning,
  onOpenTemplates,
}: MedicationChipsProps) {
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<DrugSearchResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ===== DRUG SEARCH =====
  const searchDrugs = useCallback(async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/drugs/search?q=${encodeURIComponent(query)}&limit=8`)
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.drugs || [])
        setShowResults(true)
      }
    } catch { /* ignore */ }
    finally { setSearching(false) }
  }, [])

  // Debounced search
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null)
  const handleSearchChange = (value: string) => {
    setSearch(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => searchDrugs(value), 300)
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ===== ALLERGY CROSS-CHECK (B06: exact match after normalization) =====
  const checkAllergyConflict = (drugName: string, genericName?: string): { allergyName: string; familyName: string } | null => {
    const drugLower = (drugName + ' ' + (genericName || '')).toLowerCase()
    for (const [allergyName, drugFamily] of Object.entries(ALLERGY_DRUG_FAMILIES)) {
      // B06: Use normalized exact match to prevent false positives (e.g. "رين" matching "أسبرين")
      const normalizedAllergyFamily = normalizeArabic(allergyName)
      const hasAllergy = allergies.some(a => normalizeArabic(a) === normalizedAllergyFamily)
      if (hasAllergy) {
        if (drugFamily.some(d => drugLower.includes(d.toLowerCase()))) {
          return { allergyName, familyName: allergyName }
        }
      }
    }
    return null
  }

  // ===== ADD MEDICATION =====
  const addMedication = (drug: DrugSearchResult) => {
    // Check allergy conflict
    const conflict = checkAllergyConflict(drug.name, drug.genericName)

    const defaultFreq = drug.defaults?.frequency || ''
    let freq = '2×'
    if (defaultFreq.includes('once')) freq = '1×'
    else if (defaultFreq.includes('twice') || defaultFreq.includes('2')) freq = '2×'
    else if (defaultFreq.includes('three') || defaultFreq.includes('3')) freq = '3×'

    // B01: Smart duration defaults — antibiotics=7d, chronic=مستمر, painkillers=3d
    const defaultDuration = drug.defaults?.duration || ''
    let duration: string | undefined
    const cat = (drug.category || '').toLowerCase()
    if (defaultDuration.includes('ongoing') || defaultDuration.includes('continuous') || cat.includes('chronic') || cat.includes('cardiovascular') || cat.includes('diabetes')) {
      duration = 'مستمر'
    } else if (defaultDuration.includes('7') || cat.includes('antibiotic')) {
      duration = '7 أيام'
    } else if (defaultDuration.includes('5')) {
      duration = '5 أيام'
    } else if (defaultDuration.includes('3') || cat.includes('analgesic') || cat.includes('painkiller')) {
      duration = '3 أيام'
    } else if (defaultDuration.includes('14') || defaultDuration.includes('2 week')) {
      duration = '14 يوم'
    }

    const newMed: MedicationEntry = {
      name: drug.nameAr || drug.name,
      genericName: drug.genericName,
      strength: drug.strength,
      form: drug.form === 'capsule' ? 'كبسولة' : drug.form === 'tablet' ? 'قرص' : drug.form === 'syrup' ? 'شراب' : drug.form === 'injection' ? 'حقن' : drug.form === 'cream' ? 'كريم' : 'قرص',
      dosageCount: '1',
      frequency: freq,
      timings: freq === '2×' ? ['صباح', 'مساء'] : freq === '3×' ? ['صباح', 'ظهر', 'مساء'] : ['صباح'],
      instructions: drug.defaults?.instructions?.includes('after') ? 'بعد الأكل' : drug.defaults?.instructions?.includes('before') ? 'قبل الأكل' : undefined,
      duration,
      isExpanded: true, // Auto-expand newly added medication
    }

    onChange([...medications, newMed])
    setSearch('')
    setSearchResults([])
    setShowResults(false)

    // Fire allergy warning after adding
    if (conflict && onAllergyWarning) {
      onAllergyWarning(drug.nameAr || drug.name, conflict.allergyName, conflict.familyName)
    }
  }

  // ===== CUSTOM MEDICATION (typed name) — B11: includes strength input =====
  const [customStrength, setCustomStrength] = useState('')
  const addCustomMedication = () => {
    if (!search.trim()) return
    const newMed: MedicationEntry = {
      name: search.trim(),
      strength: customStrength.trim() || undefined,
      dosageCount: '1',
      frequency: '2×',
      timings: ['صباح', 'مساء'],
      form: 'قرص',
      isExpanded: true,
    }
    onChange([...medications, newMed])
    setSearch('')
    setCustomStrength('')
    setShowResults(false)
  }

  // ===== UPDATE MEDICATION =====
  const updateMed = (index: number, updates: Partial<MedicationEntry>) => {
    const updated = [...medications]
    updated[index] = { ...updated[index], ...updates }

    // B07: Only auto-adjust timings if they match the PREVIOUS frequency's defaults
    // (preserves manual customization)
    if (updates.frequency) {
      const f = updates.frequency
      const currentTimings = medications[index].timings || []
      const currentFreq = medications[index].frequency
      // Defaults for the current (old) frequency
      const oldDefaults: Record<string, string[]> = {
        '1×': ['صباح'], '2×': ['صباح', 'مساء'], '3×': ['صباح', 'ظهر', 'مساء'],
        '4×': ['صباح', 'ظهر', 'مساء', 'قبل النوم'], 'يومياً': ['صباح'],
      }
      const oldDefault = oldDefaults[currentFreq || ''] || []
      const isDefault = currentTimings.length === oldDefault.length && currentTimings.every(t => oldDefault.includes(t))

      if (isDefault) {
        // Timings match defaults — safe to auto-update
        if (f === '1×') updated[index].timings = ['صباح']
        else if (f === '2×') updated[index].timings = ['صباح', 'مساء']
        else if (f === '3×') updated[index].timings = ['صباح', 'ظهر', 'مساء']
        else if (f === '4×') updated[index].timings = ['صباح', 'ظهر', 'مساء', 'قبل النوم']
      }
      // If user customized timings, leave them alone
    }

    onChange(updated)
  }

  const toggleTiming = (medIndex: number, timing: string) => {
    const med = medications[medIndex]
    const current = med.timings || []
    const newTimings = current.includes(timing)
      ? current.filter(t => t !== timing)
      : [...current, timing]
    updateMed(medIndex, { timings: newTimings })
  }

  const removeMedication = (index: number) => {
    onChange(medications.filter((_, i) => i !== index))
  }

  const toggleExpand = (index: number) => {
    updateMed(index, { isExpanded: !medications[index].isExpanded })
  }

  // ===== BUILD MEDICATION SUMMARY =====
  const getMedSummary = (med: MedicationEntry): string => {
    const parts: string[] = []
    if (med.dosageCount) parts.push(`${med.dosageCount} ${med.form || 'قرص'}`)
    if (med.frequency) parts.push(`${med.frequency} يومياً`)
    if (med.timings?.length) parts.push(med.timings.join(' + '))
    if (med.duration) parts.push(`لمدة ${med.duration}`)
    return parts.join(' · ')
  }

  return (
    <div className="mt-3 space-y-3">
      {/* ===== DRUG SEARCH with bottom-sheet style ===== */}
      <div ref={searchRef} className="relative">
        <div className="flex items-center gap-2">
          {/* Search input */}
          <div className="flex-1 relative">
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4B5563]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomMedication())}
              placeholder="اكتب اسم الدواء..."
              className="w-full pr-10 pl-3 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[14px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E] focus:border-transparent bg-white"
            />
          </div>

          {/* Template button */}
          <button
            onClick={onOpenTemplates}
            className="flex items-center gap-1 px-3 py-2.5 border border-[#E5E7EB] rounded-[10px] bg-white hover:bg-[#F9FAFB] transition-colors"
          >
            <svg className="w-4 h-4 text-[#4B5563]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="font-cairo text-[12px] font-medium text-[#4B5563]">قالب</span>
          </button>
        </div>

        {/* Search Results Dropdown — positioned as bottom sheet */}
        {showResults && searchResults.length > 0 && (
          <div className="absolute z-40 w-full mt-1 bg-white border border-[#E5E7EB] rounded-[12px] shadow-lg max-h-[220px] overflow-y-auto">
            {searchResults.map((drug) => (
              <button
                key={drug.id}
                onClick={() => addMedication(drug)}
                className="w-full text-right px-4 py-3 hover:bg-[#F9FAFB] transition-colors border-b border-[#F3F4F6] last:border-0"
              >
                <div className="font-cairo font-semibold text-[14px] text-[#030712]">
                  {drug.nameAr || drug.name}
                  {drug.strength && <span className="font-normal text-[12px] text-[#4B5563] mr-1">{drug.strength}</span>}
                </div>
                <div className="font-cairo text-[11px] text-[#4B5563]">
                  {drug.genericName} {drug.form && `· ${drug.form}`}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Custom add option — B11: with optional strength input */}
        {search.length >= 2 && !searching && searchResults.length === 0 && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={customStrength}
              onChange={(e) => setCustomStrength(e.target.value)}
              placeholder="التركيز (مثال: 500mg)"
              className="w-32 px-2 py-1.5 border border-[#E5E7EB] rounded-[8px] text-[12px] font-cairo focus:outline-none focus:ring-1 focus:ring-[#22C55E] bg-white"
            />
            <button
              onClick={addCustomMedication}
              className="font-cairo text-[13px] font-medium text-[#16A34A]"
            >
              + إضافة &quot;{search}&quot;
            </button>
          </div>
        )}
      </div>

      {/* ===== EMPTY STATE ===== */}
      {medications.length === 0 && (
        <div className="py-8 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#F3F4F6] flex items-center justify-center">
            <svg className="w-6 h-6 text-[#4B5563]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <p className="font-cairo text-[14px] font-semibold text-[#030712]">ابدأ بإضافة دواء</p>
          <p className="font-cairo text-[12px] text-[#4B5563] mt-1">ابحث عن الدواء في الحقل أعلاه</p>
        </div>
      )}

      {/* ===== MEDICATION LIST ===== */}
      {medications.map((med, i) => (
        <div key={i} className="border border-[#E5E7EB] rounded-[12px] overflow-hidden bg-white">
          {/* Summary Row — tap to expand */}
          <button
            onClick={() => toggleExpand(i)}
            className="w-full text-right px-4 py-3 flex items-center justify-between hover:bg-[#F9FAFB] transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Green number badge */}
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#16A34A] text-white text-[12px] font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="font-cairo font-bold text-[14px] text-[#030712] truncate">
                  {med.name}
                  {med.strength && <span className="font-normal text-[12px] text-[#4B5563] mr-1">{med.strength}</span>}
                </div>
                {!med.isExpanded && (
                  <div className="font-cairo text-[11px] text-[#4B5563] truncate">
                    {getMedSummary(med)}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!med.isExpanded && (
                <span className="font-cairo text-[11px] text-[#16A34A] font-medium">✏️</span>
              )}
              <svg
                className={`w-4 h-4 text-[#4B5563] transition-transform ${med.isExpanded ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {/* Expanded Edit View — Figma P3 state */}
          {med.isExpanded && (
            <div className="px-4 pb-4 border-t border-[#F3F4F6] space-y-4">
              {/* Smart default note */}
              {med.frequency && (
                <div className="flex items-center gap-1.5 mt-3 px-2 py-1.5 bg-[#DCFCE7] rounded-[8px]">
                  <span className="text-[13px]">⚡</span>
                  <span className="font-cairo text-[11px] text-[#16A34A] font-medium">
                    أُضيف تلقائياً بناءً على {med.frequency} يومياً
                  </span>
                </div>
              )}

              {/* Group 1: الجرعة (Dosage Count) */}
              <div>
                <label className="font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5 block">الجرعة</label>
                <div className="flex flex-wrap gap-2">
                  {DOSAGE_OPTIONS.map((dose) => (
                    <button
                      key={dose}
                      onClick={() => updateMed(i, { dosageCount: dose })}
                      className={`px-4 py-2 rounded-[8px] font-cairo text-[13px] font-medium border transition-colors ${
                        med.dosageCount === dose
                          ? 'bg-[#16A34A] border-[#16A34A] text-white'
                          : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#16A34A]'
                      }`}
                    >
                      {dose}
                    </button>
                  ))}
                </div>
              </div>

              {/* Group 2: الشكل (Form) */}
              <div>
                <label className="font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5 block">الشكل</label>
                <div className="flex flex-wrap gap-2">
                  {FORM_OPTIONS.slice(0, 6).map((form) => (
                    <button
                      key={form.value}
                      onClick={() => updateMed(i, { form: form.value })}
                      className={`px-3 py-1.5 rounded-[8px] font-cairo text-[12px] font-medium border transition-colors ${
                        med.form === form.value
                          ? 'bg-[#16A34A] border-[#16A34A] text-white'
                          : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#16A34A]'
                      }`}
                    >
                      {form.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Group 3: التكرار (Frequency) */}
              <div>
                <label className="font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5 block">التكرار</label>
                <div className="flex gap-2">
                  {FREQUENCY_OPTIONS.map((freq) => (
                    <button
                      key={freq}
                      onClick={() => updateMed(i, { frequency: freq })}
                      className={`flex-1 py-2 rounded-[8px] font-cairo text-[13px] font-medium border transition-colors ${
                        med.frequency === freq
                          ? 'bg-[#16A34A] border-[#16A34A] text-white'
                          : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#16A34A]'
                      }`}
                    >
                      {freq}
                    </button>
                  ))}
                  <button
                    onClick={() => updateMed(i, { frequency: 'يومياً' })}
                    className={`px-3 py-2 rounded-[8px] font-cairo text-[12px] font-medium border transition-colors ${
                      med.frequency === 'يومياً'
                        ? 'bg-[#16A34A] border-[#16A34A] text-white'
                        : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#16A34A]'
                    }`}
                  >
                    يومياً
                  </button>
                </div>
              </div>

              {/* Group 4: وقت الجرعة (Timing) */}
              <div>
                <label className="font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5 block">وقت الجرعة</label>
                <div className="flex flex-wrap gap-2">
                  {TIMING_OPTIONS.map((timing) => (
                    <button
                      key={timing}
                      onClick={() => toggleTiming(i, timing)}
                      className={`px-3 py-1.5 rounded-[8px] font-cairo text-[12px] font-medium border transition-colors ${
                        med.timings?.includes(timing)
                          ? 'bg-[#DCFCE7] border-[#16A34A] text-[#16A34A]'
                          : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#16A34A]'
                      }`}
                    >
                      {timing}
                    </button>
                  ))}
                </div>
              </div>

              {/* Group 5: تعليمات (Instructions) — optional */}
              <div>
                <label className="font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5 block">
                  تعليمات <span className="text-[#9CA3AF] font-normal">(اختياري)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {INSTRUCTION_OPTIONS.map((inst) => (
                    <button
                      key={inst}
                      onClick={() => updateMed(i, { instructions: med.instructions === inst ? undefined : inst })}
                      className={`px-3 py-1.5 rounded-[8px] font-cairo text-[12px] font-medium border transition-colors ${
                        med.instructions === inst
                          ? 'bg-[#DCFCE7] border-[#16A34A] text-[#16A34A]'
                          : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#16A34A]'
                      }`}
                    >
                      {inst}
                    </button>
                  ))}
                </div>
              </div>

              {/* Group 6: المدة (Duration) — B01 */}
              <div>
                <label className="font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5 block">
                  المدة <span className="text-[#9CA3AF] font-normal">(اختياري)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {DURATION_OPTIONS.map((dur) => (
                    <button
                      key={dur}
                      onClick={() => updateMed(i, { duration: med.duration === dur ? undefined : dur })}
                      className={`px-3 py-1.5 rounded-[8px] font-cairo text-[12px] font-medium border transition-colors ${
                        med.duration === dur
                          ? 'bg-[#DCFCE7] border-[#16A34A] text-[#16A34A]'
                          : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#16A34A]'
                      }`}
                    >
                      {dur}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => removeMedication(i)}
                  className="font-cairo text-[13px] font-medium text-[#DC2626] hover:text-red-800"
                >
                  حذف
                </button>
                <button
                  onClick={() => toggleExpand(i)}
                  className="px-6 py-2 bg-[#16A34A] text-white rounded-[8px] font-cairo text-[13px] font-bold hover:bg-[#15803d] transition-colors"
                >
                  تم
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
