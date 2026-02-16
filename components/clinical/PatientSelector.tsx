'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  HelpIcon, 
  HelpPanel,
  PATIENT_SEARCH_HELP,
  DEPENDENT_PATIENT_HELP,
  WALKIN_PATIENT_HELP
} from '@/components/ui/HelpTooltips'

// ============================================================================
// TYPES
// ============================================================================

interface Patient {
  id: string
  unique_id: string
  full_name: string
  phone: string
  date_of_birth?: string
  sex?: 'male' | 'female'
  age?: number
  is_dependent?: boolean
  guardian_name?: string
}

interface PatientSelectorProps {
  onSelect: (patient: Patient) => void
  onCreateWalkIn: () => void
  selectedPatient?: Patient | null
}

// ============================================================================
// PATIENT SELECTOR COMPONENT
// Enhanced with help tooltips for UX-D002, UX-D003, UX-D004
// ============================================================================

export function PatientSelector({ onSelect, onCreateWalkIn, selectedPatient }: PatientSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Patient[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showWalkInForm, setShowWalkInForm] = useState(false)
  const [showSearchHelp, setShowSearchHelp] = useState(false)

  // Debounced search
  const searchPatients = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.patients || [])
      }
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      searchPatients(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, searchPatients])

  // If patient is selected, show selected state
  if (selectedPatient) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-200 rounded-full flex items-center justify-center">
              <span className="text-green-700 font-semibold">
                {selectedPatient.full_name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <div className="font-medium text-green-900">{selectedPatient.full_name}</div>
              <div className="text-sm text-green-700">
                {selectedPatient.phone}
                {selectedPatient.age && ` · ${selectedPatient.age}y`}
                {selectedPatient.sex && ` · ${selectedPatient.sex.charAt(0).toUpperCase()}`}
                {selectedPatient.is_dependent && (
                  <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    Dependent
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => onSelect(null as any)}
            className="text-sm text-green-700 hover:text-green-900"
          >
            Change
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search Header with Help (UX-D002) */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-gray-900">Select Patient</h3>
          <HelpIcon 
            content={PATIENT_SEARCH_HELP.content}
            position="right"
          />
        </div>
        <button
          onClick={() => setShowSearchHelp(!showSearchHelp)}
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          {showSearchHelp ? 'Hide Help' : 'Search Help'}
        </button>
      </div>

      {/* Search Scope Help Panel (UX-D002) */}
      {showSearchHelp && (
        <HelpPanel title="Understanding Patient Search" defaultExpanded>
          <div className="space-y-3">
            <p className="font-medium">Search shows patients from:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white/50 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className="font-medium text-sm">Your Patients</span>
                </div>
                <p className="text-xs">Patients you've treated before in any clinic</p>
              </div>
              <div className="bg-white/50 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  <span className="font-medium text-sm">Walk-in Patients</span>
                </div>
                <p className="text-xs">Created during previous sessions by any doctor</p>
              </div>
              <div className="bg-white/50 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                  <span className="font-medium text-sm">App Users</span>
                </div>
                <p className="text-xs">Patients who registered in the MedAssist app</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              💡 Tip: Search by name, phone number, or patient ID
            </p>
          </div>
        </HelpPanel>
      )}

      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, phone, or ID..."
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
          </div>
        )}
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-60 overflow-y-auto">
          {searchResults.map((patient) => (
            <button
              key={patient.id}
              onClick={() => onSelect(patient)}
              className="w-full text-left p-3 hover:bg-gray-50 flex items-center gap-3"
            >
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-gray-600 font-semibold">
                  {patient.full_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {patient.full_name}
                  {patient.is_dependent && (
                    <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                      Dependent
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  {patient.phone}
                  {patient.age && ` · ${patient.age}y`}
                  {patient.sex && ` · ${patient.sex.charAt(0).toUpperCase()}`}
                  {patient.guardian_name && ` · Guardian: ${patient.guardian_name}`}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No Results / Walk-in Option */}
      {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
        <div className="text-center py-6 bg-gray-50 rounded-lg">
          <p className="text-gray-600 mb-3">No patients found matching "{searchQuery}"</p>
          <button
            onClick={() => setShowWalkInForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Walk-in Patient
          </button>
        </div>
      )}

      {/* Or Divider */}
      {!showWalkInForm && searchQuery.length < 2 && (
        <div className="flex items-center gap-4">
          <div className="flex-1 border-t border-gray-200"></div>
          <span className="text-sm text-gray-500">or</span>
          <div className="flex-1 border-t border-gray-200"></div>
        </div>
      )}

      {/* Walk-in Button */}
      {!showWalkInForm && searchQuery.length < 2 && (
        <button
          onClick={() => setShowWalkInForm(true)}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-primary-400 hover:text-primary-600 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Walk-in Patient
        </button>
      )}

      {/* Walk-in Form */}
      {showWalkInForm && (
        <WalkInPatientForm 
          onCancel={() => setShowWalkInForm(false)}
          onCreated={(patient) => {
            setShowWalkInForm(false)
            onSelect(patient)
          }}
          initialPhone={searchQuery.match(/^\+?\d+$/) ? searchQuery : ''}
        />
      )}
    </div>
  )
}

// ============================================================================
// WALK-IN PATIENT FORM
// With help tooltips for UX-D003 and UX-D004
// ============================================================================

interface WalkInPatientFormProps {
  onCancel: () => void
  onCreated: (patient: Patient) => void
  initialPhone?: string
}

function WalkInPatientForm({ onCancel, onCreated, initialPhone = '' }: WalkInPatientFormProps) {
  const [formData, setFormData] = useState({
    full_name: '',
    phone: initialPhone,
    date_of_birth: '',
    sex: '' as '' | 'male' | 'female',
    is_dependent: false,
    guardian_phone: ''
  })
  const [guardianSearch, setGuardianSearch] = useState('')
  const [guardianResults, setGuardianResults] = useState<Patient[]>([])
  const [selectedGuardian, setSelectedGuardian] = useState<Patient | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search for guardian
  useEffect(() => {
    if (!formData.is_dependent || guardianSearch.length < 2) {
      setGuardianResults([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(guardianSearch)}`)
        if (res.ok) {
          const data = await res.json()
          setGuardianResults(data.patients || [])
        }
      } catch (error) {
        console.error('Guardian search failed:', error)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [guardianSearch, formData.is_dependent])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/patients/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          guardian_id: selectedGuardian?.id
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create patient')
      }

      const data = await res.json()
      onCreated(data.patient)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create patient')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">New Walk-in Patient</h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Walk-in Storage Info (UX-D004) */}
      <HelpPanel title="About Walk-in Patient Records">
        <div className="space-y-2">
          <p>Walk-in patients are stored <strong>globally</strong> in the system:</p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
            <li>Any doctor can find them by phone number</li>
            <li>If they register later, records link automatically</li>
            <li>Your clinical notes remain private until patient grants access</li>
          </ul>
        </div>
      </HelpPanel>

      <form onSubmit={handleSubmit} className="space-y-4 mt-4">
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Enter patient name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number *
            </label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="+20 xxx xxx xxxx"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date of Birth
            </label>
            <input
              type="date"
              value={formData.date_of_birth}
              onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sex
            </label>
            <select
              value={formData.sex}
              onChange={(e) => setFormData({ ...formData, sex: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Select...</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>

        {/* Dependent Patient Toggle (UX-D003) */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_dependent"
              checked={formData.is_dependent}
              onChange={(e) => {
                setFormData({ ...formData, is_dependent: e.target.checked })
                if (!e.target.checked) {
                  setSelectedGuardian(null)
                  setGuardianSearch('')
                }
              }}
              className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
            />
            <label htmlFor="is_dependent" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              This is a dependent (child/minor)
              <HelpIcon 
                content={DEPENDENT_PATIENT_HELP.content}
                position="right"
              />
            </label>
          </div>
        </div>

        {/* Guardian Selection (UX-D003) */}
        {formData.is_dependent && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-purple-800 mb-2 flex items-center gap-2">
              Guardian / Parent
              <HelpIcon 
                content="The guardian will receive all notifications and can manage this patient's medical records."
                position="right"
              />
            </label>

            {selectedGuardian ? (
              <div className="flex items-center justify-between bg-white rounded-lg p-3">
                <div>
                  <div className="font-medium text-gray-900">{selectedGuardian.full_name}</div>
                  <div className="text-sm text-gray-500">{selectedGuardian.phone}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGuardian(null)
                    setGuardianSearch('')
                  }}
                  className="text-sm text-purple-600 hover:text-purple-700"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={guardianSearch}
                  onChange={(e) => setGuardianSearch(e.target.value)}
                  placeholder="Search for guardian by name or phone..."
                  className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
                {guardianResults.length > 0 && (
                  <div className="mt-2 border border-purple-200 rounded-lg divide-y divide-purple-100 max-h-40 overflow-y-auto bg-white">
                    {guardianResults.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => {
                          setSelectedGuardian(patient)
                          setGuardianSearch('')
                        }}
                        className="w-full text-left p-2 hover:bg-purple-50"
                      >
                        <div className="font-medium text-gray-900">{patient.full_name}</div>
                        <div className="text-sm text-gray-500">{patient.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-purple-600 mt-2">
                  If guardian is not found, create them first as a separate patient
                </p>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create Patient'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default PatientSelector
