'use client'

interface DoctorTabStripProps {
  doctors: Array<{
    id: string
    name: string
    isActive: boolean
  }>
  selectedDoctorId: string | 'all'
  onSelect: (doctorId: string | 'all') => void
}

export function DoctorTabStrip({ doctors, selectedDoctorId, onSelect }: DoctorTabStripProps) {
  // Single-doctor clinic: render nothing
  if (doctors.length < 2) return null

  const tabs: Array<{ id: string | 'all'; label: string; isActive: boolean }> = [
    { id: 'all', label: 'الكل', isActive: true },
    ...doctors.map((d) => ({ id: d.id, label: d.name, isActive: d.isActive })),
  ]

  return (
    <div className="py-2 px-4 overflow-x-auto scrollbar-hide">
      <div className="flex gap-2">
        {tabs.map((tab) => {
          const isSelected = selectedDoctorId === tab.id
          const opacity = tab.id === 'all' || tab.isActive ? 'opacity-100' : 'opacity-60'

          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id as string | 'all')}
              className={`
                flex items-center gap-1.5 h-[36px] px-3 rounded-full font-cairo text-[13px] font-medium
                whitespace-nowrap flex-shrink-0 transition-colors ${opacity}
                ${
                  isSelected
                    ? 'bg-[#16A34A] text-white'
                    : 'bg-white text-[#4B5563] border border-[#E5E7EB]'
                }
              `}
            >
              {/* Dot indicator */}
              {tab.id !== 'all' && (
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    tab.isActive ? 'bg-[#16A34A]' : 'bg-[#9CA3AF]'
                  } ${isSelected ? '!bg-white' : ''}`}
                />
              )}
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
