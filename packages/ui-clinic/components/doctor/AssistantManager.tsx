'use client'

import { useState, useEffect, useCallback } from 'react'
import { ar } from '@shared/lib/i18n/ar'

interface StaffMember {
  user_id: string
  role: string
  status: string
  full_name: string | null
  phone: string | null
}

export function AssistantManager({ isOwner = true }: { isOwner?: boolean }) {
  const [inviteCode, setInviteCode] = useState('')
  const [loadingCode, setLoadingCode] = useState(true)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState<string | null>(null)
  const [showRenewConfirm, setShowRenewConfirm] = useState(false)

  const loadInviteCode = useCallback(async () => {
    try {
      const res = await fetch('/api/clinic/invite-code')
      if (res.ok) {
        const data = await res.json()
        setInviteCode(data.inviteCode || '')
      }
    } catch { /* ignore */ }
    finally { setLoadingCode(false) }
  }, [])

  const loadStaff = useCallback(async () => {
    try {
      const res = await fetch('/api/clinic/staff')
      if (res.ok) {
        const data = await res.json()
        const assistants = (data.members || []).filter(
          (m: StaffMember) => ['ASSISTANT', 'FRONT_DESK', 'frontdesk', 'assistant'].includes(m.role)
        )
        setStaff(assistants)
      }
    } catch { /* ignore */ }
    finally { setLoadingStaff(false) }
  }, [])

  useEffect(() => {
    loadInviteCode()
    loadStaff()
  }, [loadInviteCode, loadStaff])

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShareLink = () => {
    const url = `${window.location.origin}/auth?invite=${inviteCode}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      const res = await fetch('/api/clinic/invite-code', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setInviteCode(data.inviteCode || '')
      }
    } catch { /* ignore */ }
    finally { setRegenerating(false) }
  }

  const handleRemove = async (userId: string) => {
    setRemoving(userId)
    try {
      const res = await fetch('/api/clinic/staff', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (res.ok) {
        setStaff(staff.filter(s => s.user_id !== userId))
      }
    } catch { /* ignore */ }
    finally {
      setRemoving(null)
      setShowConfirm(null)
    }
  }

  return (
    <div className="space-y-4" dir="rtl">

      {/* Renew confirmation dialog */}
      {showRenewConfirm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowRenewConfirm(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto">
            <div className="bg-white rounded-[16px] shadow-xl p-5" dir="rtl">
              <div className="w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-[#DC2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-cairo font-bold text-[15px] text-[#030712] text-center mb-2">تجديد رمز الدعوة</h3>
              <p className="font-cairo text-[12px] text-[#6B7280] text-center leading-relaxed">
                سيُبطَل الرمز الحالي فوراً ولن يتمكن أي شخص من استخدامه للانضمام. هل أنت متأكد؟
              </p>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={async () => { setShowRenewConfirm(false); await handleRegenerate() }}
                  disabled={regenerating}
                  className="flex-1 h-[44px] bg-[#DC2626] hover:bg-[#B91C1C] text-white font-cairo text-[13px] font-semibold rounded-[10px] disabled:opacity-50"
                >
                  {regenerating ? 'جاري التجديد...' : 'نعم، جدد الرمز'}
                </button>
                <button
                  onClick={() => setShowRenewConfirm(false)}
                  className="flex-1 h-[44px] bg-[#F3F4F6] text-[#4B5563] font-cairo text-[13px] font-medium rounded-[10px]"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Invite Code Section — owner only */}
      {isOwner && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-start justify-between mb-1">
            <h3 className="font-bold text-sm text-gray-900">رمز الدعوة</h3>
          </div>
          <p className="font-cairo text-[11px] text-[#6B7280] mb-3">
            شارك هذا الرمز مع <strong>المساعدين وموظفي الاستقبال</strong> فقط — لدعوة طبيب آخر استخدم زر الدعوة المباشرة في صفحة الفريق
          </p>

          {loadingCode ? (
            <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
          ) : (
            <>
              <div className="flex items-center gap-3 bg-primary-50 rounded-xl p-3 mb-3">
                <span className="font-mono text-2xl font-bold text-primary-700 tracking-widest flex-1 text-center">
                  {inviteCode || '—'}
                </span>
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 font-medium"
                >
                  {copied ? 'تم النسخ ✓' : 'نسخ'}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleShareLink}
                  className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-200"
                >
                  {ar.shareInviteLink}
                </button>
                <button
                  onClick={() => setShowRenewConfirm(true)}
                  disabled={regenerating}
                  className="py-2 px-3 text-xs text-red-500 hover:bg-red-50 rounded-xl font-medium disabled:opacity-50 border border-red-100"
                >
                  تجديد الرمز
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Assistants List */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <h3 className="font-bold text-sm text-gray-900 mb-3">
          المساعدون والاستقبال ({staff.length})
        </h3>

        {loadingStaff ? (
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : staff.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-400">
            لا يوجد مساعدين حالياً
          </div>
        ) : (
          <div className="space-y-2">
            {staff.map((member) => (
              <div key={member.user_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {(member.full_name || member.phone || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {member.full_name || member.phone || 'مجهول'}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      member.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {member.status === 'ACTIVE' ? 'نشط' : 'غير نشط'}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {['FRONT_DESK', 'frontdesk'].includes(member.role) ? 'استقبال' : 'مساعد'}
                    </span>
                  </div>
                </div>

                {/* Remove — owner only */}
                {isOwner && (
                  showConfirm === member.user_id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleRemove(member.user_id)}
                        disabled={removing === member.user_id}
                        className="text-[10px] px-2 py-1 bg-red-600 text-white rounded-lg font-medium disabled:opacity-50"
                      >
                        {removing === member.user_id ? '...' : 'تأكيد'}
                      </button>
                      <button
                        onClick={() => setShowConfirm(null)}
                        className="text-[10px] px-2 py-1 bg-gray-200 text-gray-600 rounded-lg font-medium"
                      >
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowConfirm(member.user_id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
