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
  const [searchQuery, setSearchQuery] = useState('')

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

  const selectPanel = (panelTestNames: string[]) => {
    const panelTestIds = tests
      .filter(t => panelTestNames.some(name =>
        t.test_name.toLowerCase().includes(name.toLowerCase()) ||
        t.category.toLowerCase().includes(name.toLowerCase())
      ))
      .map(t => t.id)

    setSelectedTests(prev => {
      const combined = new Set([...prev, ...panelTestIds])
      return Array.from(combined)
    })
  }

  const cbcTests = ['Hemoglobin', 'Hematocrit', 'WBC', 'Platelets', 'RBC', 'Hematology']
  const bmpTests = ['Glucose', 'BUN', 'Creatinine', 'Sodium', 'Potassium', 'CO2']
  const liverTests = ['ALT', 'AST', 'ALP', 'Bilirubin', 'Albumin']
  const lipidTests = ['Total Cholesterol', 'LDL', 'HDL', 'Triglycerides']
  const thyroidTests = ['TSH', 'T3', 'T4']

  const filteredTests = selectedCategory === 'all'
    ? tests.filter(t => {
        if (searchQuery.length < 2) return true
        const query = searchQuery.toLowerCase()
        return t.test_name.toLowerCase().includes(query) ||
               t.test_code.toLowerCase().includes(query)
      })
    : tests.filter(t => {
        if (searchQuery.length < 2) return t.category === selectedCategory
        const query = searchQuery.toLowerCase()
        return t.category === selectedCategory && (
          t.test_name.toLowerCase().includes(query) ||
          t.test_code.toLowerCase().includes(query)
        )
      })

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
        <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Laboratory Tests</h3>
          <p className="text-sm text-gray-600">Select tests to order</p>
        </div>
      </div>

      {/* Quick Panels Section (LB-007) */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Quick Panels
        </label>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <button
            type="button"
            onClick={() => selectPanel(cbcTests)}
            className="px-3 py-2 bg-blue-100 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-200 transition-colors"
          >
            CBC Panel
          </button>
          <button
            type="button"
            onClick={() => selectPanel(bmpTests)}
            className="px-3 py-2 bg-green-100 text-green-700 text-xs font-medium rounded-lg hover:bg-green-200 transition-colors"
          >
            Basic Metabolic
          </button>
          <button
            type="button"
            onClick={() => selectPanel(liverTests)}
            className="px-3 py-2 bg-amber-100 text-amber-700 text-xs font-medium rounded-lg hover:bg-amber-200 transition-colors"
          >
            Liver Panel
          </button>
          <button
            type="button"
            onClick={() => selectPanel(lipidTests)}
            className="px-3 py-2 bg-teal-100 text-teal-700 text-xs font-medium rounded-lg hover:bg-teal-200 transition-colors"
          >
            Lipid Panel
          </button>
          <button
            type="button"
            onClick={() => selectPanel(thyroidTests)}
            className="px-3 py-2 bg-pink-100 text-pink-700 text-xs font-medium rounded-lg hover:bg-pink-200 transition-colors"
          >
            Thyroid Panel
          </button>
        </div>
      </div>

      {/* Text Search (LB-008) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Search Tests
        </label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or code (min 2 characters)..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
        />
      </div>

      {/* Category Filter as Chips (LB-009) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Filter by Category
        </label>
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-teal-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {cat === 'all' ? 'All Categories' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Tests Summary */}
      {selectedTests.length > 0 && (
        <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-teal-900">
              Selected Tests ({selectedTests.length})
            </span>
            <button
              onClick={() => setSelectedTests([])}
              className="text-sm text-teal-600 hover:text-teal-700 font-medium"
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
                  className="px-3 py-1 bg-teal-600 text-white text-sm rounded-full flex items-center gap-2"
                >
                  {test.test_name}
                  <button
                    onClick={() => toggleTest(testId)}
                    className="hover:bg-teal-700 rounded-full"
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
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTests.includes(test.id)}
                    onChange={() => toggleTest(test.id)}
                    className="mt-1 w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
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
                  ? 'border-teal-600 bg-teal-50 text-teal-900'
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
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
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
