'use client'

import { useState, useEffect } from 'react'

interface PlanInputProps {
  value: string
  onChange: (value: string) => void
}

export default function PlanInput({ value, onChange }: PlanInputProps) {
  const [templateOptions, setTemplateOptions] = useState<string[]>([])
  const [showCustom, setShowCustom] = useState(false)
  
  // Load template plan suggestions
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        const response = await fetch('/api/templates/current')
        const data = await response.json()
        if (data.template?.sections?.plans) {
          setTemplateOptions(data.template.sections.plans)
        }
      } catch (error) {
        console.error('Load template error:', error)
      }
    }
    
    loadTemplate()
  }, [])
  
  const handleSelectTemplate = (plan: string) => {
    onChange(plan)
  }
  
  const handleCustomInput = () => {
    setShowCustom(true)
  }
  
  return (
    <div className="space-y-4">
      {/* Show textarea input when custom mode OR no templates */}
      {showCustom || !templateOptions.length ? (
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Enter Plan
          </label>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter management plan, follow-up instructions, lifestyle advice..."
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
            autoFocus
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-gray-500">
              {value.length} characters
            </p>
            {templateOptions.length > 0 && (
              <button
                onClick={() => {
                  setShowCustom(false)
                  onChange('')
                }}
                className="text-sm text-primary-600 hover:text-primary-700 underline"
              >
                Use template instead
              </button>
            )}
          </div>
        </div>
      ) : value ? (
        /* Show confirmation for selected template */
        <div className="p-4 bg-success-50 border border-success-200 rounded-lg">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-success-900 mb-1">Plan:</p>
              <p className="text-gray-900">{value}</p>
            </div>
            <button
              onClick={() => {
                onChange('')
                setShowCustom(false)
              }}
              className="text-sm text-success-600 hover:text-success-700 underline ml-4"
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        /* Show template selection chips */
        <div>
          <p className="text-sm font-medium text-gray-900 mb-3">
            Select a common plan or write custom:
          </p>
          
          {/* Template Chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            {templateOptions.map((plan) => (
              <button
                key={plan}
                onClick={() => handleSelectTemplate(plan)}
                className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-primary-50 hover:text-primary-700 hover:border-primary-300 rounded-lg text-sm font-medium transition-colors border border-gray-300"
              >
                {plan}
              </button>
            ))}
          </div>
          
          {/* Custom Button */}
          <button
            onClick={handleCustomInput}
            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-primary-500 hover:text-primary-600 font-medium transition-colors"
          >
            + Write Custom Plan
          </button>
        </div>
      )}
      
      {/* Optional Notice */}
      {!value && (
        <p className="text-xs text-gray-500">
          Plan is optional but recommended for patient follow-up
        </p>
      )}
    </div>
  )
}
