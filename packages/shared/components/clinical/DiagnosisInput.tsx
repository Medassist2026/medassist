'use client'

import { useState, useEffect, useRef } from 'react'
import { COMPLAINT_TO_DIAGNOSIS } from '@shared/lib/data/templates-data'

interface ICD10Result {
  code: string
  description: string
}

interface DiagnosisInputProps {
  value: string[]
  onChange: (value: string[]) => void
  chiefComplaints?: string[]
  /** Diagnosis chips ordered by this doctor's usage frequency (from /api/doctor/personalized-chips) */
  presetDiagnoses?: string[]
  /** True once the doctor has enough history for personalised ordering */
  personalised?: boolean
}

const DIAGNOSIS_PRESETS = [
  { code: 'I10',    description: 'ارتفاع ضغط الدم الأساسي' },
  { code: 'E11.9',  description: 'داء السكري من النوع الثاني' },
  { code: 'J06.9',  description: 'التهاب الجهاز التنفسي العلوي' },
  { code: 'J00',    description: 'نزلة برد' },
  { code: 'K29.70', description: 'التهاب المعدة' },
  { code: 'R50.9',  description: 'حمى' },
  { code: 'J02.9',  description: 'التهاب البلعوم الحاد' },
  { code: 'J30.9',  description: 'التهاب الأنف التحسسي' },
  { code: 'M54.5',  description: 'ألم أسفل الظهر' },
  { code: 'N39.0',  description: 'التهاب المسالك البولية' },
  // Common in Egypt: thyroid disease, GERD, anaemia, anxiety, osteoarthritis
  { code: 'E03.9',  description: 'قصور الغدة الدرقية' },
  { code: 'K21.0',  description: 'ارتداد حمض المعدة (حرقة)' },
  { code: 'D50.9',  description: 'فقر الدم بنقص الحديد' },
  { code: 'F41.1',  description: 'اضطراب القلق المعمم' },
  { code: 'M17.11', description: 'هشاشة مفصل الركبة' },
]

export default function DiagnosisInput({
  value,
  onChange,
  chiefComplaints,
  presetDiagnoses,
  personalised = false,
}: DiagnosisInputProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ICD10Result[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [suggestedDiagnoses, setSuggestedDiagnoses] = useState<string[]>([])
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customDiagnosis, setCustomDiagnosis] = useState('')
  // Controls inline search input shown when doctor taps "+ إضافة تشخيص آخر"
  const [showAddMore, setShowAddMore] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const addMoreRef = useRef<HTMLInputElement>(null)
  const customInputRef = useRef<HTMLInputElement>(null)

  // Extract suggested diagnoses from chief complaints
  useEffect(() => {
    if (!chiefComplaints || chiefComplaints.length === 0) {
      setSuggestedDiagnoses([])
      return
    }

    const suggested = new Set<string>()
    chiefComplaints.forEach((complaint) => {
      const complaintLower = complaint.toLowerCase()
      Object.entries(COMPLAINT_TO_DIAGNOSIS).forEach(([key, diagnoses]) => {
        if (complaintLower.includes(key) || key.includes(complaintLower)) {
          diagnoses.forEach((dx) => suggested.add(dx))
        }
      })
    })

    setSuggestedDiagnoses(Array.from(suggested).slice(0, 5))
  }, [chiefComplaints])

  // Search ICD-10 codes as user types
  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      setShowDropdown(false)
      setShowCustomInput(false)
      return
    }

    const search = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/icd10/search?q=${encodeURIComponent(query)}`)
        const data = await response.json()
        setResults(data.results || [])
        setShowDropdown(true)
        setSelectedIndex(0)
        setShowCustomInput(false)
      } catch (error) {
        console.error('ICD-10 search error:', error)
        setResults([])
      } finally {
        setLoading(false)
      }
    }

    const debounce = setTimeout(search, 300)
    return () => clearTimeout(debounce)
  }, [query])

  // Show custom input option when no results
  useEffect(() => {
    if (showDropdown && query.length >= 2 && results.length === 0 && !loading) {
      setShowCustomInput(true)
    }
  }, [showDropdown, query, results.length, loading])

  const handlePresetSelect = (preset: (typeof DIAGNOSIS_PRESETS)[number]) => {
    const diagnosis = `${preset.code}: ${preset.description}`
    const newDiagnoses = [...value, diagnosis]
    onChange(newDiagnoses)
    setQuery('')
    setShowDropdown(false)
    setResults([])
    inputRef.current?.focus()
  }

  const handleSuggestedSelect = (diagnosis: string) => {
    const newDiagnoses = [...value, diagnosis]
    onChange(newDiagnoses)
    setQuery('')
    setShowDropdown(false)
    setResults([])
    setShowAddMore(false)
    inputRef.current?.focus()
  }

  const handleSelect = (result: ICD10Result) => {
    const diagnosis = `${result.code}: ${result.description}`
    const newDiagnoses = [...value, diagnosis]
    onChange(newDiagnoses)
    setQuery('')
    setShowDropdown(false)
    setResults([])
    setShowAddMore(false)
    inputRef.current?.focus()
  }

  const handleCustomDiagnosis = () => {
    if (customDiagnosis.trim()) {
      const newDiagnoses = [...value, customDiagnosis.trim()]
      onChange(newDiagnoses)
      setCustomDiagnosis('')
      setShowCustomInput(false)
      setQuery('')
      setShowDropdown(false)
      inputRef.current?.focus()
    }
  }

  const handleRemoveDiagnosis = (index: number) => {
    const newDiagnoses = value.filter((_, i) => i !== index)
    onChange(newDiagnoses)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault()
      handleSelect(results[selectedIndex])
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  const handleClearAll = () => {
    onChange([])
    setQuery('')
    inputRef.current?.focus()
  }

  const handleEditPrimary = () => {
    if (value.length > 0) {
      setQuery('')
      inputRef.current?.focus()
      onChange(value.slice(1))
    }
  }

  // Show primary diagnosis in confirmation box
  if (value.length > 0) {
    const primaryDiagnosis = value[0]
    const additionalCount = value.length - 1

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between p-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded-[10px]">
          <div>
            <p className="font-cairo font-semibold text-[#14532D] text-[13px]">{primaryDiagnosis}</p>
            <p className="font-cairo text-[12px] text-[#16A34A] mt-1">تم تأكيد التشخيص الرئيسي</p>
            {additionalCount > 0 && (
              <p className="font-cairo text-[11px] text-[#15803D] mt-1.5">+{additionalCount} تشخيص إضافي</p>
            )}
          </div>
          <button
            onClick={handleEditPrimary}
            className="font-cairo text-[12px] text-[#16A34A] hover:text-[#14532D] underline"
          >
            تعديل
          </button>
        </div>

        {/* Additional diagnoses list */}
        {additionalCount > 0 && (
          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] p-3">
            <p className="font-cairo text-[11px] font-semibold text-[#6B7280] mb-2">تشخيصات إضافية</p>
            <div className="space-y-1.5">
              {value.slice(1).map((diagnosis, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-3 py-2 bg-white border border-[#E5E7EB] rounded-[8px]"
                >
                  <p className="font-cairo text-[12px] text-[#030712]">{diagnosis}</p>
                  <button
                    onClick={() => handleRemoveDiagnosis(index + 1)}
                    className="font-cairo text-[11px] text-[#9CA3AF] hover:text-red-500 transition-colors"
                  >
                    حذف
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Inline search for adding more — shown when showAddMore=true */}
        {showAddMore && (
          <div className="space-y-2">
            <div className="relative">
              <input
                ref={addMoreRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ابحث عن تشخيص آخر..."
                autoFocus
                className="w-full px-4 py-2.5 border border-[#2563EB] rounded-[10px] text-[14px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#2563EB] bg-white"
              />
              <button
                onClick={() => { setShowAddMore(false); setQuery('') }}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {/* ICD-10 results dropdown */}
              {showDropdown && results.length > 0 && (
                <div className="absolute z-30 w-full mt-1 bg-white border border-[#E5E7EB] rounded-[12px] shadow-lg max-h-48 overflow-y-auto">
                  {results.map((result, index) => (
                    <button
                      key={result.code}
                      onClick={() => handleSelect(result)}
                      className={`w-full text-right px-4 py-3 hover:bg-[#F9FAFB] transition-colors border-b border-[#F3F4F6] last:border-0 ${
                        index === selectedIndex ? 'bg-[#EFF6FF]' : ''
                      }`}
                    >
                      <span className="font-cairo font-medium text-[13px] text-[#030712]">{result.description}</span>
                      <span className="font-mono text-[10px] text-[#9CA3AF] mr-2">{result.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Custom free-text option when no ICD results */}
            {showCustomInput && query.length >= 2 && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customDiagnosis}
                  onChange={(e) => setCustomDiagnosis(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCustomDiagnosis()}
                  placeholder="أو اكتب تشخيص مخصص..."
                  autoFocus
                  className="flex-1 px-3 py-2 border border-[#E5E7EB] rounded-[8px] text-[13px] font-cairo focus:outline-none"
                />
                <button
                  onClick={handleCustomDiagnosis}
                  disabled={!customDiagnosis.trim()}
                  className="px-3 py-2 bg-[#2563EB] text-white text-[12px] font-cairo font-semibold rounded-[8px] disabled:opacity-40"
                >
                  إضافة
                </button>
              </div>
            )}
          </div>
        )}

        {/* Add more button — shown when not already in add-more mode */}
        {!showAddMore && (
          <button
            onClick={() => { setShowAddMore(true); setQuery('') }}
            className="w-full font-cairo text-[12px] text-[#2563EB] hover:text-[#1D4ED8] font-semibold underline py-1"
          >
            + إضافة تشخيص آخر
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Preset diagnosis chips — personalised by doctor history or default Egyptian GP list */}
      <div>
        <p className="font-cairo text-[11px] font-semibold text-[#6B7280] mb-2">
          {personalised ? 'تشخيصاتك الأكثر استخداماً' : 'تشخيصات شائعة'}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(presetDiagnoses && presetDiagnoses.length > 0
            // Personalised free-text diagnoses (already formatted strings)
            ? presetDiagnoses.slice(0, 10).map((text) => (
                <button
                  key={text}
                  onClick={() => handleSuggestedSelect(text)}
                  className="px-3 py-1.5 bg-white border border-[#E5E7EB] text-[#4B5563] font-cairo text-[12px] rounded-full hover:border-[#2563EB] hover:text-[#2563EB] transition-colors"
                >
                  {text}
                </button>
              ))
            // Default ICD-10 coded presets
            : DIAGNOSIS_PRESETS.map((preset) => (
                <button
                  key={preset.code}
                  onClick={() => handlePresetSelect(preset)}
                  className="px-3 py-1.5 bg-white border border-[#E5E7EB] text-[#4B5563] font-cairo text-[12px] rounded-full hover:border-[#2563EB] hover:text-[#2563EB] transition-colors"
                >
                  {preset.description}
                </button>
              ))
          )}
        </div>
      </div>

      {/* Suggested diagnoses based on chief complaints */}
      {suggestedDiagnoses.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2 font-cairo">
            مقترحات بناءً على الشكوى
          </p>
          <div className="space-y-2">
            {suggestedDiagnoses.map((diagnosis, index) => (
              <button
                key={index}
                onClick={() => handleSuggestedSelect(diagnosis)}
                className="w-full text-left px-4 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-300 rounded-lg text-sm text-blue-900 transition-colors"
              >
                {diagnosis}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="بحث ICD-10 بالإنجليزية أو الكود..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none pr-10"
            autoComplete="off"
          />

          {loading && (
            <div className="absolute right-4 top-4">
              <div className="animate-spin w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full"></div>
            </div>
          )}
        </div>

        {/* Dropdown Results */}
        {showDropdown && results.length > 0 && (
          <div className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
            {results.map((result, index) => (
              <button
                key={`${result.code}-${index}`}
                onClick={() => handleSelect(result)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-b-0 transition-colors ${
                  index === selectedIndex
                    ? 'bg-primary-50 border-l-4 border-l-primary-600'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="font-mono font-semibold text-primary-600 text-sm">
                    {result.code}
                  </span>
                  <span className="text-gray-900 flex-1">{result.description}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* No ICD results hint — still shows below the search results if they exist */}
        {showDropdown && query.length >= 2 && results.length === 0 && !loading && (
          <div className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-xl p-3">
            <p className="text-sm text-gray-500 font-cairo">لا توجد نتائج — استخدم حقل الإضافة اليدوية أدناه</p>
          </div>
        )}
      </div>

      {/* ===== ALWAYS-VISIBLE MANUAL DIAGNOSIS ENTRY ===== */}
      {/* Doctor can type any diagnosis text that isn't in ICD-10 */}
      <div className="flex gap-2 mt-2">
        <input
          ref={customInputRef}
          type="text"
          value={customDiagnosis}
          onChange={(e) => setCustomDiagnosis(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCustomDiagnosis() }}
          placeholder="أو اكتب تشخيصاً مخصصاً (Enter للإضافة)..."
          className="flex-1 px-3 py-2.5 border border-gray-200 rounded-[10px] focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-[13px] font-cairo bg-white"
          autoComplete="off"
        />
        {customDiagnosis.trim() && (
          <button
            type="button"
            onClick={handleCustomDiagnosis}
            className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-[12px] rounded-[10px] font-cairo font-semibold transition-colors whitespace-nowrap"
          >
            + إضافة
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400 font-cairo mt-1">
        اكتب حرفين للبحث في ICD-10، أو استخدم حقل التشخيص المخصص أعلاه.
      </p>
    </div>
  )
}
