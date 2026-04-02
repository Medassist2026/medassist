'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import PrescriptionPrint from '@shared/components/clinical/PrescriptionPrint'
import { ar } from '@shared/lib/i18n/ar'
import { FileText, ChevronLeft } from 'lucide-react'
import { DEFAULT_TEMPLATES, type PrescriptionTemplate } from '@shared/components/clinical/TemplateModal'
import { MedicationChips, type MedicationEntry } from '@shared/components/clinical/MedicationChips'

// ============================================================================
// TYPES
// ============================================================================

interface PrescriptionData {
  clinicName?: string
  clinicPhone?: string
  clinicAddress?: string
  doctorName: string
  doctorSpecialty: string
  doctorLicense?: string
  patientName: string
  patientAge?: number
  patientSex?: string
  patientPhone?: string
  prescriptionNumber: string
  prescriptionDate: string
  medications: any[]
  diagnosis?: string
  radiology?: any[]
  labs?: any[]
  doctorNotes?: string
  showNotesInPrint?: boolean
  followUpDate?: string
}

interface RxListItem {
  id: string
  patient_name: string
  patient_age?: number
  diagnosis: string
  medications_count: number
  created_at: string
  chief_complaint?: string
}

interface CustomTemplate {
  id: string
  name: string
  medications: PrescriptionTemplate['medications']
  usage_count?: number
}

// ============================================================================
// HIDDEN DEFAULTS — stored in localStorage (per device)
// ============================================================================

const HIDDEN_DEFAULTS_KEY = 'medassist_hidden_defaults'
function readHiddenIds(): string[] {
  try { return JSON.parse(localStorage.getItem(HIDDEN_DEFAULTS_KEY) || '[]') } catch { return [] }
}
function writeHiddenIds(ids: string[]) {
  try { localStorage.setItem(HIDDEN_DEFAULTS_KEY, JSON.stringify(ids)) } catch { /* ignore */ }
}

// ============================================================================
// SMALL ATOMS
// ============================================================================

function MedChipRow({ meds }: { meds: PrescriptionTemplate['medications'] }) {
  const visible = meds.slice(0, 3)
  const rest    = meds.length - visible.length
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {visible.map((m, i) => (
        <span key={i} className="px-2 py-0.5 bg-[#F3F4F6] text-[#4B5563] rounded-full font-cairo text-[11px]">
          {m.name}
        </span>
      ))}
      {rest > 0 && (
        <span className="px-2 py-0.5 bg-[#F3F4F6] text-[#9CA3AF] rounded-full font-cairo text-[11px]">
          +{rest}
        </span>
      )}
    </div>
  )
}

// ============================================================================
// CREATE TEMPLATE DRAWER
// ============================================================================

function CreateTemplateDrawer({
  onSave,
  onClose,
}: {
  onSave: (name: string, meds: MedicationEntry[]) => Promise<void>
  onClose: () => void
}) {
  const [name, setName]     = useState('')
  const [meds, setMeds]     = useState<MedicationEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const handleSave = async () => {
    const validMeds = meds.filter(m => m.name.trim())
    if (!name.trim())          { setError('أدخل اسم القالب'); return }
    if (validMeds.length === 0){ setError('أضف دواء واحد على الأقل'); return }
    setSaving(true)
    setError('')
    try {
      await onSave(name.trim(), validMeds)
      onClose()
    } catch (e: any) {
      setError(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 max-h-[92vh] bg-white rounded-t-[20px] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#E5E7EB]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E5E7EB] flex-shrink-0">
          <h3 className="font-cairo font-bold text-[16px] text-[#030712]">قالب جديد</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center">
            <svg className="w-4 h-4 text-[#4B5563]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Template name */}
          <div>
            <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5">اسم القالب</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="مثال: نزلة برد، ضغط، سكر..."
              className="w-full px-4 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[14px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E]"
              autoFocus
            />
          </div>

          {/* Medications — same component & data source as clinical session */}
          <div>
            <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-2">الأدوية</label>
            <MedicationChips
              medications={meds}
              onChange={setMeds}
            />
          </div>

          {error && (
            <p className="text-[12px] font-cairo text-[#DC2626]">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#E5E7EB] flex-shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-[#16A34A] text-white rounded-xl font-cairo font-bold text-[14px] hover:bg-[#15803d] disabled:opacity-50 transition-colors"
          >
            {saving ? 'جاري الحفظ...' : 'حفظ القالب'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// EDIT TEMPLATE DRAWER  — name + medications
// ============================================================================

function EditTemplateDrawer({
  template,
  onSave,
  onClose,
}: {
  template: CustomTemplate
  onSave: (id: string, name: string, meds: MedicationEntry[]) => Promise<void>
  onClose: () => void
}) {
  const [name, setName]     = useState(template.name)
  const [meds, setMeds]     = useState<MedicationEntry[]>(template.medications as MedicationEntry[])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const handleSave = async () => {
    const validMeds = meds.filter(m => m.name.trim())
    if (!name.trim())          { setError('أدخل اسم القالب'); return }
    if (validMeds.length === 0){ setError('أضف دواء واحد على الأقل'); return }
    setSaving(true)
    setError('')
    try {
      await onSave(template.id, name.trim(), validMeds)
      onClose()
    } catch (e: any) {
      setError(e?.message || 'فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 max-h-[92vh] bg-white rounded-t-[20px] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#E5E7EB]" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E5E7EB] flex-shrink-0">
          <h3 className="font-cairo font-bold text-[16px] text-[#030712]">تعديل القالب</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center">
            <svg className="w-4 h-4 text-[#4B5563]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div>
            <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-1.5">اسم القالب</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[14px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E]"
              autoFocus
            />
          </div>

          <div>
            <label className="block font-cairo text-[12px] font-semibold text-[#4B5563] mb-2">الأدوية</label>
            <MedicationChips medications={meds} onChange={setMeds} />
          </div>

          {error && <p className="text-[12px] font-cairo text-[#DC2626]">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-[#E5E7EB] flex-shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-[#16A34A] text-white rounded-xl font-cairo font-bold text-[14px] hover:bg-[#15803d] disabled:opacity-50 transition-colors"
          >
            {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN PAGE CONTENT (wrapped in Suspense below — required for useSearchParams)
// ============================================================================

function PrescriptionPageContent() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const noteId       = searchParams.get('noteId')
  const mode         = searchParams.get('mode')

  const [data, setData]               = useState<PrescriptionData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [prescriptions, setPrescriptions] = useState<RxListItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab]     = useState<'prescriptions' | 'templates'>('prescriptions')

  // Templates state
  const [customTemplates, setCustomTemplates]   = useState<CustomTemplate[]>([])
  const [hiddenDefaults, setHiddenDefaults]     = useState<string[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [showCreateDrawer, setShowCreateDrawer] = useState(false)
  const [editingTemplate, setEditingTemplate]   = useState<CustomTemplate | null>(null)
  const [templateSearch, setTemplateSearch]     = useState('')
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null)

  // ── Load functions ──────────────────────────────────────────────────────

  const loadPrescriptionsList = useCallback(async () => {
    try {
      const res = await fetch('/api/doctor/prescriptions')
      const result = await res.json()
      if (result.success) setPrescriptions(result.prescriptions || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  const loadFromApi = useCallback(async () => {
    try {
      const res    = await fetch(`/api/clinical/prescription?noteId=${noteId}`)
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'فشل في تحميل الروشتة')
      const note = result.note
      setData({
        doctorName: note.doctor?.full_name || 'طبيب',
        doctorSpecialty: note.doctor?.specialty || '',
        doctorLicense: note.doctor?.license_number,
        patientName: note.patient?.full_name || 'مريض',
        patientAge: note.patient?.age,
        patientSex: note.patient?.sex,
        prescriptionNumber: note.prescription_number || generateRefNumber(),
        prescriptionDate: note.prescription_date || new Date().toISOString().split('T')[0],
        medications: note.medications || [],
        diagnosis: note.diagnosis,
        radiology: note.radiology,
        labs: note.labs,
        doctorNotes: note.doctor_notes,
        showNotesInPrint: note.show_notes_in_print,
        followUpDate: note.follow_up_date,
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [noteId])

  const loadFromSession = useCallback(async () => {
    try {
      const stored = sessionStorage.getItem('printOnlyData')
      if (!stored) { setError('لا توجد بيانات للطباعة'); setLoading(false); return }
      const parsed = JSON.parse(stored)
      sessionStorage.removeItem('printOnlyData')
      let doctorName = 'طبيب', doctorSpecialty = ''
      try {
        const pr = await fetch('/api/doctor/profile')
        if (pr.ok) { const p = await pr.json(); doctorName = p.full_name || doctorName; doctorSpecialty = p.specialty || '' }
      } catch { /* ignore */ }
      const medications = Array.isArray(parsed.medications)
        ? parsed.medications.map((m: any) => ({ ...m, type: m.type || m.form || 'أقراص' }))
        : []
      setData({
        doctorName, doctorSpecialty,
        patientName: parsed.patient?.name || 'مريض',
        patientAge: parsed.patient?.age,
        patientSex: parsed.patient?.sex,
        patientPhone: parsed.patient?.phone,
        prescriptionNumber: generateRefNumber(),
        prescriptionDate: new Date().toISOString().split('T')[0],
        medications,
        diagnosis: Array.isArray(parsed.diagnosis) ? parsed.diagnosis.join(', ') : parsed.diagnosis,
        radiology: parsed.radiology,
        labs: parsed.labs,
        doctorNotes: parsed.doctorNotes,
        showNotesInPrint: !!parsed.doctorNotes,
        followUpDate: parsed.followUpDate,
      })
    } catch {
      setError('خطأ في تحميل بيانات الطباعة')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCustomTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    try {
      const res = await fetch('/api/clinical/templates')
      const result = await res.json()
      setCustomTemplates(result.templates || [])
    } catch { /* ignore */ }
    finally { setTemplatesLoading(false) }
  }, [])

  // ── Effects ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === 'print-only') { loadFromSession() }
    else if (noteId)           { loadFromApi() }
    else                       { loadPrescriptionsList(); setHiddenDefaults(readHiddenIds()) }
  }, [mode, noteId, loadFromApi, loadFromSession, loadPrescriptionsList])

  useEffect(() => {
    if (activeTab === 'templates' && !noteId && mode !== 'print-only') {
      loadCustomTemplates()
    }
  }, [activeTab, noteId, mode, loadCustomTemplates])

  // ── Template CRUD ────────────────────────────────────────────────────────

  const handleCreateTemplate = async (
    name: string,
    meds: MedicationEntry[]
  ) => {
    const res = await fetch('/api/clinical/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, medications: meds }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'فشل إنشاء القالب')
    }
    await loadCustomTemplates()
  }

  const handleDeleteTemplate = async (id: string) => {
    setCustomTemplates(p => p.filter(t => t.id !== id))
    await fetch(`/api/clinical/templates?id=${id}`, { method: 'DELETE' })
  }

  const handleRenameTemplate = async (id: string, name: string) => {
    await fetch(`/api/clinical/templates?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setCustomTemplates(p => p.map(t => t.id === id ? { ...t, name } : t))
  }

  const handleUpdateTemplate = async (id: string, name: string, meds: MedicationEntry[]) => {
    const res = await fetch(`/api/clinical/templates?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, medications: meds }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'فشل التحديث')
    }
    setCustomTemplates(p => p.map(t => t.id === id ? { ...t, name, medications: meds } : t))
  }

  const toggleHideDefault = (id: string) => {
    const next = hiddenDefaults.includes(id)
      ? hiddenDefaults.filter(h => h !== id)
      : [...hiddenDefaults, id]
    setHiddenDefaults(next)
    writeHiddenIds(next)
  }

  // ── Print tracking ───────────────────────────────────────────────────────

  const handlePrint = async () => {
    if (noteId && mode !== 'print-only') {
      try {
        await fetch('/api/clinical/prescription/mark-printed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ noteId }),
        })
      } catch { /* ignore */ }
    }
  }

  // ── Filtered prescriptions ───────────────────────────────────────────────

  const filteredPrescriptions = prescriptions.filter(rx => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      rx.patient_name?.toLowerCase().includes(q) ||
      rx.diagnosis?.toLowerCase().includes(q) ||
      rx.chief_complaint?.toLowerCase().includes(q)
    )
  })

  const filteredDefaults = DEFAULT_TEMPLATES.filter(t =>
    !templateSearch || t.name.includes(templateSearch)
  )

  const filteredCustom = customTemplates.filter(t =>
    !templateSearch || t.name.includes(templateSearch)
  )

  // ── Render: loading ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" dir="rtl">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-[#16A34A] border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-gray-500">{ar.loading}</p>
        </div>
      </div>
    )
  }

  // ── Render: error ────────────────────────────────────────────────────────

  if (error) {
    const isNoSession = error === 'لا يوجد معرف للجلسة'
    if (isNoSession) {
      return (
        <div className="flex items-center justify-center min-h-[60vh] px-4" dir="rtl">
          <div className="text-center max-w-sm w-full">
            <div className="w-16 h-16 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-[#16A34A]" strokeWidth={1.5} />
            </div>
            <h2 className="font-cairo text-[18px] font-bold text-[#030712] mb-2">الوصفات الطبية</h2>
            <p className="font-cairo text-[14px] text-[#6B7280] mb-6 leading-relaxed">
              يتم إنشاء الوصفات أثناء جلسة الكشف. ابدأ جلسة مع مريض لإصدار وصفة طبية.
            </p>
            <button
              onClick={() => router.push('/doctor/session')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#16A34A] text-white rounded-xl text-[14px] font-cairo font-medium hover:bg-[#15803D] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              ابدأ جلسة جديدة
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="max-w-md mx-auto p-6" dir="rtl">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <h2 className="text-lg font-bold text-red-900 mb-2">خطأ</h2>
          <p className="text-sm text-red-700 mb-4">{error}</p>
          <button onClick={() => window.history.back()} className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700">
            {ar.goBack}
          </button>
        </div>
      </div>
    )
  }

  // ── Render: print view (noteId or print-only) ────────────────────────────

  if (data) {
    return (
      <div className="max-w-md mx-auto py-4">
        <PrescriptionPrint
          clinicName={data.clinicName}
          clinicPhone={data.clinicPhone}
          clinicAddress={data.clinicAddress}
          doctorName={data.doctorName}
          doctorLicense={data.doctorLicense}
          doctorSpecialty={data.doctorSpecialty}
          patientName={data.patientName}
          patientAge={data.patientAge}
          patientSex={data.patientSex}
          patientPhone={data.patientPhone}
          prescriptionNumber={data.prescriptionNumber}
          prescriptionDate={data.prescriptionDate}
          medications={data.medications}
          diagnosis={data.diagnosis}
          radiology={data.radiology}
          labs={data.labs}
          doctorNotes={data.doctorNotes}
          showNotesInPrint={data.showNotesInPrint}
          followUpDate={data.followUpDate}
          onPrint={handlePrint}
        />
      </div>
    )
  }

  // ── Render: hub (no noteId) ──────────────────────────────────────────────

  return (
    <div className="max-w-md mx-auto px-4 py-4" dir="rtl">

      {/* ── Page title ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-cairo text-[22px] font-bold text-[#030712]">الوصفات الطبية</h1>
          <p className="font-cairo text-[13px] text-[#6B7280]">الوصفات السابقة والقوالب</p>
        </div>
        <button
          onClick={() => router.push('/doctor/session')}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#16A34A] text-white rounded-xl font-cairo font-bold text-[13px] hover:bg-[#15803d] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          جلسة جديدة
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex bg-[#F3F4F6] rounded-xl p-1 mb-4">
        {(['prescriptions', 'templates'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-[10px] font-cairo font-semibold text-[13px] transition-colors ${
              activeTab === tab
                ? 'bg-white text-[#030712] shadow-sm'
                : 'text-[#6B7280] hover:text-[#030712]'
            }`}
          >
            {tab === 'prescriptions' ? 'الوصفات' : 'القوالب'}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* PRESCRIPTIONS TAB                                                 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'prescriptions' && (
        <div className="space-y-3">
          {/* Search bar */}
          <div className="relative">
            <svg
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="بحث باسم المريض أو التشخيص..."
              className="w-full pr-10 pl-4 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[14px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E] bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#4B5563]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Prescription list */}
          {filteredPrescriptions.length === 0 ? (
            <div className="py-12 text-center">
              {searchQuery ? (
                <p className="font-cairo text-[14px] text-[#6B7280]">لا توجد نتائج لـ "{searchQuery}"</p>
              ) : (
                <p className="font-cairo text-[14px] text-[#6B7280]">لا توجد وصفات بعد</p>
              )}
            </div>
          ) : (
            filteredPrescriptions.map(rx => (
              <button
                key={rx.id}
                onClick={() => router.push(`?noteId=${rx.id}`)}
                className="w-full text-right px-4 py-3.5 bg-white border border-[#E5E7EB] rounded-xl hover:border-[#16A34A] hover:bg-[#F0FDF4] transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-cairo text-[#9CA3AF]">
                    {new Date(rx.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                  {rx.medications_count > 0 && (
                    <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#16A34A] font-cairo font-semibold rounded-full text-[11px]">
                      {rx.medications_count} أدوية
                    </span>
                  )}
                </div>
                <div className="font-cairo font-bold text-[14px] text-[#030712]">{rx.patient_name}</div>
                <div className="font-cairo text-[12px] text-[#6B7280] mt-0.5 truncate">{rx.diagnosis}</div>
              </button>
            ))
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TEMPLATES TAB                                                      */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'templates' && (
        <div className="space-y-4">

          {/* Template search + create */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={templateSearch}
                onChange={e => setTemplateSearch(e.target.value)}
                placeholder="بحث في القوالب..."
                className="w-full pr-10 pl-4 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[14px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E] bg-white"
              />
            </div>
            <button
              onClick={() => setShowCreateDrawer(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-[#16A34A] text-white rounded-[10px] font-cairo font-bold text-[13px] hover:bg-[#15803d] transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              قالب جديد
            </button>
          </div>

          {/* ── Custom templates ── */}
          {templatesLoading ? (
            <div className="py-6 text-center">
              <div className="animate-spin w-6 h-6 border-2 border-[#16A34A] border-t-transparent rounded-full mx-auto" />
            </div>
          ) : filteredCustom.length > 0 ? (
            <div>
              <p className="font-cairo text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">قوالبي</p>
              <div className="space-y-2">
                {filteredCustom.map(tpl => (
                  <div
                    key={tpl.id}
                    className="bg-white border border-[#E5E7EB] rounded-xl px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-cairo font-bold text-[14px] text-[#030712]">{tpl.name}</span>
                      <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                        {deletingTemplateId === tpl.id ? (
                          <>
                            <button
                              onClick={() => { handleDeleteTemplate(tpl.id); setDeletingTemplateId(null) }}
                              className="px-2 py-0.5 bg-[#DC2626] text-white rounded-[6px] font-cairo text-[12px] font-semibold"
                            >
                              حذف
                            </button>
                            <button
                              onClick={() => setDeletingTemplateId(null)}
                              className="px-2 py-0.5 border border-[#E5E7EB] text-[#6B7280] rounded-[6px] font-cairo text-[12px]"
                            >
                              إلغاء
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditingTemplate(tpl)}
                              className="text-[#9CA3AF] hover:text-[#16A34A] transition-colors"
                              title="تعديل"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setDeletingTemplateId(tpl.id)}
                              className="text-[#9CA3AF] hover:text-[#DC2626] transition-colors"
                              title="حذف"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <MedChipRow meds={tpl.medications} />
                    {tpl.usage_count != null && tpl.usage_count > 0 && (
                      <p className="font-cairo text-[10px] text-[#9CA3AF] mt-1.5">
                        استُخدم {tpl.usage_count} مرة
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : !templateSearch ? (
            <div className="border-2 border-dashed border-[#E5E7EB] rounded-xl py-6 text-center">
              <p className="font-cairo text-[13px] text-[#9CA3AF] mb-3">لا توجد قوالب مخصصة بعد</p>
              <button
                onClick={() => setShowCreateDrawer(true)}
                className="font-cairo text-[13px] font-semibold text-[#16A34A] hover:text-[#15803d]"
              >
                + أنشئ أول قالب
              </button>
            </div>
          ) : null}

          {/* ── Default templates ── */}
          {filteredDefaults.length > 0 && (
            <div>
              <p className="font-cairo text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">
                القوالب الافتراضية
                <span className="font-normal normal-case mr-1">(اضغط العين للإخفاء)</span>
              </p>
              <div className="space-y-2">
                {filteredDefaults.map(tpl => {
                  const hidden = hiddenDefaults.includes(tpl.id)
                  return (
                    <div
                      key={tpl.id}
                      className={`bg-white border rounded-xl px-4 py-3 transition-opacity ${
                        hidden ? 'border-[#F3F4F6] opacity-50' : 'border-[#E5E7EB]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-cairo font-bold text-[14px] ${hidden ? 'text-[#9CA3AF]' : 'text-[#030712]'}`}>
                          {tpl.name}
                        </span>
                        <button
                          onClick={() => toggleHideDefault(tpl.id)}
                          className={`flex-shrink-0 transition-colors ${
                            hidden ? 'text-[#9CA3AF] hover:text-[#4B5563]' : 'text-[#4B5563] hover:text-[#DC2626]'
                          }`}
                          title={hidden ? 'إظهار' : 'إخفاء'}
                        >
                          {hidden ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                      {!hidden && <MedChipRow meds={tpl.medications} />}
                      {hidden && (
                        <p className="font-cairo text-[11px] text-[#9CA3AF] mt-1">مخفي من القائمة في الجلسة</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Create template drawer ── */}
      {showCreateDrawer && (
        <CreateTemplateDrawer
          onSave={handleCreateTemplate}
          onClose={() => setShowCreateDrawer(false)}
        />
      )}

      {/* ── Edit template drawer ── */}
      {editingTemplate && (
        <EditTemplateDrawer
          template={editingTemplate}
          onSave={handleUpdateTemplate}
          onClose={() => setEditingTemplate(null)}
        />
      )}
    </div>
  )
}

export default function PrescriptionPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen" dir="rtl">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-[#16A34A] border-t-transparent rounded-full mx-auto mb-3" />
          <p className="font-cairo text-sm text-gray-500">{ar.loading}</p>
        </div>
      </div>
    }>
      <PrescriptionPageContent />
    </Suspense>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateRefNumber(): string {
  const year = new Date().getFullYear().toString().slice(-2)
  const seq  = Math.floor(1000 + Math.random() * 9000).toString()
  return `MED-${year}-${seq}`
}
