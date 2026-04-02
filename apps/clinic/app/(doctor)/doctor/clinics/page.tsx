'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Plus, Building2, Users, Clock, Check, X, LogIn, LogOut } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface ClinicData {
  id: string
  name: string
  uniqueId: string
  role: string
  doctorCount?: number
  staffCount?: number
  isActive?: boolean
}

// ============================================================================
// ADD CLINIC MODAL  (create a brand-new clinic)
// ============================================================================

function AddClinicModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean
  onClose: () => void
  onCreated: (clinic: ClinicData) => void
}) {
  const [name,    setName]    = useState('')
  const [address, setAddress] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!name.trim() || name.trim().length < 2) {
      setError('يرجى إدخال اسم العيادة (حرفين على الأقل)')
      return
    }
    if (!address.trim() || address.trim().length < 5) {
      setError('يرجى إدخال عنوان العيادة (يظهر على الروشتة)')
      return
    }

    setCreating(true)
    setError('')

    try {
      const res = await fetch('/api/clinic/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), address: address.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'فشل في إنشاء العيادة')
        return
      }

      onCreated({
        id: data.clinicId,
        name: name.trim(),
        uniqueId: data.clinicUniqueId,
        role: 'owner',
        doctorCount: 1,
        staffCount: 0,
        isActive: false,
      })

      setName('')
      setAddress('')
      onClose()
    } catch {
      setError('حدث خطأ. حاول مرة أخرى')
    } finally {
      setCreating(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto">
        <div className="bg-white rounded-[16px] shadow-xl overflow-hidden" dir="rtl">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="font-cairo text-[16px] font-bold text-[#030712]">إضافة عيادة</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-[#F3F4F6] flex items-center justify-center">
              <X className="w-5 h-5 text-[#6B7280]" />
            </button>
          </div>

          <div className="px-5 pb-5">
            <label className="font-cairo text-[13px] font-medium text-[#4B5563] block mb-2">
              اسم العيادة *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
              placeholder="مثال: عيادة المعادي الخاصة"
              className="w-full h-[44px] px-4 rounded-[10px] border-[0.8px] border-[#E5E7EB] font-cairo text-[14px] text-[#030712] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A] text-right"
              autoFocus
            />

            <label className="font-cairo text-[13px] font-medium text-[#4B5563] block mt-4 mb-2">
              عنوان العيادة * <span className="font-normal text-[#9CA3AF]">(يظهر على الروشتة)</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => { setAddress(e.target.value); setError('') }}
              placeholder="مثال: ١٢ شارع التحرير، المعادي، القاهرة"
              className="w-full h-[44px] px-4 rounded-[10px] border-[0.8px] border-[#E5E7EB] font-cairo text-[14px] text-[#030712] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A] text-right"
            />

            {error && (
              <p className="font-cairo text-[12px] text-[#DC2626] mt-2">{error}</p>
            )}

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleCreate}
                disabled={creating || !name.trim() || !address.trim()}
                className="flex-1 h-[44px] bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 disabled:cursor-not-allowed text-white font-cairo text-[14px] font-semibold rounded-[10px] transition-colors flex items-center justify-center gap-2"
              >
                {creating ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><Check className="w-4 h-4" /> إنشاء</>
                )}
              </button>
              <button
                onClick={onClose}
                className="flex-1 h-[44px] bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#4B5563] font-cairo text-[14px] font-medium rounded-[10px] transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ============================================================================
// JOIN CLINIC MODAL  (join an existing clinic with an invite code)
// ============================================================================

function JoinClinicModal({
  isOpen,
  onClose,
  onJoined,
}: {
  isOpen: boolean
  onClose: () => void
  onJoined: (clinic: ClinicData) => void
}) {
  const [code,    setCode]    = useState('')
  const [joining, setJoining] = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState<string | null>(null)

  // Reset state every time the modal opens
  useEffect(() => {
    if (isOpen) { setCode(''); setError(''); setSuccess(null) }
  }, [isOpen])

  const handleJoin = async () => {
    if (!code.trim()) {
      setError('أدخل رمز الدعوة')
      return
    }
    setJoining(true)
    setError('')
    try {
      const res = await fetch('/api/clinic/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: code.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'رمز الدعوة غير صحيح')
        return
      }
      // Show brief success state then close
      setSuccess(data.clinicName || 'العيادة')
      onJoined({
        id: data.clinicId,
        name: data.clinicName,
        uniqueId: data.clinicUniqueId,
        role: (data.role || 'doctor').toLowerCase(),
        isActive: false,
      })
      setTimeout(onClose, 1800)
    } catch {
      setError('حدث خطأ. حاول مرة أخرى')
    } finally {
      setJoining(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={!joining ? onClose : undefined} />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto">
        <div className="bg-white rounded-[16px] shadow-xl overflow-hidden" dir="rtl">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="font-cairo text-[16px] font-bold text-[#030712]">الانضمام لعيادة</h2>
            <button
              onClick={onClose}
              disabled={joining}
              className="w-8 h-8 rounded-full hover:bg-[#F3F4F6] flex items-center justify-center disabled:opacity-40"
            >
              <X className="w-5 h-5 text-[#6B7280]" />
            </button>
          </div>

          <div className="px-5 pb-5">
            {success ? (
              /* Success state */
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-[#DCFCE7] flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 text-[#16A34A]" />
                </div>
                <p className="font-cairo text-[15px] font-bold text-[#030712]">تم الانضمام بنجاح!</p>
                <p className="font-cairo text-[13px] text-[#6B7280] mt-1">{success}</p>
              </div>
            ) : (
              <>
                <p className="font-cairo text-[13px] text-[#6B7280] mb-4">
                  اطلب رمز الدعوة من مدير العيادة وأدخله أدناه.
                </p>

                <label className="font-cairo text-[13px] font-medium text-[#4B5563] block mb-2">
                  رمز الدعوة
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.toUpperCase()); setError('') }}
                  placeholder="مثال: ABCD-EF"
                  maxLength={7}
                  className="w-full h-[52px] px-4 rounded-[10px] border-[0.8px] border-[#E5E7EB] font-mono text-[20px] font-bold text-[#030712] tracking-widest placeholder:text-[#D1D5DB] placeholder:font-sans placeholder:text-[14px] placeholder:font-normal placeholder:tracking-normal focus:outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20 text-center"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                />

                {error && (
                  <p className="font-cairo text-[12px] text-[#DC2626] mt-2">{error}</p>
                )}

                <div className="flex gap-3 mt-5">
                  <button
                    onClick={handleJoin}
                    disabled={joining || !code.trim()}
                    className="flex-1 h-[44px] bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed text-white font-cairo text-[14px] font-semibold rounded-[10px] transition-colors flex items-center justify-center gap-2"
                  >
                    {joining ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <><LogIn className="w-4 h-4" /> انضم</>
                    )}
                  </button>
                  <button
                    onClick={onClose}
                    disabled={joining}
                    className="flex-1 h-[44px] bg-[#F3F4F6] hover:bg-[#E5E7EB] disabled:opacity-40 text-[#4B5563] font-cairo text-[14px] font-medium rounded-[10px] transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ============================================================================
// CLINIC CARD
// ============================================================================

function ClinicCard({
  clinic,
  onSwitch,
  onLeave,
}: {
  clinic: ClinicData
  onSwitch: (clinicId: string) => void
  onLeave:  (clinic: ClinicData) => void
}) {
  const isOwner = clinic.role === 'OWNER' || clinic.role === 'owner'
  const roleLabel = isOwner ? 'مالك العيادة'
    : (clinic.role === 'DOCTOR' || clinic.role === 'doctor') ? 'طبيب'
    : 'مساعد'

  return (
    <div className={`bg-white rounded-[12px] border-[0.8px] p-4 transition-colors ${
      clinic.isActive ? 'border-[#16A34A] bg-[#FAFFF9]' : 'border-[#E5E7EB]'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-[10px] flex items-center justify-center flex-shrink-0 ${
          clinic.isActive ? 'bg-[#DCFCE7]' : 'bg-[#F3F4F6]'
        }`}>
          <Building2 className={`w-5 h-5 ${clinic.isActive ? 'text-[#16A34A]' : 'text-[#6B7280]'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-cairo text-[15px] font-semibold text-[#030712] truncate">
              {clinic.name}
            </h3>
            {clinic.isActive && (
              <span className="bg-[#DCFCE7] text-[#16A34A] font-cairo text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                نشطة
              </span>
            )}
          </div>
          <p className="font-cairo text-[12px] text-[#9CA3AF] mt-0.5">{roleLabel}</p>
          <div className="flex items-center gap-4 mt-2">
            {clinic.doctorCount !== undefined && (
              <div className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-[#9CA3AF]" />
                <span className="font-cairo text-[12px] text-[#6B7280]">{clinic.doctorCount} طبيب</span>
              </div>
            )}
            {clinic.staffCount !== undefined && clinic.staffCount > 0 && (
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#9CA3AF]" />
                <span className="font-cairo text-[12px] text-[#6B7280]">{clinic.staffCount} مساعد</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {!clinic.isActive && (
            <button
              onClick={() => onSwitch(clinic.id)}
              className="font-cairo text-[12px] font-semibold text-[#16A34A] bg-[#F0FDF4] hover:bg-[#DCFCE7] px-3 py-1.5 rounded-[8px] transition-colors"
            >
              تبديل
            </button>
          )}
          {/* Leave is only available for non-owners */}
          {!isOwner && (
            <button
              onClick={() => onLeave(clinic)}
              className="font-cairo text-[11px] text-[#EF4444] hover:text-[#DC2626] flex items-center gap-1 px-2 py-1 rounded-[6px] hover:bg-[#FEF2F2] transition-colors"
            >
              <LogOut className="w-3 h-3" />
              مغادرة
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// LEAVE CONFIRM DIALOG
// ============================================================================

function LeaveConfirmDialog({
  clinic,
  onConfirm,
  onCancel,
  leaving,
  error,
}: {
  clinic: ClinicData
  onConfirm: () => void
  onCancel:  () => void
  leaving:   boolean
  error:     string | null
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={!leaving ? onCancel : undefined} />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto">
        <div className="bg-white rounded-[16px] shadow-xl p-5" dir="rtl">
          <div className="w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center mx-auto mb-3">
            <LogOut className="w-6 h-6 text-[#DC2626]" />
          </div>
          <h3 className="font-cairo text-[16px] font-bold text-[#030712] text-center mb-1">
            مغادرة العيادة
          </h3>
          <p className="font-cairo text-[13px] text-[#6B7280] text-center mb-1">
            هل أنت متأكد أنك تريد مغادرة
          </p>
          <p className="font-cairo text-[14px] font-bold text-[#030712] text-center mb-4">
            {clinic.name}؟
          </p>
          <p className="font-cairo text-[12px] text-[#9CA3AF] text-center mb-4">
            يمكنك الانضمام مجدداً برمز الدعوة إذا احتجت.
          </p>
          {error && (
            <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-[8px] px-3 py-2 mb-3">
              <p className="font-cairo text-[13px] text-[#DC2626] text-center">{error}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={onConfirm}
              disabled={leaving}
              className="flex-1 h-[44px] bg-[#EF4444] hover:bg-[#DC2626] disabled:opacity-50 text-white font-cairo text-[14px] font-semibold rounded-[10px] transition-colors flex items-center justify-center"
            >
              {leaving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'نعم، غادر'}
            </button>
            <button
              onClick={onCancel}
              disabled={leaving}
              className="flex-1 h-[44px] bg-[#F3F4F6] hover:bg-[#E5E7EB] disabled:opacity-40 text-[#4B5563] font-cairo text-[14px] font-medium rounded-[10px] transition-colors"
            >
              إلغاء
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function ClinicsPage() {
  const router = useRouter()
  const [clinics, setClinics] = useState<ClinicData[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal,  setShowAddModal]  = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [leaveTarget, setLeaveTarget] = useState<ClinicData | null>(null)
  const [leaving,     setLeaving]     = useState(false)
  const [leaveError,  setLeaveError]  = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/clinic')
        if (res.ok) {
          const data = await res.json()
          if (data.success && data.allClinics) {
            const enriched: ClinicData[] = data.allClinics.map((c: any) => ({
              id: c.id,
              name: c.name,
              uniqueId: c.uniqueId,
              role: c.role,
              isActive: c.id === data.clinic?.id,
              doctorCount: c.id === data.clinic?.id ? data.doctorCount : undefined,
              staffCount:  c.id === data.clinic?.id ? data.staffCount  : undefined,
            }))
            setClinics(enriched)
          }
        }
      } catch {
        // graceful fail
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleSwitch = async (clinicId: string) => {
    setSwitching(true)
    try {
      const res = await fetch('/api/clinic/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId }),
      })
      if (res.ok) {
        setClinics(prev => prev.map(c => ({ ...c, isActive: c.id === clinicId })))
        setTimeout(() => { router.push('/doctor/dashboard'); router.refresh() }, 300)
      }
    } catch { /* ignore */ }
    setSwitching(false)
  }

  const handleClinicCreated = (newClinic: ClinicData) => {
    setClinics(prev => [...prev, newClinic])
  }

  const handleLeaveClinic = async () => {
    if (!leaveTarget) return
    setLeaving(true)
    setLeaveError(null)
    try {
      const res = await fetch('/api/clinic/leave', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: leaveTarget.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        setLeaveError(data.error || 'فشل في مغادرة العيادة')
        return
      }
      setClinics(prev => prev.filter(c => c.id !== leaveTarget.id))
      setLeaveTarget(null)
    } catch {
      setLeaveError('حدث خطأ. حاول مرة أخرى')
    } finally {
      setLeaving(false)
    }
  }

  const handleClinicJoined = (newClinic: ClinicData) => {
    // Avoid duplicates — only add if not already in the list
    setClinics(prev =>
      prev.find(c => c.id === newClinic.id) ? prev : [...prev, newClinic]
    )
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]" dir="rtl">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center"
            >
              <ChevronRight className="w-[20px] h-[20px] text-[#030712]" />
            </button>
            <h1 className="font-cairo text-[18px] leading-[22px] font-semibold text-[#030712]">
              العيادات
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 pb-24">
          {loading ? (
            <div className="text-center py-16">
              <div className="w-10 h-10 border-2 border-[#16A34A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="font-cairo text-[14px] text-[#6B7280]">جاري التحميل...</p>
            </div>
          ) : clinics.length === 0 ? (
            <div className="text-center py-16">
              <Building2 className="w-12 h-12 text-[#D1D5DB] mx-auto mb-4" />
              <p className="font-cairo text-[16px] font-semibold text-[#030712] mb-1">لا توجد عيادات</p>
              <p className="font-cairo text-[14px] text-[#6B7280] mb-6">
                أنشئ عيادتك الأولى أو انضم لعيادة موجودة
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {clinics.map((clinic) => (
                <ClinicCard
                  key={clinic.id}
                  clinic={clinic}
                  onSwitch={handleSwitch}
                  onLeave={setLeaveTarget}
                />
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-6 space-y-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="w-full h-[48px] bg-[#16A34A] hover:bg-[#15803D] text-white font-cairo text-[14px] font-semibold rounded-[12px] transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              إنشاء عيادة جديدة
            </button>

            <button
              onClick={() => setShowJoinModal(true)}
              className="w-full h-[48px] bg-white hover:bg-[#F0F9FF] border-[0.8px] border-[#BFDBFE] text-[#2563EB] font-cairo text-[14px] font-semibold rounded-[12px] transition-colors flex items-center justify-center gap-2"
            >
              <LogIn className="w-5 h-5" />
              انضم لعيادة بكود الدعوة
            </button>
          </div>
        </div>
      </div>

      {/* Leave confirm dialog */}
      {leaveTarget && (
        <LeaveConfirmDialog
          clinic={leaveTarget}
          onConfirm={handleLeaveClinic}
          onCancel={() => { setLeaveTarget(null); setLeaveError(null) }}
          leaving={leaving}
          error={leaveError}
        />
      )}

      {/* Modals */}
      <AddClinicModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={handleClinicCreated}
      />
      <JoinClinicModal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        onJoined={handleClinicJoined}
      />

      {/* Switching overlay */}
      {switching && (
        <div className="fixed inset-0 bg-white/80 z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-[#16A34A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="font-cairo text-[14px] font-medium text-[#4B5563]">جاري تبديل العيادة...</p>
          </div>
        </div>
      )}
    </div>
  )
}
