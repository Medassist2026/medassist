'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, X, Search, User, Phone, Calendar, Check, AlertTriangle, Loader2, UserPlus } from 'lucide-react'
import {
  isValidEgyptianLocalPhone,
  getEgyptianPhoneError,
  normalizeEgyptianDigits,
} from '@shared/lib/utils/phone-validation'

// ============================================================================
// TYPES
// ============================================================================

interface PatientResult {
  id: string
  full_name: string | null
  phone: string
  age: number | null
  sex: string | null
  unique_id: string
}

interface Doctor {
  user_id: string
  users: { full_name: string } | null
  role: string
}

type FormErrors = {
  fullName?: string
  phone?: string
  age?: string
  sex?: string
}

// ============================================================================
// REGISTER PATIENT PAGE — 5 Figma States
// State 1: Empty (disabled CTAs)
// State 2: Filled with Typeahead (phone suggestions)
// State 3: Error (inline red borders + messages)
// State 4: Duplicate Dialog (patient with same phone exists)
// State 5: Success Toast
// ============================================================================

export default function RegisterPatientPage() {
  const router = useRouter()

  // ── Form State ──
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<'Male' | 'Female' | ''>('')
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [formTouched, setFormTouched] = useState(false)

  // ── Typeahead State ──
  const [searchResults, setSearchResults] = useState<PatientResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // ── Duplicate Dialog State ──
  const [duplicatePatient, setDuplicatePatient] = useState<PatientResult | null>(null)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)

  // ── Doctor Selection (for Add to Queue) ──
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [selectedDoctorId, setSelectedDoctorId] = useState('')
  const [showDoctorSheet, setShowDoctorSheet] = useState(false)
  const [loadingDoctors, setLoadingDoctors] = useState(false)

  // ── Submit State ──
  const [submitting, setSubmitting] = useState(false)
  const [submitMode, setSubmitMode] = useState<'save' | 'queue'>('save')

  // ── Success Toast ──
  const [successToast, setSuccessToast] = useState<{
    name: string
    patientId: string
    queueNumber?: number
    addedToQueue?: boolean
  } | null>(null)

  // ── Back Confirmation ──
  const [showBackDialog, setShowBackDialog] = useState(false)

  const hasFormData = fullName.trim() || phone.trim() || age.trim() || sex

  // ── Computed: phone-first gate (D-057) ──
  // Phone is the canonical patient identity. Per D-057, the rest of the form
  // (name, age, sex) is disabled until the phone passes Egyptian validation
  // — this forces the dedup lookup to happen before any other data is
  // entered, eliminating the "I added new and it told me already saved"
  // dead-end the frontdesk tester reported.
  const phoneIsValid = isValidEgyptianLocalPhone(phone)

  // ── Computed: form validity ──
  // Phone gate uses the canonical regex (not just length) so an invalid prefix
  // like 01999999999 keeps the submit button disabled and forces the user to
  // see the inline error rather than slipping through to a server-side 400.
  const isFormValid =
    fullName.trim().length >= 2 &&
    phoneIsValid &&
    age.trim() &&
    sex

  // ============================================================================
  // PHONE TYPEAHEAD — Search after 3 digits
  // ============================================================================

  const searchByPhone = useCallback(async (phoneQuery: string) => {
    if (phoneQuery.length < 3) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    setIsSearching(true)
    try {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(phoneQuery)}&limit=5`)
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.patients || [])
        setShowResults((data.patients || []).length > 0)
      }
    } catch {
      // Silently fail — typeahead is non-blocking
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handlePhoneChange = (value: string) => {
    // Normalize Arabic-Indic digits, strip non-digits, cap at 11
    const digits = normalizeEgyptianDigits(value)
    setPhone(digits)
    setFormErrors(prev => ({ ...prev, phone: undefined }))

    // Debounced search
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      searchByPhone(digits)
    }, 400)
  }

  // Validate on blur so the user sees the warning *before* submitting,
  // matching the auth flow's UX (D-019). Only sets the phone error — does NOT
  // flip `formTouched` (which would also reveal errors on still-empty
  // name/age/sex fields, which is too aggressive on a per-field blur).
  const handlePhoneBlur = () => {
    setTimeout(() => setShowResults(false), 200)
    const phoneErr = getEgyptianPhoneError(phone)
    if (phoneErr) {
      setFormErrors(prev => ({ ...prev, phone: phoneErr }))
    }
  }

  // ── Select existing patient from typeahead ──
  const handleSelectPatient = (patient: PatientResult) => {
    setShowResults(false)
    setDuplicatePatient(patient)
    setShowDuplicateDialog(true)
  }

  // ============================================================================
  // LOAD DOCTORS (for queue bottom sheet)
  // ============================================================================

  const loadDoctors = async () => {
    setLoadingDoctors(true)
    let found: Doctor[] = []
    try {
      // Source 1: queue/today (has doctor roster)
      const res = await fetch('/api/frontdesk/queue/today')
      if (res.ok) {
        const data = await res.json()
        if (data.doctors && Array.isArray(data.doctors) && data.doctors.length > 0) {
          found = data.doctors
        }
      }
      // Fallback 1: today's appointments
      if (found.length === 0) {
        const res2 = await fetch('/api/frontdesk/appointments?range=today')
        if (res2.ok) {
          const data2 = await res2.json()
          const doctorMap = new Map<string, Doctor>()
          ;(data2.appointments || []).forEach((apt: any) => {
            if (apt.doctor_id && !doctorMap.has(apt.doctor_id)) {
              doctorMap.set(apt.doctor_id, {
                user_id: apt.doctor_id,
                users: { full_name: apt.doctors?.users?.full_name || apt.doctor_name || 'طبيب' },
                role: 'DOCTOR'
              })
            }
          })
          found = Array.from(doctorMap.values())
        }
      }
      // Fallback 2: clinic doctors list (covers day-1 / empty queue)
      if (found.length === 0) {
        const res3 = await fetch('/api/doctors/list')
        if (res3.ok) {
          const data3 = await res3.json()
          if (data3.doctors && data3.doctors.length > 0) {
            found = data3.doctors.map((d: any) => ({
              user_id: d.id,
              users: { full_name: d.full_name || 'طبيب' },
              role: 'DOCTOR'
            }))
          }
        }
      }
      // Apply results
      if (found.length > 0) {
        setDoctors(found)
        if (found.length === 1) setSelectedDoctorId(found[0].user_id)
      }
    } catch {
      // Non-blocking
    } finally {
      setLoadingDoctors(false)
    }
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const validate = (): boolean => {
    const errors: FormErrors = {}

    if (!fullName.trim() || fullName.trim().length < 2) {
      errors.fullName = 'أدخل الاسم (على الأقل حرفين)'
    }

    if (!phone.trim()) {
      errors.phone = 'أدخل رقم الهاتف'
    } else {
      const phoneErr = getEgyptianPhoneError(phone)
      if (phoneErr) errors.phone = phoneErr
    }

    if (!age.trim()) {
      errors.age = 'أدخل العمر'
    } else {
      const ageNum = parseInt(age)
      if (isNaN(ageNum) || ageNum < 0 || ageNum > 120) {
        errors.age = 'العمر يجب أن يكون بين ٠ و ١٢٠'
      }
    }

    if (!sex) {
      errors.sex = 'اختر النوع'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // ============================================================================
  // SUBMIT — Save Only
  // ============================================================================

  const handleSaveOnly = async () => {
    setFormTouched(true)
    if (!validate()) return

    setSubmitMode('save')
    setSubmitting(true)

    try {
      // Need a doctorId for onboard API — load doctors if not yet loaded
      let doctorId = selectedDoctorId
      if (!doctorId) {
        // Fetch a default doctor from the clinic
        const queueRes = await fetch('/api/frontdesk/queue/today')
        if (queueRes.ok) {
          const queueData = await queueRes.json()
          if (queueData.doctors?.length > 0) {
            doctorId = queueData.doctors[0].user_id
          }
        }
      }

      if (!doctorId) {
        setFormErrors({ phone: 'لا يوجد طبيب في العيادة. تواصل مع المسؤول.' })
        setSubmitting(false)
        return
      }

      const res = await fetch('/api/patients/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          fullName: fullName.trim(),
          age: parseInt(age),
          sex,
          doctorId
        })
      })

      const data = await res.json()

      if (!res.ok) {
        const errorMsg = data.errorAr || data.error || 'فشل تسجيل المريض'
        setFormErrors({ phone: errorMsg })
        setSubmitting(false)
        return
      }

      // Check if patient already exists
      if (data.isExisting) {
        setDuplicatePatient({
          id: data.patient?.id || '',
          full_name: data.patient?.full_name || fullName,
          phone: data.patient?.phone || phone,
          age: data.patient?.age || null,
          sex: data.patient?.sex || null,
          unique_id: data.patient?.unique_id || ''
        })
        setShowDuplicateDialog(true)
        setSubmitting(false)
        return
      }

      // Success!
      setSuccessToast({
        name: fullName.trim(),
        patientId: data.patient?.id || ''
      })

      // Auto-dismiss toast after 3s
      setTimeout(() => {
        setSuccessToast(null)
        resetForm()
      }, 3000)

    } catch (err: any) {
      setFormErrors({ phone: err.message || 'حدث خطأ غير متوقع' })
    } finally {
      setSubmitting(false)
    }
  }

  // ============================================================================
  // SUBMIT — Save & Add to Queue
  // ============================================================================

  const handleSaveAndQueue = async () => {
    setFormTouched(true)
    if (!validate()) return

    // If no doctors loaded yet, load them
    if (doctors.length === 0) {
      await loadDoctors()
    }

    // If single doctor, auto-select
    if (doctors.length === 1) {
      setSelectedDoctorId(doctors[0].user_id)
      await performSaveAndQueue(doctors[0].user_id)
    } else if (doctors.length > 1 && !selectedDoctorId) {
      // Show doctor selection bottom sheet
      setShowDoctorSheet(true)
    } else if (selectedDoctorId) {
      await performSaveAndQueue(selectedDoctorId)
    } else {
      // No doctors found — fallback
      setFormErrors({ phone: 'لا يوجد طبيب في العيادة.' })
    }
  }

  const performSaveAndQueue = async (doctorId: string) => {
    setSubmitMode('queue')
    setSubmitting(true)
    setShowDoctorSheet(false)

    try {
      // Step 1: Onboard patient
      const res = await fetch('/api/patients/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          fullName: fullName.trim(),
          age: parseInt(age),
          sex,
          doctorId
        })
      })

      const data = await res.json()

      if (!res.ok) {
        const errorMsg = data.errorAr || data.error || 'فشل تسجيل المريض'
        setFormErrors({ phone: errorMsg })
        setSubmitting(false)
        return
      }

      // If existing, show duplicate dialog instead
      if (data.isExisting && !data.patient?.id) {
        setFormErrors({ phone: 'المريض موجود بالفعل' })
        setSubmitting(false)
        return
      }

      const patientId = data.patient?.id

      // Step 2: Check in to queue
      const checkinRes = await fetch('/api/frontdesk/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          doctorId,
          queueType: 'walk_in'
        })
      })

      const checkinData = await checkinRes.json()

      if (!checkinRes.ok) {
        // Patient was created but check-in failed — show partial success
        setSuccessToast({
          name: fullName.trim(),
          patientId,
          addedToQueue: false
        })
        setTimeout(() => {
          setSuccessToast(null)
          resetForm()
        }, 3000)
        return
      }

      // Full success!
      setSuccessToast({
        name: fullName.trim(),
        patientId,
        queueNumber: checkinData.queueItem?.queue_number,
        addedToQueue: true
      })

      setTimeout(() => {
        setSuccessToast(null)
        resetForm()
      }, 3000)

    } catch (err: any) {
      setFormErrors({ phone: err.message || 'حدث خطأ غير متوقع' })
    } finally {
      setSubmitting(false)
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  const resetForm = () => {
    setFullName('')
    setPhone('')
    setAge('')
    setSex('')
    setFormErrors({})
    setFormTouched(false)
    setSearchResults([])
    setShowResults(false)
    setDuplicatePatient(null)
  }

  const handleBack = () => {
    if (hasFormData) {
      setShowBackDialog(true)
    } else {
      router.back()
    }
  }

  const handleClear = () => {
    resetForm()
  }

  // Mask phone for display: 010****5678
  const maskPhone = (ph: string) => {
    if (ph.length < 7) return ph
    return ph.slice(0, 3) + '****' + ph.slice(-4)
  }

  // Load doctors on mount
  useEffect(() => {
    loadDoctors()
  }, [])

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div dir="rtl" className="min-h-screen bg-[#F9FAFB] pb-40">

      {/* ── Header ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#E5E7EB]">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={handleBack}
              className="w-9 h-9 rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center flex-shrink-0"
            >
              <ChevronRight className="w-5 h-5 text-[#030712]" />
            </button>
            <h1 className="font-cairo text-[18px] font-semibold text-[#030712] truncate">
              تسجيل مريض جديد
            </h1>
          </div>
          {hasFormData && (
            <button
              onClick={handleClear}
              className="font-cairo text-[13px] text-[#6B7280] flex-shrink-0"
            >
              مسح
            </button>
          )}
        </div>
      </div>

      {/* ── Form Body ── */}
      {/* Field order is phone → name → age → sex (D-057). Phone is the      */}
      {/* canonical patient identity, so the typeahead lookup must run before */}
      {/* the assistant fills the rest of the form. Name/age/sex inputs stay */}
      {/* disabled until phoneIsValid flips true.                             */}
      <div className="px-4 pt-5 space-y-5">

        {/* ── Phone Number (with typeahead) ── */}
        <div className="relative">
          <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">
            رقم الهاتف <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <Phone className="w-[18px] h-[18px] text-[#9CA3AF]" />
            </div>
            {isSearching && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <Loader2 className="w-4 h-4 text-[#9CA3AF] animate-spin" />
              </div>
            )}
            <input
              type="tel"
              inputMode="numeric"
              maxLength={11}
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setShowResults(true) }}
              onBlur={handlePhoneBlur}
              placeholder="01012345678"
              dir="ltr"
              autoFocus
              className={`w-full h-12 pr-10 pl-10 rounded-[12px] border-[0.8px] font-cairo text-[14px] text-[#030712] placeholder:text-[#9CA3AF] focus:outline-none transition-colors bg-white text-left ${
                formErrors.phone && formTouched
                  ? 'border-red-400 focus:border-red-500 bg-red-50/30'
                  : 'border-[#E5E7EB] focus:border-[#16A34A]'
              }`}
            />
          </div>
          <p className="font-cairo text-[11px] text-[#9CA3AF] mt-1">
            مثال: 01012345678
          </p>
          {formErrors.phone && (
            <p className="font-cairo text-[12px] text-red-600 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              {formErrors.phone}
            </p>
          )}

          {/* ── Typeahead Results Dropdown ── */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] shadow-lg z-20 overflow-hidden">
              <div className="px-3 py-2 bg-[#FFFBEB] border-b border-[#FDE68A]">
                <p className="font-cairo text-[12px] text-[#92400E] font-medium">
                  مريض بنفس الرقم موجود بالفعل
                </p>
              </div>
              {searchResults.map((patient) => (
                <button
                  key={patient.id}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelectPatient(patient)
                  }}
                  className="w-full px-3 py-3 flex items-center gap-3 hover:bg-[#F9FAFB] active:bg-[#F3F4F6] transition-colors border-b border-[#F3F4F6] last:border-b-0"
                >
                  <div className="w-9 h-9 rounded-full bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-[#16A34A]" />
                  </div>
                  <div className="flex-1 min-w-0 text-right">
                    <p className="font-cairo text-[14px] font-medium text-[#030712] truncate">
                      {patient.full_name || 'بدون اسم'}
                    </p>
                    <p className="font-cairo text-[12px] text-[#6B7280]" dir="ltr">
                      {maskPhone(patient.phone)}
                      {patient.age ? ` · ${patient.age} سنة` : ''}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#9CA3AF] flex-shrink-0 rotate-180" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Phone-first hint (only while phone is invalid) ── */}
        {!phoneIsValid && (
          <div className="bg-[#F0FDF4] border-[0.8px] border-[#BBF7D0] rounded-[10px] px-3 py-2.5 flex items-start gap-2">
            <Phone className="w-4 h-4 text-[#16A34A] mt-0.5 flex-shrink-0" />
            <p className="font-cairo text-[12px] text-[#15803D] leading-relaxed">
              أدخل رقم الهاتف أولاً للتحقق من المريض. باقي الحقول هتتفتح بعد كده.
            </p>
          </div>
        )}

        {/* ── Full Name (gated behind phone) ── */}
        <div>
          <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">
            الاسم الكامل <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <User className={`w-[18px] h-[18px] ${phoneIsValid ? 'text-[#9CA3AF]' : 'text-[#D1D5DB]'}`} />
            </div>
            <input
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value)
                setFormErrors(prev => ({ ...prev, fullName: undefined }))
              }}
              placeholder="أحمد علي محمد"
              disabled={!phoneIsValid}
              className={`w-full h-12 pr-10 pl-4 rounded-[12px] border-[0.8px] font-cairo text-[14px] text-[#030712] placeholder:text-[#9CA3AF] focus:outline-none transition-colors disabled:bg-[#F9FAFB] disabled:text-[#9CA3AF] disabled:placeholder:text-[#D1D5DB] disabled:cursor-not-allowed disabled:border-[#F3F4F6] ${
                formErrors.fullName && formTouched
                  ? 'border-red-400 focus:border-red-500 bg-red-50/30'
                  : 'border-[#E5E7EB] focus:border-[#16A34A] bg-white'
              }`}
            />
          </div>
          {formErrors.fullName && formTouched && (
            <p className="font-cairo text-[12px] text-red-600 mt-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              {formErrors.fullName}
            </p>
          )}
        </div>

        {/* ── Age (gated behind phone) ── */}
        <div>
          <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">
            العمر <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <Calendar className={`w-[18px] h-[18px] ${phoneIsValid ? 'text-[#9CA3AF]' : 'text-[#D1D5DB]'}`} />
            </div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={3}
              value={age}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 3)
                setAge(val)
                setFormErrors(prev => ({ ...prev, age: undefined }))
              }}
              placeholder="٣٥"
              disabled={!phoneIsValid}
              className={`w-full h-12 pr-10 pl-4 rounded-[12px] border-[0.8px] font-cairo text-[14px] text-[#030712] placeholder:text-[#9CA3AF] focus:outline-none transition-colors disabled:bg-[#F9FAFB] disabled:text-[#9CA3AF] disabled:placeholder:text-[#D1D5DB] disabled:cursor-not-allowed disabled:border-[#F3F4F6] ${
                formErrors.age && formTouched
                  ? 'border-red-400 focus:border-red-500 bg-red-50/30'
                  : 'border-[#E5E7EB] focus:border-[#16A34A] bg-white'
              }`}
            />
          </div>
          {formErrors.age && formTouched && (
            <p className="font-cairo text-[12px] text-red-600 mt-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              {formErrors.age}
            </p>
          )}
        </div>

        {/* ── Gender — Segmented Control (gated behind phone) ── */}
        <div>
          <label className="font-cairo text-[13px] font-semibold text-[#4B5563] mb-2 block">
            النوع <span className="text-red-500">*</span>
          </label>
          <div className={`flex rounded-[12px] border-[0.8px] overflow-hidden transition-opacity ${
            !phoneIsValid ? 'opacity-50' : ''
          } ${
            formErrors.sex && formTouched ? 'border-red-400' : 'border-[#E5E7EB]'
          }`}>
            <button
              type="button"
              onClick={() => {
                setSex('Male')
                setFormErrors(prev => ({ ...prev, sex: undefined }))
              }}
              disabled={!phoneIsValid}
              className={`flex-1 h-11 font-cairo text-[14px] font-medium transition-colors disabled:cursor-not-allowed ${
                sex === 'Male'
                  ? 'bg-[#16A34A] text-white'
                  : 'bg-white text-[#6B7280] hover:bg-[#F9FAFB] disabled:hover:bg-white'
              }`}
            >
              ذكر
            </button>
            <div className="w-[0.8px] bg-[#E5E7EB]" />
            <button
              type="button"
              onClick={() => {
                setSex('Female')
                setFormErrors(prev => ({ ...prev, sex: undefined }))
              }}
              disabled={!phoneIsValid}
              className={`flex-1 h-11 font-cairo text-[14px] font-medium transition-colors disabled:cursor-not-allowed ${
                sex === 'Female'
                  ? 'bg-[#16A34A] text-white'
                  : 'bg-white text-[#6B7280] hover:bg-[#F9FAFB] disabled:hover:bg-white'
              }`}
            >
              أنثى
            </button>
          </div>
          {formErrors.sex && formTouched && (
            <p className="font-cairo text-[12px] text-red-600 mt-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              {formErrors.sex}
            </p>
          )}
        </div>

      </div>

      {/* ── Sticky Footer — Dual CTA ── */}
      <div className="fixed bottom-16 left-0 right-0 z-20 bg-white border-t border-[#E5E7EB] px-4 py-3">
        <div className="max-w-md mx-auto space-y-2.5">
          {/* Primary: Save & Add to Queue */}
          <button
            onClick={handleSaveAndQueue}
            disabled={!isFormValid || submitting}
            className="w-full h-12 bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-40 disabled:hover:bg-[#16A34A] text-white rounded-[12px] font-cairo text-[15px] font-bold transition-colors flex items-center justify-center gap-2"
          >
            {submitting && submitMode === 'queue' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري التسجيل...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-[18px] h-[18px]" />
                <span>حفظ وإضافة للطابور</span>
              </>
            )}
          </button>

          {/* Secondary: Save Only */}
          <button
            onClick={handleSaveOnly}
            disabled={!isFormValid || submitting}
            className="w-full h-11 bg-white border-[0.8px] border-[#E5E7EB] hover:bg-[#F9FAFB] disabled:opacity-40 text-[#030712] rounded-[12px] font-cairo text-[14px] font-medium transition-colors flex items-center justify-center gap-2"
          >
            {submitting && submitMode === 'save' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#6B7280]" />
                <span className="text-[#6B7280]">جاري الحفظ...</span>
              </>
            ) : (
              <span>حفظ فقط</span>
            )}
          </button>
        </div>
      </div>

      {/* ============================================================================ */}
      {/* DUPLICATE PATIENT DIALOG */}
      {/* ============================================================================ */}
      {showDuplicateDialog && duplicatePatient && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowDuplicateDialog(false)}
          />
          <div className="relative w-full max-w-md bg-white rounded-t-[20px] p-5 pb-8 animate-slide-up">
            {/* Drag handle */}
            <div className="w-10 h-1 bg-[#D1D5DB] rounded-full mx-auto mb-5" />

            <div className="text-center mb-5">
              <div className="w-14 h-14 bg-[#FFFBEB] rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-7 h-7 text-[#D97706]" />
              </div>
              <h3 className="font-cairo text-[17px] font-bold text-[#030712] mb-1">
                مريض بهذا الرقم موجود
              </h3>
              <p className="font-cairo text-[13px] text-[#6B7280]">
                هل تريد فتح ملف المريض الموجود؟
              </p>
            </div>

            {/* Patient info card */}
            <div className="bg-[#F9FAFB] rounded-[12px] p-4 mb-5 border-[0.8px] border-[#E5E7EB]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-[#16A34A]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-cairo text-[15px] font-semibold text-[#030712] truncate">
                    {duplicatePatient.full_name || 'بدون اسم'}
                  </p>
                  <p className="font-cairo text-[13px] text-[#6B7280]" dir="ltr">
                    {maskPhone(duplicatePatient.phone)}
                    {duplicatePatient.age ? ` · ${duplicatePatient.age} سنة` : ''}
                    {duplicatePatient.sex === 'Male' ? ' · ذكر' : duplicatePatient.sex === 'Female' ? ' · أنثى' : ''}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2.5">
              <button
                onClick={() => {
                  setShowDuplicateDialog(false)
                  router.push(`/frontdesk/checkin?patientId=${duplicatePatient.id}`)
                }}
                className="w-full h-12 bg-[#16A34A] text-white rounded-[12px] font-cairo text-[15px] font-bold transition-colors"
              >
                فتح ملف المريض وتسجيل الوصول
              </button>
              <button
                onClick={() => {
                  setShowDuplicateDialog(false)
                  setDuplicatePatient(null)
                }}
                className="w-full h-11 bg-[#F3F4F6] text-[#4B5563] rounded-[12px] font-cairo text-[14px] font-medium transition-colors"
              >
                تسجيل مريض جديد بنفس الرقم
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* DOCTOR SELECTION BOTTOM SHEET */}
      {/* ============================================================================ */}
      {showDoctorSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowDoctorSheet(false)}
          />
          <div className="relative w-full max-w-md bg-white rounded-t-[20px] p-5 pb-8 animate-slide-up">
            {/* Drag handle */}
            <div className="w-10 h-1 bg-[#D1D5DB] rounded-full mx-auto mb-5" />

            <h3 className="font-cairo text-[17px] font-bold text-[#030712] mb-1 text-center">
              اختر الطبيب
            </h3>
            <p className="font-cairo text-[13px] text-[#6B7280] text-center mb-5">
              المريض سيُضاف لطابور الطبيب المختار
            </p>

            <div className="space-y-2">
              {loadingDoctors ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[#16A34A]" />
                </div>
              ) : doctors.length === 0 ? (
                <div className="text-center py-6">
                  <p className="font-cairo text-[14px] text-[#6B7280]">لا يوجد أطباء متاحين</p>
                </div>
              ) : (
                doctors.map((doc) => (
                  <button
                    key={doc.user_id}
                    onClick={() => {
                      setSelectedDoctorId(doc.user_id)
                      performSaveAndQueue(doc.user_id)
                    }}
                    className={`w-full p-4 rounded-[12px] border-[0.8px] flex items-center gap-3 transition-colors ${
                      selectedDoctorId === doc.user_id
                        ? 'border-[#16A34A] bg-[#F0FDF4]'
                        : 'border-[#E5E7EB] bg-white hover:bg-[#F9FAFB]'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-[#3B82F6]" />
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <p className="font-cairo text-[14px] font-semibold text-[#030712] truncate">
                        د. {doc.users?.full_name || 'طبيب'}
                      </p>
                    </div>
                    {selectedDoctorId === doc.user_id && (
                      <Check className="w-5 h-5 text-[#16A34A] flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>

            <button
              onClick={() => setShowDoctorSheet(false)}
              className="w-full h-11 mt-4 bg-[#F3F4F6] text-[#4B5563] rounded-[12px] font-cairo text-[14px] font-medium"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* BACK CONFIRMATION DIALOG */}
      {/* ============================================================================ */}
      {showBackDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowBackDialog(false)}
          />
          <div className="relative w-full max-w-sm bg-white rounded-[16px] p-5">
            <h3 className="font-cairo text-[16px] font-bold text-[#030712] mb-2 text-center">
              تجاهل البيانات؟
            </h3>
            <p className="font-cairo text-[13px] text-[#6B7280] text-center mb-5">
              لديك بيانات غير محفوظة. هل تريد المتابعة؟
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBackDialog(false)}
                className="flex-1 h-11 bg-[#F3F4F6] text-[#4B5563] rounded-[12px] font-cairo text-[14px] font-medium"
              >
                البقاء
              </button>
              <button
                onClick={() => {
                  setShowBackDialog(false)
                  router.back()
                }}
                className="flex-1 h-11 bg-red-500 text-white rounded-[12px] font-cairo text-[14px] font-medium"
              >
                تجاهل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* SUCCESS TOAST */}
      {/* ============================================================================ */}
      {successToast && (
        <div className="fixed top-4 left-4 right-4 z-50 animate-slide-down">
          <div className="max-w-md mx-auto bg-[#F0FDF4] border-[0.8px] border-[#BBF7D0] rounded-[12px] p-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#16A34A] flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-cairo text-[14px] font-semibold text-[#030712]">
                  تم تسجيل {successToast.name}
                </p>
                <p className="font-cairo text-[12px] text-[#16A34A]">
                  {successToast.addedToQueue
                    ? `تمت الإضافة للطابور${successToast.queueNumber ? ` · رقم ${successToast.queueNumber}` : ''}`
                    : 'تم الحفظ بنجاح'
                  }
                </p>
              </div>
              <button
                onClick={() => { setSuccessToast(null); resetForm() }}
                className="w-8 h-8 flex items-center justify-center flex-shrink-0"
              >
                <X className="w-4 h-4 text-[#6B7280]" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Animations ── */}
      <style jsx global>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes slide-down {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        .animate-slide-down {
          animation: slide-down 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
