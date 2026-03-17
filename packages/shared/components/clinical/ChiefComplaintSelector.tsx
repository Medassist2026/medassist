'use client'

import { useState, useEffect } from 'react'

// CC-013: Complaint type with Arabic support
interface Complaint {
  name: string
  nameAr?: string
}

interface ChiefComplaintSelectorProps {
  selected: string[]
  onChange: (complaints: string[]) => void
}

// CC-013: Fallback complaints array with Arabic translations
const FALLBACK_COMPLAINTS: Complaint[] = [
  { name: 'Fever', nameAr: 'حمى' },
  { name: 'Headache', nameAr: 'صداع' },
  { name: 'Cough', nameAr: 'سعال' },
  { name: 'Abdominal Pain', nameAr: 'ألم بطن' },
  { name: 'Back Pain', nameAr: 'ألم ظهر' },
  { name: 'Chest Pain', nameAr: 'ألم صدر' },
  { name: 'Dizziness', nameAr: 'دوخة' },
  { name: 'Nausea', nameAr: 'غثيان' },
  { name: 'Shortness of Breath', nameAr: 'ضيق تنفس' },
  { name: 'Sore Throat', nameAr: 'التهاب حلق' },
]

export default function ChiefComplaintSelector({ selected, onChange }: ChiefComplaintSelectorProps) {
  const [templateOptions, setTemplateOptions] = useState<Complaint[]>([])
  const [customInput, setCustomInput] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [suggestions, setSuggestions] = useState<Complaint[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  
  // CC-013: Load template options from doctor's specialty (supports both string and object formats)
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        const response = await fetch('/api/templates/current')
        const data = await response.json()
        if (data.template?.sections?.chief_complaints) {
          const complaints = data.template.sections.chief_complaints

          // Handle both formats: strings or objects with { name, nameAr }
          const normalizedComplaints: Complaint[] = complaints.map((complaint: string | Complaint) => {
            if (typeof complaint === 'string') {
              return { name: complaint }
            }
            return complaint
          })

          setTemplateOptions(normalizedComplaints.length > 0 ? normalizedComplaints : FALLBACK_COMPLAINTS)
        } else {
          // Fallback to hardcoded complaints if API returns empty
          setTemplateOptions(FALLBACK_COMPLAINTS)
        }
      } catch (error) {
        console.error('Load template error:', error)
        // Fallback to hardcoded complaints on error
        setTemplateOptions(FALLBACK_COMPLAINTS)
      }
    }

    loadTemplate()
  }, [])
  
  // CC-013: Autocomplete suggestions as user types (handles Complaint objects)
  useEffect(() => {
    if (customInput.length >= 2) {
      const filtered = templateOptions.filter(option => {
        // Case-insensitive matching on complaint name
        const matchesInput = option.name.toLowerCase().includes(customInput.toLowerCase())
        // Case-insensitive duplicate check
        const alreadySelected = selected.some(s => s.toLowerCase() === option.name.toLowerCase())
        return matchesInput && !alreadySelected
      })
      setSuggestions(filtered)
      setShowSuggestions(filtered.length > 0)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }, [customInput, templateOptions, selected])
  
  const toggleComplaint = (complaintName: string) => {
    if (selected.includes(complaintName)) {
      onChange(selected.filter(c => c !== complaintName))
    } else {
      onChange([...selected, complaintName])
    }
  }
  
  const addCustom = () => {
    if (customInput.trim()) {
      onChange([...selected, customInput.trim()])
      setCustomInput('')
      setShowCustom(false)
      setShowSuggestions(false)
    }
  }
  
  const selectSuggestion = (suggestion: Complaint) => {
    onChange([...selected, suggestion.name])
    setCustomInput('')
    setShowSuggestions(false)
    setShowCustom(false)
  }
  
  return (
    <div className="space-y-4">
      {/* CC-013: Template Chips with Arabic labels */}
      <div className="flex flex-wrap gap-2">
        {templateOptions.map((complaint) => (
          <button
            key={complaint.name}
            onClick={() => toggleComplaint(complaint.name)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex flex-col items-center ${
              selected.includes(complaint.name)
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <span>{complaint.name}</span>
            {complaint.nameAr && (
              <span
                className={`text-xs mt-0.5 ${
                  selected.includes(complaint.name)
                    ? 'text-primary-100'
                    : 'text-gray-500'
                }`}
                dir="rtl"
              >
                {complaint.nameAr}
              </span>
            )}
          </button>
        ))}
        
        <button
          onClick={() => setShowCustom(true)}
          className="px-4 py-2 rounded-full text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 border-2 border-dashed border-gray-300"
        >
          + Custom
        </button>
      </div>
      
      {/* Custom Input */}
      {showCustom && (
        <div className="relative">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (suggestions.length > 0) {
                      selectSuggestion(suggestions[0])
                    } else {
                      addCustom()
                    }
                  } else if (e.key === 'Escape') {
                    setShowSuggestions(false)
                  }
                }}
                placeholder="Type to search (e.g., 'fe' for Fever)..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                autoFocus
              />
              
              {/* CC-013: Autocomplete Suggestions Dropdown with Arabic labels */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.name}
                      onClick={() => selectSuggestion(suggestion)}
                      className="w-full text-left px-4 py-2 hover:bg-primary-50 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{suggestion.name}</span>
                        {suggestion.nameAr && (
                          <span className="text-xs text-gray-500 mt-0.5" dir="rtl">
                            {suggestion.nameAr}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <button
              onClick={addCustom}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowCustom(false)
                setCustomInput('')
                setShowSuggestions(false)
              }}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium"
            >
              Cancel
            </button>
          </div>
          
          {/* Hint */}
          <p className="text-xs text-gray-500 mt-2">
            💡 Type 2+ letters to see suggestions, or press Enter to add custom complaint
          </p>
        </div>
      )}
      
      {/* Selected Display */}
      {selected.length > 0 && (
        <div className="p-4 bg-primary-50 border border-primary-200 rounded-lg">
          <p className="text-sm font-medium text-primary-900 mb-2">
            Selected ({selected.length}):
          </p>
          <div className="flex flex-wrap gap-2">
            {selected.map((complaint) => (
              <div
                key={complaint}
                className="flex items-center gap-2 px-3 py-1 bg-primary-600 text-white rounded-full text-sm"
              >
                <span>{complaint}</span>
                <button
                  onClick={() => toggleComplaint(complaint)}
                  className="hover:bg-primary-700 rounded-full p-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
