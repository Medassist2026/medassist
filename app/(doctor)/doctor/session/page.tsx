'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PatientSelector from '@/components/clinical/PatientSelector'
import ChiefComplaintSelector from '@/components/clinical/ChiefComplaintSelector'
import DiagnosisInput from '@/components/clinical/DiagnosisInput'
import MedicationList from '@/components/clinical/MedicationList'
import PlanInput from '@/components/clinical/PlanInput'
import SessionTimer from '@/components/clinical/SessionTimer'
import VitalSignsInput from '@/components/clinical/VitalSignsInput'
import LabOrderSelector from '@/components/clinical/LabOrderSelector'

interface Medication {
  name: string
  type: 'pill' | 'syrup' | 'injection' | 'cream' | 'inhaler' | 'drops' | 'other'
  frequency: string
  duration: string
  endDate?: string
  notes?: string
  taperingInstructions?: string
}

export default function ClinicalSessionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Get URL params for appointment pre-fill
  const urlPatientId = searchParams.get('patientId')
  const appointmentId = searchParams.get('appointmentId')
  
  // Session tracking
  const [sessionStart, setSessionStart] = useState<number>(Date.now())
  const [keystrokeCount, setKeystrokeCount] = useState(0)
  
  // Form state
  const [patientId, setPatientId] = useState<string | null>(urlPatientId)
  const [chiefComplaints, setChiefComplaints] = useState<string[]>([])
  const [diagnosis, setDiagnosis] = useState('')
  const [medications, setMedications] = useState<Medication[]>([])
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [plan, setPlan] = useState('')
  const [syncToPatient, setSyncToPatient] = useState(true)
  const [vitals, setVitals] = useState<any>(null)
  const [showLabOrders, setShowLabOrders] = useState(false)
  
  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Auto-select patient from appointment
  useEffect(() => {
    if (urlPatientId && !patientId) {
      setPatientId(urlPatientId)
    }
  }, [urlPatientId, patientId])
  
  // Track keystrokes
  useEffect(() => {
    const handleKeyDown = () => {
      setKeystrokeCount(prev => prev + 1)
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  
  const handleSave = async () => {
    if (!patientId) {
      setError('Please select a patient')
      return
    }
    
    if (chiefComplaints.length === 0) {
      setError('Please add at least one chief complaint')
      return
    }
    
    // Diagnosis is now optional - removed validation
    
    setLoading(true)
    setError('')
    
    try {
      const durationSeconds = Math.floor((Date.now() - sessionStart) / 1000)
      
      const response = await fetch('/api/clinical/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          noteData: {
            chief_complaint: chiefComplaints,
            diagnosis,
            medications,
            plan
          },
          keystrokeCount,
          durationSeconds,
          syncToPatient
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save note')
      }
      
      // Show success and redirect
      router.push(`/doctor/dashboard?success=note_saved`)
      
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  
  const handleCancel = () => {
    if (confirm('Discard this session? All data will be lost.')) {
      router.push('/doctor/dashboard')
    }
  }
  
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header with Timer */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Clinical Session
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Document patient visit
            </p>
          </div>
          
          <SessionTimer 
            startTime={sessionStart}
            keystrokeCount={keystrokeCount}
          />
        </div>
      </div>
      
      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      {/* Patient Selection */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          1. Select Patient
        </h2>
        <PatientSelector 
          onSelect={(patient) => {
            setSelectedPatient(patient)
            setPatientId(patient?.id || null)
          }}
          onCreateWalkIn={() => {}}
          selectedPatient={selectedPatient}
        />
      </div>
      
      {/* Vital Signs (Phase 7) */}
      {patientId && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            2. Vital Signs <span className="text-sm font-normal text-gray-500">(Optional)</span>
          </h2>
          <VitalSignsInput onVitalsRecorded={setVitals} />
        </div>
      )}
      
      {/* Chief Complaints */}
      {patientId && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            3. Chief Complaint
          </h2>
          <ChiefComplaintSelector
            selected={chiefComplaints}
            onChange={setChiefComplaints}
          />
        </div>
      )}
      
      {/* Diagnosis */}
      {chiefComplaints.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              4. Diagnosis
            </h2>
            <span className="text-sm text-gray-500 italic">Optional</span>
          </div>
          <DiagnosisInput
            value={diagnosis}
            onChange={setDiagnosis}
          />
        </div>
      )}
      
      {/* Medications */}
      {chiefComplaints.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            5. Medications
          </h2>
          <MedicationList
            medications={medications}
            onChange={setMedications}
          />
        </div>
      )}
      
      {/* Lab Orders (Phase 7) */}
      {chiefComplaints.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              6. Laboratory Tests <span className="text-sm font-normal text-gray-500">(Optional)</span>
            </h2>
            <button
              type="button"
              onClick={() => setShowLabOrders(!showLabOrders)}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              {showLabOrders ? 'Hide' : 'Order Lab Tests'}
            </button>
          </div>
          {showLabOrders && <LabOrderSelector />}
        </div>
      )}
      
      {/* Plan */}
      {chiefComplaints.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            7. Plan
          </h2>
          <PlanInput
            value={plan}
            onChange={setPlan}
          />
        </div>
      )}
      
      {/* Sync Option */}
      {chiefComplaints.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={syncToPatient}
              onChange={(e) => setSyncToPatient(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900 block">
                Sync to Patient Portal
              </span>
              <span className="text-xs text-gray-600">
                Patient will receive medication reminders via SMS
              </span>
            </div>
          </label>
        </div>
      )}
      
      {/* Actions */}
      <div className="flex items-center justify-between gap-4 pb-8">
        <button
          onClick={handleCancel}
          className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        
        <button
          onClick={handleSave}
          disabled={loading || !patientId || chiefComplaints.length === 0}
          className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Saving...' : 'Save & Complete'}
        </button>
      </div>
    </div>
  )
}
