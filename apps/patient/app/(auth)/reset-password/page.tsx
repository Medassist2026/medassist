'use client'

import { Suspense } from 'react'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ar } from '@shared/lib/i18n/ar'
import {
  isValidEgyptianLocalPhone,
  getEgyptianPhoneError,
  normalizeEgyptianDigits,
} from '@shared/lib/utils/phone-validation'

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const phoneParam = searchParams.get('phone') || ''
  const resetToken = searchParams.get('resetToken') || ''

  // If a resetToken is present in the URL, skip straight to step 2
  // The +20 chip is rendered separately, so the input value is local-only.
  const [phone, setPhone] = useState(normalizeEgyptianDigits(phoneParam.replace(/^\+?20/, '')))
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '')
    if (digits.startsWith('20')) return '+' + digits
    if (digits.startsWith('0')) return '+20' + digits.slice(1)
    return '+20' + digits
  }

  // Step 1: Send OTP for password reset
  const handleSendOTP = async () => {
    setError('')
    if (!phone) {
      setError('رقم الهاتف مطلوب')
      return
    }
    if (!isValidEgyptianLocalPhone(phone)) {
      setPhoneTouched(true)
      setError(getEgyptianPhoneError(phone) || 'رقم الهاتف غير صحيح')
      return
    }

    setLoading(true)
    try {
      const formattedPhone = formatPhone(phone)
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone, purpose: 'password_reset' }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'فشل في إرسال رمز التحقق')
        return
      }

      router.push(`/otp?phone=${encodeURIComponent(formattedPhone)}&purpose=password_reset`)
    } catch {
      setError('حدث خطأ. حاول مرة أخرى')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Set new password (requires server-issued resetToken)
  const handleResetPassword = async () => {
    setError('')
    if (!newPassword || !confirmPassword) {
      setError('جميع الحقول مطلوبة')
      return
    }
    if (newPassword.length < 6) {
      setError('كلمة المرور يجب أن تكون ٦ أحرف على الأقل')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('كلمات المرور غير متطابقة')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneParam, newPassword, resetToken }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'فشل في تغيير كلمة المرور')
        return
      }

      setSuccess(true)
      // Auto-redirect to login after 2 seconds
      setTimeout(() => router.push('/auth?role=doctor'), 2000)
    } catch {
      setError('حدث خطأ. حاول مرة أخرى')
    } finally {
      setLoading(false)
    }
  }

  // Success state
  if (success) {
    return (
      <div dir="rtl" className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">{ar.passwordResetSuccess}</h2>
          <p className="text-sm text-gray-500">جاري تحويلك لتسجيل الدخول...</p>
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="12" y1="10" x2="12" y2="18" />
            <line x1="8" y1="14" x2="16" y2="14" />
          </svg>
        </div>
        <span className="text-xl font-bold text-gray-900">MedAssist</span>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-2 text-center">{ar.resetPassword}</h1>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 text-center">
            {error}
          </div>
        )}

        {resetToken ? (
          // Step 2: Set new password (token received from OTP verification)
          <div className="mt-6 space-y-4">
            <p className="text-sm text-gray-500 text-center mb-4">أدخل كلمة المرور الجديدة</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{ar.newPassword}</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{ar.confirmNewPassword}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                dir="ltr"
              />
            </div>
            <button
              onClick={handleResetPassword}
              disabled={loading}
              className="w-full py-3 bg-primary-600 text-white rounded-xl font-bold text-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {loading ? ar.loading : ar.savePassword}
            </button>
          </div>
        ) : (
          // Step 1: Enter phone
          <div className="mt-6 space-y-4">
            <p className="text-sm text-gray-500 text-center mb-4">{ar.enterPhoneToReset}</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{ar.phoneNumber}</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 bg-gray-50 px-3 py-2.5 rounded-xl border border-gray-200">+20</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(normalizeEgyptianDigits(e.target.value))}
                  onBlur={() => setPhoneTouched(true)}
                  placeholder="01XXXXXXXXX"
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  dir="ltr"
                  inputMode="numeric"
                />
              </div>
              {phoneTouched && getEgyptianPhoneError(phone) && (
                <p className="mt-1.5 text-xs text-red-600">{getEgyptianPhoneError(phone)}</p>
              )}
            </div>
            <button
              onClick={handleSendOTP}
              disabled={loading}
              className="w-full py-3 bg-primary-600 text-white rounded-xl font-bold text-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {loading ? ar.loading : ar.sendResetCode}
            </button>
          </div>
        )}

        {/* Back to login */}
        <button
          onClick={() => router.push('/auth?role=doctor')}
          className="w-full mt-4 text-sm text-gray-500 hover:text-gray-700 text-center"
        >
          ← {ar.login}
        </button>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
