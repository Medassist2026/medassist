'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Pill,
  Plus,
  RefreshCw,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { PatientHeader } from '@ui-clinic/components/patient/PatientHeader'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'

// ============================================================================
// CONSOLIDATED RX PAGE
//
// Phase 3 merge: collapses the previous three patient pages
//   - /patient/prescriptions (read-only visits list)
//   - /patient/medications    (manual add/edit/delete + pending reminders)
//   - /patient/medication-intake (stub)
// into ONE unified hub at /patient/prescriptions.
//
// Data sources combined:
//   - /api/patient/medication-reminders  → doctor-issued items (pending/accepted)
//   - /api/patient/medications           → manual, patient-managed
//
// Design tokens match doctor section: Cairo font, #16A34A primary,
// rounded-[12px] cards, border-[0.8px], h-[44px] buttons.
// ============================================================================

type MedStatus = 'pending' | 'active' | 'stopped' | 'declined'
type MedSource = 'doctor' | 'manual'

interface UnifiedMedication {
  id: string
  source: MedSource
  status: MedStatus
  name: string
  dosage?: string
  frequency?: string
  duration?: string
  instructions?: string
  start_date?: string
  end_date?: string
  doctor_name?: string
  created_at: string
}

interface DrugSuggestion {
  id: string
  name: string
  strength?: string
  form?: string
}

type FilterKey = 'all' | 'active' | 'pending' | 'history'

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default function PrescriptionsPage() {
  const [meds, setMeds] = useState<UnifiedMedication[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  // Actions state
  const [showAddForm, setShowAddForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UnifiedMedication | null>(null)
  const [actionError, setActionError] = useState('')

  // ==========================================================================
  // FETCH
  // ==========================================================================

  const loadMedications = useCallback(async () => {
    setLoadError('')
    try {
      const [manualRes, reminderRes] = await Promise.all([
        fetch('/api/patient/medications'),
        fetch('/api/patient/medication-reminders'),
      ])

      if (!manualRes.ok && !reminderRes.ok) {
        throw new Error('failed')
      }

      const unified: UnifiedMedication[] = []

      if (manualRes.ok) {
        const { medications = [] } = await manualRes.json()
        for (const m of medications) {
          unified.push({
            id: m.id,
            source: 'manual',
            status: m.is_active ? 'active' : 'stopped',
            name: m.medication_name,
            dosage: m.dosage,
            frequency: m.frequency,
            instructions: m.notes || m.purpose,
            start_date: m.start_date,
            end_date: m.end_date,
            doctor_name: m.prescriber_name,
            created_at: m.created_at || m.start_date || new Date().toISOString(),
          })
        }
      }

      if (reminderRes.ok) {
        const { medications = [] } = await reminderRes.json()
        for (const r of medications) {
          const drug = r.medication || {}
          unified.push({
            id: r.id,
            source: 'doctor',
            status:
              r.status === 'accepted'
                ? 'active'
                : r.status === 'rejected'
                  ? 'declined'
                  : 'pending',
            name: drug.drug || 'دواء',
            frequency: drug.frequency,
            duration: drug.duration,
            instructions: drug.notes,
            doctor_name: r.clinical_note?.doctors?.full_name,
            created_at: r.created_at,
          })
        }
      }

      unified.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      setMeds(unified)
    } catch {
      setLoadError('فشل تحميل الوصفات، حاول مرة أخرى')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMedications()
  }, [loadMedications])

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  const acceptReminder = async (med: UnifiedMedication) => {
    setActionError('')
    // Optimistic update
    setMeds((prev) =>
      prev.map((m) => (m.id === med.id ? { ...m, status: 'active' } : m))
    )
    try {
      const res = await fetch('/api/medications/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminderId: med.id, status: 'accepted' }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setActionError('فشل قبول الوصفة')
      setMeds((prev) =>
        prev.map((m) => (m.id === med.id ? { ...m, status: 'pending' } : m))
      )
    }
  }

  const declineReminder = async (med: UnifiedMedication) => {
    setActionError('')
    setMeds((prev) =>
      prev.map((m) => (m.id === med.id ? { ...m, status: 'declined' } : m))
    )
    try {
      const res = await fetch('/api/medications/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminderId: med.id, status: 'rejected' }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setActionError('فشل رفض الوصفة')
      setMeds((prev) =>
        prev.map((m) => (m.id === med.id ? { ...m, status: 'pending' } : m))
      )
    }
  }

  const stopManual = async (med: UnifiedMedication) => {
    setActionError('')
    setMeds((prev) =>
      prev.map((m) => (m.id === med.id ? { ...m, status: 'stopped' } : m))
    )
    try {
      const res = await fetch(`/api/patient/medications/${med.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setActionError('فشل إيقاف الدواء')
      setMeds((prev) =>
        prev.map((m) => (m.id === med.id ? { ...m, status: 'active' } : m))
      )
    }
  }

  const deleteManual = async (med: UnifiedMedication) => {
    setActionError('')
    // Optimistic removal
    const backup = meds
    setMeds((prev) => prev.filter((m) => m.id !== med.id))
    setDeleteTarget(null)
    try {
      const res = await fetch(`/api/patient/medications/${med.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
    } catch {
      setActionError('فشل حذف الدواء')
      setMeds(backup)
    }
  }

  const addManual = async (data: {
    medication_name: string
    dosage: string
    frequency: string
    start_date: string
    end_date?: string
    notes?: string
  }) => {
    setIsSubmitting(true)
    setActionError('')
    try {
      const res = await fetch('/api/patient/medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'فشل إضافة الدواء')
      }
      const { medication } = await res.json()
      setMeds((prev) => [
        {
          id: medication.id,
          source: 'manual',
          status: medication.is_active ? 'active' : 'stopped',
          name: medication.medication_name,
          dosage: medication.dosage,
          frequency: medication.frequency,
          instructions: medication.notes,
          start_date: medication.start_date,
          end_date: medication.end_date,
          doctor_name: medication.prescriber_name,
          created_at: medication.created_at || new Date().toISOString(),
        },
        ...prev,
      ])
      setShowAddForm(false)
    } catch (err: any) {
      setActionError(err.message || 'فشل إضافة الدواء')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ==========================================================================
  // DERIVED
  // ==========================================================================

  const filtered = meds.filter((m) => {
    if (filter === 'all') return true
    if (filter === 'active') return m.status === 'active'
    if (filter === 'pending') return m.status === 'pending'
    return m.status === 'stopped' || m.status === 'declined'
  })

  const counts = {
    all: meds.length,
    active: meds.filter((m) => m.status === 'active').length,
    pending: meds.filter((m) => m.status === 'pending').length,
    history: meds.filter((m) => m.status === 'stopped' || m.status === 'declined').length,
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="font-cairo">
      <PatientHeader title="الوصفات والأدوية" />

      <div className="px-4 pt-4 pb-8">
        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto mb-4 -mx-4 px-4 pb-1">
          {(
            [
              { key: 'all', label: 'الكل' },
              { key: 'active', label: 'نشطة' },
              { key: 'pending', label: 'معلقة' },
              { key: 'history', label: 'السجل' },
            ] as { key: FilterKey; label: string }[]
          ).map((tab) => {
            const active = filter === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`flex-shrink-0 h-9 px-4 rounded-full font-cairo text-[13px] font-semibold transition-colors border-[0.8px] ${
                  active
                    ? 'bg-[#16A34A] text-white border-[#16A34A]'
                    : 'bg-white text-[#4B5563] border-[#E5E7EB] hover:bg-[#F9FAFB]'
                }`}
              >
                {tab.label} ({counts[tab.key]})
              </button>
            )
          })}
        </div>

        {/* Add manual medication button */}
        <button
          onClick={() => {
            setShowAddForm(true)
            setActionError('')
          }}
          className="w-full h-[44px] mb-4 flex items-center justify-center gap-2 bg-white border-[0.8px] border-dashed border-[#16A34A] text-[#16A34A] font-cairo text-[14px] font-semibold rounded-[12px] hover:bg-[#F0FDF4] transition-colors"
        >
          <Plus className="w-5 h-5" strokeWidth={2} />
          إضافة دواء يدوياً
        </button>

        {/* Action errors toast */}
        {actionError && (
          <div className="mb-4 p-3 bg-red-50 border-[0.8px] border-red-200 rounded-[12px] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="font-cairo text-[13px] text-red-700 flex-1">{actionError}</p>
            <button onClick={() => setActionError('')} className="text-red-600 hover:text-red-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-[#E5E7EB] rounded-[12px] animate-pulse" />
            ))}
          </div>
        )}

        {/* Error + retry */}
        {!loading && loadError && (
          <div className="text-center py-12 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB]">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <p className="font-cairo text-[14px] text-red-700 mb-3 px-4">{loadError}</p>
            <button
              onClick={() => {
                setLoading(true)
                loadMedications()
              }}
              className="inline-flex items-center gap-2 h-[44px] px-5 bg-[#16A34A] hover:bg-[#15803D] text-white font-cairo text-[14px] font-semibold rounded-[12px] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !loadError && filtered.length === 0 && (
          <div className="text-center py-12 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB]">
            <div className="w-12 h-12 bg-[#F0FDF4] rounded-full flex items-center justify-center mx-auto mb-3">
              <Pill className="w-6 h-6 text-[#16A34A]" strokeWidth={1.8} />
            </div>
            <p className="font-cairo text-[14px] font-semibold text-[#030712] mb-1">
              {filter === 'all'
                ? 'لا توجد أدوية بعد'
                : filter === 'pending'
                  ? 'لا توجد وصفات معلقة'
                  : filter === 'active'
                    ? 'لا توجد أدوية نشطة'
                    : 'لا يوجد سجل'}
            </p>
            <p className="font-cairo text-[12px] text-[#6B7280] px-6">
              {filter === 'all'
                ? 'ستظهر أدويتك هنا بعد وصفها من الطبيب، أو يمكنك إضافة أدوية يدوياً'
                : 'لا توجد عناصر في هذا التبويب'}
            </p>
          </div>
        )}

        {/* Medication list */}
        {!loading && !loadError && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((med) => (
              <MedicationCard
                key={`${med.source}-${med.id}`}
                med={med}
                onAccept={() => acceptReminder(med)}
                onDecline={() => declineReminder(med)}
                onStop={() => stopManual(med)}
                onDelete={() => setDeleteTarget(med)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Form Modal */}
      {showAddForm && (
        <AddManualForm
          isSubmitting={isSubmitting}
          onCancel={() => setShowAddForm(false)}
          onSubmit={addManual}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="حذف الدواء"
        message={
          <div className="font-cairo text-right" dir="rtl">
            <p>
              هل أنت متأكد من حذف <strong>{deleteTarget?.name}</strong>؟
            </p>
            <p className="text-sm text-gray-500 mt-2">لا يمكن التراجع عن هذا الإجراء.</p>
          </div>
        }
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        confirmVariant="danger"
        onConfirm={() => deleteTarget && deleteManual(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

// ============================================================================
// MEDICATION CARD
// ============================================================================

function MedicationCard({
  med,
  onAccept,
  onDecline,
  onStop,
  onDelete,
}: {
  med: UnifiedMedication
  onAccept: () => void
  onDecline: () => void
  onStop: () => void
  onDelete: () => void
}) {
  const statusLabel: Record<MedStatus, string> = {
    pending: 'في انتظار الموافقة',
    active: 'نشط',
    stopped: 'متوقف',
    declined: 'مرفوض',
  }

  const statusStyle: Record<MedStatus, string> = {
    pending: 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]',
    active: 'bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]',
    stopped: 'bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]',
    declined: 'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]',
  }

  return (
    <div className="bg-white border-[0.8px] border-[#E5E7EB] rounded-[12px] p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-11 h-11 rounded-full bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
          <Pill className="w-5 h-5 text-[#16A34A]" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-cairo text-[15px] font-semibold text-[#030712] truncate">
            {med.name}
          </h3>
          {(med.dosage || med.frequency) && (
            <p className="font-cairo text-[12px] text-[#6B7280] truncate">
              {[med.dosage, med.frequency].filter(Boolean).join(' · ')}
            </p>
          )}
          {med.duration && (
            <p className="font-cairo text-[11px] text-[#9CA3AF] mt-0.5">
              المدة: {med.duration}
            </p>
          )}
          {med.doctor_name && (
            <p className="font-cairo text-[11px] text-[#9CA3AF] mt-0.5 flex items-center gap-1">
              <User className="w-3 h-3" />
              د. {med.doctor_name}
            </p>
          )}
        </div>
        <span
          className={`font-cairo text-[10px] font-semibold px-2 py-0.5 rounded-full border-[0.8px] flex-shrink-0 ${statusStyle[med.status]}`}
        >
          {statusLabel[med.status]}
        </span>
      </div>

      {med.instructions && (
        <div className="mb-3 p-2.5 bg-[#FEF3C7] border-[0.8px] border-[#FDE68A] rounded-[8px]">
          <p className="font-cairo text-[12px] text-[#78350F]">
            <span className="font-semibold">تعليمات:</span> {med.instructions}
          </p>
        </div>
      )}

      {/* Actions */}
      {med.status === 'pending' && med.source === 'doctor' && (
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            className="flex-1 h-[40px] flex items-center justify-center gap-1.5 bg-[#16A34A] hover:bg-[#15803D] text-white font-cairo text-[13px] font-semibold rounded-[10px] transition-colors"
          >
            <Check className="w-4 h-4" />
            قبول
          </button>
          <button
            onClick={onDecline}
            className="flex-1 h-[40px] flex items-center justify-center gap-1.5 bg-white border-[0.8px] border-[#E5E7EB] text-[#4B5563] hover:bg-[#F9FAFB] font-cairo text-[13px] font-semibold rounded-[10px] transition-colors"
          >
            <X className="w-4 h-4" />
            رفض
          </button>
        </div>
      )}

      {med.status === 'active' && med.source === 'manual' && (
        <div className="flex gap-2">
          <button
            onClick={onStop}
            className="flex-1 h-[40px] flex items-center justify-center gap-1.5 bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#4B5563] font-cairo text-[13px] font-semibold rounded-[10px] transition-colors"
          >
            إيقاف
          </button>
          <button
            onClick={onDelete}
            className="h-[40px] px-4 flex items-center justify-center gap-1.5 bg-white border-[0.8px] border-red-200 text-red-600 hover:bg-red-50 font-cairo text-[13px] font-semibold rounded-[10px] transition-colors"
            aria-label="حذف"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {(med.status === 'stopped' || med.status === 'declined') && med.source === 'manual' && (
        <button
          onClick={onDelete}
          className="w-full h-[40px] flex items-center justify-center gap-1.5 bg-white border-[0.8px] border-red-200 text-red-600 hover:bg-red-50 font-cairo text-[13px] font-semibold rounded-[10px] transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          حذف
        </button>
      )}
    </div>
  )
}

// ============================================================================
// ADD MANUAL MEDICATION FORM (bottom sheet modal)
// ============================================================================

function AddManualForm({
  onCancel,
  onSubmit,
  isSubmitting,
}: {
  onCancel: () => void
  onSubmit: (data: {
    medication_name: string
    dosage: string
    frequency: string
    start_date: string
    end_date?: string
    notes?: string
  }) => void
  isSubmitting: boolean
}) {
  const [form, setForm] = useState({
    medication_name: '',
    dosage: '',
    frequency: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    notes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [suggestions, setSuggestions] = useState<DrugSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searching, setSearching] = useState(false)

  // Drug autocomplete
  useEffect(() => {
    if (form.medication_name.trim().length < 2) {
      setSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(
          `/api/drugs/search?q=${encodeURIComponent(form.medication_name.trim())}`
        )
        if (res.ok) {
          const data = await res.json()
          const mapped = (data.results || []).map((d: any) => ({
            id: d.id || d.name,
            name: d.name,
            strength: d.strength,
            form: d.form,
          }))
          setSuggestions(mapped)
          setShowSuggestions(true)
        }
      } catch {
        /* silent */
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [form.medication_name])

  const validate = () => {
    const e: Record<string, string> = {}
    if (form.medication_name.trim().length < 2) e.medication_name = 'اسم الدواء مطلوب'
    if (!form.dosage.trim()) e.dosage = 'الجرعة مطلوبة'
    if (!form.frequency.trim()) e.frequency = 'عدد المرات مطلوب'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    onSubmit({
      medication_name: form.medication_name.trim(),
      dosage: form.dosage.trim(),
      frequency: form.frequency.trim(),
      start_date: form.start_date,
      end_date: form.end_date || undefined,
      notes: form.notes.trim() || undefined,
    })
  }

  const frequencyOptions = [
    'مرة يومياً',
    'مرتين يومياً',
    'ثلاث مرات يومياً',
    'أربع مرات يومياً',
    'كل 6 ساعات',
    'كل 8 ساعات',
    'كل 12 ساعة',
    'عند الحاجة',
    'مرة أسبوعياً',
  ]

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-50"
        onClick={onCancel}
        aria-label="إغلاق"
      />
      <div
        dir="rtl"
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[20px] max-h-[90vh] overflow-y-auto animate-slide-in-up"
      >
        <div className="max-w-md mx-auto p-5 pb-8">
          {/* Handle */}
          <div className="w-12 h-1 bg-[#E5E7EB] rounded-full mx-auto mb-4" />

          {/* Title */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-cairo text-[18px] font-bold text-[#030712]">إضافة دواء</h2>
            <button
              onClick={onCancel}
              className="w-9 h-9 rounded-full bg-[#F3F4F6] flex items-center justify-center"
              aria-label="إلغاء"
            >
              <X className="w-5 h-5 text-[#4B5563]" />
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {/* Drug name with autocomplete */}
            <div className="relative">
              <label className="block font-cairo text-[13px] font-semibold text-[#030712] mb-1.5">
                اسم الدواء <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.medication_name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, medication_name: e.target.value }))
                }
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="ابحث عن اسم الدواء..."
                className={`w-full h-[44px] px-4 border-[0.8px] rounded-[10px] font-cairo text-[14px] focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-transparent ${
                  errors.medication_name ? 'border-red-300' : 'border-[#E5E7EB]'
                }`}
              />
              {searching && (
                <div className="absolute left-3 top-[38px]">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#16A34A]" />
                </div>
              )}
              {errors.medication_name && (
                <p className="font-cairo text-[11px] text-red-600 mt-1">
                  {errors.medication_name}
                </p>
              )}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-[74px] right-0 left-0 z-10 bg-white border-[0.8px] border-[#E5E7EB] rounded-[10px] shadow-card max-h-48 overflow-y-auto">
                  {suggestions.slice(0, 8).map((d) => (
                    <button
                      type="button"
                      key={d.id}
                      onClick={() => {
                        setForm((p) => ({
                          ...p,
                          medication_name: d.name,
                          dosage: d.strength || p.dosage,
                        }))
                        setShowSuggestions(false)
                      }}
                      className="w-full text-right px-4 py-2 hover:bg-[#F9FAFB] font-cairo text-[13px] text-[#030712] border-b-[0.8px] border-[#F3F4F6] last:border-0"
                    >
                      <div className="font-semibold">{d.name}</div>
                      {(d.strength || d.form) && (
                        <div className="text-[11px] text-[#6B7280]">
                          {[d.strength, d.form].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dosage */}
            <div>
              <label className="block font-cairo text-[13px] font-semibold text-[#030712] mb-1.5">
                الجرعة <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.dosage}
                onChange={(e) => setForm((p) => ({ ...p, dosage: e.target.value }))}
                placeholder="مثال: 500 ملغ، قرص واحد"
                className={`w-full h-[44px] px-4 border-[0.8px] rounded-[10px] font-cairo text-[14px] focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-transparent ${
                  errors.dosage ? 'border-red-300' : 'border-[#E5E7EB]'
                }`}
              />
              {errors.dosage && (
                <p className="font-cairo text-[11px] text-red-600 mt-1">{errors.dosage}</p>
              )}
            </div>

            {/* Frequency */}
            <div>
              <label className="block font-cairo text-[13px] font-semibold text-[#030712] mb-1.5">
                عدد المرات <span className="text-red-500">*</span>
              </label>
              <select
                value={form.frequency}
                onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value }))}
                className={`w-full h-[44px] px-4 border-[0.8px] rounded-[10px] font-cairo text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-transparent ${
                  errors.frequency ? 'border-red-300' : 'border-[#E5E7EB]'
                }`}
              >
                <option value="">اختر...</option>
                {frequencyOptions.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              {errors.frequency && (
                <p className="font-cairo text-[11px] text-red-600 mt-1">{errors.frequency}</p>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-cairo text-[13px] font-semibold text-[#030712] mb-1.5">
                  تاريخ البدء
                </label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                  className="w-full h-[44px] px-3 border-[0.8px] border-[#E5E7EB] rounded-[10px] font-cairo text-[13px] focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block font-cairo text-[13px] font-semibold text-[#030712] mb-1.5">
                  تاريخ الانتهاء
                </label>
                <input
                  type="date"
                  value={form.end_date}
                  min={form.start_date}
                  onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                  className="w-full h-[44px] px-3 border-[0.8px] border-[#E5E7EB] rounded-[10px] font-cairo text-[13px] focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-transparent"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block font-cairo text-[13px] font-semibold text-[#030712] mb-1.5">
                ملاحظات (اختياري)
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                placeholder="مثال: مع الأكل، تجنب الشمس"
                className="w-full px-4 py-3 border-[0.8px] border-[#E5E7EB] rounded-[10px] font-cairo text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-transparent"
              />
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 h-[44px] bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#4B5563] font-cairo text-[14px] font-semibold rounded-[12px] transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 h-[44px] bg-[#16A34A] hover:bg-[#15803D] text-white font-cairo text-[14px] font-semibold rounded-[12px] disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? 'جاري الإضافة...' : 'إضافة الدواء'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
