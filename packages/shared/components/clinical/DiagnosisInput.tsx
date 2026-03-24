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
}

const DIAGNOSIS_PRESETS = [
  { code: 'I10', description: 'Essential Hypertension' },
  { code: 'E11.9', description: 'Type 2 DM' },
  { code: 'J06.9', description: 'URI' },
  { code: 'J00', description: 'Common Cold' },
  { code: 'K29.70', description: 'Gastritis' },
  { code: 'R50.9', description: 'Fever' },
  { code: 'J02.9', description: 'Acute Pharyngitis' },
  { code: 'J30.9', description: 'Allergic Rhinitis' },
  { code: 'M54.5', description: 'Low Back Pain' },
  { code: 'N39.0', description: 'UTI' },
]

export default function DiagnosisInput({
  value,
  onChange,
  chiefComplaints,
}: DiagnosisInputProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ICD10Result[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [suggestedDiagnoses, setSuggestedDiagnoses] = useState<string[]>([])
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customDiagnosis, setCustomDiagnosis] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
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
    inputRef.current?.focus()
  }

  const handleSelect = (result: ICD10Result) => {
    const diagnosis = `${result.code}: ${result.description}`
    const newDiagnoses = [...value, diagnosis]
    onChange(newDiagnoses)
    setQuery('')
    setShowDropdown(false)
    setResults([])
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
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-success-50 border border-success-200 rounded-lg">
          <div>
            <p className="font-semibold text-success-900">{primaryDiagnosis}</p>
            <p className="text-sm text-success-700 mt-1">Primary diagnosis confirmed</p>
            {additionalCount > 0 && (
              <p className="text-xs text-success-600 mt-2">{additionalCount} additional diagnosis</p>
            )}
          </div>
          <button
            onClick={handleEditPrimary}
            className="text-sm text-success-600 hover:text-success-700 underline"
          >
            Change
          </button>
        </div>

        {/* Additional diagnoses */}
        {additionalCount > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-700 mb-3 uppercase">Additional Diagnoses</p>
            <div className="space-y-2">
              {value.slice(1).map((diagnosis, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                >
                  <p className="text-sm text-gray-900">{diagnosis}</p>
                  <button
                    onClick={() => handleRemoveDiagnosis(index + 1)}
                    className="text-xs text-gray-500 hover:text-red-600 font-semibold"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add more diagnoses button */}
        <button
          onClick={() => {
            setQuery('')
            inputRef.current?.focus()
          }}
          className="w-full text-sm text-primary-600 hover:text-primary-700 font-semibold underline py-2"
        >
          Add more diagnoses
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Preset diagnosis chips */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2 uppercase">Common Diagnoses</p>
        <div className="flex flex-wrap gap-2">
          {DIAGNOSIS_PRESETS.map((preset) => (
            <button
              key={preset.code}
              onClick={() => handlePresetSelect(preset)}
              className="px-4 py-2 bg-gray-100 hover:bg-primary-100 text-gray-900 text-sm rounded-full border border-gray-200 hover:border-primary-300 transition-colors"
            >
              {preset.description}
            </button>
          ))}
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
