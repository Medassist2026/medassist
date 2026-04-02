'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronRight,
  Banknote,
  Users,
  TrendingUp,
  Calendar,
  Loader2,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface IncomeDayPoint  { date: string; income: number; visits: number }
interface IncomeMonthPoint { month: string; income: number; visits: number }

interface IncomeStats {
  summary: {
    today: number
    thisMonth: number
    visitsToday: number
    visitsThisMonth: number
  }
  byDay:   IncomeDayPoint[]
  byMonth: IncomeMonthPoint[]
}

interface DoctorAnalytics {
  income: IncomeStats
}

type ViewMode = 'day' | 'month'
type ChartTab = 'income' | 'visits'

// ============================================================================
// HELPERS
// ============================================================================

function formatEGP(n: number) {
  return n.toLocaleString('ar-EG')
}

/**
 * Render a minimal horizontal bar chart using SVG.
 * Each bar shows the value relative to the maximum in the dataset.
 */
function BarChart({
  data,
  labelKey,
  valueKey,
  color = '#16A34A',
  formatLabel,
  formatValue,
}: {
  data: Record<string, any>[]
  labelKey: string
  valueKey: string
  color?: string
  formatLabel?: (raw: string) => string
  formatValue?: (v: number) => string
}) {
  if (data.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="font-cairo text-[13px] text-[#9CA3AF]">لا توجد بيانات</p>
      </div>
    )
  }

  const values = data.map((d) => Number(d[valueKey]) || 0)
  const max    = Math.max(...values, 1)

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div
        className="flex items-end gap-[5px] min-w-0"
        style={{ minWidth: Math.max(data.length * 28, 280) }}
      >
        {data.map((item, i) => {
          const val  = Number(item[valueKey]) || 0
          const pct  = max > 0 ? (val / max) * 100 : 0
          const rawLabel = String(item[labelKey])
          const label    = formatLabel ? formatLabel(rawLabel) : rawLabel
          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0">
              {/* Value label above bar */}
              {val > 0 && (
                <span
                  className="font-cairo text-[9px] text-[#6B7280] whitespace-nowrap"
                  style={{ direction: 'ltr' }}
                >
                  {formatValue ? formatValue(val) : val}
                </span>
              )}
              {/* Bar */}
              <div className="w-full flex flex-col justify-end" style={{ height: 64 }}>
                <div
                  className="w-full rounded-t-[3px] transition-all duration-300"
                  style={{
                    height:     `${Math.max(pct, val > 0 ? 4 : 0)}%`,
                    background: val > 0 ? color : '#F3F4F6',
                    minHeight:  val > 0 ? 4 : 2,
                  }}
                />
              </div>
              {/* Date label below */}
              <span className="font-cairo text-[9px] text-[#9CA3AF] truncate w-full text-center">
                {label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// LABEL FORMATTERS
// ============================================================================

function formatDayLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })
  } catch {
    return dateStr.slice(5)
  }
}

function formatMonthLabel(monthStr: string): string {
  try {
    const d = new Date(monthStr + '-01')
    return d.toLocaleDateString('ar-EG', { month: 'short' })
  } catch {
    return monthStr.slice(5)
  }
}

// ============================================================================
// SUMMARY CARD
// ============================================================================

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  iconColor,
  iconBg,
}: {
  icon: typeof Banknote
  label: string
  value: string
  sub?: string
  iconColor: string
  iconBg: string
}) {
  return (
    <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-4">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-[8px] flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon className={`w-4.5 h-4.5 ${iconColor}`} strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="font-cairo text-[12px] text-[#6B7280]">{label}</p>
          <p className="font-cairo text-[20px] font-bold text-[#030712] leading-tight">{value}</p>
          {sub && <p className="font-cairo text-[11px] text-[#9CA3AF] mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function DoctorAnalyticsPage() {
  const router  = useRouter()
  const [data,    setData]    = useState<DoctorAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [view,    setView]    = useState<ViewMode>('day')
  const [chart,   setChart]   = useState<ChartTab>('income')

  useEffect(() => {
    fetch('/api/analytics/doctor-stats?period=30d')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setData(d)
      })
      .catch(e => setError(e.message || 'فشل في تحميل الإحصائيات'))
      .finally(() => setLoading(false))
  }, [])

  const income = data?.income

  // Slice last 30 days / last 12 months for the charts
  const dayData   = income?.byDay.slice(-30)   ?? []
  const monthData = income?.byMonth.slice(-12) ?? []

  const chartData  = view === 'day' ? dayData   : monthData
  const labelFn    = view === 'day' ? formatDayLabel : formatMonthLabel
  const labelKey   = view === 'day' ? 'date'    : 'month'

  return (
    <div dir="rtl" className="min-h-screen bg-[#F9FAFB]">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#E5E7EB]">
        <div className="max-w-md mx-auto flex items-center gap-3 px-4 pt-4 pb-3">
          <button
            onClick={() => router.back()}
            className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center flex-shrink-0"
          >
            <ChevronRight className="w-[20px] h-[20px] text-[#030712]" />
          </button>
          <h1 className="font-cairo text-[18px] font-semibold text-[#030712]">الإحصائيات</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-4 pb-24 space-y-4">
        {/* ── Loading ────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 text-[#16A34A] animate-spin" />
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────── */}
        {!loading && error && (
          <div className="bg-red-50 rounded-[12px] border border-red-200 p-4 text-center">
            <p className="font-cairo text-[14px] text-red-700">{error}</p>
          </div>
        )}

        {/* ── Content ────────────────────────────────────────── */}
        {!loading && income && (
          <>
            {/* Summary Cards — 2×2 grid */}
            <div className="grid grid-cols-2 gap-3">
              <SummaryCard
                icon={Banknote}
                label="إيرادات اليوم"
                value={`${formatEGP(income.summary.today)} ج.م`}
                iconColor="text-[#16A34A]"
                iconBg="bg-[#F0FDF4]"
              />
              <SummaryCard
                icon={Users}
                label="زيارات اليوم"
                value={income.summary.visitsToday.toLocaleString('ar-EG')}
                iconColor="text-[#2563EB]"
                iconBg="bg-[#EFF6FF]"
              />
              <SummaryCard
                icon={TrendingUp}
                label="إيرادات الشهر"
                value={`${formatEGP(income.summary.thisMonth)} ج.م`}
                iconColor="text-[#D97706]"
                iconBg="bg-[#FFFBEB]"
              />
              <SummaryCard
                icon={Calendar}
                label="زيارات الشهر"
                value={income.summary.visitsThisMonth.toLocaleString('ar-EG')}
                iconColor="text-[#7C3AED]"
                iconBg="bg-[#F5F3FF]"
              />
            </div>

            {/* Chart Section */}
            <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-4">
              {/* Chart type tabs */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setChart('income')}
                  className={`flex-1 py-1.5 rounded-full font-cairo text-[12px] font-medium transition-colors ${
                    chart === 'income'
                      ? 'bg-[#16A34A] text-white'
                      : 'bg-[#F3F4F6] text-[#6B7280]'
                  }`}
                >
                  الإيرادات
                </button>
                <button
                  onClick={() => setChart('visits')}
                  className={`flex-1 py-1.5 rounded-full font-cairo text-[12px] font-medium transition-colors ${
                    chart === 'visits'
                      ? 'bg-[#16A34A] text-white'
                      : 'bg-[#F3F4F6] text-[#6B7280]'
                  }`}
                >
                  الزيارات
                </button>
              </div>

              {/* Period tabs */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setView('day')}
                  className={`px-3 py-1 rounded-full font-cairo text-[12px] transition-colors ${
                    view === 'day'
                      ? 'bg-[#030712] text-white'
                      : 'bg-[#F3F4F6] text-[#6B7280]'
                  }`}
                >
                  ٣٠ يوم
                </button>
                <button
                  onClick={() => setView('month')}
                  className={`px-3 py-1 rounded-full font-cairo text-[12px] transition-colors ${
                    view === 'month'
                      ? 'bg-[#030712] text-white'
                      : 'bg-[#F3F4F6] text-[#6B7280]'
                  }`}
                >
                  ١٢ شهر
                </button>
              </div>

              {/* Bar chart */}
              <BarChart
                data={chartData}
                labelKey={labelKey}
                valueKey={chart === 'income' ? 'income' : 'visits'}
                color={chart === 'income' ? '#16A34A' : '#2563EB'}
                formatLabel={labelFn}
                formatValue={(v) => v.toLocaleString('ar-EG')}
              />

              {/* Chart legend */}
              {chartData.length > 0 && (
                <div className="mt-3 flex items-center justify-between">
                  <p className="font-cairo text-[11px] text-[#9CA3AF]">
                    {chart === 'income'
                      ? `الإجمالي: ${formatEGP(chartData.reduce((s, d) => s + (d.income || 0), 0))} ج.م`
                      : `الإجمالي: ${chartData.reduce((s, d) => s + (d.visits || 0), 0)} زيارة`
                    }
                  </p>
                  <p className="font-cairo text-[11px] text-[#9CA3AF]">
                    المتوسط: {chart === 'income'
                      ? `${formatEGP(Math.round(chartData.reduce((s, d) => s + (d.income || 0), 0) / Math.max(chartData.filter(d => d.income > 0).length, 1)))} ج.م`
                      : `${(chartData.reduce((s, d) => s + (d.visits || 0), 0) / Math.max(chartData.filter(d => d.visits > 0).length, 1)).toFixed(1)} زيارة`
                    }
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
