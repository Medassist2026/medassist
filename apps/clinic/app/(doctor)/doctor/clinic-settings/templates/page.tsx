'use client'

/**
 * /doctor/clinic-settings/templates
 *
 * Standalone template management — lets the doctor manage all prescription
 * templates outside of a clinical session.
 *
 * Features:
 *  - View, rename, and delete custom templates
 *  - Hide / unhide default (assumed) templates
 *  - Hidden defaults are stored in localStorage (per device — no DB change needed)
 *  - The TemplateModal inside the session reads the same key and filters accordingly
 */

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  DEFAULT_TEMPLATES,
  type PrescriptionTemplate,
} from '@shared/components/clinical/TemplateModal'

const HIDDEN_DEFAULTS_KEY = 'medassist_hidden_defaults'

// ============================================================================
// HELPERS
// ============================================================================

function readHiddenIds(): string[] {
  try { return JSON.parse(localStorage.getItem(HIDDEN_DEFAULTS_KEY) || '[]') } catch { return [] }
}
function writeHiddenIds(ids: string[]) {
  try { localStorage.setItem(HIDDEN_DEFAULTS_KEY, JSON.stringify(ids)) } catch { /* ignore */ }
}

// ============================================================================
// SMALL UI ATOMS
// ============================================================================

function MedChipRow({ meds }: { meds: PrescriptionTemplate['medications'] }) {
  const visible = meds.slice(0, 4)
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
// CUSTOM TEMPLATE CARD
// ============================================================================

function CustomTemplateCard({
  template,
  onDelete,
  onRename,
}: {
  template: PrescriptionTemplate & { usage_count?: number }
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
}) {
  const [editing, setEditing]         = useState(false)
  const [name, setName]               = useState(template.name)
  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const commitRename = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === template.name) { setEditing(false); setName(template.name); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/clinical/templates?id=${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (res.ok) {
        onRename(template.id, trimmed)
        setEditing(false)
      } else {
        setName(template.name)
        setEditing(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await fetch(`/api/clinical/templates?id=${template.id}`, { method: 'DELETE' })
      onDelete(template.id)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-9 h-9 rounded-xl bg-[#DCFCE7] flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-5 h-5 text-[#16A34A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>

        {/* Name + meds */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              ref={inputRef}
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setName(template.name); setEditing(false) } }}
              disabled={saving}
              className="w-full font-cairo font-bold text-[14px] text-[#030712] border-b border-[#22C55E] bg-transparent outline-none pb-0.5"
              dir="rtl"
            />
          ) : (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 group text-right"
              title="اضغط لتغيير الاسم"
            >
              <span className="font-cairo font-bold text-[14px] text-[#030712]">{name}</span>
              <svg className="w-3.5 h-3.5 text-[#9CA3AF] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}

          <p className="font-cairo text-[11px] text-[#9CA3AF] mt-0.5">
            {template.medications.length} أدوية
            {template.usage_count ? ` · استُخدم ${template.usage_count} مرة` : ''}
          </p>

          <MedChipRow meds={template.medications} />
        </div>

        {/* Delete — shows inline confirm on first tap */}
        {confirmDelete ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="h-8 px-2.5 rounded-xl bg-[#EF4444] text-white font-cairo text-[12px] font-semibold hover:bg-[#DC2626] transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {deleting
                ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'حذف'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="h-8 px-2 rounded-xl bg-[#F3F4F6] text-[#6B7280] font-cairo text-[12px] hover:bg-[#E5E7EB] transition-colors disabled:opacity-40"
            >
              إلغاء
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
            className="shrink-0 w-8 h-8 rounded-xl bg-[#FEF2F2] flex items-center justify-center text-[#DC2626] hover:bg-[#FEE2E2] transition-colors disabled:opacity-50"
            title="حذف القالب"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// DEFAULT TEMPLATE CARD
// ============================================================================

function DefaultTemplateCard({
  template,
  hidden,
  onToggle,
}: {
  template: PrescriptionTemplate
  hidden: boolean
  onToggle: (id: string, hide: boolean) => void
}) {
  return (
    <div className={`bg-white rounded-2xl border p-4 transition-opacity ${hidden ? 'border-gray-100 opacity-50' : 'border-gray-100'}`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${hidden ? 'bg-[#F3F4F6]' : 'bg-[#EFF6FF]'}`}>
          <svg className={`w-5 h-5 ${hidden ? 'text-[#9CA3AF]' : 'text-[#3B82F6]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>

        {/* Name + meds */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-cairo font-bold text-[14px] ${hidden ? 'text-[#9CA3AF] line-through' : 'text-[#030712]'}`}>
              {template.name}
            </span>
            {hidden && (
              <span className="text-[10px] px-1.5 py-0.5 bg-[#F3F4F6] text-[#9CA3AF] rounded-full font-cairo">مخفي</span>
            )}
          </div>
          <p className="font-cairo text-[11px] text-[#9CA3AF] mt-0.5">{template.medications.length} أدوية</p>
          {!hidden && <MedChipRow meds={template.medications} />}
        </div>

        {/* Show/Hide toggle */}
        <button
          onClick={() => onToggle(template.id, !hidden)}
          className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
            hidden
              ? 'bg-[#F3F4F6] text-[#9CA3AF] hover:bg-[#E5E7EB]'
              : 'bg-[#EFF6FF] text-[#3B82F6] hover:bg-[#DBEAFE]'
          }`}
          title={hidden ? 'إظهار في الجلسة' : 'إخفاء من الجلسة'}
        >
          {hidden
            ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
          }
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function TemplatesSettingsPage() {
  const [customTemplates, setCustomTemplates] = useState<(PrescriptionTemplate & { usage_count?: number })[]>([])
  const [hiddenIds, setHiddenIds]             = useState<string[]>([])
  const [loading, setLoading]                 = useState(true)

  // Load custom templates + hidden IDs from localStorage
  useEffect(() => {
    setHiddenIds(readHiddenIds())
    fetch('/api/clinical/templates')
      .then(r => r.ok ? r.json() : { templates: [] })
      .then(data => {
        setCustomTemplates(
          (data.templates || []).map((t: any) => ({
            id:          t.id,
            name:        t.name,
            medications: t.medications || [],
            usage_count: t.usage_count || 0,
          }))
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Custom template handlers
  const handleDelete = (id: string) => setCustomTemplates(prev => prev.filter(t => t.id !== id))
  const handleRename = (id: string, name: string) =>
    setCustomTemplates(prev => prev.map(t => t.id === id ? { ...t, name } : t))

  // Default template hide/show
  const handleToggleDefault = (id: string, hide: boolean) => {
    setHiddenIds(prev => {
      const next = hide ? [...new Set([...prev, id])] : prev.filter(x => x !== id)
      writeHiddenIds(next)
      return next
    })
  }

  return (
    <div className="max-w-md mx-auto px-4 py-4 space-y-5 lg:max-w-2xl lg:px-0 lg:py-6" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/doctor/clinic-settings"
          className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="font-cairo font-bold text-[18px] text-[#030712]">قوالب الروشتة</h1>
          <p className="font-cairo text-[12px] text-[#6B7280]">أدر قوالبك المخصصة والافتراضية</p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl px-4 py-3">
        <svg className="w-4 h-4 text-[#3B82F6] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="font-cairo text-[12px] text-[#1E40AF] leading-relaxed">
          لإضافة قالب جديد، افتح جلسة روشتة واحفظ الأدوية كقالب. يمكنك إعادة تسمية أي قالب مخصص بالضغط على اسمه.
        </p>
      </div>

      {/* ── Custom Templates ──────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-cairo font-bold text-[15px] text-[#030712]">قوالبي المخصصة</h2>
          {!loading && (
            <span className="font-cairo text-[12px] text-[#9CA3AF]">{customTemplates.length} قالب</span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-[#16A34A] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : customTemplates.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center">
            <div className="text-3xl mb-2">📋</div>
            <p className="font-cairo text-[13px] font-semibold text-[#4B5563]">لا توجد قوالب مخصصة بعد</p>
            <p className="font-cairo text-[11px] text-[#9CA3AF] mt-1">
              أضف أدوية في جلسة روشتة ثم احفظها كقالب
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {customTemplates.map(t => (
              <CustomTemplateCard
                key={t.id}
                template={t}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Default Templates ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-cairo font-bold text-[15px] text-[#030712]">القوالب الافتراضية</h2>
          <span className="font-cairo text-[12px] text-[#9CA3AF]">
            {hiddenIds.length > 0 ? `${hiddenIds.length} مخفي` : 'الكل مرئي'}
          </span>
        </div>
        <p className="font-cairo text-[11px] text-[#9CA3AF] mb-3">
          هذه قوالب شائعة في السوق المصري. يمكنك إخفاء ما لا يناسب تخصصك.
        </p>
        <div className="space-y-2">
          {DEFAULT_TEMPLATES.map(t => (
            <DefaultTemplateCard
              key={t.id}
              template={t}
              hidden={hiddenIds.includes(t.id)}
              onToggle={handleToggleDefault}
            />
          ))}
        </div>
      </section>

      {/* Bottom padding for mobile nav */}
      <div className="h-6" />
    </div>
  )
}
