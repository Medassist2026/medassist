'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

// ============================================================================
// TYPES
// ============================================================================

export interface IntakeMedication {
  id: string
  drugName: string
  genericName?: string
  dosage: string
  frequency: string
  prescriber?: string
  condition?: string
  duration?: string
  stillTaking: boolean
}

interface DrugSearchResult {
  id: string
  name: string
  nameAr?: string
  genericName?: string
  strength?: string
  form?: string
  category?: string
}

interface MedicationIntakeFormProps {
  /** Existing intake medications (for editing) */
  initialMedications?: IntakeMedication[]
  /** Called when medications are saved */
  onSave: (medications: IntakeMedication[]) => Promise<void>
  /** Whether in a saving state */
  isSaving?: boolean
  /** Optional: compact mode for embedding inside session */
  compact?: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COMMON_FREQUENCIES = [
  'Once daily',
  'Twice daily',
  'Three times daily',
  'As needed',
  'Once weekly',
  'Every other day',
]

const COMMON_DURATIONS = [
  'Less than 1 month',
  '1-3 months',
  '3-6 months',
  '6-12 months',
  '1-2 years',
  'More than 2 years',
  "Don't remember",
]

const COMMON_CONDITIONS = [
  'Blood Pressure',
  'Diabetes',
  'Cholesterol',
  'Heart Condition',
  'Thyroid',
  'Asthma',
  'Allergy',
  'Pain',
  'Stomach/GI',
  'Depression/Anxiety',
  'Epilepsy',
  'Other',
]

// ============================================================================
// INLINE DRUG SEARCH
// ============================================================================

function InlineDrugSearch({
  value,
  onChange,
  onSelect,
}: {
  value: string
  onChange: (v: string) => void
  onSelect: (drug: DrugSearchResult) => void
}) {
  const [results, setResults] = useState<DrugSearchResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const searchDrugs = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      setShowDropdown(false)
      return
    }
    setIsSearching(true)
    try {
      const res = await fetch(`/api/drugs/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.results || [])
      setShowDropdown(true)
    } catch {
      // Silently fail — patient can still type manually
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleChange = (val: string) => {
    onChange(val)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => searchDrugs(val), 250)
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => results.length > 0 && setShowDropdown(true)}
        placeholder="Type medication name..."
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500 outline-none"
        dir="auto"
      />
      {isSearching && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <div className="animate-spin h-4 w-4 border-2 border-secondary-300 border-t-secondary-600 rounded-full"></div>
        </div>
      )}
      {showDropdown && results.length > 0 && (
        <div ref={dropdownRef} className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((drug, idx) => (
            <button
              key={drug.id || idx}
              type="button"
              onClick={() => {
                onSelect(drug)
                setShowDropdown(false)
              }}
              className="w-full text-left px-3 py-2 hover:bg-secondary-50 text-sm border-b last:border-b-0"
            >
              <span className="font-medium text-gray-900">{drug.name}</span>
              {drug.nameAr && <span className="text-gray-400 text-xs ml-2" dir="rtl">{drug.nameAr}</span>}
              {drug.genericName && (
                <div className="text-xs text-gray-500">{drug.genericName}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// CHIP SELECT (reusable for frequency, duration, condition)
// ============================================================================

function ChipSelect({
  options,
  value,
  onChange,
  label,
  allowCustom,
}: {
  options: string[]
  value: string
  onChange: (v: string) => void
  label: string
  allowCustom?: boolean
}) {
  const [showCustom, setShowCustom] = useState(false)

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => {
              onChange(opt)
              setShowCustom(false)
            }}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              value === opt
                ? 'bg-secondary-100 border-secondary-400 text-secondary-800 font-medium'
                : 'bg-white border-gray-200 text-gray-600 hover:border-secondary-300'
            }`}
          >
            {opt}
          </button>
        ))}
        {allowCustom && (
          <button
            type="button"
            onClick={() => setShowCustom(!showCustom)}
            className="px-2.5 py-1 text-xs rounded-full border border-dashed border-gray-300 text-gray-400 hover:border-gray-400"
          >
            Other...
          </button>
        )}
      </div>
      {showCustom && (
        <input
          type="text"
          value={options.includes(value) ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type custom value..."
          className="mt-1.5 w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 outline-none"
          autoFocus
        />
      )}
    </div>
  )
}

// ============================================================================
// SINGLE MEDICATION ENTRY ROW
// ============================================================================

function MedicationEntryRow({
  medication,
  onChange,
  onRemove,
  index,
}: {
  medication: IntakeMedication
  onChange: (med: IntakeMedication) => void
  onRemove: () => void
  index: number
}) {
  const [expanded, setExpanded] = useState(!medication.drugName) // Auto-expand new entries

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Collapsed header */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xs text-gray-400 font-mono w-5 flex-shrink-0">{index + 1}.</span>
        <div className="flex-1 min-w-0">
          {medication.drugName ? (
            <div>
              <span className="font-medium text-sm text-gray-900">{medication.drugName}</span>
              {medication.dosage && (
                <span className="text-xs text-gray-500 ml-2">{medication.dosage}</span>
              )}
              {medication.frequency && (
                <span className="text-xs text-gray-400 ml-1">· {medication.frequency}</span>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                {medication.stillTaking ? (
                  <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">Active</span>
                ) : (
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">Stopped</span>
                )}
                {medication.condition && (
                  <span className="text-xs text-gray-400">for {medication.condition}</span>
                )}
              </div>
            </div>
          ) : (
            <span className="text-sm text-gray-400 italic">New medication...</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="p-1 text-gray-300 hover:text-red-500 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-3">
          {/* Drug name search */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Medication Name *</label>
            <InlineDrugSearch
              value={medication.drugName}
              onChange={(v) => onChange({ ...medication, drugName: v })}
              onSelect={(drug) => onChange({
                ...medication,
                drugName: drug.name,
                genericName: drug.genericName,
                dosage: drug.strength || medication.dosage,
              })}
            />
          </div>

          {/* Dosage - free text */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dosage</label>
            <input
              type="text"
              value={medication.dosage}
              onChange={(e) => onChange({ ...medication, dosage: e.target.value })}
              placeholder="e.g., 500mg, 10ml, 1 tablet"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 outline-none"
            />
          </div>

          {/* Frequency chips */}
          <ChipSelect
            label="How often do you take it?"
            options={COMMON_FREQUENCIES}
            value={medication.frequency}
            onChange={(v) => onChange({ ...medication, frequency: v })}
            allowCustom
          />

          {/* Condition chips */}
          <ChipSelect
            label="What is it for?"
            options={COMMON_CONDITIONS}
            value={medication.condition || ''}
            onChange={(v) => onChange({ ...medication, condition: v })}
            allowCustom
          />

          {/* Duration chips */}
          <ChipSelect
            label="How long have you been taking it?"
            options={COMMON_DURATIONS}
            value={medication.duration || ''}
            onChange={(v) => onChange({ ...medication, duration: v })}
          />

          {/* Still taking? */}
          <div className="flex items-center gap-3 pt-1">
            <label className="text-xs font-medium text-gray-600">Still taking?</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...medication, stillTaking: true })}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  medication.stillTaking
                    ? 'bg-green-100 border-green-400 text-green-800 font-medium'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-green-300'
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...medication, stillTaking: false })}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  !medication.stillTaking
                    ? 'bg-gray-200 border-gray-400 text-gray-800 font-medium'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                No, stopped
              </button>
            </div>
          </div>

          {/* Prescriber (optional) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Prescribed by (optional)</label>
            <input
              type="text"
              value={medication.prescriber || ''}
              onChange={(e) => onChange({ ...medication, prescriber: e.target.value })}
              placeholder="Doctor name or clinic"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-secondary-500 outline-none"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN MEDICATION INTAKE FORM
// ============================================================================

let idCounter = 0
function generateId() {
  return `intake_${Date.now()}_${++idCounter}`
}

function createEmptyMedication(): IntakeMedication {
  return {
    id: generateId(),
    drugName: '',
    dosage: '',
    frequency: '',
    stillTaking: true,
  }
}

export default function MedicationIntakeForm({
  initialMedications,
  onSave,
  isSaving,
  compact,
}: MedicationIntakeFormProps) {
  const [medications, setMedications] = useState<IntakeMedication[]>(
    initialMedications && initialMedications.length > 0
      ? initialMedications
      : [createEmptyMedication()]
  )
  const [noMedications, setNoMedications] = useState(false)

  const updateMedication = (index: number, updated: IntakeMedication) => {
    setMedications(prev => prev.map((m, i) => i === index ? updated : m))
  }

  const removeMedication = (index: number) => {
    if (medications.length === 1) {
      // Keep at least one row or let them say "no meds"
      setMedications([createEmptyMedication()])
    } else {
      setMedications(prev => prev.filter((_, i) => i !== index))
    }
  }

  const addMedication = () => {
    setMedications(prev => [...prev, createEmptyMedication()])
    setNoMedications(false)
  }

  const handleNoMedications = () => {
    setNoMedications(true)
    setMedications([])
  }

  const handleSave = async () => {
    if (noMedications) {
      await onSave([])
      return
    }
    // Filter out empty entries
    const validMeds = medications.filter(m => m.drugName.trim().length > 0)
    await onSave(validMeds)
  }

  const validCount = noMedications ? 0 : medications.filter(m => m.drugName.trim()).length

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {/* Header (non-compact only) */}
      {!compact && (
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Current Medications</h2>
            <p className="text-sm text-gray-500 mt-1">
              Please list all medications you are currently taking or have recently stopped.
              This helps your doctor make safe prescribing decisions.
            </p>
          </div>
        </div>
      )}

      {/* No medications option */}
      {!noMedications && medications.length <= 1 && !medications[0]?.drugName && (
        <button
          type="button"
          onClick={handleNoMedications}
          className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-secondary-300 hover:bg-secondary-50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-100 group-hover:bg-secondary-100 flex items-center justify-center text-gray-400 group-hover:text-secondary-600 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-secondary-700">
                I'm not taking any medications
              </span>
              <p className="text-xs text-gray-400">Tap here if you don't take any regular medications</p>
            </div>
          </div>
        </button>
      )}

      {/* No medications state */}
      {noMedications && (
        <div className="text-center py-6 bg-gray-50 rounded-lg">
          <div className="text-3xl mb-2">✅</div>
          <p className="text-sm text-gray-600 font-medium">No current medications</p>
          <button
            type="button"
            onClick={() => {
              setNoMedications(false)
              setMedications([createEmptyMedication()])
            }}
            className="text-xs text-secondary-600 hover:text-secondary-700 mt-2 underline"
          >
            Actually, I want to add some
          </button>
        </div>
      )}

      {/* Medication entries */}
      {!noMedications && (
        <div className="space-y-2">
          {medications.map((med, index) => (
            <MedicationEntryRow
              key={med.id}
              medication={med}
              onChange={(updated) => updateMedication(index, updated)}
              onRemove={() => removeMedication(index)}
              index={index}
            />
          ))}

          {/* Add another button */}
          <button
            type="button"
            onClick={addMedication}
            className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-secondary-400 hover:text-secondary-600 hover:bg-secondary-50 font-medium transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add another medication
          </button>
        </div>
      )}

      {/* Summary + Save */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div className="text-sm text-gray-500">
          {noMedications ? (
            'No medications to report'
          ) : validCount === 0 ? (
            'No medications added yet'
          ) : (
            <>{validCount} medication{validCount > 1 ? 's' : ''} listed</>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || (!noMedications && validCount === 0)}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            isSaving || (!noMedications && validCount === 0)
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-secondary-600 hover:bg-secondary-700 text-white shadow-sm'
          }`}
        >
          {isSaving ? 'Saving...' : compact ? 'Save' : 'Save Medication List'}
        </button>
      </div>
    </div>
  )
}
