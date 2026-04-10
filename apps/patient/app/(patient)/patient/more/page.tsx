'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronLeft,
  LogOut,
  QrCode,
  RefreshCw,
  Share2,
  ShieldCheck,
  User,
  UserCog,
  X,
} from 'lucide-react'
import { PatientHeader } from '@ui-clinic/components/patient/PatientHeader'
import { ConfirmDialog } from '@shared/components/ui/ConfirmDialog'

// ============================================================================
// TYPES
// ============================================================================

interface SharingGrant {
  id: string
  clinic_id: string
  clinic_name: string
  grantee_user_id: string | null
  doctor_name: string | null
  mode: string
  consent: string
  created_at: string
}

// ============================================================================
// HELPERS
// ============================================================================

async function shareNatively(text: string, title?: string): Promise<'shared' | 'copied' | 'failed'> {
  // Prefer the Web Share API when available (mobile devices, modern browsers)
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await (navigator as any).share({ text, title })
      return 'shared'
    } catch (err: any) {
      // User cancelled the sheet — treat as no-op
      if (err?.name === 'AbortError') return 'shared'
      // Fall through to clipboard fallback
    }
  }
  // Fallback: copy to clipboard
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return 'copied'
    }
  } catch {
    /* ignore */
  }
  return 'failed'
}

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

// ============================================================================
// VISIBILITY MODE LABEL
// ============================================================================

function VisibilityModeLabel({ mode }: { mode: string }) {
  const cfg: Record<string, { label: string; bg: string; border: string; text: string }> = {
    DOCTOR_SCOPED_OWNER: {
      label: 'خاص',
      bg: '#F3F4F6',
      border: '#E5E7EB',
      text: '#4B5563',
    },
    CLINIC_WIDE: {
      label: 'العيادة كاملة',
      bg: '#DCFCE7',
      border: '#86EFAC',
      text: '#15803D',
    },
    SHARED_BY_CONSENT: {
      label: 'مشارك',
      bg: '#DBEAFE',
      border: '#93C5FD',
      text: '#1D4ED8',
    },
  }
  const c = cfg[mode] || cfg.DOCTOR_SCOPED_OWNER
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full font-cairo text-[10px] font-medium border-[0.8px]"
      style={{
        backgroundColor: c.bg,
        borderColor: c.border,
        color: c.text,
      }}
    >
      {c.label}
    </span>
  )
}

// ============================================================================
// CODE CARD
// ============================================================================

function CodeCard({
  code,
  loading,
  onRegenerate,
  regenerating,
  onShare,
  shareState,
}: {
  code: string | null
  loading: boolean
  onRegenerate: () => void
  regenerating: boolean
  onShare: () => void
  shareState: 'idle' | 'shared' | 'copied' | 'failed'
}) {
  return (
    <div
      dir="rtl"
      className="rounded-[12px] overflow-hidden shadow-[0px_8px_28px_rgba(45,190,92,0.15)]"
      style={{
        background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
      }}
    >
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <QrCode className="w-4 h-4 text-white" strokeWidth={2} />
            </div>
            <span className="font-cairo text-[13px] font-medium text-white/90">
              كود المريض
            </span>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-[10px] py-4 px-5 mb-4 text-center border-[0.8px] border-white/20">
          {loading ? (
            <div className="h-10 bg-white/10 rounded animate-pulse" />
          ) : (
            <p
              className="font-mono text-white text-[32px] font-bold tracking-[0.25em]"
              style={{ direction: 'ltr' }}
            >
              {code || '------'}
            </p>
          )}
        </div>

        <p className="font-cairo text-[11px] text-white/80 mb-4 text-center leading-relaxed">
          شارك هذا الكود مع طبيبك للسماح له بالوصول لسجلاتك الطبية
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onShare}
            disabled={!code}
            className="flex-1 h-[40px] rounded-[10px] bg-white font-cairo text-[12px] font-semibold text-[#16A34A] hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {shareState === 'copied' ? (
              <>
                <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                تم النسخ
              </>
            ) : shareState === 'shared' ? (
              <>
                <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                تمت المشاركة
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" strokeWidth={2} />
                مشاركة
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating || !code}
            className="flex-1 h-[40px] rounded-[10px] bg-white/10 border-[0.8px] border-white/30 font-cairo text-[12px] font-semibold text-white hover:bg-white/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`}
              strokeWidth={2}
            />
            {regenerating ? 'جاري...' : 'كود جديد'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// LINK ROW
// ============================================================================

function LinkRow({
  href,
  icon,
  label,
  subtitle,
  danger = false,
  onClick,
}: {
  href?: string
  icon: React.ReactNode
  label: string
  subtitle?: string
  danger?: boolean
  onClick?: () => void
}) {
  const inner = (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors ${
        danger ? 'text-[#B91C1C]' : 'text-[#030712]'
      }`}
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          danger ? 'bg-[#FEF2F2]' : 'bg-[#F0FDF4]'
        }`}
      >
        <span className={danger ? 'text-[#B91C1C]' : 'text-[#16A34A]'}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0 text-right">
        <p className="font-cairo text-[14px] font-medium">{label}</p>
        {subtitle && (
          <p className="font-cairo text-[11px] text-[#9CA3AF] mt-0.5 truncate">
            {subtitle}
          </p>
        )}
      </div>
      <ChevronLeft
        className={`w-4 h-4 flex-shrink-0 ${
          danger ? 'text-[#B91C1C]' : 'text-[#9CA3AF]'
        }`}
        strokeWidth={2}
      />
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className="block w-full">
      {inner}
    </button>
  )
}

// ============================================================================
// GRANT ROW
// ============================================================================

function GrantRow({
  grant,
  revoking,
  onRevoke,
}: {
  grant: SharingGrant
  revoking: boolean
  onRevoke: () => void
}) {
  return (
    <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3.5">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-full bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-[#16A34A]" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-cairo text-[13px] font-semibold text-[#030712] truncate">
              {grant.doctor_name ? `د. ${grant.doctor_name}` : grant.clinic_name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <VisibilityModeLabel mode={grant.mode} />
              <span className="font-cairo text-[10px] text-[#9CA3AF] truncate">
                منذ {formatArabicDate(grant.created_at)}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onRevoke}
          disabled={revoking}
          className="h-[32px] px-3 rounded-[8px] border-[0.8px] border-[#FECACA] bg-white font-cairo text-[11px] font-medium text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {revoking ? '...' : 'إلغاء'}
        </button>
      </div>
      {grant.doctor_name && (
        <p className="font-cairo text-[11px] text-[#6B7280] mr-11">
          {grant.clinic_name}
        </p>
      )}
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function MorePage() {
  const router = useRouter()

  const [code, setCode] = useState<string | null>(null)
  const [codeLoading, setCodeLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [shareState, setShareState] = useState<'idle' | 'shared' | 'copied' | 'failed'>(
    'idle',
  )

  const [grants, setGrants] = useState<SharingGrant[]>([])
  const [grantsLoading, setGrantsLoading] = useState(true)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const [pendingRevoke, setPendingRevoke] = useState<SharingGrant | null>(null)
  const [pendingRegenerate, setPendingRegenerate] = useState(false)
  const [pendingLogout, setPendingLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const [error, setError] = useState<string | null>(null)

  // --- Load patient code ---
  const loadCode = useCallback(async () => {
    setCodeLoading(true)
    try {
      const res = await fetch('/api/patient/my-code')
      const data = await res.json()
      if (data.success) setCode(data.code)
      else throw new Error(data.error || 'تعذر تحميل الكود')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل الكود')
    } finally {
      setCodeLoading(false)
    }
  }, [])

  // --- Load sharing grants ---
  const loadGrants = useCallback(async () => {
    setGrantsLoading(true)
    try {
      const res = await fetch('/api/patient/sharing')
      const data = await res.json()
      if (data.success) setGrants(data.grants || [])
    } catch (err) {
      console.error('Sharing load error:', err)
    } finally {
      setGrantsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCode()
    loadGrants()
  }, [loadCode, loadGrants])

  // --- Regenerate code (confirm first) ---
  const handleRegenerate = async () => {
    setPendingRegenerate(false)
    setRegenerating(true)
    try {
      const res = await fetch('/api/patient/my-code', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'فشل التحديث')
      setCode(data.code)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحديث')
    } finally {
      setRegenerating(false)
    }
  }

  // --- Share code (real Web Share API → fallback to clipboard) ---
  const handleShare = async () => {
    if (!code) return
    const text = `كود المريض الخاص بي في MedAssist: ${code}`
    const result = await shareNatively(text, 'MedAssist')
    if (result === 'shared') {
      setShareState('shared')
    } else if (result === 'copied') {
      setShareState('copied')
    } else {
      setShareState('failed')
      setError('تعذرت مشاركة الكود — حاول النسخ يدوياً')
    }
    setTimeout(() => setShareState('idle'), 2500)
  }

  // --- Revoke a grant (confirm first) ---
  const handleRevoke = async () => {
    if (!pendingRevoke) return
    const visibilityId = pendingRevoke.id
    setPendingRevoke(null)
    setRevokingId(visibilityId)
    try {
      const res = await fetch('/api/patient/sharing', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibilityId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'فشل الإلغاء')
      setGrants((prev) => prev.filter((g) => g.id !== visibilityId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الإلغاء')
    } finally {
      setRevokingId(null)
    }
  }

  // --- Logout ---
  const handleLogout = async () => {
    setPendingLogout(false)
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/auth')
      router.refresh()
    } catch {
      setError('فشل تسجيل الخروج')
      setLoggingOut(false)
    }
  }

  return (
    <>
      <PatientHeader title="المزيد" />
      <div dir="rtl" className="px-4 py-5 space-y-6">
        {/* Error flash */}
        {error && (
          <div className="bg-[#FEF2F2] border-[0.8px] border-[#FECACA] rounded-[10px] p-3 flex items-start gap-2">
            <AlertCircle
              className="w-4 h-4 text-[#B91C1C] flex-shrink-0 mt-0.5"
              strokeWidth={2}
            />
            <p className="font-cairo text-[12px] text-[#B91C1C] flex-1">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-[#B91C1C] flex-shrink-0"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        )}

        {/* Patient Code */}
        <CodeCard
          code={code}
          loading={codeLoading}
          onRegenerate={() => setPendingRegenerate(true)}
          regenerating={regenerating}
          onShare={handleShare}
          shareState={shareState}
        />

        {/* Sharing Access Section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-cairo text-[15px] font-semibold text-[#030712]">
              من لديه وصول لسجلاتي
            </h2>
            {grants.length > 0 && (
              <span className="font-cairo text-[12px] text-[#6B7280]">
                {grants.length}
              </span>
            )}
          </div>

          {grantsLoading ? (
            <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-6">
              <div className="h-4 bg-[#F3F4F6] rounded animate-pulse mb-2" />
              <div className="h-4 w-2/3 bg-[#F3F4F6] rounded animate-pulse" />
            </div>
          ) : grants.length === 0 ? (
            <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-[#F0FDF4] mx-auto mb-2 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-[#16A34A]" strokeWidth={1.8} />
              </div>
              <p className="font-cairo text-[13px] text-[#030712] font-medium mb-1">
                لا يوجد أي وصول حالياً
              </p>
              <p className="font-cairo text-[11px] text-[#6B7280]">
                شارك كود المريض الخاص بك مع طبيبك
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {grants.map((grant) => (
                <GrantRow
                  key={grant.id}
                  grant={grant}
                  revoking={revokingId === grant.id}
                  onRevoke={() => setPendingRevoke(grant)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Features / Links */}
        <section>
          <h2 className="font-cairo text-[15px] font-semibold text-[#030712] mb-3">
            الميزات
          </h2>
          <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] divide-y divide-[#F3F4F6] overflow-hidden">
            <LinkRow
              href="/patient/diary"
              icon={<BookOpen className="w-4 h-4" strokeWidth={1.8} />}
              label="اليوميات الصحية"
              subtitle="سجّل مزاجك، أعراضك، ونومك"
            />
            <LinkRow
              href="/patient/sharing"
              icon={<Share2 className="w-4 h-4" strokeWidth={1.8} />}
              label="إعدادات المشاركة"
              subtitle="تحكم بما يراه كل طبيب"
            />
          </div>
        </section>

        {/* Account */}
        <section>
          <h2 className="font-cairo text-[15px] font-semibold text-[#030712] mb-3">
            الحساب
          </h2>
          <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] divide-y divide-[#F3F4F6] overflow-hidden">
            <LinkRow
              href="/patient/dashboard"
              icon={<UserCog className="w-4 h-4" strokeWidth={1.8} />}
              label="الملف الشخصي"
              subtitle="الاسم ورقم الهاتف"
            />
            <LinkRow
              onClick={() => setPendingLogout(true)}
              icon={<LogOut className="w-4 h-4" strokeWidth={1.8} />}
              label="تسجيل الخروج"
              danger
            />
          </div>
        </section>

        {/* Footer */}
        <div className="text-center py-4">
          <p className="font-cairo text-[11px] text-[#9CA3AF]">
            MedAssist · إصدار 1.0
          </p>
        </div>
      </div>

      {/* Confirm regenerate */}
      <ConfirmDialog
        isOpen={pendingRegenerate}
        onCancel={() => setPendingRegenerate(false)}
        onConfirm={handleRegenerate}
        title="إصدار كود جديد؟"
        message="سيصبح الكود القديم غير صالح على الفور. الأطباء الذين لديهم وصول سابق سيفقدون إمكانية الوصول الجديد."
        confirmLabel="إصدار كود جديد"
        cancelLabel="إلغاء"
        confirmVariant="warning"
      />

      {/* Confirm revoke */}
      <ConfirmDialog
        isOpen={!!pendingRevoke}
        onCancel={() => setPendingRevoke(null)}
        onConfirm={handleRevoke}
        title="إلغاء الوصول؟"
        message={
          pendingRevoke
            ? `لن يستطيع ${
                pendingRevoke.doctor_name
                  ? `د. ${pendingRevoke.doctor_name}`
                  : pendingRevoke.clinic_name
              } الوصول إلى سجلاتك بعد الآن.`
            : ''
        }
        confirmLabel="إلغاء الوصول"
        cancelLabel="تراجع"
        confirmVariant="danger"
      />

      {/* Confirm logout */}
      <ConfirmDialog
        isOpen={pendingLogout}
        onCancel={() => setPendingLogout(false)}
        onConfirm={handleLogout}
        title="تسجيل الخروج؟"
        message="ستحتاج إلى إدخال رقم هاتفك مرة أخرى لتسجيل الدخول."
        confirmLabel="خروج"
        cancelLabel="إلغاء"
        confirmVariant="warning"
      />

      {/* Loading overlay during logout */}
      {loggingOut && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-[12px] px-6 py-4 font-cairo text-[13px] text-[#030712]">
            جاري تسجيل الخروج...
          </div>
        </div>
      )}
    </>
  )
}
