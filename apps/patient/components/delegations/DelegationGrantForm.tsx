'use client'

/**
 * DelegationGrantForm — B07 Phase F.5 (Section 5).
 *
 * Two-step flow for granting a delegation (Phase F finding #8 closure,
 * Phase F Decision 6 reversed):
 *
 *   Step 1 (phone): user types a phone number → submit → POST
 *                    /api/patient/lookup-by-phone. On 404, show inline
 *                    "no MedAssist user for this phone" error. On 200,
 *                    advance to step 2 showing the matched display name.
 *   Step 2 (grant):  user selects capabilities + expiry + auto-renew →
 *                    submit → POST /api/patient/delegations. On 201,
 *                    invoke `onSuccess`. On 409, show inline "already
 *                    have an active grant for this person" error.
 *
 * Capability list per Mo ruling 4: 5 tokens; `consent_to_share` excluded.
 *
 * Default `expiresAt` is 1 year from now per Mo ruling 20 (also the
 * server-side handler default — handler is canonical, this UI default
 * matches for transparency).
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, ShieldCheck } from 'lucide-react'

const CAPABILITY_LABELS_AR: Record<string, string> = {
  view_records: 'الاطلاع على سجلاتي الصحية',
  receive_notifications: 'استلام إشعارات تخصني',
  book_appointments: 'حجز مواعيد بالنيابة عني',
  manage_medications: 'إدارة أدويتي',
  consent_to_messaging: 'مراسلة عياداتي بالنيابة',
}

const CAPABILITY_HINTS_AR: Record<string, string> = {
  view_records: 'مقدم الرعاية سيتمكن من رؤية سجلاتك الصحية الكاملة',
  receive_notifications: 'سيتلقى تنبيهات عن مواعيدك وأدويتك',
  book_appointments: 'سيتمكن من حجز مواعيد العيادات لك',
  manage_medications: 'سيتمكن من إضافة أو تعديل قائمة أدويتك',
  consent_to_messaging: 'سيتمكن من مراسلة عياداتك نيابةً عنك',
}

const ALL_CAPABILITIES = [
  'view_records',
  'receive_notifications',
  'book_appointments',
  'manage_medications',
  'consent_to_messaging',
] as const

interface LookupResult {
  userId: string
  globalPatientId: string
  displayName: string | null
}

function defaultExpiryISO(): string {
  // 1 year from today in YYYY-MM-DD (input[type=date] accepts this).
  const d = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

interface DelegationGrantFormProps {
  onSuccess?: (result: {
    delegationId: string
    delegateDisplayName: string | null
  }) => void
  onCancel?: () => void
}

export function DelegationGrantForm({
  onSuccess,
  onCancel,
}: DelegationGrantFormProps) {
  const router = useRouter()

  // ─── Step state ────────────────────────────────────────────────────
  const [step, setStep] = useState<'phone' | 'grant'>('phone')

  // Step 1 — phone lookup
  const [phone, setPhone] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [matched, setMatched] = useState<LookupResult | null>(null)

  // Step 2 — capability selection + expiry
  const [capabilities, setCapabilities] = useState<Set<string>>(new Set())
  const [expiresAt, setExpiresAt] = useState<string>(defaultExpiryISO())
  const [autoRenew, setAutoRenew] = useState(false)
  const [autoRenewWindowDays, setAutoRenewWindowDays] = useState(30)
  const [grantLoading, setGrantLoading] = useState(false)
  const [grantError, setGrantError] = useState<string | null>(null)

  const canSubmitGrant = useMemo(() => {
    if (!matched) return false
    if (capabilities.size === 0) return false
    if (!expiresAt) return false
    const expiryDate = new Date(expiresAt).getTime()
    if (!Number.isFinite(expiryDate)) return false
    if (expiryDate <= Date.now()) return false
    if (autoRenew && autoRenewWindowDays < 1) return false
    return true
  }, [matched, capabilities, expiresAt, autoRenew, autoRenewWindowDays])

  // ─── Step 1 handler ────────────────────────────────────────────────
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLookupError(null)
    const trimmed = phone.trim()
    if (!trimmed) {
      setLookupError('رقم الهاتف مطلوب')
      return
    }
    setLookupLoading(true)
    try {
      const res = await fetch('/api/patient/lookup-by-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: trimmed }),
      })
      if (res.status === 404) {
        setLookupError(
          'لا يوجد مستخدم MedAssist بهذا الرقم. يجب أن يقوم بإنشاء حساب أولاً.'
        )
        return
      }
      if (res.status === 400) {
        const data = await res.json().catch(() => ({}))
        setLookupError(
          data?.error_ar || data?.error || 'صيغة الرقم غير صحيحة'
        )
        return
      }
      if (!res.ok) {
        setLookupError('فشل البحث عن المستخدم، حاول مرة أخرى')
        return
      }
      const data = await res.json()
      setMatched({
        userId: data.userId,
        globalPatientId: data.globalPatientId,
        displayName: data.displayName ?? null,
      })
      setStep('grant')
    } catch (err) {
      console.error('lookup error', err)
      setLookupError('فشل الاتصال بالخادم')
    } finally {
      setLookupLoading(false)
    }
  }

  // ─── Step 2 handler ────────────────────────────────────────────────
  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault()
    setGrantError(null)
    if (!matched) {
      setGrantError('لم يتم تحديد المستخدم')
      return
    }
    if (capabilities.size === 0) {
      setGrantError('اختر صلاحية واحدة على الأقل')
      return
    }
    setGrantLoading(true)
    try {
      const body: Record<string, unknown> = {
        delegateUserId: matched.userId,
        delegateGlobalPatientId: matched.globalPatientId,
        capabilities: Array.from(capabilities),
        expiresAt: new Date(expiresAt).toISOString(),
        autoRenew,
      }
      if (autoRenew) {
        body.autoRenewWindowDays = autoRenewWindowDays
      }

      const res = await fetch('/api/patient/delegations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 409) {
        setGrantError(
          'يوجد بالفعل تفويض نشط لهذا الشخص. أدِر التفويض الحالي من القائمة.'
        )
        return
      }
      if (res.status === 400) {
        setGrantError(data?.error || 'فشل التحقق من البيانات')
        return
      }
      if (!res.ok) {
        setGrantError(data?.error || 'فشل إنشاء التفويض')
        return
      }

      if (onSuccess) {
        onSuccess({
          delegationId: data.delegationId,
          delegateDisplayName: matched.displayName,
        })
      } else {
        router.push('/patient/settings/caregivers')
      }
    } catch (err) {
      console.error('grant error', err)
      setGrantError('فشل الاتصال بالخادم')
    } finally {
      setGrantLoading(false)
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────
  const toggleCapability = (cap: string) => {
    setCapabilities((prev) => {
      const next = new Set(prev)
      if (next.has(cap)) next.delete(cap)
      else next.add(cap)
      return next
    })
  }

  // ─── Render ────────────────────────────────────────────────────────
  if (step === 'phone') {
    return (
      <form
        onSubmit={handleLookup}
        className="bg-white border-[0.8px] border-[#E5E7EB] rounded-[12px] p-4 font-cairo"
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="w-7 h-7 rounded-full bg-[#16A34A] text-white text-[12px] font-bold flex items-center justify-center">
            ١
          </span>
          <h3 className="font-cairo text-[15px] font-semibold text-[#030712]">
            ابحث عن مقدم الرعاية برقم هاتفه
          </h3>
        </div>
        <p className="font-cairo text-[12px] text-[#6B7280] leading-[18px] mb-4">
          يجب أن يكون لدى الشخص حساب MedAssist مرتبط بنفس رقم الهاتف. سيستلم
          الدعوة عند فتح التطبيق.
        </p>

        <label className="block font-cairo text-[12px] text-[#374151] mb-1.5">
          رقم الهاتف
        </label>
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="مثال: 01234567890"
          disabled={lookupLoading}
          className="w-full px-3 py-2.5 border-[0.8px] border-[#E5E7EB] rounded-[8px] font-cairo text-[14px] text-[#030712] disabled:bg-[#F9FAFB]"
          dir="ltr"
        />

        {lookupError && (
          <p className="mt-2 font-cairo text-[12px] text-[#B91C1C]">
            {lookupError}
          </p>
        )}

        <div className="flex items-center gap-2 mt-4">
          <button
            type="submit"
            disabled={lookupLoading || !phone.trim()}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-[8px] bg-[#16A34A] hover:bg-[#15803D] disabled:bg-[#9CA3AF] text-white font-cairo text-[13px] font-semibold transition-colors"
          >
            {lookupLoading ? 'جاري البحث…' : 'بحث'}
            {!lookupLoading && <ChevronRight className="w-4 h-4" strokeWidth={2.5} />}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={lookupLoading}
              className="px-4 py-2.5 rounded-[8px] border-[0.8px] border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] font-cairo text-[13px] font-semibold text-[#030712]"
            >
              إلغاء
            </button>
          )}
        </div>
      </form>
    )
  }

  // Step 2 — capability + expiry
  return (
    <form
      onSubmit={handleGrant}
      className="bg-white border-[0.8px] border-[#E5E7EB] rounded-[12px] p-4 font-cairo"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-full bg-[#16A34A] text-white text-[12px] font-bold flex items-center justify-center">
          ٢
        </span>
        <h3 className="font-cairo text-[15px] font-semibold text-[#030712]">
          اختر صلاحيات مقدم الرعاية
        </h3>
      </div>

      {/* Matched user summary */}
      <div className="mb-4 bg-[#F0FDF4] border-[0.8px] border-[#BBF7D0] rounded-[10px] p-3 flex items-center gap-3">
        <ShieldCheck
          className="w-5 h-5 text-[#16A34A] flex-shrink-0"
          strokeWidth={2}
        />
        <div className="flex-1 min-w-0">
          <p className="font-cairo text-[13px] font-semibold text-[#030712] truncate">
            {matched?.displayName ?? 'مستخدم MedAssist'}
          </p>
          <p className="font-cairo text-[11px] text-[#6B7280]" dir="ltr">
            {phone.trim()}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setStep('phone')
            setMatched(null)
            setGrantError(null)
          }}
          className="font-cairo text-[11px] font-semibold text-[#16A34A] underline"
        >
          تغيير
        </button>
      </div>

      <fieldset className="mb-4">
        <legend className="font-cairo text-[12px] font-semibold text-[#374151] mb-2">
          الصلاحيات
        </legend>
        <div className="space-y-2">
          {ALL_CAPABILITIES.map((cap) => {
            const checked = capabilities.has(cap)
            return (
              <label
                key={cap}
                className={`flex items-start gap-2 p-2.5 rounded-[8px] border-[0.8px] cursor-pointer transition-colors ${
                  checked
                    ? 'bg-[#F0FDF4] border-[#BBF7D0]'
                    : 'bg-white border-[#E5E7EB] hover:bg-[#F9FAFB]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCapability(cap)}
                  className="mt-0.5 w-4 h-4 accent-[#16A34A]"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-cairo text-[13px] font-medium text-[#030712]">
                    {CAPABILITY_LABELS_AR[cap]}
                  </p>
                  <p className="font-cairo text-[11px] text-[#6B7280] leading-[14px]">
                    {CAPABILITY_HINTS_AR[cap]}
                  </p>
                </div>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="mb-3">
        <label className="block font-cairo text-[12px] font-semibold text-[#374151] mb-1.5">
          تنتهي صلاحية التفويض في
        </label>
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          min={new Date(Date.now() + 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10)}
          disabled={grantLoading}
          className="w-full px-3 py-2 border-[0.8px] border-[#E5E7EB] rounded-[8px] font-cairo text-[14px] text-[#030712] disabled:bg-[#F9FAFB]"
        />
        <p className="font-cairo text-[11px] text-[#9CA3AF] mt-1">
          الافتراضي: سنة واحدة من اليوم.
        </p>
      </div>

      <div className="mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRenew}
            onChange={(e) => setAutoRenew(e.target.checked)}
            disabled={grantLoading}
            className="w-4 h-4 accent-[#16A34A]"
          />
          <span className="font-cairo text-[13px] text-[#374151]">
            تجديد تلقائي عند الاستخدام
          </span>
        </label>
        {autoRenew && (
          <div className="mt-2 pr-6">
            <label className="block font-cairo text-[11px] text-[#6B7280] mb-1">
              نافذة التجديد (أيام)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={autoRenewWindowDays}
              onChange={(e) =>
                setAutoRenewWindowDays(
                  Math.max(1, Math.min(365, Number(e.target.value) || 30))
                )
              }
              disabled={grantLoading}
              className="w-24 px-2 py-1 border-[0.8px] border-[#E5E7EB] rounded-[6px] font-cairo text-[13px] text-[#030712] disabled:bg-[#F9FAFB]"
            />
          </div>
        )}
      </div>

      {grantError && (
        <p className="mb-3 font-cairo text-[12px] text-[#B91C1C]">
          {grantError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!canSubmitGrant || grantLoading}
          className="flex-1 px-4 py-2.5 rounded-[8px] bg-[#16A34A] hover:bg-[#15803D] disabled:bg-[#9CA3AF] text-white font-cairo text-[13px] font-semibold transition-colors"
        >
          {grantLoading ? 'جاري الإنشاء…' : 'إضافة مقدم الرعاية'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={grantLoading}
            className="px-4 py-2.5 rounded-[8px] border-[0.8px] border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] font-cairo text-[13px] font-semibold text-[#030712]"
          >
            إلغاء
          </button>
        )}
      </div>
    </form>
  )
}
