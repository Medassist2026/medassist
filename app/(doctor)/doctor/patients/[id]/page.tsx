'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PatientSummaryButton } from '@/components/ai/DoctorAI'

// ============================================================================
// TYPES
// ============================================================================

interface Patient {
  id: string
  name: string
  phone: string
  email?: string
  date_of_birth?: string
  gender?: string
  national_id?: string
  address?: string
  emergency_contact?: string
  blood_type?: string
  created_at: string
}

interface Condition {
  id: string
  name: string
  diagnosed_date?: string
  status: 'active' | 'resolved' | 'managed'
  severity?: string
  notes?: string
}

interface Medication {
  id: string
  name: string
  dosage: string
  frequency: string
  start_date: string
  end_date?: string
  status: 'active' | 'completed' | 'stopped'
  prescribed_by?: string
}

interface LabResult {
  id: string
  test_name: string
  result_value: string
  result_unit?: string
  reference_range?: string
  status: 'normal' | 'abnormal' | 'critical'
  test_date: string
}

interface Appointment {
  id: string
  date: string
  time: string
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  reason?: string
  notes?: string
}

interface Allergy {
  id: string
  allergen: string
  reaction?: string
  severity: 'mild' | 'moderate' | 'severe'
}

// ============================================================================
// TAB DEFINITIONS
// ============================================================================

type TabId = 'overview' | 'conditions' | 'medications' | 'labs' | 'visits' | 'timeline'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '📋' },
  { id: 'conditions', label: 'Conditions', icon: '🏥' },
  { id: 'medications', label: 'Medications', icon: '💊' },
  { id: 'labs', label: 'Lab Results', icon: '🧪' },
  { id: 'visits', label: 'Visit History', icon: '📅' },
  { id: 'timeline', label: 'Timeline', icon: '⏳' }
]

// ============================================================================
// OVERVIEW TAB
// ============================================================================

interface OverviewTabProps {
  patient: Patient
  conditions: Condition[]
  medications: Medication[]
  allergies: Allergy[]
  recentLabs: LabResult[]
}

function OverviewTab({ patient, conditions, medications, allergies, recentLabs }: OverviewTabProps) {
  const age = patient.date_of_birth 
    ? Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  return (
    <div className="space-y-6">
      {/* Patient Info Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Patient Information</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <InfoItem label="Phone" value={patient.phone} />
          <InfoItem label="Email" value={patient.email || '-'} />
          <InfoItem label="Age" value={age ? `${age} years` : '-'} />
          <InfoItem label="Gender" value={patient.gender || '-'} />
          <InfoItem label="Blood Type" value={patient.blood_type || '-'} />
          <InfoItem label="National ID" value={patient.national_id || '-'} />
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon="🏥" label="Conditions" value={conditions.filter(c => c.status === 'active').length} color="blue" />
        <StatCard icon="💊" label="Medications" value={medications.filter(m => m.status === 'active').length} color="green" />
        <StatCard icon="⚠️" label="Allergies" value={allergies.length} color="red" />
        <StatCard icon="🧪" label="Recent Labs" value={recentLabs.length} color="purple" />
      </div>

      {/* Allergies Alert */}
      {allergies.length > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
          <h4 className="font-semibold text-red-800 flex items-center gap-2 mb-2">
            <span>⚠️</span> Known Allergies
          </h4>
          <div className="flex flex-wrap gap-2">
            {allergies.map(allergy => (
              <span
                key={allergy.id}
                className={`px-3 py-1 rounded-full text-sm ${
                  allergy.severity === 'severe' ? 'bg-red-200 text-red-800' :
                  allergy.severity === 'moderate' ? 'bg-yellow-200 text-yellow-800' :
                  'bg-gray-200 text-gray-700'
                }`}
              >
                {allergy.allergen}
                {allergy.severity === 'severe' && ' ⚠️'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Active Conditions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Active Conditions</h3>
        {conditions.filter(c => c.status === 'active').length === 0 ? (
          <p className="text-gray-500">No active conditions</p>
        ) : (
          <div className="space-y-2">
            {conditions.filter(c => c.status === 'active').map(condition => (
              <div key={condition.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{condition.name}</span>
                  {condition.severity && (
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                      condition.severity === 'severe' ? 'bg-red-100 text-red-700' :
                      condition.severity === 'moderate' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {condition.severity}
                    </span>
                  )}
                </div>
                {condition.diagnosed_date && (
                  <span className="text-sm text-gray-500">
                    Since {new Date(condition.diagnosed_date).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Current Medications */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Current Medications</h3>
        {medications.filter(m => m.status === 'active').length === 0 ? (
          <p className="text-gray-500">No active medications</p>
        ) : (
          <div className="space-y-2">
            {medications.filter(m => m.status === 'active').map(med => (
              <div key={med.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{med.name}</span>
                  <span className="text-sm text-gray-500 ml-2">{med.dosage} - {med.frequency}</span>
                </div>
                <span className="text-sm text-gray-500">
                  Started {new Date(med.start_date).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// CONDITIONS TAB
// ============================================================================

function ConditionsTab({ conditions }: { conditions: Condition[] }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all')

  const filtered = conditions.filter(c => 
    filter === 'all' || c.status === filter
  )

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex gap-2">
        {['all', 'active', 'resolved'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`px-4 py-2 rounded-lg text-sm ${
              filter === f ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-xl">
          <p className="text-gray-500">No conditions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(condition => (
            <div key={condition.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-gray-900">{condition.name}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      condition.status === 'active' ? 'bg-orange-100 text-orange-700' :
                      condition.status === 'managed' ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {condition.status}
                    </span>
                    {condition.severity && (
                      <span className="text-sm text-gray-500">{condition.severity}</span>
                    )}
                  </div>
                </div>
                {condition.diagnosed_date && (
                  <span className="text-sm text-gray-500">
                    Diagnosed: {new Date(condition.diagnosed_date).toLocaleDateString()}
                  </span>
                )}
              </div>
              {condition.notes && (
                <p className="text-sm text-gray-600 mt-2">{condition.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MEDICATIONS TAB
// ============================================================================

function MedicationsTab({ medications }: { medications: Medication[] }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')

  const filtered = medications.filter(m => 
    filter === 'all' || m.status === filter
  )

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex gap-2">
        {['all', 'active', 'completed'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`px-4 py-2 rounded-lg text-sm ${
              filter === f ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-xl">
          <p className="text-gray-500">No medications found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(med => (
            <div key={med.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-gray-900">{med.name}</h4>
                  <p className="text-sm text-gray-600">{med.dosage} • {med.frequency}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs ${
                  med.status === 'active' ? 'bg-green-100 text-green-700' :
                  med.status === 'stopped' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {med.status}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span>Started: {new Date(med.start_date).toLocaleDateString()}</span>
                {med.end_date && <span>Ended: {new Date(med.end_date).toLocaleDateString()}</span>}
                {med.prescribed_by && <span>By: {med.prescribed_by}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// LAB RESULTS TAB
// ============================================================================

function LabsTab({ labs }: { labs: LabResult[] }) {
  return (
    <div className="space-y-4">
      {labs.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-xl">
          <p className="text-gray-500">No lab results</p>
        </div>
      ) : (
        <div className="space-y-3">
          {labs.map(lab => (
            <div key={lab.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-gray-900">{lab.test_name}</h4>
                  <p className="text-lg font-mono mt-1">
                    {lab.result_value} {lab.result_unit}
                    {lab.reference_range && (
                      <span className="text-sm text-gray-500 ml-2">
                        (Ref: {lab.reference_range})
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    lab.status === 'normal' ? 'bg-green-100 text-green-700' :
                    lab.status === 'abnormal' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {lab.status}
                  </span>
                  <p className="text-sm text-gray-500 mt-1">
                    {new Date(lab.test_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// VISITS TAB
// ============================================================================

function VisitsTab({ appointments }: { appointments: Appointment[] }) {
  return (
    <div className="space-y-4">
      {appointments.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-xl">
          <p className="text-gray-500">No visit history</p>
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map(apt => (
            <div key={apt.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {new Date(apt.date).toLocaleDateString()}
                    </span>
                    <span className="text-gray-500">{apt.time}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      apt.status === 'completed' ? 'bg-green-100 text-green-700' :
                      apt.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                      apt.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {apt.status}
                    </span>
                  </div>
                  {apt.reason && <p className="text-sm text-gray-600 mt-1">{apt.reason}</p>}
                </div>
                {apt.status === 'completed' && (
                  <button className="text-sm text-primary-600 hover:text-primary-700">
                    View Notes →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// TIMELINE TAB
// ============================================================================

interface TimelineEvent {
  id: string
  date: string
  type: 'visit' | 'lab' | 'medication' | 'condition'
  title: string
  description?: string
}

function TimelineTab({ events }: { events: TimelineEvent[] }) {
  const sortedEvents = [...events].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  const typeColors = {
    visit: 'bg-blue-500',
    lab: 'bg-purple-500',
    medication: 'bg-green-500',
    condition: 'bg-orange-500'
  }

  const typeIcons = {
    visit: '📅',
    lab: '🧪',
    medication: '💊',
    condition: '🏥'
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

      {/* Events */}
      <div className="space-y-4">
        {sortedEvents.map((event, i) => (
          <div key={event.id} className="relative pl-10">
            {/* Dot */}
            <div className={`absolute left-2.5 w-3 h-3 rounded-full ${typeColors[event.type]} border-2 border-white`} />
            
            {/* Content */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <span>{typeIcons[event.type]}</span>
                <span>{new Date(event.date).toLocaleDateString()}</span>
              </div>
              <h4 className="font-medium text-gray-900">{event.title}</h4>
              {event.description && (
                <p className="text-sm text-gray-600 mt-1">{event.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600'
  }

  return (
    <div className={`rounded-xl p-4 ${colors[color as keyof typeof colors]}`}>
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <p className="text-sm mt-1">{label}</p>
    </div>
  )
}

// ============================================================================
// MAIN PATIENT DETAILS PAGE
// ============================================================================

export default function PatientDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const patientId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [patient, setPatient] = useState<Patient | null>(null)
  const [conditions, setConditions] = useState<Condition[]>([])
  const [medications, setMedications] = useState<Medication[]>([])
  const [allergies, setAllergies] = useState<Allergy[]>([])
  const [labs, setLabs] = useState<LabResult[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])

  useEffect(() => {
    const loadData = async () => {
      try {
        // In production, fetch from API
        // const res = await fetch(`/api/doctor/patients/${patientId}`)
        
        // Mock data
        setPatient({
          id: patientId,
          name: 'Ahmed Hassan',
          phone: '01012345678',
          email: 'ahmed@example.com',
          date_of_birth: '1980-05-15',
          gender: 'Male',
          blood_type: 'A+',
          national_id: '28005151234567',
          created_at: '2025-01-01'
        })

        setConditions([
          { id: '1', name: 'Type 2 Diabetes', diagnosed_date: '2020-03-15', status: 'active', severity: 'moderate' },
          { id: '2', name: 'Hypertension', diagnosed_date: '2019-08-20', status: 'managed', severity: 'mild' },
          { id: '3', name: 'Appendicitis', diagnosed_date: '2015-06-10', status: 'resolved' }
        ])

        setMedications([
          { id: '1', name: 'Metformin', dosage: '500mg', frequency: 'Twice daily', start_date: '2020-03-15', status: 'active', prescribed_by: 'Dr. Sara' },
          { id: '2', name: 'Lisinopril', dosage: '10mg', frequency: 'Once daily', start_date: '2019-08-20', status: 'active', prescribed_by: 'Dr. Ahmed' }
        ])

        setAllergies([
          { id: '1', allergen: 'Penicillin', reaction: 'Rash', severity: 'severe' },
          { id: '2', allergen: 'Peanuts', reaction: 'Swelling', severity: 'moderate' }
        ])

        setLabs([
          { id: '1', test_name: 'HbA1c', result_value: '6.8', result_unit: '%', reference_range: '< 7%', status: 'normal', test_date: '2026-02-01' },
          { id: '2', test_name: 'LDL Cholesterol', result_value: '145', result_unit: 'mg/dL', reference_range: '< 100', status: 'abnormal', test_date: '2026-02-01' }
        ])

        setAppointments([
          { id: '1', date: '2026-02-10', time: '10:00 AM', status: 'completed', reason: 'Diabetes follow-up' },
          { id: '2', date: '2026-01-15', time: '2:00 PM', status: 'completed', reason: 'Blood pressure check' },
          { id: '3', date: '2026-03-01', time: '11:00 AM', status: 'scheduled', reason: 'Regular checkup' }
        ])

        setTimeline([
          { id: '1', date: '2026-02-10', type: 'visit', title: 'Diabetes follow-up', description: 'HbA1c improved' },
          { id: '2', date: '2026-02-01', type: 'lab', title: 'Blood work completed', description: 'HbA1c: 6.8%, LDL elevated' },
          { id: '3', date: '2026-01-15', type: 'visit', title: 'Blood pressure check' },
          { id: '4', date: '2020-03-15', type: 'condition', title: 'Type 2 Diabetes diagnosed' },
          { id: '5', date: '2020-03-15', type: 'medication', title: 'Started Metformin 500mg' }
        ])

      } catch (error) {
        console.error('Failed to load patient:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [patientId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Patient not found</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center">
            <span className="text-primary-600 font-bold text-xl">
              {patient.name.split(' ').map(n => n[0]).join('')}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{patient.name}</h1>
            <p className="text-gray-500">{patient.phone}</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <PatientSummaryButton patientId={patient.id} patientName={patient.name} />
          <button
            onClick={() => router.push(`/doctor/session?patient_id=${patient.id}`)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            </svg>
            Start Session
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-4 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && (
          <OverviewTab 
            patient={patient} 
            conditions={conditions} 
            medications={medications} 
            allergies={allergies}
            recentLabs={labs}
          />
        )}
        {activeTab === 'conditions' && <ConditionsTab conditions={conditions} />}
        {activeTab === 'medications' && <MedicationsTab medications={medications} />}
        {activeTab === 'labs' && <LabsTab labs={labs} />}
        {activeTab === 'visits' && <VisitsTab appointments={appointments} />}
        {activeTab === 'timeline' && <TimelineTab events={timeline} />}
      </div>
    </div>
  )
}
