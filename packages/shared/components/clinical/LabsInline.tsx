'use client'

import { useState } from 'react'
import { ar } from '@shared/lib/i18n/ar'

export interface LabItem {
  name: string
  timing?: string[]   // kept for backward compat with saved data (not shown in UI)
  notes?: string      // optional free text per lab
}

interface LabsInlineProps {
  items: LabItem[]
  onChange: (items: LabItem[]) => void
}

const commonLabs = [
  'تحليل دم شامل CBC',
  'سكر صائم',
  'سكر فاطر',
  'هيموجلوبين سكري HbA1c',
  'وظائف كبد',
  'وظائف كلى',
  'الغدة الدرقية TSH',
  'صورة دهون',
  'حمض البوليك',
  'تحليل بول',
  'سرعة ترسيب ESR',
  'بروتين متفاعل CRP',
  'فيتامين D',
  'فيتامين B12',
  'حديد ومخزون الحديد',
  'كالسيوم',
  'مزرعة بول',
  'مزرعة دم',
]

export function LabsInline({ items, onChange }: LabsInlineProps) {
  const [search, setSearch] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  // Track which items have the notes field expanded
  const [notesOpen, setNotesOpen] = useState<Record<number, boolean>>({})

  const filtered = commonLabs.filter(l =>
    l.includes(search) && !items.some(i => i.name === l)
  )

  const addItem = (name: string) => {
    onChange([...items, { name }])
    setSearch('')
    setShowSuggestions(false)
  }

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
    setNotesOpen(prev => {
      const next = { ...prev }
      delete next[index]
      return next
    })
  }

  const updateNotes = (index: number, notes: string) => {
    const updated = [...items]
    updated[index] = { ...updated[index], notes }
    onChange(updated)
  }

  const toggleNotes = (index: number) => {
    setNotesOpen(prev => ({ ...prev, [index]: !prev[index] }))
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true) }}
          onFocus={() => setShowSuggestions(true)}
          placeholder={`${ar.search} ${ar.labsSection}...`}
          className="w-full px-4 py-2.5 border border-[#E5E7EB] rounded-[10px] text-[14px] font-cairo focus:outline-none focus:ring-2 focus:ring-[#22C55E] bg-white"
        />
        {showSuggestions && filtered.length > 0 && (
          <div className="absolute z-30 w-full mt-1 bg-white border border-[#E5E7EB] rounded-[12px] shadow-lg max-h-40 overflow-y-auto">
            {filtered.slice(0, 8).map((name) => (
              <button
                key={name}
                onClick={() => addItem(name)}
                className="w-full text-right px-4 py-2.5 text-[14px] font-cairo hover:bg-[#F9FAFB] transition-colors"
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Custom add */}
      {search && !commonLabs.includes(search) && (
        <button
          onClick={() => addItem(search)}
          className="text-[13px] font-cairo font-medium text-[#16A34A] hover:text-[#15803d]"
        >
          + إضافة "{search}"
        </button>
      )}

      {/* Added items */}
      {items.map((item, i) => (
        <div key={i} className="bg-[#F9FAFB] rounded-[12px] p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleNotes(i)}
                className="font-cairo text-[11px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                title="إضافة ملاحظة"
              >
                {notesOpen[i] ? '▲' : '+ ملاحظة'}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[14px] font-cairo font-medium text-[#030712]">{item.name}</span>
              <button onClick={() => removeItem(i)} className="text-[#DC2626] hover:text-red-800">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          {notesOpen[i] && (
            <input
              type="text"
              value={item.notes || ''}
              onChange={(e) => updateNotes(i, e.target.value)}
              placeholder="ملاحظات اختيارية..."
              autoFocus
              className="mt-2 w-full px-3 py-1.5 text-[12px] font-cairo border border-[#E5E7EB] rounded-[8px] focus:outline-none focus:ring-1 focus:ring-[#22C55E] bg-white"
            />
          )}
        </div>
      ))}
    </div>
  )
}
