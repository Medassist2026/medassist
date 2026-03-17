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

export function AssistantManager() {
  const [inviteCode, setInviteCode] = useState('')
  const [loadingCode, setLoadingCode] = useState(true)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState<string | null>(null)

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
          (m: StaffMember) => m.role === 'ASSISTANT' || m.role === 'FRONT_DESK'
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
    <div className="space-y-6" dir="rtl">
      {/* Invite Code Section */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <h3 className="font-bold text-sm text-gray-900 mb-3">{ar.inviteCode}</h3>

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
                {copied ? 'تم النسخ' : 'نسخ'}
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
                onClick={handleRegenerate}
                disabled={regenerating}
                className="py-2 px-3 text-xs text-red-600 hover:bg-red-50 rounded-xl font-medium disabled:opacity-50"
              >
                {regenerating ? ar.loading : 'تجديد'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Assistants List */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <h3 className="font-bold text-sm text-gray-900 mb-3">
          {ar.assistants} ({staff.length})
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
                      member.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-200 text-gray-500'
                    }`}>
                      {member.status === 'ACTIVE' ? ar.activeAssistant : ar.inactiveAssistant}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {member.role === 'FRONT_DESK' ? 'استقبال' : 'مساعد'}
                    </span>
                  </div>
                </div>

                {/* Remove Button */}
                {showConfirm === member.user_id ? (
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
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
