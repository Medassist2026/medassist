'use client'

/**
 * /patient/settings/caregivers — B07 Phase F (Section 6, list view only).
 *
 * Lists delegations the user has GRANTED to other patients (Pattern B,
 * principal side). Each row shows status (pending acceptance / active /
 * revoked / expired), capabilities, expiry, and offers revoke +
 * edit-capabilities actions.
 *
 * GRANT FLOW DEFERRED — Mo's 2026-05-09 ruling on Phase F session scope:
 * the patient-side phone→userId lookup endpoint does not exist (Phase F
 * finding #3). Without it, the grant form has no way to identify the
 * delegate. Phase F.5 ships the lookup endpoint AND the grant form
 * together. For MVP, the "Add a caregiver" CTA on this page links to a
 * placeholder that explains the deferred state.
 *
 * Mo ruling 4: 5 capability checkboxes only (consent_to_share excluded).
 * The capability label list is sourced from ALLOWED_DELEGATION_CAPABILITIES.
 */

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Clock, ShieldCheck, UserPlus } from 'lucide-react'
import { PatientHeader } from '@ui-clinic/components/patient/PatientHeader'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'
import { AccountSwitcher } from '@patient/components/AccountSwitcher'

const CAPABILITY_LABELS_AR: Record<string, string> = {
  view_records: 'الاطلاع على سجلاتي الصحية',
  receive_notifications: 'استلام إشعارات تخصني',
  book_appointments: 'حجز مواعيد بالنيابة عني',
  manage_medications: 'إدارة أدويتي',
  consent_to_messaging: 'مراسلة عياداتي بالنيابة',
}

const ALL_CAPABILITIES = [
  'view_records',
  'receive_notifications',
  'book_appointments',
  'manage_medications',
  'consent_to_messaging',
] as const

interface Delegation {
  id: string
  principal_global_patient_id: string
  delegate_user_id: string
  delegate_global_patient_id: string | null
  capabilities: string[]
  granted_at: string
  accepted_at: string | null
  expires_at: string | null
  revoked_at: string | null
  revoke_reason: string | null
}

type DelegationStatus = 'pending' | 'active' | 'revoked' | 'expired'

function statusOf(d: Delegation): DelegationStatus {
  if (d.revoked_at) return 'revoked'
  if (d.expires_at && new Date(d.expires_at).getTime() < Date.now()) return 'expired'
  if (!d.accepted_at) return 'pending'
  return 'active'
}

function statusBadge(s: DelegationStatus): { label: string; bg: string; border: string; text: string } {
  switch (s) {
    case 'pending':
      return {
        label: 'بانتظار القبول',
        bg: '#FEF3C7',
        border: '#FCD34D',
        text: '#92400E',
      }
    case 'active':
      return {
        label: 'نشط',
        bg: '#F0FDF4',
        border: '#BBF7D0',
        text: '#166534',
      }
    case 'revoked':
      return {
        label: 'ملغى',
        bg: '#FEF2F2',
        border: '#FECACA',
        text: '#B91C1C',
      }
    case 'expired':
      return {
        label: 'منتهي',
        bg: '#F3F4F6',
        border: '#E5E7EB',
        text: '#4B5563',
      }
  }
}

function expiryLabel(d: Delegation): string {
  if (!d.expires_at) return ''
  const ts = new Date(d.expires_at).getTime()
  const now = Date.now()
  if (ts < now) return 'منتهي الصلاحية'
  const days = Math.round((ts - now) / (1000 * 60 * 60 * 24))
  if (days < 30) return `ينتهي خلال ${days} يوم`
  try {
    return `ينتهي ${new Date(d.expires_at).toLocaleDateString('ar-EG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`
  } catch {
    return ''
  }
}

export default function CaregiversSettingsPage() {
  const [delegations, setDelegations] = useState<Delegation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pendingRevoke, setPendingRevoke] = useState<Delegation | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [savingCapsId, setSavingCapsId] = useState<string | null>(null)
  const [editingCaps, setEditingCaps] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/patient/delegations/granted', { cache: 'no-store' })
      if (!res.ok) {
        setError('فشل تحميل قائمة مقدمي الرعاية')
        return
      }
      const json = await res.json()
      setDelegations(Array.isArray(json?.delegations) ? json.delegations : [])
    } catch (err) {
      console.error('load caregivers failed:', err)
      setError('فشل الاتصال بالخادم')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const handleRevoke = useCallback(async () => {
    if (!pendingRevoke) return
    setRevokingId(pendingRevoke.id)
    try {
      const res = await fetch(
        `/api/patient/delegations/${pendingRevoke.id}/revoke`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }
      )
      if (res.ok) {
        showToast('تم إلغاء مقدم الرعاية')
        await load()
      } else {
        showToast('فشل الإلغاء — حاول لاحقاً')
      }
    } catch {
      showToast('فشل الإلغاء — حاول لاحقاً')
    } finally {
      setRevokingId(null)
      setPendingRevoke(null)
    }
  }, [pendingRevoke, load, showToast])

  const toggleCap = useCallback(
    (delId: string, cap: string) => {
      setDelegations((list) =>
        list.map((d) => {
          if (d.id !== delId) return d
          const has = d.capabilities.includes(cap)
          return {
            ...d,
            capabilities: has
              ? d.capabilities.filter((c) => c !== cap)
              : [...d.capabilities, cap],
          }
        })
      )
      setEditingCaps((prev) => new Set(prev).add(delId))
    },
    []
  )

  const saveCaps = useCallback(
    async (del: Delegation) => {
      setSavingCapsId(del.id)
      try {
        const res = await fetch(
          `/api/patient/delegations/${del.id}/capabilities`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ capabilities: del.capabilities }),
          }
        )
        if (res.ok) {
          showToast('تم حفظ الصلاحيات')
          setEditingCaps((prev) => {
            const next = new Set(prev)
            next.delete(del.id)
            return next
          })
          await load()
        } else {
          const json = await res.json().catch(() => ({}))
          showToast(json?.error || 'فشل حفظ الصلاحيات')
        }
      } catch {
        showToast('فشل الاتصال بالخادم')
      } finally {
        setSavingCapsId(null)
      }
    },
    [load, showToast]
  )

  return (
    <div className="font-cairo">
      <PatientHeader
        title="مقدمو الرعاية"
        showBack
        action={<AccountSwitcher />}
      />

      <div className="px-4 pt-4 pb-24">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-cairo text-[18px] font-bold text-[#030712]">
              مقدمو الرعاية
            </h2>
            <p className="font-cairo text-[12px] text-[#6B7280] mt-0.5">
              الأشخاص الذين فوّضتهم بمساعدتك في رعايتك الصحية
            </p>
          </div>
        </div>

        {/* Phase F MVP: grant flow deferred — explanatory placeholder */}
        <div className="bg-white border-[0.8px] border-[#E5E7EB] rounded-[12px] p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FEF3C7] flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-[#B45309]" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-cairo text-[13px] font-semibold text-[#030712]">
                إضافة مقدم رعاية جديد قريباً
              </p>
              <p className="font-cairo text-[11px] text-[#6B7280] leading-[16px] mt-1">
                تفعيل إضافة مقدمي الرعاية برقم الهاتف قيد التطوير ضمن المرحلة
                التالية. حالياً يمكنك إدارة مقدمي الرعاية الموجودين فقط.
              </p>
            </div>
          </div>
        </div>

        {loading && (
          <div className="space-y-2">
            <div className="h-20 bg-[#E5E7EB] rounded-[12px] animate-pulse" />
            <div className="h-20 bg-[#E5E7EB] rounded-[12px] animate-pulse" />
          </div>
        )}

        {!loading && error && (
          <div className="bg-[#FEF2F2] border-[0.8px] border-[#FECACA] rounded-[12px] p-4">
            <p className="font-cairo text-[13px] text-[#B91C1C]">{error}</p>
          </div>
        )}

        {!loading && !error && delegations.length === 0 && (
          <div className="bg-white border-[0.8px] border-[#E5E7EB] rounded-[12px] p-6 text-center">
            <div className="w-14 h-14 mx-auto bg-[#F0FDF4] rounded-full flex items-center justify-center mb-3">
              <ShieldCheck className="w-7 h-7 text-[#16A34A]" strokeWidth={1.8} />
            </div>
            <p className="font-cairo text-[14px] font-semibold text-[#030712] mb-1">
              لا يوجد مقدمو رعاية بعد
            </p>
            <p className="font-cairo text-[12px] text-[#6B7280] leading-[18px]">
              أضف شخصاً تثق به لمساعدتك في إدارة رعايتك — متاح قريباً.
            </p>
          </div>
        )}

        {!loading && !error && delegations.length > 0 && (
          <ul className="space-y-2">
            {delegations.map((d) => {
              const status = statusOf(d)
              const badge = statusBadge(status)
              const expanded = expandedId === d.id
              const isEditingCaps = editingCaps.has(d.id)
              const canEdit = status === 'pending' || status === 'active'
              return (
                <li
                  key={d.id}
                  className="bg-white border-[0.8px] border-[#E5E7EB] rounded-[12px] overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : d.id)}
                    className="w-full p-3.5 flex items-center gap-3 hover:bg-[#F9FAFB] transition-colors text-right"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
                      <UserPlus className="w-4 h-4 text-[#16A34A]" strokeWidth={1.8} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-cairo text-[13px] font-semibold text-[#030712] truncate">
                          {d.delegate_global_patient_id
                            ? `مقدم رعاية #${d.delegate_global_patient_id.slice(0, 8)}`
                            : `مقدم رعاية #${d.delegate_user_id.slice(0, 8)}`}
                        </p>
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full font-cairo text-[10px] font-medium border-[0.8px]"
                          style={{
                            backgroundColor: badge.bg,
                            borderColor: badge.border,
                            color: badge.text,
                          }}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p className="font-cairo text-[11px] text-[#6B7280] truncate">
                        {d.capabilities.length === 0
                          ? 'بدون صلاحيات'
                          : `${d.capabilities.length} صلاحيات · ${expiryLabel(d)}`}
                      </p>
                    </div>
                    {expanded ? (
                      <ChevronUp
                        className="w-4 h-4 text-[#9CA3AF] flex-shrink-0"
                        strokeWidth={2}
                      />
                    ) : (
                      <ChevronDown
                        className="w-4 h-4 text-[#9CA3AF] flex-shrink-0"
                        strokeWidth={2}
                      />
                    )}
                  </button>

                  {expanded && (
                    <div className="border-t-[0.8px] border-[#F3F4F6] p-3.5 bg-[#FAFAFA]">
                      {/* Capabilities */}
                      <div className="mb-3">
                        <p className="font-cairo text-[12px] font-semibold text-[#030712] mb-2">
                          الصلاحيات
                        </p>
                        <div className="space-y-1.5">
                          {ALL_CAPABILITIES.map((cap) => {
                            const checked = d.capabilities.includes(cap)
                            return (
                              <label
                                key={cap}
                                className={`flex items-center gap-2 p-2 rounded-[8px] border-[0.8px] ${
                                  canEdit ? 'cursor-pointer' : 'opacity-60'
                                } ${
                                  checked
                                    ? 'bg-white border-[#BBF7D0]'
                                    : 'bg-white border-[#E5E7EB]'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!canEdit}
                                  onChange={() => canEdit && toggleCap(d.id, cap)}
                                  className="w-4 h-4 rounded accent-[#16A34A]"
                                />
                                <span className="font-cairo text-[12px] text-[#030712]">
                                  {CAPABILITY_LABELS_AR[cap]}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                        {isEditingCaps && (
                          <button
                            type="button"
                            onClick={() => saveCaps(d)}
                            disabled={savingCapsId === d.id}
                            className="mt-2 w-full h-[36px] rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 font-cairo text-[12px] font-semibold text-white transition-colors"
                          >
                            {savingCapsId === d.id ? 'جاري الحفظ...' : 'حفظ الصلاحيات'}
                          </button>
                        )}
                      </div>

                      {/* Revoke action */}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setPendingRevoke(d)}
                          disabled={revokingId === d.id}
                          className="w-full h-[36px] rounded-[10px] border-[0.8px] border-[#FECACA] bg-white hover:bg-[#FEF2F2] font-cairo text-[12px] font-semibold text-[#B91C1C] disabled:opacity-50 transition-colors"
                        >
                          {revokingId === d.id ? 'جاري الإلغاء...' : 'إلغاء مقدم الرعاية'}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Confirm revoke */}
      <ConfirmDialog
        isOpen={!!pendingRevoke}
        onCancel={() => setPendingRevoke(null)}
        onConfirm={handleRevoke}
        title="إلغاء مقدم الرعاية؟"
        message="لن يستطيع مقدم الرعاية الوصول إلى سجلاتك أو التصرف بالنيابة عنك بعد الآن. يمكن إعادة دعوته لاحقاً عند توفر إضافة مقدم رعاية."
        confirmLabel="إلغاء مقدم الرعاية"
        cancelLabel="تراجع"
        confirmVariant="danger"
      />

      {toast && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#16A34A] text-white font-cairo text-[13px] font-medium px-4 py-2.5 rounded-[10px] shadow-lg z-50"
        >
          {toast}
        </div>
      )}
    </div>
  )
}
