'use client'

import { useState, useEffect } from 'react'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'
import { HelpIcon, HelpPanel } from '@shared/components/ui/HelpTooltips'

// ============================================================================
// TYPES
// ============================================================================

interface Doctor {
  id: string
  name: string
  specialty: string
  clinic_name?: string
  last_visit?: string
  relationship_status: 'active' | 'pending' | 'revoked'
}

interface SharingPreference {
  doctor_id: string
  share_medications: boolean
  share_conditions: boolean
  share_allergies: boolean
  share_lab_results: boolean
  share_visit_history: boolean
  share_diary: boolean
  share_vitals: boolean
  custom_note?: string
  updated_at: string
}

interface RecordCategory {
  id: keyof Omit<SharingPreference, 'doctor_id' | 'custom_note' | 'updated_at'>
  label: string
  description: string
  icon: string
  sensitive: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

const RECORD_CATEGORIES: RecordCategory[] = [
  {
    id: 'share_medications',
    label: 'Medications',
    description: 'Current and past medications, dosages, and prescription history',
    icon: '💊',
    sensitive: false
  },
  {
    id: 'share_conditions',
    label: 'Medical Conditions',
    description: 'Diagnosed conditions, chronic illnesses, and medical history',
    icon: '🏥',
    sensitive: true
  },
  {
    id: 'share_allergies',
    label: 'Allergies',
    description: 'Drug allergies, food allergies, and reactions',
    icon: '⚠️',
    sensitive: false
  },
  {
    id: 'share_lab_results',
    label: 'Lab Results',
    description: 'Blood tests, imaging, and other diagnostic results',
    icon: '🧪',
    sensitive: true
  },
  {
    id: 'share_visit_history',
    label: 'Visit History',
    description: 'Past appointments, visit notes, and treatment records',
    icon: '📋',
    sensitive: true
  },
  {
    id: 'share_diary',
    label: 'Health Diary',
    description: 'Daily mood, symptoms, sleep, and wellness entries',
    icon: '📔',
    sensitive: true
  },
  {
    id: 'share_vitals',
    label: 'Vital Signs',
    description: 'Blood pressure, heart rate, weight, and other measurements',
    icon: '❤️',
    sensitive: false
  }
]

const DEFAULT_SHARING: Omit<SharingPreference, 'doctor_id' | 'updated_at'> = {
  share_medications: true,
  share_conditions: true,
  share_allergies: true,
  share_lab_results: true,
  share_visit_history: true,
  share_diary: false, // Default off - more personal
  share_vitals: true
}

// ============================================================================
// SHARING HELP CONTENT
// ============================================================================

const SHARING_HELP = `
## How Record Sharing Works

### Your Data, Your Control
You decide exactly what health information each doctor can see. By default, we share clinical essentials but keep personal entries private.

### What Doctors Always See
- Basic profile (name, age, contact)
- Allergies (for safety)
- Records THEY created during YOUR visits

### What You Control
- Records from OTHER doctors
- Your personal diary entries
- Historical data before your relationship

### Privacy Guarantee
- Doctors cannot see records you've hidden
- You can change settings anytime
- Changes take effect immediately
`

// ============================================================================
// DOCTOR SHARING CARD
// ============================================================================

interface DoctorSharingCardProps {
  doctor: Doctor
  preferences: SharingPreference
  onUpdate: (preferences: Partial<SharingPreference>) => void
  onRevoke: () => void
}

function DoctorSharingCard({ doctor, preferences, onUpdate, onRevoke }: DoctorSharingCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [revokeConfirm, setRevokeConfirm] = useState(false)

  const sharedCount = RECORD_CATEGORIES.filter(
    cat => preferences[cat.id] === true
  ).length

  const toggleCategory = (categoryId: keyof SharingPreference) => {
    onUpdate({ [categoryId]: !preferences[categoryId] })
  }

  const shareAll = () => {
    const updates: Partial<SharingPreference> = {}
    RECORD_CATEGORIES.forEach(cat => {
      updates[cat.id] = true
    })
    onUpdate(updates)
  }

  const shareMinimal = () => {
    const updates: Partial<SharingPreference> = {}
    RECORD_CATEGORIES.forEach(cat => {
      // Only share non-sensitive by default
      updates[cat.id] = !cat.sensitive
    })
    onUpdate(updates)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div 
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-blue-600 font-semibold text-lg">
              {doctor.name.split(' ').map(n => n[0]).join('')}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{doctor.name}</h3>
            <p className="text-sm text-gray-500">
              {doctor.specialty}
              {doctor.clinic_name && ` • ${doctor.clinic_name}`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-medium text-gray-900">
              {sharedCount}/{RECORD_CATEGORIES.length} shared
            </div>
            {doctor.last_visit && (
              <div className="text-xs text-gray-500">
                Last visit: {new Date(doctor.last_visit).toLocaleDateString()}
              </div>
            )}
          </div>
          <svg 
            className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {/* Quick Actions */}
          <div className="flex gap-2">
            <button
              onClick={shareAll}
              className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-full hover:bg-green-200"
            >
              Share All
            </button>
            <button
              onClick={shareMinimal}
              className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded-full hover:bg-yellow-200"
            >
              Essential Only
            </button>
            <button
              onClick={() => setRevokeConfirm(true)}
              className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-full hover:bg-red-200 ml-auto"
            >
              Revoke Access
            </button>
          </div>

          {/* Category Toggles */}
          <div className="space-y-2">
            {RECORD_CATEGORIES.map(category => (
              <div 
                key={category.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{category.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{category.label}</span>
                      {category.sensitive && (
                        <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                          Sensitive
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{category.description}</p>
                  </div>
                </div>
                
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences[category.id] === true}
                    onChange={() => toggleCategory(category.id)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>
            ))}
          </div>

          {/* Last Updated */}
          <p className="text-xs text-gray-400 text-center">
            Settings last updated: {new Date(preferences.updated_at).toLocaleString()}
          </p>
        </div>
      )}

      {/* Revoke Confirmation */}
      <ConfirmDialog
        isOpen={revokeConfirm}
        title="Revoke Doctor Access"
        message={
          <div>
            <p>Revoke <strong>{doctor.name}'s</strong> access to your health records?</p>
            <p className="text-sm text-gray-500 mt-2">
              They will no longer be able to view your shared records. 
              Records they created during your visits will remain in your history.
            </p>
          </div>
        }
        confirmLabel="Revoke Access"
        confirmVariant="danger"
        onConfirm={() => {
          onRevoke()
          setRevokeConfirm(false)
        }}
        onCancel={() => setRevokeConfirm(false)}
      />
    </div>
  )
}

// ============================================================================
// MAIN RECORD SHARING PAGE
// ============================================================================

export default function RecordSharingPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [preferences, setPreferences] = useState<Record<string, SharingPreference>>({})
  const [loading, setLoading] = useState(true)
  const [showHelp, setShowHelp] = useState(false)
  const [globalDefaults, setGlobalDefaults] = useState(DEFAULT_SHARING)

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        // In production, fetch from API
        // const res = await fetch('/api/patient/sharing')
        
        // Mock data
        const mockDoctors: Doctor[] = [
          {
            id: '1',
            name: 'Dr. Ahmed Hassan',
            specialty: 'Internal Medicine',
            clinic_name: 'Cairo Medical Center',
            last_visit: '2026-02-10',
            relationship_status: 'active'
          },
          {
            id: '2',
            name: 'Dr. Sara Mohamed',
            specialty: 'Endocrinology',
            clinic_name: 'Diabetes Care Clinic',
            last_visit: '2026-01-15',
            relationship_status: 'active'
          },
          {
            id: '3',
            name: 'Dr. Khaled Ibrahim',
            specialty: 'Cardiology',
            last_visit: '2025-12-01',
            relationship_status: 'active'
          }
        ]

        const mockPreferences: Record<string, SharingPreference> = {
          '1': {
            doctor_id: '1',
            share_medications: true,
            share_conditions: true,
            share_allergies: true,
            share_lab_results: true,
            share_visit_history: true,
            share_diary: false,
            share_vitals: true,
            updated_at: '2026-02-10T10:00:00Z'
          },
          '2': {
            doctor_id: '2',
            share_medications: true,
            share_conditions: true,
            share_allergies: true,
            share_lab_results: true,
            share_visit_history: true,
            share_diary: true,
            share_vitals: true,
            updated_at: '2026-01-15T14:30:00Z'
          },
          '3': {
            doctor_id: '3',
            share_medications: true,
            share_conditions: false,
            share_allergies: true,
            share_lab_results: false,
            share_visit_history: false,
            share_diary: false,
            share_vitals: true,
            updated_at: '2025-12-01T09:00:00Z'
          }
        }

        setDoctors(mockDoctors)
        setPreferences(mockPreferences)
      } catch (error) {
        console.error('Failed to load sharing data:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // Update preferences for a doctor
  const handleUpdatePreferences = async (doctorId: string, updates: Partial<SharingPreference>) => {
    try {
      // In production, save to API
      // await fetch(`/api/patient/sharing/${doctorId}`, { method: 'PATCH', body: JSON.stringify(updates) })
      
      setPreferences(prev => ({
        ...prev,
        [doctorId]: {
          ...prev[doctorId],
          ...updates,
          updated_at: new Date().toISOString()
        }
      }))
    } catch (error) {
      console.error('Failed to update preferences:', error)
    }
  }

  // Revoke doctor access
  const handleRevokeAccess = async (doctorId: string) => {
    try {
      // In production, call API
      // await fetch(`/api/patient/sharing/${doctorId}`, { method: 'DELETE' })
      
      setDoctors(prev => prev.filter(d => d.id !== doctorId))
      setPreferences(prev => {
        const newPrefs = { ...prev }
        delete newPrefs[doctorId]
        return newPrefs
      })
    } catch (error) {
      console.error('Failed to revoke access:', error)
    }
  }

  // Apply global defaults to all doctors
  const applyGlobalDefaults = () => {
    const newPreferences: Record<string, SharingPreference> = {}
    doctors.forEach(doctor => {
      newPreferences[doctor.id] = {
        ...preferences[doctor.id],
        ...globalDefaults,
        doctor_id: doctor.id,
        updated_at: new Date().toISOString()
      }
    })
    setPreferences(newPreferences)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            🔐 Record Sharing
            <HelpIcon 
              content="Control what health information each doctor can see"
              position="right"
            />
          </h1>
          <p className="text-gray-600 mt-1">
            Manage what each doctor can access in your health records
          </p>
        </div>
        <button
          onClick={() => setShowHelp(!showHelp)}
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          {showHelp ? 'Hide Guide' : 'How it Works'}
        </button>
      </div>

      {/* Help Panel */}
      {showHelp && (
        <HelpPanel title="Understanding Record Sharing">
          <div className="prose prose-sm max-w-none">
            <h4 className="font-semibold">Your Data, Your Control</h4>
            <p>You decide exactly what health information each doctor can see.</p>
            
            <h4 className="font-semibold mt-4">What Doctors Always See</h4>
            <ul className="text-sm">
              <li>Basic profile (name, age, contact)</li>
              <li>Allergies (for your safety)</li>
              <li>Records THEY created during YOUR visits</li>
            </ul>
            
            <h4 className="font-semibold mt-4">What You Control</h4>
            <ul className="text-sm">
              <li>Records from OTHER doctors</li>
              <li>Your personal diary entries</li>
              <li>Historical data before your relationship</li>
            </ul>
            
            <p className="text-sm text-gray-500 mt-4">
              Changes take effect immediately. You can modify settings anytime.
            </p>
          </div>
        </HelpPanel>
      )}

      {/* Global Defaults */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-medium text-gray-900">Default Settings for New Doctors</h3>
            <p className="text-sm text-gray-500">Applied when you visit a new doctor</p>
          </div>
          <button
            onClick={applyGlobalDefaults}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Apply to All
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {RECORD_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setGlobalDefaults(prev => ({
                ...prev,
                [cat.id]: !prev[cat.id as keyof typeof prev]
              }))}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-colors ${
                globalDefaults[cat.id as keyof typeof globalDefaults]
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              {globalDefaults[cat.id as keyof typeof globalDefaults] ? '✓' : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-primary-600">{doctors.length}</div>
          <div className="text-sm text-gray-500">Connected Doctors</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-green-600">
            {doctors.filter(d => 
              Object.values(preferences[d.id] || {}).filter(v => v === true).length === RECORD_CATEGORIES.length
            ).length}
          </div>
          <div className="text-sm text-gray-500">Full Access</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-yellow-600">
            {doctors.filter(d => 
              Object.values(preferences[d.id] || {}).filter(v => v === true).length < RECORD_CATEGORIES.length
            ).length}
          </div>
          <div className="text-sm text-gray-500">Limited Access</div>
        </div>
      </div>

      {/* Doctor List */}
      {doctors.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <span className="text-4xl">👨‍⚕️</span>
          <p className="text-gray-600 mt-3">No connected doctors yet</p>
          <p className="text-sm text-gray-500 mt-1">
            After your first doctor visit, they'll appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Your Doctors</h2>
          {doctors.map(doctor => (
            <DoctorSharingCard
              key={doctor.id}
              doctor={doctor}
              preferences={preferences[doctor.id] || {
                doctor_id: doctor.id,
                ...DEFAULT_SHARING,
                updated_at: new Date().toISOString()
              }}
              onUpdate={(updates) => handleUpdatePreferences(doctor.id, updates)}
              onRevoke={() => handleRevokeAccess(doctor.id)}
            />
          ))}
        </div>
      )}

      {/* Privacy Notice */}
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
        <div className="flex items-start gap-3">
          <span className="text-xl">🔒</span>
          <div>
            <h4 className="font-medium text-blue-900">Privacy Guarantee</h4>
            <p className="text-sm text-blue-700 mt-1">
              Your health data is encrypted and only shared with your explicit consent. 
              Doctors cannot access records you've chosen to hide. 
              You maintain full control of your information at all times.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
