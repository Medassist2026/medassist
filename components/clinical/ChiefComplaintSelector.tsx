'use client'

import { useState, useEffect } from 'react'

interface ChiefComplaintSelectorProps {
  selected: string[]
  onChange: (complaints: string[]) => void
}

export default function ChiefComplaintSelector({ selected, onChange }: ChiefComplaintSelectorProps) {
  const [templateOptions, setTemplateOptions] = useState<string[]>([])
  const [customInput, setCustomInput] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  
  // Load template options from doctor's specialty
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        const response = await fetch('/api/templates/current')
        const data = await response.json()
        if (data.template?.sections?.chief_complaints) {
          setTemplateOptions(data.template.sections.chief_complaints)
        }
      } catch (error) {
        console.error('Load template error:', error)
      }
    }
    
    loadTemplate()
  }, [])
  
  // Autocomplete suggestions as user types
  useEffect(() => {
    if (customInput.length >= 2) {
      const filtered = templateOptions.filter(option => {
        // Case-insensitive matching
        const matchesInput = option.toLowerCase().includes(customInput.toLowerCase())
        // Case-insensitive duplicate check
        const alreadySelected = selected.some(s => s.toLowerCase() === option.toLowerCase())
        return matchesInput && !alreadySelected
      })
      setSuggestions(filtered)
      setShowSuggestions(filtered.length > 0)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }, [customInput, templateOptions, selected])
  
  const toggleComplaint = (complaint: string) => {
    if (selected.includes(complaint)) {
      onChange(selected.filter(c => c !== complaint))
    } else {
      onChange([...selected, complaint])
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
  
  const selectSuggestion = (suggestion: string) => {
    onChange([...selected, suggestion])
    setCustomInput('')
    setShowSuggestions(false)
    setShowCustom(false)
  }
  
  return (
    <div className="space-y-4">
      {/* Template Chips */}
      <div className="flex flex-wrap gap-2">
        {templateOptions.map((complaint) => (
          <button
            key={complaint}
            onClick={() => toggleComplaint(complaint)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selected.includes(complaint)
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {complaint}
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
              
              {/* Autocomplete Suggestions Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => selectSuggestion(suggestion)}
                      className="w-full text-left px-4 py-2 hover:bg-primary-50 border-b border-gray-100 last:border-b-0"
                    >
                      <span className="font-medium text-gray-900">{suggestion}</span>
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
