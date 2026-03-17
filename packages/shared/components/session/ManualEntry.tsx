'use client'

import { useState, useEffect, useRef } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface ManualEntryItem {
  id: string
  value: string
  isCustom: boolean
}

interface ManualEntryProps {
  category: 'diagnosis' | 'medication' | 'procedure' | 'allergy' | 'symptom' | 'vital'
  label: string
  placeholder?: string
  suggestions?: string[]
  value: ManualEntryItem[]
  onChange: (items: ManualEntryItem[]) => void
  allowMultiple?: boolean
  required?: boolean
  helperText?: string
}

// ============================================================================
// SUGGESTION DATABASES (Mock - in production, fetch from API)
// ============================================================================

const SUGGESTIONS: Record<string, string[]> = {
  diagnosis: [
    'Type 2 Diabetes Mellitus',
    'Essential Hypertension',
    'Hyperlipidemia',
    'Upper Respiratory Infection',
    'Gastroesophageal Reflux Disease',
    'Acute Bronchitis',
    'Urinary Tract Infection',
    'Migraine',
    'Allergic Rhinitis',
    'Asthma'
  ],
  medication: [
    'Metformin 500mg',
    'Lisinopril 10mg',
    'Atorvastatin 20mg',
    'Omeprazole 20mg',
    'Amlodipine 5mg',
    'Metoprolol 25mg',
    'Losartan 50mg',
    'Levothyroxine 50mcg',
    'Gabapentin 300mg',
    'Pantoprazole 40mg'
  ],
  procedure: [
    'Blood Pressure Measurement',
    'Blood Glucose Test',
    'ECG/EKG',
    'Wound Dressing',
    'Injection (IM)',
    'IV Cannulation',
    'Suturing',
    'Nebulization',
    'Urinalysis',
    'Spirometry'
  ],
  allergy: [
    'Penicillin',
    'Sulfa Drugs',
    'Aspirin',
    'NSAIDs',
    'Latex',
    'Iodine Contrast',
    'Codeine',
    'Shellfish',
    'Peanuts',
    'Eggs'
  ],
  symptom: [
    'Headache',
    'Fever',
    'Cough',
    'Fatigue',
    'Chest Pain',
    'Shortness of Breath',
    'Abdominal Pain',
    'Nausea',
    'Dizziness',
    'Back Pain'
  ],
  vital: [
    'Blood Pressure',
    'Heart Rate',
    'Temperature',
    'Respiratory Rate',
    'Oxygen Saturation',
    'Weight',
    'Height',
    'BMI',
    'Blood Glucose',
    'Pain Score'
  ]
}

// ============================================================================
// MANUAL ENTRY COMPONENT (UX-D001)
// ============================================================================

export function ManualEntry({
  category,
  label,
  placeholder,
  suggestions: customSuggestions,
  value,
  onChange,
  allowMultiple = true,
  required = false,
  helperText
}: ManualEntryProps) {
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const allSuggestions = customSuggestions || SUGGESTIONS[category] || []

  // Filter suggestions based on input
  const filteredSuggestions = allSuggestions.filter(s =>
    s.toLowerCase().includes(inputValue.toLowerCase()) &&
    !value.some(v => v.value.toLowerCase() === s.toLowerCase())
  )

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    setShowSuggestions(true)
    setHighlightedIndex(-1)
  }

  // Add item (from suggestion or custom)
  const addItem = (itemValue: string, isCustom: boolean = false) => {
    if (!itemValue.trim()) return
    
    const newItem: ManualEntryItem = {
      id: Math.random().toString(36).substring(7),
      value: itemValue.trim(),
      isCustom
    }

    if (allowMultiple) {
      onChange([...value, newItem])
    } else {
      onChange([newItem])
    }

    setInputValue('')
    setShowSuggestions(false)
    setHighlightedIndex(-1)
  }

  // Remove item
  const removeItem = (id: string) => {
    onChange(value.filter(v => v.id !== id))
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(prev => 
        prev < filteredSuggestions.length - 1 ? prev + 1 : prev
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightedIndex >= 0 && highlightedIndex < filteredSuggestions.length) {
        addItem(filteredSuggestions[highlightedIndex], false)
      } else if (inputValue.trim()) {
        // Check if it matches a suggestion
        const match = allSuggestions.find(s => 
          s.toLowerCase() === inputValue.toLowerCase()
        )
        addItem(inputValue, !match)
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setHighlightedIndex(-1)
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      // Remove last item on backspace if input is empty
      removeItem(value[value.length - 1].id)
    }
  }

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        inputRef.current && !inputRef.current.contains(e.target as Node) &&
        suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && suggestionsRef.current) {
      const items = suggestionsRef.current.querySelectorAll('[data-suggestion]')
      items[highlightedIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  return (
    <div className="space-y-2">
      {/* Label */}
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Input Container */}
      <div className="relative">
        <div className={`
          flex flex-wrap gap-2 p-2 border rounded-lg bg-white
          focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500
          ${value.length > 0 ? 'border-gray-300' : 'border-gray-300'}
        `}>
          {/* Selected Items */}
          {value.map(item => (
            <span
              key={item.id}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm ${
                item.isCustom 
                  ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' 
                  : 'bg-primary-100 text-primary-800'
              }`}
            >
              {item.value}
              {item.isCustom && (
                <span title="Custom entry" className="text-yellow-600">✎</span>
              )}
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="ml-1 hover:text-red-600"
              >
                ×
              </button>
            </span>
          ))}

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? (placeholder || `Add ${label.toLowerCase()}...`) : ''}
            className="flex-1 min-w-[150px] outline-none text-sm py-1"
          />
        </div>

        {/* Suggestions Dropdown */}
        {showSuggestions && (filteredSuggestions.length > 0 || inputValue.trim()) && (
          <div
            ref={suggestionsRef}
            className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
          >
            {/* Filtered Suggestions */}
            {filteredSuggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                data-suggestion
                onClick={() => addItem(suggestion, false)}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 ${
                  index === highlightedIndex ? 'bg-primary-50 text-primary-700' : ''
                }`}
              >
                {suggestion}
              </button>
            ))}

            {/* Custom Entry Option */}
            {inputValue.trim() && !allSuggestions.some(s => 
              s.toLowerCase() === inputValue.toLowerCase()
            ) && (
              <>
                {filteredSuggestions.length > 0 && <hr className="border-gray-100" />}
                <button
                  onClick={() => addItem(inputValue, true)}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-yellow-50 flex items-center gap-2 ${
                    highlightedIndex === filteredSuggestions.length ? 'bg-yellow-50' : ''
                  }`}
                >
                  <span className="text-yellow-600">✎</span>
                  <span>Add custom: <strong>"{inputValue}"</strong></span>
                </button>
              </>
            )}

            {/* No Results */}
            {filteredSuggestions.length === 0 && !inputValue.trim() && (
              <div className="px-4 py-3 text-sm text-gray-500">
                Start typing to see suggestions...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Helper Text */}
      {helperText && (
        <p className="text-xs text-gray-500">{helperText}</p>
      )}

      {/* Custom Entry Legend */}
      {value.some(v => v.isCustom) && (
        <p className="text-xs text-yellow-600 flex items-center gap-1">
          <span>✎</span> Custom entries (not from standard list)
        </p>
      )}
    </div>
  )
}

// ============================================================================
// VITAL SIGNS MANUAL ENTRY
// ============================================================================

interface VitalSign {
  id: string
  name: string
  value: string
  unit: string
}

interface VitalSignsEntryProps {
  value: VitalSign[]
  onChange: (vitals: VitalSign[]) => void
}

const VITAL_TEMPLATES = [
  { name: 'Blood Pressure', unit: 'mmHg', placeholder: '120/80' },
  { name: 'Heart Rate', unit: 'bpm', placeholder: '72' },
  { name: 'Temperature', unit: '°C', placeholder: '36.5' },
  { name: 'Respiratory Rate', unit: '/min', placeholder: '16' },
  { name: 'Oxygen Saturation', unit: '%', placeholder: '98' },
  { name: 'Weight', unit: 'kg', placeholder: '70' },
  { name: 'Height', unit: 'cm', placeholder: '175' }
]

export function VitalSignsEntry({ value, onChange }: VitalSignsEntryProps) {
  const [showCustom, setShowCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customValue, setCustomValue] = useState('')
  const [customUnit, setCustomUnit] = useState('')

  const updateVital = (id: string, newValue: string) => {
    onChange(value.map(v => v.id === id ? { ...v, value: newValue } : v))
  }

  const addVital = (template: typeof VITAL_TEMPLATES[0]) => {
    const exists = value.some(v => v.name === template.name)
    if (exists) return

    onChange([...value, {
      id: Math.random().toString(36).substring(7),
      name: template.name,
      value: '',
      unit: template.unit
    }])
  }

  const addCustomVital = () => {
    if (!customName.trim() || !customValue.trim()) return

    onChange([...value, {
      id: Math.random().toString(36).substring(7),
      name: customName.trim(),
      value: customValue.trim(),
      unit: customUnit.trim()
    }])

    setCustomName('')
    setCustomValue('')
    setCustomUnit('')
    setShowCustom(false)
  }

  const removeVital = (id: string) => {
    onChange(value.filter(v => v.id !== id))
  }

  const unusedTemplates = VITAL_TEMPLATES.filter(t => 
    !value.some(v => v.name === t.name)
  )

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">Vital Signs</label>

      {/* Quick Add Buttons */}
      {unusedTemplates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {unusedTemplates.map(template => (
            <button
              key={template.name}
              type="button"
              onClick={() => addVital(template)}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200"
            >
              + {template.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded-full hover:bg-yellow-200"
          >
            + Custom
          </button>
        </div>
      )}

      {/* Vital Signs List */}
      <div className="space-y-2">
        {value.map(vital => (
          <div key={vital.id} className="flex items-center gap-2">
            <div className="w-40 text-sm font-medium text-gray-700">{vital.name}</div>
            <input
              type="text"
              value={vital.value}
              onChange={(e) => updateVital(vital.id, e.target.value)}
              placeholder={VITAL_TEMPLATES.find(t => t.name === vital.name)?.placeholder}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <span className="text-sm text-gray-500 w-16">{vital.unit}</span>
            <button
              type="button"
              onClick={() => removeVital(vital.id)}
              className="p-1 text-gray-400 hover:text-red-600"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Custom Vital Modal */}
      {showCustom && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-medium text-yellow-800">Add Custom Vital Sign</h4>
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Name"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <input
              type="text"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              placeholder="Value"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <input
              type="text"
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value)}
              placeholder="Unit"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addCustomVital}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm hover:bg-yellow-700"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowCustom(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// EXAMPLE SESSION FORM INTEGRATION
// ============================================================================

/*
Usage in Session Form:

import { ManualEntry, VitalSignsEntry } from '@shared/components/session/ManualEntry'

function SessionForm() {
  const [diagnoses, setDiagnoses] = useState([])
  const [medications, setMedications] = useState([])
  const [vitals, setVitals] = useState([])

  return (
    <form>
      <ManualEntry
        category="diagnosis"
        label="Diagnosis"
        value={diagnoses}
        onChange={setDiagnoses}
        allowMultiple={true}
        helperText="Select from suggestions or type custom diagnosis"
      />

      <ManualEntry
        category="medication"
        label="Medications"
        value={medications}
        onChange={setMedications}
        allowMultiple={true}
      />

      <VitalSignsEntry
        value={vitals}
        onChange={setVitals}
      />
    </form>
  )
}
*/

export default ManualEntry
