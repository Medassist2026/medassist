'use client'

import { useState } from 'react'
import { LAB_TEST_CATALOG, LAB_CATEGORIES, groupTestsByCategory } from '@shared/lib/data/lab-results'
import type { LabTest } from '@shared/lib/data/lab-results'

interface LabOrderFormProps {
  patientId: string
  clinicId: string
  onSuccess?: () => void
  onError?: (error: string) => void
}

export default function LabOrderForm({
  patientId,
  clinicId,
  onSuccess,
  onError,
}: LabOrderFormProps) {
  const [selectedTests, setSelectedTests] = useState<LabTest[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const testsByCategory = groupTestsByCategory()
  const categories = Object.keys(LAB_CATEGORIES).sort()

  const handleToggleTest = (test: LabTest) => {
    setSelectedTests(prev => {
      const exists = prev.some(t => t.id === test.id)
      if (exists) {
        return prev.filter(t => t.id !== test.id)
      } else {
        return [...prev, test]
      }
    })
  }

  const handleSelectCategory = (categoryId: string) => {
    const categoryTests = testsByCategory[categoryId] || []
    const allSelected = categoryTests.every(t =>
      selectedTests.some(st => st.id === t.id)
    )

    if (allSelected) {
      // Deselect all in category
      setSelectedTests(prev =>
        prev.filter(t => !categoryTests.some(ct => ct.id === t.id))
      )
    } else {
      // Select all in category
      const newTests = categoryTests.filter(
        t => !selectedTests.some(st => st.id === t.id)
      )
      setSelectedTests(prev => [...prev, ...newTests])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (selectedTests.length === 0) {
      setError('Please select at least one test')
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/clinical/lab-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          clinicId,
          tests: selectedTests.map(t => ({
            testId: t.id,
            testName: t.name,
          })),
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to create lab order')
      }

      setSelectedTests([])
      onSuccess?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
      onError?.(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="font-semibold text-gray-900">Select Lab Tests</h3>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-gray-200">
          {categories.map(categoryId => {
            const categoryInfo = LAB_CATEGORIES[categoryId as keyof typeof LAB_CATEGORIES]
            const categoryTests = testsByCategory[categoryId] || []
            const allSelected = categoryTests.length > 0 &&
              categoryTests.every(t => selectedTests.some(st => st.id === t.id))
            const someSelected = categoryTests.some(t =>
              selectedTests.some(st => st.id === t.id)
            )

            return (
              <button
                key={categoryId}
                type="button"
                onClick={() => setActiveCategory(activeCategory === categoryId ? null : categoryId)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeCategory === categoryId
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                } ${someSelected ? 'bg-blue-50' : ''}`}
              >
                {categoryInfo.nameAr}
                {someSelected && (
                  <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                    {categoryTests.filter(t =>
                      selectedTests.some(st => st.id === t.id)
                    ).length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Test Grid */}
        <div className="space-y-4">
          {categories.map(categoryId => {
            if (activeCategory && activeCategory !== categoryId) return null

            const categoryInfo = LAB_CATEGORIES[categoryId as keyof typeof LAB_CATEGORIES]
            const categoryTests = testsByCategory[categoryId] || []
            const allSelected = categoryTests.length > 0 &&
              categoryTests.every(t => selectedTests.some(st => st.id === t.id))
            const someSelected = categoryTests.some(t =>
              selectedTests.some(st => st.id === t.id)
            )

            return (
              <div key={categoryId} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-900">{categoryInfo.nameAr}</h4>
                    <p className="text-xs text-gray-600 mt-1">{categoryInfo.name}</p>
                  </div>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => handleSelectCategory(categoryId)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-600">
                      {allSelected ? 'Deselect all' : 'Select all'}
                    </span>
                  </label>
                </div>

                {/* Tests in category */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {categoryTests.map(test => {
                    const isSelected = selectedTests.some(t => t.id === test.id)

                    return (
                      <label
                        key={test.id}
                        className="flex items-start p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleTest(test)}
                          className="w-4 h-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="ml-3 flex-1">
                          <p className="text-sm font-medium text-gray-900">{test.name}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{test.nameAr}</p>
                          {test.unit && (
                            <p className="text-xs text-gray-500 mt-1">Unit: {test.unit}</p>
                          )}
                          {test.referenceRange && (
                            <p className="text-xs text-gray-500">Ref: {test.referenceRange}</p>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected Tests Summary */}
      {selectedTests.length > 0 && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-medium text-blue-900">
            Selected {selectedTests.length} test{selectedTests.length !== 1 ? 's' : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedTests.map(test => (
              <span
                key={test.id}
                className="inline-flex items-center gap-1 px-2 py-1 bg-white text-xs text-blue-700 border border-blue-300 rounded-full"
              >
                {test.name}
                <button
                  type="button"
                  onClick={() => handleToggleTest(test)}
                  className="ml-1 text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="flex gap-3 pt-4 border-t">
        <button
          type="submit"
          disabled={isSubmitting || selectedTests.length === 0}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {isSubmitting ? 'Ordering...' : `Order ${selectedTests.length} Test${selectedTests.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </form>
  )
}
