'use client'

interface FrontdeskDashboardStatsProps {
  waitingCount: number | null
  arrivedToday: number | null
  avgWaitMinutes: number | null
  revenueToday: number | null
  isLoading: boolean
}

function formatArabicNumber(n: number): string {
  return n.toLocaleString('ar-EG')
}

function SkeletonNumber() {
  return <div className="w-12 h-5 rounded bg-[#E5E7EB] animate-pulse mx-auto" />
}

function getStatColor(label: string, value: number): string {
  if (label === 'في الانتظار') {
    if (value >= 7) return 'text-[#DC2626]'
    if (value >= 4) return 'text-[#F59E0B]'
    return 'text-[#16A34A]'
  }
  return 'text-[#030712]'
}

export function FrontdeskDashboardStats({
  waitingCount,
  arrivedToday,
  avgWaitMinutes,
  isLoading,
}: FrontdeskDashboardStatsProps) {
  const stats = [
    {
      label: 'في الانتظار',
      value: waitingCount,
      format: (v: number) => formatArabicNumber(v),
    },
    {
      label: 'وصلوا اليوم',
      value: arrivedToday,
      format: (v: number) => formatArabicNumber(v),
    },
    {
      label: 'متوسط الانتظار',
      value: avgWaitMinutes,
      format: (v: number) => `${formatArabicNumber(v)} د`,
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3 text-center"
        >
          <div className="mb-1 min-h-[28px] flex items-center justify-center">
            {isLoading ? (
              <SkeletonNumber />
            ) : stat.value === null ? (
              <span className="font-cairo text-[20px] font-bold text-[#9CA3AF]">—</span>
            ) : (
              <span className={`font-cairo text-[20px] font-bold ${getStatColor(stat.label, stat.value ?? 0)}`}>
                {stat.format(stat.value)}
              </span>
            )}
          </div>
          <p className="font-cairo text-[11px] text-[#9CA3AF]">{stat.label}</p>
        </div>
      ))}
    </div>
  )
}
