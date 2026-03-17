'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type VisibilityMode = 'DOCTOR_SCOPED_OWNER' | 'CLINIC_WIDE'

export default function ClinicVisibilitySettingsPage() {
  const router = useRouter()
  const [currentMode, setCurrentMode] = useState<VisibilityMode>('DOCTOR_SCOPED_OWNER')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      const res = await fetch('/api/clinic/settings')
      if (res.ok) {
        const data = await res.json()
        setCurrentMode(data.clinic?.default_visibility || 'DOCTOR_SCOPED_OWNER')
      }
    } catch {
      // Default mode
    } finally {
      setLoading(false)
    }
  }

  async function saveMode(mode: VisibilityMode) {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/clinic/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_visibility: mode }),
      })
      if (res.ok) {
        setCurrentMode(mode)
        setMessage('تم تحديث إعداد الخصوصية')
      }
    } catch {
      setMessage('فشل في التحديث')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-4 space-y-4" dir="rtl">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-base text-gray-900">خصوصية المرضى</h1>
          <button
            onClick={() => router.push('/doctor/clinic-settings')}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            رجوع ←
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          تحكم في من يمكنه رؤية المرضى الجدد في العيادة
        </p>
      </div>

      {message && (
        <div className={`p-3 rounded-xl text-sm text-center ${
          message.includes('فشل')
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-green-50 border border-green-200 text-green-700'
        }`}>
          {message}
        </div>
      )}

      {/* Doctor-Scoped (Private) */}
      <button
        onClick={() => saveMode('DOCTOR_SCOPED_OWNER')}
        disabled={saving}
        className={`w-full text-right p-4 rounded-2xl border-2 transition-all ${
          currentMode === 'DOCTOR_SCOPED_OWNER'
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-200 bg-white hover:border-gray-300'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="font-bold text-sm text-gray-900">خاص بالطبيب</h3>
            <p className="text-xs text-gray-600 mt-1">
              مرضى كل طبيب خاصين به افتراضياً. لا يستطيع الأطباء الآخرون في العيادة رؤيتهم إلا بموافقة صريحة من المريض.
            </p>
            <p className="text-[10px] text-gray-400 mt-2">مُوصى به لمعظم العيادات المصرية</p>
          </div>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
            currentMode === 'DOCTOR_SCOPED_OWNER' ? 'bg-primary-100' : 'bg-gray-100'
          }`}>
            {currentMode === 'DOCTOR_SCOPED_OWNER' ? (
              <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            )}
          </div>
        </div>
      </button>

      {/* Clinic-Wide */}
      <button
        onClick={() => saveMode('CLINIC_WIDE')}
        disabled={saving}
        className={`w-full text-right p-4 rounded-2xl border-2 transition-all ${
          currentMode === 'CLINIC_WIDE'
            ? 'border-green-500 bg-green-50'
            : 'border-gray-200 bg-white hover:border-gray-300'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="font-bold text-sm text-gray-900">مشترك بين العيادة</h3>
            <p className="text-xs text-gray-600 mt-1">
              جميع الأطباء في العيادة يمكنهم الوصول لجميع المرضى. لا يزال يتطلب موافقة المريض عند التسجيل. الأفضل للعيادات الصغيرة.
            </p>
            <p className="text-[10px] text-amber-600 mt-2">يتطلب إبلاغ المريض — يتم إعلامه عند التسجيل</p>
          </div>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
            currentMode === 'CLINIC_WIDE' ? 'bg-green-100' : 'bg-gray-100'
          }`}>
            {currentMode === 'CLINIC_WIDE' ? (
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            )}
          </div>
        </div>
      </button>
    </div>
  )
}
