'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'
import { HelpIcon, HelpPanel } from '@shared/components/ui/HelpTooltips'

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
  last_visit?: string
  next_appointment?: string
  relationship_status: 'active' | 'pending' | 'inactive'
  is_walkin: boolean
  active_conditions?: string[]
  unread_messages?: number
}

interface AddPatientForm {
  name: string
  phone: string
  email: string
  date_of_birth: string
  gender: string
  national_id: string
  notes: string
}

// ============================================================================
// ADD PATIENT MODAL (UX-D005)
// ============================================================================

interface AddPatientModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (patient: Patient) => void
}

function AddPatientModal({ isOpen, onClose, onSuccess }: AddPatientModalProps) {
  const [mode, setMode] = useState<'search' | 'create'>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Patient[]>([])
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<AddPatientForm>({
    name: '',
    phone: '',
    email: '',
    date_of_birth: '',
    gender: '',
    national_id: '',
    notes: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setMode('search')
      setSearchQuery('')
      setSearchResults([])
      setForm({
        name: '', phone: '', email: '', date_of_birth: '', gender: '', national_id: '', notes: ''
      })
      setErrors({})
    }
  }, [isOpen])

  // Search patients
  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setSearching(true)
    try {
      const res = await fetch(`/api/doctor/patients/search?q=${encodeURIComponent(searchQuery)}`)
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.patients || [])
      }
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setSearching(false)
    }
  }

  // Add existing patient to my patients
  const handleAddExisting = async (patient: Patient) => {
    try {
      const res = await fetch('/api/doctor/patients/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patient.id })
      })
      if (res.ok) {
        onSuccess(patient)
        onClose()
      }
    } catch (error) {
      console.error('Failed to add patient:', error)
    }
  }

  // Create new walk-in patient
  const handleCreate = async () => {
    // Validate
    const newErrors: Record<string, string> = {}
    if (!form.name.trim()) newErrors.name = 'الاسم مطلوب'
    if (!form.phone.trim()) newErrors.phone = 'رقم الهاتف مطلوب'
    if (form.phone && !/^01[0125]\d{8}$/.test(form.phone.replace(/\s/g, ''))) {
      newErrors.phone = 'رقم هاتف مصري غير صحيح'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/doctor/patients/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (res.ok) {
        const data = await res.json()
        onSuccess(data.patient)
        onClose()
      }
    } catch (error) {
      console.error('Failed to create patient:', error)
    } finally {
      setCreating(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">إضافة مريض</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="p-4 border-b">
          <div className="flex gap-2">
            <button
              onClick={() => setMode('search')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium ${
                mode === 'search'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              🔍 بحث في المرضى
            </button>
            <button
              onClick={() => setMode('create')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium ${
                mode === 'create'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              ➕ إنشاء مريض زائر
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {mode === 'search' ? (
            <div className="space-y-4">
              {/* Search Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  بحث بالاسم أو رقم الهاتف
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="أدخل الاسم أو رقم الهاتف..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={searching}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    {searching ? '...' : 'بحث'}
                  </button>
                </div>
              </div>

              {/* Results */}
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">{searchResults.length} مريض/مرضى</p>
                  {searchResults.map(patient => (
                    <div
                      key={patient.id}
                      className="p-3 border border-gray-200 rounded-lg flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div>
                        <div className="font-medium">{patient.name}</div>
                        <div className="text-sm text-gray-500">{patient.phone}</div>
                      </div>
                      <button
                        onClick={() => handleAddExisting(patient)}
                        className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                      >
                        إضافة لمرضاي
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {searchQuery && searchResults.length === 0 && !searching && (
                <div className="text-center py-6 bg-gray-50 rounded-lg">
                  <p className="text-gray-600">لم يتم العثور على مرضى</p>
                  <button
                    onClick={() => {
                      setMode('create')
                      setForm(prev => ({ ...prev, name: searchQuery }))
                    }}
                    className="mt-2 text-primary-600 hover:text-primary-700 text-sm"
                  >
                    إنشاء مريض زائر جديد ←
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <strong>مريض زائر:</strong> يقوم بإنشاء سجل مريض لشخص يزور بدون موعد. يمكنه لاحقاً مطالبة هذا السجل عبر تطبيق MedAssist.
              </div>

              {/* Form */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    الاسم الكامل *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={`w-full px-4 py-2 border rounded-lg ${errors.name ? 'border-red-300' : 'border-gray-300'}`}
                  />
                  {errors.name && <p className="text-sm text-red-600 mt-1">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    رقم الهاتف *
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="01xxxxxxxxx"
                    className={`w-full px-4 py-2 border rounded-lg ${errors.phone ? 'border-red-300' : 'border-gray-300'}`}
                  />
                  {errors.phone && <p className="text-sm text-red-600 mt-1">{errors.phone}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    الجنس
                  </label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">اختر...</option>
                    <option value="male">ذكر</option>
                    <option value="female">أنثى</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    تاريخ الميلاد
                  </label>
                  <input
                    type="date"
                    value={form.date_of_birth}
                    onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    الرقم القومي
                  </label>
                  <input
                    type="text"
                    value={form.national_id}
                    onChange={(e) => setForm({ ...form, national_id: e.target.value })}
                    placeholder="١٤ رقم"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ملاحظات (اختياري)
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={creating}
                className="w-full py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {creating ? 'جاري الإنشاء...' : 'إنشاء مريض زائر'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// PATIENT CARD (UX-D006)
// ============================================================================

interface PatientCardProps {
  patient: Patient
  onStartSession: () => void
  onViewDetails: () => void
}

function PatientCard({ patient, onStartSession, onViewDetails }: PatientCardProps) {
  const age = patient.date_of_birth
    ? Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  return (
    <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-4 hover:bg-gray-50 transition-all" dir="rtl">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 order-last">
          <span className="text-primary-600 font-semibold text-lg">
            {patient.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 truncate">{patient.name}</h3>
            {patient.is_walkin && (
              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                زائر
              </span>
            )}
            {patient.unread_messages && patient.unread_messages > 0 && (
              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">
                {patient.unread_messages} جديد
              </span>
            )}
          </div>

          <div className="text-sm text-gray-500 mt-0.5">
            {patient.phone}
            {age && ` • ${age} سنة`}
            {patient.gender && ` • ${patient.gender}`}
          </div>

          {/* Conditions */}
          {patient.active_conditions && patient.active_conditions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {patient.active_conditions.slice(0, 3).map((condition, i) => (
                <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                  {condition}
                </span>
              ))}
              {patient.active_conditions.length > 3 && (
                <span className="text-xs text-gray-400">
                  +{patient.active_conditions.length - 3} المزيد
                </span>
              )}
            </div>
          )}

          {/* Last/Next Visit */}
          <div className="text-xs text-gray-400 mt-2">
            {patient.last_visit && `آخر زيارة: ${new Date(patient.last_visit).toLocaleDateString('ar-EG')}`}
            {patient.next_appointment && ` • القادم: ${new Date(patient.next_appointment).toLocaleDateString('ar-EG')}`}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 order-first">
          {/* Start Session - Primary Action (UX-D006) */}
          <button
            onClick={onStartSession}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            بدء الجلسة
          </button>

          {/* Secondary Actions */}
          <div className="flex gap-1">
            <button
              onClick={onViewDetails}
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"
            >
              عرض
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN MY PATIENTS PAGE
// ============================================================================

export default function MyPatientsPage() {
  const router = useRouter()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'walkin'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Load patients
  useEffect(() => {
    const loadPatients = async () => {
      try {
        const res = await fetch('/api/doctor/patients')
        if (res.ok) {
          const data = await res.json()
          setPatients(data.patients || [])
        }
      } catch (error) {
        console.error('Failed to load patients:', error)
      } finally {
        setLoading(false)
      }
    }
    loadPatients()
  }, [])

  // Filter patients
  const filteredPatients = patients.filter(p => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'active' && p.relationship_status === 'active') ||
      (filter === 'walkin' && p.is_walkin)

    const matchesSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.phone.includes(searchQuery)

    return matchesFilter && matchesSearch
  })

  // Start session (UX-D006)
  const handleStartSession = (patient: Patient) => {
    router.push(`/doctor/session?patientId=${patient.id}`)
  }

  // View details
  const handleViewDetails = (patient: Patient) => {
    router.push(`/doctor/patients/${patient.id}`)
  }

  // Add patient success
  const handleAddSuccess = (patient: Patient) => {
    setPatients(prev => [patient, ...prev])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-md mx-auto px-4 py-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مرضاي</h1>
          <p className="text-gray-600 mt-1">
            {patients.length} مريض{patients.length !== 1 ? ' ' : ''} تحت رعايتك
          </p>
        </div>

        {/* Add Patient Button (UX-D005) */}
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          إضافة مريض
        </button>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col gap-4">
        <div className="flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم أو رقم الهاتف..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2">
          {[
            { key: 'all', label: 'الكل' },
            { key: 'active', label: 'نشط' },
            { key: 'walkin', label: 'زائرون' }
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key as any)}
              className={`px-4 py-2 rounded-lg text-sm ${
                filter === f.key
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Patient List */}
      {filteredPatients.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-100">
          <span className="text-4xl">👥</span>
          <p className="text-gray-600 mt-3">
            {searchQuery ? 'لا يوجد مرضى مطابقين' : 'لا يوجد مرضى'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 text-primary-600 hover:text-primary-700 font-medium"
            >
              أضف أول مريض ←
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPatients.map(patient => (
            <PatientCard
              key={patient.id}
              patient={patient}
              onStartSession={() => handleStartSession(patient)}
              onViewDetails={() => handleViewDetails(patient)}
            />
          ))}
        </div>
      )}

      {/* Add Patient Modal */}
      <AddPatientModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />
    </div>
  )
}
