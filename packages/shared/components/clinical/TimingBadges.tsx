'use client'

import { ar } from '@shared/lib/i18n/ar'

export type TimingOption = 'morning' | 'after_food' | 'fasting' | 'evening' | 'before_food'

interface TimingBadgesProps {
  selected: TimingOption[]
  onChange: (selected: TimingOption[]) => void
}

const timingOptions: { key: TimingOption; label: string }[] = [
  { key: 'morning', label: ar.morning },
  { key: 'after_food', label: ar.afterFood },
  { key: 'fasting', label: ar.fasting },
  { key: 'evening', label: ar.evening },
  { key: 'before_food', label: ar.beforeFood },
]

export function TimingBadges({ selected, onChange }: TimingBadgesProps) {
  const toggleTiming = (key: TimingOption) => {
    if (selected.includes(key)) {
      onChange(selected.filter(s => s !== key))
    } else {
      onChange([...selected, key])
    }
  }

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {timingOptions.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => toggleTiming(opt.key)}
          className={`px-3 py-1.5 text-[12px] font-cairo font-medium rounded-full border transition-colors ${
            selected.includes(opt.key)
              ? 'bg-[#DCFCE7] border-[#16A34A] text-[#16A34A]'
              : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#16A34A]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
