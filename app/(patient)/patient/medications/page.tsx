'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { HelpIcon, StatusLegend, MEDICATION_STATUS_LEGEND } from '@/components/ui/HelpTooltips'

// ============================================================================
// TYPES
// ============================================================================

interface Medication {
  id: string
  drug_name: string
  dosage: string
  frequency: string
  instructions?: string
  start_date?: string
  end_date?: string
  status: 'pending' | 'active' | 'expired' | 'declined' | 'stopped'
  source: 'doctor' | 'manual'
  doctor_name?: string
  created_at: string
}

interface DrugSuggestion {
  id: string
  name: string
  strength?: string
  form?: string
}

// ============================================================================
// DRUG AUTOCOMPLETE COMPONENT (UX-P003)
// ============================================================================

interface DrugAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect: (drug: DrugSuggestion) => void
  placeholder?: string
  error?: string
}

function DrugAutocomplete({ value, onChange, onSelect, placeholder, error }: DrugAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<DrugSuggestion[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Debounced search
  const searchDrugs = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([])
      return
    }

    setIsSearching(true)
    try {
      const res = await fetch(`/api/drugs/search?q=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data.drugs || [])
        setShowDropdown(true)
      }
    } catch (error) {
      console.error('Drug search failed:', error)
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      searchDrugs(value)
    }, 300)
    return () => clearTimeout(timer)
  }, [value, searchDrugs])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0) {
          onSelect(suggestions[highlightedIndex])
          setShowDropdown(false)
        }
        break
      case 'Escape':
        setShowDropdown(false)
        break
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Type medication name..."}
          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
            error ? 'border-red-300' : 'border-gray-300'
          }`}
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
          </div>
        )}
      </div>
      
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      
      {/* Suggestions Dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div 
          ref={dropdownRef}
          className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {suggestions.map((drug, index) => (
            <button
              key={drug.id}
              type="button"
              onClick={() => {
                onSelect(drug)
                setShowDropdown(false)
              }}
              className={`w-full text-left px-4 py-2 hover:bg-gray-50 ${
                index === highlightedIndex ? 'bg-primary-50' : ''
              }`}
            >
              <div className="font-medium">{drug.name}</div>
              {(drug.strength || drug.form) && (
                <div className="text-sm text-gray-500">
                  {[drug.strength, drug.form].filter(Boolean).join(' · ')}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Allow free text hint */}
      {value.length >= 2 && suggestions.length === 0 && !isSearching && (
        <div className="absolute z-10 w-full mt-1 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
          <strong>Not found?</strong> You can still add "{value}" as a custom medication.
        </div>
      )}
    </div>
  )
}

// ============================================================================
// ADD MEDICATION FORM
// ============================================================================

interface AddMedicationFormProps {
  onSubmit: (data: Partial<Medication>) => Promise<void>
  onCancel: () => void
  isSubmitting: boolean
}

function AddMedicationForm({ onSubmit, onCancel, isSubmitting }: AddMedicationFormProps) {
  const [formData, setFormData] = useState({
    drug_name: '',
    dosage: '',
    frequency: '',
    instructions: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleDrugSelect = (drug: DrugSuggestion) => {
    setFormData(prev => ({
      ...prev,
      drug_name: drug.name,
      dosage: drug.strength || prev.dosage
    }))
    setErrors(prev => ({ ...prev, drug_name: '' }))
  }

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!formData.drug_name.trim()) newErrors.drug_name = 'Medication name is required'
    if (!formData.dosage.trim()) newErrors.dosage = 'Dosage is required'
    if (!formData.frequency.trim()) newErrors.frequency = 'Frequency is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    await onSubmit({
      ...formData,
      source: 'manual',
      status: 'active'
    })
  }

  const frequencyOptions = [
    'Once daily',
    'Twice daily',
    'Three times daily',
    'Four times daily',
    'Every 4 hours',
    'Every 6 hours',
    'Every 8 hours',
    'Every 12 hours',
    'As needed',
    'Once weekly',
    'Other'
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Drug Name with Autocomplete */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Medication Name *
        </label>
        <DrugAutocomplete
          value={formData.drug_name}
          onChange={(value) => setFormData({ ...formData, drug_name: value })}
          onSelect={handleDrugSelect}
          placeholder="Search or type medication name..."
          error={errors.drug_name}
        />
      </div>

      {/* Dosage */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Dosage *
        </label>
        <input
          type="text"
          value={formData.dosage}
          onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
          placeholder="e.g., 500mg, 10ml, 2 tablets"
          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
            errors.dosage ? 'border-red-300' : 'border-gray-300'
          }`}
        />
        {errors.dosage && <p className="text-sm text-red-600 mt-1">{errors.dosage}</p>}
      </div>

      {/* Frequency */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Frequency *
        </label>
        <select
          value={formData.frequency}
          onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
            errors.frequency ? 'border-red-300' : 'border-gray-300'
          }`}
        >
          <option value="">Select frequency...</option>
          {frequencyOptions.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {errors.frequency && <p className="text-sm text-red-600 mt-1">{errors.frequency}</p>}
      </div>

      {/* Instructions */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Instructions (optional)
        </label>
        <textarea
          value={formData.instructions}
          onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
          placeholder="e.g., Take with food, Avoid alcohol"
          rows={2}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            End Date (optional)
          </label>
          <input
            type="date"
            value={formData.end_date}
            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            min={formData.start_date}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Adding...' : 'Add Medication'}
        </button>
      </div>
    </form>
  )
}

// ============================================================================
// MEDICATION CARD WITH DELETE (UX-P004)
// ============================================================================

interface MedicationCardProps {
  medication: Medication
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (status: 'active' | 'stopped') => void
}

function MedicationCard({ medication, onEdit, onDelete, onStatusChange }: MedicationCardProps) {
  const statusStyles = {
    pending: 'bg-yellow-100 border-yellow-300 text-yellow-800',
    active: 'bg-green-100 border-green-300 text-green-800',
    expired: 'bg-gray-100 border-gray-300 text-gray-600',
    declined: 'bg-red-100 border-red-300 text-red-700',
    stopped: 'bg-gray-100 border-gray-300 text-gray-600'
  }

  const statusLabels = {
    pending: 'Pending Approval',
    active: 'Active',
    expired: 'Expired',
    declined: 'Declined',
    stopped: 'Stopped'
  }

  return (
    <div className={`p-4 rounded-lg border-2 ${statusStyles[medication.status]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold">{medication.drug_name}</h4>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/50">
              {statusLabels[medication.status]}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/50">
              {medication.source === 'doctor' ? '👨‍⚕️ From Doctor' : '✏️ Manual'}
            </span>
          </div>
          
          <p className="text-sm mt-1">{medication.dosage} · {medication.frequency}</p>
          
          {medication.instructions && (
            <p className="text-xs mt-1 opacity-75">📋 {medication.instructions}</p>
          )}
          
          {medication.doctor_name && (
            <p className="text-xs mt-1 opacity-75">Dr. {medication.doctor_name}</p>
          )}
          
          <div className="text-xs mt-2 opacity-75">
            {medication.start_date && `Started: ${new Date(medication.start_date).toLocaleDateString()}`}
            {medication.end_date && ` · Ends: ${new Date(medication.end_date).toLocaleDateString()}`}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1">
          {medication.status === 'pending' && (
            <>
              <button
                onClick={() => onStatusChange('active')}
                className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
              >
                Accept
              </button>
              <button
                onClick={onDelete}
                className="px-3 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Decline
              </button>
            </>
          )}
          
          {medication.status === 'active' && (
            <>
              <button
                onClick={() => onStatusChange('stopped')}
                className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Stop
              </button>
              {medication.source === 'manual' && (
                <button
                  onClick={onEdit}
                  className="px-3 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Edit
                </button>
              )}
            </>
          )}
          
          {['expired', 'stopped', 'declined'].includes(medication.status) && (
            <button
              onClick={onDelete}
              className="px-3 py-1 text-xs text-red-600 hover:text-red-700"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN MEDICATIONS PAGE
// ============================================================================

export default function MedicationsPage() {
  const [medications, setMedications] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<Medication | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'history'>('all')
  const [showStatusGuide, setShowStatusGuide] = useState(false)

  // Load medications
  useEffect(() => {
    const loadMedications = async () => {
      try {
        const res = await fetch('/api/patient/medications')
        if (res.ok) {
          const data = await res.json()
          setMedications(data.medications || [])
        }
      } catch (error) {
        console.error('Failed to load medications:', error)
      } finally {
        setLoading(false)
      }
    }
    loadMedications()
  }, [])

  // Filter medications
  const filteredMedications = medications.filter(med => {
    switch (filter) {
      case 'active': return med.status === 'active'
      case 'pending': return med.status === 'pending'
      case 'history': return ['expired', 'stopped', 'declined'].includes(med.status)
      default: return true
    }
  })

  // Count by status
  const counts = {
    all: medications.length,
    active: medications.filter(m => m.status === 'active').length,
    pending: medications.filter(m => m.status === 'pending').length,
    history: medications.filter(m => ['expired', 'stopped', 'declined'].includes(m.status)).length
  }

  // Handle add medication
  const handleAddMedication = async (data: Partial<Medication>) => {
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/patient/medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (res.ok) {
        const result = await res.json()
        setMedications(prev => [result.medication, ...prev])
        setShowAddForm(false)
      }
    } catch (error) {
      console.error('Failed to add medication:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle delete
  const handleDelete = async (medication: Medication) => {
    try {
      const res = await fetch(`/api/patient/medications/${medication.id}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setMedications(prev => prev.filter(m => m.id !== medication.id))
      }
    } catch (error) {
      console.error('Failed to delete medication:', error)
    }
    setDeleteConfirm(null)
  }

  // Handle status change
  const handleStatusChange = async (medication: Medication, newStatus: 'active' | 'stopped') => {
    try {
      const res = await fetch(`/api/patient/medications/${medication.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      if (res.ok) {
        setMedications(prev => prev.map(m => 
          m.id === medication.id ? { ...m, status: newStatus } : m
        ))
      }
    } catch (error) {
      console.error('Failed to update medication status:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Medications</h1>
          <p className="text-gray-600 mt-1">Manage your medications and prescriptions</p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Medication
          </button>
        )}
      </div>

      {/* Status Guide Toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowStatusGuide(!showStatusGuide)}
          className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Status Guide
        </button>
      </div>

      {showStatusGuide && (
        <StatusLegend items={MEDICATION_STATUS_LEGEND} title="Medication Status Guide" />
      )}

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            Add Medication
            <HelpIcon 
              content="Search for medications or type a custom name if not found"
              position="right"
            />
          </h2>
          <AddMedicationForm
            onSubmit={handleAddMedication}
            onCancel={() => setShowAddForm(false)}
            isSubmitting={isSubmitting}
          />
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2 overflow-x-auto">
        {[
          { key: 'all', label: 'All' },
          { key: 'active', label: 'Active' },
          { key: 'pending', label: 'Pending' },
          { key: 'history', label: 'History' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as any)}
            className={`px-4 py-2 text-sm rounded-full whitespace-nowrap transition-colors ${
              filter === tab.key
                ? 'bg-primary-100 text-primary-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {tab.label} ({counts[tab.key as keyof typeof counts]})
          </button>
        ))}
      </div>

      {/* Medications List */}
      {filteredMedications.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <div className="text-4xl mb-3">💊</div>
          <p className="text-gray-600 mb-4">
            {filter === 'all' 
              ? 'No medications yet' 
              : `No ${filter} medications`}
          </p>
          {filter === 'all' && (
            <button
              onClick={() => setShowAddForm(true)}
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Add your first medication →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMedications.map((medication) => (
            <MedicationCard
              key={medication.id}
              medication={medication}
              onEdit={() => {/* TODO: Edit modal */}}
              onDelete={() => setDeleteConfirm(medication)}
              onStatusChange={(status) => handleStatusChange(medication, status)}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation (DS-003) */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Medication"
        message={
          <div>
            <p>Are you sure you want to delete <strong>{deleteConfirm?.drug_name}</strong>?</p>
            <p className="text-sm text-gray-500 mt-2">This action cannot be undone.</p>
          </div>
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  )
}
