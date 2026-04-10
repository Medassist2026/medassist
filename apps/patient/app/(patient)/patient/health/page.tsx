'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  FlaskConical,
  HeartPulse,
  Plus,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { PatientHeader } from '@ui-clinic/components/patient/PatientHeader'

// ============================================================================
// TYPES
// ============================================================================

interface VitalEntry {
  id: string
  measured_at: string
  blood_pressure: string | null
  heart_rate: number | null
  temperature: number | null
  respiratory_rate: number | null
  oxygen_saturation: number | null
  weight: number | null
  height: number | null
  bmi: number | null
  notes: string | null
}

interface Condition {
  id: string
  name: string
  diagnosed_date: string
  status: 'active' | 'resolved'
  source?: string
}

interface Allergy {
  id: string
  allergen: string
  reaction: string
  severity: 'mild' | 'moderate' | 'severe'
  recorded_date: string
  notes: string | null
  source?: string
}

interface LabResult {
  id: string
  ordered_at?: string
  completed_at?: string
  notes?: string
  doctor?: { full_name?: string } | null
  results?: Array<{
    id: string
    value?: string | number
    unit?: string
    reference_range?: string
    is_abnormal?: boolean
    abnormal_flag?: string | null
    test?: { test_name?: string; unit?: string; reference_range?: string } | null
  }>
}

type HealthTab = 'overview' | 'vitals' | 'conditions' | 'allergies' | 'labs'

// ============================================================================
// DATE HELPERS
// ============================================================================

function formatArabicDate(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('ar-EG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatRelativeTime(iso?: string | null) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const diffMs = Date.now() - d.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'اليوم'
    if (diffDays === 1) return 'أمس'
    if (diffDays < 7) return `قبل ${diffDays} أيام`
    if (diffDays < 30) return `قبل ${Math.floor(diffDays / 7)} أسابيع`
    if (diffDays < 365) return `قبل ${Math.floor(diffDays / 30)} أشهر`
    return `قبل ${Math.floor(diffDays / 365)} سنوات`
  } catch {
    return ''
  }
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-24 bg-[#F3F4F6] rounded-[12px]" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 bg-[#F3F4F6] rounded-[12px]" />
        <div className="h-24 bg-[#F3F4F6] rounded-[12px]" />
      </div>
      <div className="h-32 bg-[#F3F4F6] rounded-[12px]" />
    </div>
  )
}

// ============================================================================
// ERROR STATE
// ============================================================================

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-white rounded-[12px] border-[0.8px] border-[#FECACA] p-5 text-center">
      <div className="w-12 h-12 rounded-full bg-[#FEE2E2] mx-auto mb-3 flex items-center justify-center">
        <AlertCircle className="w-6 h-6 text-[#B91C1C]" strokeWidth={1.8} />
      </div>
      <h3 className="font-cairo text-[15px] font-semibold text-[#030712] mb-1">
        تعذر تحميل البيانات
      </h3>
      <p className="font-cairo text-[12px] text-[#6B7280] mb-4">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 h-[40px] px-5 rounded-[10px] border-[0.8px] border-[#E5E7EB] bg-white font-cairo text-[13px] font-medium text-[#030712] hover:bg-[#F9FAFB] transition-colors"
      >
        <RefreshCw className="w-4 h-4" strokeWidth={2} />
        إعادة المحاولة
      </button>
    </div>
  )
}

// ============================================================================
// TAB BAR
// ============================================================================

function HealthTabs({
  active,
  onChange,
}: {
  active: HealthTab
  onChange: (tab: HealthTab) => void
}) {
  const tabs: { key: HealthTab; label: string }[] = [
    { key: 'overview', label: 'نظرة عامة' },
    { key: 'vitals', label: 'العلامات' },
    { key: 'conditions', label: 'الأمراض' },
    { key: 'allergies', label: 'الحساسية' },
    { key: 'labs', label: 'التحاليل' },
  ]

  return (
    <div
      dir="rtl"
      className="flex gap-1 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1"
    >
      {tabs.map((tab) => {
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`h-[38px] px-4 rounded-[10px] font-cairo text-[12px] font-medium whitespace-nowrap transition-all ${
              isActive
                ? 'bg-[#16A34A] text-white shadow-[0px_4px_12px_-2px_rgba(45,190,92,0.25)]'
                : 'bg-white text-[#6B7280] border-[0.8px] border-[#E5E7EB] hover:bg-[#F9FAFB]'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// METRIC CARD
// ============================================================================

function MetricCard({
  icon,
  label,
  value,
  unit,
  trend,
  tone = 'neutral',
}: {
  icon: React.ReactNode
  label: string
  value: string
  unit?: string
  trend?: 'up' | 'down' | 'flat'
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
}) {
  const toneBg =
    tone === 'success'
      ? 'bg-[#F0FDF4]'
      : tone === 'warning'
      ? 'bg-[#FFFBEB]'
      : tone === 'danger'
      ? 'bg-[#FEF2F2]'
      : 'bg-[#F9FAFB]'

  const toneColor =
    tone === 'success'
      ? 'text-[#16A34A]'
      : tone === 'warning'
      ? 'text-[#D97706]'
      : tone === 'danger'
      ? 'text-[#B91C1C]'
      : 'text-[#4B5563]'

  return (
    <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-4">
      <div className="flex items-start justify-between mb-2">
        <div
          className={`w-9 h-9 rounded-full ${toneBg} flex items-center justify-center`}
        >
          <span className={toneColor}>{icon}</span>
        </div>
        {trend === 'up' && <TrendingUp className="w-4 h-4 text-[#16A34A]" />}
        {trend === 'down' && <TrendingDown className="w-4 h-4 text-[#B91C1C]" />}
      </div>
      <p className="font-cairo text-[11px] text-[#6B7280] mb-0.5">{label}</p>
      <p className="font-cairo text-[18px] font-bold text-[#030712]">
        {value}
        {unit && (
          <span className="font-cairo text-[11px] font-normal text-[#9CA3AF] mr-1">
            {unit}
          </span>
        )}
      </p>
    </div>
  )
}

// ============================================================================
// SECTION HEADER
// ============================================================================

function SectionHeader({
  title,
  action,
}: {
  title: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-cairo text-[15px] font-semibold text-[#030712]">
        {title}
      </h2>
      {action}
    </div>
  )
}

// ============================================================================
// EMPTY STATE (small, inline)
// ============================================================================

function InlineEmpty({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-6 text-center">
      <p className="font-cairo text-[13px] text-[#6B7280]">{message}</p>
    </div>
  )
}

// ============================================================================
// OVERVIEW TAB
// ============================================================================

function OverviewTab({
  vitals,
  conditions,
  allergies,
  labs,
}: {
  vitals: VitalEntry[]
  conditions: Condition[]
  allergies: Allergy[]
  labs: LabResult[]
}) {
  const latest = vitals[0] || null
  const activeConditions = conditions.filter((c) => c.status === 'active').length
  const severeAllergies = allergies.filter((a) => a.severity === 'severe').length
  const abnormalLabs = labs.reduce((acc, lab) => {
    const results = Array.isArray(lab.results) ? lab.results : []
    return acc + results.filter((r) => !!r.is_abnormal).length
  }, 0)

  return (
    <div className="space-y-5">
      {/* Latest vitals preview */}
      <div>
        <SectionHeader title="آخر قياسات" />
        {latest ? (
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              icon={<HeartPulse className="w-4 h-4" strokeWidth={2} />}
              label="ضغط الدم"
              value={latest.blood_pressure || '—'}
              unit={latest.blood_pressure ? 'mmHg' : undefined}
              tone="success"
            />
            <MetricCard
              icon={<Activity className="w-4 h-4" strokeWidth={2} />}
              label="نبضات القلب"
              value={latest.heart_rate ? String(latest.heart_rate) : '—'}
              unit={latest.heart_rate ? 'bpm' : undefined}
              tone="neutral"
            />
            <MetricCard
              icon={<Activity className="w-4 h-4" strokeWidth={2} />}
              label="الوزن"
              value={latest.weight ? String(latest.weight) : '—'}
              unit={latest.weight ? 'kg' : undefined}
              tone="neutral"
            />
            <MetricCard
              icon={<Activity className="w-4 h-4" strokeWidth={2} />}
              label="BMI"
              value={latest.bmi ? String(latest.bmi) : '—'}
              tone="neutral"
            />
          </div>
        ) : (
          <InlineEmpty message="لم يتم تسجيل علامات حيوية بعد" />
        )}
      </div>

      {/* Status summary */}
      <div>
        <SectionHeader title="ملخص الحالة" />
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3 text-center">
            <p className="font-cairo text-[20px] font-bold text-[#030712]">
              {activeConditions}
            </p>
            <p className="font-cairo text-[10px] text-[#6B7280] mt-0.5">
              أمراض نشطة
            </p>
          </div>
          <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3 text-center">
            <p className="font-cairo text-[20px] font-bold text-[#030712]">
              {severeAllergies}
            </p>
            <p className="font-cairo text-[10px] text-[#6B7280] mt-0.5">
              حساسية شديدة
            </p>
          </div>
          <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3 text-center">
            <p className="font-cairo text-[20px] font-bold text-[#030712]">
              {abnormalLabs}
            </p>
            <p className="font-cairo text-[10px] text-[#6B7280] mt-0.5">
              تحاليل غير طبيعية
            </p>
          </div>
        </div>
      </div>

      {/* Recent conditions */}
      {conditions.length > 0 && (
        <div>
          <SectionHeader title="الأمراض الأخيرة" />
          <div className="space-y-2">
            {conditions.slice(0, 3).map((c) => (
              <ConditionRow key={c.id} condition={c} />
            ))}
          </div>
        </div>
      )}

      {/* Recent labs */}
      {labs.length > 0 && (
        <div>
          <SectionHeader title="آخر التحاليل" />
          <div className="space-y-2">
            {labs.slice(0, 3).map((lab) => (
              <LabRow key={lab.id} lab={lab} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// VITALS TAB
// ============================================================================

function VitalsTab({ vitals }: { vitals: VitalEntry[] }) {
  const latest = vitals[0] || null

  if (!latest) {
    return (
      <InlineEmpty message="لم يتم تسجيل علامات حيوية بعد. سيتم تسجيلها أثناء زياراتك للعيادة." />
    )
  }

  return (
    <div className="space-y-5">
      {/* Latest metric grid */}
      <div>
        <SectionHeader title="آخر القراءات" />
        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            icon={<HeartPulse className="w-4 h-4" strokeWidth={2} />}
            label="ضغط الدم"
            value={latest.blood_pressure || '—'}
            unit={latest.blood_pressure ? 'mmHg' : undefined}
            tone="success"
          />
          <MetricCard
            icon={<Activity className="w-4 h-4" strokeWidth={2} />}
            label="نبضات القلب"
            value={latest.heart_rate ? String(latest.heart_rate) : '—'}
            unit="bpm"
            tone="neutral"
          />
          <MetricCard
            icon={<Activity className="w-4 h-4" strokeWidth={2} />}
            label="درجة الحرارة"
            value={latest.temperature ? String(latest.temperature) : '—'}
            unit="°C"
            tone="neutral"
          />
          <MetricCard
            icon={<Activity className="w-4 h-4" strokeWidth={2} />}
            label="أكسجين الدم"
            value={
              latest.oxygen_saturation ? String(latest.oxygen_saturation) : '—'
            }
            unit="%"
            tone="neutral"
          />
          <MetricCard
            icon={<Activity className="w-4 h-4" strokeWidth={2} />}
            label="الوزن"
            value={latest.weight ? String(latest.weight) : '—'}
            unit="kg"
            tone="neutral"
          />
          <MetricCard
            icon={<Activity className="w-4 h-4" strokeWidth={2} />}
            label="BMI"
            value={latest.bmi ? String(latest.bmi) : '—'}
            tone="neutral"
          />
        </div>
        <p className="font-cairo text-[11px] text-[#9CA3AF] mt-2 text-center">
          آخر تحديث: {formatArabicDate(latest.measured_at)} ·{' '}
          {formatRelativeTime(latest.measured_at)}
        </p>
      </div>

      {/* History */}
      {vitals.length > 1 && (
        <div>
          <SectionHeader title="السجل السابق" />
          <div className="space-y-2">
            {vitals.slice(1, 10).map((entry) => (
              <div
                key={entry.id}
                className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="font-cairo text-[13px] font-semibold text-[#030712]">
                    {formatArabicDate(entry.measured_at)}
                  </p>
                  <p className="font-cairo text-[11px] text-[#9CA3AF]">
                    {formatRelativeTime(entry.measured_at)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-cairo text-[11px] text-[#4B5563]">
                  <span>ضغط: {entry.blood_pressure || '—'}</span>
                  <span>
                    نبض: {entry.heart_rate ? `${entry.heart_rate} bpm` : '—'}
                  </span>
                  <span>
                    وزن: {entry.weight ? `${entry.weight} kg` : '—'}
                  </span>
                  <span>
                    SpO2:{' '}
                    {entry.oxygen_saturation
                      ? `${entry.oxygen_saturation}%`
                      : '—'}
                  </span>
                </div>
                {entry.notes && (
                  <p className="mt-2 font-cairo text-[11px] italic text-[#6B7280]">
                    "{entry.notes}"
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// CONDITIONS TAB
// ============================================================================

function ConditionRow({ condition }: { condition: Condition }) {
  const statusCfg =
    condition.status === 'active'
      ? { label: 'نشط', bg: '#FEF3C7', border: '#FDE68A', text: '#B45309' }
      : { label: 'معالج', bg: '#DCFCE7', border: '#86EFAC', text: '#15803D' }

  return (
    <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-full bg-[#FEF3C7] flex items-center justify-center flex-shrink-0">
            <Stethoscope
              className="w-4 h-4 text-[#B45309]"
              strokeWidth={1.8}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-cairo text-[14px] font-semibold text-[#030712] truncate">
              {condition.name}
            </h4>
            <p className="font-cairo text-[11px] text-[#6B7280] mt-0.5">
              شُخص في {formatArabicDate(condition.diagnosed_date)}
            </p>
          </div>
        </div>
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full font-cairo text-[11px] font-medium border-[0.8px] flex-shrink-0"
          style={{
            backgroundColor: statusCfg.bg,
            borderColor: statusCfg.border,
            color: statusCfg.text,
          }}
        >
          {statusCfg.label}
        </span>
      </div>
    </div>
  )
}

function ConditionsTab({
  conditions,
  onAdd,
}: {
  conditions: Condition[]
  onAdd: () => void
}) {
  const active = conditions.filter((c) => c.status === 'active')
  const resolved = conditions.filter((c) => c.status === 'resolved')

  return (
    <div className="space-y-5">
      <SectionHeader
        title="الأمراض المزمنة والتشخيصات"
        action={
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 h-[32px] px-3 rounded-[8px] bg-[#F0FDF4] border-[0.8px] border-[#BBF7D0] font-cairo text-[12px] font-medium text-[#16A34A] hover:bg-[#DCFCE7] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            إضافة
          </button>
        }
      />

      {conditions.length === 0 ? (
        <InlineEmpty message="لا توجد أمراض مسجلة" />
      ) : (
        <>
          {active.length > 0 && (
            <div>
              <h3 className="font-cairo text-[12px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">
                نشط ({active.length})
              </h3>
              <div className="space-y-2">
                {active.map((c) => (
                  <ConditionRow key={c.id} condition={c} />
                ))}
              </div>
            </div>
          )}
          {resolved.length > 0 && (
            <div>
              <h3 className="font-cairo text-[12px] font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">
                معالج ({resolved.length})
              </h3>
              <div className="space-y-2">
                {resolved.map((c) => (
                  <ConditionRow key={c.id} condition={c} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================================
// ALLERGIES TAB
// ============================================================================

function AllergyRow({ allergy }: { allergy: Allergy }) {
  const severityCfg = {
    mild: { label: 'خفيف', bg: '#DBEAFE', border: '#93C5FD', text: '#1D4ED8' },
    moderate: {
      label: 'متوسط',
      bg: '#FEF3C7',
      border: '#FDE68A',
      text: '#B45309',
    },
    severe: {
      label: 'شديد',
      bg: '#FEE2E2',
      border: '#FCA5A5',
      text: '#B91C1C',
    },
  }[allergy.severity]

  return (
    <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0`}
            style={{ backgroundColor: severityCfg.bg }}
          >
            <ShieldAlert
              className="w-4 h-4"
              strokeWidth={1.8}
              style={{ color: severityCfg.text }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-cairo text-[14px] font-semibold text-[#030712] truncate">
              {allergy.allergen}
            </h4>
            <p className="font-cairo text-[11px] text-[#6B7280] mt-0.5">
              {allergy.reaction}
            </p>
          </div>
        </div>
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full font-cairo text-[11px] font-medium border-[0.8px] flex-shrink-0"
          style={{
            backgroundColor: severityCfg.bg,
            borderColor: severityCfg.border,
            color: severityCfg.text,
          }}
        >
          {severityCfg.label}
        </span>
      </div>
      {allergy.notes && (
        <p className="font-cairo text-[11px] text-[#6B7280] mt-2 pt-2 border-t-[0.8px] border-[#F3F4F6]">
          {allergy.notes}
        </p>
      )}
    </div>
  )
}

function AllergiesTab({
  allergies,
  onAdd,
}: {
  allergies: Allergy[]
  onAdd: () => void
}) {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="الحساسية"
        action={
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 h-[32px] px-3 rounded-[8px] bg-[#F0FDF4] border-[0.8px] border-[#BBF7D0] font-cairo text-[12px] font-medium text-[#16A34A] hover:bg-[#DCFCE7] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            إضافة
          </button>
        }
      />
      {allergies.length === 0 ? (
        <InlineEmpty message="لا توجد حساسية مسجلة" />
      ) : (
        <div className="space-y-2">
          {allergies.map((a) => (
            <AllergyRow key={a.id} allergy={a} />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// LABS TAB
// ============================================================================

function LabRow({ lab }: { lab: LabResult }) {
  const results = Array.isArray(lab.results) ? lab.results : []
  const primaryTest = results[0]?.test?.test_name || 'تحليل معملي'
  const abnormal = results.some((r) => !!r.is_abnormal)
  const date = lab.completed_at || lab.ordered_at

  return (
    <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
              abnormal ? 'bg-[#FEE2E2]' : 'bg-[#F0FDF4]'
            }`}
          >
            <FlaskConical
              className={`w-4 h-4 ${
                abnormal ? 'text-[#B91C1C]' : 'text-[#16A34A]'
              }`}
              strokeWidth={1.8}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-cairo text-[14px] font-semibold text-[#030712] truncate">
              {primaryTest}
              {results.length > 1 && (
                <span className="font-cairo text-[11px] font-normal text-[#9CA3AF] mr-1">
                  +{results.length - 1}
                </span>
              )}
            </h4>
            <p className="font-cairo text-[11px] text-[#6B7280] mt-0.5">
              {formatArabicDate(date)}
              {lab.doctor?.full_name && (
                <>
                  {' '}
                  · د. {lab.doctor.full_name}
                </>
              )}
            </p>
          </div>
        </div>
        {abnormal && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-cairo text-[11px] font-medium border-[0.8px] bg-[#FEE2E2] border-[#FCA5A5] text-[#B91C1C] flex-shrink-0">
            <AlertTriangle className="w-3 h-3" strokeWidth={2.5} />
            غير طبيعي
          </span>
        )}
      </div>

      {results.length > 0 && (
        <div className="pt-2 mt-2 border-t-[0.8px] border-[#F3F4F6] space-y-1">
          {results.slice(0, 3).map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between font-cairo text-[11px]"
            >
              <span className="text-[#6B7280] truncate flex-1">
                {r.test?.test_name || 'قيمة'}
              </span>
              <span
                className={`font-medium ${
                  r.is_abnormal ? 'text-[#B91C1C]' : 'text-[#030712]'
                }`}
              >
                {r.value ?? '—'}
                {r.unit ? ` ${r.unit}` : r.test?.unit ? ` ${r.test.unit}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LabsTab({ labs }: { labs: LabResult[] }) {
  return (
    <div className="space-y-4">
      <SectionHeader title="التحاليل المعملية" />
      {labs.length === 0 ? (
        <InlineEmpty message="لا توجد تحاليل معملية مسجلة" />
      ) : (
        <div className="space-y-2">
          {labs.map((lab) => (
            <LabRow key={lab.id} lab={lab} />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// ADD FORM MODAL (shared for conditions + allergies)
// ============================================================================

interface AddFormState {
  kind: 'condition' | 'allergy'
  name: string
  reaction?: string
  severity?: 'mild' | 'moderate' | 'severe'
  status?: 'active' | 'resolved'
  notes?: string
  date: string
}

function AddFormModal({
  state,
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  state: AddFormState
  onClose: () => void
  onSubmit: (next: AddFormState) => Promise<void>
  submitting: boolean
  error: string | null
}) {
  const [local, setLocal] = useState<AddFormState>(state)

  useEffect(() => {
    setLocal(state)
  }, [state])

  const title =
    local.kind === 'condition' ? 'إضافة مرض / تشخيص' : 'إضافة حساسية'

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-[20px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b-[0.8px] border-[#E5E7EB]">
          <h3 className="font-cairo text-[16px] font-semibold text-[#030712]">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border-[0.8px] border-[#E5E7EB] flex items-center justify-center hover:bg-[#F9FAFB]"
          >
            <X className="w-4 h-4 text-[#4B5563]" strokeWidth={2} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="bg-[#FEF2F2] border-[0.8px] border-[#FECACA] rounded-[10px] p-3 font-cairo text-[12px] text-[#B91C1C]">
              {error}
            </div>
          )}

          <div>
            <label className="block font-cairo text-[12px] font-medium text-[#030712] mb-1.5">
              {local.kind === 'condition' ? 'اسم المرض' : 'مسبب الحساسية'}
            </label>
            <input
              type="text"
              value={local.name}
              onChange={(e) => setLocal({ ...local, name: e.target.value })}
              placeholder={
                local.kind === 'condition' ? 'مثال: ضغط الدم' : 'مثال: بنسلين'
              }
              className="w-full h-[44px] px-3 rounded-[10px] border-[0.8px] border-[#E5E7EB] font-cairo text-[13px] text-[#030712] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#16A34A] transition-colors"
            />
          </div>

          {local.kind === 'allergy' && (
            <>
              <div>
                <label className="block font-cairo text-[12px] font-medium text-[#030712] mb-1.5">
                  رد الفعل
                </label>
                <input
                  type="text"
                  value={local.reaction || ''}
                  onChange={(e) =>
                    setLocal({ ...local, reaction: e.target.value })
                  }
                  placeholder="مثال: طفح جلدي"
                  className="w-full h-[44px] px-3 rounded-[10px] border-[0.8px] border-[#E5E7EB] font-cairo text-[13px] text-[#030712] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#16A34A] transition-colors"
                />
              </div>
              <div>
                <label className="block font-cairo text-[12px] font-medium text-[#030712] mb-1.5">
                  الشدة
                </label>
                <select
                  value={local.severity || 'moderate'}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      severity: e.target.value as AddFormState['severity'],
                    })
                  }
                  className="w-full h-[44px] px-3 rounded-[10px] border-[0.8px] border-[#E5E7EB] font-cairo text-[13px] text-[#030712] focus:outline-none focus:border-[#16A34A] transition-colors bg-white"
                >
                  <option value="mild">خفيف</option>
                  <option value="moderate">متوسط</option>
                  <option value="severe">شديد</option>
                </select>
              </div>
            </>
          )}

          {local.kind === 'condition' && (
            <div>
              <label className="block font-cairo text-[12px] font-medium text-[#030712] mb-1.5">
                الحالة
              </label>
              <select
                value={local.status || 'active'}
                onChange={(e) =>
                  setLocal({
                    ...local,
                    status: e.target.value as AddFormState['status'],
                  })
                }
                className="w-full h-[44px] px-3 rounded-[10px] border-[0.8px] border-[#E5E7EB] font-cairo text-[13px] text-[#030712] focus:outline-none focus:border-[#16A34A] transition-colors bg-white"
              >
                <option value="active">نشط</option>
                <option value="resolved">معالج</option>
              </select>
            </div>
          )}

          <div>
            <label className="block font-cairo text-[12px] font-medium text-[#030712] mb-1.5">
              التاريخ
            </label>
            <input
              type="date"
              value={local.date}
              onChange={(e) => setLocal({ ...local, date: e.target.value })}
              className="w-full h-[44px] px-3 rounded-[10px] border-[0.8px] border-[#E5E7EB] font-cairo text-[13px] text-[#030712] focus:outline-none focus:border-[#16A34A] transition-colors"
            />
          </div>

          <div>
            <label className="block font-cairo text-[12px] font-medium text-[#030712] mb-1.5">
              ملاحظات (اختياري)
            </label>
            <textarea
              value={local.notes || ''}
              onChange={(e) => setLocal({ ...local, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 rounded-[10px] border-[0.8px] border-[#E5E7EB] font-cairo text-[13px] text-[#030712] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#16A34A] transition-colors resize-none"
            />
          </div>
        </div>

        <div className="p-5 border-t-[0.8px] border-[#E5E7EB] flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 h-[44px] rounded-[10px] border-[0.8px] border-[#E5E7EB] bg-white font-cairo text-[13px] font-medium text-[#4B5563] hover:bg-[#F9FAFB] transition-colors disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => onSubmit(local)}
            disabled={submitting || !local.name.trim()}
            className="flex-1 h-[44px] rounded-[10px] bg-[#16A34A] font-cairo text-[13px] font-semibold text-white hover:bg-[#15803D] transition-colors disabled:opacity-50"
          >
            {submitting ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function HealthPage() {
  const [tab, setTab] = useState<HealthTab>('overview')

  const [vitals, setVitals] = useState<VitalEntry[]>([])
  const [conditions, setConditions] = useState<Condition[]>([])
  const [allergies, setAllergies] = useState<Allergy[]>([])
  const [labs, setLabs] = useState<LabResult[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [addForm, setAddForm] = useState<AddFormState | null>(null)
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [vRes, cRes, aRes, lRes] = await Promise.all([
        fetch('/api/patient/vitals'),
        fetch('/api/patient/conditions'),
        fetch('/api/patient/allergies'),
        fetch('/api/patient/lab-results'),
      ])

      const vData = vRes.ok ? await vRes.json() : { vitals: [] }
      const cData = cRes.ok ? await cRes.json() : { conditions: [] }
      const aData = aRes.ok ? await aRes.json() : { allergies: [] }
      const lData = lRes.ok ? await lRes.json() : { results: [] }

      setVitals(vData.vitals || [])
      setConditions(cData.conditions || [])
      setAllergies(aData.allergies || [])
      setLabs(lData.results || [])
    } catch (err) {
      console.error('Health load error:', err)
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const openAddCondition = () =>
    setAddForm({
      kind: 'condition',
      name: '',
      status: 'active',
      date: new Date().toISOString().slice(0, 10),
    })

  const openAddAllergy = () =>
    setAddForm({
      kind: 'allergy',
      name: '',
      reaction: '',
      severity: 'moderate',
      date: new Date().toISOString().slice(0, 10),
    })

  const handleSubmit = async (next: AddFormState) => {
    setAddSubmitting(true)
    setAddError(null)
    try {
      if (!next.name.trim()) {
        throw new Error('الاسم مطلوب')
      }
      if (next.kind === 'condition') {
        const res = await fetch('/api/patient/conditions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: next.name.trim(),
            status: next.status || 'active',
            diagnosed_date: next.date,
            notes: next.notes?.trim() || '',
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'فشل في الإضافة')
        if (data.condition) {
          setConditions((prev) => [data.condition, ...prev])
        }
      } else {
        const res = await fetch('/api/patient/allergies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            allergen: next.name.trim(),
            reaction: next.reaction?.trim() || '',
            severity: next.severity || 'moderate',
            recorded_date: next.date,
            notes: next.notes?.trim() || '',
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'فشل في الإضافة')
        if (data.allergy) {
          setAllergies((prev) => [data.allergy, ...prev])
        }
      }
      setAddForm(null)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'فشل في الحفظ')
    } finally {
      setAddSubmitting(false)
    }
  }

  const content = useMemo(() => {
    if (loading) return <LoadingSkeleton />
    if (error) return <ErrorState message={error} onRetry={loadAll} />

    switch (tab) {
      case 'overview':
        return (
          <OverviewTab
            vitals={vitals}
            conditions={conditions}
            allergies={allergies}
            labs={labs}
          />
        )
      case 'vitals':
        return <VitalsTab vitals={vitals} />
      case 'conditions':
        return (
          <ConditionsTab conditions={conditions} onAdd={openAddCondition} />
        )
      case 'allergies':
        return <AllergiesTab allergies={allergies} onAdd={openAddAllergy} />
      case 'labs':
        return <LabsTab labs={labs} />
      default:
        return null
    }
  }, [tab, loading, error, vitals, conditions, allergies, labs, loadAll])

  return (
    <>
      <PatientHeader title="سجلي الصحي" />
      <div dir="rtl" className="px-4 py-5 space-y-5">
        <div>
          <h2 className="font-cairo text-[20px] font-bold text-[#030712] leading-tight">
            سجلي الصحي
          </h2>
          <p className="font-cairo text-[13px] text-[#6B7280] mt-1">
            علامات حيوية، أمراض، حساسية، وتحاليل
          </p>
        </div>

        <HealthTabs active={tab} onChange={setTab} />

        {content}
      </div>

      {addForm && (
        <AddFormModal
          state={addForm}
          onClose={() => {
            setAddForm(null)
            setAddError(null)
          }}
          onSubmit={handleSubmit}
          submitting={addSubmitting}
          error={addError}
        />
      )}
    </>
  )
}
