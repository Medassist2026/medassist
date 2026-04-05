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
  priceEGP?: number | null // Estimated market price at time of prescribing
  drugId?: string          // DB id — used for alternatives lookup
  category?: string        // Drug category — enables antibiotic nudge alert in SessionForm
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
  priceEGP?: number | null
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
  /** Quick-add medication names ordered by this doctor's usage frequency */
  quickMeds?: string[]
  /** True once doctor has enough history for personalised ordering */
  personalised?: boolean
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

// الشكل FIRST — user picks form, then dose options adapt
const FORM_OPTIONS = [
  { value: 'أقراص', label: 'أقراص' },
  { value: 'كبسولة', label: 'كبسولة' },
  { value: 'شراب',  label: 'شراب'  },
  { value: 'حقن',   label: 'حقن'   },
  { value: 'كريم',  label: 'كريم'  },
  { value: 'نقط',   label: 'نقط'   },
  { value: 'بخاخ',  label: 'بخاخ'  },
  { value: 'لبوس',  label: 'لبوس'  },
]

// Dose options adapt based on the selected form.
// Syrup shows both spoon measures AND ml so the prescription is unambiguous
// (Egyptian pharmacists equate 5ml = 1 ملعقة صغيرة; pediatric dosing needs ml).
function getDosageOptions(form?: string): string[] {
  if (form === 'شراب')  return ['2.5ml', '5ml (1 ملعقة)', '10ml (2 ملعقة)', '15ml (1 ملعقة كبيرة)']
  if (form === 'حقن')   return ['1', '2', '3']
  if (form === 'كريم' || form === 'بخاخ' || form === 'نقط' || form === 'لبوس') return ['كمية مناسبة']
  return ['½', '1', '2', '3']   // أقراص / كبسولة / default
}

// Dosage unit label shown in summary
function getDosageUnit(form?: string): string {
  if (form === 'شراب')  return ''
  if (form === 'حقن')   return ' حقنة'
  if (form === 'كبسولة') return ' كبسولة'
  if (form === 'كريم' || form === 'بخاخ' || form === 'نقط' || form === 'لبوس') return ''
  return ' قرص'
}

const FREQUENCY_OPTIONS = ['كل 6 ساعات', 'كل 8 ساعات', 'كل 12 ساعة', 'يومياً']
const TIMING_OPTIONS = ['صباح', 'ظهر', 'مساء', 'قبل النوم']
const INSTRUCTION_OPTIONS = ['قبل الأكل', 'بعد الأكل', 'عند اللزوم']
const DURATION_OPTIONS = ['3 أيام', '5 أيام', '7 أيام', '10 أيام', '14 يوم', 'شهر', 'مستمر']

// ============================================================================
// MEDICATION CHIPS COMPONENT
// ============================================================================

// ============================================================================
// PRICE INTELLIGENCE — alternative brands for same generic
// ============================================================================

interface DrugAlternative {
  id: string
  brandName: string
  genericName: string | null
  strength: string | null
  form: string
  company: string | null
  priceEGP: number
}

interface AltPanelState {
  medIndex: number
  genericName: string
  loading: boolean
  results: DrugAlternative[]
  error: string | null
}

const PRICE_PREF_KEY = 'medassist_show_drug_prices'

// ============================================================================
// MEDICATION CHIPS COMPONENT
// ============================================================================

export function MedicationChips({
  medications,
  onChange,
  allergies = [],
  onAllergyWarning,
  onOpenTemplates,
  quickMeds = [],
  personalised = false,
}: MedicationChipsProps) {
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<DrugSearchResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Price intelligence state
  const [showPrices, setShowPrices] = useState<boolean>(true)
  const [altPanel, setAltPanel] = useState<AltPanelState | null>(null)

  // Load price preference from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PRICE_PREF_KEY)
      if (stored === 'false') setShowPrices(false)
    } catch { /* SSR / private mode */ }
  }, [])

  const togglePriceDisplay = () => {
    const next = !showPrices
    setShowPrices(next)
    setAltPanel(null)
    try { localStorage.setItem(PRICE_PREF_KEY, String(next)) } catch { /* ignore */ }
  }

  // Open / close the alternatives panel for a specific medication
  const openAlternatives = async (medIndex: number, genericName: string, drugId?: string) => {
    // Toggle off if already open for same med
    if (altPanel?.medIndex === medIndex) {
      setAltPanel(null)
      return
    }

    setAltPanel({ medIndex, genericName, loading: true, results: [], error: null })

    try {
      const params = new URLSearchParams({ generic: genericName, limit: '8' })
      if (drugId) params.set('excludeId', drugId)
      const res = await fetch(`/api/drugs/alternatives?${params}`)
      if (!res.ok) throw new Error('فشل تحميل البدائل')
      const data = await res.json()
      setAltPanel(prev => prev ? { ...prev, loading: false, results: data.alternatives || [] } : null)
    } catch (e: any) {
      setAltPanel(prev => prev ? { ...prev, loading: false, error: e.message || 'خطأ' } : null)
    }
  }

  // Swap selected medication for an alternative
  const swapForAlternative = (medIndex: number, alt: DrugAlternative) => {
    const updated = [...medications]
    updated[medIndex] = {
      ...updated[medIndex],
      name:        alt.brandName,
      genericName: alt.genericName || updated[medIndex].genericName,
      strength:    alt.strength    || updated[medIndex].strength,
      priceEGP:    alt.priceEGP,
      drugId:      alt.id,
    }
    onChange(updated)
    setAltPanel(null)
  }

  // Total estimated cost (sum of per-package prices for meds that have them)
  const pricedMeds = medications.filter(m => m.priceEGP && m.priceEGP > 0)
  const totalEstimate = pricedMeds.reduce((sum, m) => sum + (m.priceEGP || 0), 0)

  // ── Alert 1: Duplicate Generic ────────────────────────────────────────────
  // State holds at most one pending duplicate warning at a time.
  // { newIndex: index of newly added drug, existingIndex: index of the older one, generic }
  const [dupWarning, setDupWarning] = useState<{
    newIndex: number
    existingIndex: number
    newName: string
    existingName: string
    generic: string
  } | null>(null)

  /**
   * Check if a newly added medication duplicates the generic name of an existing one.
   * Must be called AFTER the medication has been appended to the list.
   * @param newIndex  Index of the just-added drug in the new medications array
   * @param newList   The full updated medications array (post-add)
   */
  const checkDuplicateGeneric = (newIndex: number, newList: MedicationEntry[]) => {
    const newMed = newList[newIndex]
    if (!newMed?.genericName) return

    const normalise = (s: string) => s.toLowerCase().trim()
    const newGeneric = normalise(newMed.genericName)

    for (let i = 0; i < newIndex; i++) {
      const existing = newList[i]
      if (!existing.genericName) continue
      const existingGeneric = normalise(existing.genericName)

      // Exact match OR one is a prefix of the other (handles combos like "amoxicillin / clavulanate")
      const isDuplicate =
        existingGeneric === newGeneric ||
        existingGeneric.startsWith(newGeneric) ||
        newGeneric.startsWith(existingGeneric)

      if (isDuplicate) {
        setDupWarning({
          newIndex,
          existingIndex: i,
          newName:       newMed.name,
          existingName:  existing.name,
          generic:       newMed.genericName,
        })
        return // Report first duplicate found — one at a time
      }
    }
  }

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

    // FIX 2A: Map old format to new format
    const defaultFreq = drug.defaults?.frequency || ''
    let freq = 'كل 12 ساعة'  // Default = 2×
    let timings: string[] = ['صباح', 'مساء']

    if (defaultFreq.includes('once')) {
      freq = 'يومياً'
      timings = ['صباح']
    } else if (defaultFreq.includes('three') || defaultFreq.includes('3')) {
      freq = 'كل 8 ساعات'
      timings = ['صباح', 'ظهر', 'مساء']
    } else if (defaultFreq.includes('4')) {
      freq = 'كل 6 ساعات'
      timings = ['صباح', 'ظهر', 'مساء', 'قبل النوم']
    }

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
      form: (() => {
        const f = drug.form || ''
        // English form values (curated DB)
        if (f === 'capsule')   return 'كبسولة'
        if (f === 'tablet')    return 'أقراص'
        if (f === 'syrup')     return 'شراب'
        if (f === 'injection') return 'حقن'
        if (f === 'cream')     return 'كريم'
        if (f === 'drops')     return 'نقط'
        if (f === 'spray' || f === 'inhaler') return 'بخاخ'
        if (f === 'suppository') return 'لبوس'
        // Arabic form values (extended DB already stores Arabic)
        const VALID_ARABIC_FORMS = ['أقراص','كبسولة','شراب','حقن','كريم','نقط','بخاخ','لبوس']
        if (VALID_ARABIC_FORMS.includes(f)) return f
        return 'أقراص'   // safe default
      })(),
      dosageCount: '1',
      frequency: freq,
      timings,
      instructions: drug.defaults?.instructions?.includes('after') ? 'بعد الأكل' : drug.defaults?.instructions?.includes('before') ? 'قبل الأكل' : undefined,
      duration,
      isExpanded: true, // Auto-expand newly added medication
      priceEGP:  drug.priceEGP ?? null,
      drugId:    drug.id,
      category:  drug.category,
    }

    const newList = [...medications, newMed]
    onChange(newList)
    checkDuplicateGeneric(newList.length - 1, newList)
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
    // FIX 2B: Use new format for custom medication
    const newMed: MedicationEntry = {
      name: search.trim(),
      strength: customStrength.trim() || undefined,
      dosageCount: '1',
      frequency: 'كل 12 ساعة',
      timings: ['صباح', 'مساء'],
      form: 'أقراص',
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

    // When form changes, auto-reset dosageCount to a sensible default for the new form
    if (updates.form) {
      const newOptions = getDosageOptions(updates.form)
      const currentDose = medications[index].dosageCount || '1'
      if (!newOptions.includes(currentDose)) {
        // For syrup default to 5ml (index 1); for others default to index 1 ('1')
        updated[index].dosageCount = newOptions[1] || newOptions[0]
      }
    }

    // B07: Only auto-adjust timings if they match the PREVIOUS frequency's defaults
    // (preserves manual customization)
    if (updates.frequency) {
      const f = updates.frequency
      const currentTimings = medications[index].timings || []
      const currentFreq = medications[index].frequency
      // FIX 2C: Add legacy mapping for old format
      // Defaults for the current (old) frequency (including legacy format)
      const oldDefaults: Record<string, string[]> = {
        'يومياً': ['صباح'],
        '1×': ['صباح'],
        'كل 12 ساعة': ['صباح', 'مساء'],
        '2×': ['صباح', 'مساء'],
        'كل 8 ساعات': ['صباح', 'ظهر', 'مساء'],
        '3×': ['صباح', 'ظهر', 'مساء'],
        'كل 6 ساعات': ['صباح', 'ظهر', 'مساء', 'قبل النوم'],
        '4×': ['صباح', 'ظهر', 'مساء', 'قبل النوم'],
      }
      const oldDefault = oldDefaults[currentFreq || ''] || []
      const isDefault = currentTimings.length === oldDefault.length && currentTimings.every(t => oldDefault.includes(t))

      if (isDefault) {
        // Timings match defaults — safe to auto-update
        if (f === 'يومياً') updated[index].timings = ['صباح']
        else if (f === 'كل 12 ساعة') updated[index].timings = ['صباح', 'مساء']
        else if (f === 'كل 8 ساعات') updated[index].timings = ['صباح', 'ظهر', 'مساء']
        else if (f === 'كل 6 ساعات') updated[index].timings = ['صباح', 'ظهر', 'مساء', 'قبل النوم']
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
    if (med.dosageCount) {
      const unit = getDosageUnit(med.form)
      parts.push(`${med.dosageCount}${unit}`)
    }
    if (med.frequency) parts.push(med.frequency)
    if (med.timings?.length) parts.push(med.timings.join(' + '))
    if (med.duration) parts.push(`لمدة ${med.duration}`)
    return parts.join(' · ')
  }

  // Quick-add a medication by name — looks up drug database first to get smart defaults,
  // then falls through to sensible Arabic defaults if the name isn't found.
  const addQuickMed = async (name: string) => {
    // Don't add duplicates
    if (medications.some(m => m.name.toLowerCase() === name.toLowerCase())) return

    try {
      // Search the drug database for this exact name
      const res = await fetch(`/api/drugs/search?q=${encodeURIComponent(name)}&limit=3`)
      if (res.ok) {
        const data = await res.json()
        const drugs: DrugSearchResult[] = data.drugs || []
        // Find the closest match: exact name match (case-insensitive) preferred
        const match = drugs.find(d =>
          (d.name || '').toLowerCase() === name.toLowerCase() ||
          (d.nameAr || '') === name
        ) || drugs[0]

        if (match) {
          // Reuse the full addMedication() path — gets smart defaults from database
          addMedication(match)
          return
        }
      }
    } catch { /* ignore network errors — fall through to sensible defaults */ }

    // Fallback: not in database — add with sensible defaults (same as addCustomMedication)
    const entry: MedicationEntry = {
      name,
      form: 'أقراص',
      dosageCount: '1',
      frequency: 'كل 12 ساعة',
      timings: ['صباح', 'مساء'],
      isExpanded: true,
    }
    onChange([...medications, entry])
  }

  return (
    <div className="mt-3 space-y-3">
      {/* ===== QUICK-ADD MEDICATION CHIPS ===== */}
      {quickMeds.length > 0 && (
        <div>
          <p className="font-cairo text-[11px] font-semibold text-[#6B7280] mb-2">
            {personalised ? 'أدويتك الأكثر وصفاً' : 'أدوية شائعة'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quickMeds.map((med) => {
              const alreadyAdded = medications.some(m => m.name.toLowerCase() === med.toLowerCase())
              return (
                <button
                  key={med}
                  type="button"
                  onClick={() => !alreadyAdded && addQuickMed(med)}
                  disabled={alreadyAdded}
                  className={`px-3 py-1.5 font-cairo text-[12px] font-medium rounded-full border transition-colors ${
                    alreadyAdded
                      ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#16A34A] cursor-default'
                      : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#22C55E] hover:text-[#16A34A]'
                  }`}
                >
                  {alreadyAdded ? `✓ ${med}` : `+ ${med}`}
                </button>
              )
            })}
          </div>
        </div>
      )}

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
            {/* Collapsed: price badge + delete */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Price badge — only when prices enabled, collapsed, and price known */}
              {showPrices && !med.isExpanded && med.priceEGP && med.priceEGP > 0 && med.genericName && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    openAlternatives(i, med.genericName!, med.drugId)
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-cairo font-medium border transition-colors ${
                    altPanel?.medIndex === i
                      ? 'bg-[#FEF3C7] border-[#F59E0B] text-[#B45309]'
                      : 'bg-[#F9FAFB] border-[#E5E7EB] text-[#6B7280] hover:border-[#F59E0B] hover:text-[#B45309]'
                  }`}
                  title="عرض البدائل الأرخص"
                >
                  <span>~{med.priceEGP.toLocaleString('ar-EG', { maximumFractionDigits: 0 })}</span>
                  <span className="text-[10px]">ج</span>
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
              {!med.isExpanded && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeMedication(i) }}
                  className="font-cairo text-[11px] font-medium text-[#DC2626] hover:text-red-800"
                >
                  حذف
                </button>
              )}
              <svg
                className={`w-4 h-4 text-[#4B5563] transition-transform ${med.isExpanded ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {/* Alternatives Panel — slides open below the chip when price badge is tapped */}
          {showPrices && altPanel?.medIndex === i && (
            <div className="border-t border-[#FEF3C7] bg-[#FFFBEB] px-3 py-2.5">
              <div className="flex items-center justify-between mb-2">
                <p className="font-cairo text-[11px] font-semibold text-[#92400E]">
                  بدائل أرخص · {altPanel.genericName}
                </p>
                <button onClick={() => setAltPanel(null)} className="text-[#D97706]">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {altPanel.loading && (
                <div className="flex items-center gap-2 py-2">
                  <span className="inline-block w-3.5 h-3.5 border-2 border-[#D97706] border-t-transparent rounded-full animate-spin" />
                  <span className="font-cairo text-[11px] text-[#92400E]">جاري التحميل…</span>
                </div>
              )}

              {!altPanel.loading && altPanel.error && (
                <p className="font-cairo text-[11px] text-[#DC2626]">{altPanel.error}</p>
              )}

              {!altPanel.loading && !altPanel.error && altPanel.results.length === 0 && (
                <p className="font-cairo text-[11px] text-[#92400E] italic">لا توجد بدائل بأسعار معروفة في قاعدة البيانات</p>
              )}

              {!altPanel.loading && altPanel.results.length > 0 && (
                <div className="space-y-1.5">
                  {altPanel.results.map((alt) => (
                    <div key={alt.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-cairo text-[12px] font-semibold text-[#030712] truncate">{alt.brandName}</p>
                        {alt.strength && (
                          <p className="font-cairo text-[10px] text-[#6B7280]">{alt.strength} {alt.company && `· ${alt.company}`}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-cairo text-[12px] font-bold text-[#16A34A]">
                          {alt.priceEGP.toLocaleString('ar-EG', { maximumFractionDigits: 0 })} ج
                        </span>
                        <button
                          onClick={() => swapForAlternative(i, alt)}
                          className="px-2 py-0.5 bg-[#16A34A] text-white rounded-[6px] font-cairo text-[10px] font-bold hover:bg-[#15803d] transition-colors"
                        >
                          استبدال
                        </button>
                      </div>
                    </div>
                  ))}
                  <p className="font-cairo text-[9px] text-[#9CA3AF] pt-1 border-t border-[#FEF3C7] mt-1">
                    ⚠️ الأسعار تقريبية (بيانات 2024–2026) وقد تختلف عن سعر الصيدلية الفعلي
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Expanded Edit View — shape-first, condensed */}
          {med.isExpanded && (
            <div className="px-3 pb-3 border-t border-[#F3F4F6] space-y-3">
              {/* Smart default banner */}
              {med.frequency && (
                <div className="flex items-center gap-1.5 mt-2 px-2 py-1 bg-[#DCFCE7] rounded-[8px]">
                  <span className="text-[12px]">⚡</span>
                  <span className="font-cairo text-[10px] text-[#16A34A] font-medium">
                    أُضيف تلقائياً · {med.frequency}
                  </span>
                </div>
              )}

              {/* Row 1: الشكل FIRST */}
              <div>
                <label className="font-cairo text-[11px] font-semibold text-[#4B5563] mb-1 block">الشكل</label>
                <div className="flex flex-wrap gap-1.5">
                  {FORM_OPTIONS.map((form) => (
                    <button
                      key={form.value}
                      onClick={() => updateMed(i, { form: form.value })}
                      className={`px-2.5 py-1.5 rounded-[8px] font-cairo text-[12px] font-medium border transition-colors ${
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

              {/* Row 2: الجرعة — adapts based on shape */}
              <div>
                <label className="font-cairo text-[11px] font-semibold text-[#4B5563] mb-1 block">الجرعة</label>
                <div className="flex flex-wrap gap-1.5">
                  {getDosageOptions(med.form).map((dose) => (
                    <button
                      key={dose}
                      onClick={() => updateMed(i, { dosageCount: dose })}
                      className={`px-3 py-1.5 rounded-[8px] font-cairo text-[12px] font-medium border transition-colors ${
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

              {/* Row 3: التكرار */}
              <div>
                <label className="font-cairo text-[11px] font-semibold text-[#4B5563] mb-1 block">التكرار</label>
                <div className="flex gap-1.5">
                  {FREQUENCY_OPTIONS.map((freq) => (
                    <button
                      key={freq}
                      onClick={() => updateMed(i, { frequency: freq })}
                      className={`flex-1 py-1.5 rounded-[8px] font-cairo text-[11px] font-medium border transition-colors ${
                        med.frequency === freq
                          ? 'bg-[#16A34A] border-[#16A34A] text-white'
                          : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#16A34A]'
                      }`}
                    >
                      {freq}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 4: وقت الجرعة */}
              <div>
                <label className="font-cairo text-[11px] font-semibold text-[#4B5563] mb-1 block">وقت الجرعة</label>
                <div className="flex flex-wrap gap-1.5">
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

              {/* Row 5: تعليمات + مدة side-by-side */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="font-cairo text-[11px] font-semibold text-[#4B5563] mb-1 block">
                    تعليمات <span className="text-[#9CA3AF] font-normal">(اختياري)</span>
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {INSTRUCTION_OPTIONS.map((inst) => (
                      <button
                        key={inst}
                        onClick={() => updateMed(i, { instructions: med.instructions === inst ? undefined : inst })}
                        className={`px-2 py-1 rounded-[6px] font-cairo text-[11px] font-medium border transition-colors ${
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
                <div className="flex-1">
                  <label className="font-cairo text-[11px] font-semibold text-[#4B5563] mb-1 block">
                    المدة <span className="text-[#9CA3AF] font-normal">(اختياري)</span>
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {DURATION_OPTIONS.map((dur) => (
                      <button
                        key={dur}
                        onClick={() => updateMed(i, { duration: med.duration === dur ? undefined : dur })}
                        className={`px-2 py-1 rounded-[6px] font-cairo text-[11px] font-medium border transition-colors ${
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
              </div>

              {/* Action: delete + done */}
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => removeMedication(i)}
                  className="font-cairo text-[12px] font-medium text-[#DC2626] hover:text-red-800"
                >
                  حذف
                </button>
                <button
                  onClick={() => toggleExpand(i)}
                  className="px-5 py-1.5 bg-[#16A34A] text-white rounded-[8px] font-cairo text-[12px] font-bold hover:bg-[#15803d] transition-colors"
                >
                  تم
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* ===== TOTAL COST BAR ===== */}
      {medications.length > 0 && showPrices && pricedMeds.length >= 1 && (
        <div className="flex items-center justify-between px-3 py-2 bg-[#F0FDF4] border border-[#BBF7D0] rounded-[10px]">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-[#16A34A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <span className="font-cairo text-[12px] font-semibold text-[#15803D]">
                إجمالي تقريبي للعبوات:
              </span>
              <span className="font-cairo text-[12px] font-bold text-[#15803D] mr-1">
                ~{totalEstimate.toLocaleString('ar-EG', { maximumFractionDigits: 0 })} جنيه
              </span>
              {pricedMeds.length < medications.length && (
                <span className="font-cairo text-[10px] text-[#4B5563] mr-1">
                  ({pricedMeds.length}/{medications.length} بسعر معروف)
                </span>
              )}
            </div>
          </div>
          <button
            onClick={togglePriceDisplay}
            className="font-cairo text-[10px] text-[#4B5563] hover:text-[#030712] underline underline-offset-2"
          >
            إخفاء
          </button>
        </div>
      )}

      {/* ── Alert 1: Duplicate Generic Banner ─────────────────────────────────
           Amber inline warning — appears directly after a duplicate is added.
           Doctor can dismiss it (setDupWarning(null)) or remove the new drug. */}
      {dupWarning && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-[#FFFBEB] border border-[#FCD34D] rounded-[10px] mt-1">
          <span className="text-[14px] mt-0.5 shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="font-cairo text-[12px] font-semibold text-[#92400E] leading-snug">
              تكرار في المادة الفعالة
            </p>
            <p className="font-cairo text-[11px] text-[#B45309] mt-0.5 leading-snug">
              <span className="font-bold">{dupWarning.newName}</span> و{' '}
              <span className="font-bold">{dupWarning.existingName}</span> كلاهما يحتوي على{' '}
              <span className="font-bold">{dupWarning.generic}</span>
            </p>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <button
              onClick={() => {
                // Remove the newly added drug (the duplicate)
                onChange(medications.filter((_, idx) => idx !== dupWarning.newIndex))
                setDupWarning(null)
              }}
              className="px-2 py-1 bg-[#FCD34D] text-[#78350F] rounded-[6px] font-cairo text-[10px] font-bold hover:bg-[#FBD82C] transition-colors whitespace-nowrap"
            >
              حذف الأحدث
            </button>
            <button
              onClick={() => setDupWarning(null)}
              className="px-2 py-1 bg-transparent text-[#92400E] rounded-[6px] font-cairo text-[10px] hover:bg-[#FEF3C7] transition-colors whitespace-nowrap text-center"
            >
              تجاهل
            </button>
          </div>
        </div>
      )}

      {/* Price display re-enable hint — shown when prices are hidden and there are priced meds */}
      {medications.length > 0 && !showPrices && (
        <button
          onClick={togglePriceDisplay}
          className="w-full text-center font-cairo text-[11px] text-[#9CA3AF] hover:text-[#4B5563] py-1 transition-colors"
        >
          إظهار الأسعار التقريبية
        </button>
      )}
    </div>
  )
}
