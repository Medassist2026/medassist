'use client'

import { useState, useEffect } from 'react'

interface LabTest {
  id: string
  test_code: string
  test_name: string
  category: string
  normal_range_min: number | null
  normal_range_max: number | null
  unit: string | null
}

interface LabOrderSelectorProps {
  onOrderCreated?: (orderId: string) => void
}

export default function LabOrderSelector({ onOrderCreated }: LabOrderSelectorProps) {
  const [categories, setCategories] = useState<string[]>([])
  const [tests, setTests] = useState<LabTest[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedTests, setSelectedTests] = useState<string[]>([])
  const [priority, setPriority] = useState<'routine' | 'urgent' | 'stat'>('routine')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadTestCatalog()
  }, [])

  const loadTestCatalog = async () => {
    try {
      const response = await fetch('/api/clinical/lab-tests')
      const data = await response.json()
      
      if (data.tests) {
        setTests(data.tests)
        const cats = ['all', ...Array.from(new Set<string>(data.tests.map((t: LabTest) => t.category)))]
        setCategories(cats)
      }
    } catch (error) {
      console.error('Failed to load lab tests:', error)
      setError('Failed to load lab tests')
    } finally {
      setLoading(false)
    }
  }

  const toggleTest = (testId: string) => {
    setSelectedTests(prev =>
      prev.includes(testId)
        ? prev.filter(id => id !== testId)
        : [...prev, testId]
    )
  }

  const filteredTests = selectedCategory === 'all'
    ? tests
    : tests.filter(t => t.category === selectedCategory)

  const groupedTests = filteredTests.reduce((acc, test) => {
    if (!acc[test.category]) {
      acc[test.category] = []
    }
    acc[test.category].push(test)
    return acc
  }, {} as Record<string, LabTest[]>)

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto"></div>
        <p className="text-gray-600 mt-2">Loading lab tests...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Laboratory Tests</h3>
          <p className="text-sm text-gray-600">Select tests to order</p>
        </div>
      </div>

      {/* Category Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Filter by Category
        </label>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat === 'all' ? 'All Categories' : cat}
            </option>
          ))}
        </select>
      </div>

      {/* Selected Tests Summary */}
      {selectedTests.length > 0 && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-purple-900">
              Selected Tests ({selectedTests.length})
            </span>
            <button
              onClick={() => setSelectedTests([])}
              className="text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              Clear All
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedTests.map(testId => {
              const test = tests.find(t => t.id === testId)
              return test ? (
                <span
                  key={testId}
                  className="px-3 py-1 bg-purple-600 text-white text-sm rounded-full flex items-center gap-2"
                >
                  {test.test_name}
                  <button
                    onClick={() => toggleTest(testId)}
                    className="hover:bg-purple-700 rounded-full"
                  >
                    ×
                  </button>
                </span>
              ) : null
            })}
          </div>
        </div>
      )}

      {/* Tests Grid */}
      <div className="space-y-6 max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-4">
        {Object.entries(groupedTests).map(([category, categoryTests]) => (
          <div key={category}>
            <h4 className="font-semibold text-gray-900 mb-3 sticky top-0 bg-white py-2">
              {category}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {categoryTests.map(test => (
                <label
                  key={test.id}
                  className={`flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                    selectedTests.includes(test.id)
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTests.includes(test.id)}
                    onChange={() => toggleTest(test.id)}
                    className="mt-1 w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">
                      {test.test_name}
                    </div>
                    <div className="text-xs text-gray-600">
                      {test.test_code}
                      {test.normal_range_min !== null && test.normal_range_max !== null && (
                        <span className="ml-2">
                          ({test.normal_range_min}-{test.normal_range_max} {test.unit})
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Priority Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Priority
        </label>
        <div className="grid grid-cols-3 gap-3">
          {(['routine', 'urgent', 'stat'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                priority === p
                  ? 'border-purple-600 bg-purple-50 text-purple-900'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="font-medium capitalize">{p}</div>
              <div className="text-xs mt-0.5">
                {p === 'routine' && '24-48 hours'}
                {p === 'urgent' && '4-6 hours'}
                {p === 'stat' && 'Immediate'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Clinical Notes (Optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Clinical indication, special instructions..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Summary Card */}
      {selectedTests.length > 0 && (
        <div className="p-4 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
          <div className="text-sm text-gray-600 space-y-1">
            <div className="flex justify-between">
              <span>Number of tests:</span>
              <span className="font-semibold text-gray-900">{selectedTests.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Priority:</span>
              <span className="font-semibold text-gray-900 capitalize">{priority}</span>
            </div>
            <div className="flex justify-between">
              <span>Expected time:</span>
              <span className="font-semibold text-gray-900">
                {priority === 'stat' && 'Immediate'}
                {priority === 'urgent' && '4-6 hours'}
                {priority === 'routine' && '24-48 hours'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
