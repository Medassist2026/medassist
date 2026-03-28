'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Users, Check } from 'lucide-react'
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
  // P3: relationship metadata — used to offer code-upgrade to verified_consented
  isRegistered?: boolean   // patient has a MedAssist app account
  accessLevel?: string     // 'walk_in_limited' | 'verified_consented' | 'ghost'
  // Family fields — dependents surfaced via parent_phone search
  isDependent?: boolean
  parentPhone?: string
  guardianId?: string
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

  // ===== EGYPTIAN PHONE VALIDATION =====
  // Normalizes Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) to Western digits before validation.
  // Egyptian keyboards (and autocomplete) often produce Eastern Arabic numerals.
  function normalizePhone(input: string): string {
    return input.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
  }

  // Validates the raw digits typed into the "+20" prefix phone field.
  // Valid: 11 digits starting with 010/011/012/015 (local format)
  //     or 10 digits starting with 10/11/12/15 (missing leading zero)
  function isValidEgyptianPhone(rawInput: string): boolean {
    const digits = normalizePhone(rawInput).replace(/\D/g, '')
    if (digits.length === 11 && /^0(10|11|12|15)/.test(digits)) return true
    if (digits.length === 10 && /^(10|11|12|15)/.test(digits)) return true
    return false
  }

  function egyptianPhoneError(rawInput: string): string | null {
    const digits = normalizePhone(rawInput).replace(/\D/g, '')
    if (digits.length === 0) return null
    if (digits.length < 10) return null  // still typing, no error yet
    if (isValidEgyptianPhone(rawInput)) return null
    if (digits.length > 11) return 'رقم طويل جداً — يجب أن يكون 11 رقماً (مثال: 01012345678)'
    if (!digits.startsWith('0') && !['10','11','12','15'].some(p => digits.startsWith(p))) {
      return 'يجب أن يبدأ الرقم بـ 010 أو 011 أو 012 أو 015'
    }
    return 'رقم موبايل مصري غير صحيح (مثال: 01012345678)'
  }

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
  const [pendingLabsFromLastVisit, setPendingLabsFromLastVisit] = useState<string[]>([]) // FIX 9
  const [showNotesInPrint, setShowNotesInPrint] = useState(true)
  const [medications, setMedications] = useState<MedicationEntry[]>([])
  const [radiology, setRadiology] = useState<RadiologyItem[]>([])
  const [labs, setLabs] = useState<LabItem[]>([])
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpNotes, setFollowUpNotes] = useState('')

  // ===== MANUAL PATIENT NAME (B02: was uncontrolled) =====
  const [manualPatientName, setManualPatientName] = useState('')

  // ===== CHIEF COMPLAINT CUSTOM INPUT (appends; separate from chip toggles) =====
  const [complaintCustom, setComplaintCustom] = useState('')

  // ===== PERSONALISED CHIPS (loaded once on mount from doctor's history) =====
  const DEFAULT_COMPLAINT_CHIPS = [
    'صداع', 'كحة', 'سخونية', 'ألم بطن', 'ألم ظهر',
    'ألم حلق', 'رشح', 'إسهال', 'إمساك', 'غثيان',
    'دوخة', 'ضيق تنفس', 'ألم صدر', 'ألم مفاصل', 'طفح جلدي',
    'حرقان بول', 'ارتفاع ضغط', 'ارتفاع سكر', 'أرق', 'تعب عام',
  ]
  const DEFAULT_MEDICATION_CHIPS = [
    'باراسيتامول', 'أموكسيسيلين', 'أزيثروميسين', 'إيبوبروفين', 'أوميبرازول',
    'ميتفورمين', 'أملوديبين', 'أتورفاستاتين', 'سالبوتامول', 'سيتيريزين',
  ]
  const [complaintChips, setComplaintChips] = useState<string[]>(DEFAULT_COMPLAINT_CHIPS)
  const [diagnosisChips, setDiagnosisChips] = useState<string[]>([])
  const [medicationChips, setMedicationChips] = useState<string[]>(DEFAULT_MEDICATION_CHIPS)
  const [chipsPersonalised, setChipsPersonalised] = useState(false)

  // ===== MANUAL AGE (separate state so age field is editable when no patient selected) =====
  const [manualAge, setManualAge] = useState<string>('')

  // ===== MANUAL SEX (for new patient creation) =====
  const [manualSex, setManualSex] = useState<'Male' | 'Female' | null>(null)

  // ===== CREATING NEW PATIENT (inline creation state) =====
  const [creatingPatient, setCreatingPatient] = useState(false)

  // ===== P1: PHONE CHECK (registered patient detection) =====
  const [phoneCheckResult, setPhoneCheckResult] = useState<{
    exists: boolean
    isRegistered: boolean
    valid: boolean
    formatted?: string
    carrier?: string
  } | null>(null)
  const [phoneCheckLoading, setPhoneCheckLoading] = useState(false)

  // ===== P1: CODE VERIFICATION (patient shares their unique code) =====
  const [showCodeInput, setShowCodeInput] = useState(false)
  const [patientCode, setPatientCode]     = useState('')
  const [codeVerifying, setCodeVerifying] = useState(false)
  const [codeVerified, setCodeVerified]   = useState<{
    valid: boolean
    patient?: { fullName: string | null; age: number | null; sex: string | null }
  } | null>(null)

  // ===== P2: CAREGIVER / DEPENDENT =====
  // isDependent: patient is a child, elderly, or dependent — phone belongs to caregiver
  // dependentType: optional sub-type for documentation (no clinical impact)
  const [isDependent, setIsDependent]       = useState(false)
  const [dependentType, setDependentType]   = useState<'child' | 'elderly' | 'special' | null>(null)

  // ===== P2: GUARDIAN RECOGNITION =====
  // When isDependent=true and the typed phone matches a known patient of this doctor,
  // we surface their record so the doctor can confirm the guardian link.
  // guardianCandidate: the matched patient record (first search result in dependent mode)
  // guardianConfirmed: doctor has explicitly confirmed this is the guardian
  const [guardianCandidate, setGuardianCandidate] = useState<PatientData | null>(null)
  const [guardianConfirmed, setGuardianConfirmed] = useState(false)

  // ===== P2: ADD-CHILD SHORTCUT =====
  // When doctor clicks "+ إضافة تابع جديد" in the family dropdown, this context
  // pre-fills the guardian phone + auto-confirms, so only name/age/sex is needed.
  const [addChildContext, setAddChildContext] = useState<{
    phone: string
    guardianName?: string
    guardianId?: string
  } | null>(null)

  // ===== P3: RELATIONSHIP UPGRADE (walk_in_limited → verified_consented) =====
  // Shown when an existing patient who has a MedAssist account shares their code in-session,
  // unlocking full cross-visit medical history for this doctor.
  const [p3Code, setP3Code]         = useState('')
  const [p3ShowInput, setP3ShowInput] = useState(false)
  const [p3Verifying, setP3Verifying] = useState(false)
  const [p3Upgraded, setP3Upgraded]   = useState(false)
  const [p3Error, setP3Error]         = useState('')

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
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null) // FIX 6: Print CTA after save

  const prescriptionRef = useRef<HTMLDivElement>(null)
  const prescriptionSectionRef = useRef<HTMLDivElement>(null)

  // ===== SECTION PROGRESSION: auto-collapse complaint → diagnosis → prescription =====
  const [complaintCollapsed, setComplaintCollapsed] = useState(false)
  const diagnosisSectionRef = useRef<HTMLDivElement>(null)
  const [diagnosisCollapsed, setDiagnosisCollapsed] = useState(false)
  const [medicationsCollapsed, setMedicationsCollapsed] = useState(false)
  const additionalSectionsRef = useRef<HTMLDivElement>(null)

  // Computed: which section currently has the active (green ring) treatment
  const activeSection = !complaintCollapsed ? 'complaint'
    : !diagnosisCollapsed ? 'diagnosis'
    : !medicationsCollapsed ? 'medications'
    : 'additional'

  useEffect(() => {
    if (diagnosis.length > 0 && !diagnosisCollapsed) {
      setDiagnosisCollapsed(true)
      // Small delay so the user sees the confirmation state before scroll
      setTimeout(() => {
        prescriptionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 350)
    }
    if (diagnosis.length === 0) {
      setDiagnosisCollapsed(false)
    }
  }, [diagnosis.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ===== SECTION PROGRESSION: auto-collapse complaint when cleared =====
  useEffect(() => {
    if (!chiefComplaint.trim()) setComplaintCollapsed(false)
  }, [chiefComplaint])

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

  // ===== PERSONALISED CHIPS: fetch on mount =====
  useEffect(() => {
    fetch('/api/doctor/personalized-chips')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        if (data.complaints?.length > 0)  setComplaintChips(data.complaints)
        if (data.diagnoses?.length > 0)   setDiagnosisChips(data.diagnoses)
        if (data.medications?.length > 0) setMedicationChips(data.medications)
        setChipsPersonalised(data.personalised ?? false)
      })
      .catch(() => { /* use defaults silently */ })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
              isRegistered: patient.is_registered ?? false,
              accessLevel: patient.access_level || 'walk_in_limited',
            }
            setP3Code('')
            setP3ShowInput(false)
            setP3Upgraded(false)
            setP3Error('')
            setSelectedPatient(p)
            if (patient.allergies) setAllergies(patient.allergies)
            if (patient.chronic_conditions) setChronicDiseases(patient.chronic_conditions)
            // FIX 9: Set pending labs from last visit
            if (patient.pendingLabs?.length > 0) {
              setPendingLabsFromLastVisit(patient.pendingLabs)
            }
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
      // Normalize Egyptian phone queries so they match DB format (+201XXXXXXXXX).
      // The field displays "+20" as a static prefix, so user types "010XXXXXXXX".
      // "010" → stored as "+201XXXXXXXXX" → we search "2010" (strips leading 0, prepends "20").
      // This prevents 011 numbers matching a "010" query and vice-versa.
      let searchQuery = query
      const digitsOnly = query.replace(/\D/g, '')
      if (digitsOnly.length >= 2 && digitsOnly === query.replace(/[^\d]/g, '') && query.trim() === digitsOnly) {
        // Pure-digit input that looks like a phone fragment
        if (digitsOnly.startsWith('0')) {
          // "010..." → "2010..." so DB search matches "+2010..."
          searchQuery = '20' + digitsOnly.substring(1)
        }
      }
      const res = await fetch(`/api/doctor/patients/search?q=${encodeURIComponent(searchQuery)}`)
      if (res.ok) {
        const data = await res.json()
        setSearchResults((data.patients || []).map((p: any) => ({
          id: p.id,
          name: p.full_name || p.name,
          phone: p.phone,
          age: p.age ?? null,
          // API returns lowercase sex ('male'/'female'); fallback to gender field
          sex: (p.sex || p.gender) ?? null,
          lastVisitReason: p.last_visit_reason,
          lastVisitDate: p.last_visit_date,
          isRegistered: p.is_registered ?? false,
          accessLevel: p.access_level || 'walk_in_limited',
          // Family fields
          isDependent: p.is_dependent ?? false,
          parentPhone: p.parent_phone ?? null,
          guardianId: p.guardian_id ?? null,
        })))
      }
    } catch { /* ignore */ }
    finally { setSearching(false) }
  }, [])

  // ===== P1: DEBOUNCED PHONE CHECK =====
  // Fires after 600ms when phone reaches 10+ digits and no patient is yet selected.
  // Detects whether the phone belongs to a registered app user.
  useEffect(() => {
    if (selectedPatient) return
    const digits = patientSearch.replace(/\D/g, '')
    if (digits.length < 10) {
      setPhoneCheckResult(null)
      setShowCodeInput(false)
      setCodeVerified(null)
      setPatientCode('')
      return
    }
    setPhoneCheckLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients/check-phone?phone=${encodeURIComponent(digits)}`)
        if (res.ok) {
          const data = await res.json()
          setPhoneCheckResult(data)
        }
      } catch { /* non-critical */ }
      finally { setPhoneCheckLoading(false) }
    }, 600)
    return () => { clearTimeout(timer); setPhoneCheckLoading(false) }
  }, [patientSearch, selectedPatient])

  // ===== P2: GUARDIAN CANDIDATE DETECTION =====
  // When isDependent=true and search returns results, surface the first hit as
  // guardianCandidate. The doctor can confirm or dismiss. Resets when phone changes.
  useEffect(() => {
    // phoneIsValid is a derived const declared lower in the render; compute inline here
    const validPhone = isValidEgyptianPhone(patientSearch)
    if (!isDependent || !validPhone) {
      setGuardianCandidate(null)
      setGuardianConfirmed(false)
      return
    }
    if (searchResults.length > 0) {
      setGuardianCandidate(searchResults[0])
    } else {
      // Phone typed but no match in this doctor's list — clear candidate
      if (!searching) {
        setGuardianCandidate(null)
        // Do NOT reset guardianConfirmed here: user may have already confirmed via a previous
        // search that returned results, then the results were cleared on re-render.
      }
    }
  }, [isDependent, patientSearch, searchResults, searching])

  // ===== P1: CODE VERIFICATION HANDLER =====
  const verifyCode = async () => {
    const digits = patientSearch.replace(/\D/g, '')
    if (!patientCode.trim() || !digits) return
    setCodeVerifying(true)
    setCodeVerified(null)
    try {
      const res = await fetch('/api/patients/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits, code: patientCode.trim().toUpperCase() }),
      })
      const data = await res.json()
      setCodeVerified({ valid: data.valid, patient: data.patient })
      if (data.valid && data.patient) {
        // Auto-fill patient info from their verified record
        if (data.patient.fullName)   setManualPatientName(data.patient.fullName)
        if (data.patient.age)        setManualAge(String(data.patient.age))
        if (data.patient.sex === 'Male' || data.patient.sex === 'Female') setManualSex(data.patient.sex)
      }
    } catch {
      setCodeVerified({ valid: false })
    } finally {
      setCodeVerifying(false)
    }
  }

  // ===== P3: UPGRADE RELATIONSHIP HANDLER =====
  const upgradeRelationship = async () => {
    if (!selectedPatient || !p3Code.trim()) return
    setP3Verifying(true)
    setP3Error('')
    try {
      const res = await fetch('/api/patients/upgrade-relationship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: selectedPatient.id, code: p3Code.trim().toUpperCase() }),
      })
      const data = await res.json()
      if (data.success) {
        setP3Upgraded(true)
        setP3ShowInput(false)
        // Update in-memory patient record so the banner disappears on re-selection
        setSelectedPatient(prev => prev ? { ...prev, accessLevel: 'verified_consented' } : prev)
      } else {
        setP3Error(data.errorAr || 'الكود غير صحيح — تأكد من المريض وأعد المحاولة')
      }
    } catch {
      setP3Error('حدث خطأ في الاتصال — حاول مرة أخرى')
    } finally {
      setP3Verifying(false)
    }
  }

  const selectPatient = async (patient: PatientData) => {
    setSelectedPatient(patient)
    setPatientSearch('')
    setSearchResults([])
    setAddChildContext(null)   // clear add-child shortcut if a patient is directly chosen
    // Reset P3 state for new selection
    setP3Code('')
    setP3ShowInput(false)
    setP3Upgraded(false)
    setP3Error('')
    loadDraft(patient.id)
    // B09: Auto-detect follow-up — if patient has a previous visit, set to "followup"
    if (patient.lastVisitDate) {
      setVisitType('followup')
    }
    // Auto-load full patient details: allergies, chronic conditions, age, sex
    // (patient safety: prevents prescribing allergens even for cross-clinic patients)
    try {
      const res = await fetch(`/api/doctor/patients/${patient.id}`)
      if (res.ok) {
        const data = await res.json()
        const p = data.patient
        if (p?.allergies?.length > 0) setAllergies(p.allergies)
        if (p?.chronic_conditions?.length > 0) setChronicDiseases(p.chronic_conditions)
        // FIX 9: Set pending labs from last visit
        if (p?.pendingLabs?.length > 0) {
          setPendingLabsFromLastVisit(p.pendingLabs)
        }
        // Enrich selectedPatient with age/sex from detail API (may have more data than search result)
        if (p?.age || p?.sex) {
          setSelectedPatient(prev => prev ? {
            ...prev,
            age: p.age ?? prev.age,
            sex: (p.sex || prev.sex) ?? undefined,
          } : prev)
        }
        // Also set manualAge as editable fallback
        if (p?.age) setManualAge(String(p.age))
      }
    } catch { /* non-critical — patient can fill manually */ }
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

  // ===== STEP TRANSITION (creates patient inline if new) =====
  const goToStep2 = async () => {
    setError('')

    // Already selected from search — just advance
    if (selectedPatient) {
      setStep(2)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    // NEW PATIENT PATH: phone + name typed manually → create then advance
    const phone = patientSearch.replace(/\D/g, '')
    const name  = manualPatientName.trim()

    if (!phone || phone.length < 8) {
      setError('يرجى إدخال رقم الموبايل')
      return
    }
    // Validate Egyptian phone format before creating
    if (!isValidEgyptianPhone(patientSearch)) {
      setError(egyptianPhoneError(patientSearch) || 'رقم موبايل مصري غير صحيح (مثال: 01012345678)')
      return
    }
    if (!name || name.split(/\s+/).filter(Boolean).length < 2) {
      setError('يرجى إدخال الاسم الأول واسم العائلة')
      return
    }

    setCreatingPatient(true)
    try {
      let res: Response
      let data: any

      if (codeVerified?.valid) {
        // CODE VERIFIED PATH: use onboard endpoint → verified_consented relationship
        // onboard requires age + sex (filled by verify-code auto-fill above)
        res = await fetch('/api/patients/onboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone,
            fullName: name,
            age: manualAge ? Number(manualAge) : 0,
            sex: manualSex || 'Other',
            patientCode: patientCode.trim().toUpperCase(),
            isDependent,
            parentPhone: isDependent ? phone : undefined,
            guardianId: isDependent && guardianConfirmed && guardianCandidate ? guardianCandidate.id : undefined,
          }),
        })
      } else {
        // WALK-IN PATH: standard create → walk_in_limited relationship
        res = await fetch('/api/doctor/patients/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: isDependent ? undefined : phone,  // dependent has no personal phone
            name,
            age: manualAge ? Number(manualAge) : undefined,
            sex: manualSex || undefined,
            isDependent,
            parentPhone: isDependent ? phone : undefined,
            // When a guardian was confirmed from search results, send their UUID for FK linking
            guardianId: isDependent && guardianConfirmed && guardianCandidate ? guardianCandidate.id : undefined,
          }),
        })
      }

      data = await res.json()

      if (!res.ok) {
        setError(data.errorAr || data.error || 'فشل إنشاء سجل المريض')
        return
      }

      const patientPayload = data.patient
      const p: PatientData = {
        id: patientPayload.id,
        name: patientPayload.full_name || patientPayload.name || name,
        phone: patientPayload.phone || phone,
        age: manualAge ? Number(manualAge) : undefined,
        sex: manualSex || undefined,
      }
      setSelectedPatient(p)
      setStep(2)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setError('حدث خطأ. حاول مرة أخرى')
    } finally {
      setCreatingPatient(false)
    }
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
    // Chief complaint is mandatory
    if (!chiefComplaint.trim()) {
      setError('الشكوى الرئيسية مطلوبة — اختر شكوى أو اكتبها قبل الحفظ')
      // Scroll up to the chief complaint section
      window.scrollTo({ top: 0, behavior: 'smooth' })
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

        // FIX 6: After save (not save_and_print), show success screen
        if (mode === 'save' && result.noteId) {
          setSavedNoteId(result.noteId)
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

  // ===== COMMON ALLERGY & CHRONIC DISEASE CHIPS =====
  const COMMON_ALLERGIES = ['بنسلين', 'أسبرين', 'بروفين', 'سلفا', 'كودين', 'لاتكس', 'مأكولات بحرية', 'مكسرات', 'بيض', 'حليب']
  const COMMON_CHRONIC   = ['سكري', 'ضغط', 'قلب', 'ربو', 'كلى', 'كبد', 'غدة درقية', 'التهاب مفاصل', 'سمنة', 'قولون عصبي']

  // ===== NEW PATIENT MODE: phone entered, search done, no results =====
  // Triggers the inline create-patient flow.
  // In dependent mode: always true once caregiver phone ≥ 8 digits
  // (search results are irrelevant — we're looking up caregiver, creating for patient)
  const phoneDigits = patientSearch.replace(/\D/g, '')
  const phoneIsValid = isValidEgyptianPhone(patientSearch)
  const phoneErrMsg  = egyptianPhoneError(patientSearch)

  const isCreatingNew =
    !selectedPatient && phoneIsValid && (
      (isDependent) ||
      (searchResults.length === 0 && !searching)
    )

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
      <div className="px-4 lg:px-2 py-4">
      {/* Desktop: two-column layout — patient info | allergies & conditions */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-4 lg:space-y-0">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-700 text-center font-cairo">
            {error}
          </div>
        )}

        {/* ===== PATIENT INFO CARD ===== */}
        <div className={`bg-white rounded-[12px] border overflow-hidden transition-colors ${
          isDependent && isCreatingNew ? 'border-[#F59E0B] ring-2 ring-[#F59E0B]/20' :
          isCreatingNew               ? 'border-[#22C55E] ring-2 ring-[#22C55E]/20' :
                                        'border-[#E5E7EB]'
        }`}>
          <div className={`px-4 py-3 border-b flex items-center justify-between ${
            isDependent && isCreatingNew ? 'bg-[#FFFBEB] border-[#FDE68A]' :
            isCreatingNew               ? 'bg-[#F0FDF4] border-[#BBF7D0]' :
                                          'bg-[#F9FAFB] border-[#E5E7EB]'
          }`}>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-[6px] bg-[#DCFCE7] flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-[#16A34A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
              <h3 className="font-cairo font-bold text-[14px] text-[#030712]">معلومات المريض</h3>
            </div>
            <div className="flex items-center gap-2">
              {/* Dependent toggle — patient is a child/elderly/special needs attended by a caregiver */}
              {!selectedPatient && (
                <div className="relative group">
                  <button
                    type="button"
                    onClick={() => { setIsDependent(p => !p); setDependentType(null); setGuardianCandidate(null); setGuardianConfirmed(false); setAddChildContext(null) }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-cairo font-semibold rounded-[8px] border transition-all ${
                      isDependent
                        ? 'bg-[#F59E0B] border-[#F59E0B] text-white shadow-sm'
                        : 'bg-white border-[#E5E7EB] text-[#374151] hover:border-[#D1D5DB] hover:bg-[#F9FAFB]'
                    }`}
                  >
                    {isDependent
                      ? <Check className="w-[13px] h-[13px]" strokeWidth={2.5} />
                      : <Users className="w-[13px] h-[13px]" strokeWidth={1.67} />
                    }
                    <span>{isDependent ? 'مريض تابع' : 'تابع / مرافق'}</span>
                  </button>
                  {/* Persistent hint — shown below button when not yet active */}
                  {!isDependent && (
                    <p className="absolute top-full right-0 mt-1 font-cairo text-[10px] text-[#9CA3AF] whitespace-nowrap pointer-events-none" dir="rtl">
                      للأطفال والمرضى مع مرافق
                    </p>
                  )}
                </div>
              )}
              {isCreatingNew && !isDependent && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-[#22C55E] text-white text-[11px] font-cairo font-bold rounded-full">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  مريض جديد
                </span>
              )}
              {isDependent && isCreatingNew && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-[#F59E0B] text-white text-[11px] font-cairo font-bold rounded-full">
                  مريض تابع
                </span>
              )}
              {selectedPatient && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-[#DCFCE7] text-[#16A34A] text-[11px] font-cairo font-bold rounded-full">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  تم التعرف
                </span>
              )}
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Phone Number */}
            <div>
              <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5">
                {isDependent ? 'رقم موبايل ولي الأمر / المرافق' : 'رقم الموبايل'}
              </label>
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
                    onClick={() => {
                      setSelectedPatient(null)
                      setAllergies([])
                      setChronicDiseases([])
                      setPhoneCheckResult(null)
                      setShowCodeInput(false)
                      setPatientCode('')
                      setCodeVerified(null)
                      setManualSex(null)
                      setManualAge('')
                      setManualPatientName('')
                      setIsDependent(false)
                      setDependentType(null)
                      setGuardianCandidate(null)
                      setGuardianConfirmed(false)
                      setP3Code('')
                      setP3ShowInput(false)
                      setP3Upgraded(false)
                      setP3Error('')
                    }}
                    className="font-cairo text-[12px] font-medium text-[#16A34A]"
                  >
                    تغيير
                  </button>
                </div>
              ) : (
                <div className="relative">
                  {/* dir="ltr" overrides RTL parent so +20 stays on LEFT edge */}
                  <div className={`flex items-center border rounded-[10px] overflow-hidden bg-white transition-all ${
                    phoneErrMsg
                      ? 'border-[#FCA5A5] focus-within:ring-2 focus-within:ring-[#FCA5A5]'
                      : 'border-[#E5E7EB] focus-within:ring-2 focus-within:ring-[#22C55E] focus-within:border-transparent'
                  }`} dir="ltr">
                    <span className="px-3 text-[14px] font-inter font-medium text-[#4B5563] bg-[#F3F4F6] py-2.5 border-r border-[#E5E7EB]">+20</span>
                    <input
                      type="tel"
                      value={patientSearch}
                      onChange={(e) => { const v = normalizePhone(e.target.value); setPatientSearch(v); searchPatients(v) }}
                      placeholder="01XXXXXXXXX"
                      className="flex-1 px-3 py-2.5 text-[14px] font-cairo focus:outline-none bg-transparent"
                      dir="ltr"
                    />
                    {/* Carrier badge + phone-check status */}
                    {phoneCheckLoading && (
                      <span className="px-2">
                        <span className="inline-block w-3.5 h-3.5 border-2 border-[#9CA3AF] border-t-transparent rounded-full animate-spin" />
                      </span>
                    )}
                    {!phoneCheckLoading && phoneCheckResult?.carrier && (
                      <span className={`px-2 py-0.5 mx-1.5 text-[10px] font-bold rounded-full whitespace-nowrap ${
                        phoneCheckResult.carrier.toLowerCase().includes('vodafone') ? 'bg-red-100 text-red-700' :
                        phoneCheckResult.carrier.toLowerCase().includes('orange')   ? 'bg-orange-100 text-orange-700' :
                        phoneCheckResult.carrier.toLowerCase().includes('etisalat') || phoneCheckResult.carrier.toLowerCase().includes('e&') ? 'bg-purple-100 text-purple-700' :
                        phoneCheckResult.carrier.toLowerCase().includes('we') || phoneCheckResult.carrier.toLowerCase().includes('telecom') ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {phoneCheckResult.carrier}
                      </span>
                    )}
                  </div>

                  {searching && (
                    <div className="absolute left-3 top-3 text-[11px] text-[#4B5563] font-cairo">جاري البحث...</div>
                  )}

                  {/* Phone format validation error */}
                  {phoneErrMsg && (
                    <p className="mt-1.5 font-cairo text-[12px] text-[#DC2626] flex items-center gap-1" dir="rtl">
                      <svg className="w-[12px] h-[12px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      {phoneErrMsg}
                    </p>
                  )}

                  {/* ===== SEARCH RESULTS DROPDOWN (family-grouped) ===== */}
                  {searchResults.length > 0 && !isDependent && (() => {
                    // Split into regular patients (matched by own phone/name) and dependents
                    // (matched because parent_phone == typed number)
                    const regularPts = searchResults.filter(p => !p.isDependent)
                    const dependentPts = searchResults.filter(p => p.isDependent)

                    // Group dependents by parent_phone so siblings appear together
                    const byParent: Record<string, PatientData[]> = {}
                    for (const d of dependentPts) {
                      const key = d.parentPhone || 'unknown'
                      if (!byParent[key]) byParent[key] = []
                      byParent[key].push(d)
                    }
                    const parentGroups = Object.entries(byParent)

                    // Handler for "Add new child for this guardian" shortcut
                    const handleAddChild = (guardianPhone: string, guardianName?: string, guardianId?: string) => {
                      setSearchResults([])
                      setIsDependent(true)
                      setAddChildContext({ phone: guardianPhone, guardianName, guardianId })
                      if (guardianId && guardianName) {
                        setGuardianCandidate({ id: guardianId, name: guardianName, phone: guardianPhone })
                        setGuardianConfirmed(true)
                      }
                    }

                    return (
                      <div className="absolute z-30 w-full mt-1 bg-white border border-[#E5E7EB] rounded-[12px] shadow-lg max-h-[280px] overflow-y-auto" dir="rtl">

                        {/* Regular patients (own phone matches) */}
                        {regularPts.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => selectPatient(p)}
                            className="w-full text-right px-4 py-3 hover:bg-[#F9FAFB] transition-colors border-b border-[#F3F4F6] last:border-0 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-7 h-7 rounded-full bg-[#F3F4F6] flex items-center justify-center flex-shrink-0 text-[13px]">👤</span>
                              <div className="min-w-0 text-right">
                                <div className="font-cairo font-semibold text-[13px] text-[#030712] truncate">{p.name}</div>
                                {p.age && <div className="font-cairo text-[11px] text-[#6B7280]">{p.age} سنة{p.sex === 'male' ? ' · ذكر' : p.sex === 'female' ? ' · أنثى' : ''}</div>}
                              </div>
                            </div>
                            <div className="font-inter text-[11px] text-[#9CA3AF] flex-shrink-0" dir="ltr">{p.phone?.startsWith('DEP_') ? '' : p.phone}</div>
                          </button>
                        ))}

                        {/* Dependent groups — one section per parent phone */}
                        {parentGroups.map(([parentPhone, children]) => {
                          // Find the guardian record if it's also in regularPts (same phone)
                          const guardianRecord = regularPts.find(r => r.phone === parentPhone || r.phone === (parentPhone.startsWith('0') ? '+2' + parentPhone.slice(1) : parentPhone))
                          const displayPhone = parentPhone.startsWith('0') ? parentPhone : parentPhone

                          return (
                            <div key={parentPhone}>
                              {/* Family header */}
                              <div className="px-4 py-1.5 bg-[#F9FAFB] border-b border-[#F3F4F6] flex items-center justify-between">
                                <span className="font-cairo text-[11px] font-semibold text-[#6B7280]">
                                  {guardianRecord ? `أطفال ${guardianRecord.name}` : `أطفال رقم ${displayPhone}`}
                                </span>
                                <span className="font-cairo text-[10px] text-[#9CA3AF]">{children.length} {children.length === 1 ? 'طفل' : 'أطفال'}</span>
                              </div>

                              {/* Each child */}
                              {children.map((child) => (
                                <button
                                  key={child.id}
                                  onClick={() => selectPatient(child)}
                                  className="w-full text-right px-4 py-2.5 hover:bg-[#F0FDF4] transition-colors border-b border-[#F3F4F6] last:border-0 flex items-center justify-between gap-3"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="w-7 h-7 rounded-full bg-[#DCFCE7] flex items-center justify-center flex-shrink-0 text-[13px]">
                                      {(child.age ?? 99) < 12 ? '👦' : '🧒'}
                                    </span>
                                    <div className="min-w-0 text-right">
                                      <div className="font-cairo font-semibold text-[13px] text-[#030712] truncate">{child.name}</div>
                                      <div className="font-cairo text-[11px] text-[#16A34A]">
                                        {child.age ? `${child.age} سنة` : ''}
                                        {child.sex === 'male' ? ' · ذكر' : child.sex === 'female' ? ' · أنثى' : ''}
                                      </div>
                                    </div>
                                  </div>
                                  <span className="font-cairo text-[10px] text-white bg-[#16A34A] px-1.5 py-0.5 rounded-full flex-shrink-0">تابع</span>
                                </button>
                              ))}

                              {/* Add new child shortcut */}
                              <button
                                onClick={() => handleAddChild(
                                  displayPhone,
                                  guardianRecord?.name,
                                  guardianRecord?.id
                                )}
                                className="w-full text-right px-4 py-2.5 hover:bg-[#FFFBEB] transition-colors border-b border-[#F3F4F6] last:border-0 flex items-center gap-2"
                              >
                                <span className="w-7 h-7 rounded-full bg-[#FEF3C7] flex items-center justify-center flex-shrink-0">
                                  <svg className="w-3.5 h-3.5 text-[#D97706]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                  </svg>
                                </span>
                                <span className="font-cairo text-[12px] font-semibold text-[#D97706]">
                                  إضافة تابع جديد{guardianRecord ? ` لـ ${guardianRecord.name}` : ''}
                                </span>
                              </button>
                            </div>
                          )
                        })}

                        {/* If there are dependents but no regular patient matched — offer to add child */}
                        {parentGroups.length === 0 && dependentPts.length === 0 && regularPts.length === 0 && (
                          <div className="px-4 py-3 text-center font-cairo text-[12px] text-[#9CA3AF]">لا توجد نتائج</div>
                        )}
                      </div>
                    )
                  })()}

                  {/* ===== P2: CAREGIVER INFO BOX ===== */}
                  {isDependent && patientSearch.replace(/\D/g, '').length >= 8 && (
                    <div className="mt-2 rounded-[10px] border border-[#FDE68A] bg-[#FFFBEB] p-3 flex items-start gap-2">
                      <svg className="w-4 h-4 text-[#D97706] mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <div>
                        <p className="font-cairo font-semibold text-[12px] text-[#92400E]">رقم المرافق — ليس رقم المريض</p>
                        <p className="font-cairo text-[11px] text-[#B45309] mt-0.5">سيُحفظ كرقم التواصل لولي الأمر. اسم المريض (التابع) أدناه</p>
                      </div>
                    </div>
                  )}

                  {/* ===== P2: GUARDIAN RECOGNITION CARD ===== */}
                  {/* When isDependent=true and phone matches a patient already in this doctor's list */}
                  {isDependent && guardianCandidate && !guardianConfirmed && (
                    <div className="mt-2 rounded-[10px] border border-[#BBF7D0] bg-[#F0FDF4] p-3">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 w-5 h-5 rounded-full bg-[#16A34A] flex-shrink-0 flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-cairo font-semibold text-[12px] text-[#14532D]">ولي أمر موجود في سجلاتك</p>
                          <p className="font-cairo text-[11px] text-[#16A34A] mt-0.5">
                            {guardianCandidate.name}
                            {guardianCandidate.age && ` · ${guardianCandidate.age} سنة`}
                            {guardianCandidate.sex && ` · ${guardianCandidate.sex === 'male' ? 'ذكر' : 'أنثى'}`}
                          </p>
                          <p className="font-cairo text-[10px] text-[#4ADE80] mt-1">سيتم ربط التابع بهذا الولي تلقائياً عند الحفظ</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setGuardianConfirmed(true)}
                          className="flex-shrink-0 px-2.5 py-1 bg-[#16A34A] text-white text-[11px] font-cairo font-semibold rounded-[8px] hover:bg-[#15803D] transition-colors whitespace-nowrap"
                        >
                          تأكيد
                        </button>
                      </div>
                    </div>
                  )}
                  {isDependent && guardianConfirmed && guardianCandidate && (
                    <div className="mt-2 rounded-[10px] border border-[#BBF7D0] bg-[#F0FDF4] p-2.5 flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#16A34A] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="font-cairo text-[12px] font-semibold text-[#14532D] flex-1 min-w-0 truncate">
                        مرتبط بـ: {guardianCandidate.name}
                      </p>
                      <button
                        type="button"
                        onClick={() => setGuardianConfirmed(false)}
                        className="font-cairo text-[11px] text-[#16A34A] hover:text-[#14532D] flex-shrink-0"
                      >
                        تغيير
                      </button>
                    </div>
                  )}

                  {/* ===== P1: REGISTERED PATIENT BANNER ===== */}
                  {/* Shown when phone is registered in the app but not in this doctor's list */}
                  {isCreatingNew && phoneCheckResult?.isRegistered && !codeVerified?.valid && (
                    <div className="mt-2 rounded-[10px] border border-[#BFDBFE] bg-[#EFF6FF] p-3">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 w-5 h-5 rounded-full bg-[#3B82F6] flex-shrink-0 flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-cairo font-semibold text-[13px] text-[#1E40AF]">هذا المريض لديه حساب في MedAssist</p>
                          <p className="font-cairo text-[12px] text-[#3B82F6] mt-0.5">
                            اطلب من المريض مشاركة كود ملفه للوصول للتاريخ الكامل، أو تابع كزيارة عادية
                          </p>
                          {!showCodeInput && (
                            <button
                              type="button"
                              onClick={() => setShowCodeInput(true)}
                              className="mt-2 px-3 py-1.5 bg-[#3B82F6] text-white text-[12px] font-cairo font-semibold rounded-[8px] hover:bg-[#2563EB] transition-colors"
                            >
                              أدخل الكود
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Code input panel */}
                      {showCodeInput && (
                        <div className="mt-3 pt-3 border-t border-[#BFDBFE]">
                          <p className="font-cairo text-[11px] text-[#6B7280] mb-2">اطلب من المريض فتح التطبيق وإظهار الكود</p>
                          <div className="flex gap-2" dir="ltr">
                            <input
                              type="text"
                              value={patientCode}
                              onChange={(e) => { setPatientCode(e.target.value.toUpperCase()); setCodeVerified(null) }}
                              onKeyDown={(e) => e.key === 'Enter' && verifyCode()}
                              placeholder="مثال: AB12CD"
                              maxLength={12}
                              className="flex-1 px-3 py-2 border border-[#BFDBFE] rounded-[8px] text-[14px] font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6] tracking-widest text-center uppercase"
                              dir="ltr"
                            />
                            <button
                              type="button"
                              onClick={verifyCode}
                              disabled={!patientCode.trim() || codeVerifying}
                              className="px-3 py-2 bg-[#3B82F6] text-white text-[12px] font-cairo font-semibold rounded-[8px] hover:bg-[#2563EB] disabled:opacity-50 transition-colors whitespace-nowrap"
                            >
                              {codeVerifying ? (
                                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : 'تحقق'}
                            </button>
                          </div>
                          {/* Verification result */}
                          {codeVerified && !codeVerified.valid && (
                            <p className="mt-1.5 font-cairo text-[12px] text-[#DC2626]">❌ الكود غير صحيح — تحقق من المريض وأعد المحاولة</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Code verified — success state */}
                  {isCreatingNew && codeVerified?.valid && (
                    <div className="mt-2 rounded-[10px] border border-[#BBF7D0] bg-[#F0FDF4] p-3 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#22C55E] flex-shrink-0 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-cairo font-semibold text-[13px] text-[#16A34A]">تم التحقق ✓</p>
                        <p className="font-cairo text-[11px] text-[#4B5563]">سيتم ربط السجل الكامل للمريض بعد البدء</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ===== P3: REGISTERED PATIENT UPGRADE BANNER (Step 1) ===== */}
            {/* Shown when an EXISTING patient in doctor's list is a MedAssist user */}
            {/* but relationship is still walk_in_limited — doctor can ask for code  */}
            {selectedPatient && selectedPatient.isRegistered && selectedPatient.accessLevel !== 'verified_consented' && !p3Upgraded && (
              <div className="rounded-[10px] border border-[#BFDBFE] bg-[#EFF6FF] p-3">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 w-5 h-5 rounded-full bg-[#3B82F6] flex-shrink-0 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-cairo font-semibold text-[13px] text-[#1E40AF]">المريض لديه ملف في MedAssist</p>
                    <p className="font-cairo text-[12px] text-[#3B82F6] mt-0.5">
                      اطلب منه الكود للوصول للتاريخ الطبي الكامل والربط الموثّق
                    </p>
                    {!p3ShowInput && !p3Upgraded && (
                      <button
                        type="button"
                        onClick={() => setP3ShowInput(true)}
                        className="mt-2 px-3 py-1.5 bg-[#3B82F6] text-white text-[12px] font-cairo font-semibold rounded-[8px] hover:bg-[#2563EB] transition-colors"
                      >
                        أدخل الكود
                      </button>
                    )}
                  </div>
                </div>
                {p3ShowInput && (
                  <div className="mt-3 pt-3 border-t border-[#BFDBFE]">
                    <p className="font-cairo text-[11px] text-[#6B7280] mb-2">اطلب من المريض فتح التطبيق وإظهار الكود</p>
                    <div className="flex gap-2" dir="ltr">
                      <input
                        type="text"
                        value={p3Code}
                        onChange={(e) => { setP3Code(e.target.value.toUpperCase()); setP3Error('') }}
                        onKeyDown={(e) => e.key === 'Enter' && upgradeRelationship()}
                        placeholder="مثال: AB12CD"
                        maxLength={12}
                        className="flex-1 px-3 py-2 border border-[#BFDBFE] rounded-[8px] text-[14px] font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6] tracking-widest text-center uppercase"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={upgradeRelationship}
                        disabled={!p3Code.trim() || p3Verifying}
                        className="px-3 py-2 bg-[#3B82F6] text-white text-[12px] font-cairo font-semibold rounded-[8px] hover:bg-[#2563EB] disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        {p3Verifying ? (
                          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : 'ربط'}
                      </button>
                    </div>
                    {p3Error && (
                      <p className="mt-1.5 font-cairo text-[12px] text-[#DC2626]">❌ {p3Error}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* P3 upgrade success state */}
            {(p3Upgraded || selectedPatient?.accessLevel === 'verified_consented') && selectedPatient && (
              <div className="rounded-[10px] border border-[#BBF7D0] bg-[#F0FDF4] p-3 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[#22C55E] flex-shrink-0 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-cairo font-semibold text-[13px] text-[#16A34A]">تم الربط الموثّق ✓</p>
                  <p className="font-cairo text-[11px] text-[#4B5563]">يمكنك الآن الوصول للتاريخ الطبي الكامل للمريض</p>
                </div>
              </div>
            )}

            {/* ===== ADD-CHILD CONTEXT BANNER ===== */}
            {/* Shown when doctor clicked "إضافة تابع جديد" from family dropdown */}
            {addChildContext && !selectedPatient && (
              <div className="rounded-[10px] border border-[#FDE68A] bg-[#FFFBEB] p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[16px]">👶</span>
                  <div className="min-w-0">
                    <p className="font-cairo font-semibold text-[12px] text-[#92400E]">
                      إضافة تابع جديد{addChildContext.guardianName ? ` لـ ${addChildContext.guardianName}` : ''}
                    </p>
                    <p className="font-cairo text-[11px] text-[#B45309] mt-0.5">أدخل اسم المريض التابع وعمره أدناه</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAddChildContext(null)
                    setIsDependent(false)
                    setGuardianCandidate(null)
                    setGuardianConfirmed(false)
                  }}
                  className="font-cairo text-[11px] text-[#D97706] hover:text-[#92400E] flex-shrink-0"
                >
                  إلغاء
                </button>
              </div>
            )}

            {/* New patient fields: name + sex (shown when search returned no results) */}
            {!selectedPatient && (
              <>
                <div>
                  <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5">
                    {isDependent ? 'اسم المريض (التابع)' : 'الاسم'}
                    {isCreatingNew && <span className="text-[#DC2626] mr-0.5">*</span>}
                  </label>
                  <input
                    type="text"
                    value={manualPatientName}
                    onChange={(e) => setManualPatientName(e.target.value)}
                    placeholder={isDependent ? 'اسم الطفل / التابع' : 'الاسم الأول واسم العائلة'}
                    className={`w-full px-3 py-2.5 border rounded-[10px] text-[14px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E] focus:border-transparent bg-white transition-colors ${
                      isCreatingNew && !manualPatientName.trim() ? 'border-[#FCA5A5]' : 'border-[#E5E7EB]'
                    }`}
                  />
                  {isCreatingNew && (
                    <p className="mt-1 font-cairo text-[11px] text-[#6B7280]">
                      {isDependent ? 'اسم المريض التابع (وليس المرافق)' : 'يرجى إدخال الاسم الأول واسم العائلة'}
                    </p>
                  )}
                </div>

                {/* Sex selector — only shown in new patient mode */}
                {isCreatingNew && (
                  <div>
                    <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5">الجنس</label>
                    <div className="flex gap-2">
                      {([
                        { key: 'Male',   label: 'ذكر',  icon: '♂' },
                        { key: 'Female', label: 'أنثى', icon: '♀' },
                      ] as const).map(({ key, label, icon }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setManualSex(prev => prev === key ? null : key)}
                          className={`flex-1 py-2.5 font-cairo text-[13px] font-semibold rounded-[10px] border transition-colors ${
                            manualSex === key
                              ? 'bg-[#22C55E] border-[#22C55E] text-white'
                              : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#22C55E]'
                          }`}
                        >
                          <span className="ml-1 text-[15px]">{icon}</span>{label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dependent type chips — only in dependent + creating mode */}
                {isCreatingNew && isDependent && (
                  <div>
                    <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5">
                      نوع التبعية
                      <span className="font-cairo text-[11px] font-normal text-[#9CA3AF] mr-1">(اختياري)</span>
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {([
                        { key: 'child',   label: '👶 طفل / رضيع' },
                        { key: 'elderly', label: '🧓 مسن' },
                        { key: 'special', label: '♿ ذوي احتياجات' },
                      ] as const).map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setDependentType(prev => prev === key ? null : key)}
                          className={`px-3 py-1.5 font-cairo text-[12px] font-semibold rounded-full border transition-colors ${
                            dependentType === key
                              ? 'bg-[#F59E0B] border-[#F59E0B] text-white'
                              : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#F59E0B]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
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

            {/* Age — always visible; read-only when patient selected from DB with known age */}
            <div>
              <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5">
                العمر
                {isCreatingNew && <span className="font-cairo text-[11px] font-normal text-[#9CA3AF] mr-1">(اختياري)</span>}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="120"
                  value={selectedPatient?.age ? String(selectedPatient.age) : manualAge}
                  readOnly={!!selectedPatient?.age}
                  onChange={(e) => {
                    if (selectedPatient?.age) return
                    // Strip non-digits and cap at 120
                    const raw = e.target.value.replace(/\D/g, '').slice(0, 3)
                    const num = parseInt(raw, 10)
                    if (!raw || isNaN(num)) { setManualAge(raw === '' ? '' : raw); return }
                    setManualAge(String(Math.min(num, 120)))
                  }}
                  placeholder="—"
                  className={`w-20 px-3 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[14px] font-cairo text-center focus:outline-none focus:ring-2 focus:ring-[#22C55E] ${selectedPatient?.age ? 'bg-[#F9FAFB] text-[#6B7280]' : 'bg-white text-[#030712]'}`}
                />
                <span className="font-cairo text-[12px] text-[#4B5563]">سنة</span>
                {selectedPatient?.age && (
                  <span className="font-cairo text-[11px] text-[#9CA3AF]">من السجل</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ===== ALLERGIES & CHRONIC DISEASES ===== */}
        <div className="bg-white rounded-[12px] border border-[#E5E7EB] overflow-hidden">
          <div className="px-4 py-3 bg-[#FFF8F8] border-b border-[#FFE4E6] flex items-center gap-2">
            <span className="w-6 h-6 rounded-[6px] bg-[#FEE2E2] flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-[#DC2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </span>
            <h3 className="font-cairo font-bold text-[14px] text-[#030712]">الحساسية والأمراض المزمنة</h3>
          </div>

          <div className="p-4 space-y-4">
            {/* Allergies — chip-first input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-cairo text-[12px] font-semibold text-[#4B5563]">الحساسية</label>
                {selectedPatient && allergies.length > 0 && (
                  <span className="font-cairo text-[11px] text-[#DC2626] bg-[#FEF2F2] px-2 py-0.5 rounded-full">محمّل من السجل</span>
                )}
              </div>
              {/* Selected allergy chips */}
              {allergies.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {allergies.map((a, i) => (
                    <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-[#FEE2E2] text-[#DC2626] text-[12px] font-cairo font-medium rounded-full">
                      {a}
                      <button onClick={() => removeTag(allergies, setAllergies, i)} className="hover:text-red-900 text-[14px] leading-none ml-0.5">×</button>
                    </span>
                  ))}
                </div>
              )}
              {/* Common allergy suggestion chips */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_ALLERGIES.filter(a => !allergies.includes(a)).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAllergies(prev => [...prev, a])}
                    className="px-2.5 py-1 bg-[#FFF1F2] border border-[#FECDD3] text-[#9F1239] text-[11px] font-cairo rounded-full hover:bg-[#FEE2E2] transition-colors"
                  >
                    + {a}
                  </button>
                ))}
              </div>
              {/* Free-type custom allergy */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={allergyInput}
                  onChange={(e) => setAllergyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag(allergies, setAllergies, allergyInput, setAllergyInput))}
                  placeholder="أو اكتب حساسية أخرى..."
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

            {/* Chronic Diseases — chip-first input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-cairo text-[12px] font-semibold text-[#4B5563]">الأمراض المزمنة</label>
                {selectedPatient && chronicDiseases.length > 0 && (
                  <span className="font-cairo text-[11px] text-[#16A34A] bg-[#F0FDF4] px-2 py-0.5 rounded-full">محمّل من السجل</span>
                )}
              </div>
              {/* Selected chronic disease chips */}
              {chronicDiseases.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {chronicDiseases.map((c, i) => (
                    <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-[#DCFCE7] text-[#16A34A] text-[12px] font-cairo font-medium rounded-full">
                      {c}
                      <button onClick={() => removeTag(chronicDiseases, setChronicDiseases, i)} className="hover:text-green-900 text-[14px] leading-none ml-0.5">×</button>
                    </span>
                  ))}
                </div>
              )}
              {/* Common chronic disease suggestion chips */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_CHRONIC.filter(c => !chronicDiseases.includes(c)).map((c) => (
                  <button
                    key={c}
                    onClick={() => setChronicDiseases(prev => [...prev, c])}
                    className="px-2.5 py-1 bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] text-[11px] font-cairo rounded-full hover:bg-[#DCFCE7] transition-colors"
                  >
                    + {c}
                  </button>
                ))}
              </div>
              {/* Free-type custom chronic disease */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chronicInput}
                  onChange={(e) => setChronicInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag(chronicDiseases, setChronicDiseases, chronicInput, setChronicInput))}
                  placeholder="أو اكتب مرض مزمن آخر..."
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

        </div>{/* end two-column grid */}

        {/* View Patient File Link */}
        {selectedPatient && (
          <button
            onClick={() => setShowPatientHistory(true)}
            className="w-full text-center font-cairo text-[13px] font-medium text-[#16A34A] underline py-1 mt-4"
          >
            عرض ملف المريض
          </button>
        )}

        {/* ===== STEP 1 → STEP 2 BUTTON ===== */}
        {(() => {
          // Button is enabled when:
          // (a) a patient was found & selected from search, OR
          // (b) new patient mode: valid Egyptian phone + name has ≥ 2 words
          const hasName  = manualPatientName.trim().split(/\s+/).filter(Boolean).length >= 2
          const canProceed = !!selectedPatient || (isCreatingNew && phoneIsValid && hasName)
          const buttonLabel = creatingPatient
            ? 'جاري الإضافة...'
            : isCreatingNew && isDependent
              ? 'إضافة المريض التابع وبدء الروشتة'
              : isCreatingNew
              ? 'إضافة المريض وبدء الروشتة'
              : 'ابدأ الروشتة'

          return (
            <div className="sticky bottom-16 bg-white border-t border-[#E5E7EB] p-4 -mx-4">
              {/* Helper hint when in new-patient mode but name is missing */}
              {isCreatingNew && !hasName && phoneIsValid && (
                <p className="text-center font-cairo text-[12px] text-[#6B7280] mb-2">
                  أدخل الاسم الأول واسم العائلة للمتابعة
                </p>
              )}
              <button
                onClick={goToStep2}
                disabled={!canProceed || creatingPatient}
                className={`w-full py-3.5 text-white rounded-[12px] font-cairo font-bold text-[14px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isCreatingNew && canProceed
                    ? 'bg-[#22C55E] hover:bg-[#16A34A]'
                    : 'bg-[#16A34A] hover:bg-[#15803d]'
                }`}
              >
                {creatingPatient && (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin ml-2 align-middle" />
                )}
                {buttonLabel}
              </button>
            </div>
          )
        })()}

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

  // FIX 6: Show success screen after save
  if (savedNoteId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6" dir="rtl">
        <div className="w-16 h-16 rounded-full bg-[#F0FDF4] flex items-center justify-center">
          <svg className="w-8 h-8 text-[#16A34A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="font-cairo text-[20px] font-bold text-[#030712]">تم حفظ الجلسة</h2>
        <p className="font-cairo text-[14px] text-[#6B7280] text-center">الروشتة محفوظة بنجاح</p>
        <button
          onClick={() => router.push(`/doctor/prescription?noteId=${savedNoteId}`)}
          className="w-full max-w-xs py-3 bg-[#16A34A] text-white rounded-xl font-cairo font-bold text-[15px] hover:bg-[#15803d] transition-colors"
        >
          عرض وطباعة الروشتة
        </button>
        <button
          onClick={() => router.push('/doctor/dashboard')}
          className="w-full max-w-xs py-3 border border-[#E5E7EB] text-[#4B5563] rounded-xl font-cairo text-[15px] hover:bg-[#F9FAFB] transition-colors"
        >
          العودة للوحة التحكم
        </button>
      </div>
    )
  }

  return (
    <div id="session-form-root" className="px-4 py-4 space-y-4" ref={prescriptionRef}>
      {/* FIX 3: Prominent error banner with close button */}
      {error && (
        <div className="mx-4 mb-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
          <span className="text-red-500 text-[16px] flex-shrink-0">⚠️</span>
          <div className="flex-1">
            <p className="font-cairo text-[13px] text-red-700 font-medium">{error}</p>
            <button onClick={() => setError('')} className="font-cairo text-[12px] text-red-500 mt-1 underline">
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* ===== PATIENT SUMMARY BAR ===== */}
      <div className="bg-gradient-to-l from-[#F0FDF4] to-white rounded-[12px] border border-[#BBF7D0] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#16A34A] flex items-center justify-center flex-shrink-0">
              <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-cairo font-bold text-[14px] text-[#030712]">{selectedPatient?.name}</span>
                {allergies.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-[#FEE2E2] text-[#DC2626] text-[10px] font-cairo font-bold rounded-full flex-shrink-0">
                    ⚠ حساسية
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] font-cairo text-[#6B7280] mt-0.5 flex-wrap">
                <span dir="ltr">{selectedPatient?.phone}</span>
                {selectedPatient?.age && <span>· {selectedPatient.age} سنة</span>}
                {selectedPatient?.sex && <span>· {selectedPatient.sex === 'male' ? 'ذكر' : 'أنثى'}</span>}
                {chronicDiseases.length > 0 && (
                  <span className="text-[#6B7280]">· {chronicDiseases.slice(0, 2).join('، ')}{chronicDiseases.length > 2 ? `...` : ''}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
            <button
              onClick={() => setStep(1)}
              className="font-cairo text-[12px] font-semibold text-[#16A34A] hover:text-[#15803d] transition-colors"
            >
              تعديل
            </button>
          </div>
        </div>
        {lastSaved && (
          <div className="mt-1.5 text-[10px] font-cairo text-[#9CA3AF] flex items-center gap-1" dir="ltr">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            حُفظ تلقائياً {lastSaved.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* ===== P3: UPGRADE BANNER IN STEP 2 ===== */}
      {/* For preselected patients (queue handoff): show before prescription starts */}
      {selectedPatient && selectedPatient.isRegistered && selectedPatient.accessLevel !== 'verified_consented' && !p3Upgraded && (
        <div className="bg-white rounded-[12px] border border-[#BFDBFE] p-3">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 w-5 h-5 rounded-full bg-[#3B82F6] flex-shrink-0 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-cairo font-semibold text-[13px] text-[#1E40AF]">المريض لديه ملف في MedAssist — اطلب الكود</p>
              <p className="font-cairo text-[12px] text-[#3B82F6] mt-0.5">
                الربط يتيح لك التاريخ الطبي الكامل، أو تابع بدونه
              </p>
              {!p3ShowInput && (
                <button
                  type="button"
                  onClick={() => setP3ShowInput(true)}
                  className="mt-2 px-3 py-1.5 bg-[#3B82F6] text-white text-[12px] font-cairo font-semibold rounded-[8px] hover:bg-[#2563EB] transition-colors"
                >
                  أدخل الكود
                </button>
              )}
            </div>
          </div>
          {p3ShowInput && (
            <div className="mt-3 pt-3 border-t border-[#BFDBFE]">
              <div className="flex gap-2" dir="ltr">
                <input
                  type="text"
                  value={p3Code}
                  onChange={(e) => { setP3Code(e.target.value.toUpperCase()); setP3Error('') }}
                  onKeyDown={(e) => e.key === 'Enter' && upgradeRelationship()}
                  placeholder="مثال: AB12CD"
                  maxLength={12}
                  className="flex-1 px-3 py-2 border border-[#BFDBFE] rounded-[8px] text-[14px] font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6] tracking-widest text-center uppercase"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={upgradeRelationship}
                  disabled={!p3Code.trim() || p3Verifying}
                  className="px-3 py-2 bg-[#3B82F6] text-white text-[12px] font-cairo font-semibold rounded-[8px] hover:bg-[#2563EB] disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {p3Verifying ? (
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : 'ربط'}
                </button>
              </div>
              {p3Error && (
                <p className="mt-1.5 font-cairo text-[12px] text-[#DC2626]">❌ {p3Error}</p>
              )}
            </div>
          )}
        </div>
      )}
      {(p3Upgraded || selectedPatient?.accessLevel === 'verified_consented') && selectedPatient && (
        <div className="bg-white rounded-[12px] border border-[#BBF7D0] p-3 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#22C55E] flex-shrink-0 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="font-cairo font-semibold text-[13px] text-[#16A34A]">ملف موثّق ✓ — تم ربط التاريخ الطبي الكامل</p>
        </div>
      )}

      {/* ===== CHIEF COMPLAINT — collapsible when done ===== */}
      <div className={`bg-white rounded-[12px] border transition-all duration-300 overflow-hidden ${
        complaintCollapsed
          ? 'border-[#BBF7D0]'
          : activeSection === 'complaint'
          ? 'border-[#22C55E] shadow-[0_0_0_3px_rgba(34,197,94,0.1)]'
          : 'border-[#E5E7EB]'
      }`}>
        <button
          type="button"
          onClick={() => chiefComplaint && setComplaintCollapsed(p => !p)}
          className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
            complaintCollapsed
              ? 'bg-[#F0FDF4] border-b border-[#BBF7D0] cursor-pointer hover:bg-[#DCFCE7]'
              : 'bg-[#F9FAFB] border-b border-[#E5E7EB] cursor-default'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-[6px] flex items-center justify-center flex-shrink-0 ${
              complaintCollapsed ? 'bg-[#DCFCE7]' : 'bg-[#FEF3C7]'
            }`}>
              <svg className={`w-3.5 h-3.5 ${complaintCollapsed ? 'text-[#16A34A]' : 'text-[#D97706]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </span>
            <h3 className="font-cairo font-bold text-[14px] text-[#030712]">الشكوى الرئيسية</h3>
            <span className="text-red-500 text-[13px] font-bold" title="مطلوب">*</span>
            {complaintCollapsed && chiefComplaint && (
              <span className="font-cairo text-[12px] text-[#16A34A] truncate max-w-[200px]">{chiefComplaint}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {complaintCollapsed ? (
              <span className="font-cairo text-[11px] text-[#16A34A] font-medium">✓ مكتمل · اضغط للتعديل</span>
            ) : (
              <span className="font-cairo text-[11px] font-medium text-red-400">مطلوب</span>
            )}
          </div>
        </button>
        <div style={{
          maxHeight: complaintCollapsed ? '0px' : '700px',
          overflow: 'hidden',
          transition: 'max-height 280ms cubic-bezier(0.4,0,0.2,1)'
        }}>
        <div className="p-4 space-y-3">
          {/* Quick complaint chips — ordered by this doctor's usage frequency */}
          <div className="flex flex-wrap gap-1.5">
            {complaintChips.map((chip) => {
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
          {/* Selected complaints preview */}
          {chiefComplaint && (
            <div className="px-1 py-0.5 text-[12px] font-cairo text-[#4B5563] bg-[#F9FAFB] rounded-[8px] px-3 py-2 leading-relaxed">
              <span className="text-[#9CA3AF] text-[11px]">الشكوى: </span>{chiefComplaint}
            </div>
          )}
          {/* Custom complaint input — appends to chips on Enter */}
          <div className="flex gap-2">
            <input
              type="text"
              value={complaintCustom}
              onChange={(e) => setComplaintCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && complaintCustom.trim()) {
                  e.preventDefault()
                  setChiefComplaint(prev => prev ? `${prev}، ${complaintCustom.trim()}` : complaintCustom.trim())
                  setComplaintCustom('')
                }
              }}
              placeholder="أضف شكوى مخصصة... (Enter للإضافة)"
              className="flex-1 px-3 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[13px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E] focus:border-transparent bg-white"
            />
            {complaintCustom.trim() && (
              <button
                type="button"
                onClick={() => {
                  setChiefComplaint(prev => prev ? `${prev}، ${complaintCustom.trim()}` : complaintCustom.trim())
                  setComplaintCustom('')
                }}
                className="px-3 py-2 bg-[#22C55E] text-white text-[12px] font-cairo font-semibold rounded-[10px] hover:bg-[#16A34A] transition-colors whitespace-nowrap"
              >
                + إضافة
              </button>
            )}
          </div>
        </div>
        </div>{/* end animation wrapper */}
      </div>

      {/* FIX 9: Pending labs from last visit banner */}
      {pendingLabsFromLastVisit.length > 0 && (
        <div className="mx-4 mb-3 px-3 py-2.5 bg-[#FFFBEB] border border-[#F59E0B] rounded-xl">
          <p className="font-cairo text-[12px] font-semibold text-[#92400E]">
            🧪 تحاليل مطلوبة من آخر زيارة:
          </p>
          <p className="font-cairo text-[12px] text-[#B45309] mt-0.5">
            {pendingLabsFromLastVisit.join('، ')}
          </p>
        </div>
      )}

      {/* ===== DIAGNOSIS — ICD-10 + Complaint-based suggestions ===== */}
      {/* onFocusCapture: when doctor starts interacting with diagnosis, auto-collapse filled complaint */}
      <div
        ref={diagnosisSectionRef}
        onFocusCapture={() => {
          if (chiefComplaint.trim() && !complaintCollapsed) {
            setComplaintCollapsed(true)
            setTimeout(() => {
              diagnosisSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }, 200)
          }
        }}
        className={`bg-white rounded-[12px] border transition-all duration-300 overflow-hidden ${
        diagnosisCollapsed
          ? 'border-[#BBF7D0]'
          : activeSection === 'diagnosis'
          ? 'border-[#22C55E] shadow-[0_0_0_3px_rgba(34,197,94,0.1)]'
          : 'border-[#E5E7EB]'
      }`}>
        {/* Header — clickable to expand/collapse when complete */}
        <button
          type="button"
          onClick={() => diagnosis.length > 0 && setDiagnosisCollapsed(p => !p)}
          className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
            diagnosisCollapsed
              ? 'bg-[#F0FDF4] border-b border-[#BBF7D0] cursor-pointer hover:bg-[#DCFCE7]'
              : 'bg-[#F9FAFB] border-b border-[#E5E7EB] cursor-default'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-[6px] flex items-center justify-center flex-shrink-0 ${
              diagnosisCollapsed ? 'bg-[#DCFCE7]' : 'bg-[#DBEAFE]'
            }`}>
              <svg className={`w-3.5 h-3.5 ${diagnosisCollapsed ? 'text-[#16A34A]' : 'text-[#2563EB]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <h3 className="font-cairo font-bold text-[14px] text-[#030712]">التشخيص</h3>
            {diagnosis.length > 0 && (
              <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#16A34A] rounded-full text-[11px] font-cairo font-semibold">
                {diagnosis.length}
              </span>
            )}
            {/* Compact summary shown in header when collapsed */}
            {diagnosisCollapsed && diagnosis[0] && (
              <span className="font-cairo text-[12px] text-[#16A34A] truncate max-w-[200px]">
                {diagnosis[0]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {diagnosisCollapsed ? (
              <span className="font-cairo text-[11px] text-[#16A34A] font-medium">✓ مكتمل · اضغط للتعديل</span>
            ) : (
              <span className="font-cairo text-[11px] text-[#9CA3AF]">اختياري</span>
            )}
          </div>
        </button>

        {/* Body — animated slide */}
        <div style={{
          maxHeight: diagnosisCollapsed ? '0px' : '700px',
          overflow: 'hidden',
          transition: 'max-height 280ms cubic-bezier(0.4,0,0.2,1)'
        }}>
          <div className="p-4">
            <DiagnosisInput
              value={diagnosis}
              onChange={setDiagnosis}
              chiefComplaints={chiefComplaint ? chiefComplaint.split(/[،,]/).map(s => s.trim()).filter(Boolean) : []}
              presetDiagnoses={diagnosisChips}
              personalised={chipsPersonalised}
            />
          </div>
        </div>
      </div>

      {/* ===== PRESCRIPTION — MEDICATIONS (controlled, smart-collapse) ===== */}
      <div
        ref={prescriptionSectionRef}
        onFocusCapture={() => {
          // When doctor touches medications: collapse filled sections above
          if (chiefComplaint.trim() && !complaintCollapsed) setComplaintCollapsed(true)
          if (diagnosis.length > 0 && !diagnosisCollapsed) setDiagnosisCollapsed(true)
          // Ensure medications is open
          if (medicationsCollapsed) setMedicationsCollapsed(false)
        }}
        className={`bg-white rounded-[12px] border transition-all duration-300 overflow-hidden ${
          medicationsCollapsed
            ? 'border-[#BBF7D0]'
            : activeSection === 'medications'
            ? 'border-[#22C55E] shadow-[0_0_0_3px_rgba(34,197,94,0.1)]'
            : 'border-[#E5E7EB]'
        }`}
      >
        {/* Header — click to toggle when medications filled */}
        <button
          type="button"
          onClick={() => medications.length > 0 && setMedicationsCollapsed(p => !p)}
          className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
            medicationsCollapsed
              ? 'bg-[#F0FDF4] border-b border-[#BBF7D0] cursor-pointer hover:bg-[#DCFCE7]'
              : 'bg-[#F9FAFB] border-b border-[#E5E7EB] cursor-default'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-[6px] flex items-center justify-center flex-shrink-0 ${
              medicationsCollapsed ? 'bg-[#DCFCE7]' : 'bg-[#FCE7F3]'
            }`}>
              <svg className={`w-3.5 h-3.5 ${medicationsCollapsed ? 'text-[#16A34A]' : 'text-[#EC4899]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </span>
            <h3 className="font-cairo font-bold text-[14px] text-[#030712]">الروشتة</h3>
            {medications.length > 0 && (
              <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#16A34A] rounded-full text-[11px] font-cairo font-semibold">
                {medications.length}
              </span>
            )}
            {medicationsCollapsed && medications[0] && (
              <span className="font-cairo text-[12px] text-[#16A34A] truncate max-w-[180px]">{(medications[0] as any).name}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {medicationsCollapsed ? (
              <span className="font-cairo text-[11px] text-[#16A34A] font-medium">✓ مكتمل · اضغط للتعديل</span>
            ) : (
              <span className="font-cairo text-[11px] text-[#9CA3AF]">اختياري</span>
            )}
          </div>
        </button>

        {/* Body — animated slide */}
        <div style={{
          maxHeight: medicationsCollapsed ? '0px' : '2000px',
          overflow: 'hidden',
          transition: 'max-height 280ms cubic-bezier(0.4,0,0.2,1)'
        }}>
          <div className="p-4 space-y-3">
            <MedicationChips
              medications={medications}
              onChange={handleMedicationsChange}
              allergies={allergies}
              onAllergyWarning={handleAllergyWarningCheck}
              onOpenTemplates={() => setShowTemplateModal(true)}
              quickMeds={medicationChips}
              personalised={chipsPersonalised}
            />
            {/* "Done with medications" CTA — collapses section & scrolls to labs/follow-up */}
            {medications.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMedicationsCollapsed(true)
                  setTimeout(() => {
                    additionalSectionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }, 300)
                }}
                className="w-full py-2.5 bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A] rounded-[10px] font-cairo font-bold text-[13px] hover:bg-[#DCFCE7] transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                تم الروشتة — انتهيت من الأدوية
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===== ADDITIONAL SECTIONS — scroll target after "Done with medications" ===== */}
      <div ref={additionalSectionsRef} className="space-y-4">

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
      <CollapsibleSection
        title="ملاحظات الطبيب"
        icon="notes"
        badge={doctorNotes.trim() ? '✓' : undefined}
        defaultOpen={false}
      >
        <textarea
          value={doctorNotes}
          onChange={(e) => setDoctorNotes(e.target.value)}
          rows={3}
          placeholder="أكتب ملاحظاتك هنا..."
          className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[13px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E] resize-none bg-white mt-2"
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
      </CollapsibleSection>

      {/* ===== FOLLOW-UP ===== */}
      <CollapsibleSection
        title="المتابعة"
        icon="calendar"
        badge={followUpDate ? followUpDate : undefined}
        defaultOpen={false}
      >
        <div className="space-y-3 mt-2">
          {/* Quick date chips first for speed */}
          <div className="flex flex-wrap gap-2">
            {followUpChips.map((chip) => (
              <button
                key={chip.label}
                onClick={() => setFollowUpFromChip(chip.days)}
                className={`px-3 py-1.5 font-cairo text-[12px] font-medium rounded-full border transition-colors bg-white ${
                  followUpDate === (() => { const d = new Date(); d.setDate(d.getDate() + chip.days); return d.toISOString().split('T')[0] })()
                    ? 'border-[#16A34A] text-[#16A34A] bg-[#F0FDF4]'
                    : 'border-[#E5E7EB] text-[#4B5563] hover:border-[#16A34A] hover:text-[#16A34A]'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Exact date picker */}
          <div>
            <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5">أو اختر تاريخاً محدداً</label>
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[13px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E] bg-white"
              dir="ltr"
            />
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
      </CollapsibleSection>

      </div>{/* end additionalSectionsRef wrapper */}

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
          currentMedications={medications.length > 0 ? medications : undefined}
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
