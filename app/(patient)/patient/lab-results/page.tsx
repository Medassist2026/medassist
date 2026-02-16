'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import LabResultsDisplay from '@/components/clinical/LabResultsDisplay'

interface LabOrder {
  id: string
  status: string
  priority: string
  notes: string | null
  ordered_at: string
  completed_at: string | null
  doctor: {
    id: string
    full_name: string
    specialty: string
  }
  results: Array<{
    id: string
    result_value: number | null
    is_abnormal: boolean
    abnormal_flag: string | null
    test: {
      id: string
      test_code: string
      test_name: string
      category: string
      normal_range_min: number | null
      normal_range_max: number | null
      unit: string | null
    }
  }>
}

export default function PatientLabResultsPage() {
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<LabOrder | null>(null)

  useEffect(() => {
    loadResults()
  }, [])

  const loadResults = async () => {
    try {
      const response = await fetch('/api/patient/lab-results')
      const data = await response.json()
      
      if (data.orders) {
        setOrders(data.orders)
      }
    } catch (error) {
      console.error('Failed to load lab results:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin w-8 h-8 border-4 border-secondary-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  // Detail View
  if (selectedOrder) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-4">
          <button
            onClick={() => setSelectedOrder(null)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Results
          </button>
        </div>
        <LabResultsDisplay order={selectedOrder} showPatientInfo={false} />
      </div>
    )
  }

  // List View
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Lab Results</h1>
        <p className="text-gray-600 mt-1">View your laboratory test results</p>
      </div>

      {/* Results List */}
      {orders.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <p className="text-lg font-medium text-gray-900">No Lab Results Yet</p>
          <p className="text-gray-500 mt-1">Your lab results will appear here once completed</p>
          <Link
            href="/patient/dashboard"
            className="inline-block mt-4 px-4 py-2 bg-secondary-600 hover:bg-secondary-700 text-white rounded-lg font-medium"
          >
            Back to Dashboard
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => {
            const abnormalCount = order.results.filter(r => r.is_abnormal).length
            const criticalCount = order.results.filter(r => 
              r.abnormal_flag === 'HH' || r.abnormal_flag === 'LL'
            ).length
            
            // Group by category
            const categories = [...new Set(order.results.map(r => r.test.category))]
            
            return (
              <div
                key={order.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 hover:border-secondary-300 transition-colors cursor-pointer"
                onClick={() => setSelectedOrder(order)}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-900">
                          Lab Results - {formatDate(order.completed_at)}
                        </h3>
                        {criticalCount > 0 && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded">
                            {criticalCount} Critical
                          </span>
                        )}
                        {abnormalCount > 0 && criticalCount === 0 && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-yellow-100 text-yellow-700 rounded">
                            {abnormalCount} Abnormal
                          </span>
                        )}
                        {abnormalCount === 0 && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-green-100 text-green-700 rounded">
                            All Normal
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        Ordered by Dr. {order.doctor.full_name} • {order.results.length} tests
                      </p>
                      
                      {/* Categories */}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {categories.map(cat => (
                          <span key={cat} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  {/* Summary */}
                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      <span className="text-sm text-gray-600">
                        {order.results.length - abnormalCount} Normal
                      </span>
                    </div>
                    {abnormalCount > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                        <span className="text-sm text-gray-600">
                          {abnormalCount - criticalCount} Abnormal
                        </span>
                      </div>
                    )}
                    {criticalCount > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                        <span className="text-sm text-red-600 font-medium">
                          {criticalCount} Critical
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
