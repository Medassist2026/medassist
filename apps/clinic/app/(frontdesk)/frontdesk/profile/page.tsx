'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight,
  User,
  Phone,
  Mail,
  Building2,
  LogOut,
  AlertTriangle,
  Check,
  X,
  Loader2,
  Save,
  Bell,
  ChevronLeft,
  RefreshCw,
  LogIn,
} from 'lucide-react'
import {
  getEgyptianPhoneError,
  normalizeEgyptianDigits,
} from '@shared/lib/utils/phone-validation'

// ============================================================================
// TYPES
// ============================================================================

interface ClinicInfo {
  id: string
  name: string
  uniqueId: string
}

interface MembershipInfo {
  id: string
  clinicId: string
  role: string
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED'
  createdAt: string
  clinic: ClinicInfo | null
}

interface InviteInfo {
  membershipId: string
  clinicId: string
  role: string
  createdAt: string
  clinic: ClinicInfo | null
}

interface Profile {
  id: string
  phone: string
  email: string | null
  fullName: string
  uniqueId: string
  role: string
  createdAt: string
  memberships: MembershipInfo[]
}

type PageState = 'loading' | 'view' | 'edit' | 'error'

// ============================================================================
// PROFILE PAGE — 375px Samsung A14 optimized
// ============================================================================

export default function ProfilePage() {
  const router = useRouter()

  // State
  const [pageState, setPageState] = useState<PageState>('loading')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [invites, setInvites] = useState<InviteInfo[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Edit state
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [saving, setSaving] = useState(false)

  // Logout dialog
  const [showLogout, setShowLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  // Clinic switch dialog
  const [switchTarget, setSwitchTarget] = useState<MembershipInfo | null>(null)
  const [switching, setSwitching] = useState(false)

  // Join clinic with invite code
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [joinCode,      setJoinCode]      = useState('')
  const [joining,       setJoining]       = useState(false)
  const [joinError,     setJoinError]     = useState('')

  // Leave clinic
  const [leaveTarget, setLeaveTarget] = useState<MembershipInfo | null>(null)
  const [leaving,     setLeaving]     = useState(false)

  // Invite processing
  const [processingInvite, setProcessingInvite] = useState<string | null>(null)

  // ─── DATA FETCH ───
  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/frontdesk/profile')
      if (!res.ok) throw new Error('فشل تحميل البيانات')
      const data: Profile = await res.json()
      setProfile(data)
      setPageState('view')
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ')
      setPageState('error')
    }
  }, [])

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch('/api/frontdesk/invite')
      if (!res.ok) return
      const data = await res.json()
      setInvites(data.invites || [])
    } catch {
      // silent fail
    }
  }, [])

  useEffect(() => {
    fetchProfile()
    fetchInvites()
  }, [fetchProfile, fetchInvites])

  // ─── TOAST ───
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ─── EDIT ───
  const startEdit = () => {
    if (!profile) return
    setEditName(profile.fullName)
    setEditPhone(profile.phone)
    setEditEmail(profile.email || '')
    setPageState('edit')
  }

  const cancelEdit = () => setPageState('view')

  const saveEdit = async () => {
    if (!editName.trim() || editName.trim().length < 2) {
      showToast('الاسم لازم يكون على الأقل حرفين', 'error')
      return
    }
    const phoneErr = getEgyptianPhoneError(editPhone.replace(/[\s\-]/g, ''))
    if (phoneErr) {
      showToast(phoneErr, 'error')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/frontdesk/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: editName.trim(),
          phone: editPhone.trim(),
          email: editEmail.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل الحفظ')

      showToast('تم حفظ التعديلات ✓', 'success')
      await fetchProfile()
      setPageState('view')
    } catch (err: any) {
      showToast(err.message || 'فشل الحفظ', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ─── LOGOUT ───
  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
    } catch {
      window.location.href = '/login'
    }
  }

  // ─── CLINIC SWITCH ───
  const handleClinicSwitch = async () => {
    if (!switchTarget) return
    setSwitching(true)
    try {
      const res = await fetch('/api/clinic/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: switchTarget.clinicId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل التبديل')

      showToast(`تم التبديل إلى ${switchTarget.clinic?.name || 'العيادة'} ✓`, 'success')
      setSwitchTarget(null)
      setTimeout(() => { window.location.href = '/frontdesk/dashboard' }, 800)
    } catch (err: any) {
      showToast(err.message || 'فشل التبديل', 'error')
      setSwitching(false)
    }
  }

  // ─── JOIN CLINIC ───
  const handleJoinClinic = async () => {
    if (!joinCode.trim()) { setJoinError('أدخل رمز الدعوة'); return }
    setJoining(true)
    setJoinError('')
    try {
      const res = await fetch('/api/clinic/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: joinCode.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setJoinError(data.error || 'رمز الدعوة غير صحيح'); return }

      showToast(`تم الانضمام إلى ${data.clinicName} ✓`, 'success')
      setShowJoinModal(false)
      setJoinCode('')
      await fetchProfile()
      setTimeout(() => { window.location.href = '/frontdesk/dashboard' }, 800)
    } catch {
      setJoinError('حدث خطأ. حاول مرة أخرى')
    } finally {
      setJoining(false)
    }
  }

  // ─── LEAVE CLINIC ───
  const handleLeaveClinic = async () => {
    if (!leaveTarget) return
    setLeaving(true)
    try {
      const res = await fetch('/api/clinic/leave', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: leaveTarget.clinicId }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'فشل المغادرة', 'error'); return }

      showToast('تمت المغادرة بنجاح', 'success')
      setLeaveTarget(null)
      await fetchProfile()
    } catch {
      showToast('حدث خطأ. حاول مرة أخرى', 'error')
    } finally {
      setLeaving(false)
    }
  }

  // ─── INVITE ACTIONS ───
  const handleInvite = async (membershipId: string, action: 'accept' | 'reject') => {
    setProcessingInvite(membershipId)
    try {
      const res = await fetch('/api/frontdesk/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membershipId, action }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل')

      showToast(data.message, 'success')
      await Promise.all([fetchProfile(), fetchInvites()])
    } catch (err: any) {
      showToast(err.message || 'حدث خطأ', 'error')
    } finally {
      setProcessingInvite(null)
    }
  }

  // ─── HELPERS ───
  const getInitial = (name: string) => {
    if (!name) return '؟'
    return name.charAt(0).toUpperCase()
  }

  const getRoleLabel = (role: string) => {
    const map: Record<string, string> = {
      FRONT_DESK: 'موظف استقبال',
      ASSISTANT: 'مساعد',
      DOCTOR: 'طبيب',
      OWNER: 'مالك',
    }
    return map[role] || role
  }

  const activeMemberships = profile?.memberships.filter(m => m.status === 'ACTIVE') || []

  // Determine which clinic is "current" (the one used by frontdesk-scope)
  // For now, we treat the first active membership as current
  const currentClinicId = activeMemberships[0]?.clinicId

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-white font-cairo">
      {/* ─── HEADER (56px, fits 375px) ─── */}
      <header className="sticky top-0 z-10 bg-white border-b-[0.8px] border-[#E5E7EB]">
        <div className="flex items-center h-14 px-4 gap-2">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full border-[0.8px] border-[#E5E7EB] flex items-center justify-center flex-shrink-0"
          >
            <ArrowRight className="w-4 h-4 text-[#030712]" />
          </button>
          <h1 className="text-[17px] font-bold text-[#030712] flex-1 truncate">الملف الشخصي</h1>

          {pageState === 'view' && (
            <button
              onClick={startEdit}
              className="text-[13px] font-bold text-[#16A34A] flex-shrink-0"
            >
              تعديل
            </button>
          )}

          {pageState === 'edit' && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={cancelEdit}
                className="text-[13px] font-bold text-[#6B7280]"
              >
                إلغاء
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="text-[13px] font-bold text-[#16A34A] flex items-center gap-1"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                حفظ
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ─── TOAST ─── */}
      {toast && (
        <div
          className={`fixed top-16 left-4 right-4 z-50 mx-auto max-w-sm px-4 py-2.5 rounded-xl shadow-lg text-[13px] font-bold text-center transition-all ${
            toast.type === 'success'
              ? 'bg-[#F0FDF4] text-[#16A34A] border border-[#16A34A]/20'
              : 'bg-[#FEF2F2] text-[#EF4444] border border-[#EF4444]/20'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* ─── LOADING (Skeleton) ─── */}
      {pageState === 'loading' && (
        <div className="px-4 py-6 flex flex-col gap-6">
          {/* Avatar skeleton */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-[72px] h-[72px] rounded-full bg-[#F3F4F6] animate-pulse" />
            <div className="h-5 w-28 rounded-lg bg-[#F3F4F6] animate-pulse" />
            <div className="h-4 w-20 rounded-full bg-[#F3F4F6] animate-pulse" />
          </div>
          {/* Info skeleton */}
          <div className="space-y-2">
            <div className="h-4 w-24 rounded-lg bg-[#F3F4F6] animate-pulse" />
            <div className="rounded-xl border-[0.8px] border-[#E5E7EB] overflow-hidden">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center px-4 py-4 border-b-[0.8px] border-[#F3F4F6] last:border-b-0">
                  <div className="w-4 h-4 rounded bg-[#F3F4F6] animate-pulse ml-3" />
                  <div className="h-3.5 w-16 rounded bg-[#F3F4F6] animate-pulse" />
                  <div className="flex-1" />
                  <div className="h-3.5 w-24 rounded bg-[#F3F4F6] animate-pulse" />
                </div>
              ))}
            </div>
          </div>
          {/* Clinics skeleton */}
          <div className="space-y-2">
            <div className="h-4 w-28 rounded-lg bg-[#F3F4F6] animate-pulse" />
            <div className="rounded-xl border-[0.8px] border-[#E5E7EB] p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#F3F4F6] animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-28 rounded bg-[#F3F4F6] animate-pulse" />
                <div className="h-3 w-20 rounded bg-[#F3F4F6] animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ERROR ─── */}
      {pageState === 'error' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 px-6">
          <div className="w-16 h-16 rounded-full bg-[#FEF2F2] flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-[#EF4444]" />
          </div>
          <p className="text-[14px] text-[#4B5563] text-center">{errorMsg}</p>
          <button
            onClick={() => { setPageState('loading'); fetchProfile() }}
            className="flex items-center gap-1.5 text-[13px] font-bold text-[#16A34A]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* ─── VIEW / EDIT ─── */}
      {(pageState === 'view' || pageState === 'edit') && profile && (
        <div className="px-4 py-6 flex flex-col gap-5">

          {/* ─── AVATAR + NAME ─── */}
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-[72px] h-[72px] rounded-full bg-[#16A34A] flex items-center justify-center">
              <span className="text-[28px] font-bold text-white leading-none">
                {getInitial(profile.fullName)}
              </span>
            </div>
            <div className="text-center">
              <h2 className="text-[17px] font-bold text-[#030712] truncate max-w-[280px]">
                {profile.fullName || 'بدون اسم'}
              </h2>
              <span className="inline-block mt-1 px-3 py-0.5 rounded-full bg-[#F0FDF4] text-[#16A34A] text-[12px] font-bold">
                {getRoleLabel(activeMemberships[0]?.role || 'FRONT_DESK')}
              </span>
            </div>
          </div>

          {/* ─── PENDING INVITES ─── */}
          {invites.length > 0 && (
            <div>
              <h3 className="text-[13px] font-bold text-[#D97706] mb-2 flex items-center gap-1.5">
                <Bell className="w-4 h-4" />
                دعوات معلّقة ({invites.length})
              </h3>
              {invites.map((invite) => (
                <div
                  key={invite.membershipId}
                  className="bg-[#FFFBEB] border border-[#D97706]/20 rounded-xl p-3.5 mb-2"
                >
                  <div className="mb-2.5">
                    <p className="text-[14px] font-bold text-[#030712] truncate">
                      {invite.clinic?.name || 'عيادة'}
                    </p>
                    <p className="text-[12px] text-[#6B7280] mt-0.5">
                      دعوة كـ {getRoleLabel(invite.role)} · {invite.clinic?.uniqueId}
                    </p>
                  </div>
                  {/* Buttons: min 44px touch target */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleInvite(invite.membershipId, 'accept')}
                      disabled={processingInvite === invite.membershipId}
                      className="flex-1 h-11 rounded-xl bg-[#16A34A] text-white text-[13px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform"
                    >
                      {processingInvite === invite.membershipId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      قبول
                    </button>
                    <button
                      onClick={() => handleInvite(invite.membershipId, 'reject')}
                      disabled={processingInvite === invite.membershipId}
                      className="flex-1 h-11 rounded-xl bg-white border border-[#E5E7EB] text-[#6B7280] text-[13px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform"
                    >
                      <X className="w-4 h-4" />
                      رفض
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── PERSONAL INFO ─── */}
          <div>
            <h3 className="text-[13px] font-bold text-[#4B5563] mb-2">المعلومات الشخصية</h3>
            <div className="bg-white border-[0.8px] border-[#E5E7EB] rounded-xl overflow-hidden">

              {/* Full Name */}
              <div className="flex items-center px-3.5 py-3 border-b-[0.8px] border-[#F3F4F6]">
                <User className="w-4 h-4 text-[#9CA3AF] ml-2.5 flex-shrink-0" />
                <span className="text-[12px] text-[#9CA3AF] w-[52px] flex-shrink-0">الاسم</span>
                {pageState === 'edit' ? (
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 min-w-0 text-[14px] font-semibold text-[#030712] bg-[#F9FAFB] rounded-lg px-2.5 py-1.5 outline-none border-[0.8px] border-[#E5E7EB] focus:border-[#16A34A]"
                    dir="rtl"
                    placeholder="الاسم الكامل"
                  />
                ) : (
                  <span className="flex-1 min-w-0 text-[14px] font-semibold text-[#030712] truncate">
                    {profile.fullName || '—'}
                  </span>
                )}
              </div>

              {/* Phone (main field) */}
              <div className="flex items-center px-3.5 py-3 border-b-[0.8px] border-[#F3F4F6]">
                <Phone className="w-4 h-4 text-[#9CA3AF] ml-2.5 flex-shrink-0" />
                <span className="text-[12px] text-[#9CA3AF] w-[52px] flex-shrink-0">الهاتف</span>
                {pageState === 'edit' ? (
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(normalizeEgyptianDigits(e.target.value))}
                    className="flex-1 min-w-0 text-[14px] font-semibold text-[#030712] bg-[#F9FAFB] rounded-lg px-2.5 py-1.5 outline-none border-[0.8px] border-[#E5E7EB] focus:border-[#16A34A]"
                    dir="ltr"
                    style={{ textAlign: 'left' }}
                    placeholder="01xxxxxxxxx"
                    type="tel"
                    inputMode="numeric"
                  />
                ) : (
                  <span className="flex-1 min-w-0 text-[14px] font-semibold text-[#030712] truncate" dir="ltr" style={{ textAlign: 'left' }}>
                    {profile.phone || '—'}
                  </span>
                )}
              </div>

              {/* Email (optional — clearly marked) */}
              <div className="flex items-center px-3.5 py-3">
                <Mail className="w-4 h-4 text-[#D1D5DB] ml-2.5 flex-shrink-0" />
                <div className="w-[52px] flex-shrink-0">
                  <span className="text-[12px] text-[#D1D5DB]">البريد</span>
                </div>
                {pageState === 'edit' ? (
                  <input
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="flex-1 min-w-0 text-[14px] text-[#030712] bg-[#F9FAFB] rounded-lg px-2.5 py-1.5 outline-none border-[0.8px] border-[#E5E7EB] focus:border-[#16A34A]"
                    dir="ltr"
                    style={{ textAlign: 'left' }}
                    placeholder="اختياري"
                    type="email"
                    inputMode="email"
                  />
                ) : (
                  <span className="flex-1 min-w-0 text-[14px] text-[#D1D5DB] truncate" dir="ltr" style={{ textAlign: 'left' }}>
                    {profile.email || 'اختياري'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ─── ASSOCIATED CLINICS ─── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[13px] font-bold text-[#4B5563]">العيادات المرتبطة</h3>
              <button
                onClick={() => { setShowJoinModal(true); setJoinCode(''); setJoinError('') }}
                className="flex items-center gap-1 text-[12px] font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                انضم بكود
              </button>
            </div>

            {activeMemberships.length === 0 ? (
              <div className="border-[0.8px] border-dashed border-[#D1D5DB] rounded-xl p-5 flex flex-col items-center gap-2.5">
                <Building2 className="w-8 h-8 text-[#D1D5DB]" />
                <p className="text-[13px] text-[#9CA3AF] text-center leading-relaxed">
                  لم يتم الانضمام لأي عيادة بعد
                </p>
                <p className="text-[12px] text-[#D1D5DB] text-center">
                  اطلب رمز الدعوة من مدير العيادة واضغط «انضم بكود»
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeMemberships.map((membership) => {
                  const isCurrent = membership.clinicId === currentClinicId
                  return (
                    <div
                      key={membership.id}
                      className={`rounded-xl p-3.5 flex items-center gap-3 text-right ${
                        isCurrent
                          ? 'bg-[#F0FDF4] border-[1.5px] border-[#16A34A]/40'
                          : 'bg-white border-[0.8px] border-[#E5E7EB]'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isCurrent ? 'bg-[#16A34A]/10' : 'bg-[#F3F4F6]'
                      }`}>
                        <Building2 className={`w-5 h-5 ${isCurrent ? 'text-[#16A34A]' : 'text-[#9CA3AF]'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold text-[#030712] truncate">
                          {membership.clinic?.name || 'عيادة'}
                        </p>
                        <p className="text-[12px] text-[#6B7280] truncate">
                          {getRoleLabel(membership.role)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {isCurrent ? (
                          <span className="text-[11px] font-bold text-[#16A34A] bg-[#16A34A]/10 px-2 py-0.5 rounded-full">
                            الحالية
                          </span>
                        ) : (
                          <button
                            onClick={() => setSwitchTarget(membership)}
                            className="text-[11px] font-semibold text-[#16A34A] bg-[#F0FDF4] hover:bg-[#DCFCE7] px-2 py-0.5 rounded-[6px] transition-colors"
                          >
                            تبديل
                          </button>
                        )}
                        <button
                          onClick={() => setLeaveTarget(membership)}
                          className="text-[11px] text-[#EF4444] hover:text-[#DC2626] flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-[#FEF2F2] transition-colors"
                        >
                          <LogOut className="w-3 h-3" />
                          مغادرة
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ─── SETTINGS ─── */}
          <div>
            <h3 className="text-[13px] font-bold text-[#4B5563] mb-2">الإعدادات</h3>
            <div className="bg-white border-[0.8px] border-[#E5E7EB] rounded-xl overflow-hidden">

              <button className="flex items-center w-full px-3.5 h-12 border-b-[0.8px] border-[#F3F4F6] text-right active:bg-[#F9FAFB]">
                <Bell className="w-4 h-4 text-[#6B7280] ml-2.5" />
                <span className="text-[14px] text-[#030712] flex-1">الإشعارات</span>
                <ChevronLeft className="w-4 h-4 text-[#D1D5DB]" />
              </button>

              <Link href="/privacy" className="flex items-center w-full px-3.5 h-12 border-b-[0.8px] border-[#F3F4F6] text-right active:bg-[#F9FAFB]">
                <svg className="w-4 h-4 text-[#6B7280] ml-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <span className="text-[14px] text-[#030712] flex-1">سياسة الخصوصية</span>
                <ChevronLeft className="w-4 h-4 text-[#D1D5DB]" />
              </Link>

              <Link href="/terms" className="flex items-center w-full px-3.5 h-12 border-b-[0.8px] border-[#F3F4F6] text-right active:bg-[#F9FAFB]">
                <svg className="w-4 h-4 text-[#6B7280] ml-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span className="text-[14px] text-[#030712] flex-1">شروط الاستخدام</span>
                <ChevronLeft className="w-4 h-4 text-[#D1D5DB]" />
              </Link>

              <button
                onClick={() => setShowLogout(true)}
                className="flex items-center w-full px-3.5 h-12 text-right active:bg-[#FEF2F2]"
              >
                <LogOut className="w-4 h-4 text-[#EF4444] ml-2.5" />
                <span className="text-[14px] text-[#EF4444] flex-1">تسجيل الخروج</span>
              </button>
            </div>
          </div>

          {/* ─── ACCOUNT ID ─── */}
          <div className="text-center pt-2 pb-4">
            <p className="text-[11px] text-[#D1D5DB]">
              معرّف الحساب: {profile.uniqueId}
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* LOGOUT DIALOG */}
      {/* ═══════════════════════════════════════════════════ */}
      {showLogout && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-8"
          onClick={() => !loggingOut && setShowLogout(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-[310px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-[#FEF2F2] flex items-center justify-center">
                <LogOut className="w-6 h-6 text-[#EF4444]" />
              </div>
            </div>

            <h3 className="text-[16px] font-bold text-[#030712] text-center mb-1.5">
              تسجيل الخروج؟
            </h3>
            <p className="text-[13px] text-[#6B7280] text-center mb-5 leading-relaxed">
              هل أنت متأكد أنك تريد الخروج من حسابك؟
            </p>

            {/* Buttons: min 44px touch target */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogout(false)}
                disabled={loggingOut}
                className="flex-1 h-11 rounded-xl border-[0.8px] border-[#E5E7EB] text-[14px] font-bold text-[#4B5563] active:bg-[#F3F4F6]"
              >
                إلغاء
              </button>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex-1 h-11 rounded-xl bg-[#EF4444] text-white text-[14px] font-bold flex items-center justify-center gap-2 active:bg-[#DC2626]"
              >
                {loggingOut ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'خروج'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* CLINIC SWITCH DIALOG */}
      {/* ═══════════════════════════════════════════════════ */}
      {switchTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-8"
          onClick={() => !switching && setSwitchTarget(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-[310px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-[#EFF6FF] flex items-center justify-center">
                <Building2 className="w-6 h-6 text-[#2563EB]" />
              </div>
            </div>

            <h3 className="text-[16px] font-bold text-[#030712] text-center mb-1.5">
              تبديل العيادة؟
            </h3>
            <p className="text-[13px] text-[#6B7280] text-center mb-5 leading-relaxed">
              هل تريد التبديل إلى{' '}
              <span className="font-bold text-[#030712]">{switchTarget.clinic?.name}</span>
              ؟ سيتم إعادة تحميل الصفحة.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setSwitchTarget(null)}
                disabled={switching}
                className="flex-1 h-11 rounded-xl border-[0.8px] border-[#E5E7EB] text-[14px] font-bold text-[#4B5563] active:bg-[#F3F4F6]"
              >
                إلغاء
              </button>
              <button
                onClick={handleClinicSwitch}
                disabled={switching}
                className="flex-1 h-11 rounded-xl bg-[#2563EB] text-white text-[14px] font-bold flex items-center justify-center gap-2 active:bg-[#1D4ED8]"
              >
                {switching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'تبديل'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* JOIN CLINIC MODAL                                   */}
      {/* ═══════════════════════════════════════════════════ */}
      {showJoinModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
          onClick={() => !joining && setShowJoinModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-5 w-full max-w-[340px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-[#030712]">الانضمام لعيادة</h3>
              <button onClick={() => setShowJoinModal(false)} disabled={joining}
                className="w-7 h-7 rounded-full hover:bg-[#F3F4F6] flex items-center justify-center">
                <X className="w-4 h-4 text-[#6B7280]" />
              </button>
            </div>
            <p className="text-[12px] text-[#6B7280] mb-3">
              اطلب رمز الدعوة من مدير العيادة وأدخله أدناه.
            </p>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError('') }}
              placeholder="مثال: ABCD-EF"
              maxLength={7}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleJoinClinic()}
              className="w-full h-[52px] px-3 rounded-[10px] border-[0.8px] border-[#E5E7EB] font-mono text-[20px] font-bold text-[#030712] tracking-widest text-center placeholder:font-sans placeholder:text-[13px] placeholder:font-normal placeholder:tracking-normal focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
            />
            {joinError && (
              <p className="text-[11px] text-[#DC2626] mt-1.5">{joinError}</p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleJoinClinic}
                disabled={joining || !joinCode.trim()}
                className="flex-1 h-11 rounded-xl bg-[#2563EB] text-white text-[14px] font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : 'انضم'}
              </button>
              <button
                onClick={() => setShowJoinModal(false)}
                disabled={joining}
                className="flex-1 h-11 rounded-xl border-[0.8px] border-[#E5E7EB] text-[14px] font-bold text-[#4B5563]"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* LEAVE CLINIC CONFIRM                                */}
      {/* ═══════════════════════════════════════════════════ */}
      {leaveTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-8"
          onClick={() => !leaving && setLeaveTarget(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-[310px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-[#FEF2F2] flex items-center justify-center">
                <LogOut className="w-6 h-6 text-[#EF4444]" />
              </div>
            </div>
            <h3 className="text-[16px] font-bold text-[#030712] text-center mb-1.5">مغادرة العيادة؟</h3>
            <p className="text-[13px] text-[#6B7280] text-center mb-5 leading-relaxed">
              هل تريد مغادرة{' '}
              <span className="font-bold text-[#030712]">{leaveTarget.clinic?.name}</span>
              ؟ يمكنك الانضمام مجدداً برمز الدعوة.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setLeaveTarget(null)}
                disabled={leaving}
                className="flex-1 h-11 rounded-xl border-[0.8px] border-[#E5E7EB] text-[14px] font-bold text-[#4B5563]"
              >
                إلغاء
              </button>
              <button
                onClick={handleLeaveClinic}
                disabled={leaving}
                className="flex-1 h-11 rounded-xl bg-[#EF4444] text-white text-[14px] font-bold flex items-center justify-center gap-2"
              >
                {leaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'مغادرة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
