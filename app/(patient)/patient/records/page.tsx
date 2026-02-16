'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// ============================================================================
// TYPES
// ============================================================================

interface HealthSummary {
  medications: {
    active: number
    pending: number
    total: number
    recent: Array<{
      id: string
      name: string
      dosage: string
      status: string
    }>
  }
  labs: {
    total: number
    recent: Array<{
      id: string
      name: string
      date: string
      status: string
    }>
    abnormal: number
  }
  visits: {
    total: number
    recent: Array<{
      id: string
      doctor_name: string
      date: string
      reason: string
    }>
  }
  vitals: {
    lastUpdated?: string
    blood_pressure?: string
    heart_rate?: number
    weight?: number
    height?: number
  }
  conditions: Array<{
    id: string
    name: string
    diagnosed_date: string
    status: 'active' | 'resolved'
  }>
  allergies: Array<{
    id: string
    allergen: string
    reaction: string
    severity: 'mild' | 'moderate' | 'severe'
  }>
}

// ============================================================================
// SECTION COMPONENTS
// ============================================================================

function SectionCard({ 
  title, 
  icon, 
  count, 
  href, 
  children,
  action
}: { 
  title: string
  icon: React.ReactNode
  count?: number
  href: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600">
            {icon}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            {count !== undefined && (
              <p className="text-sm text-gray-500">{count} record{count !== 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {action}
          <Link 
            href={href}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            View All →
          </Link>
        </div>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-sm text-gray-500 text-center py-4">{message}</p>
  )
}

// ============================================================================
// MAIN UNIFIED HEALTH RECORD PAGE
// ============================================================================

export default function HealthRecordPage() {
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline'>('overview')

  useEffect(() => {
    const loadSummary = async () => {
      try {
        const res = await fetch('/api/patient/health-summary')
        if (res.ok) {
          const data = await res.json()
          setSummary(data.summary)
        } else {
          // Mock data for demo
          setSummary({
            medications: {
              active: 3,
              pending: 1,
              total: 5,
              recent: [
                { id: '1', name: 'Metformin', dosage: '500mg', status: 'active' },
                { id: '2', name: 'Vitamin D', dosage: '1000 IU', status: 'active' },
                { id: '3', name: 'Amoxicillin', dosage: '500mg', status: 'pending' }
              ]
            },
            labs: {
              total: 8,
              abnormal: 1,
              recent: [
                { id: '1', name: 'Complete Blood Count', date: '2026-02-10', status: 'normal' },
                { id: '2', name: 'Hemoglobin A1C', date: '2026-02-05', status: 'abnormal' }
              ]
            },
            visits: {
              total: 12,
              recent: [
                { id: '1', doctor_name: 'Dr. Ahmed Hassan', date: '2026-02-10', reason: 'Follow-up' },
                { id: '2', doctor_name: 'Dr. Sara Mohamed', date: '2026-01-25', reason: 'Annual Checkup' }
              ]
            },
            vitals: {
              lastUpdated: '2026-02-10',
              blood_pressure: '120/80',
              heart_rate: 72,
              weight: 75,
              height: 175
            },
            conditions: [
              { id: '1', name: 'Type 2 Diabetes', diagnosed_date: '2024-03-15', status: 'active' },
              { id: '2', name: 'Hypertension', diagnosed_date: '2023-08-20', status: 'active' }
            ],
            allergies: [
              { id: '1', allergen: 'Penicillin', reaction: 'Rash', severity: 'moderate' },
              { id: '2', allergen: 'Peanuts', reaction: 'Anaphylaxis', severity: 'severe' }
            ]
          })
        }
      } catch (error) {
        console.error('Failed to load health summary:', error)
      } finally {
        setLoading(false)
      }
    }
    loadSummary()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Failed to load health summary</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Health Record</h1>
          <p className="text-gray-600 mt-1">Your complete health information in one place</p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
          <div className="text-3xl font-bold">{summary.medications.active}</div>
          <div className="text-green-100">Active Medications</div>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
          <div className="text-3xl font-bold">{summary.labs.total}</div>
          <div className="text-blue-100">Lab Results</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
          <div className="text-3xl font-bold">{summary.visits.total}</div>
          <div className="text-purple-100">Doctor Visits</div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 text-white">
          <div className="text-3xl font-bold">{summary.conditions.length}</div>
          <div className="text-orange-100">Conditions</div>
        </div>
      </div>

      {/* Alerts */}
      {(summary.medications.pending > 0 || summary.labs.abnormal > 0) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h4 className="font-medium text-yellow-800">Items Needing Attention</h4>
              <ul className="text-sm text-yellow-700 mt-1 space-y-1">
                {summary.medications.pending > 0 && (
                  <li>• {summary.medications.pending} medication{summary.medications.pending !== 1 ? 's' : ''} pending approval</li>
                )}
                {summary.labs.abnormal > 0 && (
                  <li>• {summary.labs.abnormal} lab result{summary.labs.abnormal !== 1 ? 's' : ''} outside normal range</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'timeline'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Timeline
        </button>
      </div>

      {activeTab === 'overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Medications */}
          <SectionCard
            title="Medications"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>}
            count={summary.medications.total}
            href="/patient/medications"
          >
            {summary.medications.recent.length === 0 ? (
              <EmptyState message="No medications yet" />
            ) : (
              <div className="space-y-2">
                {summary.medications.recent.map(med => (
                  <div key={med.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <div className="font-medium">{med.name}</div>
                      <div className="text-sm text-gray-500">{med.dosage}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      med.status === 'active' ? 'bg-green-100 text-green-700' :
                      med.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {med.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Lab Results */}
          <SectionCard
            title="Lab Results"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
            count={summary.labs.total}
            href="/patient/labs"
          >
            {summary.labs.recent.length === 0 ? (
              <EmptyState message="No lab results yet" />
            ) : (
              <div className="space-y-2">
                {summary.labs.recent.map(lab => (
                  <div key={lab.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <div className="font-medium">{lab.name}</div>
                      <div className="text-sm text-gray-500">{new Date(lab.date).toLocaleDateString()}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      lab.status === 'normal' ? 'bg-green-100 text-green-700' :
                      lab.status === 'abnormal' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {lab.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Vitals */}
          <SectionCard
            title="Latest Vitals"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>}
            href="/patient/vitals"
          >
            {!summary.vitals.lastUpdated ? (
              <EmptyState message="No vitals recorded yet" />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-gray-900">{summary.vitals.blood_pressure || '-'}</div>
                  <div className="text-xs text-gray-500">Blood Pressure</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-gray-900">{summary.vitals.heart_rate || '-'}</div>
                  <div className="text-xs text-gray-500">Heart Rate (bpm)</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-gray-900">{summary.vitals.weight || '-'} kg</div>
                  <div className="text-xs text-gray-500">Weight</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-gray-900">{summary.vitals.height || '-'} cm</div>
                  <div className="text-xs text-gray-500">Height</div>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Conditions & Allergies */}
          <SectionCard
            title="Conditions & Allergies"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
            href="/patient/conditions"
          >
            <div className="space-y-4">
              {/* Conditions */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Active Conditions</h4>
                {summary.conditions.length === 0 ? (
                  <p className="text-sm text-gray-500">No conditions recorded</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {summary.conditions.filter(c => c.status === 'active').map(condition => (
                      <span key={condition.id} className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm">
                        {condition.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Allergies */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Allergies</h4>
                {summary.allergies.length === 0 ? (
                  <p className="text-sm text-gray-500">No allergies recorded</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {summary.allergies.map(allergy => (
                      <span 
                        key={allergy.id} 
                        className={`px-3 py-1 rounded-full text-sm ${
                          allergy.severity === 'severe' ? 'bg-red-100 text-red-700' :
                          allergy.severity === 'moderate' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {allergy.allergen}
                        {allergy.severity === 'severe' && ' ⚠️'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Recent Visits */}
          <SectionCard
            title="Recent Visits"
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
            count={summary.visits.total}
            href="/patient/visits"
          >
            {summary.visits.recent.length === 0 ? (
              <EmptyState message="No visits yet" />
            ) : (
              <div className="space-y-2">
                {summary.visits.recent.map(visit => (
                  <div key={visit.id} className="py-2 border-b border-gray-100 last:border-0">
                    <div className="font-medium">{visit.doctor_name}</div>
                    <div className="text-sm text-gray-500">
                      {new Date(visit.date).toLocaleDateString()} · {visit.reason}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      ) : (
        /* Timeline View */
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Health Timeline</h3>
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
            <div className="space-y-6">
              {/* Sample timeline items */}
              {[
                { date: '2026-02-10', type: 'visit', title: 'Doctor Visit', desc: 'Follow-up with Dr. Ahmed Hassan' },
                { date: '2026-02-10', type: 'lab', title: 'Lab Result', desc: 'Complete Blood Count - Normal' },
                { date: '2026-02-05', type: 'medication', title: 'New Medication', desc: 'Started Amoxicillin 500mg' },
                { date: '2026-01-25', type: 'visit', title: 'Doctor Visit', desc: 'Annual Checkup with Dr. Sara' },
              ].map((item, idx) => (
                <div key={idx} className="relative pl-10">
                  <div className={`absolute left-2 w-4 h-4 rounded-full border-2 border-white ${
                    item.type === 'visit' ? 'bg-purple-500' :
                    item.type === 'lab' ? 'bg-blue-500' :
                    'bg-green-500'
                  }`}></div>
                  <div className="text-xs text-gray-500 mb-1">
                    {new Date(item.date).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </div>
                  <div className="font-medium text-gray-900">{item.title}</div>
                  <div className="text-sm text-gray-600">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
