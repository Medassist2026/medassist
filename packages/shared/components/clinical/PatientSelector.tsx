'use client'

import { useState, useEffect, useCallback } from 'react'
import { ar } from '@shared/lib/i18n/ar'
import {
  HelpIcon,
  HelpPanel,
  PATIENT_SEARCH_HELP,
  DEPENDENT_PATIENT_HELP,
  WALKIN_PATIENT_HELP
} from '@shared/components/ui/HelpTooltips'
import {
  isValidEgyptianLocalPhone,
  getEgyptianPhoneError,
} from '@shared/lib/utils/phone-validation'

// ============================================================================
// EGYPTIAN PHONE VALIDATION — walk-in registration form
// Both helpers below validate strict 11-digit local format. The walk-in form
// is a registration field (not a search), so users must type the full
// 01012345678. Canonical regex + error wording lives in
// @shared/lib/utils/phone-validation.
// ============================================================================

const isValidEgyptianPhone = (raw: string): boolean =>
  isValidEgyptianLocalPhone(raw.replace(/\D/g, ''))

const egyptianPhoneError = (raw: string): string | null =>
  getEgyptianPhoneError(raw.replace(/\D/g, ''))

// ============================================================================
// TYPES
// ============================================================================

interface Patient {
  id: string
  unique_id: string
  full_name: string
  phone: string
  date_of_birth?: string
  sex?: 'male' | 'female'
  age?: number
  is_dependent?: boolean
  guardian_name?: string
}

interface PatientSelectorProps {
  onSelect: (patient: Patient) => void
  onCreateWalkIn: () => void
  selectedPatient?: Patient | null
}

// ============================================================================
// PATIENT SELECTOR COMPONENT
// Enhanced with help tooltips for UX-D002, UX-D003, UX-D004
// ============================================================================

export function PatientSelector({ onSelect, onCreateWalkIn, selectedPatient }: PatientSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Patient[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showWalkInForm, setShowWalkInForm] = useState(false)
  const [showSearchHelp, setShowSearchHelp] = useState(false)
  const [queuePatients, setQueuePatients] = useState<Patient[]>([])
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [recentPatients, setRecentPatients] = useState<Array<Patient & { last_visit_date?: string }>>([])
  const [loadingRecent, setLoadingRecent] = useState(false)

  // Load queue patients
  const loadQueuePatients = useCallback(async () => {
    setLoadingQueue(true)
    try {
      const res = await fetch('/api/frontdesk/queue/today')
      if (res.ok) {
        const data = await res.json()
        const checkedInPatients = (data.patients || []).filter((p: any) => p.status === 'checked_in')
        setQueuePatients(checkedInPatients)
      }
    } catch (error) {
      console.error('Failed to load queue:', error)
    } finally {
      setLoadingQueue(false)
    }
  }, [])

  // Load recent patients
  const loadRecentPatients = useCallback(async () => {
    setLoadingRecent(true)
    try {
      const res = await fetch('/api/clinical/recent-patients')
      if (res.ok) {
        const data = await res.json()
        setRecentPatients((data.patients || []).slice(0, 3))
      }
    } catch (error) {
      console.error('Failed to load recent patients:', error)
    } finally {
      setLoadingRecent(false)
    }
  }, [])

  // Debounced search
  const searchPatients = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.patients || [])
      }
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      searchPatients(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, searchPatients])

  // Load queue and recent patients on mount
  useEffect(() => {
    loadQueuePatients()
    loadRecentPatients()
  }, [loadQueuePatients, loadRecentPatients])

  // If patient is selected, show selected state
  if (selectedPatient) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4" dir="rtl">
        <div className="flex items-center justify-between">
          <button
            onClick={() => onSelect(null as any)}
            className="text-sm text-green-700 hover:text-green-900"
          >
            {ar.cancel}
          </button>
          <div className="flex items-center gap-3">
            <div>
              <div className="font-medium text-green-900">{selectedPatient.full_name}</div>
              <div className="text-sm text-green-700 text-right">
                {selectedPatient.phone}
                {selectedPatient.age && ` · ${selectedPatient.age} سنة`}
                {selectedPatient.sex && ` · ${selectedPatient.sex === 'male' ? 'ذكر' : 'أنثى'}`}
                {selectedPatient.is_dependent && (
                  <span className="mr-2 text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                    تابع
                  </span>
                )}
              </div>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Next from Queue Button (PS-008) */}
      {queuePatients.length > 0 && (
        <button
          onClick={() => onSelect(queuePatients[0])}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-between transition-colors"
        >
          <span className="text-sm font-semibold">{queuePatients[0]?.full_name}</span>
          <span className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            التالي من قائمة الانتظار
          </span>
        </button>
      )}

      {/* Search Header with Help (UX-D002) */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowSearchHelp(!showSearchHelp)}
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          {showSearchHelp ? 'إخفاء المساعدة' : 'مساعدة'}
        </button>
        <div className="flex items-center gap-2">
          <HelpIcon
            content={PATIENT_SEARCH_HELP.content}
            position="left"
          />
          <h3 className="font-medium text-gray-900">اختيار مريض</h3>
        </div>
      </div>

      {/* Search Scope Help Panel (UX-D002) */}
      {showSearchHelp && (
        <HelpPanel title="فهم بحث المرضى" defaultExpanded>
          <div className="space-y-3" dir="rtl">
            <p className="font-medium">البحث يعرض المرضى من:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white/50 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">مرضاك</span>
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                </div>
                <p className="text-xs">مرضى عالجتهم سابقاً في أي عيادة</p>
              </div>
              <div className="bg-white/50 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">مرضى زائرون</span>
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                </div>
                <p className="text-xs">تم إنشاؤهم في جلسات سابقة من قبل أي طبيب</p>
              </div>
              <div className="bg-white/50 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">مستخدمو التطبيق</span>
                  <span className="w-2 h-2 bg-primary-500 rounded-full"></span>
                </div>
                <p className="text-xs">مرضى سجلوا أنفسهم في تطبيق ميد أسيست</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              💡 تلميح: ابحث بالاسم أو رقم الهاتف أو معرف المريض
            </p>
          </div>
        </HelpPanel>
      )}

      {/* Search Input */}
      <div className="relative" dir="rtl">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث بالاسم أو الهاتف أو المعرف..."
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-right"
        />
        {isSearching && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
          </div>
        )}
      </div>

      {/* Recent Patients Section (PS-007) */}
      {!loadingRecent && recentPatients.length > 0 && searchQuery.length === 0 && (
        <div className="space-y-2" dir="rtl">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">آخر ٣ زيارات</span>
            <h4 className="text-sm font-medium text-gray-700">مرضى حديثون</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {recentPatients.map((patient) => (
              <button
                key={patient.id}
                onClick={() => onSelect(patient)}
                className="text-right p-3 bg-white border border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">
                      {patient.full_name}
                    </div>
                  </div>
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  </div>
                </div>
                {patient.last_visit_date && (
                  <div className="text-xs text-gray-500 text-right">
                    آخر زيارة: {new Date(patient.last_visit_date).toLocaleDateString('ar-SA')}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-60 overflow-y-auto" dir="rtl">
          {searchResults.map((patient) => (
            <button
              key={patient.id}
              onClick={() => onSelect(patient)}
              className="w-full text-right p-3 hover:bg-gray-50 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {patient.full_name}
                  {patient.is_dependent && (
                    <span className="mr-2 text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                      تابع
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500 text-right">
                  {patient.phone}
                  {patient.age && ` · ${patient.age} سنة`}
                  {patient.sex && ` · ${patient.sex === 'male' ? 'ذكر' : 'أنثى'}`}
                  {patient.guardian_name && ` · ولي الأمر: ${patient.guardian_name}`}
                </div>
              </div>
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No Results / Walk-in Option */}
      {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
        <div className="text-center py-6 bg-gray-50 rounded-lg" dir="rtl">
          <p className="text-gray-600 mb-3">لا يوجد مرضى مطابقين لـ "{searchQuery}"</p>
          <button
            onClick={() => setShowWalkInForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            إنشاء مريض زائر
          </button>
        </div>
      )}

      {/* Or Divider */}
      {!showWalkInForm && searchQuery.length < 2 && (
        <div className="flex items-center gap-4" dir="rtl">
          <div className="flex-1 border-t border-gray-200"></div>
          <span className="text-sm text-gray-500">أو</span>
          <div className="flex-1 border-t border-gray-200"></div>
        </div>
      )}

      {/* Walk-in Button */}
      {!showWalkInForm && searchQuery.length < 2 && (
        <button
          onClick={() => setShowWalkInForm(true)}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-primary-400 hover:text-primary-600 transition-colors flex items-center justify-center gap-2" dir="rtl"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          إنشاء مريض زائر
        </button>
      )}

      {/* Walk-in Form */}
      {showWalkInForm && (
        <WalkInPatientForm 
          onCancel={() => setShowWalkInForm(false)}
          onCreated={(patient) => {
            setShowWalkInForm(false)
            onSelect(patient)
          }}
          initialPhone={searchQuery.match(/^\+?\d+$/) ? searchQuery : ''}
        />
      )}
    </div>
  )
}

// ============================================================================
// WALK-IN PATIENT FORM
// With help tooltips for UX-D003 and UX-D004
// ============================================================================

interface WalkInPatientFormProps {
  onCancel: () => void
  onCreated: (patient: Patient) => void
  initialPhone?: string
}

function WalkInPatientForm({ onCancel, onCreated, initialPhone = '' }: WalkInPatientFormProps) {
  const [formData, setFormData] = useState({
    full_name: '',
    phone: initialPhone,
    date_of_birth: '',
    sex: '' as '' | 'male' | 'female',
    is_dependent: false,
    guardian_phone: ''
  })
  const [guardianSearch, setGuardianSearch] = useState('')
  const [guardianResults, setGuardianResults] = useState<Patient[]>([])
  const [selectedGuardian, setSelectedGuardian] = useState<Patient | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phoneErrMsg, setPhoneErrMsg] = useState<string | null>(null)

  // Arabic translations for error messages
  const arErrors: { [key: string]: string } = {
    'Invalid input': 'إدخال غير صحيح',
    'Required field': 'حقل مطلوب',
    'Failed to create patient': 'فشل في إنشاء المريض'
  }

  // Search for guardian
  useEffect(() => {
    if (!formData.is_dependent || guardianSearch.length < 2) {
      setGuardianResults([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(guardianSearch)}`)
        if (res.ok) {
          const data = await res.json()
          setGuardianResults(data.patients || [])
        }
      } catch (error) {
        console.error('Guardian search failed:', error)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [guardianSearch, formData.is_dependent])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate phone before submitting
    if (!isValidEgyptianPhone(formData.phone)) {
      setPhoneErrMsg(egyptianPhoneError(formData.phone) || 'رقم الهاتف غير صحيح')
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/patients/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          guardian_id: selectedGuardian?.id
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'فشل في إنشاء المريض')
      }

      const data = await res.json()
      onCreated(data.patient)
    } catch (err) {
      setError(err instanceof Error ? (arErrors[err.message] || err.message) : 'فشل في إنشاء المريض')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-gray-50 rounded-lg p-6 border border-gray-200" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h3 className="font-semibold text-gray-900">مريض زائر جديد</h3>
      </div>

      {/* Walk-in Storage Info (UX-D004) */}
      <HelpPanel title="عن سجلات المرضى الزائرين">
        <div className="space-y-2" dir="rtl">
          <p>يتم تخزين المرضى الزائرين <strong>عالمياً</strong> في النظام:</p>
          <ul className="list-disc list-inside space-y-1 mr-2 text-xs">
            <li>يمكن لأي طبيب العثور عليهم برقم الهاتف</li>
            <li>إذا سجلوا أنفسهم لاحقاً، تتم ربط السجلات تلقائياً</li>
            <li>تبقى ملاحظاتك السريرية خاصة حتى يمنح المريض الوصول</li>
          </ul>
        </div>
      </HelpPanel>

      <form onSubmit={handleSubmit} className="space-y-4 mt-4">
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm" dir="rtl">
            {error}
          </div>
        )}

        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
              الاسم الكامل *
            </label>
            <input
              type="text"
              required
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-right"
              placeholder="أدخل اسم المريض"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
              رقم الهاتف *
            </label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => {
                setFormData({ ...formData, phone: e.target.value })
                setPhoneErrMsg(egyptianPhoneError(e.target.value))
              }}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent text-right ${
                phoneErrMsg
                  ? 'border-red-400 focus:ring-red-300'
                  : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'
              }`}
              placeholder="01012345678"
              dir="ltr"
            />
            {phoneErrMsg && (
              <p className="mt-1 font-cairo text-[12px] text-red-500 text-right flex items-center justify-end gap-1">
                {phoneErrMsg}
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
              تاريخ الميلاد
            </label>
            <input
              type="date"
              value={formData.date_of_birth}
              onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-right"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
              الجنس
            </label>
            <select
              value={formData.sex}
              onChange={(e) => setFormData({ ...formData, sex: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-right"
            >
              <option value="">اختر...</option>
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
            </select>
          </div>
        </div>

        {/* Dependent Patient Toggle (UX-D003) */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center gap-3" dir="rtl">
            <HelpIcon
              content={DEPENDENT_PATIENT_HELP.content}
              position="left"
            />
            <label htmlFor="is_dependent" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              هذا مريض تابع (طفل/قاصر)
            </label>
            <input
              type="checkbox"
              id="is_dependent"
              checked={formData.is_dependent}
              onChange={(e) => {
                setFormData({ ...formData, is_dependent: e.target.checked })
                if (!e.target.checked) {
                  setSelectedGuardian(null)
                  setGuardianSearch('')
                }
              }}
              className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Guardian Selection (UX-D003) */}
        {formData.is_dependent && (
          <div className="bg-primary-50 border border-primary-200 rounded-lg p-4" dir="rtl">
            <label className="block text-sm font-medium text-primary-800 mb-2 flex items-center gap-2 text-right">
              <HelpIcon
                content="سيتلقى ولي الأمر جميع الإخطارات ويمكنه إدارة السجلات الطبية لهذا المريض."
                position="left"
              />
              ولي الأمر / الوالد
            </label>

            {selectedGuardian ? (
              <div className="flex items-center justify-between bg-white rounded-lg p-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGuardian(null)
                    setGuardianSearch('')
                  }}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  تغيير
                </button>
                <div className="text-right">
                  <div className="font-medium text-gray-900">{selectedGuardian.full_name}</div>
                  <div className="text-sm text-gray-500">{selectedGuardian.phone}</div>
                </div>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={guardianSearch}
                  onChange={(e) => setGuardianSearch(e.target.value)}
                  placeholder="ابحث عن ولي الأمر بالاسم أو الهاتف..."
                  className="w-full px-3 py-2 border border-primary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-right"
                />
                {guardianResults.length > 0 && (
                  <div className="mt-2 border border-primary-200 rounded-lg divide-y divide-primary-100 max-h-40 overflow-y-auto bg-white">
                    {guardianResults.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => {
                          setSelectedGuardian(patient)
                          setGuardianSearch('')
                        }}
                        className="w-full text-right p-2 hover:bg-primary-50"
                      >
                        <div className="font-medium text-gray-900">{patient.full_name}</div>
                        <div className="text-sm text-gray-500">{patient.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-primary-600 mt-2 text-right">
                  إذا لم يتم العثور على ولي الأمر، أنشئه أولاً كمريض منفصل
                </p>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-start gap-3 pt-4 border-t border-gray-200" dir="rtl">
          <button
            type="submit"
            disabled={isSubmitting || !!phoneErrMsg}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'جاري الإنشاء...' : 'إنشاء مريض'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            إلغاء
          </button>
        </div>
      </form>
    </div>
  )
}

export default PatientSelector
