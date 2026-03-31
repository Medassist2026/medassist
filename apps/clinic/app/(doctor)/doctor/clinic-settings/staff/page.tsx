'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Copy, Check, UserMinus, AlertTriangle, Users, Phone, Calendar } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface StaffMember {
  user_id: string
  role: string
  status: string
  full_name: string | null
  phone: string | null
  specialty: string | null
  created_at?: string
  assignments: Array<{
    id: string
    assistant_user_id: string
    doctor_user_id: string
    scope: string
    status: string
  }>
}

const ROLE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  OWNER: { label: 'مالك', bg: 'bg-[#DCFCE7]', text: 'text-[#16A34A]' },
  DOCTOR: { label: 'طبيب', bg: 'bg-[#DBEAFE]', text: 'text-[#2563EB]' },
  ASSISTANT: { label: 'مساعد', bg: 'bg-[#F0FDF4]', text: 'text-[#16A34A]' },
  FRONT_DESK: { label: 'استقبال', bg: 'bg-[#FEF9C3]', text: 'text-[#A16207]' },
}

const SCOPE_LABELS: Record<string, string> = {
  APPOINTMENTS_ONLY: 'المواعيد فقط',
  PATIENT_DEMOGRAPHICS: 'بيانات المريض',
  FULL_DOCTOR_SUPPORT: 'دعم كامل',
}

// ============================================================================
// REMOVE ASSISTANT DIALOG
// ============================================================================

function RemoveAssistantDialog({
  member,
  onConfirm,
  onCancel,
}: {
  member: StaffMember
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onCancel} />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto">
        <div className="bg-white rounded-[16px] shadow-xl p-5" dir="rtl">
          {/* Warning icon */}
          <div className="w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-6 h-6 text-[#DC2626]" />
          </div>

          <h3 className="font-cairo text-[16px] font-bold text-[#030712] text-center mb-2">
            إزالة المساعد
          </h3>

          <p className="font-cairo text-[13px] text-[#6B7280] text-center mb-1">
            هل أنت متأكد أنك تريد إزالة هذا المساعد من العيادة؟
          </p>

          {/* Member info */}
          <div className="bg-[#FEF2F2] rounded-[10px] p-3 my-3 text-center">
            <p className="font-cairo text-[14px] font-semibold text-[#DC2626]">
              {member.full_name || 'مساعد'}
            </p>
            {member.phone && (
              <p className="font-cairo text-[12px] text-[#991B1B] mt-0.5" dir="ltr">
                {member.phone}
              </p>
            )}
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={onConfirm}
              className="flex-1 h-[44px] bg-[#DC2626] hover:bg-[#B91C1C] text-white font-cairo text-[14px] font-semibold rounded-[10px] transition-colors"
            >
              إزالة
            </button>
            <button
              onClick={onCancel}
              className="flex-1 h-[44px] bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#4B5563] font-cairo text-[14px] font-medium rounded-[10px] transition-colors"
            >
              لا، رجوع
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

export default function StaffManagementPage() {
  const router = useRouter()
  const [members, setMembers] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Remove dialog
  const [memberToRemove, setMemberToRemove] = useState<StaffMember | null>(null)

  // Assignment modal
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedAssistant, setSelectedAssistant] = useState('')
  const [selectedDoctor, setSelectedDoctor] = useState('')
  const [selectedScope, setSelectedScope] = useState('APPOINTMENTS_ONLY')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadStaff(); loadInviteCode() }, [])

  async function loadStaff() {
    try {
      const res = await fetch('/api/clinic/staff')
      const data = await res.json()
      if (data.success) setMembers(data.members || [])
    } catch {
      setError('فشل في تحميل بيانات الفريق')
    } finally {
      setLoading(false)
    }
  }

  async function loadInviteCode() {
    try {
      const res = await fetch('/api/clinic/invite-code')
      const data = await res.json()
      if (data.inviteCode) setInviteCode(data.inviteCode)
    } catch { /* ignore */ }
  }

  const copyCode = () => {
    if (!inviteCode) return
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const doctors = members.filter(m => m.role === 'DOCTOR' || m.role === 'OWNER')
  const assistants = members.filter(m => m.role === 'ASSISTANT' || m.role === 'FRONT_DESK')

  async function createAssignment() {
    if (!selectedAssistant || !selectedDoctor) return
    setSaving(true)
    try {
      const res = await fetch('/api/clinic/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistantUserId: selectedAssistant, doctorUserId: selectedDoctor, scope: selectedScope }),
      })
      if (res.ok) {
        setShowAssignModal(false)
        loadStaff()
      }
    } catch {
      setError('فشل في إنشاء التعيين')
    } finally {
      setSaving(false)
    }
  }

  async function removeMember(userId: string) {
    try {
      const res = await fetch('/api/clinic/membership', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'فشل في إزالة العضو')
      }
      setMemberToRemove(null)
      loadStaff()
    } catch (err: any) {
      setError(err.message || 'فشل في إزالة العضو')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center" dir="rtl">
        <div className="w-10 h-10 border-2 border-[#16A34A] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]" dir="rtl">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <button
            onClick={() => router.back()}
            className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center"
          >
            <ChevronRight className="w-[20px] h-[20px] text-[#030712]" />
          </button>
          <h1 className="font-cairo text-[18px] leading-[22px] font-semibold text-[#030712]">
            المساعدون
          </h1>
        </div>

        <div className="px-4 pb-24 space-y-4">
          {error && (
            <div className="p-3 bg-[#FEF2F2] border-[0.8px] border-[#FECACA] rounded-[12px] font-cairo text-[13px] text-[#DC2626] text-center">
              {error}
            </div>
          )}

          {/* Invite Code Card */}
          <div className="bg-white rounded-[16px] border-[0.8px] border-[#E5E7EB] p-5">
            <p className="font-cairo text-[13px] font-medium text-[#4B5563] mb-3">
              دعوة مساعد
            </p>
            <p className="font-cairo text-[12px] text-[#9CA3AF] mb-3">
              شارك هذا الكود مع المساعد للانضمام للعيادة
            </p>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-[48px] bg-[#F9FAFB] border-[0.8px] border-[#E5E7EB] rounded-[10px] flex items-center justify-center">
                <span className="font-cairo text-[20px] font-bold text-[#030712] tracking-widest">
                  {inviteCode || '------'}
                </span>
              </div>
              <button
                onClick={copyCode}
                className={`h-[48px] px-4 rounded-[10px] flex items-center gap-2 font-cairo text-[13px] font-medium transition-colors ${
                  copied
                    ? 'bg-[#DCFCE7] text-[#16A34A]'
                    : 'bg-[#16A34A] hover:bg-[#15803D] text-white'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'تم النسخ' : 'نسخ'}
              </button>
            </div>
          </div>

          {/* Members List */}
          <div className="bg-white rounded-[16px] border-[0.8px] border-[#E5E7EB] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F3F4F6]">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#6B7280]" />
                <span className="font-cairo text-[14px] font-semibold text-[#030712]">
                  أعضاء الفريق ({members.length})
                </span>
              </div>
              {assistants.length > 0 && doctors.length > 0 && (
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="px-3 py-1.5 bg-[#16A34A] text-white rounded-[8px] font-cairo text-[12px] font-medium hover:bg-[#15803D] transition-colors"
                >
                  تعيين مساعد
                </button>
              )}
            </div>

            <div className="divide-y divide-[#F3F4F6]">
              {members.map((member) => {
                const roleConfig = ROLE_CONFIG[member.role] || ROLE_CONFIG.ASSISTANT
                const isRemovable = member.role === 'ASSISTANT' || member.role === 'FRONT_DESK'

                return (
                  <div key={member.user_id} className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${roleConfig.bg}`}>
                        <span className={`font-cairo text-[14px] font-bold ${roleConfig.text}`}>
                          {(member.full_name || member.phone || '?')[0]}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-cairo text-[14px] font-medium text-[#030712] truncate">
                            {member.full_name || 'مجهول'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full font-cairo text-[10px] font-semibold ${roleConfig.bg} ${roleConfig.text}`}>
                            {roleConfig.label}
                          </span>
                        </div>
                        {member.phone && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-[#9CA3AF]" />
                            <span className="font-cairo text-[12px] text-[#9CA3AF]" dir="ltr">{member.phone}</span>
                          </div>
                        )}

                        {/* Assignments */}
                        {member.assignments.length > 0 && (
                          <div className="mt-1.5 space-y-1">
                            {member.assignments.map(a => {
                              const other = members.find(
                                m => m.user_id === (a.assistant_user_id === member.user_id ? a.doctor_user_id : a.assistant_user_id)
                              )
                              const isAssistantRole = a.assistant_user_id === member.user_id
                              return (
                                <div key={a.id} className="flex items-center gap-1.5 font-cairo text-[11px] text-[#6B7280]">
                                  <span>{isAssistantRole ? 'يساعد' : 'يساعده'}</span>
                                  <span className="font-medium text-[#030712]">{other?.full_name || 'مجهول'}</span>
                                  <span className="px-1.5 py-0.5 bg-[#F3F4F6] rounded text-[10px]">
                                    {SCOPE_LABELS[a.scope] || a.scope}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* Remove button */}
                      {isRemovable && (
                        <button
                          onClick={() => setMemberToRemove(member)}
                          className="w-8 h-8 rounded-full hover:bg-[#FEF2F2] flex items-center justify-center transition-colors flex-shrink-0"
                        >
                          <UserMinus className="w-4 h-4 text-[#DC2626]" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Remove Dialog */}
      {memberToRemove && (
        <RemoveAssistantDialog
          member={memberToRemove}
          onConfirm={() => removeMember(memberToRemove.user_id)}
          onCancel={() => setMemberToRemove(null)}
        />
      )}

      {/* Assignment Modal */}
      {showAssignModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowAssignModal(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50">
            <div className="bg-white rounded-t-[20px] max-w-md mx-auto p-5 safe-area-bottom" dir="rtl">
              <h2 className="font-cairo text-[16px] font-bold text-[#030712] mb-4">تعيين مساعد لطبيب</h2>

              <div className="space-y-4">
                <div>
                  <label className="font-cairo text-[12px] font-medium text-[#4B5563] block mb-1.5">المساعد / الاستقبال</label>
                  <select
                    value={selectedAssistant}
                    onChange={e => setSelectedAssistant(e.target.value)}
                    className="w-full h-[44px] px-3 border-[0.8px] border-[#E5E7EB] rounded-[10px] font-cairo text-[14px] focus:outline-none focus:border-[#16A34A]"
                  >
                    <option value="">اختر...</option>
                    {assistants.map(a => (
                      <option key={a.user_id} value={a.user_id}>
                        {a.full_name || a.phone}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-cairo text-[12px] font-medium text-[#4B5563] block mb-1.5">الطبيب</label>
                  <select
                    value={selectedDoctor}
                    onChange={e => setSelectedDoctor(e.target.value)}
                    className="w-full h-[44px] px-3 border-[0.8px] border-[#E5E7EB] rounded-[10px] font-cairo text-[14px] focus:outline-none focus:border-[#16A34A]"
                  >
                    <option value="">اختر...</option>
                    {doctors.map(d => (
                      <option key={d.user_id} value={d.user_id}>
                        د. {d.full_name || d.phone}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-cairo text-[12px] font-medium text-[#4B5563] block mb-1.5">نطاق الصلاحيات</label>
                  <select
                    value={selectedScope}
                    onChange={e => setSelectedScope(e.target.value)}
                    className="w-full h-[44px] px-3 border-[0.8px] border-[#E5E7EB] rounded-[10px] font-cairo text-[14px] focus:outline-none focus:border-[#16A34A]"
                  >
                    <option value="APPOINTMENTS_ONLY">المواعيد فقط</option>
                    <option value="PATIENT_DEMOGRAPHICS">بيانات المريض</option>
                    <option value="FULL_DOCTOR_SUPPORT">دعم كامل</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-5">
                <button
                  onClick={createAssignment}
                  disabled={!selectedAssistant || !selectedDoctor || saving}
                  className="flex-1 h-[44px] bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white font-cairo text-[14px] font-semibold rounded-[10px] transition-colors"
                >
                  {saving ? 'جاري...' : 'تعيين'}
                </button>
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="flex-1 h-[44px] bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#4B5563] font-cairo text-[14px] font-medium rounded-[10px] transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
