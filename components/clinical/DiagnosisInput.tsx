'use client'

import { useState, useEffect, useRef } from 'react'

interface ICD10Result {
  code: string
  description: string
}

interface DiagnosisInputProps {
  value: string
  onChange: (value: string) => void
}

export default function DiagnosisInput({ value, onChange }: DiagnosisInputProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ICD10Result[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Search ICD-10 codes as user types
  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      setShowDropdown(false)
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
  
  const handleSelect = (result: ICD10Result) => {
    const diagnosis = `${result.code}: ${result.description}`
    onChange(diagnosis)
    setQuery('')
    setShowDropdown(false)
    setResults([])
  }
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return
    
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault()
      handleSelect(results[selectedIndex])
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }
  
  const handleClear = () => {
    onChange('')
    setQuery('')
    inputRef.current?.focus()
  }
  
  if (value) {
    return (
      <div className="flex items-center justify-between p-4 bg-success-50 border border-success-200 rounded-lg">
        <div>
          <p className="font-semibold text-success-900">{value}</p>
          <p className="text-sm text-success-700 mt-1">Diagnosis confirmed</p>
        </div>
        <button
          onClick={handleClear}
          className="text-sm text-success-600 hover:text-success-700 underline"
        >
          Change
        </button>
      </div>
    )
  }
  
  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search ICD-10 code or description..."
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
      
      {/* No Results */}
      {showDropdown && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-xl p-4">
          <p className="text-sm text-gray-600">
            No ICD-10 codes found for "{query}"
          </p>
        </div>
      )}
      
      <p className="text-xs text-gray-500 mt-2">
        Type at least 2 characters to search. Use ↑↓ to navigate, Enter to select.
      </p>
    </div>
  )
}
