'use client'

import { useState } from 'react'

interface Medication {
  name: string
  type: 'pill' | 'syrup' | 'injection' | 'cream' | 'inhaler' | 'drops' | 'other'
  frequency: string
  duration: string
  endDate?: string  // Calculated end date
  notes?: string
  taperingInstructions?: string  // Option B: Simple text field for tapering
}

interface MedicationListProps {
  medications: Medication[]
  onChange: (medications: Medication[]) => void
}

const MEDICATION_TYPES = [
  { value: 'pill', label: '💊 Pill/Tablet' },
  { value: 'syrup', label: '🥤 Syrup' },
  { value: 'injection', label: '💉 Injection' },
  { value: 'cream', label: '🧴 Cream/Ointment' },
  { value: 'inhaler', label: '🫁 Inhaler' },
  { value: 'drops', label: '💧 Drops (Eye/Ear)' },
  { value: 'other', label: '📋 Other' },
] as const

const FREQUENCY_BY_TYPE: Record<string, Array<{ value: string, label: string, shorthand: string }>> = {
  pill: [
    { value: '1-pill-once-daily', label: '1 pill once daily', shorthand: '1 OD' },
    { value: '1-pill-twice-daily', label: '1 pill twice daily', shorthand: '1 BD' },
    { value: '1-pill-three-times-daily', label: '1 pill three times daily', shorthand: '1 TDS' },
    { value: '1-pill-every-6-hours', label: '1 pill every 6 hours', shorthand: '1 q6h' },
    { value: '2-pills-once-daily', label: '2 pills once daily', shorthand: '2 OD' },
    { value: '2-pills-twice-daily', label: '2 pills twice daily', shorthand: '2 BD' },
    { value: '1-pill-as-needed', label: '1 pill as needed', shorthand: '1 PRN' },
  ],
  syrup: [
    { value: '5ml-once-daily', label: '5ml once daily', shorthand: '5ml OD' },
    { value: '5ml-twice-daily', label: '5ml twice daily', shorthand: '5ml BD' },
    { value: '10ml-three-times-daily', label: '10ml three times daily', shorthand: '10ml TDS' },
    { value: '5ml-every-8-hours', label: '5ml every 8 hours', shorthand: '5ml q8h' },
  ],
  injection: [
    { value: '1-inj-once-daily', label: '1 injection once daily', shorthand: '1 inj OD' },
    { value: '1-inj-twice-daily', label: '1 injection twice daily', shorthand: '1 inj BD' },
    { value: '1-inj-once-weekly', label: '1 injection once weekly', shorthand: '1 inj weekly' },
  ],
  cream: [
    { value: 'apply-twice-daily', label: 'Apply twice daily', shorthand: 'Apply BD' },
    { value: 'apply-three-times-daily', label: 'Apply three times daily', shorthand: 'Apply TDS' },
    { value: 'apply-as-needed', label: 'Apply as needed', shorthand: 'Apply PRN' },
  ],
  inhaler: [
    { value: '2-puffs-twice-daily', label: '2 puffs twice daily', shorthand: '2 puffs BD' },
    { value: '2-puffs-as-needed', label: '2 puffs as needed', shorthand: '2 puffs PRN' },
    { value: '1-puff-four-times-daily', label: '1 puff four times daily', shorthand: '1 puff QDS' },
  ],
  drops: [
    { value: '2-drops-twice-daily', label: '2 drops twice daily', shorthand: '2 drops BD' },
    { value: '1-drop-three-times-daily', label: '1 drop three times daily', shorthand: '1 drop TDS' },
    { value: '2-drops-every-4-hours', label: '2 drops every 4 hours', shorthand: '2 drops q4h' },
  ],
  other: [
    { value: 'once-daily', label: 'Once daily', shorthand: 'OD' },
    { value: 'twice-daily', label: 'Twice daily', shorthand: 'BD' },
    { value: 'three-times-daily', label: '3x daily', shorthand: 'TDS' },
    { value: 'as-needed', label: 'As needed', shorthand: 'PRN' },
  ],
}

const FREQUENCIES = [
  { value: 'once-daily', label: 'Once daily', shorthand: 'OD' },
  { value: 'twice-daily', label: 'Twice daily', shorthand: 'BD' },
  { value: 'three-times-daily', label: '3x daily', shorthand: 'TDS' },
  { value: 'four-times-daily', label: '4x daily', shorthand: 'QDS' },
  { value: 'as-needed', label: 'As needed', shorthand: 'PRN' },
]

const DURATIONS = [
  { value: '3-days', label: '3 days', days: 3 },
  { value: '5-days', label: '5 days', days: 5 },
  { value: '7-days', label: '7 days', days: 7 },
  { value: '10-days', label: '10 days', days: 10 },
  { value: '14-days', label: '14 days', days: 14 },
  { value: '1-month', label: '1 month', days: 30 },
  { value: 'ongoing', label: 'Ongoing', days: null },
]

// Helper function to calculate end date
function calculateEndDate(durationValue: string): string | null {
  const duration = DURATIONS.find(d => d.value === durationValue)
  if (!duration || !duration.days) return null
  
  const today = new Date()
  const endDate = new Date(today)
  endDate.setDate(today.getDate() + duration.days)
  
  return endDate.toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  })
}

export default function MedicationList({ medications, onChange }: MedicationListProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  
  const addMedication = () => {
    setShowAddForm(true)
  }
  
  const removeMedication = (index: number) => {
    onChange(medications.filter((_, i) => i !== index))
  }
  
  const updateMedication = (index: number, updates: Partial<Medication>) => {
    const updated = [...medications]
    updated[index] = { ...updated[index], ...updates }
    onChange(updated)
  }
  
  return (
    <div className="space-y-4">
      {/* Existing Medications */}
      {medications.map((med, index) => (
        <div key={index} className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-gray-900">{med.name}</p>
                <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded">
                  {MEDICATION_TYPES.find(t => t.value === med.type)?.label || med.type}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {(() => {
                  const freqList = FREQUENCY_BY_TYPE[med.type] || FREQUENCIES
                  const freq = freqList.find(f => f.value === med.frequency)
                  return freq?.label || med.frequency
                })()}
                {' • '}
                {DURATIONS.find(d => d.value === med.duration)?.label}
                {med.endDate && ` (ends ${med.endDate})`}
              </p>
              {med.taperingInstructions && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm">
                  <p className="font-medium text-amber-900">📋 Tapering Instructions:</p>
                  <p className="text-amber-800 mt-1">{med.taperingInstructions}</p>
                </div>
              )}
              {med.notes && (
                <p className="text-sm text-gray-600 mt-2 italic">Note: {med.notes}</p>
              )}
            </div>
            <button
              onClick={() => removeMedication(index)}
              className="text-red-600 hover:text-red-700 text-sm font-medium ml-4"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      
      {/* Add Medication Form */}
      {showAddForm ? (
        <AddMedicationForm
          onAdd={(med) => {
            onChange([...medications, med])
            setShowAddForm(false)
          }}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <button
          onClick={addMedication}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-primary-500 hover:text-primary-600 font-medium transition-colors"
        >
          + Add Medication
        </button>
      )}
      
      {medications.length === 0 && !showAddForm && (
        <p className="text-sm text-gray-500 text-center py-4">
          No medications added yet. Click above to add.
        </p>
      )}
    </div>
  )
}

interface AddMedicationFormProps {
  onAdd: (medication: Medication) => void
  onCancel: () => void
}

function AddMedicationForm({ onAdd, onCancel }: AddMedicationFormProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ name: string }>>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedDrug, setSelectedDrug] = useState('')
  const [medicationType, setMedicationType] = useState<Medication['type']>('pill')
  const [frequency, setFrequency] = useState('')
  const [duration, setDuration] = useState('')
  const [notes, setNotes] = useState('')
  const [taperingInstructions, setTaperingInstructions] = useState('')
  const [showTapering, setShowTapering] = useState(false)
  
  // Search drugs
  const searchDrugs = async (q: string) => {
    if (q.length < 2) {
      setResults([])
      return
    }
    
    try {
      const response = await fetch(`/api/drugs/search?q=${encodeURIComponent(q)}`)
      const data = await response.json()
      setResults(data.results || [])
      setShowDropdown(true)
    } catch (error) {
      console.error('Drug search error:', error)
    }
  }
  
  const handleDrugSelect = (drugName: string) => {
    setSelectedDrug(drugName)
    setQuery('')
    setShowDropdown(false)
  }
  
  const handleSubmit = () => {
    if (!selectedDrug || !medicationType || !frequency || !duration) {
      return
    }
    
    const endDate = calculateEndDate(duration)
    
    onAdd({
      name: selectedDrug,
      type: medicationType,
      frequency,
      duration,
      endDate: endDate || undefined,
      notes: notes || undefined,
      taperingInstructions: taperingInstructions || undefined
    })
  }
  
  return (
    <div className="p-4 bg-primary-50 border-2 border-primary-200 rounded-lg space-y-4">
      {/* Drug Selection */}
      {!selectedDrug ? (
        <div className="relative">
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Drug Name
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              searchDrugs(e.target.value)
            }}
            placeholder="Search drug name..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            autoFocus
          />
          
          {showDropdown && results.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {results.map((drug, index) => (
                <button
                  key={index}
                  onClick={() => handleDrugSelect(drug.name)}
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 border-b last:border-b-0"
                >
                  {drug.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Selected Drug
          </label>
          <div className="flex items-center justify-between p-3 bg-white border border-gray-300 rounded-lg">
            <span className="font-semibold text-gray-900">{selectedDrug}</span>
            <button
              onClick={() => setSelectedDrug('')}
              className="text-sm text-primary-600 hover:text-primary-700 underline"
            >
              Change
            </button>
          </div>
        </div>
      )}
      
      {/* Medication Type Selection */}
      {selectedDrug && (
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Medication Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {MEDICATION_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => {
                  setMedicationType(type.value as Medication['type'])
                  setFrequency('') // Reset frequency when type changes
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  medicationType === type.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Frequency Selection (type-specific) */}
      {selectedDrug && medicationType && (
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Frequency
          </label>
          <div className="flex flex-wrap gap-2">
            {(FREQUENCY_BY_TYPE[medicationType] || FREQUENCIES).map((freq) => (
              <button
                key={freq.value}
                onClick={() => setFrequency(freq.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  frequency === freq.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {freq.shorthand}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Duration Selection */}
      {frequency && (
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Duration
          </label>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((dur) => {
              const endDate = calculateEndDate(dur.value)
              return (
                <button
                  key={dur.value}
                  onClick={() => setDuration(dur.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    duration === dur.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                  title={endDate ? `Ends on ${endDate}` : undefined}
                >
                  <div className="text-center">
                    <div>{dur.label}</div>
                    {endDate && (
                      <div className="text-xs opacity-75 mt-0.5">
                        → {endDate}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
      
      {/* Optional Notes */}
      {duration && (
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Notes (Optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Take with food, Before meals..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>
      )}
      
      {/* Tapering Instructions (Option B: Simple text field) */}
      {duration && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="showTapering"
              checked={showTapering}
              onChange={(e) => setShowTapering(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="showTapering" className="text-sm font-medium text-gray-700 cursor-pointer">
              📋 This medication requires tapering (dose changes over time)
            </label>
          </div>
          
          {showTapering && (
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <label className="block text-sm font-medium text-amber-900 mb-2">
                Tapering Instructions
              </label>
              <textarea
                value={taperingInstructions}
                onChange={(e) => setTaperingInstructions(e.target.value)}
                placeholder="e.g., Take 3 pills daily for 3 days, then 2 pills daily for 4 days, then 1 pill daily for 3 days"
                rows={3}
                className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
              />
              <p className="text-xs text-amber-700 mt-1">
                Describe how the dosage should change over time
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!selectedDrug || !frequency || !duration}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Add Medication
        </button>
      </div>
    </div>
  )
}
