'use client'

import { useState, useEffect } from 'react'
import { ar } from '@shared/lib/i18n/ar'
import { AssistantManager } from '@ui-clinic/components/doctor/AssistantManager'

interface ClinicData {
  clinicId: string
  clinicName: string
  clinicUniqueId: string
  doctors: any[]
  staff: any[]
  currentUserId: string
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

  return (
    <div className="max-w-md mx-auto px-4 py-4 space-y-4" dir="rtl">
      {/* Clinic Info Header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <h2 className="font-bold text-base text-gray-900 mb-1">{clinic.clinicName}</h2>
        <p className="text-xs text-gray-400 font-mono">ID: {clinic.clinicUniqueId}</p>

        {/* Doctors count */}
        <div className="mt-3 flex items-center gap-4 text-sm text-gray-600">
          <span>الأطباء: {clinic.doctors.length}</span>
          <span>المساعدين: {clinic.staff.length}</span>
        </div>
      </div>

      {/* Assistant Manager (invite codes + staff list) */}
      <AssistantManager />

      {/* Doctors List */}
      {clinic.doctors.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h3 className="font-bold text-sm text-gray-900 mb-3">الأطباء</h3>
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
                    <div className="text-xs text-gray-500">{doc.specialty.replace(/-/g, ' ')}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
