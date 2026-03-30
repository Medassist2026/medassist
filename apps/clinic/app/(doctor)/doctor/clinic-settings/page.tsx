'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ar } from '@shared/lib/i18n/ar'
import { AssistantManager } from '@ui-clinic/components/doctor/AssistantManager'

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

interface ClinicData {
  clinicId: string
  clinicName: string
  clinicUniqueId: string
  doctors: any[]
  staff: any[]
  currentUserId: string
  userRole: string // 'OWNER' | 'DOCTOR' | 'ASSISTANT' | 'FRONT_DESK'
}

export default function ClinicSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clinic, setClinic] = useState<ClinicData | null>(null)

  useEffect(() => {
    loadClinicData()
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
          <p className="text-sm text-gray-500">يرجى إنشاء عيادة أولاً من لوحة التحكم</p>
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

      {/* Clinic Info Header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-bold text-base text-gray-900 mb-1">{clinic.clinicName}</h2>
            <p className="text-xs text-gray-400 font-mono">ID: {clinic.clinicUniqueId}</p>
          </div>
          {isOwner && (
            <span className="flex-shrink-0 px-2 py-0.5 bg-[#DCFCE7] text-[#16A34A] font-cairo font-semibold text-[11px] rounded-full">
              مالك
            </span>
          )}
        </div>
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

        {isOwner ? (
          <Link
            href="/doctor/clinic-settings/staff"
            className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 hover:border-gray-300 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#3B82F6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="font-cairo font-bold text-[13px] text-[#030712]">إدارة الفريق</p>
              <p className="font-cairo text-[11px] text-[#6B7280]">دعوة وإدارة المساعدين</p>
            </div>
          </Link>
        ) : (
          <div className="bg-[#F9FAFB] rounded-2xl border border-dashed border-[#E5E7EB] p-4 flex items-center gap-3 opacity-50 cursor-not-allowed">
            <div className="w-9 h-9 rounded-xl bg-[#F3F4F6] flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#9CA3AF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <p className="font-cairo font-bold text-[13px] text-[#9CA3AF]">إدارة الفريق</p>
              <p className="font-cairo text-[11px] text-[#9CA3AF]">للمالك فقط</p>
            </div>
          </div>
        )}
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
                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {(doc.name || '?')[0]}
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
