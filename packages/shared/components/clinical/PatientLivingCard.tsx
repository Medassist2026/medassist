'use client'

/**
 * PatientLivingCard
 *
 * Compact clinical memory card shown at the top of SessionForm Step 2
 * when a returning patient is selected.
 *
 * Design principles:
 *  - Default COLLAPSED (1 slim line) — never distracts from the current session
 *  - Expand on tap to show last visit detail + visit timeline
 *  - "Renew" button next to each prior medication — one tap to carry it forward
 *  - Subdued palette (slate/amber) so it doesn't compete with the green action UI
 *  - Never shown for first-time patients (isReturning = false)
 */

import { useState, useEffect, useCallback } from 'react'
import type { MedicationEntry } from './MedicationChips'

// ============================================================================
// TYPES
// ============================================================================

interface LastVisit {
  id: string
  date: string
  complaints: string[]
  diagnoses: string[]
  medications: Array<{ name: string; frequency: string; duration: string }>
  plan: string
}

interface VisitTimelineItem {
  id: string
  date: string
  complaints: string[]
  medCount: number
  diagCount: number
}

interface PatientSummary {
  isReturning: boolean
  totalVisits: number
  lastVisit: LastVisit | null
  visitTimeline: VisitTimelineItem[]
  allergies: string[]
  chronicDiseases: string[]
  pendingFollowUp: { date: string; notes: string } | null
}

interface PatientLivingCardProps {
  patientId: string
  /** Called when doctor taps "تجديد" next to a prior medication */
  onRenewMedication: (med: MedicationEntry) => void
  /** Called when doctor wants to pre-fill allergies from last visit */
  onApplyAllergies?: (allergies: string[]) => void
  /** Called when doctor wants to pre-fill chronic diseases from last visit */
  onApplyChronicDiseases?: (diseases: string[]) => void
  /**
   * When true, allergies and chronic diseases from the patient's history
   * are applied automatically on load — no button click required.
   * The callbacks are still fired so the parent state updates.
   * Default: true
   */
  autoApplyHistory?: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDateAr(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function daysSince(dateStr: string): number {
  try {
    const diff = Date.now() - new Date(dateStr).getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  } catch {
    return 0
  }
}

function daysLabel(days: number): string {
  if (days === 0) return 'اليوم'
  if (days === 1) return 'أمس'
  if (days < 7)  return `منذ ${days} أيام`
  if (days < 30) return `منذ ${Math.floor(days / 7)} أسابيع`
  if (days < 365) return `منذ ${Math.floor(days / 30)} شهور`
  return `منذ ${Math.floor(days / 365)} سنة`
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function MiniTimeline({ visits }: { visits: VisitTimelineItem[] }) {
  if (visits.length < 2) return null

  return (
    <div className="mt-3 pt-3 border-t border-[#E2E8F0]">
      <p className="font-cairo text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">
        سجل الزيارات
      </p>
      <div className="flex items-start gap-0">
        {visits.map((v, i) => {
          const days = daysSince(v.date)
          const isFirst = i === 0
          return (
            <div key={v.id} className="flex-1 flex flex-col items-center relative">
              {/* Connector line */}
              {i < visits.length - 1 && (
                <div className="absolute top-2 right-1/2 w-full h-px bg-[#CBD5E1]" />
              )}
              {/* Dot */}
              <div className={`w-4 h-4 rounded-full border-2 z-10 flex-shrink-0 ${
                isFirst
                  ? 'bg-[#0EA5E9] border-[#0EA5E9]'
                  : 'bg-white border-[#CBD5E1]'
              }`} />
              {/* Label */}
              <div className="mt-1 text-center px-0.5">
                <p className={`font-cairo text-[9px] leading-tight ${isFirst ? 'text-[#0EA5E9] font-bold' : 'text-[#94A3B8]'}`}>
                  {daysLabel(days)}
                </p>
                {v.complaints[0] && (
                  <p className="font-cairo text-[8.5px] text-[#64748B] leading-tight mt-0.5 truncate max-w-[50px]">
                    {v.complaints[0]}
                  </p>
                )}
                {v.medCount > 0 && (
                  <p className="font-cairo text-[8px] text-[#94A3B8]">{v.medCount} أدوية</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PatientLivingCard({
  patientId,
  onRenewMedication,
  onApplyAllergies,
  onApplyChronicDiseases,
  autoApplyHistory = true,
}: PatientLivingCardProps) {
  const [summary, setSummary]   = useState<PatientSummary | null>(null)
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [renewed, setRenewed]   = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/clinical/patient-summary?patientId=${patientId}`)
      if (res.ok) {
        const data: PatientSummary = await res.json()
        setSummary(data)

        // Auto-apply allergies and chronic diseases from history on first load.
        // Merging is handled by the parent (Set dedup). This eliminates the need
        // for the doctor to click "تطبيق الحساسيات" for every returning patient.
        if (autoApplyHistory !== false && data.isReturning) {
          if (data.allergies?.length > 0 && onApplyAllergies) {
            onApplyAllergies(data.allergies)
          }
          if (data.chronicDiseases?.length > 0 && onApplyChronicDiseases) {
            onApplyChronicDiseases(data.chronicDiseases)
          }
        }
      }
    } catch { /* network error — card just won't appear */ }
    finally { setLoading(false) }
  }, [patientId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // Don't render at all for new patients or while loading
  if (loading || !summary || !summary.isReturning || !summary.lastVisit) return null

  const { lastVisit, visitTimeline, allergies, chronicDiseases, pendingFollowUp, totalVisits } = summary
  const daysSinceLast = daysSince(lastVisit.date)
  const mainComplaint = lastVisit.complaints[0] || ''
  const extraComplaints = lastVisit.complaints.length > 1 ? lastVisit.complaints.length - 1 : 0

  const handleRenew = (med: { name: string; frequency: string; duration: string }) => {
    const key = med.name
    if (renewed.has(key)) return
    setRenewed(prev => new Set([...prev, key]))
    onRenewMedication({
      name:      med.name,
      frequency: med.frequency || 'كل 12 ساعة',
      timings:   ['صباح', 'مساء'],
      duration:  med.duration  || undefined,
      dosageCount: '1',
      form:      'أقراص',
      isExpanded: false,
    })
  }

  return (
    <div className="rounded-[12px] border border-[#E2E8F0] bg-[#F8FAFC] overflow-hidden">

      {/* ── COLLAPSED HEADER (always visible) ────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded(p => !p)}
        className="w-full px-3 py-2.5 flex items-center gap-2.5 text-right hover:bg-[#F1F5F9] transition-colors"
      >
        {/* History icon */}
        <div className="w-7 h-7 rounded-full bg-[#E0F2FE] flex items-center justify-center flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-[#0EA5E9]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        {/* Summary line */}
        <div className="flex-1 min-w-0 text-right">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-cairo text-[12px] font-bold text-[#334155]">
              آخر زيارة {daysLabel(daysSinceLast)}
            </span>
            {mainComplaint && (
              <>
                <span className="text-[#CBD5E1] text-[10px]">·</span>
                <span className="font-cairo text-[11px] text-[#64748B] truncate max-w-[140px]">
                  {mainComplaint}
                  {extraComplaints > 0 && <span className="text-[#94A3B8]"> +{extraComplaints}</span>}
                </span>
              </>
            )}
            {lastVisit.medications.length > 0 && (
              <>
                <span className="text-[#CBD5E1] text-[10px]">·</span>
                <span className="font-cairo text-[11px] text-[#94A3B8]">
                  {lastVisit.medications.length} {lastVisit.medications.length === 1 ? 'دواء' : 'أدوية'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Expand chevron */}
        <svg
          className={`w-4 h-4 text-[#94A3B8] transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── CRITICAL CONTEXT TAGS (always visible when data exists) ──────── */}
      {(allergies.length > 0 || chronicDiseases.length > 0 || pendingFollowUp) && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5 border-b border-[#E2E8F0]">
          {allergies.map(a => (
            <span key={a} className="flex items-center gap-1 px-2 py-0.5 bg-[#FEF2F2] border border-[#FECACA] rounded-full font-cairo text-[10px] font-semibold text-[#DC2626]">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              حساسية: {a}
            </span>
          ))}
          {chronicDiseases.map(d => (
            <span key={d} className="px-2 py-0.5 bg-[#FFF7ED] border border-[#FED7AA] rounded-full font-cairo text-[10px] font-semibold text-[#C2410C]">
              {d}
            </span>
          ))}
          {pendingFollowUp && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-full font-cairo text-[10px] font-semibold text-[#1D4ED8]">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5" />
              </svg>
              متابعة: {formatDateAr(pendingFollowUp.date)}
            </span>
          )}
        </div>
      )}

      {/* ── EXPANDED DETAIL (animated) ────────────────────────────────────── */}
      <div style={{
        maxHeight: expanded ? '600px' : '0px',
        overflow: 'hidden',
        transition: 'max-height 280ms cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div className="px-3 pt-2 pb-3 space-y-3">

          {/* Diagnoses from last visit */}
          {lastVisit.diagnoses.length > 0 && (
            <div>
              <p className="font-cairo text-[10px] font-semibold text-[#94A3B8] mb-1">التشخيص</p>
              <div className="flex flex-wrap gap-1">
                {lastVisit.diagnoses.map((d, i) => (
                  <span key={i} className="px-2 py-0.5 bg-[#F1F5F9] rounded-[6px] font-cairo text-[11px] text-[#475569]">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Medications from last visit — with Renew button */}
          {lastVisit.medications.length > 0 && (
            <div>
              <p className="font-cairo text-[10px] font-semibold text-[#94A3B8] mb-1.5">
                الأدوية السابقة
                <span className="font-normal text-[#CBD5E1] mr-1">— اضغط تجديد لإضافة للروشتة</span>
              </p>
              <div className="space-y-1">
                {lastVisit.medications.map((med, i) => {
                  const isRenewed = renewed.has(med.name)
                  return (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-cairo text-[12px] font-semibold text-[#1E293B] truncate">{med.name}</p>
                        {(med.frequency || med.duration) && (
                          <p className="font-cairo text-[10px] text-[#64748B]">
                            {[med.frequency, med.duration && `لمدة ${med.duration}`].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRenew(med)}
                        disabled={isRenewed}
                        className={`flex-shrink-0 px-2.5 py-1 rounded-[7px] font-cairo text-[11px] font-bold transition-colors ${
                          isRenewed
                            ? 'bg-[#DCFCE7] text-[#16A34A] cursor-default'
                            : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] border border-[#E2E8F0]'
                        }`}
                      >
                        {isRenewed ? '✓ أُضيف' : 'تجديد'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Doctor's plan/notes from last visit */}
          {lastVisit.plan && (
            <div className="px-2.5 py-2 bg-[#F1F5F9] rounded-[8px]">
              <p className="font-cairo text-[10px] font-semibold text-[#94A3B8] mb-0.5">ملاحظات آخر زيارة</p>
              <p className="font-cairo text-[11px] text-[#475569] leading-relaxed line-clamp-2">{lastVisit.plan}</p>
            </div>
          )}

          {/* One-tap apply buttons for allergies / chronic diseases */}
          {(allergies.length > 0 || chronicDiseases.length > 0) && (
            <div className="flex flex-wrap gap-2 pt-1 border-t border-[#E2E8F0]">
              {allergies.length > 0 && onApplyAllergies && (
                <button
                  type="button"
                  onClick={() => onApplyAllergies(allergies)}
                  className="font-cairo text-[11px] text-[#DC2626] hover:text-[#991B1B] font-medium transition-colors"
                >
                  + تطبيق الحساسيات
                </button>
              )}
              {chronicDiseases.length > 0 && onApplyChronicDiseases && (
                <button
                  type="button"
                  onClick={() => onApplyChronicDiseases(chronicDiseases)}
                  className="font-cairo text-[11px] text-[#C2410C] hover:text-[#9A3412] font-medium transition-colors"
                >
                  + تطبيق الأمراض المزمنة
                </button>
              )}
            </div>
          )}

          {/* Visit timeline */}
          <MiniTimeline visits={visitTimeline} />

          {/* Footer: total visits + full history link */}
          <div className="flex items-center justify-between pt-1">
            <p className="font-cairo text-[10px] text-[#94A3B8]">
              إجمالي الزيارات مع طبيبك: {totalVisits}+
            </p>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="font-cairo text-[10px] text-[#94A3B8] hover:text-[#64748B]"
            >
              طي
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
