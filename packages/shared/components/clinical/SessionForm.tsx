'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ar } from '@shared/lib/i18n/ar'
import { CollapsibleSection } from './CollapsibleSection'
import { RadiologyInline, type RadiologyItem } from './RadiologyInline'
import { LabsInline, type LabItem } from './LabsInline'
import { MedicationChips, type MedicationEntry } from './MedicationChips'
import { TemplateModal, type PrescriptionTemplate } from './TemplateModal'
import { AllergyWarning } from './AllergyWarning'
import { PatientHistorySheet } from './PatientHistorySheet'
import DiagnosisInput from './DiagnosisInput'
import type { VisitType } from '@ui-clinic/components/doctor/PatientQueueCard'

// ============================================================================
// TYPES
// ============================================================================

interface PatientData {
  id: string
  name: string
  phone: string
  age?: number
  sex?: string
  lastVisitReason?: string
  lastVisitDate?: string
}

export interface SessionFormData {
  patientId: string
  visitType: VisitType
  chiefComplaint: string
  diagnosis: string[]
  allergies: string[]
  chronicDiseases: string[]
  doctorNotes: string
  showNotesInPrint: boolean
  medications: MedicationEntry[]
  radiology: RadiologyItem[]
  labs: LabItem[]
  followUpDate: string
  followUpNotes: string
}

interface SessionFormProps {
  preselectedPatientId?: string
}

// ============================================================================
// AUTO-SAVE HOOK
// ============================================================================

function useAutoSave(data: SessionFormData | null, patientId: string | null) {
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  useEffect(() => {
    if (!data || !patientId) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      try {
        const key = `draft_session_${patientId}`
        sessionStorage.setItem(key, JSON.stringify({ ...data, savedAt: new Date().toISOString() }))
        setLastSaved(new Date())
      } catch { /* storage full or unavailable */ }
    }, 2000) // Auto-save after 2s of inactivity

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [data, patientId])

  return lastSaved
}

// ============================================================================
// TOAST COMPONENT
// ============================================================================

function Toast({ message, visible, onDone }: { message: string; visible: boolean; onDone: () => void }) {
  useEffect(() => {
    if (visible) {
      const t = setTimeout(onDone, 2500)
      return () => clearTimeout(t)
    }
  }, [visible, onDone])

  if (!visible) return null

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[#030712] text-white px-4 py-2.5 rounded-xl text-[13px] font-cairo font-medium shadow-lg animate-fade-in">
      {message}
    </div>
  )
}

// ============================================================================
// SESSION FORM COMPONENT
// ============================================================================

export function SessionForm({ preselectedPatientId }: SessionFormProps) {
  const router = useRouter()

  // ===== STEP STATE =====
  // Step 1: Patient Info | Step 2: Prescription
  const [step, setStep] = useState<1 | 2>(1)

  // ===== PATIENT SEARCH STATE =====
  const [patientSearch, setPatientSearch] = useState('')
  const [searchResults, setSearchResults] = useState<PatientData[]>([])
  const [selectedPatient, setSelectedPatient] = useState<PatientData | null>(null)
  const [searching, setSearching] = useState(false)
  const [showPatientHistory, setShowPatientHistory] = useState(false)

  // ===== FORM STATE =====
  const [visitType, setVisitType] = useState<VisitType>('new')
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [allergies, setAllergies] = useState<string[]>([])
  const [allergyInput, setAllergyInput] = useState('')
  const [chronicDiseases, setChronicDiseases] = useState<string[]>([])
  const [chronicInput, setChronicInput] = useState('')
  const [diagnosis, setDiagnosis] = useState<string[]>([])
  const [doctorNotes, setDoctorNotes] = useState('')
  const [showNotesInPrint, setShowNotesInPrint] = useState(true)
  const [medications, setMedications] = useState<MedicationEntry[]>([])
  const [radiology, setRadiology] = useState<RadiologyItem[]>([])
  const [labs, setLabs] = useState<LabItem[]>([])
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpNotes, setFollowUpNotes] = useState('')

  // ===== MANUAL PATIENT NAME (B02: was uncontrolled) =====
  const [manualPatientName, setManualPatientName] = useState('')

  // ===== SPEED METRICS ("faster than paper") =====
  const [sessionStartTime] = useState(() => Date.now())
  const keystrokeCountRef = useRef(0)

  // Track keystrokes globally within the form
  useEffect(() => {
    const formEl = document.getElementById('session-form-root')
    if (!formEl) return
    const handler = (e: Event) => {
      const ke = e as KeyboardEvent
      // Count meaningful keystrokes (exclude modifiers, nav keys)
      if (ke.key && ke.key.length === 1) {
        keystrokeCountRef.current++
      }
    }
    formEl.addEventListener('keydown', handler)
    return () => formEl.removeEventListener('keydown', handler)
  }, [])

  // ===== UI STATE =====
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showConfirmDialog, setShowConfirmDialog] = useState<'save' | 'print' | 'save_and_print' | null>(null)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [showToast, setShowToast] = useState(false)
  const [allergyWarning, setAllergyWarning] = useState<{ drugName: string; allergyName: string; familyName: string } | null>(null)

  const prescriptionRef = useRef<HTMLDivElement>(null)

  // ===== B03: BEFOREUNLOAD WARNING =====
  const hasUnsavedData = medications.length > 0 || labs.length > 0 || radiology.length > 0 || doctorNotes.length > 0 || chiefComplaint.length > 0
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedData) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedData])

  // ===== AUTO-SAVE =====
  const formData: SessionFormData | null = selectedPatient ? {
    patientId: selectedPatient.id,
    visitType,
    chiefComplaint,
    diagnosis,
    allergies,
    chronicDiseases,
    doctorNotes,
    showNotesInPrint,
    medications,
    radiology,
    labs,
    followUpDate,
    followUpNotes,
  } : null

  const lastSaved = useAutoSave(formData, selectedPatient?.id || null)

  // ===== LOAD DRAFT ON PATIENT SELECT =====
  const loadDraft = useCallback((patientId: string) => {
    try {
      const key = `draft_session_${patientId}`
      const saved = sessionStorage.getItem(key)
      if (saved) {
        const draft = JSON.parse(saved)
        if (draft.medications?.length > 0 || draft.labs?.length > 0 || draft.doctorNotes || draft.diagnosis?.length > 0) {
          setVisitType(draft.visitType || 'new')
          setChiefComplaint(draft.chiefComplaint || '')
          setDiagnosis(draft.diagnosis || [])
          setDoctorNotes(draft.doctorNotes || '')
          setShowNotesInPrint(draft.showNotesInPrint ?? true)
          setMedications(draft.medications || [])
          setRadiology(draft.radiology || [])
          setLabs(draft.labs || [])
          setFollowUpDate(draft.followUpDate || '')
          setFollowUpNotes(draft.followUpNotes || '')
          showToastMessage('تم استعادة المسودة السابقة')
        }
      }
    } catch { /* no draft */ }
  }, [])

  // ===== TOAST HELPER =====
  const showToastMessage = (msg: string) => {
    setToastMessage(msg)
    setShowToast(true)
  }

  // ===== AUTO-LOAD PRE-SELECTED PATIENT =====
  useEffect(() => {
    if (!preselectedPatientId || selectedPatient) return
    let cancelled = false

    async function loadPatient() {
      try {
        const res = await fetch(`/api/doctor/patients/${preselectedPatientId}`)
        if (res.ok && !cancelled) {
          const data = await res.json()
          const patient = data.patient
          if (patient) {
            const p: PatientData = {
              id: patient.id,
              name: patient.full_name || patient.name,
              phone: patient.phone,
              age: patient.age,
              sex: patient.sex,
            }
            setSelectedPatient(p)
            if (patient.allergies) setAllergies(patient.allergies)
            if (patient.chronic_conditions) setChronicDiseases(patient.chronic_conditions)
            // B09: Auto-detect follow-up from previous visits
            if (patient.last_visit_date || patient.visits?.length > 0) {
              setVisitType('followup')
            }
            loadDraft(patient.id)
            // Auto-advance to Step 2 (prescription) — skip Step 1 since patient is known
            setStep(2)
          }
        }
      } catch { /* Patient not found */ }
    }

    loadPatient()
    return () => { cancelled = true }
  }, [preselectedPatientId, loadDraft]) // eslint-disable-line react-hooks/exhaustive-deps

  // ===== PATIENT SEARCH =====
  const searchPatients = useCallback(async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/doctor/patients/search?q=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data = await res.json()
        setSearchResults((data.patients || []).map((p: any) => ({
          id: p.id,
          name: p.full_name || p.name,
          phone: p.phone,
          age: p.age,
          sex: p.sex,
          lastVisitReason: p.last_visit_reason,
          lastVisitDate: p.last_visit_date,
        })))
      }
    } catch { /* ignore */ }
    finally { setSearching(false) }
  }, [])

  const selectPatient = (patient: PatientData) => {
    setSelectedPatient(patient)
    setPatientSearch('')
    setSearchResults([])
    loadDraft(patient.id)
    // B09: Auto-detect follow-up — if patient has a previous visit, set to "followup"
    if (patient.lastVisitDate) {
      setVisitType('followup')
    }
  }

  // ===== TAG HELPERS =====
  const addTag = (list: string[], setter: (v: string[]) => void, value: string, inputSetter: (v: string) => void) => {
    const trimmed = value.trim()
    if (trimmed && !list.includes(trimmed)) {
      setter([...list, trimmed])
      inputSetter('')
    }
  }

  const removeTag = (list: string[], setter: (v: string[]) => void, index: number) => {
    setter(list.filter((_, i) => i !== index))
  }

  // ===== MEDICATION HANDLERS =====
  const handleMedicationsChange = (meds: MedicationEntry[]) => {
    setMedications(meds)
  }

  const handleAllergyWarningCheck = (drugName: string, allergyName: string, familyName: string) => {
    setAllergyWarning({ drugName, allergyName, familyName })
  }

  const handleTemplateApply = (template: PrescriptionTemplate) => {
    const newMeds: MedicationEntry[] = template.medications.map(m => ({
      ...m,
      isExpanded: false,
    }))
    setMedications(prev => [...prev, ...newMeds])
    setShowTemplateModal(false)
    showToastMessage(`تمت إضافة ${template.medications.length} أدوية`)
  }

  // ===== STEP TRANSITION =====
  const goToStep2 = () => {
    if (!selectedPatient) {
      setError('يرجى اختيار مريض أولاً')
      return
    }
    setError('')
    setStep(2)
    // Auto-scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ===== FOLLOW-UP QUICK CHIPS =====
  const followUpChips = [
    { label: 'أسبوع', days: 7 },
    { label: 'أسبوعان', days: 14 },
    { label: 'شهر', days: 30 },
    { label: '3 أشهر', days: 90 },
  ]

  const setFollowUpFromChip = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    setFollowUpDate(d.toISOString().split('T')[0])
  }

  // ===== B13: CONFIRM BEFORE SAVE =====
  const confirmAndSave = (mode: 'save' | 'print' | 'save_and_print') => {
    if (!selectedPatient) {
      setError('يرجى اختيار مريض أولاً')
      return
    }
    setShowConfirmDialog(mode)
  }

  // ===== SAVE SESSION =====
  const saveSession = async (mode: 'save' | 'print' | 'save_and_print') => {
    setShowConfirmDialog(null)
    if (!selectedPatient) {
      setError('يرجى اختيار مريض أولاً')
      return
    }
    setSaving(true)
    setError('')

    try {
      const durationSeconds = Math.floor((Date.now() - sessionStartTime) / 1000)
      const sessionData = {
        patientId: selectedPatient.id,
        durationSeconds,
        keystrokeCount: keystrokeCountRef.current,
        noteData: {
          chief_complaint: chiefComplaint ? [chiefComplaint] : [],
          diagnosis,
          medications: medications.map(m => ({
            name: m.name,
            genericName: m.genericName,
            strength: m.strength,
            form: m.form,
            dosageCount: m.dosageCount,
            frequency: m.frequency,
            timings: m.timings,
            instructions: m.instructions,
            duration: m.duration,
            notes: m.notes || '',
          })),
          plan: doctorNotes,
          radiology,
          labs,
          allergies,
          chronic_diseases: chronicDiseases,
          show_notes_in_print: showNotesInPrint,
          visit_type: visitType,
          follow_up_date: followUpDate || null,
          follow_up_notes: followUpNotes || null,
          // Rx Intelligence: patient demographics for pattern analysis
          patient_age: selectedPatient.age || null,
          patient_gender: selectedPatient.sex || null,
        },
      }

      if (mode !== 'print') {
        const res = await fetch('/api/clinical/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sessionData),
        })

        if (!res.ok) {
          const data = await res.json()
          setError(data.error || 'فشل في حفظ الجلسة')
          return
        }

        const result = await res.json()

        // Clear draft after successful save
        try {
          sessionStorage.removeItem(`draft_session_${selectedPatient.id}`)
        } catch { /* ignore */ }

        if (mode === 'save_and_print' && result.noteId) {
          router.push(`/doctor/prescription?noteId=${result.noteId}`)
          return
        }
      }

      if (mode === 'print') {
        // B05: Include full medication data with duration for print
        sessionStorage.setItem('printOnlyData', JSON.stringify({
          patient: selectedPatient,
          medications: medications.map(m => ({
            name: m.name,
            genericName: m.genericName,
            strength: m.strength,
            form: m.form,
            dosageCount: m.dosageCount,
            frequency: m.frequency,
            timings: m.timings,
            instructions: m.instructions,
            duration: m.duration,
          })),
          radiology,
          labs,
          doctorNotes: showNotesInPrint ? doctorNotes : '',
          chiefComplaint,
          followUpDate,
          followUpNotes,
        }))
        router.push('/doctor/prescription?mode=print-only')
        return
      }

      router.push('/doctor/dashboard')
    } catch {
      setError('حدث خطأ. حاول مرة أخرى')
    } finally {
      setSaving(false)
    }
  }

  // ===== VISIT TYPE CHIPS =====
  const visitTypeChips: { key: VisitType; label: string }[] = [
    { key: 'new', label: 'جديد' },
    { key: 'followup', label: 'متابعة' },
    { key: 'emergency', label: 'طارئ' },
  ]

  // ============================================================================
  // STEP 1: PATIENT INFO
  // ============================================================================

  if (step === 1) {
    return (
      <div className="px-4 py-4 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-700 text-center font-cairo">
            {error}
          </div>
        )}

        {/* ===== PATIENT INFO CARD ===== */}
        <div className="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-4 py-3 bg-[#F9FAFB] border-b border-[#E5E7EB]">
            <h3 className="font-cairo font-bold text-[14px] text-[#030712]">معلومات المريض</h3>
          </div>

          <div className="p-4 space-y-4">
            {/* Phone Number */}
            <div>
              <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5">رقم الموبايل</label>
              {selectedPatient ? (
                <div className="flex items-center justify-between bg-[#DCFCE7] rounded-[10px] p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#16A34A] flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-cairo font-bold text-[14px] text-[#030712]">{selectedPatient.name}</div>
                      <div className="font-cairo text-[12px] text-[#4B5563]" dir="ltr">
                        {selectedPatient.phone} {selectedPatient.age && `· ${selectedPatient.age} سنة`}
                        {selectedPatient.sex && ` · ${selectedPatient.sex === 'male' ? 'ذكر' : 'أنثى'}`}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => { setSelectedPatient(null); setAllergies([]); setChronicDiseases([]) }}
                    className="font-cairo text-[12px] font-medium text-[#16A34A]"
                  >
                    تغيير
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="flex items-center border border-[#E5E7EB] rounded-[10px] overflow-hidden bg-white focus-within:ring-2 focus-within:ring-[#22C55E] focus-within:border-transparent">
                    <span className="px-3 text-[14px] font-inter font-medium text-[#4B5563] bg-[#F3F4F6] py-2.5 border-l border-[#E5E7EB]" dir="ltr">+20</span>
                    <input
                      type="tel"
                      value={patientSearch}
                      onChange={(e) => { setPatientSearch(e.target.value); searchPatients(e.target.value) }}
                      placeholder="01XXXXXXXXX"
                      className="flex-1 px-3 py-2.5 text-[14px] font-cairo focus:outline-none bg-transparent"
                      dir="ltr"
                    />
                  </div>
                  {searching && (
                    <div className="absolute left-3 top-3 text-[11px] text-[#4B5563] font-cairo">جاري البحث...</div>
                  )}
                  {/* Patient Search Results Dropdown */}
                  {searchResults.length > 0 && (
                    <div className="absolute z-30 w-full mt-1 bg-white border border-[#E5E7EB] rounded-[12px] shadow-lg max-h-[200px] overflow-y-auto">
                      {searchResults.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => selectPatient(p)}
                          className="w-full text-right px-4 py-3 hover:bg-[#F9FAFB] transition-colors border-b border-[#F3F4F6] last:border-0"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-cairo font-semibold text-[14px] text-[#030712]">{p.name}</div>
                              <div className="font-cairo text-[11px] text-[#4B5563]">
                                {p.lastVisitReason && (
                                  <span className="text-[#16A34A]">آخر زيارة: {p.lastVisitReason}</span>
                                )}
                              </div>
                            </div>
                            <div className="font-inter text-[12px] text-[#4B5563]" dir="ltr">{p.phone}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Patient Name (B02: controlled input for manual walk-in entry) */}
            {!selectedPatient && (
              <div>
                <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5">الاسم</label>
                <input
                  type="text"
                  value={manualPatientName}
                  onChange={(e) => setManualPatientName(e.target.value)}
                  placeholder="اكتب اسم المريض"
                  className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[14px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E] focus:border-transparent bg-white"
                />
              </div>
            )}

            {/* Visit Type Chips */}
            <div>
              <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5">الحالة</label>
              <div className="flex gap-2">
                {visitTypeChips.map((chip) => (
                  <button
                    key={chip.key}
                    onClick={() => setVisitType(chip.key)}
                    className={`px-4 py-2 font-cairo text-[12px] font-semibold rounded-full border transition-colors ${
                      visitType === chip.key
                        ? 'bg-[#16A34A] border-[#16A34A] text-white'
                        : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#16A34A]'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Age */}
            <div>
              <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5">العمر</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={selectedPatient?.age || ''}
                  readOnly={!!selectedPatient}
                  placeholder="—"
                  className="w-20 px-3 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[14px] font-cairo text-center focus:outline-none focus:ring-2 focus:ring-[#22C55E] bg-white"
                />
                <span className="font-cairo text-[12px] text-[#4B5563]">سنة</span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== ALLERGIES & CHRONIC DISEASES ===== */}
        <div className="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-4 py-3 bg-[#F9FAFB] border-b border-[#E5E7EB]">
            <h3 className="font-cairo font-bold text-[14px] text-[#030712]">الحساسية والأمراض المزمنة</h3>
          </div>

          <div className="p-4 space-y-4">
            {/* Allergies */}
            <div>
              <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5">الحساسية</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {allergies.map((a, i) => (
                  <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-[#FEE2E2] text-[#DC2626] text-[12px] font-cairo font-medium rounded-full">
                    {a}
                    <button onClick={() => removeTag(allergies, setAllergies, i)} className="hover:text-red-900 text-[14px] leading-none">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={allergyInput}
                  onChange={(e) => setAllergyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag(allergies, setAllergies, allergyInput, setAllergyInput))}
                  placeholder="اكتب... (مثال: بنسلين)"
                  className="flex-1 px-3 py-2 border border-[#E5E7EB] rounded-[8px] text-[13px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E]"
                />
                <button
                  onClick={() => addTag(allergies, setAllergies, allergyInput, setAllergyInput)}
                  className="w-9 h-9 rounded-[8px] bg-[#F3F4F6] flex items-center justify-center text-[#4B5563] hover:bg-[#E5E7EB] transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Chronic Diseases */}
            <div>
              <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5">الأمراض المزمنة</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {chronicDiseases.map((c, i) => (
                  <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-[#DCFCE7] text-[#16A34A] text-[12px] font-cairo font-medium rounded-full">
                    {c}
                    <button onClick={() => removeTag(chronicDiseases, setChronicDiseases, i)} className="hover:text-green-900 text-[14px] leading-none">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chronicInput}
                  onChange={(e) => setChronicInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag(chronicDiseases, setChronicDiseases, chronicInput, setChronicInput))}
                  placeholder="اكتب... (مثال: سكري)"
                  className="flex-1 px-3 py-2 border border-[#E5E7EB] rounded-[8px] text-[13px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E]"
                />
                <button
                  onClick={() => addTag(chronicDiseases, setChronicDiseases, chronicInput, setChronicInput)}
                  className="w-9 h-9 rounded-[8px] bg-[#F3F4F6] flex items-center justify-center text-[#4B5563] hover:bg-[#E5E7EB] transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* View Patient File Link */}
        {selectedPatient && (
          <button
            onClick={() => setShowPatientHistory(true)}
            className="w-full text-center font-cairo text-[13px] font-medium text-[#16A34A] underline py-1"
          >
            عرض ملف المريض
          </button>
        )}

        {/* ===== STEP 1 → STEP 2 BUTTON ===== */}
        <div className="sticky bottom-16 bg-white border-t border-[#E5E7EB] p-4 -mx-4">
          <button
            onClick={goToStep2}
            disabled={!selectedPatient}
            className="w-full py-3.5 bg-[#16A34A] text-white rounded-[12px] font-cairo font-bold text-[14px] hover:bg-[#15803d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ابدأ الروشتة
          </button>
        </div>

        {/* Patient History Bottom Sheet */}
        {showPatientHistory && selectedPatient && (
          <PatientHistorySheet
            patientId={selectedPatient.id}
            patientName={selectedPatient.name}
            onClose={() => setShowPatientHistory(false)}
          />
        )}
      </div>
    )
  }

  // ============================================================================
  // STEP 2: PRESCRIPTION
  // ============================================================================

  return (
    <div id="session-form-root" className="px-4 py-4 space-y-4" ref={prescriptionRef}>
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-700 text-center font-cairo">
          {error}
        </div>
      )}

      {/* ===== PATIENT SUMMARY BAR ===== */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#DCFCE7] flex items-center justify-center">
              <svg className="w-4 h-4 text-[#16A34A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <span className="font-cairo font-bold text-[14px] text-[#030712]">{selectedPatient?.name}</span>
              <div className="flex items-center gap-2 text-[11px] font-cairo text-[#4B5563]">
                <span dir="ltr">{selectedPatient?.phone}</span>
                {selectedPatient?.age && <span>· {selectedPatient.age} سنة</span>}
                {allergies.length > 0 && (
                  <span className="text-[#DC2626] font-medium">
                    · حساسية: {allergies.join('، ')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Active session badge */}
            <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#16A34A] text-[11px] font-cairo font-semibold rounded-full">
              جلسة نشطة
            </span>
            <button
              onClick={() => setStep(1)}
              className="font-cairo text-[11px] font-medium text-[#4B5563]"
            >
              تعديل
            </button>
          </div>
        </div>
        {/* Auto-save indicator */}
        {lastSaved && (
          <div className="mt-1 text-[10px] font-cairo text-[#9CA3AF] text-left" dir="ltr">
            حُفظ تلقائياً {lastSaved.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* ===== CHIEF COMPLAINT — Tap chips + free text ===== */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
        <div className="px-4 py-3 bg-[#F9FAFB] border-b border-[#E5E7EB]">
          <div className="flex items-center justify-between">
            <h3 className="font-cairo font-bold text-[14px] text-[#030712]">الشكوى</h3>
            <span className="font-cairo text-[11px] text-[#9CA3AF]">اختياري</span>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {/* Quick complaint chips — top 20 Egyptian GP complaints */}
          <div className="flex flex-wrap gap-1.5">
            {[
              'صداع', 'كحة', 'سخونية', 'ألم بطن', 'ألم ظهر',
              'ألم حلق', 'رشح', 'إسهال', 'إمساك', 'غثيان',
              'دوخة', 'ضيق تنفس', 'ألم صدر', 'ألم مفاصل', 'طفح جلدي',
              'حرقان بول', 'ارتفاع ضغط', 'ارتفاع سكر', 'أرق', 'تعب عام',
            ].map((chip) => {
              const isSelected = chiefComplaint.includes(chip)
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      // Remove chip from complaint text
                      setChiefComplaint(prev =>
                        prev.replace(chip, '').replace(/،\s*،/g, '،').replace(/^،\s*|،\s*$/g, '').trim()
                      )
                    } else {
                      // Append chip to complaint text
                      setChiefComplaint(prev => prev ? `${prev}، ${chip}` : chip)
                    }
                  }}
                  className={`px-3 py-1.5 font-cairo text-[12px] font-medium rounded-full border transition-colors ${
                    isSelected
                      ? 'bg-[#16A34A] border-[#16A34A] text-white'
                      : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#16A34A]'
                  }`}
                >
                  {chip}
                </button>
              )
            })}
          </div>
          {/* Free text fallback for anything not in chips */}
          <input
            type="text"
            value={chiefComplaint}
            onChange={(e) => setChiefComplaint(e.target.value)}
            placeholder="أو اكتب الشكوى يدوياً..."
            className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[13px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E] focus:border-transparent bg-white"
          />
        </div>
      </div>

      {/* ===== DIAGNOSIS — ICD-10 + Complaint-based suggestions ===== */}
      <CollapsibleSection
        title="التشخيص"
        icon="stethoscope"
        badge={diagnosis.length > 0 ? `${diagnosis.length}` : undefined}
      >
        <DiagnosisInput
          value={diagnosis}
          onChange={setDiagnosis}
          chiefComplaints={chiefComplaint ? chiefComplaint.split(/[،,]/).map(s => s.trim()).filter(Boolean) : []}
        />
      </CollapsibleSection>

      {/* ===== PRESCRIPTION — MEDICATIONS (Accordion) ===== */}
      <CollapsibleSection
        title="الروشتة"
        icon="pill"
        defaultOpen={true}
        badge={medications.length > 0 ? `${medications.length}` : undefined}
      >
        <MedicationChips
          medications={medications}
          onChange={handleMedicationsChange}
          allergies={allergies}
          onAllergyWarning={handleAllergyWarningCheck}
          onOpenTemplates={() => setShowTemplateModal(true)}
        />
      </CollapsibleSection>

      {/* ===== LABS (Accordion) ===== */}
      <CollapsibleSection
        title="التحاليل"
        icon="flask"
        badge={labs.length > 0 ? `${labs.length}` : undefined}
      >
        <LabsInline items={labs} onChange={setLabs} />
      </CollapsibleSection>

      {/* ===== RADIOLOGY (Accordion) ===== */}
      <CollapsibleSection
        title="الأشعة"
        icon="scan"
        badge={radiology.length > 0 ? `${radiology.length}` : undefined}
      >
        <RadiologyInline items={radiology} onChange={setRadiology} />
      </CollapsibleSection>

      {/* ===== DOCTOR NOTES ===== */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
        <div className="px-4 py-3 bg-[#F9FAFB] border-b border-[#E5E7EB]">
          <h3 className="font-cairo font-bold text-[14px] text-[#030712]">ملاحظات الطبيب</h3>
        </div>
        <div className="p-4">
          <textarea
            value={doctorNotes}
            onChange={(e) => setDoctorNotes(e.target.value)}
            rows={3}
            placeholder="أكتب ملاحظاتك هنا..."
            className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[13px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E] resize-none bg-white"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setShowNotesInPrint(!showNotesInPrint)}
              className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                showNotesInPrint ? 'bg-[#16A34A] border-[#16A34A]' : 'border-[#E5E7EB] bg-white'
              }`}
            >
              {showNotesInPrint && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <span className="font-cairo text-[12px] text-[#4B5563]">تظهر في الطباعة</span>
          </div>
        </div>
      </div>

      {/* ===== FOLLOW-UP ===== */}
      <div className="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
        <div className="px-4 py-3 bg-[#F9FAFB] border-b border-[#E5E7EB]">
          <h3 className="font-cairo font-bold text-[14px] text-[#030712]">المتابعة</h3>
        </div>
        <div className="p-4 space-y-3">
          {/* Date */}
          <div>
            <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5">موعد المراجعة</label>
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[13px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E] bg-white"
              dir="ltr"
            />
          </div>

          {/* Quick date chips */}
          <div className="flex flex-wrap gap-2">
            {followUpChips.map((chip) => (
              <button
                key={chip.label}
                onClick={() => setFollowUpFromChip(chip.days)}
                className="px-3 py-1.5 font-cairo text-[12px] font-medium rounded-full border border-[#E5E7EB] text-[#4B5563] hover:border-[#16A34A] hover:text-[#16A34A] transition-colors bg-white"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Follow-up notes */}
          <div>
            <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5">تعليمات المتابعة</label>
            <input
              type="text"
              value={followUpNotes}
              onChange={(e) => setFollowUpNotes(e.target.value)}
              placeholder="مثال: راجعني بعد التحاليل"
              className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[13px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E] bg-white"
            />
          </div>
        </div>
      </div>

      {/* ===== ACTION BAR ===== */}
      <div className="sticky bottom-16 bg-white border-t border-[#E5E7EB] p-4 -mx-4">
        <button
          onClick={() => confirmAndSave('save_and_print')}
          disabled={saving}
          className="w-full py-3.5 bg-[#16A34A] text-white rounded-[12px] font-cairo font-bold text-[14px] hover:bg-[#15803d] transition-colors disabled:opacity-50"
        >
          {saving ? 'جاري الحفظ...' : 'إنهاء وطباعة الروشتة'}
        </button>
        <div className="flex items-center justify-center gap-4 mt-2">
          <button
            onClick={() => confirmAndSave('save')}
            disabled={saving}
            className="font-cairo text-[13px] font-medium text-[#4B5563] hover:text-[#030712]"
          >
            حفظ فقط
          </button>
          <span className="text-[#E5E7EB]">|</span>
          <button
            onClick={() => confirmAndSave('print')}
            disabled={saving}
            className="font-cairo text-[13px] font-medium text-[#4B5563] hover:text-[#030712]"
          >
            طباعة فقط
          </button>
        </div>
      </div>

      {/* ===== MODALS ===== */}
      {showTemplateModal && (
        <TemplateModal
          onApply={handleTemplateApply}
          onClose={() => setShowTemplateModal(false)}
        />
      )}

      {allergyWarning && (
        <AllergyWarning
          drugName={allergyWarning.drugName}
          allergyName={allergyWarning.allergyName}
          familyName={allergyWarning.familyName}
          onProceed={() => setAllergyWarning(null)}
          onCancel={() => {
            // Remove the last added medication
            setMedications(prev => prev.slice(0, -1))
            setAllergyWarning(null)
          }}
        />
      )}

      {showPatientHistory && selectedPatient && (
        <PatientHistorySheet
          patientId={selectedPatient.id}
          patientName={selectedPatient.name}
          onClose={() => setShowPatientHistory(false)}
        />
      )}

      {/* B13: Save Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-[16px] mx-6 w-full max-w-sm overflow-hidden">
            <div className="p-5 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#DCFCE7] flex items-center justify-center">
                <svg className="w-6 h-6 text-[#16A34A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="font-cairo font-bold text-[16px] text-[#030712] mb-1">
                {showConfirmDialog === 'save' ? 'حفظ الجلسة؟' : showConfirmDialog === 'print' ? 'طباعة الروشتة؟' : 'إنهاء وطباعة؟'}
              </h3>
              <p className="font-cairo text-[13px] text-[#4B5563]">
                {medications.length} دواء
                {labs.length > 0 ? ` · ${labs.length} تحليل` : ''}
                {radiology.length > 0 ? ` · ${radiology.length} أشعة` : ''}
              </p>
            </div>
            <div className="flex border-t border-[#E5E7EB]">
              <button
                onClick={() => setShowConfirmDialog(null)}
                className="flex-1 py-3 font-cairo text-[14px] font-medium text-[#4B5563] hover:bg-[#F9FAFB] transition-colors border-l border-[#E5E7EB]"
              >
                إلغاء
              </button>
              <button
                onClick={() => saveSession(showConfirmDialog)}
                className="flex-1 py-3 font-cairo text-[14px] font-bold text-[#16A34A] hover:bg-[#F0FDF4] transition-colors"
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toastMessage} visible={showToast} onDone={() => setShowToast(false)} />
    </div>
  )
}
