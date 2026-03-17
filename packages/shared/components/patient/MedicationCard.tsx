'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface MedicationCardProps {
  medication: {
    id: string
    medication: {
      drug: string
      frequency: string
      duration: string
      notes?: string | null
    }
    status: 'pending' | 'accepted' | 'rejected'
    expires_at: string
    created_at: string
    clinical_note?: any
  }
  showActions: boolean
  isExpired?: boolean
}

const FREQUENCY_LABELS: Record<string, string> = {
  'once-daily': 'Once daily (OD)',
  'twice-daily': 'Twice daily (BD)',
  'three-times-daily': 'Three times daily (TDS)',
  'four-times-daily': 'Four times daily (QDS)',
  'every-6-hours': 'Every 6 hours',
  'every-8-hours': 'Every 8 hours',
  'before-meals': 'Before meals',
  'after-meals': 'After meals',
  'at-bedtime': 'At bedtime',
  'as-needed': 'As needed (PRN)',
}

const DURATION_LABELS: Record<string, string> = {
  '3-days': '3 days',
  '5-days': '5 days',
  '7-days': '7 days',
  '10-days': '10 days',
  '14-days': '14 days',
  '1-month': '1 month',
  '3-months': '3 months',
  'ongoing': 'Ongoing',
}

export default function MedicationCard({ medication, showActions, isExpired }: MedicationCardProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  
  const handleAction = async (action: 'accepted' | 'rejected') => {
    setLoading(true)
    
    try {
      const response = await fetch('/api/medications/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reminderId: medication.id,
          status: action
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to update medication status')
      }
      
      // Refresh the page to show updated status
      router.refresh()
      
    } catch (error) {
      console.error('Error updating medication:', error)
      alert('Failed to update medication. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  
  const statusColor = {
    pending: 'bg-warning-100 text-warning-800 border-warning-200',
    accepted: 'bg-success-100 text-success-800 border-success-200',
    rejected: 'bg-gray-100 text-gray-800 border-gray-200',
  }[medication.status]
  
  const daysUntilExpiry = Math.ceil(
    (new Date(medication.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  )
  
  return (
    <div className={`bg-white rounded-xl border-2 p-6 transition-all ${
      medication.status === 'pending' ? 'border-warning-300 shadow-sm' : 'border-gray-200'
    } ${isExpired ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {medication.medication.drug}
          </h3>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {FREQUENCY_LABELS[medication.medication.frequency] || medication.medication.frequency}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {DURATION_LABELS[medication.medication.duration] || medication.medication.duration}
            </span>
          </div>
        </div>
        
        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusColor}`}>
          {medication.status.charAt(0).toUpperCase() + medication.status.slice(1)}
        </span>
      </div>
      
      {/* Notes */}
      {medication.medication.notes && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <span className="font-semibold">Note:</span> {medication.medication.notes}
          </p>
        </div>
      )}
      
      {/* Expiry Warning */}
      {!isExpired && daysUntilExpiry <= 3 && medication.status === 'pending' && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-red-900">
            <span className="font-semibold">Expiring soon:</span> This medication reminder expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}
          </p>
        </div>
      )}
      
      {/* Actions */}
      {showActions && !loading && (
        <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
          <button
            onClick={() => handleAction('accepted')}
            className="flex-1 px-4 py-3 bg-success-600 hover:bg-success-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Accept
          </button>
          <button
            onClick={() => handleAction('rejected')}
            className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Decline
          </button>
        </div>
      )}
      
      {loading && (
        <div className="pt-4 border-t border-gray-200 text-center">
          <div className="inline-flex items-center gap-2 text-gray-600">
            <div className="animate-spin w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full"></div>
            <span className="text-sm">Updating...</span>
          </div>
        </div>
      )}
      
      {/* Additional Details */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="mt-4 text-sm text-gray-600 hover:text-gray-900 font-medium flex items-center gap-1"
      >
        {showDetails ? 'Hide' : 'Show'} Details
        <svg className={`w-4 h-4 transform transition-transform ${showDetails ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {showDetails && (
        <div className="mt-4 pt-4 border-t border-gray-200 space-y-2 text-sm text-gray-600">
          <p>
            <span className="font-semibold">Prescribed:</span>{' '}
            {new Date(medication.created_at).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
          {isExpired ? (
            <p className="text-red-600 font-semibold">
              Expired on{' '}
              {new Date(medication.expires_at).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          ) : (
            <p>
              <span className="font-semibold">Valid until:</span>{' '}
              {new Date(medication.expires_at).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
              {' '}({daysUntilExpiry} days remaining)
            </p>
          )}
        </div>
      )}
    </div>
  )
}
