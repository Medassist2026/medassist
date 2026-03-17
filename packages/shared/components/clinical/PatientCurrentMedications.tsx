'use client'

import { useState, useEffect, useCallback } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface PatientMedication {
  name: string
  genericName?: string
  dosage?: string
  frequency?: string
  condition?: string
  duration?: string
  prescriber?: string
  source: 'intake' | 'patient_managed' | 'prescription'
  stillTaking: boolean
}

interface PreviousPrescription {
  name: string
  type?: string
  frequency?: string
  duration?: string
  notes?: string
  prescribedDate: string
  prescribedBy: string
  source: 'prescription'
}

interface PatientCurrentMedicationsProps {
  /** Patient ID to fetch medications for */
  patientId: string | null
  /** Callback when patient medications are loaded — passes to MedicationList for interaction checking */
  onMedicationsLoaded?: (medications: Array<{ name: string; genericName?: string }>) => void
}

const SOURCE_LABELS = {
  intake: { label: 'Self-reported', icon: '📝', color: 'bg-blue-100 text-blue-700' },
  patient_managed: { label: 'Patient added', icon: '✏️', color: 'bg-teal-100 text-teal-700' },
  prescription: { label: 'Prescribed', icon: '👨‍⚕️', color: 'bg-green-100 text-green-700' },
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PatientCurrentMedications({
  patientId,
  onMedicationsLoaded,
}: PatientCurrentMedicationsProps) {
  const [loading, setLoading] = useState(false)
  const [currentMeds, setCurrentMeds] = useState<PatientMedication[]>([])
  const [previousRx, setPreviousRx] = useState<PreviousPrescription[]>([])
  const [intakeCompleted, setIntakeCompleted] = useState(false)
  const [showPrevious, setShowPrevious] = useState(false)
  const [error, setError] = useState('')

  const fetchMedications = useCallback(async (pid: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/clinical/patient-medications?patientId=${pid}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()

      setCurrentMeds(data.currentMedications || [])
      setPreviousRx(data.previousPrescriptions || [])
      setIntakeCompleted(data.intakeCompleted || false)

      // Notify parent of loaded medications for interaction checking
      if (onMedicationsLoaded) {
        const medsForInteractionCheck = (data.currentMedications || [])
          .filter((m: PatientMedication) => m.stillTaking)
          .map((m: PatientMedication) => ({
            name: m.name,
            genericName: m.genericName,
          }))
        onMedicationsLoaded(medsForInteractionCheck)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [onMedicationsLoaded])

  useEffect(() => {
    if (patientId) {
      fetchMedications(patientId)
    } else {
      setCurrentMeds([])
      setPreviousRx([])
      setIntakeCompleted(false)
    }
  }, [patientId, fetchMedications])

  // Don't render if no patient selected
  if (!patientId) return null

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
        <div className="animate-spin h-4 w-4 border-2 border-primary-300 border-t-primary-600 rounded-full"></div>
        Loading patient medications...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        Could not load patient medications. {error}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Current medications */}
      {currentMeds.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
                Current Medications ({currentMeds.length})
              </span>
              {intakeCompleted && (
                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                  Intake completed
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            {currentMeds.map((med, idx) => {
              const sourceInfo = SOURCE_LABELS[med.source] || SOURCE_LABELS.intake
              return (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900">{med.name}</span>
                      {med.dosage && (
                        <span className="text-xs text-gray-500">{med.dosage}</span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${sourceInfo.color}`}>
                        {sourceInfo.icon} {sourceInfo.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                      {med.frequency && (
                        <span className="text-xs text-gray-500">{med.frequency}</span>
                      )}
                      {med.condition && (
                        <span className="text-xs text-gray-400">for {med.condition}</span>
                      )}
                      {med.prescriber && (
                        <span className="text-xs text-gray-400">by {med.prescriber}</span>
                      )}
                      {med.duration && (
                        <span className="text-xs text-gray-400">({med.duration})</span>
                      )}
                    </div>
                  </div>
                  {med.genericName && (
                    <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
                      {med.genericName}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="py-4 text-center">
          {intakeCompleted ? (
            <div className="text-sm text-gray-500">
              <span className="text-green-600 font-medium">✅ Intake completed</span>
              <span className="text-gray-400 ml-1">— Patient reports no current medications</span>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2 justify-center">
                <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-sm text-amber-800 font-medium">
                  Patient has not completed medication intake
                </span>
              </div>
              <p className="text-xs text-amber-600 mt-1">
                Ask the patient about current medications before prescribing
              </p>
            </div>
          )}
        </div>
      )}

      {/* Previous prescriptions (collapsible) */}
      {previousRx.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPrevious(!showPrevious)}
            className="text-xs text-gray-400 hover:text-gray-600 font-medium flex items-center gap-1"
          >
            <svg className={`w-3 h-3 transition-transform ${showPrevious ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            Previous prescriptions ({previousRx.length})
          </button>

          {showPrevious && (
            <div className="mt-2 space-y-1 pl-2 border-l-2 border-gray-200">
              {previousRx.map((rx, idx) => (
                <div key={idx} className="flex items-center gap-2 py-1.5 text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{rx.name}</span>
                  {rx.frequency && <span>· {rx.frequency}</span>}
                  {rx.duration && <span>· {rx.duration}</span>}
                  <span className="ml-auto text-gray-400">
                    {new Date(rx.prescribedDate).toLocaleDateString()} by {rx.prescribedBy}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
