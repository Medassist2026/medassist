'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Building2, Check, X, Loader2, Mail } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface ClinicInvite {
  membershipId: string
  clinicId: string
  role: string
  createdAt: string
  clinic: {
    id: string
    name: string
    uniqueId: string
  } | null
}

// ============================================================================
// INVITATIONS PAGE
// ============================================================================

export default function InvitationsPage() {
  const router = useRouter()
  const [invites, setInvites] = useState<ClinicInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // ── Load pending invites ──
  useEffect(() => {
    loadInvites()
  }, [])

  const loadInvites = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/frontdesk/invite')
      if (res.ok) {
        const data = await res.json()
        setInvites(data.invites || [])
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }

  // ── Handle accept/reject ──
  const handleAction = async (membershipId: string, action: 'accept' | 'reject') => {
    setProcessingId(membershipId)
    try {
      const res = await fetch('/api/frontdesk/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membershipId, action })
      })

      const data = await res.json()

      if (!res.ok) {
        setToast({ message: data.error || 'حدث خطأ', type: 'error' })
        return
      }

      setToast({ message: data.message, type: 'success' })
      // Remove processed invite from list
      setInvites(prev => prev.filter(inv => inv.membershipId !== membershipId))

      // If accepted, redirect to dashboard after a brief delay
      if (action === 'accept') {
        setTimeout(() => {
          router.push('/frontdesk/dashboard')
        }, 1500)
      }
    } catch {
      setToast({ message: 'فشل في معالجة الدعوة', type: 'error' })
    } finally {
      setProcessingId(null)
    }
  }

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  // ── Role display ──
  const roleLabel = (role: string) => {
    switch (role) {
      case 'FRONT_DESK': return 'استقبال'
      case 'DOCTOR': return 'طبيب'
      case 'ASSISTANT': return 'مساعد'
      default: return role
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#F9FAFB] pb-24">

      {/* ── Header ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#E5E7EB]">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center flex-shrink-0"
          >
            <ChevronRight className="w-5 h-5 text-[#030712]" />
          </button>
          <h1 className="font-cairo text-[18px] font-semibold text-[#030712]">
            دعوات العيادات
          </h1>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-4 pt-5 space-y-4">

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[#16A34A] mb-3" />
            <p className="font-cairo text-[14px] text-[#6B7280]">جاري التحميل...</p>
          </div>
        ) : invites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-[#9CA3AF]" />
            </div>
            <p className="font-cairo text-[16px] font-semibold text-[#030712] mb-1">
              لا توجد دعوات معلقة
            </p>
            <p className="font-cairo text-[13px] text-[#6B7280] text-center">
              عندما يدعوك طبيب للانضمام لعيادته، ستظهر الدعوة هنا
            </p>
          </div>
        ) : (
          <>
            <p className="font-cairo text-[13px] text-[#6B7280]">
              لديك {invites.length} {invites.length === 1 ? 'دعوة معلقة' : 'دعوات معلقة'}
            </p>

            {invites.map((invite) => (
              <div
                key={invite.membershipId}
                className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] overflow-hidden"
              >
                {/* Invite header */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-full bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-6 h-6 text-[#3B82F6]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-cairo text-[15px] font-semibold text-[#030712]">
                        {invite.clinic?.name || 'عيادة'}
                      </h3>
                      <p className="font-cairo text-[12px] text-[#6B7280] mt-0.5">
                        دور: {roleLabel(invite.role)}
                      </p>
                      <p className="font-cairo text-[11px] text-[#9CA3AF] mt-1">
                        {new Date(invite.createdAt).toLocaleDateString('ar-EG', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex border-t border-[#E5E7EB]">
                  <button
                    onClick={() => handleAction(invite.membershipId, 'reject')}
                    disabled={processingId === invite.membershipId}
                    className="flex-1 h-12 flex items-center justify-center gap-2 font-cairo text-[14px] font-medium text-[#6B7280] hover:bg-[#F9FAFB] active:bg-[#F3F4F6] transition-colors border-l border-[#E5E7EB] disabled:opacity-50"
                  >
                    {processingId === invite.membershipId ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                    <span>رفض</span>
                  </button>
                  <button
                    onClick={() => handleAction(invite.membershipId, 'accept')}
                    disabled={processingId === invite.membershipId}
                    className="flex-1 h-12 flex items-center justify-center gap-2 font-cairo text-[14px] font-bold text-[#16A34A] hover:bg-[#F0FDF4] active:bg-[#DCFCE7] transition-colors disabled:opacity-50"
                  >
                    {processingId === invite.membershipId ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>قبول</span>
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed top-4 left-4 right-4 z-50">
          <div className={`max-w-md mx-auto rounded-[12px] px-4 py-3 shadow-lg border-[0.8px] flex items-center gap-2 ${
            toast.type === 'success'
              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#16A34A]'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {toast.type === 'success' ? (
              <Check className="w-5 h-5 flex-shrink-0" />
            ) : (
              <X className="w-5 h-5 flex-shrink-0" />
            )}
            <p className="font-cairo text-[14px] font-medium">{toast.message}</p>
          </div>
        </div>
      )}
    </div>
  )
}
