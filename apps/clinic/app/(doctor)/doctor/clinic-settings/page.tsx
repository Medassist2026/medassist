'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ar } from '@shared/lib/i18n/ar'
import { AssistantManager } from '@ui-clinic/components/doctor/AssistantManager'
import { Pencil, X, Check, Building2, User } from 'lucide-react'

const SPECIALTY_AR: Record<string, string> = {
  'general': 'طب عام',
  'general-practitioner': 'طب عام',
  'general practitioner': 'طب عام',
  'internal-medicine': 'باطنة',
  'باطنة': 'باطنة',
  'pediatrics': 'أطفال',
  'cardiology': 'قلب وأوعية دموية',
  'obstetrics-gynecology': 'نساء وتوليد',
  'orthopedics': 'عظام',
  'dermatology': 'جلدية',
  'ophthalmology': 'عيون',
  'ent': 'أنف وأذن وحنجرة',
  'neurology': 'مخ وأعصاب',
  'psychiatry': 'نفسية',
  'urology': 'مسالك بولية',
  'surgery': 'جراحة عامة',
  'dentistry': 'أسنان',
  'radiology': 'أشعة',
  'laboratory': 'تحاليل',
  'physiotherapy': 'علاج طبيعي',
  'nutrition': 'تغذية',
  'endocrinology': 'غدد صماء',
}
function toAr(slug?: string) {
  if (!slug) return ''
  return SPECIALTY_AR[slug] ?? SPECIALTY_AR[slug.toLowerCase()] ?? slug
}

interface ClinicInfo {
  id: string
  name: string
  uniqueId: string
  role: string  // 'owner' | 'doctor'
}

interface ClinicData {
  clinicId: string
  clinicName: string
  clinicUniqueId: string
  doctors: any[]
  staff: any[]
  currentUserId: string
  userRole: string // 'OWNER' | 'DOCTOR' | 'ASSISTANT'
  hasMultipleClinics: boolean
  allClinics: ClinicInfo[]
}

export default function ClinicSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clinic, setClinic] = useState<ClinicData | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Edit clinic info state
  const [editingClinic, setEditingClinic] = useState(false)
  const [editName,    setEditName]    = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editSaving,  setEditSaving]  = useState(false)
  const [editError,   setEditError]   = useState('')

  useEffect(() => {
    loadClinicData()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const loadClinicData = async () => {
    try {
      const res = await fetch('/api/clinic/settings')
      if (!res.ok) {
        if (res.status === 404) {
          setClinic(null)
          return
        }
        throw new Error('فشل في تحميل بيانات العيادة')
      }
      const data = await res.json()
      setClinic(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const startEditClinic = () => {
    if (!clinic) return
    setEditName(clinic.clinicName)
    setEditAddress('')   // not returned by settings API yet — leave blank for user to fill
    setEditError('')
    setEditingClinic(true)
  }

  const saveEditClinic = async () => {
    if (!editName.trim() || editName.trim().length < 2) {
      setEditError('الاسم لازم يكون على الأقل حرفين')
      return
    }
    setEditSaving(true)
    setEditError('')
    try {
      const body: Record<string, string> = { name: editName.trim() }
      if (editAddress.trim().length >= 5) body.address = editAddress.trim()

      const res = await fetch('/api/clinic/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل الحفظ')

      // Update local state so the header reflects the new name immediately
      setClinic(prev => prev ? { ...prev, clinicName: editName.trim() } : prev)
      setEditingClinic(false)
    } catch (err: any) {
      setEditError(err.message || 'فشل الحفظ')
    } finally {
      setEditSaving(false)
    }
  }

  const handleSwitchClinic = async (clinicId: string) => {
    if (clinicId === clinic?.clinicId) { setDropdownOpen(false); return }
    setSwitching(true)
    setDropdownOpen(false)
    try {
      await fetch('/api/clinic/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId }),
      })
      setLoading(true)
      await loadClinicData()
    } finally {
      setSwitching(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto p-4" dir="rtl">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <h1 className="text-lg font-bold text-red-900 mb-2">خطأ</h1>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    )
  }

  if (!clinic) {
    return (
      <div className="max-w-md mx-auto p-4" dir="rtl">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="text-4xl mb-3">🏥</div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">لا توجد عيادة</h1>
          <p className="text-sm text-gray-500 mb-4">أنشئ عيادة جديدة أو انضم لعيادة موجودة</p>
          <Link
            href="/doctor/clinics"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#16A34A] text-white font-cairo text-[13px] font-semibold rounded-[10px] hover:bg-[#15803D] transition-colors"
          >
            <Building2 className="w-4 h-4" />
            إدارة العيادات
          </Link>
        </div>
      </div>
    )
  }

  const isOwner = clinic.userRole === 'OWNER'

  return (
    <div className="max-w-md mx-auto px-4 py-4 space-y-4 lg:max-w-2xl lg:px-0 lg:py-6" dir="rtl">

      {/* Non-owner banner */}
      {!isOwner && (
        <div className="flex items-start gap-3 bg-[#FFF7ED] border border-[#FED7AA] rounded-2xl p-4">
          <svg className="w-5 h-5 text-[#EA580C] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-cairo font-semibold text-[13px] text-[#9A3412]">عرض فقط</p>
            <p className="font-cairo text-[12px] text-[#C2410C] mt-0.5">
              أنت عضو في هذه العيادة. تعديل الإعدادات ودعوة الفريق متاح للمالك فقط.
            </p>
          </div>
        </div>
      )}

      {/* Clinic Info Header — with switcher when doctor belongs to multiple clinics */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {clinic.hasMultipleClinics ? (
              /* Clinic switcher dropdown */
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(v => !v)}
                  className="flex items-center gap-1.5 group"
                  disabled={switching}
                >
                  <h2 className="font-bold text-base text-gray-900 truncate group-hover:text-[#16A34A] transition-colors">
                    {switching ? 'جاري التبديل...' : clinic.clinicName}
                  </h2>
                  <svg
                    className={`w-4 h-4 text-[#9CA3AF] flex-shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <p className="text-xs text-gray-400 font-mono mt-0.5">ID: {clinic.clinicUniqueId}</p>

                {dropdownOpen && (
                  <div className="absolute top-full mt-1 right-0 bg-white border border-[#E5E7EB] rounded-xl shadow-lg z-20 min-w-[220px] overflow-hidden">
                    <p className="font-cairo text-[11px] text-[#9CA3AF] px-3 pt-2 pb-1">تبديل العيادة</p>
                    {clinic.allClinics.map(c => (
                      <button
                        key={c.id}
                        onClick={() => handleSwitchClinic(c.id)}
                        className={`w-full text-right px-3 py-2.5 flex items-center gap-2 transition-colors ${
                          c.id === clinic.clinicId
                            ? 'bg-[#F0FDF4] text-[#16A34A]'
                            : 'hover:bg-[#F9FAFB] text-[#030712]'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${c.id === clinic.clinicId ? 'bg-[#16A34A]' : 'bg-[#E5E7EB]'}`} />
                        <span className="font-cairo text-[13px] font-medium flex-1 truncate">{c.name}</span>
                        {c.role === 'owner' && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-[#DCFCE7] text-[#16A34A] rounded-full font-cairo font-semibold flex-shrink-0">مالك</span>
                        )}
                      </button>
                    ))}
                    <div className="border-t border-[#F3F4F6] mt-1">
                      <Link
                        href="/doctor/clinics"
                        onClick={() => setDropdownOpen(false)}
                        className="w-full text-right px-3 py-2.5 flex items-center gap-2 hover:bg-[#F9FAFB] text-[#6B7280] hover:text-[#16A34A] transition-colors"
                      >
                        <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="font-cairo text-[12px] font-medium">إدارة العيادات</span>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <h2 className="font-bold text-base text-gray-900 mb-1">{clinic.clinicName}</h2>
                <p className="text-xs text-gray-400 font-mono">ID: {clinic.clinicUniqueId}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isOwner && (
              <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#16A34A] font-cairo font-semibold text-[11px] rounded-full">
                مالك
              </span>
            )}
            {isOwner && !editingClinic && (
              <button
                onClick={startEditClinic}
                className="w-7 h-7 rounded-full hover:bg-[#F3F4F6] flex items-center justify-center transition-colors"
                title="تعديل بيانات العيادة"
              >
                <Pencil className="w-3.5 h-3.5 text-[#6B7280]" />
              </button>
            )}
          </div>
        </div>

        {/* Inline edit form — owner only */}
        {editingClinic && (
          <div className="mt-3 space-y-2">
            <input
              type="text"
              value={editName}
              onChange={e => { setEditName(e.target.value); setEditError('') }}
              placeholder="اسم العيادة"
              className="w-full h-[40px] px-3 rounded-[8px] border-[0.8px] border-[#E5E7EB] font-cairo text-[13px] text-[#030712] focus:outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A] text-right"
            />
            <input
              type="text"
              value={editAddress}
              onChange={e => { setEditAddress(e.target.value); setEditError('') }}
              placeholder="العنوان (يظهر على الروشتة) — اتركه فارغاً للإبقاء على الحالي"
              className="w-full h-[40px] px-3 rounded-[8px] border-[0.8px] border-[#E5E7EB] font-cairo text-[13px] text-[#030712] focus:outline-none focus:border-[#16A34A] focus:ring-1 focus:ring-[#16A34A] text-right"
            />
            {editError && (
              <p className="font-cairo text-[11px] text-[#DC2626]">{editError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={saveEditClinic}
                disabled={editSaving}
                className="flex items-center gap-1.5 px-3 h-[36px] bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white font-cairo text-[12px] font-semibold rounded-[8px] transition-colors"
              >
                {editSaving
                  ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Check className="w-3.5 h-3.5" /> حفظ</>}
              </button>
              <button
                onClick={() => setEditingClinic(false)}
                disabled={editSaving}
                className="flex items-center gap-1.5 px-3 h-[36px] bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#4B5563] font-cairo text-[12px] font-medium rounded-[8px] transition-colors"
              >
                <X className="w-3.5 h-3.5" /> إلغاء
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center gap-4 text-sm text-gray-600">
          <span>الأطباء: {clinic.doctors.length}</span>
          <span>المساعدين: {clinic.staff.length}</span>
        </div>
      </div>

      {/* Quick Links — templates visible to all, staff management owner-only */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/doctor/clinic-settings/templates"
          className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 hover:border-[#22C55E] hover:bg-[#F0FDF4] transition-colors group"
        >
          <div className="w-9 h-9 rounded-xl bg-[#DCFCE7] flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-[#16A34A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="font-cairo font-bold text-[13px] text-[#030712]">قوالب الروشتة</p>
            <p className="font-cairo text-[11px] text-[#6B7280]">إدارة وتخصيص القوالب</p>
          </div>
        </Link>

        <Link
          href="/doctor/clinics"
          className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 hover:border-[#16A34A] hover:bg-[#F0FDF4] transition-colors group"
        >
          <div className="w-9 h-9 rounded-xl bg-[#DCFCE7] flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-[#16A34A]" />
          </div>
          <div>
            <p className="font-cairo font-bold text-[13px] text-[#030712]">إدارة العيادات</p>
            <p className="font-cairo text-[11px] text-[#6B7280]">انضم أو أنشئ عيادة جديدة</p>
          </div>
        </Link>
      </div>

      {/* Assistant Manager — owner only sees invite + manage, others see read-only list */}
      <AssistantManager isOwner={isOwner} />

      {/* Doctors List */}
      {clinic.doctors.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="font-bold text-sm text-gray-900 mb-3">الأطباء ({clinic.doctors.length})</h3>
          <div className="space-y-2">
            {clinic.doctors.map((doc: any) => (
              <div key={doc.userId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-blue-700" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    د. {doc.name || 'طبيب'}
                    {doc.userId === clinic.currentUserId && (
                      <span className="mr-2 text-[10px] px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full">أنت</span>
                    )}
                  </div>
                  {doc.specialty && (
                    <div className="text-xs text-gray-500">{toAr(doc.specialty)}</div>
                  )}
                </div>
                {(doc.role?.toUpperCase() === 'OWNER') && (
                  <span className="text-[10px] px-2 py-0.5 bg-[#DCFCE7] text-[#16A34A] rounded-full font-cairo font-semibold">مالك</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
