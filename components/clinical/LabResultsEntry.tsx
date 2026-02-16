'use client'

import { useState } from 'react'

interface LabTest {
  id: string
  test_code: string
  test_name: string
  category: string
  normal_range_min: number | null
  normal_range_max: number | null
  unit: string | null
}

interface LabResult {
  id: string
  lab_order_id: string
  lab_test_id: string
  result_value: number | null
  result_text: string | null
  is_abnormal: boolean
  abnormal_flag: string | null
  test: LabTest
}

interface LabResultsEntryProps {
  orderId: string
  results: LabResult[]
  patientName: string
  onSubmit: (results: Array<{
    resultId: string
    value: number
    isAbnormal: boolean
    abnormalFlag: 'H' | 'L' | 'HH' | 'LL' | null
  }>) => Promise<void>
  onCancel: () => void
}

export default function LabResultsEntry({
  orderId,
  results,
  patientName,
  onSubmit,
  onCancel
}: LabResultsEntryProps) {
  const [values, setValues] = useState<Record<string, string>>(
    results.reduce((acc, r) => ({
      ...acc,
      [r.id]: r.result_value?.toString() || ''
    }), {})
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const calculateAbnormalFlag = (
    value: number,
    normalMin: number | null,
    normalMax: number | null
  ): { isAbnormal: boolean; flag: 'H' | 'L' | 'HH' | 'LL' | null } => {
    if (normalMin === null && normalMax === null) {
      return { isAbnormal: false, flag: null }
    }
    
    const criticalFactor = 0.2
    
    if (normalMin !== null && value < normalMin) {
      const criticalLow = normalMin * (1 - criticalFactor)
      if (value < criticalLow) {
        return { isAbnormal: true, flag: 'LL' }
      }
      return { isAbnormal: true, flag: 'L' }
    }
    
    if (normalMax !== null && value > normalMax) {
      const criticalHigh = normalMax * (1 + criticalFactor)
      if (value > criticalHigh) {
        return { isAbnormal: true, flag: 'HH' }
      }
      return { isAbnormal: true, flag: 'H' }
    }
    
    return { isAbnormal: false, flag: null }
  }

  const getValueStatus = (result: LabResult, value: string) => {
    if (!value) return null
    const numValue = parseFloat(value)
    if (isNaN(numValue)) return null
    
    return calculateAbnormalFlag(
      numValue,
      result.test.normal_range_min,
      result.test.normal_range_max
    )
  }

  const getFlagColor = (flag: string | null) => {
    switch (flag) {
      case 'HH':
      case 'LL':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'H':
      case 'L':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      default:
        return 'bg-green-100 text-green-800 border-green-300'
    }
  }

  const getFlagLabel = (flag: string | null) => {
    switch (flag) {
      case 'HH': return 'Critical High'
      case 'LL': return 'Critical Low'
      case 'H': return 'High'
      case 'L': return 'Low'
      default: return 'Normal'
    }
  }

  const handleSubmit = async () => {
    // Validate all values are entered
    const emptyFields = results.filter(r => !values[r.id]?.trim())
    if (emptyFields.length > 0) {
      setError(`Please enter values for all tests (${emptyFields.length} remaining)`)
      return
    }

    // Validate all values are numbers
    const invalidFields = results.filter(r => {
      const val = values[r.id]
      return val && isNaN(parseFloat(val))
    })
    if (invalidFields.length > 0) {
      setError('All values must be valid numbers')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const submitData = results.map(r => {
        const numValue = parseFloat(values[r.id])
        const status = calculateAbnormalFlag(
          numValue,
          r.test.normal_range_min,
          r.test.normal_range_max
        )
        return {
          resultId: r.id,
          value: numValue,
          isAbnormal: status.isAbnormal,
          abnormalFlag: status.flag
        }
      })

      await onSubmit(submitData)
    } catch (err: any) {
      setError(err.message || 'Failed to submit results')
    } finally {
      setSubmitting(false)
    }
  }

  // Group results by category
  const groupedResults = results.reduce((acc, result) => {
    const category = result.test.category
    if (!acc[category]) acc[category] = []
    acc[category].push(result)
    return acc
  }, {} as Record<string, LabResult[]>)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Enter Lab Results</h2>
            <p className="text-gray-600 mt-1">Patient: {patientName}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Order ID:</span>
            <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
              {orderId.slice(0, 8)}...
            </span>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Results Entry */}
      <div className="p-6 space-y-8">
        {Object.entries(groupedResults).map(([category, categoryResults]) => (
          <div key={category}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-primary-600 rounded-full"></span>
              {category}
            </h3>
            
            <div className="space-y-4">
              {categoryResults.map(result => {
                const status = getValueStatus(result, values[result.id])
                
                return (
                  <div
                    key={result.id}
                    className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {result.test.test_name}
                        </span>
                        <span className="text-xs text-gray-500 font-mono">
                          ({result.test.test_code})
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        Normal range: {result.test.normal_range_min ?? '—'} - {result.test.normal_range_max ?? '—'} {result.test.unit || ''}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          value={values[result.id] || ''}
                          onChange={(e) => setValues({
                            ...values,
                            [result.id]: e.target.value
                          })}
                          className={`w-32 px-3 py-2 border rounded-lg text-right font-mono focus:ring-2 focus:ring-primary-500 outline-none ${
                            status?.isAbnormal ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'
                          }`}
                          placeholder="0.00"
                        />
                        {result.test.unit && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                            {result.test.unit}
                          </span>
                        )}
                      </div>
                      
                      {status && (
                        <span className={`px-2 py-1 text-xs font-medium rounded border ${getFlagColor(status.flag)}`}>
                          {getFlagLabel(status.flag)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="p-6 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {results.filter(r => values[r.id]?.trim()).length} of {results.length} tests completed
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Submitting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Submit Results
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
