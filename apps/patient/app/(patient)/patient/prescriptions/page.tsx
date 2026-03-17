'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface PrescriptionItem {
  id: string
  drug_name: string
  drug_brand_name?: string
  drug_brand_name_ar?: string
  generic_name?: string
  strength?: string
  form?: string
  frequency: string
  duration: string
  quantity?: number
  instructions?: string
  status: string
}

interface Visit {
  noteId: string
  date: string
  doctorName: string
  items: PrescriptionItem[]
}

export default function PrescriptionsPage() {
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/patient/prescriptions')
        if (!res.ok) throw new Error('Failed to load prescriptions')
        const data = await res.json()
        setVisits(data.visits || [])
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <h1 className="text-xl font-bold text-red-900 mb-2">Error</h1>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Prescriptions</h1>
          <p className="text-gray-600 mt-1">Medications prescribed by your doctors</p>
        </div>
        <Link href="/patient/dashboard" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
          Back to Dashboard
        </Link>
      </div>

      {visits.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Prescriptions Yet</h3>
          <p className="text-gray-500 max-w-sm mx-auto">
            Your prescriptions will appear here after your doctor writes them during a visit.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {visits.map((visit) => (
            <div key={visit.noteId} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Visit Header */}
              <div className="bg-gradient-to-r from-primary-50 to-primary-100 px-6 py-4 border-b border-primary-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-primary-600 font-medium">
                      {new Date(visit.date).toLocaleDateString('en-US', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                      })}
                    </p>
                    <p className="text-primary-900 font-semibold">Dr. {visit.doctorName.replace(/^Dr\.?\s*/i, '')}</p>
                  </div>
                  <span className="px-3 py-1 bg-white border border-primary-200 rounded-full text-sm text-primary-700 font-medium">
                    {visit.items.length} medication{visit.items.length > 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Medications List */}
              <div className="divide-y divide-gray-100">
                {visit.items.map((item) => (
                  <div key={item.id} className="px-6 py-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-semibold text-gray-900">
                          {item.drug_name}
                          {item.strength && <span className="text-gray-500 font-normal ml-1">{item.strength}</span>}
                        </h4>
                        {item.drug_brand_name_ar && (
                          <p className="text-sm text-gray-500" dir="rtl">{item.drug_brand_name_ar}</p>
                        )}
                        {item.generic_name && item.generic_name !== item.drug_name && (
                          <p className="text-xs text-gray-400">Generic: {item.generic_name}</p>
                        )}
                      </div>
                      {item.form && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs capitalize">
                          {item.form}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      {item.frequency && (
                        <div className="bg-blue-50 rounded-lg p-2">
                          <p className="text-xs text-blue-600 mb-0.5">Frequency</p>
                          <p className="text-blue-900 font-medium">{item.frequency}</p>
                        </div>
                      )}
                      {item.duration && (
                        <div className="bg-teal-50 rounded-lg p-2">
                          <p className="text-xs text-teal-600 mb-0.5">Duration</p>
                          <p className="text-teal-900 font-medium">{item.duration}</p>
                        </div>
                      )}
                      {item.quantity && (
                        <div className="bg-green-50 rounded-lg p-2">
                          <p className="text-xs text-green-600 mb-0.5">Quantity</p>
                          <p className="text-green-900 font-medium">{item.quantity}</p>
                        </div>
                      )}
                    </div>

                    {item.instructions && (
                      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-100 rounded-lg">
                        <p className="text-xs text-yellow-700">
                          <span className="font-medium">Instructions:</span> {item.instructions}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
