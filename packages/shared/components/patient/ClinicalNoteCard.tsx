'use client'

import { useState } from 'react'

interface ClinicalNoteCardProps {
  note: {
    id: string
    chief_complaint: string[]
    diagnosis: Array<{ icd10_code: string; text: string }>
    medications: Array<{ drug: string; frequency: string; duration: string; notes?: string | null }>
    plan: string
    created_at: string
    doctors?: {
      unique_id: string
      specialty: string
    }
  }
}

export default function ClinicalNoteCard({ note }: ClinicalNoteCardProps) {
  const [expanded, setExpanded] = useState(false)
  
  const visitDate = new Date(note.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  
  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 hover:border-secondary-300 transition-colors">
      {/* Header - Always Visible */}
      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm font-semibold text-gray-900">{visitDate}</span>
            </div>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {note.chief_complaint.join(', ')}
            </h3>
            
            {note.diagnosis && note.diagnosis.length > 0 && (
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-secondary-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <div>
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold">Diagnosis:</span>
                  </p>
                  {note.diagnosis.map((diag, idx) => (
                    <p key={idx} className="text-sm text-gray-900 mt-1">
                      <span className="font-mono text-secondary-600">{diag.icd10_code}</span> - {diag.text}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-4 px-3 py-1.5 text-sm font-medium text-secondary-600 hover:text-secondary-700 hover:bg-secondary-50 rounded-lg transition-colors"
          >
            {expanded ? 'Less' : 'More'}
          </button>
        </div>
        
        {/* Quick Medication Count */}
        {note.medications && note.medications.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span>{note.medications.length} medication{note.medications.length !== 1 ? 's' : ''} prescribed</span>
          </div>
        )}
      </div>
      
      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-gray-200 p-6 space-y-6 bg-gray-50">
          {/* Medications */}
          {note.medications && note.medications.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-secondary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Medications
              </h4>
              <div className="space-y-3">
                {note.medications.map((med, idx) => (
                  <div key={idx} className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="font-semibold text-gray-900 mb-2">{med.drug}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Frequency:</span> {med.frequency}
                      </div>
                      <div>
                        <span className="font-medium">Duration:</span> {med.duration}
                      </div>
                    </div>
                    {med.notes && (
                      <p className="text-sm text-blue-900 mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                        <span className="font-semibold">Note:</span> {med.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Plan */}
          {note.plan && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-secondary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Treatment Plan
              </h4>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-gray-900">{note.plan}</p>
              </div>
            </div>
          )}
          
          {/* Doctor Info */}
          {note.doctors && (
            <div className="pt-4 border-t border-gray-200 flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>
                Documented by Dr. {note.doctors.unique_id} ({note.doctors.specialty.replace('-', ' ')})
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
