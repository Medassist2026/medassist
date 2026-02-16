'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import LabResultsEntry from '@/components/clinical/LabResultsEntry'
import LabResultsDisplay from '@/components/clinical/LabResultsDisplay'

interface LabOrder {
  id: string
  patient_id: string
  doctor_id: string
  status: string
  priority: string
  notes: string | null
  ordered_at: string
  collected_at: string | null
  completed_at: string | null
  patient: {
    id: string
    full_name: string
    phone: string
    date_of_birth: string | null
  }
  results: Array<{
    id: string
    lab_order_id: string
    lab_test_id: string
    result_value: number | null
    result_text: string | null
    is_abnormal: boolean
    abnormal_flag: string | null
    result_date: string | null
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

type StatusFilter = 'all' | 'pending' | 'collected' | 'processing' | 'completed'
type ViewMode = 'list' | 'entry' | 'view'

export default function LabOrdersPage() {
  const [orders, setOrders] = useState<LabOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedOrder, setSelectedOrder] = useState<LabOrder | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  const loadOrders = useCallback(async () => {
    try {
      const url = statusFilter === 'all' 
        ? '/api/doctor/lab-orders'
        : `/api/doctor/lab-orders?status=${statusFilter}`
      
      const response = await fetch(url)
      const data = await response.json()
      
      if (data.orders) {
        setOrders(data.orders)
      }
    } catch (error) {
      console.error('Failed to load orders:', error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const response = await fetch('/api/doctor/lab-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          action: 'updateStatus',
          status: newStatus
        })
      })

      if (response.ok) {
        loadOrders()
      }
    } catch (error) {
      console.error('Failed to update status:', error)
    }
  }

  const handleSubmitResults = async (results: Array<{
    resultId: string
    value: number
    isAbnormal: boolean
    abnormalFlag: 'H' | 'L' | 'HH' | 'LL' | null
  }>) => {
    if (!selectedOrder) return

    const response = await fetch('/api/doctor/lab-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: selectedOrder.id,
        action: 'submitResults',
        results
      })
    })

    if (response.ok) {
      setViewMode('list')
      setSelectedOrder(null)
      loadOrders()
    } else {
      const data = await response.json()
      throw new Error(data.error || 'Failed to submit results')
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'pending': 'bg-gray-100 text-gray-700',
      'collected': 'bg-blue-100 text-blue-700',
      'processing': 'bg-purple-100 text-purple-700',
      'completed': 'bg-green-100 text-green-700',
      'cancelled': 'bg-red-100 text-red-700'
    }
    return colors[status] || 'bg-gray-100 text-gray-700'
  }

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      'routine': 'text-gray-600',
      'urgent': 'text-orange-600',
      'stat': 'text-red-600 font-bold'
    }
    return colors[priority] || 'text-gray-600'
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const statusCounts = {
    all: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    collected: orders.filter(o => o.status === 'collected').length,
    processing: orders.filter(o => o.status === 'processing').length,
    completed: orders.filter(o => o.status === 'completed').length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  // Entry Mode
  if (viewMode === 'entry' && selectedOrder) {
    return (
      <div className="max-w-4xl mx-auto">
        <LabResultsEntry
          orderId={selectedOrder.id}
          results={selectedOrder.results}
          patientName={selectedOrder.patient.full_name}
          onSubmit={handleSubmitResults}
          onCancel={() => {
            setViewMode('list')
            setSelectedOrder(null)
          }}
        />
      </div>
    )
  }

  // View Mode
  if (viewMode === 'view' && selectedOrder) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-4">
          <button
            onClick={() => {
              setViewMode('list')
              setSelectedOrder(null)
            }}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Orders
          </button>
        </div>
        <LabResultsDisplay order={selectedOrder} />
      </div>
    )
  }

  // List Mode
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Lab Orders</h1>
          <p className="text-gray-600 mt-1">Manage laboratory test orders and results</p>
        </div>
        <Link
          href="/doctor/session"
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Session
        </Link>
      </div>

      {/* Status Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {(['all', 'pending', 'collected', 'processing', 'completed'] as StatusFilter[]).map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              statusFilter === status
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-white/20">
              {statusCounts[status]}
            </span>
          </button>
        ))}
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {orders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-lg font-medium">No lab orders found</p>
            <p className="text-sm mt-1">Lab orders will appear here when you order tests during clinical sessions</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {orders.map(order => {
              const abnormalCount = order.results.filter(r => r.is_abnormal).length
              const pendingCount = order.results.filter(r => r.result_value === null).length
              
              return (
                <div key={order.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      {/* Patient Avatar */}
                      <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-primary-700 font-semibold">
                          {order.patient.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </span>
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900">{order.patient.full_name}</h3>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(order.status)}`}>
                            {order.status}
                          </span>
                          <span className={`text-xs ${getPriorityColor(order.priority)}`}>
                            {order.priority.toUpperCase()}
                          </span>
                        </div>
                        
                        <p className="text-sm text-gray-500 mt-1">
                          {order.results.length} tests • Ordered {formatDate(order.ordered_at)}
                        </p>
                        
                        {/* Test Categories */}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {[...new Set(order.results.map(r => r.test.category))].map(cat => (
                            <span key={cat} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                              {cat}
                            </span>
                          ))}
                        </div>

                        {/* Results Summary */}
                        {order.status === 'completed' && (
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-sm text-green-600">
                              ✓ {order.results.length - abnormalCount} normal
                            </span>
                            {abnormalCount > 0 && (
                              <span className="text-sm text-yellow-600">
                                ⚠ {abnormalCount} abnormal
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {order.status === 'pending' && (
                        <button
                          onClick={() => handleStatusChange(order.id, 'collected')}
                          className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg"
                        >
                          Mark Collected
                        </button>
                      )}
                      
                      {order.status === 'collected' && (
                        <button
                          onClick={() => handleStatusChange(order.id, 'processing')}
                          className="px-3 py-1.5 text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg"
                        >
                          Start Processing
                        </button>
                      )}
                      
                      {(order.status === 'processing' || order.status === 'collected') && (
                        <button
                          onClick={() => {
                            setSelectedOrder(order)
                            setViewMode('entry')
                          }}
                          className="px-3 py-1.5 text-sm bg-primary-600 text-white hover:bg-primary-700 rounded-lg"
                        >
                          Enter Results
                        </button>
                      )}
                      
                      {order.status === 'completed' && (
                        <button
                          onClick={() => {
                            setSelectedOrder(order)
                            setViewMode('view')
                          }}
                          className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg"
                        >
                          View Results
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
