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
  lab_order_id?: string
  lab_test_id?: string
  result_value: number | null
  result_text?: string | null
  is_abnormal: boolean
  abnormal_flag: string | null
  result_date?: string | null
  test: LabTest
}

interface LabOrder {
  id: string
  patient_id?: string
  doctor_id?: string
  status: string
  priority: string
  notes: string | null
  ordered_at: string
  collected_at?: string | null
  completed_at: string | null
  patient?: {
    full_name: string
    date_of_birth: string | null
    sex?: string | null
  }
  doctor?: {
    full_name: string
    specialty: string
  }
  results: LabResult[]
}

interface LabResultsDisplayProps {
  order: LabOrder
  onPrint?: () => void
  showPatientInfo?: boolean
}

export default function LabResultsDisplay({
  order,
  onPrint,
  showPatientInfo = true
}: LabResultsDisplayProps) {
  const [expandedCategories, setExpandedCategories] = useState<string[]>([])

  const getFlagColor = (flag: string | null, isAbnormal: boolean) => {
    if (!isAbnormal) return 'bg-green-50 text-green-700 border-green-200'
    switch (flag) {
      case 'HH':
      case 'LL':
        return 'bg-red-50 text-red-700 border-red-200'
      case 'H':
      case 'L':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  const getFlagBadge = (flag: string | null, isAbnormal: boolean) => {
    if (!isAbnormal) return null
    
    const colors: Record<string, string> = {
      'HH': 'bg-red-600 text-white',
      'LL': 'bg-red-600 text-white',
      'H': 'bg-yellow-500 text-white',
      'L': 'bg-yellow-500 text-white'
    }
    
    const labels: Record<string, string> = {
      'HH': '↑↑ Critical High',
      'LL': '↓↓ Critical Low',
      'H': '↑ High',
      'L': '↓ Low'
    }
    
    return (
      <span className={`px-2 py-0.5 text-xs font-bold rounded ${colors[flag || ''] || 'bg-gray-500 text-white'}`}>
        {labels[flag || ''] || 'Abnormal'}
      </span>
    )
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      'pending': 'bg-gray-100 text-gray-700',
      'collected': 'bg-blue-100 text-blue-700',
      'processing': 'bg-purple-100 text-purple-700',
      'completed': 'bg-green-100 text-green-700',
      'cancelled': 'bg-red-100 text-red-700'
    }
    return (
      <span className={`px-3 py-1 text-sm font-medium rounded-full ${colors[status] || 'bg-gray-100'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      'routine': 'bg-gray-100 text-gray-600',
      'urgent': 'bg-orange-100 text-orange-700',
      'stat': 'bg-red-100 text-red-700'
    }
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors[priority] || 'bg-gray-100'}`}>
        {priority.toUpperCase()}
      </span>
    )
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const calculateAge = (dob: string | null) => {
    if (!dob) return null
    const today = new Date()
    const birthDate = new Date(dob)
    let age = today.getFullYear() - birthDate.getFullYear()
    const m = today.getMonth() - birthDate.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
    return age
  }

  // Group results by category
  const groupedResults = order.results.reduce((acc, result) => {
    const category = result.test.category
    if (!acc[category]) acc[category] = []
    acc[category].push(result)
    return acc
  }, {} as Record<string, LabResult[]>)

  const abnormalCount = order.results.filter(r => r.is_abnormal).length
  const criticalCount = order.results.filter(r => 
    r.abnormal_flag === 'HH' || r.abnormal_flag === 'LL'
  ).length

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    )
  }

  const handlePrint = () => {
    if (onPrint) {
      onPrint()
    } else {
      window.print()
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 print:shadow-none print:border-0">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 print:border-gray-300">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-gray-900">Laboratory Results</h2>
              {getStatusBadge(order.status)}
              {getPriorityBadge(order.priority)}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Ordered: {formatDate(order.ordered_at)}
              {order.completed_at && ` • Completed: ${formatDate(order.completed_at)}`}
            </p>
          </div>
          
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium flex items-center gap-2 print:hidden"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
        </div>

        {/* Patient Info */}
        {showPatientInfo && order.patient && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase">Patient</p>
                <p className="font-medium text-gray-900">{order.patient.full_name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Age / Sex</p>
                <p className="font-medium text-gray-900">
                  {calculateAge(order.patient.date_of_birth) ?? '—'} yrs / {order.patient.sex?.toUpperCase() || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Ordering Physician</p>
                <p className="font-medium text-gray-900">Dr. {order.doctor?.full_name || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Specialty</p>
                <p className="font-medium text-gray-900 capitalize">
                  {order.doctor?.specialty?.replace('-', ' ') || '—'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Summary */}
        {order.status === 'completed' && (
          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              <span className="text-sm text-gray-600">
                {order.results.length - abnormalCount} Normal
              </span>
            </div>
            {abnormalCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                <span className="text-sm text-gray-600">
                  {abnormalCount - criticalCount} Abnormal
                </span>
              </div>
            )}
            {criticalCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                <span className="text-sm text-red-600 font-medium">
                  {criticalCount} Critical
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="divide-y divide-gray-100">
        {Object.entries(groupedResults).map(([category, categoryResults]) => {
          const categoryAbnormal = categoryResults.filter(r => r.is_abnormal).length
          const isExpanded = expandedCategories.includes(category) || order.status !== 'completed'
          
          return (
            <div key={category} className="print:break-inside-avoid">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 print:hover:bg-white"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    categoryAbnormal > 0 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}></div>
                  <h3 className="text-lg font-semibold text-gray-900">{category}</h3>
                  <span className="text-sm text-gray-500">
                    ({categoryResults.length} tests)
                  </span>
                  {categoryAbnormal > 0 && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded">
                      {categoryAbnormal} abnormal
                    </span>
                  )}
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform print:hidden ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Results Table */}
              {(isExpanded || true) && ( // Always show in print
                <div className={`px-4 pb-4 ${!isExpanded ? 'hidden print:block' : ''}`}>
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 uppercase">
                        <th className="py-2 font-medium">Test</th>
                        <th className="py-2 font-medium text-right">Result</th>
                        <th className="py-2 font-medium text-right">Reference Range</th>
                        <th className="py-2 font-medium text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {categoryResults.map(result => (
                        <tr
                          key={result.id}
                          className={`${result.is_abnormal ? getFlagColor(result.abnormal_flag, true) : ''}`}
                        >
                          <td className="py-3">
                            <div>
                              <span className="font-medium text-gray-900">
                                {result.test.test_name}
                              </span>
                              <span className="text-xs text-gray-500 ml-2">
                                ({result.test.test_code})
                              </span>
                            </div>
                          </td>
                          <td className="py-3 text-right">
                            {result.result_value !== null ? (
                              <span className={`font-mono font-medium ${
                                result.is_abnormal ? 'text-inherit' : 'text-gray-900'
                              }`}>
                                {result.result_value.toFixed(2)} {result.test.unit || ''}
                              </span>
                            ) : (
                              <span className="text-gray-400">Pending</span>
                            )}
                          </td>
                          <td className="py-3 text-right text-sm text-gray-500">
                            {result.test.normal_range_min ?? '—'} - {result.test.normal_range_max ?? '—'} {result.test.unit || ''}
                          </td>
                          <td className="py-3 text-center">
                            {result.result_value !== null ? (
                              result.is_abnormal ? (
                                getFlagBadge(result.abnormal_flag, true)
                              ) : (
                                <span className="text-green-600 text-sm font-medium">✓ Normal</span>
                              )
                            ) : (
                              <span className="text-gray-400 text-sm">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-500 uppercase mb-1">Clinical Notes</p>
          <p className="text-gray-700">{order.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 text-xs text-gray-500 print:text-gray-600">
        <p>Order ID: {order.id}</p>
        <p className="mt-1">
          This report is for clinical reference only. Results should be interpreted in conjunction with clinical findings.
        </p>
      </div>
    </div>
  )
}
