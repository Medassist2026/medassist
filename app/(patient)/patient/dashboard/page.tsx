'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
  HelpIcon, 
  StatusLegend, 
  HelpPanel,
  MEDICATION_STATUS_LEGEND,
  PENDING_ACTIONS_HELP 
} from '@/components/ui/HelpTooltips'

// ============================================================================
// TYPES
// ============================================================================

interface Medication {
  id: string
  drug_name: string
  dosage: string
  frequency: string
  status: 'pending' | 'active' | 'expired' | 'declined'
  source: 'doctor' | 'manual'
  prescribed_date?: string
  end_date?: string
  doctor_name?: string
}

interface PendingAction {
  id: string
  type: 'medication' | 'lab_result' | 'message'
  title: string
  description: string
  created_at: string
  expires_at?: string
}

interface DashboardStats {
  active_medications: number
  pending_actions: number
  upcoming_appointments: number
  unread_messages: number
}

// ============================================================================
// PENDING ACTION CARD WITH TOOLTIP
// ============================================================================

function PendingActionCard({ action, onAction }: { action: PendingAction, onAction: () => void }) {
  const typeIcons = {
    medication: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
    lab_result: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    message: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    )
  }

  const typeColors = {
    medication: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    lab_result: 'bg-blue-100 text-blue-700 border-blue-200',
    message: 'bg-purple-100 text-purple-700 border-purple-200'
  }

  const typeLabels = {
    medication: 'New Prescription',
    lab_result: 'Lab Result Ready',
    message: 'New Message'
  }

  // Calculate days until expiry
  const daysLeft = action.expires_at 
    ? Math.ceil((new Date(action.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <button
      onClick={onAction}
      className={`w-full text-left p-4 rounded-lg border-2 hover:shadow-md transition-shadow ${typeColors[action.type]}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {typeIcons[action.type]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{typeLabels[action.type]}</span>
            {daysLeft !== null && daysLeft <= 7 && (
              <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                {daysLeft <= 0 ? 'Expires today' : `${daysLeft}d left`}
              </span>
            )}
          </div>
          <p className="text-sm mt-1 truncate">{action.title}</p>
          <p className="text-xs opacity-75 mt-1">{action.description}</p>
        </div>
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  )
}

// ============================================================================
// MEDICATION CARD WITH STATUS EXPLANATION
// ============================================================================

function MedicationCard({ medication }: { medication: Medication }) {
  const statusConfig = {
    pending: {
      color: 'bg-yellow-100 border-yellow-300 text-yellow-800',
      label: 'Pending',
      icon: '⏳'
    },
    active: {
      color: 'bg-green-100 border-green-300 text-green-800',
      label: 'Active',
      icon: '✓'
    },
    expired: {
      color: 'bg-gray-100 border-gray-300 text-gray-600',
      label: 'Expired',
      icon: '○'
    },
    declined: {
      color: 'bg-red-100 border-red-300 text-red-700',
      label: 'Declined',
      icon: '✕'
    }
  }

  const sourceLabel = medication.source === 'doctor' ? 'From Doctor' : 'Manual Entry'
  const config = statusConfig[medication.status]

  return (
    <div className={`p-4 rounded-lg border-2 ${config.color}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold">{medication.drug_name}</h4>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/50">
              {config.icon} {config.label}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/50">
              {sourceLabel}
            </span>
          </div>
          <p className="text-sm mt-1">{medication.dosage} · {medication.frequency}</p>
          {medication.doctor_name && (
            <p className="text-xs mt-1 opacity-75">Dr. {medication.doctor_name}</p>
          )}
          {medication.end_date && (
            <p className="text-xs mt-1 opacity-75">
              Until {new Date(medication.end_date).toLocaleDateString()}
            </p>
          )}
        </div>
        
        {medication.status === 'pending' && (
          <div className="flex gap-2">
            <button className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
              Accept
            </button>
            <button className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Decline
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN PATIENT DASHBOARD
// ============================================================================

export default function PatientDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    active_medications: 0,
    pending_actions: 0,
    upcoming_appointments: 0,
    unread_messages: 0
  })
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([])
  const [medications, setMedications] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [showStatusGuide, setShowStatusGuide] = useState(false)

  useEffect(() => {
    // Simulated data load - replace with actual API calls
    const loadData = async () => {
      try {
        // In production, fetch from API
        setStats({
          active_medications: 3,
          pending_actions: 2,
          upcoming_appointments: 1,
          unread_messages: 0
        })
        
        setPendingActions([
          {
            id: '1',
            type: 'medication',
            title: 'Amoxicillin 500mg',
            description: 'Prescribed by Dr. Ahmed for infection',
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          },
          {
            id: '2',
            type: 'lab_result',
            title: 'Complete Blood Count',
            description: 'Results ready for review',
            created_at: new Date().toISOString()
          }
        ])
        
        setMedications([
          {
            id: '1',
            drug_name: 'Metformin',
            dosage: '500mg',
            frequency: 'Twice daily',
            status: 'active',
            source: 'doctor',
            doctor_name: 'Ahmed Hassan',
            end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          },
          {
            id: '2',
            drug_name: 'Vitamin D',
            dosage: '1000 IU',
            frequency: 'Once daily',
            status: 'active',
            source: 'manual'
          },
          {
            id: '3',
            drug_name: 'Amoxicillin',
            dosage: '500mg',
            frequency: 'Three times daily',
            status: 'pending',
            source: 'doctor',
            doctor_name: 'Ahmed Hassan'
          }
        ])
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome Back!</h1>
        <p className="text-gray-600 mt-1">Here's your health summary</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-green-600">{stats.active_medications}</div>
          <div className="text-sm text-gray-600">Active Medications</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-yellow-600">{stats.pending_actions}</div>
          <div className="text-sm text-gray-600 flex items-center gap-1">
            Pending Actions
            <HelpIcon content={PENDING_ACTIONS_HELP.content} size="sm" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-blue-600">{stats.upcoming_appointments}</div>
          <div className="text-sm text-gray-600">Upcoming Visits</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-purple-600">{stats.unread_messages}</div>
          <div className="text-sm text-gray-600">Messages</div>
        </div>
      </div>

      {/* Pending Actions Section (UX-P002) */}
      {pendingActions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">Pending Actions</h2>
              <HelpIcon 
                content={PENDING_ACTIONS_HELP.content}
                position="right"
              />
            </div>
            <span className="text-sm text-gray-500">
              {pendingActions.length} item{pendingActions.length !== 1 ? 's' : ''} need attention
            </span>
          </div>
          
          {/* Help Panel for first-time users */}
          <HelpPanel title="What are Pending Actions?">
            <div className="space-y-2">
              <p>These are items that need your attention:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>New medications</strong> - Review and accept/decline prescriptions</li>
                <li><strong>Lab results</strong> - View your test results</li>
                <li><strong>Messages</strong> - Read messages from your doctor</li>
              </ul>
              <p className="text-xs mt-2">
                ⚠️ Pending items expire after 2 weeks if not addressed
              </p>
            </div>
          </HelpPanel>
          
          <div className="space-y-3 mt-4">
            {pendingActions.map(action => (
              <PendingActionCard 
                key={action.id} 
                action={action}
                onAction={() => console.log('Action clicked:', action.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Medications Section (UX-P005) */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">My Medications</h2>
            <button
              onClick={() => setShowStatusGuide(!showStatusGuide)}
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Status Guide
            </button>
          </div>
          <Link 
            href="/patient/medications"
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            View All →
          </Link>
        </div>

        {/* Status Legend (UX-P005) */}
        {showStatusGuide && (
          <div className="mb-4">
            <StatusLegend 
              items={MEDICATION_STATUS_LEGEND}
              title="Understanding Medication Statuses"
            />
          </div>
        )}

        <div className="space-y-3">
          {medications.map(med => (
            <MedicationCard key={med.id} medication={med} />
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link
          href="/patient/medications"
          className="bg-white rounded-xl border border-gray-200 p-4 hover:border-primary-300 hover:shadow-sm transition-all text-center"
        >
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-gray-700">Medications</span>
        </Link>

        <Link
          href="/patient/records"
          className="bg-white rounded-xl border border-gray-200 p-4 hover:border-primary-300 hover:shadow-sm transition-all text-center"
        >
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-gray-700">Medical Records</span>
        </Link>

        <Link
          href="/patient/messages"
          className="bg-white rounded-xl border border-gray-200 p-4 hover:border-primary-300 hover:shadow-sm transition-all text-center"
        >
          <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-gray-700">Messages</span>
        </Link>

        <Link
          href="/patient/appointments"
          className="bg-white rounded-xl border border-gray-200 p-4 hover:border-primary-300 hover:shadow-sm transition-all text-center"
        >
          <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-gray-700">Appointments</span>
        </Link>
      </div>
    </div>
  )
}
