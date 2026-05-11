'use client'

/**
 * /patient/settings/caregiving — B07 Phase F (Section 7).
 *
 * Lists delegations the user has RECEIVED (Pattern B, delegate side):
 *   - Pending: needs acceptance — Accept / Decline buttons
 *   - Active : already accepted — Withdraw caregiving button
 *
 * Per Mo ruling 25 (UI ruling 5): in-app notification only. No deep-link,
 * no SMS in MVP. The dashboard pending-delegations card surfaces this page
 * when count > 0; the AccountSwitcher header badge mirrors the same count.
 *
 * Decline maps to revoke-with-reason='declined_by_delegate' per the Phase
 * E /revoke endpoint's auto-discriminator (delegate revokes →
 * DELEGATION_WITHDRAWN audit; reason is captured in metadata).
 */

import { useCallback, useEffect, useState } from 'react'
import { Bell, Check, ShieldCheck, X } from 'lucide-react'
import { PatientHeader } from '@ui-clinic/components/patient/PatientHeader'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'
import { AccountSwitcher } from '@patient/components/AccountSwitcher'
import { useAccountSwitcher } from '@patient/lib/contexts/account-context'

const CAPABILITY_LABELS_AR: Record<string, string> = {
  view_records: 'الاطلاع على السجلات الصحية',
  receive_notifications: 'استلام الإشعارات',
  book_appointments: 'حجز المواعيد',
  manage_medications: 'إدارة الأدوية',
  consent_to_messaging: 'مراسلة العيادات',
}

interface Delegation {
  id: string
  principal_global_patient_id: string
  delegate_user_id: string
  delegate_global_patient_id: string | null
  /** Phase F.5 Section 4 — populated by listReceivedDelegations JOIN. */
  principal_display_name: string | null
  delegate_display_name: string | null
  capabilities: string[]
  granted_at: string
  accepted_at: string | null
  expires_at: string | null
  revoked_at: string | null
}

function formatArabicDate(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('ar-EG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function isActive(d: Delegation): boolean {
  if (!d.accepted_at) return false
  if (d.revoked_at) return false
  if (d.expires_at && new Date(d.expires_at).getTime() < Date.now()) return false
  return true
}

function isPending(d: Delegation): boolean {
  if (d.accepted_at) return false
  if (d.revoked_at) return false
  if (d.expires_at && new Date(d.expires_at).getTime() < Date.now()) return false
  return true
}

export default function CaregivingReceivedPage() {
  const { refetch: refreshAccountContext } = useAccountSwitcher()
  const [delegations, setDelegations] = useState<Delegation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [pendingWithdraw, setPendingWithdraw] = useState<Delegation | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/patient/delegations/received', { cache: 'no-store' })
      if (!res.ok) {
        setError('فشل تحميل قائمة الرعاية')
        return
      }
      const json = await res.json()
      setDelegations(Array.isArray(json?.delegations) ? json.delegations : [])
    } catch {
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

  const onAccept = useCallback(
    async (d: Delegation) => {
      setActingId(d.id)
      try {
        const res = await fetch(`/api/patient/delegations/${d.id}/accept`, {
          method: 'PATCH',
        })
        if (res.ok) {
          showToast('تم قبول طلب الرعاية — يمكنك الآن التبديل إلى حسابهم')
          await Promise.all([load(), refreshAccountContext()])
        } else {
          const json = await res.json().catch(() => ({}))
          showToast(json?.error || 'فشل قبول الطلب')
        }
      } catch {
        showToast('فشل الاتصال بالخادم')
      } finally {
        setActingId(null)
      }
    },
    [load, refreshAccountContext, showToast]
  )

  const onDecline = useCallback(
    async (d: Delegation) => {
      setActingId(d.id)
      try {
        const res = await fetch(`/api/patient/delegations/${d.id}/revoke`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'declined_by_delegate' }),
        })
        if (res.ok) {
          showToast('تم رفض طلب الرعاية')
          await Promise.all([load(), refreshAccountContext()])
        } else {
          showToast('فشل الرفض — حاول لاحقاً')
        }
      } catch {
        showToast('فشل الاتصال بالخادم')
      } finally {
        setActingId(null)
      }
    },
    [load, refreshAccountContext, showToast]
  )

  const onWithdrawConfirmed = useCallback(async () => {
    if (!pendingWithdraw) return
    setActingId(pendingWithdraw.id)
    try {
      const res = await fetch(
        `/api/patient/delegations/${pendingWithdraw.id}/revoke`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'withdrawn_by_delegate' }),
        }
      )
      if (res.ok) {
        showToast('تم الانسحاب من الرعاية')
        await Promise.all([load(), refreshAccountContext()])
      } else {
        showToast('فشل الانسحاب — حاول لاحقاً')
      }
    } catch {
      showToast('فشل الاتصال بالخادم')
    } finally {
      setActingId(null)
      setPendingWithdraw(null)
    }
  }, [pendingWithdraw, load, refreshAccountContext, showToast])

  const pending = delegations.filter(isPending)
  const active = delegations.filter(isActive)

  return (
    <div className="font-cairo">
      <PatientHeader
        title="الرعاية المُقدَّمة"
        showBack
        leadingAction={<AccountSwitcher />}
      />

      <div className="px-4 pt-4 pb-24">
        <div className="mb-4">
          <h2 className="font-cairo text-[18px] font-bold text-[#030712]">
            الرعاية التي أقدّمها
          </h2>
          <p className="font-cairo text-[12px] text-[#6B7280] mt-0.5">
            الأشخاص الذين فوّضوك بالمساعدة في رعايتهم الصحية
          </p>
        </div>

        {loading && (
          <div className="space-y-2">
            <div className="h-24 bg-[#E5E7EB] rounded-[12px] animate-pulse" />
            <div className="h-24 bg-[#E5E7EB] rounded-[12px] animate-pulse" />
          </div>
        )}

        {!loading && error && (
          <div className="bg-[#FEF2F2] border-[0.8px] border-[#FECACA] rounded-[12px] p-4">
            <p className="font-cairo text-[13px] text-[#B91C1C]">{error}</p>
          </div>
        )}

        {/* Pending section */}
        {!loading && !error && pending.length > 0 && (
          <section className="mb-5">
            <h3 className="font-cairo text-[14px] font-semibold text-[#030712] mb-2 flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-[#B45309]" strokeWidth={2} />
              بانتظار قبولك
              <span className="bg-[#FEF3C7] text-[#92400E] text-[10px] font-bold rounded-full px-2 py-0.5">
                {pending.length}
              </span>
            </h3>
            <ul className="space-y-2">
              {pending.map((d) => (
                <li
                  key={d.id}
                  className="bg-white border-[0.8px] border-[#FCD34D] rounded-[12px] p-3.5"
                >
                  <p className="font-cairo text-[13px] font-semibold text-[#030712] mb-1">
                    {d.principal_display_name
                      ? `دعوة لتكون مقدم رعاية لـ ${d.principal_display_name}`
                      : 'دعوة لتكون مقدم رعاية'}
                  </p>
                  <p className="font-cairo text-[11px] text-[#6B7280] mb-2.5">
                    منذ {formatArabicDate(d.granted_at)} ·{' '}
                    {d.expires_at
                      ? `تنتهي ${formatArabicDate(d.expires_at)}`
                      : 'بدون انتهاء'}
                  </p>
                  {d.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {d.capabilities.map((cap) => (
                        <span
                          key={cap}
                          className="inline-flex items-center px-2 py-0.5 rounded-full font-cairo text-[10px] font-medium bg-[#F0FDF4] border-[0.8px] border-[#BBF7D0] text-[#166534]"
                        >
                          {CAPABILITY_LABELS_AR[cap] ?? cap}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onAccept(d)}
                      disabled={actingId === d.id}
                      className="flex-1 h-[36px] rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 font-cairo text-[12px] font-semibold text-white inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                      قبول
                    </button>
                    <button
                      type="button"
                      onClick={() => onDecline(d)}
                      disabled={actingId === d.id}
                      className="flex-1 h-[36px] rounded-[10px] border-[0.8px] border-[#FECACA] bg-white hover:bg-[#FEF2F2] disabled:opacity-50 font-cairo text-[12px] font-semibold text-[#B91C1C] inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                      رفض
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Active section */}
        {!loading && !error && active.length > 0 && (
          <section className="mb-5">
            <h3 className="font-cairo text-[14px] font-semibold text-[#030712] mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#16A34A]" strokeWidth={2} />
              نشطة
              <span className="bg-[#F0FDF4] text-[#166534] text-[10px] font-bold rounded-full px-2 py-0.5">
                {active.length}
              </span>
            </h3>
            <ul className="space-y-2">
              {active.map((d) => (
                <li
                  key={d.id}
                  className="bg-white border-[0.8px] border-[#E5E7EB] rounded-[12px] p-3.5"
                >
                  <p className="font-cairo text-[13px] font-semibold text-[#030712] mb-1">
                    رعاية مفعّلة
                  </p>
                  <p className="font-cairo text-[11px] text-[#6B7280] mb-2.5">
                    قُبلت {formatArabicDate(d.accepted_at)} ·{' '}
                    {d.expires_at
                      ? `تنتهي ${formatArabicDate(d.expires_at)}`
                      : 'بدون انتهاء'}
                  </p>
                  {d.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {d.capabilities.map((cap) => (
                        <span
                          key={cap}
                          className="inline-flex items-center px-2 py-0.5 rounded-full font-cairo text-[10px] font-medium bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] text-[#4B5563]"
                        >
                          {CAPABILITY_LABELS_AR[cap] ?? cap}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingWithdraw(d)}
                    disabled={actingId === d.id}
                    className="w-full h-[36px] rounded-[10px] border-[0.8px] border-[#FECACA] bg-white hover:bg-[#FEF2F2] disabled:opacity-50 font-cairo text-[12px] font-semibold text-[#B91C1C] transition-colors"
                  >
                    {actingId === d.id ? 'جاري...' : 'الانسحاب من الرعاية'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Empty state */}
        {!loading && !error && pending.length === 0 && active.length === 0 && (
          <div className="bg-white border-[0.8px] border-[#E5E7EB] rounded-[12px] p-6 text-center">
            <div className="w-14 h-14 mx-auto bg-[#F0FDF4] rounded-full flex items-center justify-center mb-3">
              <ShieldCheck className="w-7 h-7 text-[#16A34A]" strokeWidth={1.8} />
            </div>
            <p className="font-cairo text-[14px] font-semibold text-[#030712] mb-1">
              لا أحد فوّضك بالرعاية بعد
            </p>
            <p className="font-cairo text-[12px] text-[#6B7280] leading-[18px]">
              عندما يضيفك شخص كمقدم رعاية، ستظهر دعوته هنا للقبول.
            </p>
          </div>
        )}
      </div>

      {/* Confirm withdraw */}
      <ConfirmDialog
        isOpen={!!pendingWithdraw}
        onCancel={() => setPendingWithdraw(null)}
        onConfirm={onWithdrawConfirmed}
        title="الانسحاب من الرعاية؟"
        message="لن تتمكن من التصرف بالنيابة عن هذا الشخص بعد الآن. يمكن إعادة تفعيل الرعاية لاحقاً إذا دعاك من جديد."
        confirmLabel="انسحاب"
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
