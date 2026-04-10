'use client'

// ============================================================================
// TODAY STATS — Mobile-first horizontal 3-card row (RTL Arabic)
// ============================================================================

interface TodayStatsProps {
  queue: Array<{ status: string }>
  payments: Array<{ amount?: number | string }>
  stats?: {
    total?: number
    count?: number
  }
}

export default function TodayStats({ queue, payments, stats }: TodayStatsProps) {
  const arrivals = queue.length
  const waiting = queue.filter((q) => q.status === 'waiting').length
  const revenue =
    stats?.total ??
    payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)

  return (
    <div className="flex gap-3" dir="rtl">
      {/* Arrivals */}
      <div className="flex-1 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3 text-center">
        <p className="font-cairo text-[20px] font-bold text-[#030712]">
          {arrivals}
        </p>
        <p className="font-cairo text-[11px] text-[#6B7280]">وصول</p>
      </div>

      {/* Waiting */}
      <div className="flex-1 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3 text-center">
        <p className="font-cairo text-[20px] font-bold text-[#D97706]">
          {waiting}
        </p>
        <p className="font-cairo text-[11px] text-[#6B7280]">انتظار</p>
      </div>

      {/* Revenue */}
      <div className="flex-1 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3 text-center">
        <p className="font-cairo text-[20px] font-bold text-[#16A34A]">
          {(revenue ?? 0).toLocaleString('ar-EG')}
        </p>
        <p className="font-cairo text-[11px] text-[#6B7280]">ج.م</p>
      </div>
    </div>
  )
}
